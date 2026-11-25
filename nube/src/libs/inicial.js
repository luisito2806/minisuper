/**
 * Alta automática al arrancar, a partir de variables de entorno. Sirve para
 * publicar el panel sin correr los scripts crear-usuario y crear-tienda desde
 * otra computadora (por ejemplo en Render, ver render.yaml).
 *
 *   NUBE_ADMIN_USUARIO + NUBE_ADMIN_CONTRASENA
 *       Usuario del panel que ve todas las tiendas. Se crea si no existe y su
 *       contraseña se actualiza a la de la variable en cada arranque.
 *   NUBE_DEMO_TOKEN
 *       Clave de la TIENDA DE DEMOSTRACIÓN (la demo de Render la usa como su
 *       SYNC_TOKEN). Si no hay una tienda con esa clave, se crea. Solo esa
 *       tienda puede pedir que se borren sus datos (/api/sync/reiniciar-demo).
 *
 * Las tiendas reales se siguen dando de alta con npm run crear-tienda.
 */
import bcrypt from 'bcryptjs';
import { models } from './sequelize.js';
import { hashToken } from '../services/sync.service.js';

export const NOMBRE_TIENDA_DEMO = 'Mini Súper (demostración)';

/** ¿Esta tienda es la de demostración? (su clave es NUBE_DEMO_TOKEN) */
export function esTiendaDemo(tienda) {
    const token = process.env.NUBE_DEMO_TOKEN;
    return Boolean(token && tienda?.token_hash === hashToken(token));
}

export async function asegurarInicial() {
    const usuario = process.env.NUBE_ADMIN_USUARIO?.trim().toLowerCase();
    const contrasena = process.env.NUBE_ADMIN_CONTRASENA ?? '';
    if (usuario) {
        if (contrasena.length < 10) {
            console.error('NUBE_ADMIN_CONTRASENA debe tener al menos 10 caracteres (el panel está en internet). No se creó el usuario.');
        } else {
            const datos = { usuario, nombre: 'Administrador', contrasena_hash: await bcrypt.hash(contrasena, 10), todas: true, activo: true };
            const existente = await models.Usuarios.findOne({ where: { usuario } });
            if (existente) await existente.update({ contrasena_hash: datos.contrasena_hash, todas: true, activo: true });
            else await models.Usuarios.create(datos);
            console.log(`Usuario del panel "${usuario}" listo (ve todas las tiendas).`);
        }
    }

    const token = process.env.NUBE_DEMO_TOKEN;
    if (token) {
        const hash = hashToken(token);
        if (!(await models.Tiendas.findOne({ where: { token_hash: hash } }))) {
            const t = await models.Tiendas.create({ nombre: NOMBRE_TIENDA_DEMO, token_hash: hash });
            console.log(`Tienda de demostración creada (id ${t.id}).`);
        }
    }
}
