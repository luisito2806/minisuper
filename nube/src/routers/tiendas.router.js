import express from 'express';
import tiendasController from '../controllers/tiendas.controller.js';
import { accesoTienda } from '../middlewares/auth.middleware.js';

const router = express.Router();

// Solo consulta (y cargar paquetes de USB). La sesión se exige en routers/index.js.
router
    .get('/', tiendasController.get)
    .get('/:id/resumen', accesoTienda, tiendasController.getResumen)
    .get('/:id/ventas', accesoTienda, tiendasController.getVentas)
    .get('/:id/ventas/:venta', accesoTienda, tiendasController.getVenta)
    .get('/:id/inventario', accesoTienda, tiendasController.getInventario)
    .get('/:id/nomina', accesoTienda, tiendasController.getNomina)
    .get('/:id/cajas', accesoTienda, tiendasController.getCajas)
    .post('/:id/paquete', accesoTienda, tiendasController.cargarPaquete);

export default router;
