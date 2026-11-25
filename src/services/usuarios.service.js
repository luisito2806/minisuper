import bcrypt from 'bcryptjs';
import { models, obtenerSequelize } from '../libs/sequelize.js';
import { ErrorApp, noEncontrado } from '../libs/errores.js';
import * as v from '../libs/validar.js';
import { ROLES } from '../models/usuarios.model.js';
import { validarContrasena } from './auth.service.js';

class usuariosService {
    constructor() {}

    async create(data) {
        const db = obtenerSequelize();
        const usuario = v.texto(data.usuario, 'usuario', { max: 50, requerido: true });
        const existe = await models.Usuarios.count({
            where: db.where(db.fn('lower', db.col('usuario')), usuario.toLowerCase())
        });
        if (existe) throw new ErrorApp(409, 'Ya existe un usuario con ese nombre de usuario.');
        const res = await models.Usuarios.create({
            nombre: v.texto(data.nombre, 'nombre', { max: 100, requerido: true }),
            usuario,
            rol: v.opcion(data.rol, 'rol', ROLES),
            contrasena_hash: await bcrypt.hash(validarContrasena(data.contrasena), 10),
            // La contraseña la eligió el administrador: el usuario pone la suya al entrar.
            debe_cambiar_contrasena: true,
        });
        return this.findOne(res.id);
    }

    async find() {
        const res = await models.Usuarios.findAll({ order: [['nombre', 'ASC']] });
        return res;
    }

    async findOne(id) {
        const res = await models.Usuarios.findByPk(v.id(id));
        return res;
    }

    /** Sesión válida: el usuario existe y está activo. */
    async findActivo(id) {
        const res = await models.Usuarios.findOne({ where: { id, activo: true } });
        return res;
    }

    async update(id, data, actual) {
        const model = await this.findOne(id);
        if (!model) throw noEncontrado('El usuario');
        const rol = v.opcion(data.rol, 'rol', ROLES);
        const activo = v.booleano(data.activo, 'activo', true);
        if (String(model.id) === String(actual.id) && (rol !== 'administrador' || !activo)) {
            throw new ErrorApp(400, 'No puedes quitarte el rol de administrador ni desactivar tu propio usuario.');
        }
        const cambios = { nombre: v.texto(data.nombre, 'nombre', { max: 100, requerido: true }), rol, activo };
        if (data.contrasena) {
            cambios.contrasena_hash = await bcrypt.hash(validarContrasena(data.contrasena), 10);
            cambios.debe_cambiar_contrasena = String(model.id) !== String(actual.id);
        }
        await model.update(cambios);
        return this.findOne(id);
    }

    /** No se borra (tiene ventas y movimientos asociados): se desactiva. */
    async delete(id, actual) {
        const model = await this.findOne(id);
        if (!model) throw noEncontrado('El usuario');
        if (String(model.id) === String(actual.id)) throw new ErrorApp(400, 'No puedes desactivar tu propio usuario.');
        await model.update({ activo: false });
        return model;
    }
}

export default usuariosService;
