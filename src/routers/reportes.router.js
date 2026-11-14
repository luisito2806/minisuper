import express from 'express';
import reportesController from '../controllers/reportes.controller.js';
import { soloAdmin } from '../middlewares/auth.middleware.js';

const router = express.Router();

router.use(soloAdmin);

router
    .get('/ventas', reportesController.getVentas)
    .get('/inventario', reportesController.getInventario);

export default router;
