import express from 'express';
import productosController from '../controllers/productos.controller.js';
import { soloAdmin } from '../middlewares/auth.middleware.js';

const router = express.Router();

// Todos consultan (el cajero sin ver el costo); solo el administrador modifica.
router
    .get('/', productosController.get)
    .get('/codigo/:codigo', productosController.getByCodigo)
    .put('/precios', soloAdmin, productosController.actualizarPrecios) // antes de /:id
    .get('/:id', productosController.getById)

    .post('/', soloAdmin, productosController.create)
    .put('/:id', soloAdmin, productosController.update)
    .delete('/:id', soloAdmin, productosController._delete);

export default router;
