import { Model, DataTypes, literal, fn } from 'sequelize';

/**
 * Métodos de pago para ventas nuevas: efectivo o crédito (se descuenta
 * en la nómina del trabajador).
 */
export const METODOS_PAGO = ['efectivo', 'credito'];
/** Métodos que ya no se ofrecen pero pueden existir en ventas viejas. */
export const METODOS_ANTERIORES = ['tarjeta', 'transferencia', 'otro'];

export class Ventas extends Model {
    static config(sequelize) {
        return {
            sequelize,
            tableName: 'ventas',
            modelName: 'Ventas',
            timestamps: false,
            indexes: [
                { name: 'ventas_folio_unico', unique: true, fields: ['folio'] },
                { name: 'ventas_fecha_idx', fields: ['fecha'] },
                { name: 'ventas_usuario_idx', fields: ['usuario_id'] },
                { name: 'ventas_sesion_caja_idx', fields: ['sesion_caja_id'] },
                { name: 'ventas_trabajador_idx', fields: ['trabajador_id', 'fecha'] },
            ],
        };
    }
}

export const VentasSchema = {
    id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: DataTypes.INTEGER,
        field: 'id'
    },
    // Folio legible (V-000001) generado por una secuencia de PostgreSQL.
    folio: {
        allowNull: false,
        type: DataTypes.STRING(20),
        defaultValue: literal("'V-' || lpad(nextval('folio_ventas_seq')::text, 6, '0')"),
        field: 'folio'
    },
    usuario_id: {
        allowNull: false,
        type: DataTypes.INTEGER,
        field: 'usuario_id',
        references: { model: 'usuarios', key: 'id' },
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE'
    },
    sesion_caja_id: {
        allowNull: true,
        type: DataTypes.INTEGER,
        field: 'sesion_caja_id',
        references: { model: 'sesiones_caja', key: 'id' },
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE'
    },
    fecha: {
        allowNull: false,
        type: DataTypes.DATE,
        defaultValue: fn('now'),
        field: 'fecha'
    },
    subtotal: {
        allowNull: false,
        type: DataTypes.DECIMAL(10, 2),
        field: 'subtotal'
    },
    descuento: {
        allowNull: false,
        type: DataTypes.DECIMAL(10, 2),
        defaultValue: '0',
        field: 'descuento'
    },
    impuestos: {
        allowNull: false,
        type: DataTypes.DECIMAL(10, 2),
        defaultValue: '0',
        field: 'impuestos'
    },
    total: {
        allowNull: false,
        type: DataTypes.DECIMAL(10, 2),
        field: 'total'
    },
    precios_incluyen_iva: {
        allowNull: false,
        type: DataTypes.BOOLEAN,
        defaultValue: true,
        field: 'precios_incluyen_iva'
    },
    metodo_pago: {
        allowNull: false,
        type: DataTypes.STRING(20),
        field: 'metodo_pago',
        validate: { isIn: { args: [[...METODOS_PAGO, ...METODOS_ANTERIORES]], msg: 'Método de pago inválido.' } }
    },
    // Solo en ventas a crédito: a quién se le descuenta en nómina.
    trabajador_id: {
        allowNull: true,
        type: DataTypes.INTEGER,
        field: 'trabajador_id',
        references: { model: 'trabajadores', key: 'id' },
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE'
    },
    // Cuándo se aplicó el descuento en nómina (null = pendiente).
    descontado_en: {
        allowNull: true,
        type: DataTypes.DATE,
        field: 'descontado_en'
    },
    descontado_por: {
        allowNull: true,
        type: DataTypes.INTEGER,
        field: 'descontado_por',
        references: { model: 'usuarios', key: 'id' },
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE'
    },
    monto_recibido: {
        allowNull: true,
        type: DataTypes.DECIMAL(10, 2),
        field: 'monto_recibido'
    },
    cambio: {
        allowNull: false,
        type: DataTypes.DECIMAL(10, 2),
        defaultValue: '0',
        field: 'cambio'
    },
    estado: {
        allowNull: false,
        type: DataTypes.STRING(15),
        defaultValue: 'completada',
        field: 'estado'
    },
    cancelada_por: {
        allowNull: true,
        type: DataTypes.INTEGER,
        field: 'cancelada_por',
        references: { model: 'usuarios', key: 'id' },
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE'
    },
    cancelada_en: {
        allowNull: true,
        type: DataTypes.DATE,
        field: 'cancelada_en'
    },
    motivo_cancelacion: {
        allowNull: true,
        type: DataTypes.STRING(255),
        field: 'motivo_cancelacion'
    }
};
