import { Sequelize } from 'sequelize';
import dotenv from 'dotenv';
import setupModels from '../models/index.js';

dotenv.config({ quiet: true });

let sequelize = null;

/**
 * Crea la conexión (como en biblioteca) y registra los modelos. En la nube
 * la base viene en una sola cadena: DATABASE_URL. `opciones` permite a las
 * pruebas usar otra base.
 */
export function conectar(opciones = {}) {
    const comunes = {
        dialect: 'postgres',
        logging: false,
        dialectOptions: process.env.DATABASE_SSL === 'true'
            ? { ssl: { require: true, rejectUnauthorized: false } }
            : {},
        ...opciones,
    };
    sequelize = opciones.host
        ? new Sequelize(opciones.database, opciones.username, opciones.password, comunes)
        : new Sequelize(process.env.DATABASE_URL, comunes);
    setupModels(sequelize);
    return sequelize;
}

export function obtenerSequelize() {
    return sequelize ?? conectar();
}

/** Consulta SQL directa para los reportes de totales: parámetros $1, $2… en `bind`. */
export function consultar(sql, bind = []) {
    const db = obtenerSequelize();
    return db.query(sql, { bind, type: db.QueryTypes.SELECT });
}

/** Acceso a los modelos: models.Ventas, models.Tiendas, … */
export const models = new Proxy({}, {
    get: (_, nombre) => obtenerSequelize().models[nombre]
});

/**
 * Sequelize 6 con sync({ alter: true }) vuelve a crear las llaves foráneas
 * en cada arranque; aquí se borran las copias (igual que en la tienda).
 */
async function quitarLlavesDuplicadas(db) {
    const llaves = await db.query(
        `SELECT c.conrelid::regclass::text AS tabla, c.conname AS nombre, pg_get_constraintdef(c.oid) AS definicion
           FROM pg_constraint c
          WHERE c.contype = 'f' AND c.connamespace = 'public'::regnamespace
          ORDER BY c.conrelid, length(c.conname), c.conname`,
        { type: db.QueryTypes.SELECT }
    );
    const vistas = new Set();
    for (const { tabla, nombre, definicion } of llaves) {
        const clave = `${tabla}|${definicion}`;
        if (vistas.has(clave)) {
            await db.query(`ALTER TABLE ${tabla} DROP CONSTRAINT IF EXISTS "${nombre.replace(/"/g, '""')}"`);
        } else {
            vistas.add(clave);
        }
    }
}

/** Crea o actualiza las tablas (sync con alter, como en biblioteca). */
export async function prepararBase() {
    const db = obtenerSequelize();
    await db.sync({ alter: true });
    await quitarLlavesDuplicadas(db);
}

export default obtenerSequelize;
