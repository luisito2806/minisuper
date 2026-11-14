/**
 * Sincronización con la nube (solo de la tienda hacia la nube).
 *
 * La tienda nunca depende de internet: cada cambio queda en la cola
 * sync_pendientes (la llenan disparadores de PostgreSQL). Cuando hay
 * conexión, se manda en paquetes y la nube confirma; si no hay, la cola
 * espera. Sin internet en absoluto, el paquete se descarga a una USB y se
 * carga en la página de la nube desde la ciudad.
 *
 * Variables en .env:  SYNC_URL (dirección de la nube) y SYNC_TOKEN (clave
 * de la tienda, la da el script crear-tienda de la nube).
 */
import zlib from 'node:zlib';
import { Op } from 'sequelize';
import { models, obtenerSequelize, consultar } from '../libs/sequelize.js';
import { ErrorApp } from '../libs/errores.js';
import { aEntero, aTexto, importe } from '../libs/dinero.js';
import { encolarTodo } from '../libs/disparadores.js';

const POR_PAQUETE = 200;

let ajustes = null; // para pruebas: { url, token }
let enCurso = null;
let temporizador = null;
const estado = { ultima_exitosa: null, ultimo_intento: null, ultimo_error: null, enviados: 0 };

/** Dirección y clave de la nube (de .env, o las que pongan las pruebas). */
function destino() {
    const url = (ajustes?.url ?? process.env.SYNC_URL ?? '').replace(/\/+$/, '');
    const token = ajustes?.token ?? process.env.SYNC_TOKEN ?? '';
    return url && token ? { url, token } : null;
}

export function configurarSincronizacion(valores) {
    ajustes = valores;
}

/** Lee los datos actuales de las entidades en cola. */
async function leerEntidades(pendientes) {
    const ids = (entidad) => pendientes.filter((p) => p.entidad === entidad).map((p) => p.entidad_id);
    const tienda = await models.Configuracion.findByPk(1, {
        attributes: ['tienda_uuid', 'nombre_tienda', 'direccion', 'telefono'],
    });

    const encontradas = await models.Ventas.findAll({
        where: { id: ids('venta') },
        include: [
            { model: models.Usuarios, as: 'cajero', attributes: ['nombre'] },
            { model: models.Trabajadores, as: 'trabajador', attributes: ['id', 'numero', 'nombre'] },
            {
                model: models.DetalleVentas,
                as: 'partidas',
                include: [{ model: models.Productos, as: 'producto', attributes: ['codigo', 'nombre', 'unidad', 'costo'] }],
            },
        ],
        order: [[{ model: models.DetalleVentas, as: 'partidas' }, 'id', 'ASC']],
    });
    const ventas = encontradas.map((v) => {
        const partidas = v.partidas.map((d) => {
            const costo = d.costo_unitario ?? d.producto.costo; // ventas viejas: costo actual
            return {
                codigo: d.producto.codigo,
                nombre: d.producto.nombre,
                unidad: d.producto.unidad,
                cantidad: d.cantidad,
                precio: d.precio_unitario,
                importe: d.importe,
                costo,
                costoTotal: importe(aEntero(d.cantidad, 3), aEntero(costo, 2)),
            };
        });
        return {
            id: v.id,
            folio: v.folio,
            fecha: v.fecha,
            metodo_pago: v.metodo_pago,
            subtotal: v.subtotal,
            descuento: v.descuento,
            impuestos: v.impuestos,
            total: v.total,
            estado: v.estado,
            cancelada_en: v.cancelada_en,
            motivo_cancelacion: v.motivo_cancelacion,
            descontado_en: v.descontado_en,
            sesion_caja_id: v.sesion_caja_id,
            cajero: v.cajero?.nombre ?? null,
            trabajador_id: v.trabajador?.id ?? null,
            trabajador_numero: v.trabajador?.numero ?? null,
            trabajador_nombre: v.trabajador?.nombre ?? null,
            costo: aTexto(partidas.reduce((s, p) => s + p.costoTotal, 0), 2),
            partidas: partidas.map(({ costoTotal, ...p }) => p),
        };
    });

    const productos = (await models.Productos.findAll({
        where: { id: ids('producto') },
        attributes: ['id', 'codigo', 'nombre', 'unidad', 'precio_venta', 'costo', 'existencia', 'stock_minimo', 'activo'],
        include: [{ model: models.Categorias, as: 'categoria', attributes: ['nombre'] }],
    })).map((p) => ({ ...p.toJSON(), categoria: p.categoria.nombre }));

    const trabajadores = await models.Trabajadores.findAll({
        where: { id: ids('trabajador') },
        attributes: ['id', 'numero', 'nombre', 'area', 'activo'],
        raw: true,
    });

    // Cortes de caja: llevan sumas de ventas e ingresos/retiros (consulta SQL).
    const cajas = await consultar(
        `SELECT s.id, u.nombre AS usuario, s.abierta_en, s.cerrada_en, s.estado, s.fondo_inicial,
                s.efectivo_esperado, s.monto_contado, s.diferencia,
                coalesce(v.efectivo, 0) AS ventas_efectivo, coalesce(v.credito, 0) AS ventas_credito,
                coalesce(v.num, 0)::int AS num_ventas,
                coalesce(m.ingresos, 0) AS ingresos, coalesce(m.retiros, 0) AS retiros
           FROM sesiones_caja s
           JOIN usuarios u ON u.id = s.usuario_id
           LEFT JOIN LATERAL (
             SELECT count(*) FILTER (WHERE estado = 'completada') AS num,
                    sum(total) FILTER (WHERE estado = 'completada' AND metodo_pago = 'efectivo') AS efectivo,
                    sum(total) FILTER (WHERE estado = 'completada' AND metodo_pago = 'credito') AS credito
               FROM ventas WHERE sesion_caja_id = s.id
           ) v ON TRUE
           LEFT JOIN LATERAL (
             SELECT sum(monto) FILTER (WHERE tipo = 'ingreso') AS ingresos,
                    sum(monto) FILTER (WHERE tipo = 'retiro') AS retiros
               FROM movimientos_caja WHERE sesion_caja_id = s.id
           ) m ON TRUE
          WHERE s.id = ANY($1::int[])`,
        [ids('caja')]
    );
    return {
        formato: 1,
        generado_en: new Date().toISOString(),
        tienda: { uuid: tienda.tienda_uuid, nombre: tienda.nombre_tienda, direccion: tienda.direccion, telefono: tienda.telefono },
        ventas,
        productos,
        trabajadores,
        cajas,
    };
}

