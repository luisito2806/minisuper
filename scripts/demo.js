// Modo demostración: la aplicación completa con PostgreSQL embebido en
// memoria (PGlite) y cuatro semanas de operación de ejemplo (ventas, cortes
// de caja, compras, inventario y nómina). No necesita PostgreSQL instalado;
// los datos se pierden al cerrar y se vuelven a generar al arrancar.
//
//   npm run demo                   →   http://localhost:3000
//   DEMO_VACIA=true npm run demo   →   solo el catálogo de ejemplo, sin historial
//
// Sirve también para publicarla (Render u otro): escucha en 0.0.0.0 y en el
// puerto de la variable PORT.
import crypto from 'node:crypto';
import { conectarEnMemoria } from '../test/ayuda-bd.js';
import { prepararBaseDeDatos, models } from '../src/libs/sequelize.js';
import { cargarDemostracion } from '../src/libs/demostracion.js';
import { crearApp } from '../src/app.js';

const inicio = Date.now();
await conectarEnMemoria();
await prepararBaseDeDatos({ datosDePrueba: true });
await models.Configuracion.update(
  {
    nombre_tienda: 'Mini Súper (demostración)',
    direccion: 'Av. Madero 123, Centro',
    telefono: '443 123 4567',
    mensaje_ticket: '¡Gracias por su compra! Datos de demostración.',
  },
  { where: { id: 1 } },
);

let usuarios = ['admin / Admin123!', 'cajero / Cajero123!'];
if (process.env.DEMO_VACIA !== 'true') {
  console.log('Generando cuatro semanas de operación de ejemplo…');
  const r = await cargarDemostracion();
  usuarios = r.usuarios;
  console.log(`  ${r.ventas} ventas, ${r.cortes} cortes de caja y ${r.compras} compras desde el ${r.desde}.`);
}
// En el demo se entra directo con las contraseñas conocidas.
await models.Usuarios.update({ debe_cambiar_contrasena: false }, { where: {} });

// Secreto de sesión: el de SESSION_SECRET o uno aleatorio por arranque.
const secreto = process.env.SESSION_SECRET?.length >= 32 ? process.env.SESSION_SECRET : crypto.randomBytes(32).toString('hex');
// Detrás del proxy HTTPS de Render (u otro servicio), para saber la IP real del visitante.
const app = crearApp({ secreto, detrasDeProxy: Boolean(process.env.RENDER || process.env.DETRAS_DE_PROXY) });

const PORT = Number(process.env.PORT) || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Demo lista en ${((Date.now() - inicio) / 1000).toFixed(1)} s → http://localhost:${PORT}`);
  console.log(`Usuarios: ${usuarios.join('  ·  ')}`);
  console.log('Los datos están en memoria: se pierden al cerrar.');
});
