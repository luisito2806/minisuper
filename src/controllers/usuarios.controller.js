import usuariosService from '../services/usuarios.service.js';
import { manejarError } from '../libs/errores.js';

const service = new usuariosService();

const get = async (req, res) => {
    try {
        const response = await service.find();
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
        const response = await service.create(req.body);
        res.status(201).json({ success: true, data: response });
    } catch (error) {
        manejarError(res, error);
    }
};

const update = async (req, res) => {
    try {
        const { id } = req.params;
        const response = await service.update(id, req.body, req.usuario);
        res.json(response);
    } catch (error) {
        manejarError(res, error);
    }
};

const _delete = async (req, res) => {
    try {
        const { id } = req.params;
        const response = await service.delete(id, req.usuario);
        res.json(response);
    } catch (error) {
        manejarError(res, error);
    }
};

export default { create, get, getById, update, _delete };
