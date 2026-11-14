import bcrypt from 'bcryptjs';
import { models } from '../libs/sequelize.js';
import { ErrorApp } from '../libs/errores.js';
import * as v from '../libs/validar.js';

// Hash de relleno para que un usuario inexistente tarde lo mismo que uno real.
const HASH_FALSO = bcrypt.hashSync('contrasena-falsa-para-tiempo-constante', 10);

export function validarContrasena(valor) {
    const c = v.texto(valor, 'contraseña', { max: 200, requerido: true });
    if (c.length < 8) throw new ErrorApp(400, 'La contraseña debe tener al menos 8 caracteres.');
    return c;
}

class authService {
    constructor() {}

    /** Verifica credenciales. Mismo mensaje si falla el usuario o la contraseña. */
    async login(data) {
        const usuario = v.texto(data.usuario, 'usuario', { max: 50, requerido: true });
        const contrasena = v.texto(data.contrasena, 'contraseña', { max: 200, requerido: true });
        const u = await models.Usuarios.scope('conContrasena').findOne({
            where: models.Usuarios.sequelize.where(
                models.Usuarios.sequelize.fn('lower', models.Usuarios.sequelize.col('usuario')),
                usuario.toLowerCase()
            )
        });
        const ok = await bcrypt.compare(contrasena, u?.contrasena_hash ?? HASH_FALSO);
        if (!u || !ok || !u.activo) throw new ErrorApp(401, 'Usuario o contraseña incorrectos.');
        return { id: u.id, nombre: u.nombre, usuario: u.usuario, rol: u.rol };
    }

    async cambiarContrasena(usuarioId, data) {
        const actual = v.texto(data.actual, 'contraseña actual', { max: 200, requerido: true });
        const nueva = validarContrasena(data.nueva);
        const u = await models.Usuarios.scope('conContrasena').findByPk(usuarioId);
        if (!(await bcrypt.compare(actual, u.contrasena_hash))) {
            throw new ErrorApp(400, 'La contraseña actual no es correcta.');
        }
        await u.update({ contrasena_hash: await bcrypt.hash(nueva, 10) });
        return { ok: true };
    }
}

export default authService;
