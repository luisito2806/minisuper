import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { levantar, producto } from './ayuda.js';

let entorno;
let admin;
let cajero;

const CONFIG_BASE = {
  nombre_tienda: 'Tienda de prueba',
  direccion: 'Calle 1',
  telefono: '4430000000',
  rfc: '',
  mensaje_ticket: 'Gracias',
  moneda: 'MXN',
  formato_fecha: 'dd/mm/aaaa',
  precios_incluyen_iva: true,
  tasa_iva_predeterminada: '0.16',
  metodos_pago: ['efectivo', 'credito'],
  stock_minimo_predeterminado: '5',
  permitir_sobreventa: false,
  requiere_caja_abierta: true,
};
const configurar = (cambios) => admin.put('/api/configuracion', { ...CONFIG_BASE, ...cambios });

async function movimientos(codigo) {
  const { rows } = await entorno.db.query(
    `SELECT m.tipo, m.cantidad::text, m.existencia_anterior::text, m.existencia_nueva::text, m.motivo,
            m.venta_id, m.compra_id
       FROM movimientos_inventario m JOIN productos p ON p.id = m.producto_id
      WHERE p.codigo = $1 ORDER BY m.id`,
    [codigo],
  );
  return rows;
}

before(async () => {
  entorno = await levantar();
  admin = entorno.cliente();
  cajero = entorno.cliente();
  await admin.login('admin', 'Admin123!');
  await cajero.login('cajero', 'Cajero123!');
});

after(() => entorno.cerrar());

describe('caja', () => {
  test('sin caja abierta no se puede vender', async () => {
    const arroz = await producto(entorno.db, '7501000000011');
    const r = await cajero.post('/api/ventas', { metodo_pago: 'credito', trabajador_id: '1', partidas: [{ producto_id: arroz.id, cantidad: '1' }] });
    assert.equal(r.status, 409);
    assert.match(r.datos.error, /Abre tu caja/);
  });

  test('abrir, vender, retirar y cerrar con diferencia', async () => {
    const abrir = await cajero.post('/api/caja/abrir', { fondo_inicial: '500' });
    assert.equal(abrir.status, 201);
    assert.equal((await cajero.post('/api/caja/abrir', { fondo_inicial: '1' })).status, 409); // solo una abierta

    const refresco = await producto(entorno.db, '7501000000066'); // $20
    await cajero.post('/api/ventas', { metodo_pago: 'efectivo', monto_recibido: '100', partidas: [{ producto_id: refresco.id, cantidad: '3' }] }); // +60
    await cajero.post('/api/ventas', { metodo_pago: 'credito', trabajador_id: '1', partidas: [{ producto_id: refresco.id, cantidad: '1' }] }); // no es efectivo
    const cancelable = await cajero.post('/api/ventas', { metodo_pago: 'efectivo', monto_recibido: '20', partidas: [{ producto_id: refresco.id, cantidad: '1' }] });
    await admin.post(`/api/ventas/${cancelable.datos.id}/cancelar`, { motivo: 'error de captura' }); // no cuenta

    assert.equal((await cajero.post('/api/caja/movimientos', { tipo: 'ingreso', monto: '50', motivo: 'Cambio extra' })).status, 201);
    assert.equal((await cajero.post('/api/caja/movimientos', { tipo: 'retiro', monto: '5000', motivo: 'demasiado' })).status, 400);
    assert.equal((await cajero.post('/api/caja/movimientos', { tipo: 'retiro', monto: '100', motivo: '' })).status, 400);
    assert.equal((await cajero.post('/api/caja/movimientos', { tipo: 'retiro', monto: '100', motivo: 'Pago a proveedor' })).status, 201);

    const actual = await cajero.get('/api/caja/actual');
    const s = actual.datos.sesion;
    assert.equal(s.ventas_efectivo, '60.00');
    assert.equal(s.ventas_otros, '20.00');
    assert.equal(s.num_ventas, 2);
    assert.equal(s.num_canceladas, 1);
    assert.equal(s.efectivo_esperado_actual, '510.00'); // 500 + 60 + 50 - 100
    assert.equal(actual.datos.movimientos.length, 2);
    assert.ok(!('esperado_cent' in s));

    const cierre = await cajero.post(`/api/caja/${s.id}/cerrar`, { monto_contado: '505', notas: 'Faltaron 5' });
    assert.equal(cierre.status, 200);
    assert.equal(cierre.datos.estado, 'cerrada');
    assert.equal(cierre.datos.efectivo_esperado, '510.00');
    assert.equal(cierre.datos.diferencia, '-5.00');

    // no se cierra dos veces, ni se vende en caja cerrada
    assert.equal((await cajero.post(`/api/caja/${s.id}/cerrar`, { monto_contado: '505' })).status, 409);
    const r = await cajero.post('/api/ventas', { metodo_pago: 'credito', trabajador_id: '1', partidas: [{ producto_id: refresco.id, cantidad: '1' }] });
    assert.equal(r.status, 409);
    assert.equal((await cajero.get('/api/caja/actual')).datos.sesion, null);
  });

  test('cancelar una venta en efectivo de una caja cerrada avisa del reembolso', async () => {
    const { rows } = await entorno.db.query(
      "SELECT v.id FROM ventas v JOIN sesiones_caja s ON s.id = v.sesion_caja_id WHERE s.estado = 'cerrada' AND v.estado = 'completada' AND v.metodo_pago = 'efectivo' LIMIT 1",
    );
    const r = await admin.post(`/api/ventas/${rows[0].id}/cancelar`, { motivo: 'devolución' });
    assert.equal(r.status, 200);
    assert.match(r.datos.aviso_caja, /registra un retiro/);
  });

  test('el cajero no puede cerrar la caja de otro ni ver sesiones ajenas', async () => {
    const a = await admin.post('/api/caja/abrir', { fondo_inicial: '100' });
    assert.equal((await cajero.post(`/api/caja/${a.datos.id}/cerrar`, { monto_contado: '0' })).status, 403);
    assert.equal((await cajero.get(`/api/caja/${a.datos.id}`)).status, 404);
    const lista = await cajero.get('/api/caja');
    assert.ok(lista.datos.every((x) => x.usuario === 'Cajero 1'));
  });

  test('el administrador puede cerrar la caja de un cajero', async () => {
    const c = await cajero.post('/api/caja/abrir', { fondo_inicial: '200' });
    const r = await admin.post(`/api/caja/${c.datos.id}/cerrar`, { monto_contado: '200' });
    assert.equal(r.status, 200);
    assert.equal(r.datos.diferencia, '0.00');
    assert.equal(r.datos.cerrada_por_nombre, 'Administrador');
    await cajero.post('/api/caja/abrir', { fondo_inicial: '500' }); // para las siguientes pruebas
  });
});

