import { Model, DataTypes, literal } from 'sequelize';

export const FORMATOS_FECHA = ['dd/mm/aaaa', 'aaaa-mm-dd'];

/** Configuración del negocio: una sola fila (id = 1). */
export class Configuracion extends Model {
    static config(sequelize) {
        return {
            sequelize,
            tableName: 'configuracion',
            modelName: 'Configuracion',
            timestamps: true,
            createdAt: false,
            updatedAt: 'actualizado_en'
        };
    }
}

export const ConfiguracionSchema = {
    id: {
        allowNull: false,
        primaryKey: true,
        type: DataTypes.SMALLINT,
        defaultValue: 1,
        field: 'id'
    },
    nombre_tienda: {
        allowNull: false,
        type: DataTypes.STRING(120),
        defaultValue: 'Mi Mini Súper',
        field: 'nombre_tienda',
        validate: { notEmpty: { msg: 'El nombre de la tienda es obligatorio.' } }
    },
    direccion: {
        allowNull: true,
        type: DataTypes.STRING(255),
        field: 'direccion'
    },
    telefono: {
        allowNull: true,
        type: DataTypes.STRING(30),
        field: 'telefono'
    },
    rfc: {
        allowNull: true,
        type: DataTypes.STRING(13),
        field: 'rfc'
    },
    mensaje_ticket: {
        allowNull: true,
        type: DataTypes.STRING(255),
        defaultValue: '¡Gracias por su compra!',
        field: 'mensaje_ticket'
    },
    // Texto extra bajo el nombre en el ticket (horario, WhatsApp, eslogan…). Varias líneas.
    ticket_encabezado: {
        allowNull: true,
        type: DataTypes.STRING(255),
        field: 'ticket_encabezado'
    },
    // Ancho del papel de la impresora de tickets, en milímetros.
    ticket_ancho: {
        allowNull: false,
        type: DataTypes.STRING(2),
        defaultValue: '80',
        field: 'ticket_ancho'
    },
    ticket_mostrar_cajero: {
        allowNull: false,
        type: DataTypes.BOOLEAN,
        defaultValue: true,
        field: 'ticket_mostrar_cajero'
    },
    moneda: {
        allowNull: false,
        type: DataTypes.CHAR(3),
        defaultValue: 'MXN',
        field: 'moneda'
    },
    formato_fecha: {
        allowNull: false,
        type: DataTypes.STRING(10),
        defaultValue: 'dd/mm/aaaa',
        field: 'formato_fecha'
    },
    // false = la tienda no cobra IVA: se ignora la tasa de cada producto.
    cobrar_iva: {
        allowNull: false,
        type: DataTypes.BOOLEAN,
        defaultValue: true,
        field: 'cobrar_iva'
    },
    precios_incluyen_iva: {
        allowNull: false,
        type: DataTypes.BOOLEAN,
        defaultValue: true,
        field: 'precios_incluyen_iva'
    },
    tasa_iva_predeterminada: {
        allowNull: false,
        type: DataTypes.DECIMAL(5, 4),
        defaultValue: '0.16',
        field: 'tasa_iva_predeterminada'
    },
    metodos_pago: {
        allowNull: false,
        type: DataTypes.ARRAY(DataTypes.STRING(20)),
        defaultValue: ['efectivo', 'credito'],
        field: 'metodos_pago'
    },
    stock_minimo_predeterminado: {
        allowNull: false,
        type: DataTypes.DECIMAL(10, 3),
        defaultValue: '5',
        field: 'stock_minimo_predeterminado'
    },
    permitir_sobreventa: {
        allowNull: false,
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        field: 'permitir_sobreventa'
    },
    requiere_caja_abierta: {
        allowNull: false,
        type: DataTypes.BOOLEAN,
        defaultValue: true,
        field: 'requiere_caja_abierta'
    },
    // Identificador único de esta tienda (de esta base de datos). La nube
    // lo usa para no mezclar los datos de dos tiendas.
    tienda_uuid: {
        allowNull: false,
        type: DataTypes.UUID,
        defaultValue: literal('gen_random_uuid()'),
        field: 'tienda_uuid'
    },
    actualizado_por: {
        allowNull: true,
        type: DataTypes.INTEGER,
        field: 'actualizado_por',
        references: { model: 'usuarios', key: 'id' },
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE'
    }
};
