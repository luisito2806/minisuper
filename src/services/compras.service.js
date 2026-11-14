import { Op } from 'sequelize';
import { models, obtenerSequelize } from '../libs/sequelize.js';
import { ErrorApp, noEncontrado } from '../libs/errores.js';
import { aEntero, aTexto, importe } from '../libs/dinero.js';
import { rangoFechas } from '../libs/fechas.js';
import * as v from '../libs/validar.js';
import configuracionService from './configuracion.service.js';
import inventarioService from './inventario.service.js';

const configuracion = new configuracionService();
const inventario = new inventarioService();

function aPlano(model) {
    const { proveedor, registro, canceladaPor, partidas, ...resto } = model.toJSON();
    return {
        ...resto,
        proveedor: proveedor?.nombre ?? null,
        registro: registro?.nombre ?? null,
        cancelada_por_nombre: canceladaPor?.nombre ?? null,
        ...(partidas && {
            partidas: partidas.map(({ producto, ...d }) => ({
                producto_id: d.producto_id,
                codigo: producto?.codigo,
                nombre: producto?.nombre,
                unidad: producto?.unidad,
                cantidad: d.cantidad,
                costo_unitario: d.costo_unitario,
                importe: d.importe,
            }))
        }),
    };
}

class comprasService {
    constructor() {}

    /**
     * Registra una compra en una sola transacción: compra + partidas +
     * entrada de inventario (y, si se indica, nuevo costo del producto).
     */
    async create(data, usuario) {
        const proveedorId = v.id(data.proveedor_id, 'proveedor');
        const notas = v.texto(data.notas, 'notas', { max: 255 });
        const actualizarCosto = v.booleano(data.actualizar_costo, 'actualizar costo', true);
        const partidas = [];
        const vistos = new Set();
        for (const p of v.lista(data.partidas, 'partidas', { max: 300 })) {
            const productoId = v.id(p?.producto_id, 'producto');
            if (vistos.has(productoId)) {
                throw new ErrorApp(400, 'Un producto aparece dos veces en la compra; junta las cantidades en una sola partida.');
            }
            vistos.add(productoId);
            partidas.push({
                productoId,
                cantidad: v.decimal(p.cantidad, 'cantidad', { escala: 3, positivo: true, max: 100000 }),
                costo: v.decimal(p.costo_unitario, 'costo unitario', { escala: 2, max: 1000000 }),
            });
        }

        return obtenerSequelize().transaction(async (t) => {
            const proveedor = await models.Proveedores.findByPk(proveedorId, { transaction: t });
            if (!proveedor) throw noEncontrado('El proveedor');
            if (!proveedor.activo) throw new ErrorApp(400, 'El proveedor está inactivo.');

            const productos = await models.Productos.findAll({
                where: { id: partidas.map((p) => p.productoId) },
                order: [['id', 'ASC']],
                transaction: t,
                lock: t.LOCK.UPDATE
            });
            const porId = new Map(productos.map((p) => [String(p.id), p]));

            let total = 0;
            for (const l of partidas) {
                const p = porId.get(l.productoId);
                if (!p) throw noEncontrado(`El producto con id ${l.productoId}`);
                if (!p.activo) throw new ErrorApp(400, `El producto "${p.nombre}" está inactivo; actívalo antes de comprarlo.`);
                if (p.unidad === 'pieza' && l.cantidad % 1000 !== 0) {
                    throw new ErrorApp(400, `"${p.nombre}" se maneja por pieza: la cantidad debe ser entera.`);
                }
                l.imp = importe(l.cantidad, l.costo);
                total += l.imp;
            }

            const compra = await models.Compras.create({
                proveedor_id: proveedorId, usuario_id: usuario.id, total: aTexto(total, 2), notas
            }, { transaction: t });

            await models.DetalleCompras.bulkCreate(partidas.map((l) => ({
                compra_id: compra.id,
                producto_id: l.productoId,
                cantidad: aTexto(l.cantidad, 3),
                costo_unitario: aTexto(l.costo, 2),
                importe: aTexto(l.imp, 2),
            })), { transaction: t });

            for (const l of partidas) {
                await inventario.mover(t, {
                    productoId: l.productoId,
                    usuarioId: usuario.id,
                    tipo: 'compra',
                    cantidad: l.cantidad,
                    compraId: compra.id,
                    permitirNegativo: true,
                });
                if (actualizarCosto) {
                    await models.Productos.update({ costo: aTexto(l.costo, 2) }, { where: { id: l.productoId }, transaction: t });
                }
            }
            // Los productos que aún no tienen proveedor habitual quedan con éste.
            await models.Productos.update(
                { proveedor_id: proveedorId },
                { where: { id: partidas.map((p) => p.productoId), proveedor_id: null }, transaction: t }
            );
            return { id: compra.id, folio: compra.folio, fecha: compra.fecha, total: compra.total };

        });
    }

