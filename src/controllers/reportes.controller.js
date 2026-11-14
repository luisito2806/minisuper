import reportesService from '../services/reportes.service.js';
import { manejarError } from '../libs/errores.js';

const service = new reportesService();

const getVentas = async (req, res) => {
    try {
        const response = await service.ventas(req.query);
        res.json(response);
    } catch (error) {
        manejarError(res, error);
    }
};

const getInventario = async (req, res) => {
    try {
        const response = await service.inventario();
        res.json(response);
    } catch (error) {
        manejarError(res, error);
    }
};

export default { getVentas, getInventario };
