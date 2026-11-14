import { Op } from 'sequelize';
import { models, obtenerSequelize } from '../libs/sequelize.js';
import { ErrorApp, noEncontrado } from '../libs/errores.js';
import { aEntero, aEnteroSigno, aTexto, importe, ivaContenido, ivaSobre, prorratear } from '../libs/dinero.js';
import { rangoFechas } from '../libs/fechas.js';
import * as v from '../libs/validar.js';
import { METODOS_PAGO } from '../models/ventas.model.js';
import configuracionService from './configuracion.service.js';
import inventarioService from './inventario.service.js';

const configuracion = new configuracionService();
const inventario = new inventarioService();

/**
 * Importes de una venta (la pantalla de venta usa las mismas reglas):
 *   precios con IVA:  total = subtotal - descuento; el IVA va contenido
 *   precios sin IVA:  total = subtotal - descuento + IVA
 * El IVA se reduce en la misma proporción que el descuento.
 */
export function calcularTotales(lineas, descuento, preciosIncluyenIva) {
    let subtotal = 0;
    let iva = 0;
    for (const l of lineas) {
        l.imp = importe(l.cantidad, l.precio);
        subtotal += l.imp;
        iva += preciosIncluyenIva ? ivaContenido(l.imp, l.tasa) : ivaSobre(l.imp, l.tasa);
    }
    if (descuento > subtotal) throw new ErrorApp(400, 'El descuento no puede ser mayor que el subtotal.');
    const neto = subtotal - descuento;
    const impuestos = prorratear(iva, neto, subtotal);
    return { subtotal, impuestos, total: preciosIncluyenIva ? neto : neto + impuestos };
}

/** Valida la petición y junta partidas repetidas del mismo producto. */
function leerVenta(data, usuario) {
    const metodo = v.opcion(data.metodo_pago, 'método de pago', METODOS_PAGO);
    const partidas = new Map();
    for (const p of v.lista(data.partidas, 'partidas', { max: 200 })) {
        const productoId = v.id(p?.producto_id, 'producto');
        const cantidad = v.decimal(p?.cantidad, 'cantidad', { escala: 3, positivo: true, max: 10000 });
        partidas.set(productoId, (partidas.get(productoId) ?? 0) + cantidad);
    }
    const descuento = v.decimal(data.descuento ?? '0', 'descuento', { escala: 2, max: 1000000 });
    if (descuento > 0 && usuario.rol !== 'administrador') {
        throw new ErrorApp(403, 'Solo un administrador puede aplicar descuentos.');
    }
    const recibido = metodo === 'efectivo'
        ? v.decimal(data.monto_recibido, 'monto recibido', { escala: 2, max: 1000000 })
        : null;
    // A crédito: hay que decir a qué trabajador se le descuenta en nómina.
    let trabajadorId = null;
    if (metodo === 'credito') {
        if (data.trabajador_id === undefined || data.trabajador_id === null || data.trabajador_id === '') {
            throw new ErrorApp(400, 'Elige al trabajador al que se le descontará la venta a crédito.');
        }
        trabajadorId = v.id(data.trabajador_id, 'trabajador');
    }
    return { metodo, partidas, descuento, recibido, trabajadorId };
}

/** Venta con nombres de cajero, trabajador y partidas, en el formato que usa la interfaz. */
function aPlano(model) {
    const o = model.toJSON();
    const { cajero, canceladaPor, descontadoPor, trabajador, partidas, ...resto } = o;
    return {
        ...resto,
        cajero: cajero?.nombre ?? null,
        cancelada_por_nombre: canceladaPor?.nombre ?? null,
        trabajador: trabajador ? { id: trabajador.id, numero: trabajador.numero, nombre: trabajador.nombre } : null,
        descontado_por_nombre: descontadoPor?.nombre ?? null,
        ...(partidas && {
            partidas: partidas.map(({ producto, ...d }) => ({
                producto_id: d.producto_id,
                codigo: producto?.codigo,
                nombre: producto?.nombre,
                unidad: producto?.unidad,
                cantidad: d.cantidad,
                precio_unitario: d.precio_unitario,
                tasa_iva: d.tasa_iva,
                importe: d.importe,
            }))
        }),
    };
}

// Función (no constante): los modelos existen hasta que se conecta la base.
const incluirTrabajador = () => ({ model: models.Trabajadores, as: 'trabajador', attributes: ['id', 'numero', 'nombre'] });

class ventasService {
    constructor() {}

