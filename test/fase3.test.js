// Crédito por nómina, depuración de ventas viejas, conteo físico,
// lista de compra, utilidad y Excel.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { levantar, producto } from './ayuda.js';
import { semanaNomina } from '../src/libs/fechas.js';

let entorno;
let admin;
let cajero;

before(async () => {
  entorno = await levantar();
  admin = entorno.cliente();
  cajero = entorno.cliente();
  await admin.login('admin', 'Admin123!');
  await cajero.login('cajero', 'Cajero123!');
  await admin.post('/api/caja/abrir', { fondo_inicial: '0' });
  await cajero.post('/api/caja/abrir', { fondo_inicial: '0' });
});

after(() => entorno.cerrar());

const uno = async (sql, bind) => (await entorno.db.query(sql, bind)).rows[0];

async function cuadraInventario() {
  const { rows } = await entorno.db.query(
    `SELECT p.codigo FROM productos p LEFT JOIN movimientos_inventario m ON m.producto_id = p.id
      GROUP BY p.id HAVING p.existencia <> coalesce(sum(m.cantidad), 0)`,
  );
  assert.deepEqual(rows, [], 'la existencia debe coincidir con la suma del historial');
}

async function excelBase64(filas) {
  const libro = new ExcelJS.Workbook();
  const hoja = libro.addWorksheet('Hoja1');
  for (const f of filas) hoja.addRow(f);
  return Buffer.from(await libro.xlsx.writeBuffer()).toString('base64');
}

describe('semana de nómina (sábado a viernes)', () => {
  test('cualquier día cae en la semana que empieza el sábado anterior', () => {
    assert.deepEqual(semanaNomina('2026-11-11'), { inicio: '2026-11-07', fin: '2026-11-13' }); // miércoles
    assert.deepEqual(semanaNomina('2026-11-07'), { inicio: '2026-11-07', fin: '2026-11-13' }); // sábado
    assert.deepEqual(semanaNomina('2026-11-13'), { inicio: '2026-11-07', fin: '2026-11-13' }); // viernes
    assert.deepEqual(semanaNomina('2026-11-08'), { inicio: '2026-11-07', fin: '2026-11-13' }); // domingo
    assert.deepEqual(semanaNomina('2026-11-14'), { inicio: '2026-11-14', fin: '2026-11-20' }); // sábado siguiente
  });
});

