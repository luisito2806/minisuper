import { Sequelize } from 'sequelize';
import dotenv from 'dotenv';
import setupModels from '../models/index.js';
import { asegurarRestricciones, migrar, quitarLlavesDuplicadas } from './restricciones.js';
import { sembrar } from './semilla.js';
import { asegurarDisparadores } from './disparadores.js';

dotenv.config({ quiet: true });

let sequelize = null;

/**
 * Crea la conexión (como en biblioteca: DB_NAME, DB_USER, DB_PASSWORD,
 * DB_HOST, DB_PORT) y registra los modelos. `opciones` permite a las
 * pruebas y al demo usar otra base.
 */
export function conectar(opciones = {}) {
    sequelize = new Sequelize(
        process.env.DB_NAME,
        process.env.DB_USER,
        process.env.DB_PASSWORD,
        {
            host: process.env.DB_HOST,
            port: process.env.DB_PORT,
            dialect: 'postgres',
            logging: false,
            // Fechas y filtros por día en hora de México.
            timezone: 'America/Mexico_City',
            ...opciones
        }
    );
    setupModels(sequelize);
    return sequelize;
}

export function obtenerSequelize() {
    return sequelize ?? conectar();
}

/** Consulta SQL directa (reportes): parámetros $1, $2… en `bind`. */
export function consultar(sql, bind = [], transaction) {
    const db = obtenerSequelize();
    return db.query(sql, { bind, transaction, type: db.QueryTypes.SELECT });
}

/** Acceso a los modelos: models.Productos, models.Ventas, … */
export const models = new Proxy({}, {
    get: (_, nombre) => obtenerSequelize().models[nombre]
});

/**
 * Crea o actualiza las tablas (sync con alter, como en biblioteca),
 * agrega las restricciones CHECK y, si la base está vacía, los datos
 * iniciales.
 */
export async function prepararBaseDeDatos({ datosDePrueba = false } = {}) {
    const db = obtenerSequelize();
    await db.query('CREATE SEQUENCE IF NOT EXISTS folio_ventas_seq');
    await db.query('CREATE SEQUENCE IF NOT EXISTS folio_compras_seq');
    await db.sync({ alter: true });
    await quitarLlavesDuplicadas(db);
    await migrar(db);
    await asegurarRestricciones(db);
    await asegurarDisparadores(db);
    await sembrar(db, { datosDePrueba });
}

export default obtenerSequelize;
