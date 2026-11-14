import productosService from '../services/productos.service.js';
import { manejarError } from '../libs/errores.js';

const service = new productosService();

const get = async (req, res) => {
    try {
        const response = await service.find(req.query, req.usuario);
        res.json(response);
    } catch (error) {
        manejarError(res, error);
    }
};

const getById = async (req, res) => {
    try {
        const { id } = req.params;
        const response = await service.findOne(id, req.usuario);
        res.json(response);
    } catch (error) {
        manejarError(res, error);
    }
};

const getByCodigo = async (req, res) => {
    try {
        const { codigo } = req.params;
        const response = await service.findByCodigo(codigo, req.usuario);
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

const update = async (req, res) => {
    try {
        const { id } = req.params;
        const response = await service.update(id, req.body);
        res.json(response);
    } catch (error) {
        manejarError(res, error);
    }
};

const _delete = async (req, res) => {
    try {
        const { id } = req.params;
        const response = await service.delete(id);
        res.json(response);
    } catch (error) {
        manejarError(res, error);
    }
};

/** Cambiar precios y costos de varios productos a la vez. */
const actualizarPrecios = async (req, res) => {
    try {
        const response = await service.actualizarPrecios(req.body);
        res.json(response);
    } catch (error) {
        manejarError(res, error);
    }
};

export default { create, get, getById, getByCodigo, update, _delete, actualizarPrecios };

