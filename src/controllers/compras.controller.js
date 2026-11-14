import comprasService from '../services/compras.service.js';
import { manejarError } from '../libs/errores.js';

const service = new comprasService();

const get = async (req, res) => {
    try {
        const response = await service.find(req.query);
        res.json(response);
    } catch (error) {
        manejarError(res, error);
    }
};

const getById = async (req, res) => {
    try {
        const { id } = req.params;
        const response = await service.findOne(id);
        res.json(response);
    } catch (error) {
        manejarError(res, error);
    }
};

const create = async (req, res) => {
    try {
        const response = await service.create(req.body, req.usuario);
        res.status(201).json({ success: true, data: response });
    } catch (error) {
        manejarError(res, error);
    }
};

/** Las compras no se editan ni se borran: se cancelan con motivo. */
const cancelar = async (req, res) => {
    try {
        const { id } = req.params;
        const response = await service.cancelar(id, req.body, req.usuario);
        res.json(response);
    } catch (error) {
        manejarError(res, error);
    }
};

export default { create, get, getById, cancelar };
