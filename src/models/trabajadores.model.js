import { Model, DataTypes } from 'sequelize';

/**
 * Trabajadores que compran a crédito. Lo que consumen se les descuenta
 * en la nómina semanal (sábado a viernes). No tienen límite de crédito.
 */
export class Trabajadores extends Model {
    static config(sequelize) {
        return {
            sequelize,
            tableName: 'trabajadores',
            modelName: 'Trabajadores',
            timestamps: true,
            createdAt: 'creado_en',
            updatedAt: 'actualizado_en',
            indexes: [
                { name: 'trabajadores_numero_unico', unique: true, fields: ['numero'] },
                { name: 'trabajadores_nombre_idx', fields: ['nombre'] },
            ],
        };
    }
}

export const TrabajadoresSchema = {
    id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: DataTypes.INTEGER,
        field: 'id'
    },
    // Número de trabajador (nómina). Único.
    numero: {
        allowNull: false,
        type: DataTypes.STRING(20),
        field: 'numero',
        validate: { notEmpty: { msg: 'El número de trabajador es obligatorio.' } }
    },
    nombre: {
        allowNull: false,
        type: DataTypes.STRING(120),
        field: 'nombre',
        validate: { notEmpty: { msg: 'El nombre es obligatorio.' } }
    },
    area: {
        allowNull: true,
        type: DataTypes.STRING(80),
        field: 'area'
    },
    activo: {
        allowNull: false,
        type: DataTypes.BOOLEAN,
        defaultValue: true,
        field: 'activo'
    }
};
