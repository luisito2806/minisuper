/**
 * Datos de demostración: cuatro semanas de operación de la tienda para que
 * cada sección tenga información (ventas, caja, compras, inventario,
 * nómina, reportes). Lo usan el modo demo (npm run demo) y
 * scripts/cargar-demo.js. NUNCA se ejecuta en una instalación normal.
 *
 * Todo se registra con los mismos servicios que usa la aplicación (así
 * los totales, la existencia y los cortes de caja cuadran) y después se
 * "mueve en el tiempo": cada día simulado se reparte entre las 8:00 y las
 * 21:00 de esa fecha, conservando el orden en que ocurrió todo.
 *
 * Los números aleatorios usan una semilla fija: la demo sale igual cada vez,
 * pero con fechas relativas al día de hoy.
 */
import { models, obtenerSequelize, consultar } from './sequelize.js';
import { aEntero, aTexto, importe } from './dinero.js';
import { hoyMexico, semanaNomina, sumarDias } from './fechas.js';
import ventasService from '../services/ventas.service.js';
import cajaService from '../services/caja.service.js';
import comprasService from '../services/compras.service.js';
import inventarioService from '../services/inventario.service.js';
import nominaService from '../services/nomina.service.js';
import usuariosService from '../services/usuarios.service.js';
import trabajadoresService from '../services/trabajadores.service.js';

const ventas = new ventasService();
const caja = new cajaService();
const compras = new comprasService();
const inventario = new inventarioService();
const nomina = new nominaService();
const usuariosSrv = new usuariosService();
const trabajadoresSrv = new trabajadoresService();

// Columnas de fecha que se mueven al día simulado.
const FECHAS = [
    ['ventas', 'fecha'], ['ventas', 'cancelada_en'],
    ['sesiones_caja', 'abierta_en'], ['sesiones_caja', 'cerrada_en'],
    ['movimientos_caja', 'fecha'],
    ['movimientos_inventario', 'fecha'],
    ['compras', 'fecha'], ['compras', 'cancelada_en'],
];
const TABLAS = [...new Set(FECHAS.map(([t]) => t))];

const TRABAJADORES_EXTRA = [
    ['1004', 'Lucía Hernández', 'Calidad'],
    ['1005', 'Pedro Sánchez', 'Mantenimiento'],
    ['1006', 'Rosa Martínez', 'Producción'],
];

// En el último surtido "el proveedor no los trajo": quedan bajos o agotados,
// para que se vean las alertas de inventario y la lista de compra sugerida.
const NO_LLEGARON = ['7501000000141', '7501000000172', 'INT-0003', '7501000000080'];

// Productos que más se venden (se eligen más seguido).
const POPULARES = ['7501000000066', '7501000000073', '7501000000097', '7501000000127', '7501000000011', 'INT-0001', 'INT-0002'];

