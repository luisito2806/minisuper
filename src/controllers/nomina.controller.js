import nominaService from '../services/nomina.service.js';
import { manejarError } from '../libs/errores.js';

const service = new nominaService();

const getSemana = async (req, res) => {
    try {
        const response = await service.semana(req.query);
        res.json(response);
    } catch (error) {
        manejarError(res, error);
    }
};

const getDetalle = async (req, res) => {
    try {
        const response = await service.detalle(req.params.id, req.query);
        res.json(response);
    } catch (error) {
        manejarError(res, error);
    }
};

const descontar = async (req, res) => {
    try {
        const response = await service.descontar(req.body, req.usuario);
        res.json(response);
    } catch (error) {
        manejarError(res, error);
    }
};

export default { getSemana, getDetalle, descontar };