describe('historial de inventario', () => {
  test('la migración deja un saldo inicial por producto', async () => {
    const m = await movimientos('7501000000097');
    assert.equal(m[0].tipo, 'inicial');
    assert.equal(m[0].existencia_nueva, '36.000');
  });

  test('venta, cancelación y compra dejan movimientos con referencia', async () => {
    const leche = await producto(entorno.db, '7501000000097');
    const v = await cajero.post('/api/ventas', { metodo_pago: 'credito', trabajador_id: '1', partidas: [{ producto_id: leche.id, cantidad: '2' }] });
    await admin.post(`/api/ventas/${v.datos.id}/cancelar`, { motivo: 'cliente se arrepintió' });
    const c = await admin.post('/api/compras', { proveedor_id: '1', partidas: [{ producto_id: leche.id, cantidad: '12', costo_unitario: '21' }] });

    const m = (await movimientos('7501000000097')).slice(-3);
    assert.deepEqual(m.map((x) => [x.tipo, x.cantidad]), [
      ['venta', '-2.000'],
      ['cancelacion_venta', '2.000'],
      ['compra', '12.000'],
    ]);
    assert.equal(String(m[0].venta_id), String(v.datos.id));
    assert.equal(String(m[2].compra_id), String(c.datos.id));
    assert.equal(m[1].motivo, 'cliente se arrepintió');
    assert.equal(m[2].existencia_nueva, '48.000');
  });

  test('alta de producto con existencia registra movimiento inicial', async () => {
    await admin.post('/api/productos', {
      codigo: 'F2-ALTA', nombre: 'Alta', categoria_id: '1', precio_venta: '10', costo: '5', existencia: '7',
    });
    const m = await movimientos('F2-ALTA');
    assert.equal(m.length, 1);
    assert.equal(m[0].tipo, 'inicial');
    assert.equal(m[0].cantidad, '7.000');
  });

  test('ajustes manuales: entrada, salida, conteo físico y validaciones', async () => {
    const atun = await producto(entorno.db, '7501000000059'); // 50
    const url = '/api/inventario/ajustes';
    assert.equal((await cajero.post(url, { producto_id: atun.id, modo: 'entrada', cantidad: '1', motivo: 'x' })).status, 403);
    assert.equal((await admin.post(url, { producto_id: atun.id, modo: 'salida', cantidad: '1', motivo: '  ' })).status, 400);
    assert.equal((await admin.post(url, { producto_id: atun.id, modo: 'salida', cantidad: '0', motivo: 'x' })).status, 400);
    assert.equal((await admin.post(url, { producto_id: atun.id, modo: 'entrada', cantidad: '1.5', motivo: 'x' })).status, 400); // pieza
    assert.equal((await admin.post(url, { producto_id: atun.id, modo: 'salida', cantidad: '999', motivo: 'x' })).status, 409);

    const salida = await admin.post(url, { producto_id: atun.id, modo: 'salida', cantidad: '3', motivo: 'Latas abolladas' });
    assert.equal(salida.status, 201);
    assert.equal(salida.datos.existencia, '47.000');

    const conteo = await admin.post(url, { producto_id: atun.id, modo: 'conteo', cantidad: '45', motivo: 'Inventario mensual' });
    assert.equal(conteo.datos.cantidad, '-2.000');
    assert.equal((await admin.post(url, { producto_id: atun.id, modo: 'conteo', cantidad: '45', motivo: 'x' })).status, 400);

    const m = (await movimientos('7501000000059')).slice(-2);
    assert.deepEqual(m.map((x) => x.tipo), ['ajuste_salida', 'ajuste_salida']);
    assert.equal(m[1].motivo, 'Conteo físico: Inventario mensual');

    const hist = await admin.get(`/api/inventario/movimientos?producto_id=${atun.id}&tipo=ajuste_salida`);
    assert.equal(hist.datos.length, 2);
    assert.equal(hist.datos[0].usuario, 'Administrador');
    assert.equal((await cajero.get('/api/inventario/movimientos')).status, 403);
  });

  test('la existencia siempre coincide con la suma de sus movimientos', async () => {
    const { rows } = await entorno.db.query(
      `SELECT p.codigo, p.existencia, coalesce(sum(m.cantidad), 0) AS suma
         FROM productos p LEFT JOIN movimientos_inventario m ON m.producto_id = p.id
        GROUP BY p.id HAVING p.existencia <> coalesce(sum(m.cantidad), 0)`,
    );
    assert.deepEqual(rows, []);
  });
});

