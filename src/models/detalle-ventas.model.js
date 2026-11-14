import { Model, DataTypes } from 'sequelize';

export class DetalleVentas extends Model {
    static config(sequelize) {
        return {
            sequelize,
            tableName: 'detalle_ventas',
            modelName: 'DetalleVentas',
            timestamps: false,
            indexes: [
                // Un producto aparece una sola vez por venta (las cantidades se suman).
                { name: 'detalle_ventas_producto_unico', unique: true, fields: ['venta_id', 'producto_id'] },
                { name: 'detalle_ventas_producto_idx', fields: ['producto_id'] },
            ],
        };
    }
}

export const DetalleVentasSchema = {
    id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: DataTypes.INTEGER,
        field: 'id'
    },
    venta_id: {
        allowNull: false,
        type: DataTypes.INTEGER,
        field: 'venta_id',
        references: { model: 'ventas', key: 'id' },
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE'
    },
    producto_id: {
        allowNull: false,
        type: DataTypes.INTEGER,
        field: 'producto_id',
        references: { model: 'productos', key: 'id' },
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE'
    },
    cantidad: {
        allowNull: false,
        type: DataTypes.DECIMAL(10, 3),
        field: 'cantidad'
    },
    // Precio y tasa se copian del producto al vender: cambiar el precio
    // después no altera ventas pasadas.
    precio_unitario: {
        allowNull: false,
        type: DataTypes.DECIMAL(10, 2),
        field: 'precio_unitario'
    },
    tasa_iva: {
        allowNull: false,
        type: DataTypes.DECIMAL(5, 4),
        field: 'tasa_iva'
    },
    // Costo del producto al momento de vender (para calcular la utilidad).
    // Las ventas registradas antes de este campo lo tienen vacío.
    costo_unitario: {
        allowNull: true,
        type: DataTypes.DECIMAL(10, 2),
        field: 'costo_unitario'
    },
    importe: {
        allowNull: false,
        type: DataTypes.DECIMAL(10, 2),
        field: 'importe'
    }
};
