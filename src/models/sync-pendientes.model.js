import { Model, DataTypes } from 'sequelize';

/**
 * Cola de cambios por enviar a la nube. La llenan disparadores (triggers)
 * de PostgreSQL cada vez que se crea o cambia una venta, un producto, un
 * trabajador o una caja; se vacía cuando la nube confirma que los recibió.
 * Un registro por entidad: si cambia otra vez antes de enviarse, solo sube
 * la versión (así nunca se pierde un cambio hecho mientras se enviaba).
 */
export class SyncPendientes extends Model {
    static config(sequelize) {
        return {
            sequelize,
            tableName: 'sync_pendientes',
            modelName: 'SyncPendientes',
            timestamps: false,
            indexes: [
                { name: 'sync_pendientes_entidad_unica', unique: true, fields: ['entidad', 'entidad_id'] },
            ],
        };
    }
}

export const SyncPendientesSchema = {
    id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: DataTypes.BIGINT,
        field: 'id'
    },
    // venta, producto, trabajador, caja, tienda
    entidad: {
        allowNull: false,
        type: DataTypes.STRING(20),
        field: 'entidad'
    },
    entidad_id: {
        allowNull: false,
        type: DataTypes.INTEGER,
        field: 'entidad_id'
    },
    version: {
        allowNull: false,
        type: DataTypes.INTEGER,
        defaultValue: 1,
        field: 'version'
    }
};