describe('trabajadores y ventas a crédito', () => {
  test('solo el administrador da de alta trabajadores; el cajero solo ve activos', async () => {
    assert.equal((await cajero.post('/api/trabajadores', { numero: '9', nombre: 'X' })).status, 403);
    const r = await admin.post('/api/trabajadores', { numero: '2001', nombre: 'Ana Torres', area: 'Ventas' });
    assert.equal(r.status, 201);
    assert.equal((await admin.post('/api/trabajadores', { numero: '2001', nombre: 'Otra' })).status, 409);
    assert.equal((await admin.post('/api/trabajadores', { numero: '', nombre: 'Sin número' })).status, 400);

    await admin.delete(`/api/trabajadores/${r.datos.id}`); // baja
    const lista = (await cajero.get('/api/trabajadores')).datos;
    assert.ok(lista.length >= 3);
    assert.ok(!lista.some((t) => t.numero === '2001'));
    assert.deepEqual(Object.keys(lista[0]).sort(), ['id', 'nombre', 'numero']);

    const arroz = await producto(entorno.db, '7501000000011');
    const v = await cajero.post('/api/ventas', {
      metodo_pago: 'credito', trabajador_id: String(r.datos.id), partidas: [{ producto_id: arroz.id, cantidad: '1' }],
    });
    assert.equal(v.status, 400);
    assert.match(v.datos.error, /dado de baja/);
  });

  test('crédito exige trabajador; tarjeta y transferencia ya no se aceptan', async () => {
    const arroz = await producto(entorno.db, '7501000000011');
    const p = [{ producto_id: arroz.id, cantidad: '1' }];
    const sin = await cajero.post('/api/ventas', { metodo_pago: 'credito', partidas: p });
    assert.equal(sin.status, 400);
    assert.match(sin.datos.error, /trabajador/);
    assert.equal((await cajero.post('/api/ventas', { metodo_pago: 'tarjeta', partidas: p })).status, 400);
    assert.equal((await cajero.post('/api/ventas', { metodo_pago: 'transferencia', partidas: p })).status, 400);
    assert.equal((await cajero.post('/api/ventas', { metodo_pago: 'credito', trabajador_id: '999', partidas: p })).status, 404);
  });

  test('la base rechaza ventas a crédito sin trabajador aunque se inserten desde pgAdmin', async () => {
    await assert.rejects(
      entorno.db.query(
        `INSERT INTO ventas (usuario_id, subtotal, total, metodo_pago, cambio) VALUES (1, 10, 10, 'credito', 0)`,
      ),
      /ventas_credito_con_trabajador/,
    );
    await assert.rejects(
      entorno.db.query(`UPDATE configuracion SET metodos_pago = '{efectivo,tarjeta}'`),
      /configuracion_metodos_validos_v2/,
    );
  });

  test('la venta a crédito guarda trabajador y costo, y no suma al efectivo de la caja', async () => {
    const leche = await producto(entorno.db, '7501000000097'); // $28, costo $22
    const antes = (await cajero.get('/api/caja/actual')).datos.sesion;
    const v = await cajero.post('/api/ventas', {
      metodo_pago: 'credito', trabajador_id: '1', partidas: [{ producto_id: leche.id, cantidad: '2' }],
    });
    assert.equal(v.status, 201);
    const d = (await cajero.get(`/api/ventas/${v.datos.id}`)).datos;
    assert.equal(d.metodo_pago, 'credito');
    assert.equal(d.trabajador.nombre, 'Juan Pérez');
    assert.equal(d.monto_recibido, null);
    const costo = await uno('SELECT costo_unitario::text FROM detalle_ventas WHERE venta_id = $1', [v.datos.id]);
    assert.equal(costo.costo_unitario, '22.00');
    const despues = (await cajero.get('/api/caja/actual')).datos.sesion;
    assert.equal(despues.efectivo_esperado_actual, antes.efectivo_esperado_actual);
    assert.equal(Number(despues.ventas_otros) - Number(antes.ventas_otros), 56);
  });
});

describe('nómina', () => {
  test('resume por trabajador, descuenta una sola vez y avisa si se cancela algo ya descontado', async () => {
    const refresco = await producto(entorno.db, '7501000000066'); // $20
    const v1 = await cajero.post('/api/ventas', {
      metodo_pago: 'credito', trabajador_id: '2', partidas: [{ producto_id: refresco.id, cantidad: '2' }],
    });
    await cajero.post('/api/ventas', {
      metodo_pago: 'credito', trabajador_id: '2', partidas: [{ producto_id: refresco.id, cantidad: '1' }],
    });
    const cancelada = await cajero.post('/api/ventas', {
      metodo_pago: 'credito', trabajador_id: '2', partidas: [{ producto_id: refresco.id, cantidad: '5' }],
    });
    await admin.post(`/api/ventas/${cancelada.datos.id}/cancelar`, { motivo: 'Error de captura' });

    assert.equal((await cajero.get('/api/nomina')).status, 403);
    const s = (await admin.get('/api/nomina')).datos;
    const maria = s.trabajadores.find((t) => t.numero === '1002');
    assert.equal(maria.num_ventas, 2); // la cancelada no cuenta
    assert.equal(Number(maria.total), 60);
    assert.equal(Number(maria.pendiente), 60);

    const det = (await admin.get(`/api/nomina/trabajador/${maria.id}`)).datos;
    assert.equal(det.ventas.length, 2);
    assert.match(det.ventas[0].productos, /Refresco/);

    const pend = (await admin.get('/api/trabajadores')).datos.find((t) => t.numero === '1002');
    assert.equal(Number(pend.pendiente), 60);

    const r = await admin.post('/api/nomina/descontar', { semana: s.inicio, trabajador_id: String(maria.id) });
    assert.equal(r.status, 200);
    assert.equal(r.datos.num_ventas, 2);
    assert.equal(r.datos.total, '60.00');
    assert.equal((await admin.post('/api/nomina/descontar', { semana: s.inicio, trabajador_id: String(maria.id) })).status, 409);
    const s2 = (await admin.get(`/api/nomina?semana=${s.fin}`)).datos;
    assert.equal(Number(s2.trabajadores.find((t) => t.numero === '1002').pendiente), 0);

    const c = await admin.post(`/api/ventas/${v1.datos.id}/cancelar`, { motivo: 'Devolución' });
    assert.match(c.datos.aviso_nomina, /reembolsar \$40\.00/);
  });
});

