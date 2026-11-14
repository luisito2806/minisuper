import inventarioService from '../services/inventario.service.js';
import { manejarError } from '../libs/errores.js';

const service = new inventarioService();

/** Historial de movimientos. */
const get = async (req, res) => {
    try {
        const response = await service.find(req.query);
        res.json(response);
    } catch (error) {
        manejarError(res, error);
    }
};

/** Ajuste manual (entrada, salida o conteo físico). */
const create = async (req, res) => {
    try {
        const response = await service.ajustar(req.body, req.usuario);
        res.status(201).json({ success: true, data: response });
    } catch (error) {
        manejarError(res, error);
    }
};

/** Conteo físico de varios productos. */
const conteo = async (req, res) => {
    try {
        const response = await service.conteo(req.body, req.usuario);
        res.status(201).json({ success: true, data: response });
    } catch (error) {
        manejarError(res, error);
    }
};

/** Lista de compra sugerida. */
const getSugerida = async (req, res) => {
    try {
        res.json(await service.sugerida());
    } catch (error) {
        manejarError(res, error);
    }
};

export default { get, create, conteo, getSugerida };
