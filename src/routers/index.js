import express from 'express';
import authRouter from './auth.router.js';
import usuariosRouter from './usuarios.router.js';
import categoriasRouter from './categorias.router.js';
import proveedoresRouter from './proveedores.router.js';
import productosRouter from './productos.router.js';
import ventasRouter from './ventas.router.js';
import comprasRouter from './compras.router.js';
import cajaRouter from './caja.router.js';
import inventarioRouter from './inventario.router.js';
import reportesRouter from './reportes.router.js';
import configuracionRouter from './configuracion.router.js';
import trabajadoresRouter from './trabajadores.router.js';
import nominaRouter from './nomina.router.js';
import mantenimientoRouter from './mantenimiento.router.js';
import excelRouter from './excel.router.js';
import sincronizacionRouter from './sincronizacion.router.js';
import configuracionController from '../controllers/configuracion.controller.js';
import { requiereSesion } from '../middlewares/auth.middleware.js';

function routesApi(app) {
    const router = express.Router();
    app.use('/api', router);

    // Sin sesión
    router.get('/config', configuracionController.getPublica);
    router.use('/auth', authRouter);

    // Con sesión (los permisos por rol están en cada router)
    router.use('/usuarios', requiereSesion, usuariosRouter);
    router.use('/categorias', requiereSesion, categoriasRouter);
    router.use('/proveedores', requiereSesion, proveedoresRouter);
    router.use('/productos', requiereSesion, productosRouter);
    router.use('/ventas', requiereSesion, ventasRouter);
    router.use('/compras', requiereSesion, comprasRouter);
    router.use('/caja', requiereSesion, cajaRouter);
    router.use('/inventario', requiereSesion, inventarioRouter);
    router.use('/reportes', requiereSesion, reportesRouter);
    router.use('/configuracion', requiereSesion, configuracionRouter);
    router.use('/trabajadores', requiereSesion, trabajadoresRouter);
    router.use('/nomina', requiereSesion, nominaRouter);
    router.use('/mantenimiento', requiereSesion, mantenimientoRouter);
    router.use('/excel', requiereSesion, excelRouter);
    router.use('/sincronizacion', requiereSesion, sincronizacionRouter);

    router.use((req, res) => {
        res.status(404).send({ success: false, message: 'Ruta no encontrada.' });
    });
}

export default routesApi;
