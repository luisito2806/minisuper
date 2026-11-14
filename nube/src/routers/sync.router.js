import express from 'express';
import syncController from '../controllers/sync.controller.js';
import { claveTienda } from '../middlewares/auth.middleware.js';

const router = express.Router();

// La tienda se identifica con su clave, no con sesión.
router.post('/', claveTienda, syncController.create);

export default router;