describe('cancelación de compras', () => {
  test('repone el inventario una sola vez y queda auditada', async () => {
    const cloro = await producto(entorno.db, '7501000000165'); // 20
    const c = await admin.post('/api/compras', { proveedor_id: '1', partidas: [{ producto_id: cloro.id, cantidad: '10', costo_unitario: '15' }] });
    assert.equal(Number((await producto(entorno.db, '7501000000165')).existencia), 30);

    const url = `/api/compras/${c.datos.id}/cancelar`;
    assert.equal((await cajero.post(url, { motivo: 'x' })).status, 403);
    assert.equal((await admin.post(url, { motivo: '' })).status, 400);
    assert.equal((await admin.post(url, { motivo: 'Proveedor equivocado' })).status, 200);
    assert.equal((await admin.post(url, { motivo: 'otra vez' })).status, 409);
    assert.equal(Number((await producto(entorno.db, '7501000000165')).existencia), 20);

    const d = await admin.get(`/api/compras/${c.datos.id}`);
    assert.equal(d.datos.estado, 'cancelada');
    assert.equal(d.datos.cancelada_por_nombre, 'Administrador');
    assert.equal((await movimientos('7501000000165')).at(-1).tipo, 'cancelacion_compra');
  });

  test('no se cancela si ya se vendió lo comprado', async () => {
    const r = await admin.post('/api/productos', {
      codigo: 'F2-COMPRA', nombre: 'Comprado y vendido', categoria_id: '1', precio_venta: '10', costo: '5',
    });
    const c = await admin.post('/api/compras', { proveedor_id: '1', partidas: [{ producto_id: r.datos.id, cantidad: '5', costo_unitario: '5' }] });
    await cajero.post('/api/ventas', { metodo_pago: 'credito', trabajador_id: '1', partidas: [{ producto_id: r.datos.id, cantidad: '3' }] });
    const cancelar = await admin.post(`/api/compras/${c.datos.id}/cancelar`, { motivo: 'error' });
    assert.equal(cancelar.status, 409);
    assert.equal((await admin.get(`/api/compras/${c.datos.id}`)).datos.estado, 'confirmada');
  });
});