    /**
     * Registra una venta en una sola transacción: venta + partidas +
     * salida de inventario con su movimiento. Si algo falla, no queda nada.
     */
    async create(data, usuario) {
        const { metodo, partidas, descuento, recibido, trabajadorId } = leerVenta(data, usuario);

        return obtenerSequelize().transaction(async (t) => {
            const config = await configuracion.find(t);
            if (!config.metodos_pago.includes(metodo)) {
                throw new ErrorApp(400, 'Ese método de pago no está habilitado en la configuración.');
            }
            if (trabajadorId) {
                const trabajador = await models.Trabajadores.findByPk(trabajadorId, { transaction: t });
                if (!trabajador) throw noEncontrado('El trabajador');
                if (!trabajador.activo) {
                    throw new ErrorApp(400, `${trabajador.nombre} está dado de baja y ya no puede comprar a crédito.`);
                }
            }

            // FOR SHARE: la caja no puede cerrarse mientras se registra la venta.
            const caja = await models.SesionesCaja.findOne({
                where: { usuario_id: usuario.id, estado: 'abierta' },
                transaction: t,
                lock: t.LOCK.SHARE
            });
            if (config.requiere_caja_abierta && !caja) {
                throw new ErrorApp(409, 'Abre tu caja antes de registrar ventas (sección Caja).');
            }

            // Bloquear los productos en orden de id: dos cajas no pueden
            // vender la misma última unidad.
            const productos = await models.Productos.findAll({
                where: { id: [...partidas.keys()] },
                order: [['id', 'ASC']],
                transaction: t,
                lock: t.LOCK.UPDATE
            });
            const porId = new Map(productos.map((p) => [String(p.id), p]));

            const lineas = [];
            for (const [productoId, cantidad] of partidas) {
                const p = porId.get(productoId);
                if (!p) throw noEncontrado(`El producto con id ${productoId}`);
                if (!p.activo) throw new ErrorApp(400, `El producto "${p.nombre}" está inactivo y no se puede vender.`);
                if (p.unidad === 'pieza' && cantidad % 1000 !== 0) {
                    throw new ErrorApp(400, `"${p.nombre}" se vende por pieza: la cantidad debe ser entera.`);
                }
                const existencia = aEnteroSigno(p.existencia, 3);
                if (!config.permitir_sobreventa && cantidad > existencia) {
                    throw new ErrorApp(409,
                        `Existencia insuficiente de "${p.nombre}": disponible ${aTexto(Math.max(existencia, 0), 3)}, solicitado ${aTexto(cantidad, 3)}.`);
                }
                lineas.push({
                    productoId,
                    cantidad,
                    precio: aEntero(p.precio_venta, 2),
                    // Sin IVA en la configuración: la tasa del producto no se usa.
                    tasa: config.cobrar_iva ? aEntero(p.tasa_iva, 4) : 0,
                    costo: p.costo,
                });
            }

            // Sin IVA, el precio es el precio final (como "IVA incluido" con IVA en cero).
            const incluyeIva = config.cobrar_iva ? config.precios_incluyen_iva : true;
            const { subtotal, impuestos, total } = calcularTotales(lineas, descuento, incluyeIva);
            let cambio = 0;
            if (metodo === 'efectivo') {
                if (recibido < total) throw new ErrorApp(400, `El monto recibido no cubre el total de $${aTexto(total, 2)}.`);
                cambio = recibido - total;
            }

            const venta = await models.Ventas.create({
                usuario_id: usuario.id,
                sesion_caja_id: caja?.id ?? null,
                subtotal: aTexto(subtotal, 2),
                descuento: aTexto(descuento, 2),
                impuestos: aTexto(impuestos, 2),
                total: aTexto(total, 2),
                precios_incluyen_iva: incluyeIva,
                metodo_pago: metodo,
                trabajador_id: trabajadorId,
                monto_recibido: recibido === null ? null : aTexto(recibido, 2),
                cambio: aTexto(cambio, 2),
            }, { transaction: t });

            await models.DetalleVentas.bulkCreate(lineas.map((l) => ({
                venta_id: venta.id,
                producto_id: l.productoId,
                cantidad: aTexto(l.cantidad, 3),
                precio_unitario: aTexto(l.precio, 2),
                tasa_iva: aTexto(l.tasa, 4),
                costo_unitario: l.costo,
                importe: aTexto(l.imp, 2),
            })), { transaction: t });

            for (const l of lineas) {
                await inventario.mover(t, {
                    productoId: l.productoId,
                    usuarioId: usuario.id,
                    tipo: 'venta',
                    cantidad: -l.cantidad,
                    ventaId: venta.id,
                    permitirNegativo: config.permitir_sobreventa,
                });
            }

            return { id: venta.id, folio: venta.folio, fecha: venta.fecha, total: venta.total, cambio: venta.cambio };
        });
    }

