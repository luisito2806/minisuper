/**
 * Panel de la nube (solo lectura). Las listas usan findAll de Sequelize;
 * los reportes de totales (resumen y nómina) usan una consulta SQL con
 * sequelize.query, como en la tienda. Las fechas son en hora de México.
 */
import { Op, fn, col, where as donde } from 'sequelize';
import { models, consultar } from '../libs/sequelize.js';
import { ErrorNube } from '../libs/errores.js';

const DIA = "(v.fecha AT TIME ZONE 'America/Mexico_City')::date";

export const hoyMexico = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' });

function sumarDias(f, dias) {
    const d = new Date(`${f}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + dias);
    return d.toISOString().slice(0, 10);
}

function fecha(valor, campo) {
    if (valor === undefined || valor === '') return null;
    if (typeof valor !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(valor) || Number.isNaN(Date.parse(valor))) {
        throw new ErrorNube(400, `El campo "${campo}" debe tener formato AAAA-MM-DD.`);
    }
    return valor;
}

/** Periodo (desde/hasta), por defecto hoy. */
function periodo(q) {
    const desde = fecha(q.desde, 'desde') ?? hoyMexico();
    const hasta = fecha(q.hasta, 'hasta') ?? desde;
    if (desde > hasta) throw new ErrorNube(400, 'La fecha "desde" no puede ser posterior a "hasta".');
    return { desde, hasta };
}

/** Condición de Sequelize para "entre esos días" en hora de México (UTC-6, sin horario de verano). */
const entreDias = (desde, hasta) => ({
    [Op.gte]: new Date(`${desde}T00:00:00-06:00`),
    [Op.lt]: new Date(`${sumarDias(hasta, 1)}T00:00:00-06:00`),
});

class tiendasService {
    constructor() {}

    /** Tiendas que puede ver el usuario, con lo vendido hoy. */
    async find(usuario) {
        const tiendas = await models.Tiendas.findAll({
            attributes: ['id', 'nombre', 'direccion', 'ultima_sync'],
            include: usuario.todas ? [] : [{
                model: models.Usuarios, as: 'usuarios', attributes: [], where: { id: usuario.id }, through: { attributes: [] },
            }],
            order: [['nombre', 'ASC']],
        });
        const hoy = hoyMexico();
        const ventasHoy = await models.Ventas.findAll({
            attributes: ['tienda_id', [fn('count', col('id_local')), 'ventas_hoy'], [fn('sum', col('total')), 'total_hoy']],
            where: { estado: 'completada', fecha: entreDias(hoy, hoy), tienda_id: tiendas.map((t) => t.id) },
            group: ['tienda_id'],
            raw: true,
        });
        const porTienda = new Map(ventasHoy.map((x) => [x.tienda_id, x]));
        return tiendas.map((t) => ({
            ...t.toJSON(),
            ventas_hoy: Number(porTienda.get(t.id)?.ventas_hoy ?? 0),
            total_hoy: porTienda.get(t.id)?.total_hoy ?? '0',
        }));
    }

    /** La tienda, si el usuario la puede ver. */
    async findOne(id, usuario) {
        const n = Number(id);
        if (!Number.isInteger(n) || n <= 0) throw new ErrorNube(400, 'Tienda inválida.');
        const tienda = await models.Tiendas.findByPk(n, {
            include: usuario.todas ? [] : [{
                model: models.Usuarios, as: 'usuarios', attributes: [], where: { id: usuario.id }, through: { attributes: [] },
            }],
        });
        if (!tienda) throw new ErrorNube(404, 'La tienda no existe.');
        return tienda;
    }

    /** Reporte de totales del periodo (consulta SQL). */
    async resumen(tiendaId, q) {
        const { desde, hasta } = periodo(q);
        const p = [tiendaId, desde, hasta];
        const rango = `v.tienda_id = $1 AND ${DIA} BETWEEN $2::date AND $3::date`;
        const [totales] = await consultar(
            `SELECT count(*) FILTER (WHERE v.estado = 'completada')::int AS num_ventas,
                    coalesce(sum(v.total) FILTER (WHERE v.estado = 'completada'), 0) AS total,
                    coalesce(sum(v.total) FILTER (WHERE v.estado = 'completada' AND v.metodo_pago = 'efectivo'), 0) AS efectivo,
                    coalesce(sum(v.total) FILTER (WHERE v.estado = 'completada' AND v.metodo_pago = 'credito'), 0) AS credito,
                    coalesce(sum(v.total - v.impuestos) FILTER (WHERE v.estado = 'completada'), 0) AS venta_neta,
                    coalesce(sum(v.costo) FILTER (WHERE v.estado = 'completada'), 0) AS costo,
                    coalesce(sum(v.total - v.impuestos - v.costo) FILTER (WHERE v.estado = 'completada'), 0) AS utilidad,
                    count(*) FILTER (WHERE v.estado = 'cancelada')::int AS num_canceladas,
                    coalesce(sum(v.total) FILTER (WHERE v.estado = 'cancelada'), 0) AS total_cancelado
               FROM ventas v WHERE ${rango}`,
            p
        );
        const porDia = await consultar(
            `SELECT to_char(${DIA}, 'YYYY-MM-DD') AS dia, count(*)::int AS num_ventas, sum(v.total) AS total,
                    sum(v.total) FILTER (WHERE v.metodo_pago = 'credito') AS credito,
                    sum(v.total - v.impuestos - v.costo) AS utilidad
               FROM ventas v WHERE ${rango} AND v.estado = 'completada'
              GROUP BY 1 ORDER BY 1`,
            p
        );
        const masVendidos = await consultar(
            `SELECT x->>'codigo' AS codigo, x->>'nombre' AS nombre, x->>'unidad' AS unidad,
                    sum((x->>'cantidad')::numeric) AS cantidad, sum((x->>'importe')::numeric) AS importe
               FROM ventas v CROSS JOIN LATERAL jsonb_array_elements(v.partidas) x
              WHERE ${rango} AND v.estado = 'completada'
              GROUP BY 1, 2, 3 ORDER BY importe DESC LIMIT 15`,
            p
        );
        const activos = { tienda_id: tiendaId, activo: true };
        const inventario = {
            agotados: await models.Productos.count({ where: { ...activos, existencia: { [Op.lte]: 0 } } }),
            bajos: await models.Productos.count({
                where: { ...activos, existencia: { [Op.gt]: 0 }, [Op.and]: [donde(col('existencia'), Op.lte, col('stock_minimo'))] },
            }),
        };
        const cajasAbiertas = await models.Cajas.findAll({
            where: { tienda_id: tiendaId, estado: 'abierta' },
            attributes: ['usuario', 'abierta_en', 'fondo_inicial', 'ventas_efectivo', 'ingresos', 'retiros'],
            order: [['abierta_en', 'ASC']],
        });
        return { desde, hasta, ...totales, por_dia: porDia, mas_vendidos: masVendidos, inventario, cajas_abiertas: cajasAbiertas };
    }

    async ventas(tiendaId, q) {
        const { desde, hasta } = periodo(q);
        const where = { tienda_id: tiendaId, fecha: entreDias(desde, hasta) };
        if (q.estado === 'completada' || q.estado === 'cancelada') where.estado = q.estado;
        const res = await models.Ventas.findAll({
            where,
            attributes: ['id_local', 'folio', 'fecha', 'cajero', 'metodo_pago', 'trabajador_numero', 'trabajador_nombre',
                'total', 'estado', 'descontado_en'],
            order: [['fecha', 'DESC']],
            limit: 1000,
        });
        return res.map(({ dataValues: { id_local, ...v } }) => ({ id: id_local, ...v }));
    }

    async venta(tiendaId, idLocal) {
        if (!/^\d{1,10}$/.test(String(idLocal))) throw new ErrorNube(400, 'Venta inválida.');
        const v = await models.Ventas.findOne({ where: { tienda_id: tiendaId, id_local: Number(idLocal) } });
        if (!v) throw new ErrorNube(404, 'La venta no existe.');
        return { id: v.id_local, ...v.toJSON() };
    }

    async inventario(tiendaId, q) {
        const condiciones = [];
        if (q.nivel === 'bajo') condiciones.push(donde(col('existencia'), Op.lte, col('stock_minimo')));
        const where = { tienda_id: tiendaId, activo: true, [Op.and]: condiciones };
        if (typeof q.q === 'string' && q.q.trim()) {
            const texto = q.q.trim();
            where[Op.or] = [{ nombre: { [Op.iLike]: `%${texto.replace(/[\\%_]/g, (x) => `\\${x}`)}%` } }, { codigo: texto }];
        }
        const productos = await models.Productos.findAll({
            where,
            attributes: ['codigo', 'nombre', 'categoria', 'unidad', 'precio_venta', 'costo', 'existencia', 'stock_minimo'],
            order: [['nombre', 'ASC']],
            limit: 2000,
        });
        const nivel = (p) => (Number(p.existencia) <= 0 ? 'agotado' : Number(p.existencia) <= Number(p.stock_minimo) ? 'bajo' : 'normal');
        const orden = { agotado: 0, bajo: 1, normal: 2 };
        return productos
            .map((p) => ({ ...p.toJSON(), nivel: nivel(p) }))
            .sort((a, b) => orden[a.nivel] - orden[b.nivel]);
    }

    /** Semana de nómina (sábado a viernes) que contiene el día dado. Reporte de totales. */
    async nomina(tiendaId, q) {
        const dia = fecha(q.semana, 'semana') ?? hoyMexico();
        const inicio = sumarDias(dia, -((new Date(`${dia}T00:00:00Z`).getUTCDay() + 1) % 7));
        const fin = sumarDias(inicio, 6);
        const trabajadores = await consultar(
            `SELECT v.trabajador_numero AS numero, v.trabajador_nombre AS nombre, count(*)::int AS num_ventas,
                    sum(v.total) AS total, coalesce(sum(v.total) FILTER (WHERE v.descontado_en IS NULL), 0) AS pendiente
               FROM ventas v
              WHERE v.tienda_id = $1 AND v.metodo_pago = 'credito' AND v.estado = 'completada'
                AND ${DIA} BETWEEN $2::date AND $3::date
              GROUP BY 1, 2 ORDER BY 2`,
            [tiendaId, inicio, fin]
        );
        return { inicio, fin, trabajadores };
    }

    async cajas(tiendaId, q) {
        const { desde, hasta } = periodo(q);
        return models.Cajas.findAll({
            where: { tienda_id: tiendaId, abierta_en: entreDias(desde, hasta) },
            attributes: { exclude: ['tienda_id', 'id_local'] },
            order: [['abierta_en', 'DESC']],
        });
    }
}

export default tiendasService;
