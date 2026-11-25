/**
 * Recibe los paquetes de las tiendas (por internet o desde una USB) y los
 * guarda. Cada registro se "inserta o actualiza" por (tienda, id local)
 * con bulkCreate + updateOnDuplicate: recibir el mismo paquete dos veces no
 * duplica nada. Lo que la tienda borra al depurar sus ventas viejas se
 * conserva aquí como historial.
 */
import crypto from 'node:crypto';
import { Op } from 'sequelize';
import { models, obtenerSequelize } from '../libs/sequelize.js';
import { ErrorNube } from '../libs/errores.js';

export const hashToken = (token) => crypto.createHash('sha256').update(String(token)).digest('hex');

const lista = (x) => (Array.isArray(x) ? x : []);

/** Campos que se actualizan si el registro ya existía (todos menos la llave). */
const camposDe = (modelo) => Object.keys(modelo.getAttributes()).filter((k) => k !== 'tienda_id' && k !== 'id_local');

/**
 * Quita las filas que la nube ya tiene con datos generados DESPUÉS que este
 * paquete. Pasa cuando se carga tarde una USB: sus datos son más viejos que
 * los que ya llegaron por internet y no deben reemplazarlos (por ejemplo,
 * volver "completada" una venta que después se canceló).
 */
async function sinLasMasViejas(modelo, tiendaId, filas, generado, transaction) {
    const masNuevas = new Set((await modelo.findAll({
        attributes: ['id_local'],
        where: { tienda_id: tiendaId, id_local: filas.map((f) => f.id_local), generado_en: { [Op.gt]: generado } },
        raw: true,
        transaction,
    })).map((f) => f.id_local));
    return masNuevas.size ? filas.filter((f) => !masNuevas.has(f.id_local)) : filas;
}

class syncService {
    constructor() {}

    /** Tienda a la que pertenece una clave (token) de sincronización. */
    async tiendaPorToken(token) {
        if (!token) return null;
        return models.Tiendas.findOne({ where: { token_hash: hashToken(token) } });
    }

    /** Guarda un paquete de la tienda (instancia del modelo Tiendas). */
    async guardar(tienda, p) {
        if (!p || p.formato !== 1 || !p.tienda?.uuid) {
            throw new ErrorNube(400, 'El archivo no es un paquete válido del Mini Súper.');
        }
        // Una tienda = una base de datos. Si llega de otra computadora, se
        // rechaza para no mezclar ventas de dos tiendas con los mismos números.
        if (tienda.uuid_local && tienda.uuid_local !== p.tienda.uuid) {
            throw new ErrorNube(409,
                'Estos datos vienen de otra base de datos (otra tienda o una instalación nueva). ' +
                'Si reinstalaste la tienda, desvincúlala en la nube con "npm run desvincular-tienda".');
        }
        const generado = new Date(p.generado_en);
        if (Number.isNaN(generado.getTime())) throw new ErrorNube(400, 'Al paquete le falta la fecha en que se generó.');
        const conTienda = (filas, convertir) => lista(filas).map((x) => ({
            ...convertir(x), tienda_id: tienda.id, id_local: x.id, generado_en: generado,
        }));

        const ventas = conTienda(p.ventas, (v) => ({
            folio: v.folio,
            fecha: v.fecha,
            cajero: v.cajero ?? null,
            metodo_pago: v.metodo_pago,
            trabajador_id: v.trabajador_id ?? null,
            trabajador_numero: v.trabajador_numero ?? null,
            trabajador_nombre: v.trabajador_nombre ?? null,
            subtotal: v.subtotal,
            descuento: v.descuento,
            impuestos: v.impuestos,
            total: v.total,
            costo: v.costo ?? '0',
            estado: v.estado,
            cancelada_en: v.cancelada_en ?? null,
            motivo_cancelacion: v.motivo_cancelacion ?? null,
            descontado_en: v.descontado_en ?? null,
            sesion_caja_id: v.sesion_caja_id ?? null,
            partidas: lista(v.partidas),
        }));
        const productos = conTienda(p.productos, (x) => ({
            codigo: x.codigo, nombre: x.nombre, categoria: x.categoria ?? null, unidad: x.unidad,
            precio_venta: x.precio_venta, costo: x.costo, existencia: x.existencia, stock_minimo: x.stock_minimo,
            activo: x.activo,
        }));
        const trabajadores = conTienda(p.trabajadores, (t) => ({
            numero: t.numero, nombre: t.nombre, area: t.area ?? null, activo: t.activo,
        }));
        const cajas = conTienda(p.cajas, (c) => ({
            usuario: c.usuario ?? null, abierta_en: c.abierta_en, cerrada_en: c.cerrada_en ?? null, estado: c.estado,
            fondo_inicial: c.fondo_inicial, efectivo_esperado: c.efectivo_esperado ?? null,
            monto_contado: c.monto_contado ?? null, diferencia: c.diferencia ?? null,
            ventas_efectivo: c.ventas_efectivo ?? '0', ventas_credito: c.ventas_credito ?? '0',
            num_ventas: c.num_ventas ?? 0, ingresos: c.ingresos ?? '0', retiros: c.retiros ?? '0',
        }));

        let omitidos = 0;
        await obtenerSequelize().transaction(async (transaction) => {
            await tienda.update({
                uuid_local: p.tienda.uuid,
                nombre: p.tienda.nombre || tienda.nombre,
                direccion: p.tienda.direccion ?? tienda.direccion,
                ultima_sync: new Date(),
            }, { transaction });
            for (const [modelo, filas] of [
                [models.Ventas, ventas], [models.Productos, productos],
                [models.Trabajadores, trabajadores], [models.Cajas, cajas],
            ]) {
                if (!filas.length) continue;
                const nuevas = await sinLasMasViejas(modelo, tienda.id, filas, generado, transaction);
                omitidos += filas.length - nuevas.length;
                if (nuevas.length) await modelo.bulkCreate(nuevas, { updateOnDuplicate: camposDe(modelo), transaction });
            }
        });
        return {
            ventas: ventas.length, productos: productos.length, trabajadores: trabajadores.length, cajas: cajas.length,
            omitidos,
        };
    }
}

export default syncService;
