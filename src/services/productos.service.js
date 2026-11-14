import { Op } from 'sequelize';
import { models, obtenerSequelize } from '../libs/sequelize.js';
import { ErrorApp, noEncontrado } from '../libs/errores.js';
import { aEnteroSigno, aTexto } from '../libs/dinero.js';
import * as v from '../libs/validar.js';
import { UNIDADES } from '../models/productos.model.js';
import configuracionService from './configuracion.service.js';
import inventarioService from './inventario.service.js';

const configuracion = new configuracionService();
const inventario = new inventarioService();

const esAdmin = (usuario) => usuario?.rol === 'administrador';

/** Nivel de existencia para alertas: agotado, bajo o normal. */
function nivelStock(p) {
    const ex = aEnteroSigno(p.existencia, 3);
    if (ex <= 0) return 'agotado';
    return ex <= aEnteroSigno(p.stock_minimo, 3) ? 'bajo' : 'normal';
}

/** Objeto plano con el nombre de la categoría y el nivel de existencia. */
function aPlano(model) {
    const o = model.toJSON();
    return {
        ...o,
        categoria: o.categoria?.nombre ?? null,
        proveedor: o.proveedor?.nombre ?? null,
        nivel_stock: nivelStock(o),
    };
}

class productosService {
    constructor() {}

    /** Valida los campos editables. La existencia no se edita aquí. */
    leer(data, config) {
        const unidad = v.opcion(data.unidad ?? 'pieza', 'unidad', UNIDADES);
        const tasa = v.decimal(data.tasa_iva ?? config.tasa_iva_predeterminada, 'tasa de IVA', { escala: 4, max: 0.9999 });
        const stockMinimo = v.decimal(
            data.stock_minimo === undefined || data.stock_minimo === '' ? config.stock_minimo_predeterminado : data.stock_minimo,
            'stock mínimo',
            { escala: 3, max: 1000000 }
        );
        if (unidad === 'pieza' && stockMinimo % 1000 !== 0) {
            throw new ErrorApp(400, 'Para productos por pieza, el stock mínimo debe ser un número entero.');
        }
        return {
            codigo: v.texto(data.codigo, 'código', { max: 50, requerido: true }),
            nombre: v.texto(data.nombre, 'nombre', { max: 120, requerido: true }),
            descripcion: v.texto(data.descripcion, 'descripción', { max: 255 }),
            categoria_id: v.id(data.categoria_id, 'categoría'),
            precio_venta: aTexto(v.decimal(data.precio_venta, 'precio de venta', { escala: 2, max: 1000000 }), 2),
            costo: aTexto(v.decimal(data.costo, 'costo', { escala: 2, max: 1000000 }), 2),
            tasa_iva: aTexto(tasa, 4),
            stock_minimo: aTexto(stockMinimo, 3),
            unidad,
            activo: v.booleano(data.activo, 'activo', true),
            // Solo si viene en la petición (al importar de Excel no se toca).
            ...('proveedor_id' in data && {
                proveedor_id: data.proveedor_id ? v.id(data.proveedor_id, 'proveedor') : null,
            }),
        };
    }

    async validarProveedor(proveedorId) {
        if (!proveedorId) return;
        if (!(await models.Proveedores.findByPk(proveedorId))) throw noEncontrado('El proveedor');
    }

    async validarCategoria(categoriaId) {
        const c = await models.Categorias.findByPk(categoriaId);
        if (!c) throw noEncontrado('La categoría');
        if (!c.activo) throw new ErrorApp(400, 'La categoría está inactiva.');
    }

    /** Alta. La existencia inicial queda como movimiento "inicial". */
    async create(data, usuario) {
        const campos = this.leer(data, await configuracion.find());
        const existencia = v.decimal(data.existencia ?? '0', 'existencia inicial', { escala: 3, max: 1000000 });
        if (campos.unidad === 'pieza' && existencia % 1000 !== 0) {
            throw new ErrorApp(400, 'Para productos por pieza, la existencia debe ser un número entero.');
        }
        await this.validarCategoria(campos.categoria_id);
        await this.validarProveedor(campos.proveedor_id);
        const res = await obtenerSequelize().transaction(async (t) => {
            const p = await models.Productos.create(campos, { transaction: t });
            if (existencia > 0) {
                await inventario.mover(t, {
                    productoId: p.id,
                    usuarioId: usuario.id,
                    tipo: 'inicial',
                    cantidad: existencia,
                    motivo: 'Existencia inicial al dar de alta el producto',
                });
            }
            return p;
        });
        return { id: res.id };
    }

