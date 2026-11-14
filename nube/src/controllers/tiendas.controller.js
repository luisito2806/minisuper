import zlib from 'node:zlib';
import tiendasService from '../services/tiendas.service.js';
import syncService from '../services/sync.service.js';
import { manejarError, ErrorNube } from '../libs/errores.js';

const service = new tiendasService();
const sync = new syncService();

const get = async (req, res) => {
    try {
        res.json(await service.find(req.usuario));
    } catch (error) {
        manejarError(res, error);
    }
};

/** Crea un controlador de consulta: service[metodo](tiendaId, query). */
const consulta = (metodo) => async (req, res) => {
    try {
        res.json(await service[metodo](req.tienda.id, req.query));
    } catch (error) {
        manejarError(res, error);
    }
};

const getVenta = async (req, res) => {
    try {
        res.json(await service.venta(req.tienda.id, req.params.venta));
    } catch (error) {
        manejarError(res, error);
    }
};

/** Paquete traído en USB (archivo .json.gz en base64). */
const cargarPaquete = async (req, res) => {
    try {
        let paquete;
        try {
            paquete = JSON.parse(zlib.gunzipSync(Buffer.from(String(req.body?.archivo ?? ''), 'base64')).toString('utf8'));
        } catch {
            throw new ErrorNube(400, 'El archivo no es un paquete válido (debe ser el .json.gz que genera la tienda).');
        }
        res.json({ success: true, recibido: await sync.guardar(req.tienda, paquete) });
    } catch (error) {
        manejarError(res, error);
    }
};

export default {
    get,
    getResumen: consulta('resumen'),
    getVentas: consulta('ventas'),
    getVenta,
    getInventario: consulta('inventario'),
    getNomina: consulta('nomina'),
    getCajas: consulta('cajas'),
    cargarPaquete,
};
