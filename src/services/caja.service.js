import { Op } from 'sequelize';
import { models, obtenerSequelize, consultar } from '../libs/sequelize.js';
import { ErrorApp, noEncontrado } from '../libs/errores.js';
import { aEntero, aTexto } from '../libs/dinero.js';
import { rangoFechas } from '../libs/fechas.js';
import * as v from '../libs/validar.js';

const esAdmin = (usuario) => usuario?.rol === 'administrador';

class cajaService {
    constructor() {}

    /**
     * Resumen de una sesión de caja.
     *   efectivo esperado = fondo inicial + ventas en efectivo + ingresos - retiros
     * Las ventas canceladas no cuentan (el efectivo se devolvió).
     */
    async resumen(id, transaction) {
        const [s] = await consultar(
            `SELECT s.*, u.nombre AS usuario, uc.nombre AS cerrada_por_nombre,
                    coalesce(v.num_ventas, 0)::int AS num_ventas,
                    coalesce(v.ventas_efectivo, 0) AS ventas_efectivo,
                    coalesce(v.ventas_otros, 0) AS ventas_otros,
                    coalesce(v.num_canceladas, 0)::int AS num_canceladas,
                    coalesce(m.ingresos, 0) AS ingresos,
                    coalesce(m.retiros, 0) AS retiros
               FROM sesiones_caja s
               JOIN usuarios u ON u.id = s.usuario_id
               LEFT JOIN usuarios uc ON uc.id = s.cerrada_por
               LEFT JOIN LATERAL (
                 SELECT count(*) FILTER (WHERE estado = 'completada') AS num_ventas,
                        sum(total) FILTER (WHERE estado = 'completada' AND metodo_pago = 'efectivo') AS ventas_efectivo,
                        sum(total) FILTER (WHERE estado = 'completada' AND metodo_pago <> 'efectivo') AS ventas_otros,
                        count(*) FILTER (WHERE estado = 'cancelada') AS num_canceladas
                   FROM ventas WHERE sesion_caja_id = s.id
               ) v ON TRUE
               LEFT JOIN LATERAL (
                 SELECT sum(monto) FILTER (WHERE tipo = 'ingreso') AS ingresos,
                        sum(monto) FILTER (WHERE tipo = 'retiro') AS retiros
                   FROM movimientos_caja WHERE sesion_caja_id = s.id
               ) m ON TRUE
              WHERE s.id = $1`,
            [id],
            transaction
        );
        if (!s) return null;
        for (const k of ['ventas_efectivo', 'ventas_otros', 'ingresos', 'retiros']) s[k] = aTexto(aEntero(s[k], 2), 2);
        const esperado = aEntero(s.fondo_inicial, 2) + aEntero(s.ventas_efectivo, 2) + aEntero(s.ingresos, 2) - aEntero(s.retiros, 2);
        s.efectivo_esperado_actual = s.estado === 'cerrada' ? s.efectivo_esperado : aTexto(esperado, 2);
        Object.defineProperty(s, 'esperadoCent', { value: esperado, enumerable: false });
        return s;
    }

    async movimientos(sesionId) {
        const res = await models.MovimientosCaja.findAll({
            where: { sesion_caja_id: sesionId },
            include: [{ model: models.Usuarios, as: 'usuario', attributes: ['nombre'] }],
            order: [['fecha', 'ASC']]
        });
        return res.map((m) => ({ ...m.toJSON(), usuario: m.usuario?.nombre }));
    }

    /** Caja abierta del usuario (o null), con sus ingresos y retiros. */
    async findActual(usuario) {
        const caja = await models.SesionesCaja.findOne({ where: { usuario_id: usuario.id, estado: 'abierta' } });
        if (!caja) return { sesion: null, movimientos: [] };
        return { sesion: await this.resumen(caja.id), movimientos: await this.movimientos(caja.id) };
    }

    /** Abre la caja del usuario. Solo puede tener una abierta. */
    async create(data, usuario) {
        const fondo = v.decimal(data.fondo_inicial, 'fondo inicial', { escala: 2, max: 1000000 });
        return obtenerSequelize().transaction(async (t) => {
            // Bloquear al usuario serializa dos aperturas simultáneas.
            await models.Usuarios.findByPk(usuario.id, { transaction: t, lock: t.LOCK.UPDATE });
            const abierta = await models.SesionesCaja.findOne({
                where: { usuario_id: usuario.id, estado: 'abierta' }, transaction: t
            });
            if (abierta) throw new ErrorApp(409, 'Ya tienes una caja abierta. Ciérrala antes de abrir otra.');
            const caja = await models.SesionesCaja.create({ usuario_id: usuario.id, fondo_inicial: aTexto(fondo, 2) }, { transaction: t });
            return this.resumen(caja.id, t);
        });
    }

