import { Model, DataTypes } from 'sequelize';

/**
 * Copia de las ventas de cada tienda. La llave es (tienda_id, id_local):
 * el id_local es el id de la venta en la base de la tienda. Los productos
 * vendidos van dentro de `partidas` (JSONB) porque en la nube solo se
 * consultan, nunca se editan.
 */
export class Ventas extends Model {
    static config(sequelize) {
        return {
            sequelize,
            tableName: 'ventas',
            modelName: 'Ventas',
            timestamps: false,
            indexes: [{ name: 'ventas_tienda_fecha_idx', fields: ['tienda_id', 'fecha'] }],
        };
    }
}

const dinero = (field) => ({ allowNull: false, type: DataTypes.DECIMAL(12, 2), defaultValue: '0', field });

export const VentasSchema = {
    tienda_id: {
        allowNull: false,
        primaryKey: true,
        type: DataTypes.INTEGER,
        field: 'tienda_id',
        references: { model: 'tiendas', key: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE'
    },
    id_local: {
        allowNull: false,
        primaryKey: true,
        type: DataTypes.INTEGER,
        field: 'id_local'
    },
    folio: { allowNull: false, type: DataTypes.STRING(20), field: 'folio' },
    fecha: { allowNull: false, type: DataTypes.DATE, field: 'fecha' },
    cajero: { allowNull: true, type: DataTypes.STRING(100), field: 'cajero' },
    metodo_pago: { allowNull: false, type: DataTypes.STRING(20), field: 'metodo_pago' },
    trabajador_id: { allowNull: true, type: DataTypes.INTEGER, field: 'trabajador_id' },
    trabajador_numero: { allowNull: true, type: DataTypes.STRING(20), field: 'trabajador_numero' },
    trabajador_nombre: { allowNull: true, type: DataTypes.STRING(120), field: 'trabajador_nombre' },
    subtotal: dinero('subtotal'),
    descuento: dinero('descuento'),
    impuestos: dinero('impuestos'),
    total: dinero('total'),
    // Costo de lo vendido (para la utilidad).
    costo: dinero('costo'),
    estado: { allowNull: false, type: DataTypes.STRING(15), field: 'estado' },
    cancelada_en: { allowNull: true, type: DataTypes.DATE, field: 'cancelada_en' },
    motivo_cancelacion: { allowNull: true, type: DataTypes.STRING(255), field: 'motivo_cancelacion' },
    descontado_en: { allowNull: true, type: DataTypes.DATE, field: 'descontado_en' },
    sesion_caja_id: { allowNull: true, type: DataTypes.INTEGER, field: 'sesion_caja_id' },
    partidas: { allowNull: false, type: DataTypes.JSONB, defaultValue: [], field: 'partidas' },
    // Cuándo generó la tienda estos datos. Un paquete más viejo (por
    // ejemplo, una USB que se cargó tarde) no reemplaza datos más nuevos.
    generado_en: { allowNull: true, type: DataTypes.DATE, field: 'generado_en' }
};
