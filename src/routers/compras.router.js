import express from 'express';
import comprasController from '../controllers/compras.controller.js';
import { soloAdmin } from '../middlewares/auth.middleware.js';

const router = express.Router();

router.use(soloAdmin);

router
    .get('/', comprasController.get)
    .get('/:id', comprasController.getById)
    .post('/', comprasController.create)
    .post('/:id/cancelar', comprasController.cancelar);

export default router;