describe('inventario', () => {
  test('conteo físico ajusta solo lo que no coincide y queda en el historial', async () => {
    const arroz = await producto(entorno.db, '7501000000011');
    const frijol = await producto(entorno.db, '7501000000028');
    const azucar = await producto(entorno.db, '7501000000042');
    const r = await admin.post('/api/inventario/conteo', {
      motivo: 'Inventario mensual',
      partidas: [
        { producto_id: arroz.id, contado: String(Number(arroz.existencia) - 2) },
        { producto_id: frijol.id, contado: String(Number(frijol.existencia) + 1) },
        { producto_id: azucar.id, contado: String(Number(azucar.existencia)) },
      ],
    });
    assert.equal(r.status, 201);
    assert.equal(r.datos.revisados, 3);
    assert.equal(r.datos.ajustados, 2);
    assert.equal(Number((await producto(entorno.db, '7501000000011')).existencia), Number(arroz.existencia) - 2);
    const m = await uno(
      "SELECT tipo, motivo FROM movimientos_inventario WHERE producto_id = $1 ORDER BY id DESC LIMIT 1", [frijol.id],
    );
    assert.equal(m.tipo, 'ajuste_entrada');
    assert.equal(m.motivo, 'Conteo físico: Inventario mensual');
    assert.equal((await cajero.post('/api/inventario/conteo', { partidas: [] })).status, 403);
    assert.equal((await admin.post('/api/inventario/conteo', { partidas: [{ producto_id: arroz.id, contado: '1.5' }] })).status, 400);
    await cuadraInventario();
  });

  test('lista de compra sugerida incluye los productos en o bajo su mínimo', async () => {
    const r = await admin.get('/api/inventario/sugerida');
    assert.equal(r.status, 200);
    const jabon = r.datos.find((p) => p.codigo === '7501000000172'); // existencia 0, mínimo 5
    assert.ok(jabon);
    assert.equal(Number(jabon.sugerido), 10);
    assert.ok(r.datos.every((p) => Number(p.existencia) <= Number(p.stock_minimo)));
  });
});

describe('reportes', () => {
  test('utilidad por día y por producto', async () => {
    const r = (await admin.get('/api/reportes/ventas?orden=utilidad')).datos;
    assert.ok(r.utilidad_por_dia.length >= 1);
    const d = r.utilidad_por_dia[0];
    assert.equal(Number(d.utilidad).toFixed(2), (Number(d.venta_neta) - Number(d.costo)).toFixed(2));
    assert.ok('utilidad' in r.resumen);
    assert.ok('utilidad' in r.mas_vendidos[0]);
    assert.equal((await admin.get('/api/reportes/ventas?orden=x')).status, 400);
    assert.ok(r.por_metodo.some((m) => m.metodo_pago === 'credito'));
  });
});

