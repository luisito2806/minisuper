// Carga la demostración (cuatro semanas de ventas, cortes, compras, inventario
// y nómina) en una base PostgreSQL REAL y vacía, por ejemplo para mostrarla
// en pgAdmin. Usa la conexión del .env (DB_HOST, DB_NAME, …).
//
//   1. En pgAdmin crea una base vacía, por ejemplo "minisuper_demo".
//   2. PowerShell:  $env:DB_NAME='minisuper_demo'; npm run cargar-demo
//      Bash:        DB_NAME=minisuper_demo npm run cargar-demo
//   3. Arranca con esa base:  $env:DB_NAME='minisuper_demo'; npm start
//
// Se niega a cargar en una base que ya tenga ventas: nunca mezcla datos de
// demostración con los de una tienda real.
import dotenv from 'dotenv';
import { obtenerSequelize, prepararBaseDeDatos, models } from '../src/libs/sequelize.js';
import { cargarDemostracion } from '../src/libs/demostracion.js';

dotenv.config({ quiet: true });

const db = obtenerSequelize();
try {
  await db.authenticate();
  console.log(`Base: ${db.config.database} en ${db.config.host}:${db.config.port}`);
  await prepararBaseDeDatos({ datosDePrueba: true });
  if ((await models.Ventas.count()) > 0) {
    console.error('Esta base ya tiene ventas: la demostración solo se carga en una base nueva y vacía.');
    process.exitCode = 1;
  } else {
    console.log('Generando cuatro semanas de operación de ejemplo…');
    const r = await cargarDemostracion();
    console.log(`Listo: ${r.ventas} ventas, ${r.cortes} cortes de caja y ${r.compras} compras desde el ${r.desde}.`);
    console.log(`Usuarios: ${r.usuarios.join('  ·  ')}`);
  }
} catch (error) {
  console.error('No se pudo cargar la demostración:', error.message);
  process.exitCode = 1;
} finally {
  await db.close();
}
