// Tienda → nube: sincronización por internet y por USB, panel de la nube,
// y el interruptor general de IVA.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import pg from 'pg';
import bcrypt from 'bcryptjs';
import { PGlite } from '@electric-sql/pglite';
import { createPgConfig } from '@electric-sql/pglite/node-postgres';
import { levantar, producto } from './ayuda.js';
import { configurarSincronizacion } from '../src/services/sincronizacion.service.js';
import sincronizacionService from '../src/services/sincronizacion.service.js';
import { conectar as conectarNube, prepararBase, models as modelosNube } from '../nube/src/libs/sequelize.js';
import { crearApp as crearNube } from '../nube/src/app.js';
import { hashToken } from '../nube/src/services/sync.service.js';

const TOKEN = 'clave-de-prueba-de-la-tienda-0123456789abcdef';
let tienda;
let admin;
let cajero;
let nube;
let nubeBase;
let pgliteNube;
let servidorNube;
const sync = new sincronizacionService();

/** Cliente HTTP con cookie para el panel de la nube. */
function clienteNube() {
  let cookie = '';
  const pedir = async (metodo, ruta, cuerpo) => {
    const res = await fetch(nubeBase + ruta, {
      method: metodo,
      headers: { ...(cuerpo !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) },
      body: cuerpo !== undefined ? JSON.stringify(cuerpo) : undefined,
    });
    const c = res.headers.get('set-cookie');
    if (c) cookie = c.split(';')[0];
    return { status: res.status, datos: await res.json().catch(() => null) };
  };
  return { get: (r) => pedir('GET', r), post: (r, c = {}) => pedir('POST', r, c) };
}

before(async () => {
  tienda = await levantar();
  admin = tienda.cliente();
  cajero = tienda.cliente();
  await admin.login('admin', 'Admin123!');
  await cajero.login('cajero', 'Cajero123!');
  await cajero.post('/api/caja/abrir', { fondo_inicial: '100' });

  // Nube con su propia base (otro PostgreSQL en memoria).
  pgliteNube = new PGlite();
  const { connection } = createPgConfig(pgliteNube);
  class ClienteNube extends pg.Client {
    constructor(c) {
      super({ ...c, connection });
    }
  }
  conectarNube({
    host: 'localhost', database: 'postgres', username: 'postgres', password: 'x',
    dialectModule: Object.assign(Object.create(pg), { Client: ClienteNube }),
    pool: { max: 1, min: 0, idle: 60000, acquire: 60000, evict: 0 },
  });
  await prepararBase();
  await prepararBase(); // un segundo arranque no debe fallar
  const papa = await modelosNube.Tiendas.create({ nombre: 'Tienda de papá', token_hash: hashToken(TOKEN) });
  await modelosNube.Tiendas.create({ nombre: 'Ferretería', token_hash: hashToken('otra') });
  const usuario = await modelosNube.Usuarios.create({
    usuario: 'papa', nombre: 'Papá', contrasena_hash: await bcrypt.hash('Contrasena-123', 4),
  });
  await usuario.setTiendas([papa.id]);

  servidorNube = await new Promise((ok) => {
    const s = crearNube({ secreto: 'secreto-de-la-nube-de-pruebas-0123456789' }).listen(0, () => ok(s));
  });
  nubeBase = `http://127.0.0.1:${servidorNube.address().port}`;
  nube = clienteNube();
});

after(async () => {
  configurarSincronizacion(null);
  servidorNube?.close();
  await tienda.cerrar();
  await pgliteNube.close();
});

const pendientes = async () => (await tienda.db.query('SELECT count(*)::int AS n FROM sync_pendientes')).rows[0].n;

