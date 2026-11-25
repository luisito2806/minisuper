import { manejarError, ErrorApp } from '../libs/errores.js';
import usuariosService from '../services/usuarios.service.js';

const usuarios = new usuariosService();

/**
 * Exige sesión iniciada. El usuario se vuelve a leer de la base en cada
 * petición: si un administrador lo desactiva o le cambia el rol, el
 * cambio aplica de inmediato.
 *
 * Si el usuario tiene que cambiar su contraseña (la inicial o una que le
 * puso el administrador), solo puede usar las rutas que lo permiten
 * explícitamente (ver su información y cambiar la contraseña).
 */
const verificarSesion = ({ permitirCambioPendiente }) => async (req, res, next) => {
    try {
        const usuarioId = req.session?.usuarioId;
        if (!usuarioId) throw new ErrorApp(401, 'Inicia sesión para continuar.');
        const usuario = await usuarios.findActivo(usuarioId);
        if (!usuario) {
            req.session.destroy(() => {});
            throw new ErrorApp(401, 'Tu sesión ya no es válida. Inicia sesión de nuevo.');
        }
        req.usuario = usuario.toJSON();
        if (req.usuario.debe_cambiar_contrasena && !permitirCambioPendiente) {
            throw new ErrorApp(403, 'Cambia tu contraseña en "Mi cuenta" antes de continuar.');
        }
        next();
    } catch (error) {
        manejarError(res, error);
    }
};

export const requiereSesion = verificarSesion({ permitirCambioPendiente: false });

/** Igual que requiereSesion, pero deja pasar a quien debe cambiar su contraseña. */
export const requiereSesionConCambioPendiente = verificarSesion({ permitirCambioPendiente: true });

/** Solo el administrador (se valida en el servidor, no solo en la interfaz). */
export const soloAdmin = (req, res, next) => {
    if (req.usuario?.rol !== 'administrador') {
        return manejarError(res, new ErrorApp(403, 'No tienes permiso para realizar esta acción.'));
    }
    next();
};