describe('proveedores y precios', () => {
  test('productos por proveedor, compra manual y cambio de precios en bloque', async () => {
    const provs = (await admin.get('/api/proveedores')).datos;
    const coca = provs.find((p) => p.nombre === 'Coca-Cola');
    assert.equal(coca.num_productos, 3);
    const deCoca = (await admin.get(`/api/productos?proveedor_id=${coca.id}`)).datos;
    assert.deepEqual(deCoca.map((p) => p.proveedor), ['Coca-Cola', 'Coca-Cola', 'Coca-Cola']);
    const manual = (await admin.get('/api/productos?proveedor_id=sin')).datos;
    assert.ok(manual.length >= 3 && manual.every((p) => p.proveedor === null));
    assert.equal((await admin.get('/api/proveedores/sin-proveedor')).datos.num_productos, manual.length);

    const r = await admin.put('/api/productos/precios', {
      productos: deCoca.map((p) => ({ id: p.id, costo: '10.00', precio_venta: '15.50' })),
    });
    assert.equal(r.status, 200);
    assert.equal(r.datos.actualizados, 3);
    const despues = (await admin.get(`/api/productos?proveedor_id=${coca.id}`)).datos;
    assert.ok(despues.every((p) => p.costo === '10.00' && p.precio_venta === '15.50'));
    assert.equal((await cajero.put('/api/productos/precios', { productos: [] })).status, 403);
    assert.equal((await admin.put('/api/productos/precios', { productos: [{ id: deCoca[0].id, costo: '-1' }] })).status, 400);
    assert.equal((await admin.put('/api/productos/precios', { productos: [{ id: '99999', costo: '1' }] })).status, 404);
  });

  test('el proveedor habitual se asigna en el producto y con la primera compra', async () => {
    const provs = (await admin.get('/api/proveedores')).datos;
    const bimbo = provs.find((p) => p.nombre === 'Bimbo');
    const jitomate = await producto(entorno.db, 'INT-0001'); // compra manual
    // Editar el producto sin mandar proveedor no lo cambia; mandarlo vacío lo quita.
    const p = (await admin.get(`/api/productos/${jitomate.id}`)).datos;
    assert.equal(p.proveedor_id, null);
    await admin.post('/api/compras', { proveedor_id: String(bimbo.id), partidas: [{ producto_id: jitomate.id, cantidad: '2', costo_unitario: '19' }] });
    assert.equal((await admin.get(`/api/productos/${jitomate.id}`)).datos.proveedor, 'Bimbo');
    const { categoria, proveedor, nivel_stock, ...campos } = (await admin.get(`/api/productos/${jitomate.id}`)).datos;
    await admin.put(`/api/productos/${jitomate.id}`, { ...campos, proveedor_id: '' });
    assert.equal((await admin.get(`/api/productos/${jitomate.id}`)).datos.proveedor_id, null);
    assert.equal((await admin.put(`/api/productos/${jitomate.id}`, { ...campos, proveedor_id: '99999' })).status, 404);
  });
});

describe('nómina: liquidar varios a la vez', () => {
  test('marca como descontados solo a los trabajadores seleccionados', async () => {
    const atun = await producto(entorno.db, '7501000000059');
    for (const t of ['1', '2', '3']) {
      await cajero.post('/api/ventas', { metodo_pago: 'credito', trabajador_id: t, partidas: [{ producto_id: atun.id, cantidad: '1' }] });
    }
    const r = await admin.post('/api/nomina/descontar', { trabajador_ids: ['1', '3'] });
    assert.equal(r.status, 200);
    const s = (await admin.get('/api/nomina')).datos;
    const pendiente = (num) => Number(s.trabajadores.find((t) => t.numero === num).pendiente);
    assert.equal(pendiente('1001'), 0);
    assert.equal(pendiente('1003'), 0);
    assert.ok(pendiente('1002') > 0);
    assert.equal((await admin.post('/api/nomina/descontar', { trabajador_ids: [] })).status, 400);
  });
});

