import { Model, DataTypes } from 'sequelize';

export const ROLES = ['administrador', 'cajero'];

export class Usuarios extends Model {
    static config(sequelize) {
        return {
            sequelize,
            tableName: 'usuarios',
            modelName: 'Usuarios',
            timestamps: true,
            createdAt: 'creado_en',
            updatedAt: false,
            indexes: [{ name: 'usuarios_usuario_unico', unique: true, fields: ['usuario'] }],
            defaultScope: { attributes: { exclude: ['contrasena_hash'] } },
            scopes: { conContrasena: { attributes: { include: ['contrasena_hash'] } } },
        };
    }
}

export const UsuariosSchema = {
    id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: DataTypes.INTEGER,
        field: 'id'
    },
    nombre: {
        allowNull: false,
        type: DataTypes.STRING(100),
        field: 'nombre',
        validate: { notEmpty: { msg: 'El nombre es obligatorio.' } }
    },
    usuario: {
        allowNull: false,
        type: DataTypes.STRING(50),
        field: 'usuario',
        validate: {
            is: {
                args: /^[A-Za-z0-9._-]{3,50}$/,
                msg: 'El usuario debe tener de 3 a 50 caracteres: letras, números, punto, guion o guion bajo.'
            }
        }
    },
    contrasena_hash: {
        allowNull: false,
        type: DataTypes.STRING(255),
        field: 'contrasena_hash'
    },
    rol: {
        allowNull: false,
        type: DataTypes.STRING(20),
        field: 'rol',
        validate: { isIn: { args: [ROLES], msg: 'El rol debe ser administrador o cajero.' } }
    },
    activo: {
        allowNull: false,
        type: DataTypes.BOOLEAN,
        defaultValue: true,
        field: 'activo'
    },
    // true = al entrar debe cambiar su contraseña antes de usar el sistema
    // (usuarios iniciales y contraseñas puestas por el administrador).
    debe_cambiar_contrasena: {
        allowNull: false,
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        field: 'debe_cambiar_contrasena'
    }
};
