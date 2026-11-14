import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import session from 'express-session';
import routesApi from './routers/index.js';
import { manejadorErrores } from './libs/errores.js';

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLICA = path.join(RAIZ, 'public');

/** Construye la aplicación Express (la conexión a la base ya debe existir). */
export function crearApp({ secreto }) {
  const app = express();
  app.disable('x-powered-by');

  // Cabeceras de seguridad básicas.
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

  // Interfaz: archivos estáticos, la aritmética de dinero compartida y la fuente local.
  app.get('/js/dinero.js', (_req, res) => res.sendFile(path.join(RAIZ, 'src', 'libs', 'dinero.js')));
  app.use('/fuentes', express.static(path.join(RAIZ, 'node_modules', '@fontsource-variable', 'nunito-sans', 'files'), { maxAge: '30d' }));
  app.use(express.static(PUBLICA, { index: 'login.html' }));

  app.use(session({
    name: 'minisuper.sid',
    secret: secreto,
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: 'strict', maxAge: 12 * 60 * 60 * 1000 },
  }));
  // Los archivos de Excel llegan en base64 dentro del JSON: límite mayor solo ahí.
  app.use('/api/excel', express.json({ limit: '15mb' }));
  app.use(express.json({ limit: '200kb' }));

  // Las peticiones que modifican datos deben ser JSON: junto con la cookie
  // SameSite=strict, evita que otro sitio envíe formularios a la API.
  app.use('/api', (req, res, next) => {
    if (['POST', 'PUT', 'PATCH'].includes(req.method) && !req.is('application/json')) {
      return res.status(415).send({ success: false, message: 'Las peticiones deben enviarse como JSON.' });
    }
    next();
  });

  routesApi(app);

  app.use(manejadorErrores);
  return app;
}
