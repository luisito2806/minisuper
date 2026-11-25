import path from 'node:path';
import dotenv from 'dotenv';
import { crearApp } from './src/app.js';
import { obtenerSequelize, prepararBaseDeDatos } from './src/libs/sequelize.js';
import { habilitarRespaldos, iniciarRespaldoAutomatico, listarRespaldos, respaldar, respaldoDelDia } from './src/libs/respaldos.js';
import { iniciarSincronizacionAutomatica } from './src/services/sincronizacion.service.js';

// Instalado con MiniSuper-Setup.exe, el .env está en la carpeta de datos
// (MINISUPER_DATOS); en desarrollo, en la carpeta del proyecto.
const DATOS = process.env.MINISUPER_DATOS;
dotenv.config({ path: DATOS ? path.join(DATOS, '.env') : '.env', quiet: true });

const secreto = process.env.SESSION_SECRET;
if (!secreto || secreto.length < 32) {
  console.error('Falta SESSION_SECRET en .env (mínimo 32 caracteres). Copia .env.example como .env.');
  process.exit(1);
}

const sequelize = obtenerSequelize();

// Respaldos con pg_dump: manuales siempre; automáticos (uno al día) salvo
// que RESPALDO_AUTOMATICO=false en .env.
habilitarRespaldos();
const automatico = process.env.RESPALDO_AUTOMATICO !== 'false';

/**
 * Antes de cambiar las tablas de una base con datos (versión nueva del
 * programa) se hace un respaldo. Si no se puede, el servidor no arranca y
 * la base queda intacta, salvo ACTUALIZAR_SIN_RESPALDO=true en .env.
 */
async function respaldoAntesDeActualizar() {
  const reciente = listarRespaldos()[0];
  if (reciente && Date.now() - reciente.fecha.getTime() < 10 * 60 * 1000) return; // ya hay uno de hace minutos
  console.log('Los modelos cambiaron: respaldo antes de actualizar las tablas…');
  try {
    const r = await respaldar();
    console.log(`Respaldo creado: respaldos/${r.nombre}`);
  } catch (error) {
    if (process.env.ACTUALIZAR_SIN_RESPALDO === 'true') {
      console.error(`${error.message} Se continúa sin respaldo (ACTUALIZAR_SIN_RESPALDO=true).`);
      return;
    }
    throw new Error(`${error.message} Las tablas NO se actualizaron. Arregla el respaldo (PG_DUMP en .env) ` +
      'o, bajo tu riesgo, pon ACTUALIZAR_SIN_RESPALDO=true en .env.');
  }
}

try {
  await sequelize.authenticate();
  console.log('Connection has been established successfully.');
} catch (error) {
  console.error('Unable to connect to the database:', error.message);
  console.error('Revisa DB_HOST, DB_PORT, DB_NAME, DB_USER y DB_PASSWORD en .env, y que la base exista en pgAdmin.');
  process.exit(1);
}

try {
  // El respaldo del día se hace ANTES de tocar las tablas: si algo sale
  // mal, se puede restaurar desde pgAdmin.
  if (automatico) await respaldoDelDia();
  // Crea las 14 tablas o las actualiza si cambiaron los modelos, más las
  // restricciones, los disparadores y los datos iniciales.
  await prepararBaseDeDatos({
    datosDePrueba: process.env.DATOS_DE_PRUEBA === 'true',
    antesDeActualizar: respaldoAntesDeActualizar,
  });
} catch (error) {
  console.error('No se pudo preparar la base de datos:', error.message);
  process.exit(1);
}

if (automatico) iniciarRespaldoAutomatico();

// Publicada en Render (variable RENDER, la pone el servicio): detrás de su
// proxy HTTPS y escuchando en todas las interfaces, como pide Render.
const publicada = Boolean(process.env.RENDER);
const app = crearApp({ secreto, detrasDeProxy: publicada || process.env.DETRAS_DE_PROXY === 'true' });

// Por defecto solo se puede entrar desde esta computadora. Para entrar desde
// otra (Tailscale o la red local) pon HOST=0.0.0.0 en .env.
const HOST = process.env.HOST || (publicada ? '0.0.0.0' : '127.0.0.1');
const PORT = Number(process.env.PORT) || 3000;
app.listen(PORT, HOST, () => {
  console.log(`Server is running on port ${PORT} → http://localhost:${PORT}`);
  if (HOST !== '127.0.0.1' && HOST !== 'localhost') console.log(`Acepta conexiones de otras computadoras (HOST=${HOST}).`);
  // Envío a la nube cada minuto, solo si SYNC_URL y SYNC_TOKEN están en .env.
  if (iniciarSincronizacionAutomatica()) console.log(`Sincronización con la nube activa (${process.env.SYNC_URL}).`);
}).on('error', (error) => {
  console.error(error.code === 'EADDRINUSE'
    ? `El puerto ${PORT} ya está en uso: probablemente el Mini Súper ya está abierto.`
    : `No se pudo abrir el servidor: ${error.message}`);
  process.exit(1);
});