describe('configuración', () => {
  test('la pública no requiere sesión; la completa solo la cambia el administrador', async () => {
    const pub = await entorno.cliente().get('/api/config');
    assert.equal(pub.status, 200);
    assert.ok(pub.datos.tienda.nombre);
    assert.ok(!('permitir_sobreventa' in pub.datos));

    assert.equal((await cajero.get('/api/configuracion')).status, 200);
    assert.equal((await cajero.put('/api/configuracion', CONFIG_BASE)).status, 403);

    const r = await configurar({ nombre_tienda: 'Abarrotes Luis', rfc: 'VAEL900101AB1' });
    assert.equal(r.status, 200);
    assert.equal((await entorno.cliente().get('/api/config')).datos.tienda.nombre, 'Abarrotes Luis');
  });

  test('valida los datos', async () => {
    assert.equal((await configurar({ metodos_pago: [] })).status, 400);
    assert.equal((await configurar({ metodos_pago: ['cheque'] })).status, 400);
    assert.equal((await configurar({ moneda: 'pesos' })).status, 400);
    assert.equal((await configurar({ rfc: 'NOVALIDO' })).status, 400);
    assert.equal((await configurar({ nombre_tienda: ' ' })).status, 400);
    assert.equal((await configurar({ formato_fecha: 'mm/dd/aaaa' })).status, 400);
  });

  test('solo se aceptan los métodos de pago habilitados', async () => {
    await configurar({ metodos_pago: ['efectivo'] });
    const arroz = await producto(entorno.db, '7501000000011');
    const r = await cajero.post('/api/ventas', { metodo_pago: 'credito', trabajador_id: '1', partidas: [{ producto_id: arroz.id, cantidad: '1' }] });
    assert.equal(r.status, 400);
    assert.match(r.datos.error, /no está habilitado/);
    await configurar({});
  });

  test('valores predeterminados para productos nuevos', async () => {
    await configurar({ tasa_iva_predeterminada: '0', stock_minimo_predeterminado: '12' });
    const r = await admin.post('/api/productos', { codigo: 'F2-DEF', nombre: 'Defaults', categoria_id: '1', precio_venta: '10', costo: '5' });
    const p = await admin.get(`/api/productos/${r.datos.id}`);
    assert.equal(p.datos.tasa_iva, '0.0000');
    assert.equal(p.datos.stock_minimo, '12.000');
    await configurar({});
  });

  test('sobreventa habilitada permite existencia negativa y la registra', async () => {
    const chocolate = await producto(entorno.db, '7501000000141'); // 3
    const pedir = () => cajero.post('/api/ventas', { metodo_pago: 'credito', trabajador_id: '1', partidas: [{ producto_id: chocolate.id, cantidad: '5' }] });
    assert.equal((await pedir()).status, 409);

    await configurar({ permitir_sobreventa: true });
    assert.equal((await pedir()).status, 201);
    assert.equal(Number((await producto(entorno.db, '7501000000141')).existencia), -2);
    assert.equal((await movimientos('7501000000141')).at(-1).existencia_nueva, '-2.000');

    const inv = await admin.get('/api/reportes/inventario');
    assert.ok(inv.datos.alertas.some((p) => p.codigo === '7501000000141' && p.nivel_stock === 'agotado'));
    await configurar({});
  });

  test('precios sin IVA: el impuesto se suma al total', async () => {
    await configurar({ precios_incluyen_iva: false });
    const refresco = await producto(entorno.db, '7501000000066'); // $20 + 16 %
    const r = await admin.post('/api/ventas', {
      metodo_pago: 'efectivo',
      monto_recibido: '110',
      descuento: '10',
      partidas: [{ producto_id: refresco.id, cantidad: '5' }], // 100.00
    });
    assert.equal(r.status, 201, JSON.stringify(r.datos));
    const d = await admin.get(`/api/ventas/${r.datos.id}`);
    assert.equal(d.datos.subtotal, '100.00');
    assert.equal(d.datos.impuestos, '14.40'); // (100 - 10) × 0.16
    assert.equal(d.datos.total, '104.40');
    assert.equal(d.datos.cambio, '5.60');
    assert.equal(d.datos.precios_incluyen_iva, false);
    await configurar({});
  });

  test('sin requerir caja se puede vender sin abrirla', async () => {
    await configurar({ requiere_caja_abierta: false });
    const otro = entorno.cliente();
    await admin.post('/api/usuarios', { nombre: 'Sin caja', usuario: 'sincaja', contrasena: 'sincaja123', rol: 'cajero' });
    await otro.login('sincaja', 'sincaja123');
    const arroz = await producto(entorno.db, '7501000000011');
    const r = await otro.post('/api/ventas', { metodo_pago: 'credito', trabajador_id: '1', partidas: [{ producto_id: arroz.id, cantidad: '1' }] });
    assert.equal(r.status, 201);
    await configurar({});
  });
});
