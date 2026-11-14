import { Model, DataTypes } from 'sequelize';

export class Categorias extends Model {
    static config(sequelize) {
        return {
            sequelize,
            tableName: 'categorias',
            modelName: 'Categorias',
            timestamps: false,
            indexes: [{ name: 'categorias_nombre_unico', unique: true, fields: ['nombre'] }],
        };
    }
}

export const CategoriasSchema = {
    id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: DataTypes.INTEGER,
        field: 'id'
    },
    nombre: {
        allowNull: false,
        type: DataTypes.STRING(60),
        field: 'nombre',
        validate: { notEmpty: { msg: 'El nombre es obligatorio.' } }
    },
    descripcion: {
        allowNull: true,
        type: DataTypes.STRING(200),
        field: 'descripcion'
    },
    activo: {
        allowNull: false,
        type: DataTypes.BOOLEAN,
        defaultValue: true,
        field: 'activo'
    }
};
