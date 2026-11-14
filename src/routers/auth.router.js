import express from 'express';
import authController from '../controllers/auth.controller.js';
import { requiereSesion } from '../middlewares/auth.middleware.js';

const router = express.Router();

router
    .post('/login', authController.login)
    .post('/logout', authController.logout)
    .get('/yo', requiereSesion, authController.yo)
    .post('/cambiar-contrasena', requiereSesion, authController.cambiarContrasena);

export default router;
