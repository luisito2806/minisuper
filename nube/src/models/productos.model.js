import { Model, DataTypes } from 'sequelize';

/** Copia del catálogo y la existencia de cada tienda. */
export class Productos extends Model {
    static config(sequelize) {
        return {
            sequelize,
            tableName: 'productos',
            modelName: 'Productos',
            timestamps: false,
        };
    }
}

export const ProductosSchema = {
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
    codigo: { allowNull: false, type: DataTypes.STRING(50), field: 'codigo' },
    nombre: { allowNull: false, type: DataTypes.STRING(120), field: 'nombre' },
    categoria: { allowNull: true, type: DataTypes.STRING(80), field: 'categoria' },
    unidad: { allowNull: false, type: DataTypes.STRING(10), field: 'unidad' },
    precio_venta: { allowNull: false, type: DataTypes.DECIMAL(12, 2), field: 'precio_venta' },
    costo: { allowNull: false, type: DataTypes.DECIMAL(12, 2), field: 'costo' },
    existencia: { allowNull: false, type: DataTypes.DECIMAL(12, 3), field: 'existencia' },
    stock_minimo: { allowNull: false, type: DataTypes.DECIMAL(12, 3), field: 'stock_minimo' },
    activo: { allowNull: false, type: DataTypes.BOOLEAN, field: 'activo' },
    // Cuándo generó la tienda estos datos. Un paquete más viejo (por
    // ejemplo, una USB que se cargó tarde) no reemplaza datos más nuevos.
    generado_en: { allowNull: true, type: DataTypes.DATE, field: 'generado_en' }
};
