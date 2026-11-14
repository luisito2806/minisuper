import { manejarError, ErrorApp } from '../libs/errores.js';
import usuariosService from '../services/usuarios.service.js';

const usuarios = new usuariosService();

/**
 * Exige sesión iniciada. El usuario se vuelve a leer de la base en cada
 * petición: si un administrador lo desactiva o le cambia el rol, el
 * cambio aplica de inmediato.
 */
export const requiereSesion = async (req, res, next) => {
    try {
        const usuarioId = req.session?.usuarioId;
        if (!usuarioId) throw new ErrorApp(401, 'Inicia sesión para continuar.');
        const usuario = await usuarios.findActivo(usuarioId);
        if (!usuario) {
            req.session.destroy(() => {});
            throw new ErrorApp(401, 'Tu sesión ya no es válida. Inicia sesión de nuevo.');
        }
        req.usuario = usuario.toJSON();
        next();
    } catch (error) {
        manejarError(res, error);
    }
};

/** Solo el administrador (se valida en el servidor, no solo en la interfaz). */
export const soloAdmin = (req, res, next) => {
    if (req.usuario?.rol !== 'administrador') {
        return manejarError(res, new ErrorApp(403, 'No tienes permiso para realizar esta acción.'));
    }
    next();
};
