import express from 'express';
import nominaController from '../controllers/nomina.controller.js';
import { soloAdmin } from '../middlewares/auth.middleware.js';

const router = express.Router();

router.use(soloAdmin);

router
    .get('/', nominaController.getSemana)
    .get('/trabajador/:id', nominaController.getDetalle)
    .post('/descontar', nominaController.descontar);

export default router;
