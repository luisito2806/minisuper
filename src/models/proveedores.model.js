import { Model, DataTypes } from 'sequelize';

export class Proveedores extends Model {
    static config(sequelize) {
        return {
            sequelize,
            tableName: 'proveedores',
            modelName: 'Proveedores',
            timestamps: false
        };
    }
}

export const ProveedoresSchema = {
    id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: DataTypes.INTEGER,
        field: 'id'
    },
    nombre: {
        allowNull: false,
        type: DataTypes.STRING(120),
        field: 'nombre',
        validate: { notEmpty: { msg: 'El nombre es obligatorio.' } }
    },
    telefono: {
        allowNull: true,
        type: DataTypes.STRING(20),
        field: 'telefono'
    },
    correo: {
        allowNull: true,
        type: DataTypes.STRING(120),
        field: 'correo',
        validate: { isEmail: { msg: 'El correo no tiene un formato válido.' } }
    },
    direccion: {
        allowNull: true,
        type: DataTypes.STRING(255),
        field: 'direccion'
    },
    activo: {
        allowNull: false,
        type: DataTypes.BOOLEAN,
        defaultValue: true,
        field: 'activo'
    }
};
