import express from 'express';
import trabajadoresController from '../controllers/trabajadores.controller.js';
import { soloAdmin } from '../middlewares/auth.middleware.js';

const router = express.Router();

// Consultar: cualquiera con sesión (el cajero los necesita para vender a
// crédito). Dar de alta, editar y dar de baja: solo el administrador.
router
    .get('/', trabajadoresController.get)
    .get('/:id', soloAdmin, trabajadoresController.getById)
    .post('/', soloAdmin, trabajadoresController.create)
    .put('/:id', soloAdmin, trabajadoresController.update)
    .delete('/:id', soloAdmin, trabajadoresController._delete);

export default router;