describe('Excel', () => {

  test('exporta reportes, ventas, productos, nómina, conteo y lista de compra', async () => {
    for (const ruta of ['reporte', 'ventas', 'productos', 'nomina', 'conteo', 'sugerida']) {
      const r = await admin.get(`/api/excel/${ruta}`);
      assert.equal(r.status, 200, ruta);
      assert.ok(r.datos.length > 1000, ruta);
    }
    assert.equal((await cajero.get('/api/excel/productos')).status, 403);
  });

  test('importa productos: alta, actualización y rechazo completo si una fila está mal', async () => {
    const encabezado = ['Código', 'Nombre', 'Categoría', 'Precio venta', 'Costo', 'IVA %', 'Stock mínimo', 'Unidad', 'Existencia'];
    const mal = await admin.post('/api/excel/productos', {
      archivo: await excelBase64([
        encabezado,
        ['XL-001', 'Galleta María', 'Galletas', 18, 12, 0, 5, 'pieza', 24],
        ['XL-002', 'Sin precio', 'Galletas', '', 12, 0, 5, 'pieza', 1],
      ]),
    });
    assert.equal(mal.status, 400);
    assert.match(mal.datos.error, /Fila 3/);
    assert.equal((await entorno.db.query("SELECT 1 FROM productos WHERE codigo = 'XL-001'")).rows.length, 0);

    const ok = await admin.post('/api/excel/productos', {
      archivo: await excelBase64([
        encabezado,
        ['XL-001', 'Galleta María', 'Galletas', 18, 12, 16, 5, 'pz', 24],
        ['7501000000011', 'Arroz 1 kg (nuevo precio)', 'Abarrotes', 33.5, 24, 0, 10, 'pieza', 999],
      ]),
    });
    assert.equal(ok.status, 200);
    assert.deepEqual(ok.datos, { nuevos: 1, actualizados: 1, categorias_nuevas: 1 });
    const g = await uno("SELECT existencia::text, tasa_iva::text FROM productos WHERE codigo = 'XL-001'");
    assert.deepEqual(g, { existencia: '24.000', tasa_iva: '0.1600' });
    const arroz = await uno("SELECT precio_venta::text, existencia::text FROM productos WHERE codigo = '7501000000011'");
    assert.equal(arroz.precio_venta, '33.50');
    assert.notEqual(arroz.existencia, '999.000'); // la existencia no se cambia al importar
    await cuadraInventario();
  });

  test('importa trabajadores: alta, actualización por número y rechazo completo si una fila está mal', async () => {
    const mal = await admin.post('/api/excel/trabajadores', {
      archivo: await excelBase64([
        ['Número', 'Nombre', 'Área'],
        [5001, 'Pedro Gómez', 'Ventas'],
        [5002, '', 'Ventas'],
        [5001, 'Repetido', ''],
      ]),
    });
    assert.equal(mal.status, 400);
    assert.match(mal.datos.error, /Fila 3/);
    assert.match(mal.datos.error, /repetido/);
    assert.equal((await entorno.db.query("SELECT 1 FROM trabajadores WHERE numero = '5001'")).rows.length, 0);

    const ok = await admin.post('/api/excel/trabajadores', {
      archivo: await excelBase64([
        ['Lista de trabajadores'],
        [],
        ['Número', 'Nombre', 'Departamento'],
        [5001, 'Pedro Gómez', 'Ventas'],
        ['1001', 'Juan Pérez Sánchez', 'Almacén'],
      ]),
    });
    assert.equal(ok.status, 200);
    assert.deepEqual(ok.datos, { nuevos: 1, actualizados: 1 });
    const { rows } = await entorno.db.query("SELECT numero, nombre, area FROM trabajadores WHERE numero IN ('5001', '1001') ORDER BY numero");
    assert.deepEqual(rows, [
      { numero: '1001', nombre: 'Juan Pérez Sánchez', area: 'Almacén' },
      { numero: '5001', nombre: 'Pedro Gómez', area: 'Ventas' },
    ]);
    const plantilla = await admin.get('/api/excel/trabajadores');
    assert.equal(plantilla.status, 200);
    assert.equal((await cajero.post('/api/excel/trabajadores', { archivo: 'x' })).status, 403);
  });

  test('lee una hoja de conteo para revisarla antes de aplicar', async () => {

    const r = await admin.post('/api/excel/conteo', {
      archivo: await excelBase64([
        ['Código', 'Producto', 'Contado'],
        ['7501000000035', 'Aceite', 7],
        ['NO-EXISTE', 'x', 1],
        ['7501000000059', 'Atún', null],
      ]),
    });
    assert.equal(r.status, 200);
    assert.equal(r.datos.partidas.length, 1);
    assert.equal(r.datos.partidas[0].contado, '7');
    assert.equal(r.datos.no_encontrados.length, 1);
    assert.equal((await admin.post('/api/excel/conteo', { archivo: 'no es excel' })).status, 400);
  });
});

