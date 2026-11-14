import { Model, DataTypes, fn } from 'sequelize';

export const TIPOS_MOVIMIENTO = [
    'inicial', 'compra', 'venta', 'cancelacion_venta',
    'cancelacion_compra', 'ajuste_entrada', 'ajuste_salida',
    // Resume en un solo renglón los movimientos borrados al depurar
    // ventas de hace más de un año (así la existencia sigue cuadrando).
    'saldo_depurado',
];

/** Historial de cada cambio de existencia: + entrada, - salida. */
export class MovimientosInventario extends Model {
    static config(sequelize) {
        return {
            sequelize,
            tableName: 'movimientos_inventario',
            modelName: 'MovimientosInventario',
            timestamps: false,
            indexes: [
                { name: 'movimientos_inventario_producto_idx', fields: ['producto_id', 'fecha'] },
                { name: 'movimientos_inventario_fecha_idx', fields: ['fecha'] },
                { name: 'movimientos_inventario_venta_idx', fields: ['venta_id'] },
                { name: 'movimientos_inventario_compra_idx', fields: ['compra_id'] },
            ],
        };
    }
}

export const MovimientosInventarioSchema = {
    id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: DataTypes.INTEGER,
        field: 'id'
    },
    producto_id: {
        allowNull: false,
        type: DataTypes.INTEGER,
        field: 'producto_id',
        references: { model: 'productos', key: 'id' },
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE'
    },
    usuario_id: {
        allowNull: false,
        type: DataTypes.INTEGER,
        field: 'usuario_id',
        references: { model: 'usuarios', key: 'id' },
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE'
    },
    fecha: {
        allowNull: false,
        type: DataTypes.DATE,
        defaultValue: fn('now'),
        field: 'fecha'
    },
    tipo: {
        allowNull: false,
        type: DataTypes.STRING(20),
        field: 'tipo'
    },
    cantidad: {
        allowNull: false,
        type: DataTypes.DECIMAL(10, 3),
        field: 'cantidad'
    },
    existencia_anterior: {
        allowNull: false,
        type: DataTypes.DECIMAL(10, 3),
        field: 'existencia_anterior'
    },
    existencia_nueva: {
        allowNull: false,
        type: DataTypes.DECIMAL(10, 3),
        field: 'existencia_nueva'
    },
    venta_id: {
        allowNull: true,
        type: DataTypes.INTEGER,
        field: 'venta_id',
        references: { model: 'ventas', key: 'id' },
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE'
    },
    compra_id: {
        allowNull: true,
        type: DataTypes.INTEGER,
        field: 'compra_id',
        references: { model: 'compras', key: 'id' },
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE'
    },
    motivo: {
        allowNull: true,
        type: DataTypes.STRING(255),
        field: 'motivo'
    }
};
