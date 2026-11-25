import syncService from '../services/sync.service.js';
import { manejarError, ErrorNube } from '../libs/errores.js';
import { esTiendaDemo } from '../libs/inicial.js';

const service = new syncService();

/** La tienda manda sus cambios (req.tienda viene de su clave). */
const create = async (req, res) => {
    try {
        res.json({ success: true, recibido: await service.guardar(req.tienda, req.body) });
    } catch (error) {
        manejarError(res, error);
    }
};

/**
 * La tienda de DEMOSTRACIÓN pide borrar lo que la nube tiene de ella (lo hace
 * cada vez que regenera sus datos). Cualquier otra tienda recibe 403: una
 * tienda real nunca puede borrar su historial desde aquí.
 */
const reiniciarDemo = async (req, res) => {
    try {
        if (!esTiendaDemo(req.tienda)) throw new ErrorNube(403, 'Solo la tienda de demostración puede reiniciar sus datos.');
        res.json({ success: true, borrados: await service.reiniciar(req.tienda) });
    } catch (error) {
        manejarError(res, error);
    }
};

export default { create, reiniciarDemo };
