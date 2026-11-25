// Modo demostración: la aplicación completa con cuatro semanas de operación
// de ejemplo (ventas, cortes de caja, compras, inventario y nómina) con
// fechas hasta hoy.
//
//   npm run demo                   →   http://localhost:3000
//   DEMO_VACIA=true npm run demo   →   solo el catálogo de ejemplo, sin historial
//
// Sin configuración usa PostgreSQL embebido en memoria (PGlite): no necesita
// PostgreSQL instalado y los datos se pierden al cerrar.
//
// Con DEMO_DATABASE_URL usa esa base de PostgreSQL (por ejemplo una gratuita de
// Neon), para publicar la demo en hostings con poca memoria donde PGlite no
// cabe (Render, ver render.yaml). Si la demo de esa base se generó hoy, se
// reutiliza (arranque rápido); si es de otro día, la base se VACÍA y se vuelve
// a generar. DEMO_REINICIAR=true fuerza a regenerarla. Nunca la apuntes a la
// base de una tienda real.
import crypto from 'node:crypto';
import { conectar, prepararBaseDeDatos, models, consultar } from '../src/libs/sequelize.js';
import { cargarDemostracion } from '../src/libs/demostracion.js';
import { hoyMexico } from '../src/libs/fechas.js';
import { crearApp } from '../src/app.js';

const inicio = Date.now();
const urlDemo = process.env.DEMO_DATABASE_URL;
const vacia = process.env.DEMO_VACIA === 'true';
const USUARIOS = vacia ? ['admin / Admin123!', 'cajero / Cajero123!'] : ['admin / Admin123!', 'cajero / Cajero123!', 'ana / Cajera123!'];

/** ¿La base externa ya tiene la demo de hoy? (entonces no hace falta regenerarla) */
async function demoDeHoy() {
  try {
    const [r] = await consultar(
      `SELECT (max(fecha) AT TIME ZONE 'America/Mexico_City')::date::text AS ultimo,
              (SELECT nombre_tienda FROM configuracion WHERE id = 1) AS tienda
         FROM ventas`,
    );
    return r?.tienda === 'Mini Súper (demostración)' && r.ultimo === hoyMexico();
  } catch {
    return false; // base vacía o de otra versión
  }
}

let reutilizada = false;
if (urlDemo) {
  const sequelize = conectar({ url: urlDemo, pool: { max: 5, min: 0, idle: 10000 } });
  reutilizada = !vacia && process.env.DEMO_REINICIAR !== 'true' && (await demoDeHoy());
  if (!reutilizada) {
    // Base limpia: la demo vuelve a su estado inicial con fechas hasta hoy.
    await sequelize.query('DROP SCHEMA IF EXISTS public CASCADE');
    await sequelize.query('CREATE SCHEMA public');
  }
} else {
  const { conectarEnMemoria } = await import('../test/ayuda-bd.js');
  await conectarEnMemoria();
}

await prepararBaseDeDatos({ datosDePrueba: true });
if (reutilizada) {
  console.log('La demostración de hoy ya estaba en la base: se reutiliza.');
} else {
  await models.Configuracion.update(
    {
      nombre_tienda: 'Mini Súper (demostración)',
      direccion: 'Av. Madero 123, Centro',
      telefono: '443 123 4567',
      mensaje_ticket: '¡Gracias por su compra! Datos de demostración.',
    },
    { where: { id: 1 } },
  );
  if (!vacia) {
    console.log('Generando cuatro semanas de operación de ejemplo…');
    const r = await cargarDemostracion();
    console.log(`  ${r.ventas} ventas, ${r.cortes} cortes de caja y ${r.compras} compras desde el ${r.desde}.`);
  }
}
// En la demo se entra directo con las contraseñas conocidas.
await models.Usuarios.update({ debe_cambiar_contrasena: false }, { where: {} });

// Secreto de sesión: el de SESSION_SECRET (Render lo genera) o uno aleatorio por arranque.
const secreto = process.env.SESSION_SECRET?.length >= 32 ? process.env.SESSION_SECRET : crypto.randomBytes(32).toString('hex');
// Detrás del proxy HTTPS de Render (u otro servicio), para saber la IP real del visitante.
const app = crearApp({ secreto, detrasDeProxy: Boolean(process.env.RENDER || process.env.DETRAS_DE_PROXY) });

const PORT = Number(process.env.PORT) || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Demo lista en ${((Date.now() - inicio) / 1000).toFixed(1)} s → http://localhost:${PORT}`);
  console.log(`Usuarios: ${USUARIOS.join('  ·  ')}`);
  console.log(urlDemo
    ? 'Base externa: se regenera cuando cambia el día (o con DEMO_REINICIAR=true).'
    : 'Los datos están en memoria: se pierden al cerrar.');
});