describe('IVA', () => {
  test('con "No cobro IVA" el total es el precio y no se calcula impuesto', async () => {
    const conf = (await admin.get('/api/configuracion')).datos;
    const cambiar = (cobrar) => admin.put('/api/configuracion', { ...conf, rfc: conf.rfc ?? '', cobrar_iva: cobrar });
    assert.equal((await cambiar(false)).status, 200);
    assert.equal((await admin.get('/api/config')).datos.cobrar_iva, false);
    const refresco = await producto(tienda.db, '7501000000066'); // $20, IVA 16 %
    const v = await cajero.post('/api/ventas', {
      metodo_pago: 'efectivo', monto_recibido: '50', partidas: [{ producto_id: refresco.id, cantidad: '2' }],
    });
    const d = (await cajero.get(`/api/ventas/${v.datos.id}`)).datos;
    assert.equal(d.total, '40.00');
    assert.equal(d.impuestos, '0.00');
    assert.equal(d.partidas[0].tasa_iva, '0.0000');

    // "Sumar IVA al precio": el total sí sube.
    await admin.put('/api/configuracion', { ...conf, rfc: conf.rfc ?? '', cobrar_iva: true, precios_incluyen_iva: false });
    const v2 = await cajero.post('/api/ventas', {
      metodo_pago: 'efectivo', monto_recibido: '50', partidas: [{ producto_id: refresco.id, cantidad: '1' }],
    });
    assert.equal((await cajero.get(`/api/ventas/${v2.datos.id}`)).datos.total, '23.20');
    await cambiar(true); // regresa a IVA incluido
    await admin.put('/api/configuracion', { ...conf, rfc: conf.rfc ?? '', cobrar_iva: true, precios_incluyen_iva: true });
  });
});

describe('ticket', () => {
  test('encabezado, ancho de papel y cajero se guardan y salen en los datos públicos', async () => {
    const conf = (await admin.get('/api/configuracion')).datos;
    const guardar = (cambios) => admin.put('/api/configuracion', { ...conf, rfc: conf.rfc ?? '', ...cambios });
    const r = await guardar({
      ticket_encabezado: 'Abierto de 7 a 21\nWhatsApp 443 123 4567', ticket_ancho: '58', ticket_mostrar_cajero: false,
    });
    assert.equal(r.status, 200);
    const publica = (await tienda.cliente().get('/api/config')).datos.tienda;
    assert.equal(publica.encabezado, 'Abierto de 7 a 21\nWhatsApp 443 123 4567');
    assert.equal(publica.ancho, '58');
    assert.equal(publica.mostrar_cajero, false);
    assert.equal((await guardar({ ticket_ancho: '100' })).status, 400);
    assert.equal((await guardar({ ticket_encabezado: '1\n2\n3\n4\n5\n6' })).status, 400);
    await assert.rejects(tienda.db.query("UPDATE configuracion SET ticket_ancho = '70'"), /configuracion_ticket_ancho_valido/);
    assert.equal((await guardar({ ticket_encabezado: '', ticket_ancho: '80', ticket_mostrar_cajero: true })).status, 200);
  });
});

describe('cola de sincronización', () => {

  test('los disparadores anotan cada cambio, también los hechos desde pgAdmin', async () => {
    await tienda.db.query('DELETE FROM sync_pendientes');
    await tienda.db.query("UPDATE productos SET nombre = nombre || '' WHERE codigo = '7501000000011'");
    const { rows } = await tienda.db.query('SELECT entidad, version FROM sync_pendientes');
    assert.deepEqual(rows, [{ entidad: 'producto', version: 1 }]);
    await tienda.db.query("UPDATE productos SET nombre = nombre || '' WHERE codigo = '7501000000011'");
    assert.equal((await tienda.db.query('SELECT version FROM sync_pendientes')).rows[0].version, 2);
  });

  test('sin nube configurada no se pierde nada: la cola espera', async () => {
    configurarSincronizacion(null);
    const r = await admin.post('/api/sincronizacion/ahora', {});
    assert.equal(r.status, 409);
    assert.equal((await admin.get('/api/sincronizacion')).datos.configurada, false);
    assert.equal((await cajero.get('/api/sincronizacion')).status, 403);
  });

  test('si la nube no responde, la cola se queda igual y se registra el error', async () => {
    await admin.post('/api/sincronizacion/reenviar', {});
    const antes = await pendientes();
    configurarSincronizacion({ url: 'http://127.0.0.1:9', token: TOKEN });
    const r = await admin.post('/api/sincronizacion/ahora', {});
    assert.equal(r.status, 503);
    assert.equal(await pendientes(), antes);
    assert.match((await admin.get('/api/sincronizacion')).datos.ultimo_error, /Sin conexión/);
  });
});

