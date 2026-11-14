import configuracionService from '../services/configuracion.service.js';
import { manejarError } from '../libs/errores.js';

const service = new configuracionService();

const get = async (req, res) => {
    try {
        const response = await service.find();
        res.json(response);
    } catch (error) {
        manejarError(res, error);
    }
};

/** Sin sesión: nombre de la tienda, moneda y formato de fecha. */
const getPublica = async (req, res) => {
    try {
        const response = await service.findPublica();
        res.json(response);
    } catch (error) {
        manejarError(res, error);
    }
};

const update = async (req, res) => {
    try {
        const response = await service.update(req.body, req.usuario);
        res.json(response);
    } catch (error) {
        manejarError(res, error);
    }
};

export default { get, getPublica, update };
