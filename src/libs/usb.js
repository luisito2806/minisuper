/**
 * Copiar respaldos y el paquete de sincronización a una memoria USB
 * (Windows), y ver las direcciones de red de esta computadora.
 */
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ErrorApp } from './errores.js';
import { hoyMexico } from './fechas.js';

/** Memorias USB conectadas: [{ unidad: 'E:', nombre, libre, total }]. */
export function listarUnidades() {
    if (process.platform !== 'win32') return Promise.resolve([]);
    const comando = "Get-CimInstance Win32_LogicalDisk -Filter 'DriveType=2' | " +
        'Select-Object DeviceID,VolumeName,FreeSpace,Size | ConvertTo-Json -Compress';
    return new Promise((ok) => {
        execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', comando], { timeout: 20000 },
            (error, stdout) => {
                if (error || !stdout.trim()) return ok([]);
                try {
                    const datos = JSON.parse(stdout);
                    ok((Array.isArray(datos) ? datos : [datos]).map((d) => ({
                        unidad: d.DeviceID, nombre: d.VolumeName || 'USB', libre: d.FreeSpace, total: d.Size,
                    })));
                } catch {
                    ok([]);
                }
            });
    });
}

/**
 * Copia archivos a <unidad>\MiniSuper\<fecha>\.
 *   archivos: [{ nombre, ruta }] o [{ nombre, contenido: Buffer }]
 */
export async function copiarAUnidad(unidad, archivos) {
    if (typeof unidad !== 'string' || !/^[A-Z]:$/i.test(unidad)) throw new ErrorApp(400, 'Unidad USB inválida.');
    const conectadas = await listarUnidades();
    if (!conectadas.some((u) => u.unidad.toUpperCase() === unidad.toUpperCase())) {
        throw new ErrorApp(404, `No se encontró la memoria USB ${unidad}. Conéctala y vuelve a intentar.`);
    }
    const carpeta = path.join(`${unidad.toUpperCase()}\\`, 'MiniSuper', hoyMexico());
    try {
        fs.mkdirSync(carpeta, { recursive: true });
        for (const a of archivos) {
            const destino = path.join(carpeta, a.nombre);
            if (a.ruta) fs.copyFileSync(a.ruta, destino);
            else fs.writeFileSync(destino, a.contenido);
        }
    } catch (error) {
        throw new ErrorApp(500, `No se pudo copiar a la USB (${error.code ?? error.message}). ¿Está llena o protegida contra escritura?`);
    }
    return { carpeta, archivos: archivos.map((a) => a.nombre) };
}

/** Direcciones IPv4 de esta computadora (para entrar desde otra). Tailscale usa 100.64.0.0/10. */
export function direccionesRed(puerto) {
    const lista = [];
    for (const [interfaz, dirs] of Object.entries(os.networkInterfaces())) {
        for (const d of dirs ?? []) {
            if (d.family !== 'IPv4' || d.internal) continue;
            const [a, b] = d.address.split('.').map(Number);
            const tailscale = a === 100 && b >= 64 && b <= 127;
            lista.push({ interfaz, direccion: d.address, url: `http://${d.address}:${puerto}`, tailscale });
        }
    }
    return { equipo: os.hostname(), direcciones: lista.sort((x, y) => Number(y.tailscale) - Number(x.tailscale)) };
}
