import { Model, DataTypes } from 'sequelize';

export const UNIDADES = ['pieza', 'kg', 'litro'];

export class Productos extends Model {
    static config(sequelize) {
        return {
            sequelize,
            tableName: 'productos',
            modelName: 'Productos',
            timestamps: true,
            createdAt: 'creado_en',
            updatedAt: 'actualizado_en',
            indexes: [
                { name: 'productos_codigo_unico', unique: true, fields: ['codigo'] },
                { name: 'productos_nombre_idx', fields: ['nombre'] },
                { name: 'productos_categoria_idx', fields: ['categoria_id'] },
                { name: 'productos_proveedor_idx', fields: ['proveedor_id'] },
            ],
        };
    }
}

// Dinero en DECIMAL (nunca DOUBLE/FLOAT): evita errores de redondeo.
// Sequelize devuelve los DECIMAL como texto ("32.00").
export const ProductosSchema = {
    id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: DataTypes.INTEGER,
        field: 'id'
    },
    codigo: {
        allowNull: false,
        type: DataTypes.STRING(50),
        field: 'codigo',
        validate: { notEmpty: { msg: 'El código es obligatorio.' } }
    },
    nombre: {
        allowNull: false,
        type: DataTypes.STRING(120),
        field: 'nombre',
        validate: { notEmpty: { msg: 'El nombre es obligatorio.' } }
    },
    descripcion: {
        allowNull: true,
        type: DataTypes.STRING(255),
        field: 'descripcion'
    },
    categoria_id: {
        allowNull: false,
        type: DataTypes.INTEGER,
        field: 'categoria_id',
        references: { model: 'categorias', key: 'id' },
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE'
    },
    // A quién se le compra normalmente (Coca-Cola, Bimbo, Sabritas…).
    // Vacío = se compra a mano (central de abastos, tienda, etc.).
    proveedor_id: {
        allowNull: true,
        type: DataTypes.INTEGER,
        field: 'proveedor_id',
        references: { model: 'proveedores', key: 'id' },
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE'
    },

    precio_venta: {
        allowNull: false,
        type: DataTypes.DECIMAL(10, 2),
        field: 'precio_venta'
    },
    costo: {
        allowNull: false,
        type: DataTypes.DECIMAL(10, 2),
        field: 'costo'
    },
    tasa_iva: {
        allowNull: false,
        type: DataTypes.DECIMAL(5, 4),
        defaultValue: '0.16',
        field: 'tasa_iva'
    },
    // Puede quedar negativa solo si la configuración permite sobreventa.
    existencia: {
        allowNull: false,
        type: DataTypes.DECIMAL(10, 3),
        defaultValue: '0',
        field: 'existencia'
    },
    stock_minimo: {
        allowNull: false,
        type: DataTypes.DECIMAL(10, 3),
        defaultValue: '5',
        field: 'stock_minimo'
    },
    unidad: {
        allowNull: false,
        type: DataTypes.STRING(10),
        defaultValue: 'pieza',
        field: 'unidad',
        validate: { isIn: { args: [UNIDADES], msg: 'La unidad debe ser pieza, kg o litro.' } }
    },
    activo: {
        allowNull: false,
        type: DataTypes.BOOLEAN,
        defaultValue: true,
        field: 'activo'
    }
};
