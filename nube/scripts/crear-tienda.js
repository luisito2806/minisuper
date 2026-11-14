// Da de alta una tienda y muestra su clave de sincronización (SYNC_TOKEN).
//   npm run crear-tienda -- "Mini Súper Don Luis"
// La clave se muestra UNA sola vez: cópiala al .env de la computadora de la tienda.
import crypto from 'node:crypto';
import dotenv from 'dotenv';
import { models, obtenerSequelize, prepararBase } from '../src/libs/sequelize.js';
import { hashToken } from '../src/services/sync.service.js';

dotenv.config({ quiet: true });

const nombre = process.argv.slice(2).join(' ').trim();
if (!nombre) {
    console.error('Uso: npm run crear-tienda -- "Nombre de la tienda"');
    process.exit(1);
}

await prepararBase();
const token = crypto.randomBytes(32).toString('hex');
const tienda = await models.Tiendas.create({ nombre, token_hash: hashToken(token) });
console.log(`\nTienda "${nombre}" creada (id ${tienda.id}).`);
console.log('\nAgrega estas líneas al archivo .env de la computadora de la tienda:\n');
console.log(`SYNC_URL=${process.env.URL_PUBLICA ?? 'https://TU-NUBE.onrender.com'}`);
console.log(`SYNC_TOKEN=${token}`);
console.log('\nGuarda la clave: no se vuelve a mostrar. Si la pierdes, crea la tienda de nuevo.\n');
await obtenerSequelize().close();
