import { Op, fn, col } from 'sequelize';
import { models, obtenerSequelize } from '../libs/sequelize.js';
import { ErrorApp } from '../libs/errores.js';
import { aEnteroSigno } from '../libs/dinero.js';
import { hoyMexico, rangoFechas, sumarDias } from '../libs/fechas.js';
import { listarRespaldos, respaldar, respaldosDisponibles } from '../libs/respaldos.js';
import * as v from '../libs/validar.js';

/** Fecha de corte (AAAA-MM-DD): hoy hace un año. Se borra lo anterior a ese día. */
function fechaCorte() {
    const hoy = hoyMexico();
    const dia = hoy.slice(5) === '02-29' ? '02-28' : hoy.slice(5);
    return `${Number(hoy.slice(0, 4)) - 1}-${dia}`;
}

/** Condición "antes de la fecha de corte" para la columna dada. */
const antesDe = (corte, columna) => rangoFechas({ hasta: sumarDias(corte, -1) }, columna);

/**
 * Ventas que se borran al depurar: las de antes del corte. Se conservan las
 * ventas a crédito que todavía no se descuentan en nómina, para no perder
 * lo que deben los trabajadores.
 */
const ventasABorrar = (corte) => ({
    [Op.and]: [
        ...antesDe(corte, 'fecha'),
        { [Op.not]: { metodo_pago: 'credito', estado: 'completada', descontado_en: null } },
    ],
});

class mantenimientoService {
    constructor() {}

    /** Cuánto se borraría si se depura hoy (para mostrarlo antes de confirmar). */
    async vistaPrevia() {
        const corte = fechaCorte();
        const ids = (await models.Ventas.findAll({ attributes: ['id'], where: ventasABorrar(corte), raw: true })).map((x) => x.id);
        return {
            corte,
            ventas: ids.length,
            canceladas: await models.Ventas.count({ where: { id: ids, estado: 'cancelada' } }),
            partidas: await models.DetalleVentas.count({ where: { venta_id: ids } }),
            credito_pendiente: await models.Ventas.count({
                where: {
                    metodo_pago: 'credito', estado: 'completada', descontado_en: null,
                    [Op.and]: antesDe(corte, 'fecha'),
                },
            }),
            respaldos_disponibles: respaldosDisponibles(),
        };
    }

    /**
     * Borra las ventas de hace más de un año (con sus partidas y su
     * historial de inventario) y los cortes de caja de esas fechas.
     *
     * Para que la existencia siga cuadrando con el historial, los
     * movimientos de inventario anteriores al corte se resumen en un solo
     * renglón "saldo_depurado" por producto. Las existencias actuales no
     * cambian.
     */
    async depurar(data, usuario) {
        const hacerRespaldo = v.booleano(data.respaldar, 'respaldar', true);
        let respaldo = null;
        if (hacerRespaldo) respaldo = await respaldar();

        return obtenerSequelize().transaction(async (transaction) => {
            const corte = fechaCorte();
            const ids = (await models.Ventas.findAll({
                attributes: ['id'], where: ventasABorrar(corte), raw: true, transaction,
            })).map((x) => x.id);

            // 1. Historial de inventario: lo anterior al corte (y todo lo de las
            //    ventas que se borran) se resume en un saldo por producto.
            const movimientosABorrar = {
                [Op.or]: [
                    { venta_id: ids },
                    { venta_id: null, [Op.and]: antesDe(corte, 'fecha') },
                ],
            };
            const sumas = await models.MovimientosInventario.findAll({
                attributes: ['producto_id', [fn('sum', col('cantidad')), 'cantidad']],
                where: movimientosABorrar,
                group: ['producto_id'],
                raw: true,
                transaction,
            });
            await models.MovimientosInventario.destroy({ where: movimientosABorrar, transaction });
            // Un segundo antes de la medianoche del corte (México, UTC-6).
            const fechaSaldo = new Date(new Date(`${corte}T00:00:00-06:00`).getTime() - 1000);
            const saldos = await models.MovimientosInventario.bulkCreate(
                sumas
                    .filter((s) => aEnteroSigno(s.cantidad, 3) !== 0)
                    .map((s) => ({
                        producto_id: s.producto_id,
                        usuario_id: usuario.id,
                        fecha: fechaSaldo,
                        tipo: 'saldo_depurado',
                        cantidad: s.cantidad,
                        existencia_anterior: '0',
                        existencia_nueva: s.cantidad,
                        motivo: `Saldo de movimientos anteriores al ${corte.split('-').reverse().join('/')} (historial depurado)`,
                    })),
                { transaction }
            );

            // 2. Ventas y sus partidas.
            const partidas = await models.DetalleVentas.destroy({ where: { venta_id: ids }, transaction });
            await models.Ventas.destroy({ where: { id: ids }, transaction });

            // 3. Cortes de caja cerrados antes del corte que ya no tienen ventas.
            const cajasViejas = await models.SesionesCaja.findAll({
                where: { estado: 'cerrada', [Op.and]: antesDe(corte, 'SesionesCaja.cerrada_en') },
                include: [{ model: models.Ventas, as: 'ventas', attributes: ['id'], required: false }],
                transaction,
            });
            const cajas = cajasViejas.filter((s) => s.ventas.length === 0).map((s) => s.id);
            await models.MovimientosCaja.destroy({ where: { sesion_caja_id: cajas }, transaction });
            await models.SesionesCaja.destroy({ where: { id: cajas }, transaction });

            if (!ids.length && !cajas.length) {
                throw new ErrorApp(409, `No hay ventas anteriores al ${corte} que se puedan borrar.`);
            }
            return {
                corte,
                ventas: ids.length,
                partidas,
                cajas: cajas.length,
                saldos_inventario: saldos.length,
                respaldo: respaldo?.nombre ?? null,
            };
        });
    }

    respaldos() {
        return { disponibles: respaldosDisponibles(), respaldos: listarRespaldos() };
    }

    respaldar() {
        return respaldar();
    }
}

export default mantenimientoService;