describe('depuración de ventas de hace más de un año', () => {
  test('borra ventas viejas, conserva el crédito pendiente y la existencia sigue cuadrando', async () => {
    const atun = await producto(entorno.db, '7501000000059');
    const p = [{ producto_id: atun.id, cantidad: '1' }];
    const vieja = await cajero.post('/api/ventas', { metodo_pago: 'efectivo', monto_recibido: '100', partidas: p });
    const viejaCancelada = await cajero.post('/api/ventas', { metodo_pago: 'efectivo', monto_recibido: '100', partidas: p });
    await admin.post(`/api/ventas/${viejaCancelada.datos.id}/cancelar`, { motivo: 'x' });
    const creditoPendiente = await cajero.post('/api/ventas', { metodo_pago: 'credito', trabajador_id: '3', partidas: p });
    const reciente = await cajero.post('/api/ventas', { metodo_pago: 'efectivo', monto_recibido: '100', partidas: p });
    const ids = [vieja, viejaCancelada, creditoPendiente].map((v) => v.datos.id);
    // Simular que pasaron dos años.
    await entorno.db.query("UPDATE ventas SET fecha = now() - interval '2 years' WHERE id = ANY($1::int[])", [ids]);
    await entorno.db.query(
      "UPDATE movimientos_inventario SET fecha = now() - interval '2 years' WHERE venta_id = ANY($1::int[]) OR (producto_id = $2 AND tipo = 'inicial')",
      [ids, atun.id],
    );
    const existenciaAntes = (await producto(entorno.db, '7501000000059')).existencia;

    assert.equal((await cajero.get('/api/mantenimiento/depuracion')).status, 403);
    const previa = (await admin.get('/api/mantenimiento/depuracion')).datos;
    assert.equal(previa.ventas, 2);
    assert.equal(previa.canceladas, 1);
    assert.equal(previa.credito_pendiente, 1);
    assert.equal(previa.respaldos_disponibles, false);

    // En pruebas no hay pg_dump: con respaldo falla y no borra nada.
    assert.equal((await admin.post('/api/mantenimiento/depuracion', {})).status, 409);
    const r = await admin.post('/api/mantenimiento/depuracion', { respaldar: false });
    assert.equal(r.status, 200);
    assert.equal(r.datos.ventas, 2);
    assert.equal(r.datos.respaldo, null);

    const quedan = (await entorno.db.query('SELECT id FROM ventas WHERE id = ANY($1::int[]) ORDER BY id', [[...ids, reciente.datos.id]])).rows;
    assert.deepEqual(quedan.map((x) => x.id), [creditoPendiente.datos.id, reciente.datos.id]);
    assert.equal((await producto(entorno.db, '7501000000059')).existencia, existenciaAntes);
    const saldo = await uno("SELECT cantidad::text FROM movimientos_inventario WHERE producto_id = $1 AND tipo = 'saldo_depurado'", [atun.id]);
    assert.ok(saldo);
    await cuadraInventario();

    assert.equal((await admin.post('/api/mantenimiento/depuracion', { respaldar: false })).status, 409); // ya no hay nada
    assert.equal((await admin.get('/api/mantenimiento/respaldos')).datos.disponibles, false);
    assert.equal((await admin.post('/api/mantenimiento/respaldos', {})).status, 409);
    assert.equal((await admin.get('/api/mantenimiento/respaldos/..%2F.env')).status, 400);
  });
});
