// Si la computadora de la tienda se reinstaló desde cero (base nueva), la
// nube rechaza sus datos para no mezclarlos con los anteriores. Esto la
// "desvincula" para que acepte la base nueva.
//   npm run desvincular-tienda -- 1            (solo desvincula)
//   npm run desvincular-tienda -- 1 --borrar   (además borra lo que tenía)
import dotenv from 'dotenv';
import { models, obtenerSequelize } from '../src/libs/sequelize.js';

dotenv.config({ quiet: true });

const id = Number(process.argv[2]);
if (!Number.isInteger(id) || id <= 0) {
    console.error('Uso: npm run desvincular-tienda -- <id de la tienda> [--borrar]');
    process.exit(1);
}
const tienda = await models.Tiendas.findByPk(id);
if (!tienda) {
    console.log('No existe esa tienda.');
} else {
    const borrar = process.argv.includes('--borrar');
    if (borrar) {
        for (const modelo of [models.Ventas, models.Productos, models.Trabajadores, models.Cajas]) {
            await modelo.destroy({ where: { tienda_id: id } });
        }
    }
    await tienda.update({ uuid_local: null });
    console.log(`Tienda "${tienda.nombre}" desvinculada${borrar ? ' y sus datos borrados' : ''}.`);
}
await obtenerSequelize().close();
