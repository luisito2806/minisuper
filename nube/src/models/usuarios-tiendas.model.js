import { Model, DataTypes } from 'sequelize';

/** Qué tiendas puede ver cada usuario (muchos a muchos). */
export class UsuariosTiendas extends Model {
    static config(sequelize) {
        return {
            sequelize,
            tableName: 'usuarios_tiendas',
            modelName: 'UsuariosTiendas',
            timestamps: false,
        };
    }
}

export const UsuariosTiendasSchema = {
    usuario_id: {
        allowNull: false,
        primaryKey: true,
        type: DataTypes.INTEGER,
        field: 'usuario_id',
        references: { model: 'usuarios', key: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE'
    },
    tienda_id: {
        allowNull: false,
        primaryKey: true,
        type: DataTypes.INTEGER,
        field: 'tienda_id',
        references: { model: 'tiendas', key: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE'
    }
};
