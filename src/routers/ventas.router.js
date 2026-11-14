import express from 'express';
import ventasController from '../controllers/ventas.controller.js';
import { soloAdmin } from '../middlewares/auth.middleware.js';

const router = express.Router();

router
    .get('/', ventasController.get)
    .get('/:id', ventasController.getById)
    .post('/', ventasController.create)
    .post('/:id/cancelar', soloAdmin, ventasController.cancelar);

export default router;
