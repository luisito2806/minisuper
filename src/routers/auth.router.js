import express from 'express';
import authController from '../controllers/auth.controller.js';
import { requiereSesionConCambioPendiente } from '../middlewares/auth.middleware.js';

const router = express.Router();

router
    .post('/login', authController.login)
    .post('/logout', authController.logout)
    .get('/yo', requiereSesionConCambioPendiente, authController.yo)
    .post('/cambiar-contrasena', requiereSesionConCambioPendiente, authController.cambiarContrasena);

export default router;
