import express from 'express';
import cajaController from '../controllers/caja.controller.js';

const router = express.Router();

// Cada usuario maneja su caja; el servicio valida quién puede ver o cerrar cuál.
router
    .get('/', cajaController.get)
    .get('/actual', cajaController.getActual)
    .get('/:id', cajaController.getById)
    .post('/abrir', cajaController.create)
    .post('/movimientos', cajaController.createMovimiento)
    .post('/:id/cerrar', cajaController.cerrar);

export default router;
