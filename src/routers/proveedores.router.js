import express from 'express';
import proveedoresController from '../controllers/proveedores.controller.js';
import { soloAdmin } from '../middlewares/auth.middleware.js';

const router = express.Router();

router.use(soloAdmin);

router
    .get('/', proveedoresController.get)
    .get('/sin-proveedor', proveedoresController.getSinProveedor) // antes de /:id
    .get('/:id', proveedoresController.getById)

    .post('/', proveedoresController.create)
    .put('/:id', proveedoresController.update)
    .delete('/:id', proveedoresController._delete);

export default router;