    /**
     * Búsqueda con filtros: q (nombre o código), categoria_id, nivel
     * (bajo/agotado), incluir_inactivos (solo administrador).
     * El costo de compra solo lo ve el administrador.
     */
    async find(query, usuario) {
        const db = obtenerSequelize();
        const admin = esAdmin(usuario);
        const where = { [Op.and]: [] };
        const q = v.texto(query.q, 'búsqueda', { max: 120 });
        if (q) {
            const patron = `%${q.replace(/[\\%_]/g, (x) => `\\${x}`)}%`;
            where[Op.and].push({ [Op.or]: [{ nombre: { [Op.iLike]: patron } }, { codigo: q }] });
        }
        if (query.categoria_id) where[Op.and].push({ categoria_id: v.id(query.categoria_id, 'categoría') });
        // proveedor_id=sin → productos que se compran a mano (sin proveedor).
        if (query.proveedor_id === 'sin') where[Op.and].push({ proveedor_id: null });
        else if (query.proveedor_id) where[Op.and].push({ proveedor_id: v.id(query.proveedor_id, 'proveedor') });
        if (query.nivel === 'bajo') where[Op.and].push(db.where(db.col('Productos.existencia'), Op.lte, db.col('Productos.stock_minimo')));
        if (query.nivel === 'agotado') where[Op.and].push({ existencia: { [Op.lte]: 0 } });
        if (!(admin && query.incluir_inactivos === '1')) where[Op.and].push({ activo: true });

        const res = await models.Productos.findAll({
            where,
            attributes: { exclude: admin ? [] : ['costo'] },
            include: [
                { model: models.Categorias, as: 'categoria', attributes: ['nombre'] },
                { model: models.Proveedores, as: 'proveedor', attributes: ['nombre'] },
            ],
            order: [['nombre', 'ASC']],
            limit: 500
        });
        return res.map(aPlano);
    }

    async findOne(id, usuario) {
        const res = await models.Productos.findByPk(v.id(id), {
            attributes: { exclude: esAdmin(usuario) ? [] : ['costo'] },
            include: [
                { model: models.Categorias, as: 'categoria', attributes: ['nombre'] },
                { model: models.Proveedores, as: 'proveedor', attributes: ['nombre'] },
            ]
        });
        if (!res) throw noEncontrado('El producto');
        return aPlano(res);
    }

    /** Para el lector de código de barras: solo productos activos. */
    async findByCodigo(codigo, usuario) {
        const res = await models.Productos.findOne({
            where: { codigo: String(codigo).trim(), activo: true },
            attributes: { exclude: esAdmin(usuario) ? [] : ['costo'] },
            include: [
                { model: models.Categorias, as: 'categoria', attributes: ['nombre'] },
                { model: models.Proveedores, as: 'proveedor', attributes: ['nombre'] },
            ]
        });
        if (!res) throw noEncontrado('El producto con ese código');
        return aPlano(res);
    }

    async update(id, data) {
        const model = await models.Productos.findByPk(v.id(id));
        if (!model) throw noEncontrado('El producto');
        const campos = this.leer(data, await configuracion.find());
        await this.validarCategoria(campos.categoria_id);
        await this.validarProveedor(campos.proveedor_id);
        await model.update(campos);
        return { id: model.id };
    }

