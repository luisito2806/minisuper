import bcrypt from 'bcryptjs';
import { models } from '../libs/sequelize.js';
import { ErrorNube } from '../libs/errores.js';

// Intentos fallidos: 5 por usuario y luego 5 minutos de espera.
const intentos = new Map();

class authService {
    constructor() {}

    async login(data) {
        const usuario = String(data?.usuario ?? '').trim().toLowerCase();
        const contrasena = String(data?.contrasena ?? '');
        const i = intentos.get(usuario);
        if (i && i.n >= 5 && Date.now() - i.ultimo < 5 * 60 * 1000) {
            throw new ErrorNube(429, 'Demasiados intentos. Espera 5 minutos.');
        }
        const u = await models.Usuarios.findOne({ where: { usuario, activo: true } });
        if (!u || !(await bcrypt.compare(contrasena, u.contrasena_hash))) {
            intentos.set(usuario, { n: (i?.n ?? 0) + 1, ultimo: Date.now() });
            throw new ErrorNube(401, 'Usuario o contraseña incorrectos.');
        }
        intentos.delete(usuario);
        return u;
    }

    /** Usuario activo de la sesión (sin la contraseña), o null. */
    findActivo(id) {
        return models.Usuarios.findOne({
            where: { id, activo: true },
            attributes: ['id', 'usuario', 'nombre', 'todas'],
        });
    }
}

export default authService;
