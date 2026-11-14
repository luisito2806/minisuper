import { Model, DataTypes } from 'sequelize';

/** Cada tienda que manda datos (la de papá, la ferretería, …). */
export class Tiendas extends Model {
    static config(sequelize) {
        return {
            sequelize,
            tableName: 'tiendas',
            modelName: 'Tiendas',
            timestamps: true,
            createdAt: 'creada_en',
            updatedAt: false,
            indexes: [
                { name: 'tiendas_token_unico', unique: true, fields: ['token_hash'] },
                { name: 'tiendas_uuid_unico', unique: true, fields: ['uuid_local'] },
            ],
        };
    }
}

export const TiendasSchema = {
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
        field: 'nombre'
    },
    // Huella (sha256) de la clave de sincronización: la clave no se guarda.
    token_hash: {
        allowNull: false,
        type: DataTypes.CHAR(64),
        field: 'token_hash'
    },
    // Identificador de la base de datos de la tienda (se fija con el primer envío).
    uuid_local: {
        allowNull: true,
        type: DataTypes.UUID,
        field: 'uuid_local'
    },
    direccion: {
        allowNull: true,
        type: DataTypes.STRING(255),
        field: 'direccion'
    },
    ultima_sync: {
        allowNull: true,
        type: DataTypes.DATE,
        field: 'ultima_sync'
    }
};
