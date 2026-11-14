// Crea (o actualiza) un usuario del panel de la nube.
//   npm run crear-usuario -- papa "Luis Vázquez" "Contraseña-Segura-1" 1
//   npm run crear-usuario -- yo "Mi nombre" "Otra-Contraseña-2" todas
// El último dato son los ids de tienda que puede ver, separados por coma
// (1,2), o "todas".
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import { models, obtenerSequelize, prepararBase } from '../src/libs/sequelize.js';

dotenv.config({ quiet: true });

const [usuarioTexto, nombre, contrasena, tiendas = 'todas'] = process.argv.slice(2);
if (!usuarioTexto || !nombre || !contrasena) {
    console.error('Uso: npm run crear-usuario -- usuario "Nombre" "contraseña" [ids de tienda separados por coma | todas]');
    process.exit(1);
}
if (contrasena.length < 10) {
    console.error('La contraseña debe tener al menos 10 caracteres (este panel está en internet).');
    process.exit(1);
}
const todas = tiendas === 'todas';
const ids = todas ? [] : tiendas.split(',').map((x) => Number(x.trim()));
if (ids.some((x) => !Number.isInteger(x) || x <= 0)) {
    console.error('Los ids de tienda deben ser números (ej. 1 o 1,2) o "todas".');
    process.exit(1);
}

await prepararBase();
const usuario = usuarioTexto.toLowerCase();
const datos = { usuario, nombre, contrasena_hash: await bcrypt.hash(contrasena, 10), todas, activo: true };
const existente = await models.Usuarios.findOne({ where: { usuario } });
const u = existente ? await existente.update(datos) : await models.Usuarios.create(datos);
await u.setTiendas(ids); // relación muchos a muchos (usuarios_tiendas)
console.log(`Usuario "${usuario}" listo. Puede ver: ${todas ? 'todas las tiendas' : `tienda(s) ${ids.join(', ')}`}.`);
await obtenerSequelize().close();
