import express from 'express';
import authRouter from './auth.router.js';
import tiendasRouter from './tiendas.router.js';
import syncRouter from './sync.router.js';
import { requiereSesion } from '../middlewares/auth.middleware.js';

function routesApi(app) {
    const router = express.Router();
    app.use('/api', router);

    // Sin sesión
    router.use('/sync', syncRouter);   // la tienda usa su clave
    router.use('/auth', authRouter);

    // Con sesión
    router.use('/tiendas', requiereSesion, tiendasRouter);

    router.use((req, res) => {
        res.status(404).send({ success: false, message: 'Ruta no encontrada.' });
    });
}

export default routesApi;
