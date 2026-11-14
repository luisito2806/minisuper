import { Op } from 'sequelize';
import { models, obtenerSequelize, consultar } from '../libs/sequelize.js';
import { ErrorApp, noEncontrado } from '../libs/errores.js';
import { aEnteroSigno, aTexto } from '../libs/dinero.js';
import { rangoFechas } from '../libs/fechas.js';
import * as v from '../libs/validar.js';
import { TIPOS_MOVIMIENTO } from '../models/movimientos-inventario.model.js';
import configuracionService from './configuracion.service.js';

const configuracion = new configuracionService();

class inventarioService {
    constructor() {}

    /**
     * Cambia la existencia de un producto y deja el movimiento en el
     * historial. Se usa dentro de una transacción (ventas, compras,
     * cancelaciones, ajustes).
     *   m.cantidad: entero en milésimas con signo (+ entrada, - salida)
     *   m.permitirNegativo: si es false, falla cuando quedaría negativa
     */
    async mover(transaction, m) {
        const p = await models.Productos.findByPk(m.productoId, { transaction, lock: transaction.LOCK.UPDATE });
        if (!p) throw noEncontrado(`El producto con id ${m.productoId}`);
        const anterior = aEnteroSigno(p.existencia, 3);
        const nueva = anterior + m.cantidad;
        if (!m.permitirNegativo && nueva < 0) {
            throw new ErrorApp(
                409,
                `Existencia insuficiente de "${p.nombre}": disponible ${aTexto(Math.max(anterior, 0), 3)}, se necesitan ${aTexto(-m.cantidad, 3)}.`
            );
        }
        await p.update({ existencia: aTexto(nueva, 3) }, { transaction });
        await models.MovimientosInventario.create({
            producto_id: p.id,
            usuario_id: m.usuarioId,
            tipo: m.tipo,
            cantidad: aTexto(m.cantidad, 3),
            existencia_anterior: aTexto(anterior, 3),
            existencia_nueva: aTexto(nueva, 3),
            venta_id: m.ventaId ?? null,
            compra_id: m.compraId ?? null,
            motivo: m.motivo ?? null,
        }, { transaction });
        return nueva;
    }

    /**
     * Ajuste manual con motivo obligatorio:
     *   "entrada" suma, "salida" resta, "conteo" fija la existencia contada.
     */
    async ajustar(data, usuario) {
        const productoId = v.id(data.producto_id, 'producto');
        const modo = v.opcion(data.modo, 'tipo de ajuste', ['entrada', 'salida', 'conteo']);
        const motivo = v.texto(data.motivo, 'motivo', { max: 255, requerido: true });
        const cantidad = v.decimal(data.cantidad, 'cantidad', { escala: 3, positivo: modo !== 'conteo', max: 1000000 });

        return obtenerSequelize().transaction(async (t) => {
            const config = await configuracion.find(t);
            const p = await models.Productos.findByPk(productoId, { transaction: t, lock: t.LOCK.UPDATE });
            if (!p) throw noEncontrado('El producto');
            if (p.unidad === 'pieza' && cantidad % 1000 !== 0) {
                throw new ErrorApp(400, `"${p.nombre}" se maneja por pieza: la cantidad debe ser entera.`);
            }
            let delta = modo === 'entrada' ? cantidad : modo === 'salida' ? -cantidad : cantidad - aEnteroSigno(p.existencia, 3);
            if (delta === 0) throw new ErrorApp(400, 'La existencia contada es igual a la registrada; no hay nada que ajustar.');

            const nueva = await this.mover(t, {
                productoId,
                usuarioId: usuario.id,
                tipo: delta > 0 ? 'ajuste_entrada' : 'ajuste_salida',
                cantidad: delta,
                motivo: modo === 'conteo' ? `Conteo físico: ${motivo}` : motivo,
                permitirNegativo: config.permitir_sobreventa,
            });
            return { producto_id: productoId, existencia: aTexto(nueva, 3), cantidad: aTexto(delta, 3) };
        });
    }

