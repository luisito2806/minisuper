import excelService from '../services/excel.service.js';
import { manejarError } from '../libs/errores.js';

const service = new excelService();

/** Las descargas escriben directo en la respuesta. */
const descarga = (metodo) => async (req, res) => {
    try {
        await service[metodo](res, req.query);
    } catch (error) {
        if (res.headersSent) return res.end();
        manejarError(res, error);
    }
};

const importarProductos = async (req, res) => {
    try {
        res.json(await service.importarProductos(req.body, req.usuario));
    } catch (error) {
        manejarError(res, error);
    }
};

const importarTrabajadores = async (req, res) => {
    try {
        res.json(await service.importarTrabajadores(req.body));
    } catch (error) {
        manejarError(res, error);
    }
};

const leerConteo = async (req, res) => {
    try {
        res.json(await service.leerConteo(req.body));
    } catch (error) {
        manejarError(res, error);
    }
};

export default {
    reporte: descarga('reporte'),
    ventas: descarga('ventas'),
    productos: descarga('productos'),
    trabajadores: descarga('trabajadores'),
    conteo: descarga('hojaConteo'),
    nomina: descarga('nomina'),
    sugerida: descarga('sugerida'),
    importarProductos,
    importarTrabajadores,
    leerConteo,
};
