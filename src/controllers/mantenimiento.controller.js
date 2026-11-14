import mantenimientoService from '../services/mantenimiento.service.js';
import { manejarError } from '../libs/errores.js';
import { rutaRespaldo } from '../libs/respaldos.js';

const service = new mantenimientoService();

const getDepuracion = async (req, res) => {
    try {
        res.json(await service.vistaPrevia());
    } catch (error) {
        manejarError(res, error);
    }
};

const depurar = async (req, res) => {
    try {
        res.json(await service.depurar(req.body, req.usuario));
    } catch (error) {
        manejarError(res, error);
    }
};

const getRespaldos = async (req, res) => {
    try {
        res.json(service.respaldos());
    } catch (error) {
        manejarError(res, error);
    }
};

const crearRespaldo = async (req, res) => {
    try {
        res.status(201).json({ success: true, data: await service.respaldar() });
    } catch (error) {
        manejarError(res, error);
    }
};

/** Descarga un archivo de respaldo (para guardarlo en una USB, por ejemplo). */
const descargarRespaldo = async (req, res) => {
    try {
        res.download(rutaRespaldo(req.params.nombre));
    } catch (error) {
        manejarError(res, error);
    }
};

export default { getDepuracion, depurar, getRespaldos, crearRespaldo, descargarRespaldo };
