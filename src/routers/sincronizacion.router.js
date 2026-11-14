import express from 'express';
import sincronizacionController from '../controllers/sincronizacion.controller.js';
import { soloAdmin } from '../middlewares/auth.middleware.js';

const router = express.Router();

// Nube, USB y red: solo el administrador.
router.use(soloAdmin);

router
    .get('/', sincronizacionController.getEstado)
    .post('/ahora', sincronizacionController.sincronizar)
    .get('/paquete', sincronizacionController.getPaquete)
    .post('/reenviar', sincronizacionController.reenviarTodo)
    .get('/usb', sincronizacionController.getUsb)
    .post('/usb', sincronizacionController.copiarUsb)
    .get('/red', sincronizacionController.getRed);

export default router;
