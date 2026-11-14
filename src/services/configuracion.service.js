import { models } from '../libs/sequelize.js';
import { ErrorApp } from '../libs/errores.js';
import { aTexto } from '../libs/dinero.js';
import * as v from '../libs/validar.js';
import { METODOS_PAGO } from '../models/ventas.model.js';
import { FORMATOS_FECHA } from '../models/configuracion.model.js';

class configuracionService {
    constructor() {}

    /** Configuración completa (una sola fila). */
    async find(transaction) {
        const res = await models.Configuracion.findByPk(1, { transaction });
        if (!res) throw new ErrorApp(500, 'Falta la configuración. Reinicia el servidor para crearla.');
        return res.toJSON();
    }

    /** Lo que cualquiera puede ver (inicio de sesión y ticket). */
    async findPublica() {
        const c = await this.find();
        return {
            tienda: {
                nombre: c.nombre_tienda,
                direccion: c.direccion,
                telefono: c.telefono,
                rfc: c.rfc,
                mensaje_ticket: c.mensaje_ticket,
                encabezado: c.ticket_encabezado,
                ancho: c.ticket_ancho,
                mostrar_cajero: c.ticket_mostrar_cajero,
            },
            moneda: c.moneda,
            formato_fecha: c.formato_fecha,
            cobrar_iva: c.cobrar_iva,
            precios_incluyen_iva: c.precios_incluyen_iva,
        };
    }

    async update(data, usuario) {
        const metodos = v.lista(data.metodos_pago, 'métodos de pago', { min: 1, max: METODOS_PAGO.length });
        for (const m of metodos) v.opcion(m, 'métodos de pago', METODOS_PAGO);
        const moneda = v.texto(data.moneda, 'moneda', { max: 3, requerido: true }).toUpperCase();
        if (!/^[A-Z]{3}$/.test(moneda)) throw new ErrorApp(400, 'La moneda debe ser un código de 3 letras (ej. MXN).');
        const rfc = v.texto(data.rfc, 'RFC', { max: 13 });
        if (rfc && !/^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/i.test(rfc)) {
            throw new ErrorApp(400, 'El RFC no tiene un formato válido.');
        }

        const encabezado = v.texto(data.ticket_encabezado, 'encabezado del ticket', { max: 255 });
        if (encabezado && encabezado.split('\n').length > 5) {
            throw new ErrorApp(400, 'El encabezado del ticket admite máximo 5 renglones.');
        }

        const model = await models.Configuracion.findByPk(1);
        const res = await model.update({
            nombre_tienda: v.texto(data.nombre_tienda, 'nombre de la tienda', { max: 120, requerido: true }),
            direccion: v.texto(data.direccion, 'dirección', { max: 255 }),
            telefono: v.texto(data.telefono, 'teléfono', { max: 30 }),
            rfc: rfc?.toUpperCase() ?? null,
            mensaje_ticket: v.texto(data.mensaje_ticket, 'mensaje del ticket', { max: 255 }),
            ticket_encabezado: encabezado,
            ticket_ancho: v.opcion(data.ticket_ancho ?? '80', 'ancho del ticket', ['58', '80']),
            ticket_mostrar_cajero: v.booleano(data.ticket_mostrar_cajero, 'mostrar cajero en el ticket', true),
            moneda,
            formato_fecha: v.opcion(data.formato_fecha, 'formato de fecha', FORMATOS_FECHA),
            cobrar_iva: v.booleano(data.cobrar_iva, 'cobrar IVA', true),
            precios_incluyen_iva: v.booleano(data.precios_incluyen_iva, 'precios incluyen IVA', true),
            tasa_iva_predeterminada: aTexto(
                v.decimal(data.tasa_iva_predeterminada, 'tasa de IVA predeterminada', { escala: 4, max: 0.9999 }), 4),
            metodos_pago: [...new Set(metodos)],
            stock_minimo_predeterminado: aTexto(
                v.decimal(data.stock_minimo_predeterminado, 'stock mínimo predeterminado', { escala: 3, max: 1000000 }), 3),
            permitir_sobreventa: v.booleano(data.permitir_sobreventa, 'permitir sobreventa', false),
            requiere_caja_abierta: v.booleano(data.requiere_caja_abierta, 'requiere caja abierta', true),
            actualizado_por: usuario.id,
        });
        return (await res.reload()).toJSON();
    }
}

export default configuracionService;
