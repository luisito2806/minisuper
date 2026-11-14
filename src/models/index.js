import { Usuarios, UsuariosSchema } from './usuarios.model.js';
import { Categorias, CategoriasSchema } from './categorias.model.js';
import { Proveedores, ProveedoresSchema } from './proveedores.model.js';
import { Productos, ProductosSchema } from './productos.model.js';
import { Ventas, VentasSchema } from './ventas.model.js';
import { DetalleVentas, DetalleVentasSchema } from './detalle-ventas.model.js';
import { Compras, ComprasSchema } from './compras.model.js';
import { DetalleCompras, DetalleComprasSchema } from './detalle-compras.model.js';
import { Configuracion, ConfiguracionSchema } from './configuracion.model.js';
import { SesionesCaja, SesionesCajaSchema } from './sesiones-caja.model.js';
import { MovimientosCaja, MovimientosCajaSchema } from './movimientos-caja.model.js';
import { MovimientosInventario, MovimientosInventarioSchema } from './movimientos-inventario.model.js';
import { Trabajadores, TrabajadoresSchema } from './trabajadores.model.js';
import { SyncPendientes, SyncPendientesSchema } from './sync-pendientes.model.js';

function setupModels(sequelize) {
    Usuarios.init(UsuariosSchema, Usuarios.config(sequelize));
    Categorias.init(CategoriasSchema, Categorias.config(sequelize));
    Proveedores.init(ProveedoresSchema, Proveedores.config(sequelize));
    Productos.init(ProductosSchema, Productos.config(sequelize));
    Configuracion.init(ConfiguracionSchema, Configuracion.config(sequelize));
    SesionesCaja.init(SesionesCajaSchema, SesionesCaja.config(sequelize));
    MovimientosCaja.init(MovimientosCajaSchema, MovimientosCaja.config(sequelize));
    Trabajadores.init(TrabajadoresSchema, Trabajadores.config(sequelize));
    SyncPendientes.init(SyncPendientesSchema, SyncPendientes.config(sequelize));
    Ventas.init(VentasSchema, Ventas.config(sequelize));
    DetalleVentas.init(DetalleVentasSchema, DetalleVentas.config(sequelize));
    Compras.init(ComprasSchema, Compras.config(sequelize));
    DetalleCompras.init(DetalleComprasSchema, DetalleCompras.config(sequelize));
    MovimientosInventario.init(MovimientosInventarioSchema, MovimientosInventario.config(sequelize));

    // ---------- Relaciones (para consultar con include) ----------
    const fk = (foreignKey) => ({ foreignKey, onDelete: 'RESTRICT', onUpdate: 'CASCADE' });

    Categorias.hasMany(Productos, { ...fk('categoria_id'), as: 'productos' });
    Productos.belongsTo(Categorias, { ...fk('categoria_id'), as: 'categoria' });
    Proveedores.hasMany(Productos, { ...fk('proveedor_id'), as: 'productos' });
    Productos.belongsTo(Proveedores, { ...fk('proveedor_id'), as: 'proveedor' });


    Usuarios.hasMany(Ventas, { ...fk('usuario_id'), as: 'ventas' });
    Ventas.belongsTo(Usuarios, { ...fk('usuario_id'), as: 'cajero' });
    Ventas.belongsTo(Usuarios, { ...fk('cancelada_por'), as: 'canceladaPor' });
    Ventas.belongsTo(SesionesCaja, { ...fk('sesion_caja_id'), as: 'sesionCaja' });
    Ventas.belongsTo(Trabajadores, { ...fk('trabajador_id'), as: 'trabajador' });
    Ventas.belongsTo(Usuarios, { ...fk('descontado_por'), as: 'descontadoPor' });
    Trabajadores.hasMany(Ventas, { ...fk('trabajador_id'), as: 'ventas' });
    Ventas.hasMany(DetalleVentas, { ...fk('venta_id'), as: 'partidas' });
    DetalleVentas.belongsTo(Ventas, { ...fk('venta_id'), as: 'venta' });
    DetalleVentas.belongsTo(Productos, { ...fk('producto_id'), as: 'producto' });

    Proveedores.hasMany(Compras, { ...fk('proveedor_id'), as: 'compras' });
    Compras.belongsTo(Proveedores, { ...fk('proveedor_id'), as: 'proveedor' });
    Compras.belongsTo(Usuarios, { ...fk('usuario_id'), as: 'registro' });
    Compras.belongsTo(Usuarios, { ...fk('cancelada_por'), as: 'canceladaPor' });
    Compras.hasMany(DetalleCompras, { ...fk('compra_id'), as: 'partidas' });
    DetalleCompras.belongsTo(Compras, { ...fk('compra_id'), as: 'compra' });
    DetalleCompras.belongsTo(Productos, { ...fk('producto_id'), as: 'producto' });

    SesionesCaja.belongsTo(Usuarios, { ...fk('usuario_id'), as: 'usuario' });
    SesionesCaja.belongsTo(Usuarios, { ...fk('cerrada_por'), as: 'cerradaPor' });
    SesionesCaja.hasMany(MovimientosCaja, { ...fk('sesion_caja_id'), as: 'movimientos' });
    SesionesCaja.hasMany(Ventas, { ...fk('sesion_caja_id'), as: 'ventas' });
    MovimientosCaja.belongsTo(SesionesCaja, { ...fk('sesion_caja_id'), as: 'sesion' });
    MovimientosCaja.belongsTo(Usuarios, { ...fk('usuario_id'), as: 'usuario' });

    MovimientosInventario.belongsTo(Productos, { ...fk('producto_id'), as: 'producto' });
    MovimientosInventario.belongsTo(Usuarios, { ...fk('usuario_id'), as: 'usuario' });
    MovimientosInventario.belongsTo(Ventas, { ...fk('venta_id'), as: 'venta' });
    MovimientosInventario.belongsTo(Compras, { ...fk('compra_id'), as: 'compra' });

    Configuracion.belongsTo(Usuarios, { ...fk('actualizado_por'), as: 'actualizadoPor' });
}

export default setupModels;
