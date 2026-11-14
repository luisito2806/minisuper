import express from 'express';
import configuracionController from '../controllers/configuracion.controller.js';
import { soloAdmin } from '../middlewares/auth.middleware.js';

const router = express.Router();

// Todos la leen (la pantalla de venta la necesita); solo el administrador la cambia.
router
    .get('/', configuracionController.get)
    .put('/', soloAdmin, configuracionController.update);

export default router;