    /**
     * Historial: el cajero ve sus ventas; el administrador, todas.
     * Filtros: desde, hasta, usuario_id, estado, metodo_pago, trabajador_id, folio.
     */
    async find(query, usuario) {
        const where = { [Op.and]: rangoFechas(query, 'Ventas.fecha') };
        if (usuario.rol !== 'administrador') where.usuario_id = usuario.id;
        else if (query.usuario_id) where.usuario_id = v.id(query.usuario_id, 'usuario');
        if (query.estado) where.estado = v.opcion(query.estado, 'estado', ['completada', 'cancelada']);
        if (query.metodo_pago) where.metodo_pago = v.opcion(query.metodo_pago, 'método de pago', METODOS_PAGO);
        if (query.trabajador_id) where.trabajador_id = v.id(query.trabajador_id, 'trabajador');
        const folio = v.texto(query.folio, 'folio', { max: 20 });
        if (folio) {
            where.folio = folio.toUpperCase();
            where[Op.and] = [];
        }
        const res = await models.Ventas.findAll({
            where,
            attributes: ['id', 'folio', 'fecha', 'total', 'metodo_pago', 'estado', 'descontado_en'],
            include: [{ model: models.Usuarios, as: 'cajero', attributes: ['nombre'] }, incluirTrabajador()],
            order: [['fecha', 'DESC']],
            limit: 500
        });
        return res.map(aPlano);
    }

    async findOne(id, usuario) {
        const res = await models.Ventas.findByPk(v.id(id), {
            include: [
                { model: models.Usuarios, as: 'cajero', attributes: ['nombre'] },
                { model: models.Usuarios, as: 'canceladaPor', attributes: ['nombre'] },
                { model: models.Usuarios, as: 'descontadoPor', attributes: ['nombre'] },
                incluirTrabajador(),
                {
                    model: models.DetalleVentas,
                    as: 'partidas',
                    include: [{ model: models.Productos, as: 'producto', attributes: ['codigo', 'nombre', 'unidad'] }]
                },
            ],
            order: [[{ model: models.DetalleVentas, as: 'partidas' }, 'id', 'ASC']]
        });
        // El cajero no puede ver ventas de otros.
        if (!res || (usuario.rol !== 'administrador' && String(res.usuario_id) !== String(usuario.id))) {
            throw noEncontrado('La venta');
        }
        return aPlano(res);
    }

    /**
     * Cancela una venta completada y repone el inventario con movimientos
     * "cancelacion_venta". Solo funciona una vez. La venta deja de contar en
     * caja, reportes y nómina, y se oculta del historial; la depuración
     * anual la borra junto con las demás ventas viejas.
     */
    async cancelar(id, data, usuario) {
        const ventaId = v.id(id);
        const motivo = v.texto(data.motivo, 'motivo', { max: 255, requerido: true });

        return obtenerSequelize().transaction(async (t) => {
            const venta = await models.Ventas.findByPk(ventaId, { transaction: t, lock: t.LOCK.UPDATE });
            if (!venta) throw noEncontrado('La venta');
            if (venta.estado !== 'completada') throw new ErrorApp(409, 'La venta ya estaba cancelada.');

            const partidas = await models.DetalleVentas.findAll({
                where: { venta_id: ventaId }, order: [['producto_id', 'ASC']], transaction: t
            });
            for (const p of partidas) {
                await inventario.mover(t, {
                    productoId: p.producto_id,
                    usuarioId: usuario.id,
                    tipo: 'cancelacion_venta',
                    cantidad: aEntero(p.cantidad, 3),
                    ventaId,
                    motivo,
                    permitirNegativo: true,
                });
            }
            await venta.update({
                estado: 'cancelada', cancelada_por: usuario.id, cancelada_en: new Date(), motivo_cancelacion: motivo
            }, { transaction: t });

            // Si la caja de la venta ya se cerró, el reembolso en efectivo no
            // se descuenta solo: hay que registrar un retiro.
            let avisoCaja = null;
            if (venta.metodo_pago === 'efectivo' && venta.sesion_caja_id) {
                const caja = await models.SesionesCaja.findByPk(venta.sesion_caja_id, { transaction: t });
                if (caja?.estado === 'cerrada') {
                    avisoCaja = 'La caja de esta venta ya estaba cerrada: si devolviste efectivo, registra un retiro en tu caja.';
                }
            }
            // Venta a crédito que ya se descontó en nómina: hay que devolverle
            // ese dinero al trabajador.
            const avisoNomina = venta.metodo_pago === 'credito' && venta.descontado_en
                ? `Esta venta ya se había descontado en nómina: hay que reembolsar $${venta.total} al trabajador.`
                : null;
            return {
                id: venta.id, folio: venta.folio, estado: venta.estado, cancelada_en: venta.cancelada_en,
                total: venta.total, aviso_caja: avisoCaja, aviso_nomina: avisoNomina
            };
        });
    }
}

export default ventasService;
