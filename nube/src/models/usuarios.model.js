import { Model, DataTypes } from 'sequelize';

/** Quién entra al panel de la nube. `todas` = ve todas las tiendas. */
export class Usuarios extends Model {
    static config(sequelize) {
        return {
            sequelize,
            tableName: 'usuarios',
            modelName: 'Usuarios',
            timestamps: false,
            indexes: [{ name: 'usuarios_usuario_unico', unique: true, fields: ['usuario'] }],
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
    usuario: {
        allowNull: false,
        type: DataTypes.STRING(50),
        field: 'usuario'
    },
    nombre: {
        allowNull: false,
        type: DataTypes.STRING(100),
        field: 'nombre'
    },
    contrasena_hash: {
        allowNull: false,
        type: DataTypes.STRING(100),
        field: 'contrasena_hash'
    },
    todas: {
        allowNull: false,
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        field: 'todas'
    },
    activo: {
        allowNull: false,
        type: DataTypes.BOOLEAN,
        defaultValue: true,
        field: 'activo'
    }
};