/** Siguiente grupo de la cola (los más viejos primero). */
function siguientes(limite) {
    return models.SyncPendientes.findAll({
        attributes: ['id', 'entidad', 'entidad_id', 'version'],
        order: [['id', 'ASC']],
        limit: limite,
        raw: true,
    });
}

/**
 * Quita de la cola lo enviado, salvo lo que volvió a cambiar mientras tanto
 * (si la versión ya subió, el registro se queda para el siguiente envío).
 */
async function confirmar(pendientes) {
    for (let i = 0; i < pendientes.length; i += 500) {
        const grupo = pendientes.slice(i, i + 500);
        await models.SyncPendientes.destroy({
            where: { [Op.or]: grupo.map((p) => ({ id: p.id, version: p.version })) },
        });
    }
}

async function enviarPaquete(paquete, { url, token }) {
    let res;
    try {
        res = await fetch(`${url}/api/sync`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify(paquete),
            signal: AbortSignal.timeout(60000),
        });
    } catch (error) {
        throw new ErrorApp(503, `Sin conexión con la nube (${error.cause?.code ?? error.name}).`);
    }
    if (!res.ok) {
        const datos = await res.json().catch(() => null);
        throw new ErrorApp(502, `La nube rechazó los datos: ${datos?.message ?? `error ${res.status}`}`);
    }
}

class sincronizacionService {
    constructor() {}

    async estado() {
        const pendientes = await models.SyncPendientes.count();

        const d = destino();
        return { configurada: !!d, nube: d ? new URL(d.url).host : null, pendientes, en_curso: !!enCurso, ...estado };
    }

    /** Manda toda la cola, de 200 en 200. Si ya se está enviando, espera ese envío. */
    async sincronizar() {
        const d = destino();
        if (!d) throw new ErrorApp(409, 'La sincronización no está configurada (falta SYNC_URL y SYNC_TOKEN en .env).');
        if (enCurso) return enCurso;
        enCurso = (async () => {
            estado.ultimo_intento = new Date().toISOString();
            let enviados = 0;
            try {
                for (;;) {
                    const pendientes = await siguientes(POR_PAQUETE);
                    if (!pendientes.length) break;
                    await enviarPaquete(await leerEntidades(pendientes), d);
                    await confirmar(pendientes);
                    enviados += pendientes.length;
                }
                estado.ultima_exitosa = new Date().toISOString();
                estado.ultimo_error = null;
                estado.enviados = enviados;
                return { enviados };
            } catch (error) {
                estado.ultimo_error = error.message;
                throw error;
            } finally {
                enCurso = null;
            }
        })();
        return enCurso;
    }

    /**
     * Paquete para llevar en USB cuando no hay internet: todo lo que está en
     * cola, comprimido. Se saca de la cola al llamar confirmar() (después de
     * guardarlo); si el archivo se pierde, "Enviar todo de nuevo" lo repone.
     */
    async paquete() {
        const pendientes = await siguientes(100000);
        if (!pendientes.length) throw new ErrorApp(409, 'No hay cambios nuevos para enviar: la nube ya tiene todo.');
        const datos = await leerEntidades(pendientes);
        const archivo = zlib.gzipSync(JSON.stringify(datos));
        const fecha = datos.generado_en.slice(0, 16).replace('T', '_').replace(':', '');
        return {
            nombre: `paquete_minisuper_${fecha}.json.gz`,
            archivo,
            cambios: pendientes.length,
            confirmar: () => confirmar(pendientes),
        };
    }

    /** Vuelve a poner en la cola todos los datos (si se perdió un paquete o la nube se reinició). */
    async reenviarTodo() {
        await obtenerSequelize().transaction((t) => encolarTodo(obtenerSequelize(), t));
        return this.estado();
    }
}

export default sincronizacionService;

/** Intenta sincronizar cada minuto (o SYNC_INTERVALO segundos) si está configurada. */
export function iniciarSincronizacionAutomatica() {
    if (temporizador || !destino()) return false;
    const service = new sincronizacionService();
    const intentar = () => service.sincronizar().catch(() => {}); // el error queda en estado
    const segundos = Math.max(15, Number(process.env.SYNC_INTERVALO) || 60);
    intentar();
    temporizador = setInterval(intentar, segundos * 1000);
    temporizador.unref();
    return true;
}
