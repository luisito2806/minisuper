import { manejarError, ErrorNube } from '../libs/errores.js';
import authService from '../services/auth.service.js';
import tiendasService from '../services/tiendas.service.js';
import syncService from '../services/sync.service.js';

const auth = new authService();
const tiendas = new tiendasService();
const sync = new syncService();

/** Exige sesión iniciada en el panel. */
export const requiereSesion = async (req, res, next) => {
    try {
        const usuario = req.session?.usuarioId ? await auth.findActivo(req.session.usuarioId) : null;
        if (!usuario) throw new ErrorNube(401, 'Inicia sesión para continuar.');
        req.usuario = usuario.toJSON();
        next();
    } catch (error) {
        manejarError(res, error);
    }
};

/** Carga la tienda :id en req.tienda si el usuario la puede ver. */
export const accesoTienda = async (req, res, next) => {
    try {
        req.tienda = await tiendas.findOne(req.params.id, req.usuario);
        next();
    } catch (error) {
        manejarError(res, error);
    }
};

/** La tienda manda su clave en "Authorization: Bearer <SYNC_TOKEN>". */
export const claveTienda = async (req, res, next) => {
    try {
        const token = /^Bearer\s+(.+)$/i.exec(req.get('authorization') ?? '')?.[1];
        const tienda = await sync.tiendaPorToken(token);
        if (!tienda) throw new ErrorNube(401, 'Clave de tienda inválida (revisa SYNC_TOKEN en el .env de la tienda).');
        req.tienda = tienda;
        next();
    } catch (error) {
        manejarError(res, error);
    }
};
