import express from 'express';
import excelController from '../controllers/excel.controller.js';
import { soloAdmin } from '../middlewares/auth.middleware.js';

const router = express.Router();

// Exportar e importar Excel: solo el administrador.
router.use(soloAdmin);

router
    .get('/reporte', excelController.reporte)
    .get('/ventas', excelController.ventas)
    .get('/productos', excelController.productos)
    .get('/conteo', excelController.conteo)
    .get('/nomina', excelController.nomina)
    .get('/sugerida', excelController.sugerida)
    .post('/productos', excelController.importarProductos)
    .get('/trabajadores', excelController.trabajadores)
    .post('/trabajadores', excelController.importarTrabajadores)
    .post('/conteo', excelController.leerConteo);

export default router;
