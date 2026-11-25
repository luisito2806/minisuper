import bcrypt from 'bcryptjs';
import { models } from '../libs/sequelize.js';
import { ErrorApp } from '../libs/errores.js';
import * as v from '../libs/validar.js';

// Hash de relleno para que un usuario inexistente tarde lo mismo que uno real.
const HASH_FALSO = bcrypt.hashSync('contrasena-falsa-para-tiempo-constante', 10);

// Intentos fallidos por usuario y dirección: 5 y luego 5 minutos de espera.
// Se cuenta por dirección para que alguien desde otra computadora no pueda
// bloquear al administrador en la computadora de la tienda.
const MAX_INTENTOS = 5;
const ESPERA_MS = 5 * 60 * 1000;
const intentos = new Map();

export function validarContrasena(valor) {
    const c = v.texto(valor, 'contraseña', { max: 200, requerido: true });
    if (c.length < 8) throw new ErrorApp(400, 'La contraseña debe tener al menos 8 caracteres.');
    return c;
}

class authService {
    constructor() {}

    /** Verifica credenciales. Mismo mensaje si falla el usuario o la contraseña. */
    async login(data, ip = '') {
        const usuario = v.texto(data.usuario, 'usuario', { max: 50, requerido: true });
        const contrasena = v.texto(data.contrasena, 'contraseña', { max: 200, requerido: true });

        const clave = `${ip}|${usuario.toLowerCase()}`;
        const previo = intentos.get(clave);
        if (previo && Date.now() - previo.ultimo >= ESPERA_MS) intentos.delete(clave);
        else if (previo?.n >= MAX_INTENTOS) {
            throw new ErrorApp(429, 'Demasiados intentos fallidos. Espera 5 minutos e inténtalo de nuevo.');
        }

        const u = await models.Usuarios.scope('conContrasena').findOne({
            where: models.Usuarios.sequelize.where(
                models.Usuarios.sequelize.fn('lower', models.Usuarios.sequelize.col('usuario')),
                usuario.toLowerCase()
            )
        });
        const ok = await bcrypt.compare(contrasena, u?.contrasena_hash ?? HASH_FALSO);
        if (!u || !ok || !u.activo) {
            const i = intentos.get(clave);
            intentos.set(clave, { n: (i?.n ?? 0) + 1, ultimo: Date.now() });
            if (intentos.size > 10000) intentos.delete(intentos.keys().next().value); // no crecer sin límite
            throw new ErrorApp(401, 'Usuario o contraseña incorrectos.');
        }
        intentos.delete(clave);
        return {
            id: u.id, nombre: u.nombre, usuario: u.usuario, rol: u.rol,
            debe_cambiar_contrasena: u.debe_cambiar_contrasena,
        };
    }

    async cambiarContrasena(usuarioId, data) {
        const actual = v.texto(data.actual, 'contraseña actual', { max: 200, requerido: true });
        const nueva = validarContrasena(data.nueva);
        if (nueva === actual) throw new ErrorApp(400, 'La contraseña nueva debe ser distinta de la actual.');
        const u = await models.Usuarios.scope('conContrasena').findByPk(usuarioId);
        if (!(await bcrypt.compare(actual, u.contrasena_hash))) {
            throw new ErrorApp(400, 'La contraseña actual no es correcta.');
        }
        await u.update({ contrasena_hash: await bcrypt.hash(nueva, 10), debe_cambiar_contrasena: false });
        return { ok: true };
    }
}

export default authService;
