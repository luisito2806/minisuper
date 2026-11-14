import { Model, DataTypes } from 'sequelize';

export class DetalleCompras extends Model {
    static config(sequelize) {
        return {
            sequelize,
            tableName: 'detalle_compras',
            modelName: 'DetalleCompras',
            timestamps: false,
            indexes: [
                { name: 'detalle_compras_producto_unico', unique: true, fields: ['compra_id', 'producto_id'] },
                { name: 'detalle_compras_producto_idx', fields: ['producto_id'] },
            ],
        };
    }
}

export const DetalleComprasSchema = {
    id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: DataTypes.INTEGER,
        field: 'id'
    },
    compra_id: {
        allowNull: false,
        type: DataTypes.INTEGER,
        field: 'compra_id',
        references: { model: 'compras', key: 'id' },
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
    costo_unitario: {
        allowNull: false,
        type: DataTypes.DECIMAL(10, 2),
        field: 'costo_unitario'
    },
    importe: {
        allowNull: false,
        type: DataTypes.DECIMAL(10, 2),
        field: 'importe'
    }
};
