import express from 'express';
import mantenimientoController from '../controllers/mantenimiento.controller.js';
import { soloAdmin } from '../middlewares/auth.middleware.js';

const router = express.Router();

// Respaldos y depuración de ventas viejas: solo el administrador.
router.use(soloAdmin);

router
    .get('/depuracion', mantenimientoController.getDepuracion)
    .post('/depuracion', mantenimientoController.depurar)
    .get('/respaldos', mantenimientoController.getRespaldos)
    .post('/respaldos', mantenimientoController.crearRespaldo)
    .get('/respaldos/:nombre', mantenimientoController.descargarRespaldo);

export default router;
