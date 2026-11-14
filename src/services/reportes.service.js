import { consultar } from '../libs/sequelize.js';
import { rangoFechasSql } from '../libs/fechas.js';
import * as v from '../libs/validar.js';

class reportesService {
    constructor() {}

    /**
     * Ventas en un rango de fechas. Las canceladas no suman a los importes;
     * se reportan aparte. Filtros: desde, hasta, usuario_id y categoria_id
     * (solo para "más vendidos").
     */
    async ventas(query) {
        const filtros = [];
        const params = [];
        rangoFechasSql(query, 'v.fecha', filtros, params);
        if (query.usuario_id) {
            params.push(v.id(query.usuario_id, 'usuario'));
            filtros.push(`v.usuario_id = $${params.length}`);
        }
        const base = filtros.length ? `AND ${filtros.join(' AND ')}` : '';

        const paramsTop = [...params];
        let categoria = '';
        if (query.categoria_id) {
            paramsTop.push(v.id(query.categoria_id, 'categoría'));
            categoria = `AND pr.categoria_id = $${paramsTop.length}`;
        }

        const [resumen] = await consultar(
            `SELECT count(*) FILTER (WHERE v.estado = 'completada')::int AS num_ventas,
                    coalesce(sum(v.subtotal)  FILTER (WHERE v.estado = 'completada'), 0) AS bruto,
                    coalesce(sum(v.descuento) FILTER (WHERE v.estado = 'completada'), 0) AS descuentos,
                    coalesce(sum(v.impuestos) FILTER (WHERE v.estado = 'completada'), 0) AS impuestos,
                    coalesce(sum(v.total)     FILTER (WHERE v.estado = 'completada'), 0) AS total,
                    count(*) FILTER (WHERE v.estado = 'cancelada')::int AS num_canceladas,
                    coalesce(sum(v.total)     FILTER (WHERE v.estado = 'cancelada'), 0) AS total_cancelado
               FROM ventas v WHERE TRUE ${base}`,
            params
        );
        const porMetodo = await consultar(
            `SELECT v.metodo_pago, count(*)::int AS num_ventas, sum(v.total) AS total
               FROM ventas v WHERE v.estado = 'completada' ${base}
              GROUP BY v.metodo_pago ORDER BY total DESC`,
            params
        );
        const porCajero = await consultar(
            `SELECT u.id AS usuario_id, u.nombre, count(*)::int AS num_ventas, sum(v.total) AS total,
                    coalesce(sum(v.total) FILTER (WHERE v.metodo_pago = 'efectivo'), 0) AS efectivo,
                    coalesce(sum(v.total) FILTER (WHERE v.metodo_pago = 'credito'), 0) AS credito
               FROM ventas v JOIN usuarios u ON u.id = v.usuario_id
              WHERE v.estado = 'completada' ${base}
              GROUP BY u.id, u.nombre ORDER BY total DESC`,
            params
        );
        // Valor validado contra una lista fija: es seguro ponerlo en el SQL.
        const orden = v.opcion(query.orden || 'importe', 'orden', ['importe', 'cantidad', 'utilidad']);
        const limite = query.limite === '100' ? 100 : 20;
        // Utilidad aproximada por producto: importe sin IVA menos costo.
        // (No reparte los descuentos de la venta entre los productos.)
        const masVendidos = await consultar(
            `SELECT pr.id, pr.codigo, pr.nombre, pr.unidad, c.nombre AS categoria,
                    sum(d.cantidad) AS cantidad, sum(d.importe) AS importe,
                    sum(round(d.cantidad * coalesce(d.costo_unitario, pr.costo), 2)) AS costo,
                    sum(CASE WHEN v.precios_incluyen_iva THEN round(d.importe / (1 + d.tasa_iva), 2) ELSE d.importe END)
                      - sum(round(d.cantidad * coalesce(d.costo_unitario, pr.costo), 2)) AS utilidad
               FROM detalle_ventas d
               JOIN ventas v ON v.id = d.venta_id
               JOIN productos pr ON pr.id = d.producto_id
               JOIN categorias c ON c.id = pr.categoria_id
              WHERE v.estado = 'completada' ${base} ${categoria}
              GROUP BY pr.id, pr.codigo, pr.nombre, pr.unidad, c.nombre
              ORDER BY ${orden} DESC, pr.nombre
              LIMIT ${limite}`,
            paramsTop
        );
        const utilidadPorDia = await this.utilidadPorDia(base, params);
        const centavos = (k) => utilidadPorDia.reduce((s, d) => s + Math.round(Number(d[k]) * 100), 0);
        resumen.venta_neta = (centavos('venta_neta') / 100).toFixed(2);
        resumen.costo = (centavos('costo') / 100).toFixed(2);
        resumen.utilidad = (centavos('utilidad') / 100).toFixed(2);
        return {
            resumen, por_metodo: porMetodo, por_cajero: porCajero, mas_vendidos: masVendidos,
            utilidad_por_dia: utilidadPorDia,
        };
    }

    /**
     * Utilidad estimada por día:
     *   venta neta = total cobrado sin IVA (ya con descuentos)
     *   costo      = cantidad x costo del producto al momento de vender
     *                (para ventas anteriores a este dato, el costo actual)
     *   utilidad   = venta neta - costo
     */
    async utilidadPorDia(base, params) {
        return consultar(
            `SELECT to_char(v.fecha::date, 'YYYY-MM-DD') AS dia,
                    count(*)::int AS num_ventas,
                    sum(v.total) AS total,
                    sum(v.total - v.impuestos) AS venta_neta,
                    sum(c.costo) AS costo,
                    sum(v.total - v.impuestos) - sum(c.costo) AS utilidad
               FROM ventas v
               JOIN LATERAL (
                 SELECT coalesce(sum(round(d.cantidad * coalesce(d.costo_unitario, p.costo), 2)), 0) AS costo
                   FROM detalle_ventas d JOIN productos p ON p.id = d.producto_id
                  WHERE d.venta_id = v.id
               ) c ON TRUE
              WHERE v.estado = 'completada' ${base}
              GROUP BY 1 ORDER BY 1`,
            params
        );
    }

    /** Valor del inventario y productos con existencia baja o agotados. */
    async inventario() {
        const [resumen] = await consultar(
            `SELECT count(*)::int AS num_productos,
                    count(*) FILTER (WHERE existencia <= 0)::int AS agotados,
                    count(*) FILTER (WHERE existencia > 0 AND existencia <= stock_minimo)::int AS bajos,
                    coalesce(sum(round(greatest(existencia, 0) * costo, 2)), 0) AS valor_costo,
                    coalesce(sum(round(greatest(existencia, 0) * precio_venta, 2)), 0) AS valor_venta
               FROM productos WHERE activo`
        );
        const alertas = await consultar(
            `SELECT p.id, p.codigo, p.nombre, c.nombre AS categoria, p.existencia, p.stock_minimo, p.unidad,
                    CASE WHEN p.existencia <= 0 THEN 'agotado' ELSE 'bajo' END AS nivel_stock
               FROM productos p JOIN categorias c ON c.id = p.categoria_id
              WHERE p.activo AND p.existencia <= p.stock_minimo
              ORDER BY p.existencia <= 0 DESC, p.nombre`
        );
        return { resumen, alertas };
    }
}

export default reportesService;
