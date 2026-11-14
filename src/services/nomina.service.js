import { Op } from 'sequelize';
import { models, consultar } from '../libs/sequelize.js';
import { ErrorApp, noEncontrado } from '../libs/errores.js';
import { aEntero, aTexto } from '../libs/dinero.js';
import { rangoFechas, semanaNomina } from '../libs/fechas.js';
import * as v from '../libs/validar.js';

/** Ventas a crédito de la semana que cuentan para la nómina (las canceladas no). */
const deLaSemana = (inicio, fin, columna) => ({
    metodo_pago: 'credito',
    estado: 'completada',
    [Op.and]: rangoFechas({ desde: inicio, hasta: fin }, columna),
});

class nominaService {
    constructor() {}

    /**
     * Descuentos de nómina de una semana (sábado a viernes): cuánto
     * consumió a crédito cada trabajador y cuánto falta por descontar.
     * Es un reporte de totales: se hace con una consulta SQL (sequelize.query).
     */
    async semana(query) {
        const { inicio, fin } = semanaNomina(query.semana);
        const enSemana = "v.metodo_pago = 'credito' AND v.estado = 'completada' AND v.fecha >= $1::date AND v.fecha < $1::date + 7";
        const trabajadores = await consultar(
            `SELECT t.id, t.numero, t.nombre, t.area, t.activo,
                    count(v.id)::int AS num_ventas,
                    sum(v.total) AS total,
                    coalesce(sum(v.total) FILTER (WHERE v.descontado_en IS NULL), 0) AS pendiente,
                    max(v.descontado_en) AS descontado_en
               FROM ventas v JOIN trabajadores t ON t.id = v.trabajador_id
              WHERE ${enSemana}
              GROUP BY t.id
              ORDER BY t.nombre`,
            [inicio]
        );
        const [totales] = await consultar(
            `SELECT count(*)::int AS num_ventas,
                    coalesce(sum(v.total), 0) AS total,
                    coalesce(sum(v.total) FILTER (WHERE v.descontado_en IS NULL), 0) AS pendiente
               FROM ventas v WHERE ${enSemana}`,
            [inicio]
        );
        return { inicio, fin, ...totales, trabajadores };
    }

    /** Estado de cuenta de un trabajador en la semana: cada venta con sus productos. */
    async detalle(trabajadorId, query) {
        const { inicio, fin } = semanaNomina(query.semana);
        const trabajador = await models.Trabajadores.findByPk(v.id(trabajadorId, 'trabajador'), {
            attributes: ['id', 'numero', 'nombre', 'area'],
        });
        if (!trabajador) throw noEncontrado('El trabajador');

        const ventas = await models.Ventas.findAll({
            where: { ...deLaSemana(inicio, fin, 'Ventas.fecha'), trabajador_id: trabajador.id },
            attributes: ['id', 'folio', 'fecha', 'total', 'descontado_en'],
            include: [{
                model: models.DetalleVentas,
                as: 'partidas',
                attributes: ['cantidad'],
                include: [{ model: models.Productos, as: 'producto', attributes: ['nombre'] }],
            }],
            order: [['fecha', 'ASC'], [{ model: models.DetalleVentas, as: 'partidas' }, 'id', 'ASC']],
        });
        return {
            inicio,
            fin,
            trabajador,
            ventas: ventas.map((x) => {
                const { partidas, ...venta } = x.toJSON();
                return {
                    ...venta,
                    productos: partidas.map((p) => `${p.producto.nombre} x${Number(p.cantidad)}`).join(', '),
                };
            }),
        };
    }

    /**
     * Marca como descontadas en nómina las ventas a crédito pendientes de
     * la semana (de todos o de un trabajador). Las ventas que se hagan
     * después en esa misma semana quedan pendientes.
     */
    async descontar(data, usuario) {
        const { inicio, fin } = semanaNomina(data.semana);
        const where = { ...deLaSemana(inicio, fin, 'fecha'), descontado_en: null };
        // Uno (trabajador_id), varios seleccionados (trabajador_ids) o todos.
        if (data.trabajador_id) where.trabajador_id = v.id(data.trabajador_id, 'trabajador');
        if (data.trabajador_ids !== undefined) {
            where.trabajador_id = v.lista(data.trabajador_ids, 'trabajadores', { max: 2000 }).map((x) => v.id(x, 'trabajador'));
        }


        const [, ventas] = await models.Ventas.update(
            { descontado_en: new Date(), descontado_por: usuario.id },
            { where, returning: true }
        );
        if (!ventas.length) throw new ErrorApp(409, 'No hay ventas a crédito pendientes de descontar en esa semana.');
        const total = ventas.reduce((s, x) => s + aEntero(x.total, 2), 0);
        return { inicio, fin, num_ventas: ventas.length, total: aTexto(total, 2) };
    }
}

export default nominaService;
