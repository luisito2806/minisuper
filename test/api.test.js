import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { levantar, producto } from './ayuda.js';

let entorno;
let admin;
let cajero;

before(async () => {
  entorno = await levantar();
  admin = entorno.cliente();
  cajero = entorno.cliente();
  await admin.login('admin', 'Admin123!');
  await cajero.login('cajero', 'Cajero123!');
  // Por defecto se requiere caja abierta para vender.
  await admin.post('/api/caja/abrir', { fondo_inicial: '500' });
  await cajero.post('/api/caja/abrir', { fondo_inicial: '500' });
});

after(() => entorno.cerrar());

describe('acceso', () => {
  test('rechaza credenciales incorrectas sin decir cuál falló', async () => {
    const c = entorno.cliente();
    const r1 = await c.post('/api/auth/login', { usuario: 'admin', contrasena: 'mala' });
    const r2 = await c.post('/api/auth/login', { usuario: 'noexiste', contrasena: 'mala' });
    assert.equal(r1.status, 401);
    assert.equal(r1.datos.error, r2.datos.error);
  });

  test('un usuario creado por el administrador debe cambiar su contraseña antes de usar el sistema', async () => {
    await admin.post('/api/usuarios', { nombre: 'Nuevo', usuario: 'nuevo1', contrasena: 'temporal123', rol: 'cajero' });
    const c = entorno.cliente();
    const r = await c.login('nuevo1', 'temporal123');
    assert.equal(r.datos.usuario.debe_cambiar_contrasena, true);
    const bloqueada = await c.get('/api/productos');
    assert.equal(bloqueada.status, 403);
    assert.match(bloqueada.datos.error, /Cambia tu contraseña/);
    assert.equal((await c.get('/api/auth/yo')).datos.usuario.debe_cambiar_contrasena, true);
    // La nueva no puede ser igual a la actual.
    assert.equal((await c.post('/api/auth/cambiar-contrasena', { actual: 'temporal123', nueva: 'temporal123' })).status, 400);
    assert.equal((await c.post('/api/auth/cambiar-contrasena', { actual: 'temporal123', nueva: 'mi-clave-propia' })).status, 200);
    assert.equal((await c.get('/api/productos')).status, 200);

    // Si el administrador le pone otra contraseña, se le vuelve a pedir cambiarla.
    const { rows } = await entorno.db.query("SELECT id FROM usuarios WHERE usuario = 'nuevo1'");
    await admin.put(`/api/usuarios/${rows[0].id}`, { nombre: 'Nuevo', rol: 'cajero', activo: true, contrasena: 'otra-temporal' });
    assert.equal((await c.get('/api/productos')).status, 403);
  });

  test('después de 5 intentos fallidos se bloquea el usuario 5 minutos', async () => {
    await admin.post('/api/usuarios', { nombre: 'Bloqueo', usuario: 'bloqueo1', contrasena: 'correcta123', rol: 'cajero' });
    const c = entorno.cliente();
    for (let i = 0; i < 5; i++) {
      assert.equal((await c.post('/api/auth/login', { usuario: 'bloqueo1', contrasena: 'mala' })).status, 401);
    }
    const r = await c.post('/api/auth/login', { usuario: 'Bloqueo1', contrasena: 'correcta123' });
    assert.equal(r.status, 429);
    // Otros usuarios no se ven afectados.
    assert.equal((await entorno.cliente().post('/api/auth/login', { usuario: 'cajero', contrasena: 'Cajero123!' })).status, 200);
  });

  test('sin sesión no se puede usar la API', async () => {
    const r = await entorno.cliente().get('/api/productos');
    assert.equal(r.status, 401);
  });

  test('las contraseñas se guardan con hash', async () => {
    const { rows } = await entorno.db.query("SELECT contrasena_hash FROM usuarios WHERE usuario = 'admin'");
    assert.match(rows[0].contrasena_hash, /^\$2[aby]\$/);
  });

  test('el cajero no puede ejecutar acciones de administrador por llamada directa', async () => {
    const arroz = await producto(entorno.db, '7501000000011');
    const intentos = [
      cajero.get('/api/usuarios'),
      cajero.post('/api/usuarios', { nombre: 'X', usuario: 'xx1', contrasena: '12345678', rol: 'administrador' }),
      cajero.put(`/api/productos/${arroz.id}`, { codigo: 'X', nombre: 'X', categoria_id: '1', precio_venta: '1', costo: '1' }),
      cajero.post('/api/compras', { proveedor_id: '1', partidas: [] }),
      cajero.get('/api/reportes/ventas'),
      cajero.post('/api/ventas/1/cancelar', { motivo: 'x' }),
      cajero.get('/api/proveedores'),
    ];
    for (const r of await Promise.all(intentos)) assert.equal(r.status, 403);
  });

  test('el cajero no ve el costo de los productos', async () => {
    const r = await cajero.get('/api/productos');
    assert.equal(r.status, 200);
    assert.ok(r.datos.length > 0);
    assert.ok(!('costo' in r.datos[0]));
  });

  test('un usuario desactivado pierde la sesión de inmediato', async () => {
    const nuevo = await admin.post('/api/usuarios', {
      nombre: 'Temporal', usuario: 'temporal', contrasena: 'temporal123', rol: 'cajero',
    });
    assert.equal(nuevo.status, 201);
    const c = entorno.cliente();
    await c.entrarNuevo('temporal', 'temporal123');
    assert.equal((await c.get('/api/productos')).status, 200);
    await admin.put(`/api/usuarios/${nuevo.datos.id}`, { nombre: 'Temporal', rol: 'cajero', activo: false });
    assert.equal((await c.get('/api/productos')).status, 401);
  });

  test('las peticiones que no son JSON se rechazan', async () => {
    const res = await fetch(`${entorno.base}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'usuario=admin&contrasena=Admin123!',
    });
    assert.equal(res.status, 415);
  });
});

describe('productos', () => {
  test('código duplicado se rechaza', async () => {
    const r = await admin.post('/api/productos', {
      codigo: '7501000000011', nombre: 'Otro arroz', categoria_id: '1', precio_venta: '10', costo: '5',
    });
    assert.equal(r.status, 409);
  });

  test('valores negativos y vacíos se rechazan', async () => {
    const base = { codigo: 'NUEVO-1', nombre: 'Nuevo', categoria_id: '1', precio_venta: '10', costo: '5' };
    assert.equal((await admin.post('/api/productos', { ...base, precio_venta: '-1' })).status, 400);
    assert.equal((await admin.post('/api/productos', { ...base, nombre: '   ' })).status, 400);
    assert.equal((await admin.post('/api/productos', { ...base, existencia: '1.5' })).status, 400); // pieza
  });

  test('busca por nombre o código', async () => {
    const porNombre = await cajero.get('/api/productos?q=leche');
    assert.ok(porNombre.datos.some((p) => p.codigo === '7501000000097'));
    const porCodigo = await cajero.get('/api/productos/codigo/7501000000097');
    assert.equal(porCodigo.datos.nombre, 'Leche entera 1 L');
  });
});

describe('ventas', () => {
  test('venta en efectivo: folio, partidas, cambio y descuento de inventario', async () => {
    const refresco = await producto(entorno.db, '7501000000066'); // 20.00, IVA 16%
    const jitomate = await producto(entorno.db, 'INT-0001'); // 28.00/kg, IVA 0%
    const r = await cajero.post('/api/ventas', {
      metodo_pago: 'efectivo',
      monto_recibido: '100',
      partidas: [
        { producto_id: refresco.id, cantidad: '2' },
        { producto_id: jitomate.id, cantidad: '0.750' },
        { producto_id: refresco.id, cantidad: '1' }, // repetido: se suma
      ],
    });
    assert.equal(r.status, 201, JSON.stringify(r.datos));
    assert.match(r.datos.folio, /^V-\d{6}$/);
    assert.equal(r.datos.total, '81.00'); // 3×20 + 0.75×28 = 60 + 21
    assert.equal(r.datos.cambio, '19.00');

    const detalle = await cajero.get(`/api/ventas/${r.datos.id}`);
    assert.equal(detalle.datos.partidas.length, 2);
    assert.equal(detalle.datos.impuestos, '8.28'); // 60 × 0.16 / 1.16
    assert.equal(detalle.datos.usuario_id, (await cajero.get('/api/auth/yo')).datos.usuario.id);

    assert.equal(Number((await producto(entorno.db, '7501000000066')).existencia), Number(refresco.existencia) - 3);
    assert.equal(Number((await producto(entorno.db, 'INT-0001')).existencia), Number(jitomate.existencia) - 0.75);
  });

  test('no permite vender más de lo disponible y no deja nada a medias', async () => {
    const chocolate = await producto(entorno.db, '7501000000141'); // existencia 3
    const arroz = await producto(entorno.db, '7501000000011');
    const ventasAntes = (await entorno.db.query('SELECT count(*)::int AS n FROM ventas')).rows[0].n;

    const r = await cajero.post('/api/ventas', {
      metodo_pago: 'credito', trabajador_id: '1',
      partidas: [
        { producto_id: arroz.id, cantidad: '1' },
        { producto_id: chocolate.id, cantidad: '4' },
      ],
    });
    assert.equal(r.status, 409);
    assert.match(r.datos.error, /Existencia insuficiente/);
    assert.equal((await entorno.db.query('SELECT count(*)::int AS n FROM ventas')).rows[0].n, ventasAntes);
    assert.equal((await producto(entorno.db, '7501000000011')).existencia, arroz.existencia);
  });

  test('pago insuficiente, producto agotado, fracción de pieza y descuento de cajero se rechazan', async () => {
    const arroz = await producto(entorno.db, '7501000000011');
    const jabon = await producto(entorno.db, '7501000000172'); // existencia 0
    const p = [{ producto_id: arroz.id, cantidad: '1' }];
    assert.equal((await cajero.post('/api/ventas', { metodo_pago: 'efectivo', monto_recibido: '10', partidas: p })).status, 400);
    assert.equal((await cajero.post('/api/ventas', { metodo_pago: 'efectivo', partidas: p })).status, 400);
    assert.equal((await cajero.post('/api/ventas', { metodo_pago: 'credito', trabajador_id: '1', partidas: [{ producto_id: jabon.id, cantidad: '1' }] })).status, 409);
    assert.equal((await cajero.post('/api/ventas', { metodo_pago: 'credito', trabajador_id: '1', partidas: [{ producto_id: arroz.id, cantidad: '0.5' }] })).status, 400);
    assert.equal((await cajero.post('/api/ventas', { metodo_pago: 'credito', trabajador_id: '1', partidas: [{ producto_id: arroz.id, cantidad: '-1' }] })).status, 400);
    assert.equal((await cajero.post('/api/ventas', { metodo_pago: 'credito', trabajador_id: '1', descuento: '5', partidas: p })).status, 403);
    assert.equal((await cajero.post('/api/ventas', { metodo_pago: 'credito', trabajador_id: '1', partidas: [] })).status, 400);
  });

  test('producto inactivo no se puede vender', async () => {
    const r = await admin.post('/api/productos', {
      codigo: 'INACT-1', nombre: 'Inactivo', categoria_id: '1', precio_venta: '10', costo: '5',
      existencia: '10', activo: false,
    });
    const v = await cajero.post('/api/ventas', { metodo_pago: 'credito', trabajador_id: '1', partidas: [{ producto_id: r.datos.id, cantidad: '1' }] });
    assert.equal(v.status, 400);
  });

  test('descuento del administrador ajusta total e impuestos', async () => {
    const refresco = await producto(entorno.db, '7501000000066');
    const r = await admin.post('/api/ventas', {
      metodo_pago: 'credito', trabajador_id: '2',
      descuento: '10',
      partidas: [{ producto_id: refresco.id, cantidad: '5' }], // 100.00
    });
    assert.equal(r.status, 201);
    const d = await admin.get(`/api/ventas/${r.datos.id}`);
    assert.equal(d.datos.subtotal, '100.00');
    assert.equal(d.datos.total, '90.00');
    assert.equal(d.datos.impuestos, '12.41'); // 13.79 × 0.9
  });

  test('cancelación: solo admin, con motivo, repone inventario una sola vez', async () => {
    const leche = await producto(entorno.db, '7501000000097');
    const venta = await cajero.post('/api/ventas', {
      metodo_pago: 'credito', trabajador_id: '1',
      partidas: [{ producto_id: leche.id, cantidad: '4' }],
    });
    const url = `/api/ventas/${venta.datos.id}/cancelar`;
    assert.equal((await admin.post(url, { motivo: '  ' })).status, 400);

    const c1 = await admin.post(url, { motivo: 'Cliente devolvió la mercancía' });
    assert.equal(c1.status, 200);
    assert.equal(c1.datos.estado, 'cancelada');
    assert.equal((await producto(entorno.db, '7501000000097')).existencia, leche.existencia);

    const c2 = await admin.post(url, { motivo: 'otra vez' });
    assert.equal(c2.status, 409);
    assert.equal((await producto(entorno.db, '7501000000097')).existencia, leche.existencia);

    const d = await admin.get(`/api/ventas/${venta.datos.id}`);
    assert.equal(d.datos.partidas.length, 1); // el registro original se conserva
    assert.equal(d.datos.cancelada_por_nombre, 'Administrador');
  });

  test('el cajero no ve ventas de otros', async () => {
    const arroz = await producto(entorno.db, '7501000000011');
    const v = await admin.post('/api/ventas', { metodo_pago: 'credito', trabajador_id: '1', partidas: [{ producto_id: arroz.id, cantidad: '1' }] });
    assert.equal((await cajero.get(`/api/ventas/${v.datos.id}`)).status, 404);
    const lista = await cajero.get('/api/ventas');
    assert.ok(lista.datos.every((x) => x.cajero === 'Cajero 1'));
  });

  test('ventas simultáneas no venden la misma última unidad dos veces', async () => {
    const r = await admin.post('/api/productos', {
      codigo: 'ULTIMO-1', nombre: 'Última pieza', categoria_id: '1', precio_venta: '10', costo: '5', existencia: '1',
    });
    const cuerpo = { metodo_pago: 'credito', trabajador_id: '1', partidas: [{ producto_id: r.datos.id, cantidad: '1' }] };
    const resultados = await Promise.all([cajero.post('/api/ventas', cuerpo), admin.post('/api/ventas', cuerpo)]);
    assert.deepEqual(resultados.map((x) => x.status).sort(), [201, 409]);
    assert.equal(Number((await producto(entorno.db, 'ULTIMO-1')).existencia), 0);
  });

  test('la base de datos rechaza una venta incoherente aunque se salte la API', async () => {
    await assert.rejects(
      entorno.db.query(
        `INSERT INTO ventas (usuario_id, subtotal, total, metodo_pago, monto_recibido, cambio)
         VALUES (1, 100, 50, 'efectivo', 100, 50)`,
      ),
      /ventas_total_cuadra/,
    );
    await assert.rejects(
      entorno.db.query(
        `INSERT INTO movimientos_inventario (producto_id, usuario_id, tipo, cantidad, existencia_anterior, existencia_nueva)
         VALUES (1, 1, 'ajuste_salida', -1, 10, 5)`,
      ),
      /movimientos_inventario_cuadra/,
    );
  });
});

describe('compras', () => {
  test('una compra aumenta existencias y actualiza el costo', async () => {
    const atun = await producto(entorno.db, '7501000000059');
    const r = await admin.post('/api/compras', {
      proveedor_id: '1',
      notas: 'Factura A-123',
      partidas: [{ producto_id: atun.id, cantidad: '24', costo_unitario: '15.50' }],
    });
    assert.equal(r.status, 201, JSON.stringify(r.datos));
    assert.match(r.datos.folio, /^C-\d{6}$/);
    assert.equal(r.datos.total, '372.00');
    const despues = await producto(entorno.db, '7501000000059');
    assert.equal(Number(despues.existencia), Number(atun.existencia) + 24);
    assert.equal(despues.costo, '15.50');
    assert.equal((await admin.get(`/api/compras/${r.datos.id}`)).datos.partidas.length, 1);
  });

  test('una compra con un error no se guarda a medias', async () => {
    const atun = await producto(entorno.db, '7501000000059');
    const comprasAntes = (await entorno.db.query('SELECT count(*)::int AS n FROM compras')).rows[0].n;
    const r = await admin.post('/api/compras', {
      proveedor_id: '1',
      partidas: [
        { producto_id: atun.id, cantidad: '10', costo_unitario: '15' },
        { producto_id: '999999', cantidad: '1', costo_unitario: '1' },
      ],
    });
    assert.equal(r.status, 404);
    assert.equal((await entorno.db.query('SELECT count(*)::int AS n FROM compras')).rows[0].n, comprasAntes);
    assert.equal((await producto(entorno.db, '7501000000059')).existencia, atun.existencia);
  });
});

describe('reportes', () => {
  test('resumen de ventas excluye canceladas y desglosa importes', async () => {
    const r = await admin.get('/api/reportes/ventas');
    assert.equal(r.status, 200);
    const { resumen, por_metodo, mas_vendidos } = r.datos;
    assert.ok(resumen.num_ventas >= 1);
    assert.ok(resumen.num_canceladas >= 1);
    assert.equal(
      Number(resumen.bruto) - Number(resumen.descuentos),
      Number(resumen.total),
    );
    assert.ok(por_metodo.length >= 1);
    assert.ok(mas_vendidos.length >= 1);
  });

  test('inventario reporta agotados y bajos', async () => {
    const r = await admin.get('/api/reportes/inventario');
    assert.ok(r.datos.alertas.some((p) => p.codigo === '7501000000172' && p.nivel_stock === 'agotado'));
    assert.ok(r.datos.alertas.some((p) => p.codigo === '7501000000141' && p.nivel_stock === 'bajo'));
  });

  test('filtro de fechas valida el formato', async () => {
    assert.equal((await admin.get('/api/reportes/ventas?desde=ayer')).status, 400);
    const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' });
    assert.equal((await admin.get(`/api/reportes/ventas?desde=${hoy}&hasta=${hoy}`)).status, 200);
  });
});
