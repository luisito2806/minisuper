import { Model, DataTypes } from 'sequelize';

/** Copia de los trabajadores con crédito de cada tienda. */
export class Trabajadores extends Model {
    static config(sequelize) {
        return {
            sequelize,
            tableName: 'trabajadores',
            modelName: 'Trabajadores',
            timestamps: false,
        };
    }
}

export const TrabajadoresSchema = {
    tienda_id: {
        allowNull: false,
        primaryKey: true,
        type: DataTypes.INTEGER,
        field: 'tienda_id',
        references: { model: 'tiendas', key: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE'
    },
    id_local: { allowNull: false, primaryKey: true, type: DataTypes.INTEGER, field: 'id_local' },
    numero: { allowNull: false, type: DataTypes.STRING(20), field: 'numero' },
    nombre: { allowNull: false, type: DataTypes.STRING(120), field: 'nombre' },
    area: { allowNull: true, type: DataTypes.STRING(80), field: 'area' },
    activo: { allowNull: false, type: DataTypes.BOOLEAN, field: 'activo' },
    // Cuándo generó la tienda estos datos. Un paquete más viejo (por
    // ejemplo, una USB que se cargó tarde) no reemplaza datos más nuevos.
    generado_en: { allowNull: true, type: DataTypes.DATE, field: 'generado_en' }
};
