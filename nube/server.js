import dotenv from 'dotenv';
import { crearApp } from './src/app.js';
import { obtenerSequelize, prepararBase } from './src/libs/sequelize.js';
import { asegurarInicial } from './src/libs/inicial.js';

dotenv.config({ quiet: true });

const secreto = process.env.SESSION_SECRET;
if (!secreto || secreto.length < 32) {
    console.error('Falta SESSION_SECRET (mínimo 32 caracteres).');
    process.exit(1);
}
if (!process.env.DATABASE_URL) {
    console.error('Falta DATABASE_URL (la dirección de la base PostgreSQL de la nube).');
    process.exit(1);
}

try {
    await obtenerSequelize().authenticate();
    console.log('Connection has been established successfully.');
    // Crea o actualiza las 7 tablas (sync alter, como en biblioteca).
    await prepararBase();
    // Usuario del panel y tienda de demostración desde variables (Render).
    await asegurarInicial();
} catch (error) {
    console.error('Unable to connect to the database:', error.message);
    process.exit(1);
}

const PORT = Number(process.env.PORT) || 4000;
crearApp({ secreto }).listen(PORT, () => {
    console.log(`Nube del Mini Súper en el puerto ${PORT}`);
});
