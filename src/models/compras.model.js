import { Model, DataTypes, literal, fn } from 'sequelize';

export class Compras extends Model {
    static config(sequelize) {
        return {
            sequelize,
            tableName: 'compras',
            modelName: 'Compras',
            timestamps: false,
            indexes: [
                { name: 'compras_folio_unico', unique: true, fields: ['folio'] },
                { name: 'compras_fecha_idx', fields: ['fecha'] },
                { name: 'compras_proveedor_idx', fields: ['proveedor_id'] },
            ],
        };
    }
}

export const ComprasSchema = {
    id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: DataTypes.INTEGER,
        field: 'id'
    },
    folio: {
        allowNull: false,
        type: DataTypes.STRING(20),
        defaultValue: literal("'C-' || lpad(nextval('folio_compras_seq')::text, 6, '0')"),
        field: 'folio'
    },
    proveedor_id: {
        allowNull: false,
        type: DataTypes.INTEGER,
        field: 'proveedor_id',
        references: { model: 'proveedores', key: 'id' },
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
    total: {
        allowNull: false,
        type: DataTypes.DECIMAL(10, 2),
        field: 'total'
    },
    estado: {
        allowNull: false,
        type: DataTypes.STRING(15),
        defaultValue: 'confirmada',
        field: 'estado'
    },
    notas: {
        allowNull: true,
        type: DataTypes.STRING(255),
        field: 'notas'
    },
    cancelada_por: {
        allowNull: true,
        type: DataTypes.INTEGER,
        field: 'cancelada_por',
        references: { model: 'usuarios', key: 'id' },
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE'
    },
    cancelada_en: {
        allowNull: true,
        type: DataTypes.DATE,
        field: 'cancelada_en'
    },
    motivo_cancelacion: {
        allowNull: true,
        type: DataTypes.STRING(255),
        field: 'motivo_cancelacion'
    }
};
