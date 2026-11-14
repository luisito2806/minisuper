// Modo demostración: la aplicación completa con PostgreSQL embebido en
// memoria (PGlite). No necesita PostgreSQL instalado; los datos se
// pierden al cerrar.
//
//   npm run demo   →   http://localhost:3000   (admin / Admin123!)
import { conectarEnMemoria } from '../test/ayuda-bd.js';
import { prepararBaseDeDatos, models } from '../src/libs/sequelize.js';
import { crearApp } from '../src/app.js';

await conectarEnMemoria();
await prepararBaseDeDatos({ datosDePrueba: true });
await models.Configuracion.update(
  { nombre_tienda: 'Mini Súper (demo)', direccion: 'Datos en memoria: se borran al cerrar' },
  { where: { id: 1 } },
);

const app = crearApp({ secreto: 'demo-solo-local-no-usar-en-produccion-0123456789' });

const PORT = Number(process.env.PORT) || 3000;
app.listen(PORT, () => {
  console.log(`Demo en http://localhost:${PORT}  ·  admin / Admin123!  ·  cajero / Cajero123!`);
  console.log('Los datos se pierden al cerrar (Ctrl+C).');
});
