import { Tiendas, TiendasSchema } from './tiendas.model.js';
import { Usuarios, UsuariosSchema } from './usuarios.model.js';
import { UsuariosTiendas, UsuariosTiendasSchema } from './usuarios-tiendas.model.js';
import { Ventas, VentasSchema } from './ventas.model.js';
import { Productos, ProductosSchema } from './productos.model.js';
import { Trabajadores, TrabajadoresSchema } from './trabajadores.model.js';
import { Cajas, CajasSchema } from './cajas.model.js';

function setupModels(sequelize) {
    Tiendas.init(TiendasSchema, Tiendas.config(sequelize));
    Usuarios.init(UsuariosSchema, Usuarios.config(sequelize));
    UsuariosTiendas.init(UsuariosTiendasSchema, UsuariosTiendas.config(sequelize));
    Ventas.init(VentasSchema, Ventas.config(sequelize));
    Productos.init(ProductosSchema, Productos.config(sequelize));
    Trabajadores.init(TrabajadoresSchema, Trabajadores.config(sequelize));
    Cajas.init(CajasSchema, Cajas.config(sequelize));

    // ---------- Relaciones ----------
    const fk = (foreignKey) => ({ foreignKey, onDelete: 'CASCADE', onUpdate: 'CASCADE' });

    // Qué tiendas ve cada usuario.
    Usuarios.belongsToMany(Tiendas, { through: UsuariosTiendas, foreignKey: 'usuario_id', otherKey: 'tienda_id', as: 'tiendas' });
    Tiendas.belongsToMany(Usuarios, { through: UsuariosTiendas, foreignKey: 'tienda_id', otherKey: 'usuario_id', as: 'usuarios' });

    for (const [modelo, nombre] of [[Ventas, 'ventas'], [Productos, 'productos'], [Trabajadores, 'trabajadores'], [Cajas, 'cajas']]) {
        Tiendas.hasMany(modelo, { ...fk('tienda_id'), as: nombre });
        modelo.belongsTo(Tiendas, { ...fk('tienda_id'), as: 'tienda' });
    }
}

export default setupModels;