describe('sincronización por internet', () => {
  test('clave incorrecta: la nube rechaza y no se borra la cola', async () => {
    configurarSincronizacion({ url: nubeBase, token: 'clave-equivocada' });
    const antes = await pendientes();
    const r = await admin.post('/api/sincronizacion/ahora', {});
    assert.equal(r.status, 502);
    assert.match(r.datos.error, /Clave de tienda inválida/);
    assert.equal(await pendientes(), antes);
  });

  test('manda todo, la nube lo muestra y la cola queda vacía', async () => {
    const leche = await producto(tienda.db, '7501000000097');
    await cajero.post('/api/ventas', { metodo_pago: 'credito', trabajador_id: '1', partidas: [{ producto_id: leche.id, cantidad: '2' }] });
    const cancelada = await cajero.post('/api/ventas', { metodo_pago: 'efectivo', monto_recibido: '100', partidas: [{ producto_id: leche.id, cantidad: '1' }] });
    await admin.post(`/api/ventas/${cancelada.datos.id}/cancelar`, { motivo: 'Error' });

    configurarSincronizacion({ url: nubeBase, token: TOKEN });
    const r = await admin.post('/api/sincronizacion/ahora', {});
    assert.equal(r.status, 200);
    assert.ok(r.datos.enviados > 20);
    assert.equal(await pendientes(), 0);
    const estado = (await admin.get('/api/sincronizacion')).datos;
    assert.equal(estado.ultimo_error, null);
    assert.ok(estado.ultima_exitosa);

    assert.equal((await nube.get('/api/tiendas')).status, 401);
    assert.equal((await nube.post('/api/auth/login', { usuario: 'papa', contrasena: 'mal' })).status, 401);
    assert.equal((await nube.post('/api/auth/login', { usuario: 'papa', contrasena: 'Contrasena-123' })).status, 200);
    const tiendas = (await nube.get('/api/tiendas')).datos;
    assert.equal(tiendas.length, 1); // papá solo ve su tienda
    assert.ok(tiendas[0].ultima_sync);

    const local = (await admin.get('/api/reportes/ventas')).datos.resumen;
    const res = (await nube.get('/api/tiendas/1/resumen')).datos;
    assert.equal(res.num_ventas, local.num_ventas);
    assert.equal(Number(res.total).toFixed(2), Number(local.total).toFixed(2));
    assert.equal(Number(res.credito), 56);
    assert.equal(res.num_canceladas, 1);
    assert.equal(res.cajas_abiertas.length, 1);

    const ventas = (await nube.get('/api/tiendas/1/ventas?estado=')).datos;
    const credito = ventas.find((v) => v.metodo_pago === 'credito');
    assert.equal(credito.trabajador_nombre, 'Juan Pérez');
    const det = (await nube.get(`/api/tiendas/1/ventas/${credito.id}`)).datos;
    assert.equal(det.partidas[0].nombre, 'Leche entera 1 L');
    assert.equal(Number((await nube.get('/api/tiendas/1/nomina')).datos.trabajadores[0].total), 56);
    assert.ok((await nube.get('/api/tiendas/1/inventario?nivel=bajo')).datos.length >= 1);
    const busqueda = (await nube.get('/api/tiendas/1/inventario?q=leche')).datos;
    assert.deepEqual(busqueda.map((p) => p.codigo), ['7501000000097']);
    const cajas = (await nube.get('/api/tiendas/1/cajas')).datos;
    assert.equal(cajas.length, 1);
    assert.equal(cajas[0].estado, 'abierta');
    assert.equal(Number(cajas[0].ventas_credito), 56);
    assert.equal((await nube.get('/api/tiendas/1/ventas?desde=2026-13-01')).status, 400);

    assert.equal((await nube.get('/api/tiendas/2/resumen')).status, 404); // no es su tienda
  });

  test('reenviar todo no duplica, y una cancelación posterior llega a la nube', async () => {
    const antes = (await nube.get('/api/tiendas/1/ventas?estado=')).datos.length;
    await admin.post('/api/sincronizacion/reenviar', {});
    await admin.post('/api/sincronizacion/ahora', {});
    assert.equal((await nube.get('/api/tiendas/1/ventas?estado=')).datos.length, antes);

    const v = (await nube.get('/api/tiendas/1/ventas')).datos.find((x) => x.metodo_pago === 'credito');
    await admin.post(`/api/ventas/${v.id}/cancelar`, { motivo: 'Devolución' });
    assert.ok(await pendientes() >= 1);
    await admin.post('/api/sincronizacion/ahora', {});
    assert.equal((await nube.get(`/api/tiendas/1/ventas/${v.id}`)).datos.estado, 'cancelada');
  });

  test('un cambio hecho mientras se enviaba no se pierde', async () => {
    await tienda.db.query('DELETE FROM sync_pendientes');
    await tienda.db.query("UPDATE productos SET stock_minimo = stock_minimo WHERE codigo = '7501000000028'");
    const [leido] = (await tienda.db.query('SELECT id, version FROM sync_pendientes')).rows;
    await tienda.db.query("UPDATE productos SET stock_minimo = stock_minimo WHERE codigo = '7501000000028'"); // cambia otra vez
    await tienda.db.query(
      `DELETE FROM sync_pendientes s USING unnest($1::bigint[], $2::int[]) AS e(id, version)
        WHERE s.id = e.id AND s.version = e.version`,
      [[leido.id], [leido.version]],
    );
    assert.equal(await pendientes(), 1);
  });
});

