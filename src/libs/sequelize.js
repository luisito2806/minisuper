import crypto from 'node:crypto';
import path from 'node:path';
import { Sequelize } from 'sequelize';
import dotenv from 'dotenv';
import setupModels from '../models/index.js';
import { asegurarRestricciones, migrar, quitarLlavesDuplicadas } from './restricciones.js';
import { sembrar } from './semilla.js';
import { asegurarDisparadores } from './disparadores.js';

// Instalado con MiniSuper-Setup.exe, el .env está en la carpeta de datos
// (MINISUPER_DATOS). Debe cargarse aquí, al importar: el primer .env que se
// carga gana, y este archivo se importa antes que el resto de server.js.
dotenv.config({
    path: process.env.MINISUPER_DATOS ? path.join(process.env.MINISUPER_DATOS, '.env') : '.env',
    quiet: true,
});

let sequelize = null;

/**
 * Crea la conexión (como en biblioteca: DB_NAME, DB_USER, DB_PASSWORD,
 * DB_HOST, DB_PORT) y registra los modelos. `opciones` permite a las
 * pruebas y al demo usar otra base; con `opciones.url` se conecta a esa
 * dirección (postgres://…) en lugar de usar las variables DB_*.
 */
export function conectar(opciones = {}) {
    const { url, ...resto } = opciones;
    const config = {
        dialect: 'postgres',
        logging: false,
        // Fechas y filtros por día en hora de México.
        timezone: 'America/Mexico_City',
        ...resto
    };
    sequelize = url
        ? new Sequelize(url, config)
        : new Sequelize(
            process.env.DB_NAME,
            process.env.DB_USER,
            process.env.DB_PASSWORD,
            { host: process.env.DB_HOST, port: process.env.DB_PORT, ...config }
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
 * Huella (SHA-256) de la definición de todos los modelos: tablas, columnas,
 * tipos, valores predeterminados, llaves e índices. Cambia solo cuando
 * cambia algún modelo.
 */
export function huellaModelos(db = obtenerSequelize()) {
    const tipo = (t) => {
        try {
            return t?.toString?.() ?? String(t);
        } catch {
            return t?.key ?? String(t);
        }
    };
    const valor = (x) => (typeof x === 'function' ? x.key ?? x.name : x);
    const definicion = Object.values(db.models)
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((m) => ({
            tabla: m.getTableName(),
            columnas: Object.entries(m.getAttributes()).map(([nombre, a]) => [
                nombre, a.field, tipo(a.type), a.allowNull ?? null, !!a.primaryKey, !!a.autoIncrement,
                a.unique ?? null, valor(a.defaultValue) ?? null, a.references ?? null, a.onDelete ?? null, a.onUpdate ?? null,
            ]),
            indices: m.options.indexes ?? [],
        }));
    return crypto.createHash('sha256').update(JSON.stringify(definicion)).digest('hex');
}

/** Huella guardada en la base (null si es nueva o de una versión anterior). */
async function huellaGuardada(db) {
    try {
        const [fila] = await db.query('SELECT esquema_huella FROM configuracion WHERE id = 1', { type: db.QueryTypes.SELECT });
        return fila?.esquema_huella ?? null;
    } catch {
        return null; // la tabla o la columna todavía no existen
    }
}

/**
 * Crea o actualiza las tablas, agrega las restricciones CHECK y, si la base
 * está vacía, los datos iniciales.
 *
 * sync({ alter: true }) solo se ejecuta si los modelos cambiaron desde el
 * último arranque (o con ACTUALIZAR_ESQUEMA=true en .env). Antes de
 * modificar una base que ya tiene datos se llama a `antesDeActualizar`
 * (server.js hace ahí un respaldo); si falla, no se toca nada.
 */
export async function prepararBaseDeDatos({ datosDePrueba = false, antesDeActualizar } = {}) {
    const db = obtenerSequelize();
    const huella = huellaModelos(db);
    const anterior = await huellaGuardada(db);
    if (anterior !== huella || process.env.ACTUALIZAR_ESQUEMA === 'true') {
        const [{ hay }] = await db.query("SELECT to_regclass('public.ventas') IS NOT NULL AS hay", { type: db.QueryTypes.SELECT });
        if (hay && antesDeActualizar) await antesDeActualizar();
        await db.query('CREATE SEQUENCE IF NOT EXISTS folio_ventas_seq');
        await db.query('CREATE SEQUENCE IF NOT EXISTS folio_compras_seq');
        await db.sync({ alter: true });
        await quitarLlavesDuplicadas(db);
    }
    await migrar(db);
    await asegurarRestricciones(db);
    await asegurarDisparadores(db);
    await sembrar(db, { datosDePrueba });
    // Se guarda al final: si algo falló, el siguiente arranque lo reintenta.
    if (anterior !== huella) {
        await db.query('UPDATE configuracion SET esquema_huella = $1 WHERE id = 1', { bind: [huella] });
    }
}

export default obtenerSequelize;