    /** Ingreso o retiro de efectivo en la caja abierta del usuario. */
    async createMovimiento(data, usuario) {
        const tipo = v.opcion(data.tipo, 'tipo', ['ingreso', 'retiro']);
        const monto = v.decimal(data.monto, 'monto', { escala: 2, positivo: true, max: 1000000 });
        const motivo = v.texto(data.motivo, 'motivo', { max: 255, requerido: true });

        return obtenerSequelize().transaction(async (t) => {
            const caja = await models.SesionesCaja.findOne({
                where: { usuario_id: usuario.id, estado: 'abierta' }, transaction: t, lock: t.LOCK.UPDATE
            });
            if (!caja) throw new ErrorApp(409, 'No tienes una caja abierta.');
            if (tipo === 'retiro') {
                const r = await this.resumen(caja.id, t);
                if (monto > r.esperadoCent) {
                    throw new ErrorApp(400, `No puedes retirar más del efectivo esperado en caja ($${aTexto(r.esperadoCent, 2)}).`);
                }
            }
            await models.MovimientosCaja.create({
                sesion_caja_id: caja.id, usuario_id: usuario.id, tipo, monto: aTexto(monto, 2), motivo
            }, { transaction: t });
            return this.resumen(caja.id, t);
        });
    }

    /** Historial de cortes: el cajero ve los suyos; el administrador, todos. */
    async find(query, usuario) {
        const where = { [Op.and]: rangoFechas(query, 'SesionesCaja.abierta_en') };
        if (!esAdmin(usuario)) where.usuario_id = usuario.id;
        else if (query.usuario_id) where.usuario_id = v.id(query.usuario_id, 'usuario');
        if (query.estado) where.estado = v.opcion(query.estado, 'estado', ['abierta', 'cerrada']);
        const res = await models.SesionesCaja.findAll({
            where,
            include: [{ model: models.Usuarios, as: 'usuario', attributes: ['nombre'] }],
            order: [['abierta_en', 'DESC']],
            limit: 300
        });
        return res.map((s) => ({ ...s.toJSON(), usuario: s.usuario?.nombre }));
    }

    async findOne(id, usuario) {
        const s = await this.resumen(v.id(id));
        if (!s || (!esAdmin(usuario) && String(s.usuario_id) !== String(usuario.id))) {
            throw noEncontrado('La sesión de caja');
        }
        return { sesion: s, movimientos: await this.movimientos(s.id) };
    }

    /**
     * Cierra una caja abierta (su dueño o un administrador). Guarda el
     * efectivo esperado, el contado y la diferencia. No se cierra dos veces.
     */
    async cerrar(id, data, usuario) {
        const sesionId = v.id(id);
        const contado = v.decimal(data.monto_contado, 'monto contado', { escala: 2, max: 1000000 });
        const notas = v.texto(data.notas, 'notas', { max: 255 });

        return obtenerSequelize().transaction(async (t) => {
            // FOR UPDATE espera a que terminen las ventas en curso de esta caja.
            const caja = await models.SesionesCaja.findByPk(sesionId, { transaction: t, lock: t.LOCK.UPDATE });
            if (!caja) throw noEncontrado('La sesión de caja');
            if (String(caja.usuario_id) !== String(usuario.id) && !esAdmin(usuario)) {
                throw new ErrorApp(403, 'Solo el dueño de la caja o un administrador puede cerrarla.');
            }
            if (caja.estado !== 'abierta') throw new ErrorApp(409, 'Esta caja ya estaba cerrada.');

            const r = await this.resumen(sesionId, t);
            await caja.update({
                estado: 'cerrada',
                cerrada_en: new Date(),
                cerrada_por: usuario.id,
                efectivo_esperado: aTexto(r.esperadoCent, 2),
                monto_contado: aTexto(contado, 2),
                diferencia: aTexto(contado - r.esperadoCent, 2),
                notas_cierre: notas,
            }, { transaction: t });
            return this.resumen(sesionId, t);
        });
    }
}

export default cajaService;