describe('sincronización por USB', () => {
  test('el paquete se carga en la nube y la cola se vacía al confirmar', async () => {
    configurarSincronizacion(null); // sin internet
    const arroz = await producto(tienda.db, '7501000000011');
    const v = await cajero.post('/api/ventas', { metodo_pago: 'efectivo', monto_recibido: '100', partidas: [{ producto_id: arroz.id, cantidad: '1' }] });

    const p = await sync.paquete();
    assert.ok(p.cambios >= 1);
    assert.ok(await pendientes() >= 1); // todavía no se confirma
    await p.confirmar();
    assert.equal(await pendientes(), 0);

    const archivo = p.archivo.toString('base64');
    const r = await nube.post('/api/tiendas/1/paquete', { archivo });
    assert.equal(r.status, 200);
    assert.ok(r.datos.recibido.ventas >= 1);
    assert.equal((await nube.post('/api/tiendas/1/paquete', { archivo })).status, 200); // dos veces no duplica
    const ventas = (await nube.get('/api/tiendas/1/ventas')).datos;
    assert.equal(ventas.filter((x) => x.id === v.datos.id).length, 1);

    assert.equal((await nube.post('/api/tiendas/1/paquete', { archivo: 'basura' })).status, 400);
    await assert.rejects(sync.paquete(), /No hay cambios nuevos/);
  });

  test('un paquete de otra base de datos se rechaza para no mezclar tiendas', async () => {
    const otro = { formato: 1, tienda: { uuid: '00000000-0000-4000-8000-000000000000', nombre: 'x' }, ventas: [] };
    const archivo = zlib.gzipSync(JSON.stringify(otro)).toString('base64');
    const r = await nube.post('/api/tiendas/1/paquete', { archivo });
    assert.equal(r.status, 409);
    assert.match(r.datos.message, /otra base de datos/);
  });

  test('direcciones de red para entrar desde otra computadora', async () => {
    const r = await admin.get('/api/sincronizacion/red');
    assert.equal(r.status, 200);
    assert.ok(Array.isArray(r.datos.direcciones));
    assert.equal((await admin.post('/api/sincronizacion/usb', { unidad: '../x' })).status, 400);
  });
});
