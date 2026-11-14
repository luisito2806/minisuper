import cajaService from '../services/caja.service.js';
import { manejarError } from '../libs/errores.js';

const service = new cajaService();

const get = async (req, res) => {
    try {
        const response = await service.find(req.query, req.usuario);
        res.json(response);
    } catch (error) {
        manejarError(res, error);
    }
};

const getActual = async (req, res) => {
    try {
        const response = await service.findActual(req.usuario);
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

/** Abrir caja. */
const create = async (req, res) => {
    try {
        const response = await service.create(req.body, req.usuario);
        res.status(201).json({ success: true, data: response });
    } catch (error) {
        manejarError(res, error);
    }
};

/** Ingreso o retiro de efectivo. */
const createMovimiento = async (req, res) => {
    try {
        const response = await service.createMovimiento(req.body, req.usuario);
        res.status(201).json({ success: true, data: response });
    } catch (error) {
        manejarError(res, error);
    }
};

const cerrar = async (req, res) => {
    try {
        const { id } = req.params;
        const response = await service.cerrar(id, req.body, req.usuario);
        res.json(response);
    } catch (error) {
        manejarError(res, error);
    }
};

export default { get, getActual, getById, create, createMovimiento, cerrar };
