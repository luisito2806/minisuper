import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import session from 'express-session';
import routesApi from './routers/index.js';
import { manejarError } from './libs/errores.js';

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Construye la aplicación de la nube (la conexión a la base ya debe existir). */
export function crearApp({ secreto }) {
    const app = express();
    app.disable('x-powered-by');
    app.set('trust proxy', 1); // detrás del proxy HTTPS del servicio en la nube

    app.use((_req, res, next) => {
        res.set({
            'X-Content-Type-Options': 'nosniff',
            'X-Frame-Options': 'DENY',
            'Referrer-Policy': 'same-origin',
            'Content-Security-Policy':
                "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; frame-ancestors 'none'",
        });
        next();
    });

    app.use('/fuentes', express.static(path.join(RAIZ, 'node_modules', '@fontsource-variable', 'nunito-sans', 'files'), { maxAge: '30d' }));
    app.use(express.static(path.join(RAIZ, 'public')));
    app.use(session({
        name: 'nube.sid',
        secret: secreto,
        resave: false,
        saveUninitialized: false,
        cookie: { httpOnly: true, sameSite: 'strict', secure: 'auto', maxAge: 12 * 60 * 60 * 1000 },
    }));

    // Los paquetes de la tienda pueden ser grandes; el resto de peticiones, no.
    app.use('/api/sync', express.json({ limit: '25mb' }));
    app.use('/api/tiendas/:id/paquete', express.json({ limit: '25mb' }));
    app.use(express.json({ limit: '50kb' }));
    app.use('/api', (req, res, next) => {
        if (req.method === 'POST' && !req.is('application/json')) {
            return res.status(415).send({ success: false, message: 'Las peticiones deben enviarse como JSON.' });
        }
        next();
    });

    routesApi(app);

    app.use((err, _req, res, _next) => manejarError(res, err));
    return app;
}
