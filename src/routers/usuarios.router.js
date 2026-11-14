import express from 'express';
import usuariosController from '../controllers/usuarios.controller.js';
import { soloAdmin } from '../middlewares/auth.middleware.js';

const router = express.Router();

router.use(soloAdmin);

router
    .get('/', usuariosController.get)
    .get('/:id', usuariosController.getById)
    .post('/', usuariosController.create)
    .put('/:id', usuariosController.update)
    .delete('/:id', usuariosController._delete);

export default router;
