import sincronizacionService from '../services/sincronizacion.service.js';
import mantenimientoService from '../services/mantenimiento.service.js';
import { ErrorApp, manejarError } from '../libs/errores.js';
import { listarRespaldos, CARPETA } from '../libs/respaldos.js';
import { copiarAUnidad, direccionesRed, listarUnidades } from '../libs/usb.js';
import path from 'node:path';

const service = new sincronizacionService();
const mantenimiento = new mantenimientoService();

const getEstado = async (req, res) => {
    try {
        res.json(await service.estado());
    } catch (error) {
        manejarError(res, error);
    }
};

const sincronizar = async (req, res) => {
    try {
        res.json(await service.sincronizar());
    } catch (error) {
        manejarError(res, error);
    }
};

/** Descarga el paquete para llevarlo en USB a la ciudad. */
const getPaquete = async (req, res) => {
    try {
        const p = await service.paquete();
        res.setHeader('Content-Type', 'application/gzip');
        res.setHeader('Content-Disposition', `attachment; filename="${p.nombre}"`);
        res.send(p.archivo);
        await p.confirmar().catch((e) => console.error(e)); // la respuesta ya se envió
    } catch (error) {
        manejarError(res, error);
    }
};

const reenviarTodo = async (req, res) => {
    try {
        res.json(await service.reenviarTodo());
    } catch (error) {
        manejarError(res, error);
    }
};

const getUsb = async (req, res) => {
    try {
        res.json({ windows: process.platform === 'win32', unidades: await listarUnidades() });
    } catch (error) {
        manejarError(res, error);
    }
};

/**
 * Copia a la USB: el respaldo más reciente (si se pide, se hace uno nuevo
 * antes) y el paquete de cambios para cargar en la nube.
 */
const copiarUsb = async (req, res) => {
    try {
        const archivos = [];
        if (req.body.respaldo !== false) {
            let ultimo = listarRespaldos()[0];
            if (req.body.respaldo_nuevo) ultimo = await mantenimiento.respaldar();
            if (ultimo) archivos.push({ nombre: ultimo.nombre, ruta: path.join(CARPETA, ultimo.nombre) });
        }
        let paquete = null;
        if (req.body.paquete !== false) {
            try {
                paquete = await service.paquete();
                archivos.push({ nombre: paquete.nombre, contenido: paquete.archivo });
            } catch (error) {
                if (error.status !== 409) throw error; // 409 = no hay cambios nuevos
            }
        }
        if (!archivos.length) throw new ErrorApp(409, 'No hay respaldo ni cambios nuevos que copiar.');
        const copia = await copiarAUnidad(req.body.unidad, archivos);
        // Solo ya copiado se saca de la cola: si la copia falla, no se pierde nada.
        if (paquete) await paquete.confirmar();
        res.json({ ...copia, cambios: paquete?.cambios ?? 0 });
    } catch (error) {
        manejarError(res, error);
    }
};

const getRed = async (req, res) => {
    try {
        // Con HOST=127.0.0.1 (lo predeterminado) nadie más puede entrar.
        const host = process.env.HOST || '127.0.0.1';
        const enRed = !['127.0.0.1', 'localhost', '::1'].includes(host);
        res.json({ ...direccionesRed(process.env.PORT || 3000), en_red: enRed });
    } catch (error) {
        manejarError(res, error);
    }
};

export default { getEstado, sincronizar, getPaquete, reenviarTodo, getUsb, copiarUsb, getRed };
