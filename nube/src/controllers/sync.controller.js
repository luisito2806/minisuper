import syncService from '../services/sync.service.js';
import { manejarError } from '../libs/errores.js';

const service = new syncService();

/** La tienda manda sus cambios (req.tienda viene de su clave). */
const create = async (req, res) => {
    try {
        res.json({ success: true, recibido: await service.guardar(req.tienda, req.body) });
    } catch (error) {
        manejarError(res, error);
    }
};

export default { create };
