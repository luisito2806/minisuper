/**
 * Respaldos de la base con pg_dump (el mismo formato que "Backup…" de
 * pgAdmin, se restauran con "Restore…" o con pg_restore).
 *
 *   - Automático: una vez al día, al arrancar y luego cada hora revisa si
 *     ya existe el respaldo de hoy.
 *   - Manual: botón "Respaldar ahora" en Configuración.
 *   - Antes de depurar ventas viejas.
 *
 * Se guardan en la carpeta respaldos/ y se conservan los últimos 30.
 * Solo funciona con PostgreSQL instalado (no en el demo ni en las pruebas).
 */
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ErrorApp } from './errores.js';
import { hoyMexico } from './fechas.js';

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const CARPETA = path.join(RAIZ, 'respaldos');
const CONSERVAR = 30;
const PATRON = /^minisuper_\d{4}-\d{2}-\d{2}_\d{4}\.backup$/;

let habilitado = false;
let temporizador = null;

/** Lo llama server.js: el demo y las pruebas no tienen pg_dump. */
export function habilitarRespaldos() {
    habilitado = true;
}

export const respaldosDisponibles = () => habilitado;

/** Busca pg_dump: variable PG_DUMP, la carpeta de PostgreSQL en Windows o el PATH. */
function rutaPgDump() {
    if (process.env.PG_DUMP) return process.env.PG_DUMP;
    if (process.platform === 'win32') {
        const base = path.join(process.env.ProgramFiles || 'C:\\Program Files', 'PostgreSQL');
        try {
            const versiones = fs.readdirSync(base)
                .filter((d) => fs.existsSync(path.join(base, d, 'bin', 'pg_dump.exe')))
                .sort((a, b) => Number(b) - Number(a));
            if (versiones.length) return path.join(base, versiones[0], 'bin', 'pg_dump.exe');
        } catch {
            // Sin carpeta de PostgreSQL: se intenta con el PATH.
        }
    }
    return 'pg_dump';
}

/** Lista de respaldos, del más reciente al más antiguo. */
export function listarRespaldos() {
    if (!fs.existsSync(CARPETA)) return [];
    return fs.readdirSync(CARPETA)
        .filter((n) => PATRON.test(n))
        .map((nombre) => {
            const st = fs.statSync(path.join(CARPETA, nombre));
            return { nombre, tamano: st.size, fecha: st.mtime };
        })
        .sort((a, b) => b.nombre.localeCompare(a.nombre));
}

/** Ruta segura de un respaldo por nombre (evita salir de la carpeta). */
export function rutaRespaldo(nombre) {
    if (typeof nombre !== 'string' || !PATRON.test(nombre)) throw new ErrorApp(400, 'Nombre de respaldo inválido.');
    const ruta = path.join(CARPETA, nombre);
    if (!fs.existsSync(ruta)) throw new ErrorApp(404, 'El respaldo no existe.');
    return ruta;
}

/** Ejecuta pg_dump y borra los respaldos más viejos que excedan 30. */
export async function respaldar() {
    if (!habilitado) {
        throw new ErrorApp(409, 'Los respaldos solo funcionan con PostgreSQL instalado (no en el modo demo).');
    }
    fs.mkdirSync(CARPETA, { recursive: true });
    const hora = new Date().toLocaleTimeString('en-GB', { timeZone: 'America/Mexico_City', hour: '2-digit', minute: '2-digit' });
    const nombre = `minisuper_${hoyMexico()}_${hora.replace(':', '')}.backup`;
    const destino = path.join(CARPETA, nombre);
    const args = [
        '-h', process.env.DB_HOST || 'localhost',
        '-p', String(process.env.DB_PORT || 5432),
        '-U', process.env.DB_USER || 'postgres',
        '-F', 'c',
        '-f', destino,
        process.env.DB_NAME,
    ];
    await new Promise((ok, falla) => {
        execFile(rutaPgDump(), args, { env: { ...process.env, PGPASSWORD: process.env.DB_PASSWORD ?? '' }, timeout: 10 * 60 * 1000 },
            (error, _stdout, stderr) => {
                if (!error) return ok();
                fs.rmSync(destino, { force: true });
                const detalle = error.code === 'ENOENT'
                    ? 'No se encontró pg_dump. Instala PostgreSQL o indica su ruta en PG_DUMP dentro de .env.'
                    : String(stderr || error.message).trim().split('\n')[0];
                falla(new ErrorApp(500, `No se pudo crear el respaldo: ${detalle}`));
            });
    });
    for (const viejo of listarRespaldos().slice(CONSERVAR)) {
        fs.rmSync(path.join(CARPETA, viejo.nombre), { force: true });
    }
    return listarRespaldos().find((r) => r.nombre === nombre);
}

/** Respaldo diario: si hoy aún no hay uno, lo crea. */
export async function respaldoDelDia() {
    if (listarRespaldos().some((r) => r.nombre.startsWith(`minisuper_${hoyMexico()}_`))) return;
    try {
        const r = await respaldar();
        console.log(`Respaldo automático creado: respaldos/${r.nombre}`);
    } catch (error) {
        console.error(error.message);
    }
}

export function iniciarRespaldoAutomatico() {
    if (temporizador) return;
    respaldoDelDia();
    temporizador = setInterval(respaldoDelDia, 60 * 60 * 1000);
    temporizador.unref();
}
