import { Model, DataTypes } from 'sequelize';

/** Copia de los cortes de caja de cada tienda, con sus totales. */
export class Cajas extends Model {
    static config(sequelize) {
        return {
            sequelize,
            tableName: 'cajas',
            modelName: 'Cajas',
            timestamps: false,
        };
    }
}

const dinero = (field, allowNull = false) => ({
    allowNull,
    type: DataTypes.DECIMAL(12, 2),
    ...(allowNull ? {} : { defaultValue: '0' }),
    field,
});

export const CajasSchema = {
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
    usuario: { allowNull: true, type: DataTypes.STRING(100), field: 'usuario' },
    abierta_en: { allowNull: false, type: DataTypes.DATE, field: 'abierta_en' },
    cerrada_en: { allowNull: true, type: DataTypes.DATE, field: 'cerrada_en' },
    estado: { allowNull: false, type: DataTypes.STRING(10), field: 'estado' },
    fondo_inicial: dinero('fondo_inicial'),
    efectivo_esperado: dinero('efectivo_esperado', true),
    monto_contado: dinero('monto_contado', true),
    diferencia: dinero('diferencia', true),
    ventas_efectivo: dinero('ventas_efectivo'),
    ventas_credito: dinero('ventas_credito'),
    num_ventas: { allowNull: false, type: DataTypes.INTEGER, defaultValue: 0, field: 'num_ventas' },
    ingresos: dinero('ingresos'),
    retiros: dinero('retiros')
};
