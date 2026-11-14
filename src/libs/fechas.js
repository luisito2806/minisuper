import { Op } from 'sequelize';
import { obtenerSequelize } from './sequelize.js';
import * as v from './validar.js';

/**
 * Condiciones de rango de fechas (AAAA-MM-DD, inclusivas) para findAll.
 * Las fechas ya están validadas con formato estricto antes de usarse.
 */
export function rangoFechas(query, columna) {
  const db = obtenerSequelize();
  const desde = v.fecha(query.desde, 'desde');
  const hasta = v.fecha(query.hasta, 'hasta');
  const condiciones = [];
  if (desde) condiciones.push(db.where(db.col(columna), Op.gte, db.literal(`'${desde}'::date`)));
  if (hasta) condiciones.push(db.where(db.col(columna), Op.lt, db.literal(`'${hasta}'::date + 1`)));
  return condiciones;
}

/** Igual que rangoFechas, para consultas SQL directas con parámetros $n. */
export function rangoFechasSql(query, columna, filtros, params) {
  const desde = v.fecha(query.desde, 'desde');
  const hasta = v.fecha(query.hasta, 'hasta');
  if (desde) {
    params.push(desde);
    filtros.push(`${columna} >= $${params.length}::date`);
  }
  if (hasta) {
    params.push(hasta);
    filtros.push(`${columna} < $${params.length}::date + 1`);
  }
}

/** Fecha de hoy (AAAA-MM-DD) en hora de México. */
export const hoyMexico = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' });

/** Suma días a una fecha AAAA-MM-DD. */
export function sumarDias(fecha, dias) {
  const d = new Date(`${fecha}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/**
 * Semana de nómina que contiene la fecha dada (por defecto, hoy):
 * de sábado (inicio) a viernes (fin), ambos inclusive.
 */
export function semanaNomina(fecha) {
  const dia = v.fecha(fecha, 'semana') ?? hoyMexico();
  const diaSemana = new Date(`${dia}T00:00:00Z`).getUTCDay(); // 0 = domingo … 6 = sábado
  const inicio = sumarDias(dia, -((diaSemana + 1) % 7));
  return { inicio, fin: sumarDias(inicio, 6) };
}