    /**
     * Alta y actualización masiva (importar desde Excel). Cada fila:
     *   { fila, codigo, nombre, categoria (nombre), precio_venta, costo,
     *     tasa_iva, stock_minimo, unidad, existencia }
     * Si el código ya existe, se actualizan sus datos (la existencia NO:
     * para eso está el conteo físico). Si no existe, se da de alta con su
     * existencia inicial. Las categorías que no existan se crean.
     * Primero se validan todas las filas: si alguna falla no se aplica nada.
     */
    async importar(filas, usuario) {
        const config = await configuracion.find();
        const errores = [];
        const leidas = [];
        const codigos = new Set();
        for (const f of filas) {
            try {
                const categoria = v.texto(f.categoria, 'categoría', { max: 80, requerido: true });
                const campos = this.leer({ ...f, categoria_id: '1' }, config);
                if (codigos.has(campos.codigo)) throw new ErrorApp(400, `El código ${campos.codigo} está repetido en el archivo.`);
                codigos.add(campos.codigo);
                const existencia = v.decimal(f.existencia || '0', 'existencia', { escala: 3, max: 1000000 });
                if (campos.unidad === 'pieza' && existencia % 1000 !== 0) {
                    throw new ErrorApp(400, 'Para productos por pieza, la existencia debe ser un número entero.');
                }
                leidas.push({ fila: f.fila, campos, categoria, existencia });
            } catch (error) {
                errores.push(`Fila ${f.fila}: ${error.message}`);
            }
        }
        if (errores.length) {
            throw new ErrorApp(400, `No se importó nada. Corrige el archivo:\n${errores.slice(0, 15).join('\n')}${errores.length > 15 ? `\n… y ${errores.length - 15} errores más.` : ''}`);
        }
        if (!leidas.length) throw new ErrorApp(400, 'El archivo no tiene productos.');

        return obtenerSequelize().transaction(async (t) => {
            const categorias = new Map(
                (await models.Categorias.findAll({ transaction: t })).map((c) => [c.nombre.toLowerCase(), c])
            );
            let nuevos = 0;
            let actualizados = 0;
            let categoriasNuevas = 0;
            for (const l of leidas) {
                let cat = categorias.get(l.categoria.toLowerCase());
                if (!cat) {
                    cat = await models.Categorias.create({ nombre: l.categoria }, { transaction: t });
                    categorias.set(l.categoria.toLowerCase(), cat);
                    categoriasNuevas += 1;
                }
                const campos = { ...l.campos, categoria_id: cat.id };
                const actual = await models.Productos.findOne({ where: { codigo: campos.codigo }, transaction: t, lock: t.LOCK.UPDATE });
                if (actual) {
                    await actual.update(campos, { transaction: t });
                    actualizados += 1;
                    continue;
                }
                const p = await models.Productos.create(campos, { transaction: t });
                if (l.existencia > 0) {
                    await inventario.mover(t, {
                        productoId: p.id,
                        usuarioId: usuario.id,
                        tipo: 'inicial',
                        cantidad: l.existencia,
                        motivo: 'Existencia inicial (importado de Excel)',
                    });
                }
                nuevos += 1;
            }
            return { nuevos, actualizados, categorias_nuevas: categoriasNuevas };
        });
    }

    /** Se desactiva en lugar de borrarse, para conservar su historial. */
    /**
     * Cambia precio de venta y/o costo de muchos productos a la vez (por
     * ejemplo, todos los de un proveedor cuando suben de precio).
     *   data.productos: [{ id, precio_venta?, costo? }]
     */
    async actualizarPrecios(data) {
        const cambios = v.lista(data.productos, 'productos', { max: 3000 }).map((p) => ({
            id: v.id(p?.id, 'producto'),
            ...(p?.precio_venta !== undefined && {
                precio_venta: aTexto(v.decimal(p.precio_venta, 'precio de venta', { escala: 2, max: 1000000 }), 2),
            }),
            ...(p?.costo !== undefined && {
                costo: aTexto(v.decimal(p.costo, 'costo', { escala: 2, max: 1000000 }), 2),
            }),
        }));
        return obtenerSequelize().transaction(async (transaction) => {
            let actualizados = 0;
            for (const { id, ...campos } of cambios) {
                if (!Object.keys(campos).length) continue;
                const [n] = await models.Productos.update(campos, { where: { id }, transaction });
                if (!n) throw noEncontrado(`El producto con id ${id}`);
                actualizados += n;
            }
            return { actualizados };
        });
    }

    async delete(id) {
        const model = await models.Productos.findByPk(v.id(id));
        if (!model) throw noEncontrado('El producto');
        await model.update({ activo: false });
        return { id: model.id, activo: false };
    }
}

export default productosService;
