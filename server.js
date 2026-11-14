import dotenv from 'dotenv';
import { crearApp } from './src/app.js';
import { obtenerSequelize, prepararBaseDeDatos } from './src/libs/sequelize.js';
import { habilitarRespaldos, iniciarRespaldoAutomatico, respaldoDelDia } from './src/libs/respaldos.js';
import { iniciarSincronizacionAutomatica } from './src/services/sincronizacion.service.js';

dotenv.config({ quiet: true });

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

try {
  await sequelize.authenticate();
  console.log('Connection has been established successfully.');
  // El respaldo del día se hace ANTES de actualizar las tablas: si un
  // cambio de modelos sale mal, se puede restaurar desde pgAdmin.
  if (automatico) await respaldoDelDia();
  // Crea o actualiza las 13 tablas (sync alter), las restricciones y los datos iniciales.
  await prepararBaseDeDatos({ datosDePrueba: process.env.DATOS_DE_PRUEBA === 'true' });
} catch (error) {
  console.error('Unable to connect to the database:', error.message);
  console.error('Revisa DB_HOST, DB_PORT, DB_NAME, DB_USER y DB_PASSWORD en .env, y que la base exista en pgAdmin.');
  process.exit(1);
}

if (automatico) iniciarRespaldoAutomatico();


const app = crearApp({ secreto });

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT} → http://localhost:${PORT}`);
  // Envío a la nube cada minuto, solo si SYNC_URL y SYNC_TOKEN están en .env.
  if (iniciarSincronizacionAutomatica()) console.log(`Sincronización con la nube activa (${process.env.SYNC_URL}).`);
});