/** Generador pseudoaleatorio con semilla (mulberry32): la demo sale igual cada vez. */
function crearAzar(semilla) {
    let s = semilla >>> 0;
    const azar = () => {
        s = (s + 0x6d2b79f5) >>> 0;
        let t = s;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    azar.entero = (min, max) => min + Math.floor(azar() * (max - min + 1));
    azar.elegir = (lista) => lista[Math.floor(azar() * lista.length)];
    azar.si = (probabilidad) => azar() < probabilidad;
    return azar;
}

/** Fecha y hora de México (AAAA-MM-DD + HH:MM) como Date. */
const enMexico = (dia, hora) => new Date(`${dia}T${hora}:00-06:00`);

async function idsMaximos() {
    const res = {};
    for (const t of TABLAS) {
        const [{ m }] = await consultar(`SELECT coalesce(max(id), 0)::int AS m FROM ${t}`);
        res[t] = m;
    }
    return res;
}

const reloj = async () => new Date((await consultar('SELECT clock_timestamp() AS t'))[0].t);

/**
 * Ejecuta `fn` y mueve todo lo que creó al intervalo [desde, hasta],
 * en proporción al momento real en que se hizo (el orden se conserva).
 */
async function enElTiempo(desde, hasta, fn) {
    const marcas = await idsMaximos();
    const t0 = await reloj();
    await fn();
    const t1 = await reloj();
    const escala = (hasta - desde) / Math.max(1, t1 - t0);
    const db = obtenerSequelize();
    for (const [tabla, columna] of FECHAS) {
        await db.query(
            `UPDATE ${tabla} SET ${columna} = $1::timestamptz + (${columna} - $2::timestamptz) * $3::float8
              WHERE id > $4 AND ${columna} IS NOT NULL`,
            { bind: [desde.toISOString(), t0.toISOString(), escala, marcas[tabla]] }
        );
    }
}

/** Billete con el que paga el cliente: lo justo o el siguiente redondo. */
function pagoCon(totalCent, azar) {
    const opciones = [10000, 20000, 50000, 100000].filter((b) => b >= totalCent);
    if (azar.si(0.25) || !opciones.length) return Math.ceil(totalCent / 1000) * 1000; // múltiplo de $10
    return opciones[0];
}

/** Una venta al azar con productos que tengan existencia. Devuelve la venta o null. */
async function ventaAlAzar(usuario, trabajadores, azar, { credito }) {
    const productos = await models.Productos.findAll({ where: { activo: true }, raw: true });
    const disponibles = productos.filter((p) => Number(p.existencia) >= (p.unidad === 'pieza' ? 1 : 0.5));
    if (!disponibles.length) return null;
    const populares = disponibles.filter((p) => POPULARES.includes(p.codigo));
    const partidas = new Map();
    for (let i = azar.entero(1, 4); i > 0; i--) {
        const p = populares.length && azar.si(0.55) ? azar.elegir(populares) : azar.elegir(disponibles);
        const max = Math.min(Number(p.existencia), p.unidad === 'pieza' ? 3 : 2);
        const cantidad = p.unidad === 'pieza'
            ? azar.entero(1, Math.max(1, Math.floor(max)))
            : Math.round((0.25 + azar() * (max - 0.25)) * 4) / 4; // de 0.25 kg en 0.25 kg
        if (cantidad > 0 && !partidas.has(p.id)) partidas.set(p.id, { p, cantidad });
    }
    if (!partidas.size) return null;
    const lineas = [...partidas.values()];
    const total = lineas.reduce((s, { p, cantidad }) => s + importe(aEntero(String(cantidad), 3), aEntero(p.precio_venta, 2)), 0);
    const datos = { partidas: lineas.map(({ p, cantidad }) => ({ producto_id: String(p.id), cantidad: String(cantidad) })) };
    if (credito) {
        datos.metodo_pago = 'credito';
        datos.trabajador_id = String(azar.elegir(trabajadores).id);
    } else {
        datos.metodo_pago = 'efectivo';
        datos.monto_recibido = aTexto(pagoCon(total, azar), 2);
    }
    try {
        return await ventas.create(datos, usuario);
    } catch {
        return null; // por ejemplo, otra venta se acabó la existencia: se omite
    }
}

/** Compra al proveedor habitual de lo que está bajo el mínimo (como haría el dueño). */
async function surtir(admin, { todo = false, excluir = [] } = {}) {
    const lista = todo
        ? (await models.Productos.findAll({ where: { activo: true }, raw: true })).map((p) => ({
            id: p.id, codigo: p.codigo, proveedor_id: p.proveedor_id, costo: p.costo, unidad: p.unidad,
            sugerido: Math.max(0, 4 * Number(p.stock_minimo) - Number(p.existencia)),
        }))
        : (await inventario.sugerida()).map((p) => ({ ...p, proveedor_id: p.proveedor_id }));
    // Proveedor: el de la última compra o el habitual del producto; si no tiene, el primero.
    const habituales = new Map((await models.Productos.findAll({ attributes: ['id', 'proveedor_id'], raw: true })).map((p) => [p.id, p.proveedor_id]));
    const [primero] = await models.Proveedores.findAll({ order: [['id', 'ASC']], limit: 1, raw: true });
    const porProveedor = new Map();
    for (const p of lista) {
        let cantidad = Number(p.sugerido);
        if (!(cantidad > 0) || excluir.includes(p.codigo)) continue;
        cantidad = p.unidad === 'pieza' ? Math.ceil(cantidad) : Math.round(cantidad * 1000) / 1000;
        const proveedor = p.proveedor_id ?? habituales.get(p.id) ?? primero.id;
        if (!porProveedor.has(proveedor)) porProveedor.set(proveedor, []);
        porProveedor.get(proveedor).push({ producto_id: String(p.id), cantidad: String(cantidad), costo_unitario: String(p.costo) });
    }
    const hechas = [];
    for (const [proveedorId, partidas] of porProveedor) {
        hechas.push(await compras.create({ proveedor_id: String(proveedorId), partidas, notas: 'Surtido semanal' }, admin));
    }
    return hechas;
}

/** Un día de la tienda: abrir caja, vender, ingresos/retiros, cancelar alguna, cerrar (o dejarla abierta). */
async function diaDeVentas(cajero, admin, trabajadores, azar, { numVentas, cerrar }) {
    const sesion = await caja.create({ fondo_inicial: azar.elegir(['500', '500', '800', '1000']) }, cajero);
    const hechas = [];
    for (let i = 0; i < numVentas; i++) {
        const v = await ventaAlAzar(cajero, trabajadores, azar, { credito: azar.si(0.22) });
        if (v) hechas.push(v);
        if (i === Math.floor(numVentas / 2) && azar.si(0.35)) {
            await caja.createMovimiento({ tipo: 'ingreso', monto: azar.elegir(['200', '300', '500']), motivo: 'Cambio de monedas' }, cajero);
        }
    }
    if (azar.si(0.4)) {
        await caja.createMovimiento({ tipo: 'retiro', monto: azar.elegir(['150', '250', '320']), motivo: azar.elegir(['Pago de garrafones de agua', 'Pago de hielo', 'Compra de bolsas']) }, cajero);
    }
    if (hechas.length > 3 && azar.si(0.2)) {
        const v = azar.elegir(hechas);
        await ventas.cancelar(v.id, { motivo: azar.elegir(['El cliente se arrepintió', 'Se cobró dos veces', 'Producto en mal estado']) }, admin);
    }
    if (cerrar) {
        const r = await caja.resumen(sesion.id);
        const diferencia = azar.elegir([0, 0, 0, 0, -1000, 500, -2000]);
        await caja.cerrar(sesion.id, {
            monto_contado: aTexto(Math.max(0, r.esperadoCent + diferencia), 2),
            notas: diferencia < 0 ? 'Faltante: se revisará con el cajero' : diferencia > 0 ? 'Sobrante' : null,
        }, cajero);
    }
}

/**
 * Carga la demostración. La base debe estar recién preparada con
 * datosDePrueba (categorías, proveedores, productos y trabajadores).
 *   dias: cuántos días hacia atrás (además de hoy).
 */
export async function cargarDemostracion({ dias = 27, semilla = 20261124 } = {}) {
    const db = obtenerSequelize();
    if ((await models.Ventas.count()) > 0) throw new Error('La base ya tiene ventas: la demostración solo se carga en una base nueva.');
    const azar = crearAzar(semilla);
    const hoy = hoyMexico();
    const primerDia = sumarDias(hoy, -dias);

    const admin = (await models.Usuarios.findOne({ where: { usuario: 'admin' } })).toJSON();
    const cajero = (await models.Usuarios.findOne({ where: { usuario: 'cajero' } })).toJSON();
    await models.Usuarios.update({ nombre: 'Jorge Ramírez' }, { where: { id: cajero.id } });
    const ana = (await usuariosSrv.create({ nombre: 'Ana López', usuario: 'ana', contrasena: 'Cajera123!', rol: 'cajero' })).toJSON();
    for (const [numero, nombre, area] of TRABAJADORES_EXTRA) {
        if (!(await models.Trabajadores.findOne({ where: { numero } }))) await trabajadoresSrv.create({ numero, nombre, area });
    }
    const trabajadores = await models.Trabajadores.findAll({ where: { activo: true }, raw: true });

    // Lo que ya existía (inventario inicial de la semilla) va un día antes de empezar.
    await db.query('UPDATE movimientos_inventario SET fecha = $1', { bind: [enMexico(sumarDias(primerDia, -1), '07:00').toISOString()] });
    await db.query('UPDATE usuarios SET creado_en = $1', { bind: [enMexico(sumarDias(primerDia, -3), '09:00').toISOString()] });
    await db.query('UPDATE productos SET creado_en = $1, actualizado_en = $1', { bind: [enMexico(sumarDias(primerDia, -2), '09:00').toISOString()] });
    await db.query('UPDATE trabajadores SET creado_en = $1, actualizado_en = $1', { bind: [enMexico(sumarDias(primerDia, -2), '09:00').toISOString()] });

    // Primer día, antes de abrir: se surte la tienda.
    await enElTiempo(enMexico(primerDia, '07:00'), enMexico(primerDia, '07:40'), () => surtir(admin, { todo: true }));

    for (let d = 0; d <= dias; d++) {
        const dia = sumarDias(primerDia, d);
        const esHoy = dia === hoy;
        const diaSemana = new Date(`${dia}T12:00:00Z`).getUTCDay(); // 0 = domingo
        const finDeSemana = diaSemana === 0 || diaSemana === 6;
        const quien = finDeSemana ? ana : cajero;

        // Lunes: surtido semanal con la lista de compra sugerida.
        if (diaSemana === 1 && d > 0) {
            await enElTiempo(enMexico(dia, '07:10'), enMexico(dia, '07:50'), async () => {
                const hechas = await surtir(admin, { excluir: d > dias - 7 ? NO_LLEGARON : [] });
                // Una compra se cancela (llegó mal el pedido) en la segunda semana.
                if (d >= 7 && d < 14 && hechas.length > 1) {
                    await compras.cancelar(hechas[hechas.length - 1].id, { motivo: 'El pedido llegó incompleto; se devolvió' }, admin);
                }
            });
        }

        let desde = enMexico(dia, '08:00');
        let hasta = enMexico(dia, '21:00');
        if (esHoy) {
            // Hoy: desde la mañana hasta hace un momento, con la caja todavía abierta.
            const ahora = new Date();
            hasta = new Date(ahora.getTime() - 2 * 60 * 1000);
            if (hasta <= desde) desde = new Date(hasta.getTime() - 60 * 60 * 1000);
        }
        const numVentas = esHoy ? azar.entero(5, 9) : finDeSemana ? azar.entero(12, 18) : azar.entero(8, 14);
        await enElTiempo(desde, hasta, () => diaDeVentas(quien, admin, trabajadores, azar, { numVentas, cerrar: !esHoy }));

        // Mermas y conteo físico en algunos días (después del cierre).
        if (d === 9 || d === 20) {
            await enElTiempo(enMexico(dia, '21:10'), enMexico(dia, '21:30'), async () => {
                const kg = await models.Productos.findOne({ where: { codigo: 'INT-0001' } });
                if (kg && Number(kg.existencia) >= 1) {
                    await inventario.ajustar({ producto_id: String(kg.id), modo: 'salida', cantidad: '0.750', motivo: 'Merma: jitomate maltratado' }, admin);
                }
                const yogurt = await models.Productos.findOne({ where: { codigo: '7501000000103' } });
                if (d === 20 && yogurt && Number(yogurt.existencia) >= 1) {
                    await inventario.ajustar({ producto_id: String(yogurt.id), modo: 'salida', cantidad: '1', motivo: 'Caducado' }, admin);
                }
            });
        }
        if (d === 14) {
            await enElTiempo(enMexico(dia, '21:15'), enMexico(dia, '21:45'), async () => {
                const abarrotes = await models.Productos.findAll({ where: { activo: true }, order: [['id', 'ASC']], limit: 6, raw: true });
                await inventario.conteo({
                    motivo: 'Conteo de fin de quincena',
                    partidas: abarrotes.map((p, i) => ({
                        producto_id: String(p.id),
                        contado: String(Math.max(0, Number(p.existencia) - (i % 3 === 0 ? 1 : 0))),
                    })),
                }, admin);
            });
        }
    }

    // Nómina: las semanas completas ya se descontaron, salvo la última (queda pendiente para mostrarla).
    const semanas = [];
    for (let dia = primerDia; dia <= hoy; dia = sumarDias(dia, 7)) {
        const s = semanaNomina(dia);
        if (s.fin < hoy && !semanas.some((x) => x.inicio === s.inicio)) semanas.push(s);
    }
    for (const s of semanas.slice(0, -1)) {
        const marca = await reloj();
        try {
            await nomina.descontar({ semana: s.inicio }, admin);
        } catch {
            continue; // semana sin ventas a crédito
        }
        await db.query('UPDATE ventas SET descontado_en = $1 WHERE descontado_en >= $2',
            { bind: [enMexico(sumarDias(s.fin, 1), '10:00').toISOString(), marca.toISOString()] });
    }

    // En la demo se entra directo con las contraseñas conocidas.
    await models.Usuarios.update({ debe_cambiar_contrasena: false }, { where: {} });
    return {
        ventas: await models.Ventas.count(),
        cortes: await models.SesionesCaja.count(),
        compras: await models.Compras.count(),
        desde: primerDia,
        usuarios: ['admin / Admin123!', 'cajero / Cajero123!', `${ana.usuario} / Cajera123!`],
    };
}
