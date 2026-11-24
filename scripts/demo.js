// Modo demostración: la aplicación completa con datos de prueba.
//
//   npm run demo   →   http://localhost:3000   (admin / Admin123!)
//
// Sin configuración usa PostgreSQL embebido en memoria (PGlite): no necesita
// PostgreSQL instalado y los datos se pierden al cerrar.
//
// Con DEMO_DATABASE_URL usa esa base de PostgreSQL (por ejemplo una gratuita de
// Neon) y la VACÍA en cada arranque antes de cargar los datos de prueba. Sirve
// para publicar la demo en hostings con poca memoria, donde PGlite no cabe.
// Nunca la apuntes a la base de una tienda real.
import { conectar, prepararBaseDeDatos, models } from '../src/libs/sequelize.js';
import { crearApp } from '../src/app.js';

const urlDemo = process.env.DEMO_DATABASE_URL;

if (urlDemo) {
  const sequelize = conectar({ url: urlDemo, pool: { max: 5, min: 0, idle: 10000 } });
  // Base limpia en cada arranque: la demo siempre vuelve a su estado inicial.
  await sequelize.query('DROP SCHEMA IF EXISTS public CASCADE');
  await sequelize.query('CREATE SCHEMA public');
} else {
  const { conectarEnMemoria } = await import('../test/ayuda-bd.js');
  await conectarEnMemoria();
}

await prepararBaseDeDatos({ datosDePrueba: true });
await models.Configuracion.update(
  { nombre_tienda: 'Mini Súper (demo)', direccion: 'Demostración: los datos se reinician solos' },
  { where: { id: 1 } },
);

const secreto = process.env.SESSION_SECRET?.length >= 32
  ? process.env.SESSION_SECRET
  : 'demo-solo-local-no-usar-en-produccion-0123456789';
const app = crearApp({ secreto });

const PORT = Number(process.env.PORT) || 3000;
app.listen(PORT, () => {
  console.log(`Demo en http://localhost:${PORT}  ·  admin / Admin123!  ·  cajero / Cajero123!`);
  console.log(urlDemo ? 'Base externa: se vacía y se vuelve a llenar en cada arranque.' : 'Los datos se pierden al cerrar (Ctrl+C).');
});
