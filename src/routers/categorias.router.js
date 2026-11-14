import express from 'express';
import categoriasController from '../controllers/categorias.controller.js';
import { soloAdmin } from '../middlewares/auth.middleware.js';

const router = express.Router();

// Todos las consultan; solo el administrador las modifica.
router
    .get('/', categoriasController.get)
    .get('/:id', categoriasController.getById)
    .post('/', soloAdmin, categoriasController.create)
    .put('/:id', soloAdmin, categoriasController.update)
    .delete('/:id', soloAdmin, categoriasController._delete);

export default router;
