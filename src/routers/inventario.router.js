import express from 'express';
import inventarioController from '../controllers/inventario.controller.js';
import { soloAdmin } from '../middlewares/auth.middleware.js';

const router = express.Router();

router.use(soloAdmin);

router
    .get('/movimientos', inventarioController.get)
    .post('/ajustes', inventarioController.create)
    .post('/conteo', inventarioController.conteo)
    .get('/sugerida', inventarioController.getSugerida);

export default router;