    async find(query) {
        const where = { [Op.and]: rangoFechas(query, 'Compras.fecha') };
        if (query.proveedor_id) where.proveedor_id = v.id(query.proveedor_id, 'proveedor');
        const res = await models.Compras.findAll({
            where,
            include: [
                { model: models.Proveedores, as: 'proveedor', attributes: ['nombre'] },
                { model: models.Usuarios, as: 'registro', attributes: ['nombre'] },
            ],
            order: [['fecha', 'DESC']],
            limit: 500
        });
        return res.map(aPlano);
    }

    async findOne(id) {
        const res = await models.Compras.findByPk(v.id(id), {
            include: [
                { model: models.Proveedores, as: 'proveedor', attributes: ['nombre'] },
                { model: models.Usuarios, as: 'registro', attributes: ['nombre'] },
                { model: models.Usuarios, as: 'canceladaPor', attributes: ['nombre'] },
                {
                    model: models.DetalleCompras,
                    as: 'partidas',
                    include: [{ model: models.Productos, as: 'producto', attributes: ['codigo', 'nombre', 'unidad'] }]
                },
            ],
            order: [[{ model: models.DetalleCompras, as: 'partidas' }, 'id', 'ASC']]
        });
        if (!res) throw noEncontrado('La compra');
        return aPlano(res);
    }

    /**
     * Cancela una compra: retira del inventario lo que entró. Si parte ya
     * se vendió (y no se permite sobreventa), se rechaza completa. El costo
     * del producto no se revierte.
     */
    async cancelar(id, data, usuario) {
        const compraId = v.id(id);
        const motivo = v.texto(data.motivo, 'motivo', { max: 255, requerido: true });

        return obtenerSequelize().transaction(async (t) => {
            const config = await configuracion.find(t);
            const compra = await models.Compras.findByPk(compraId, { transaction: t, lock: t.LOCK.UPDATE });
            if (!compra) throw noEncontrado('La compra');
            if (compra.estado !== 'confirmada') throw new ErrorApp(409, 'La compra ya estaba cancelada.');

            const partidas = await models.DetalleCompras.findAll({
                where: { compra_id: compraId }, order: [['producto_id', 'ASC']], transaction: t
            });
            for (const p of partidas) {
                await inventario.mover(t, {
                    productoId: p.producto_id,
                    usuarioId: usuario.id,
                    tipo: 'cancelacion_compra',
                    cantidad: -aEntero(p.cantidad, 3),
                    compraId,
                    motivo,
                    permitirNegativo: config.permitir_sobreventa,
                });
            }
            await compra.update({
                estado: 'cancelada', cancelada_por: usuario.id, cancelada_en: new Date(), motivo_cancelacion: motivo
            }, { transaction: t });
            return { id: compra.id, folio: compra.folio, estado: compra.estado, cancelada_en: compra.cancelada_en };
        });
    }
}

export default comprasService;
