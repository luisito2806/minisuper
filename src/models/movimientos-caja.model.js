import { Model, DataTypes, fn } from 'sequelize';

/** Ingresos y retiros extraordinarios de efectivo (las ventas se leen de "ventas"). */
export class MovimientosCaja extends Model {
    static config(sequelize) {
        return {
            sequelize,
            tableName: 'movimientos_caja',
            modelName: 'MovimientosCaja',
            timestamps: false,
            indexes: [{ name: 'movimientos_caja_sesion_idx', fields: ['sesion_caja_id'] }],
        };
    }
}

export const MovimientosCajaSchema = {
    id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: DataTypes.INTEGER,
        field: 'id'
    },
    sesion_caja_id: {
        allowNull: false,
        type: DataTypes.INTEGER,
        field: 'sesion_caja_id',
        references: { model: 'sesiones_caja', key: 'id' },
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
        type: DataTypes.STRING(10),
        field: 'tipo'
    },
    monto: {
        allowNull: false,
        type: DataTypes.DECIMAL(10, 2),
        field: 'monto'
    },
    motivo: {
        allowNull: false,
        type: DataTypes.STRING(255),
        field: 'motivo'
    }
};