    /**
     * Conteo físico de muchos productos a la vez: se captura lo que se
     * contó y el sistema hace el ajuste (entrada o salida) de cada producto
     * que no coincide. Los que coinciden no generan movimiento.
     *   data.partidas: [{ producto_id, contado }]
     */
    async conteo(data, usuario) {
        const motivo = v.texto(data.motivo, 'motivo', { max: 200 }) ?? 'Conteo físico';
        const contados = new Map();
        for (const p of v.lista(data.partidas, 'partidas', { max: 5000 })) {
            const id = v.id(p?.producto_id, 'producto');
            contados.set(id, v.decimal(p?.contado, 'cantidad contada', { escala: 3, max: 1000000 }));
        }

        return obtenerSequelize().transaction(async (t) => {
            const productos = await models.Productos.findAll({
                where: { id: [...contados.keys()] }, order: [['id', 'ASC']], transaction: t, lock: t.LOCK.UPDATE
            });
            if (productos.length !== contados.size) throw noEncontrado('Alguno de los productos');
            const ajustes = [];
            for (const p of productos) {
                const contado = contados.get(String(p.id));
                if (p.unidad === 'pieza' && contado % 1000 !== 0) {
                    throw new ErrorApp(400, `"${p.nombre}" se maneja por pieza: la cantidad contada debe ser entera.`);
                }
                const delta = contado - aEnteroSigno(p.existencia, 3);
                if (delta === 0) continue;
                await this.mover(t, {
                    productoId: p.id,
                    usuarioId: usuario.id,
                    tipo: delta > 0 ? 'ajuste_entrada' : 'ajuste_salida',
                    cantidad: delta,
                    motivo: `Conteo físico: ${motivo.replace(/^Conteo físico:?\s*/i, '') || 'sin notas'}`,
                    permitirNegativo: true,
                });
                ajustes.push({ producto_id: p.id, nombre: p.nombre, unidad: p.unidad, diferencia: aTexto(delta, 3) });
            }
            return { revisados: productos.length, ajustados: ajustes.length, ajustes };
        });
    }

    /**
     * Lista de compra sugerida: productos activos en o por debajo de su
     * mínimo. Cantidad sugerida = lo necesario para llegar al doble del
     * mínimo, o a lo vendido en las últimas 2 semanas si es más.
     * Incluye el último proveedor al que se le compró.
     */
    async sugerida() {
        return consultar(
            `SELECT p.id, p.codigo, p.nombre, p.unidad, p.existencia, p.stock_minimo, p.costo,
                    c.nombre AS categoria, coalesce(vend.cantidad, 0) AS vendido_14_dias,
                    CASE WHEN p.unidad = 'pieza'
                         THEN ceil(greatest(2 * p.stock_minimo, coalesce(vend.cantidad, 0)) - p.existencia)
                         ELSE round(greatest(2 * p.stock_minimo, coalesce(vend.cantidad, 0)) - p.existencia, 3)
                    END AS sugerido,
                    ult.proveedor_id, ult.proveedor
               FROM productos p
               JOIN categorias c ON c.id = p.categoria_id
               LEFT JOIN LATERAL (
                 SELECT -sum(m.cantidad) AS cantidad FROM movimientos_inventario m
                  WHERE m.producto_id = p.id AND m.tipo IN ('venta', 'cancelacion_venta')
                    AND m.fecha >= now() - interval '14 days'
               ) vend ON TRUE
               LEFT JOIN LATERAL (
                 SELECT pr.id AS proveedor_id, pr.nombre AS proveedor
                   FROM detalle_compras d
                   JOIN compras co ON co.id = d.compra_id AND co.estado = 'confirmada'
                   JOIN proveedores pr ON pr.id = co.proveedor_id
                  WHERE d.producto_id = p.id
                  ORDER BY co.fecha DESC LIMIT 1
               ) ult ON TRUE
              WHERE p.activo AND p.existencia <= p.stock_minimo
              ORDER BY ult.proveedor NULLS LAST, p.existencia <= 0 DESC, p.nombre`
        );
    }

    /** Historial de movimientos con filtros. */
    async find(query) {
        const where = { [Op.and]: rangoFechas(query, 'MovimientosInventario.fecha') };
        if (query.producto_id) where.producto_id = v.id(query.producto_id, 'producto');
        if (query.tipo) where.tipo = v.opcion(query.tipo, 'tipo', TIPOS_MOVIMIENTO);
        if (query.usuario_id) where.usuario_id = v.id(query.usuario_id, 'usuario');
        const q = v.texto(query.q, 'búsqueda', { max: 120 });
        if (q) {
            const patron = `%${q.replace(/[\\%_]/g, (x) => `\\${x}`)}%`;
            where[Op.or] = [{ '$producto.nombre$': { [Op.iLike]: patron } }, { '$producto.codigo$': q }];
        }
        const res = await models.MovimientosInventario.findAll({
            where,
            include: [
                { model: models.Productos, as: 'producto', attributes: ['id', 'codigo', 'nombre', 'unidad'] },
                { model: models.Usuarios, as: 'usuario', attributes: ['nombre'] },
                { model: models.Ventas, as: 'venta', attributes: ['folio'] },
                { model: models.Compras, as: 'compra', attributes: ['folio'] },
            ],
            order: [['fecha', 'DESC'], ['id', 'DESC']],
            limit: 1000,
        });
        // Mismo formato plano que usa la pantalla de Inventario.
        return res.map((m) => ({
            id: m.id,
            fecha: m.fecha,
            tipo: m.tipo,
            cantidad: m.cantidad,
            existencia_anterior: m.existencia_anterior,
            existencia_nueva: m.existencia_nueva,
            motivo: m.motivo,
            producto_id: m.producto.id,
            codigo: m.producto.codigo,
            producto: m.producto.nombre,
            unidad: m.producto.unidad,
            usuario: m.usuario.nombre,
            folio_venta: m.venta?.folio ?? null,
            folio_compra: m.compra?.folio ?? null,
        }));
    }

}

export default inventarioService;
