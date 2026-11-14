import { Model, DataTypes, fn } from 'sequelize';

export class SesionesCaja extends Model {
    static config(sequelize) {
        return {
            sequelize,
            tableName: 'sesiones_caja',
            modelName: 'SesionesCaja',
            timestamps: false,
            indexes: [
                // Cada usuario puede tener una sola caja abierta.
                {
                    name: 'sesiones_caja_una_abierta',
                    unique: true,
                    fields: ['usuario_id'],
                    where: { estado: 'abierta' }
                },
                { name: 'sesiones_caja_abierta_en_idx', fields: ['abierta_en'] },
            ],
        };
    }
}

export const SesionesCajaSchema = {
    id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: DataTypes.INTEGER,
        field: 'id'
    },
    usuario_id: {
        allowNull: false,
        type: DataTypes.INTEGER,
        field: 'usuario_id',
        references: { model: 'usuarios', key: 'id' },
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE'
    },
    abierta_en: {
        allowNull: false,
        type: DataTypes.DATE,
        defaultValue: fn('now'),
        field: 'abierta_en'
    },
    fondo_inicial: {
        allowNull: false,
        type: DataTypes.DECIMAL(10, 2),
        field: 'fondo_inicial'
    },
    estado: {
        allowNull: false,
        type: DataTypes.STRING(10),
        defaultValue: 'abierta',
        field: 'estado'
    },
    cerrada_en: {
        allowNull: true,
        type: DataTypes.DATE,
        field: 'cerrada_en'
    },
    cerrada_por: {
        allowNull: true,
        type: DataTypes.INTEGER,
        field: 'cerrada_por',
        references: { model: 'usuarios', key: 'id' },
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE'
    },
    efectivo_esperado: {
        allowNull: true,
        type: DataTypes.DECIMAL(10, 2),
        field: 'efectivo_esperado'
    },
    monto_contado: {
        allowNull: true,
        type: DataTypes.DECIMAL(10, 2),
        field: 'monto_contado'
    },
    diferencia: {
        allowNull: true,
        type: DataTypes.DECIMAL(10, 2),
        field: 'diferencia'
    },
    notas_cierre: {
        allowNull: true,
        type: DataTypes.STRING(255),
        field: 'notas_cierre'
    }
};
