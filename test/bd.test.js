import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { levantar, producto } from './ayuda.js';
import { prepararBaseDeDatos } from '../src/libs/sequelize.js';

let entorno;
let admin;
let cajero;

before(async () => {
  entorno = await levantar();
  admin = entorno.cliente();
  cajero = entorno.cliente();
  await admin.login('admin', 'Admin123!');
  await cajero.login('cajero', 'Cajero123!');
});

after(() => entorno.cerrar());

async function conteo() {
  const uno = async (sql) => (await entorno.db.query(sql)).rows[0].n;
  return {
    tablas: await uno("SELECT count(*)::int n FROM information_schema.tables WHERE table_schema = 'public'"),
    indices: await uno("SELECT count(*)::int n FROM pg_indexes WHERE schemaname = 'public'"),
    restricciones: await uno(
      "SELECT count(*)::int n FROM pg_constraint c JOIN pg_namespace s ON s.oid = c.connamespace WHERE s.nspname = 'public'",
    ),
    usuarios: await uno('SELECT count(*)::int n FROM usuarios'),
    productos: await uno('SELECT count(*)::int n FROM productos'),
  };
}

test('los modelos crean las 14 tablas y reiniciar el servidor no duplica nada', async () => {
  const antes = await conteo();
  assert.equal(antes.tablas, 14);
  await prepararBaseDeDatos({ datosDePrueba: true }); // como un segundo arranque
  assert.deepEqual(await conteo(), antes);
});

test('las reglas se cumplen aunque se inserte desde pgAdmin', async () => {
  // Fecha y folio los pone la base de datos.
  const { rows } = await entorno.db.query(
    `INSERT INTO compras (proveedor_id, usuario_id, total) VALUES (1, 1, 0) RETURNING folio, fecha`,
  );
  assert.match(rows[0].folio, /^C-\d{6}$/);
  assert.ok(rows[0].fecha);
  await assert.rejects(entorno.db.query("UPDATE productos SET unidad = 'caja' WHERE id = 1"), /productos_unidad_valida/);
  await assert.rejects(entorno.db.query("UPDATE usuarios SET rol = 'jefe' WHERE id = 1"), /usuarios_rol_valido/);
  await assert.rejects(
    entorno.db.query("INSERT INTO sesiones_caja (usuario_id, fondo_inicial) VALUES (1, 0), (1, 0)"),
    /sesiones_caja_una_abierta|unique/i,
  );
});

test('borrar (DELETE) desactiva y conserva el historial', async () => {
  const arroz = await producto(entorno.db, '7501000000011');
  assert.equal((await cajero.delete(`/api/productos/${arroz.id}`)).status, 403);
  const r = await admin.delete(`/api/productos/${arroz.id}`);
  assert.equal(r.status, 200);
  const { rows } = await entorno.db.query('SELECT activo FROM productos WHERE id = $1', [arroz.id]);
  assert.equal(rows[0].activo, false);

  const prov = await admin.delete('/api/proveedores/2');
  assert.equal(prov.datos.activo, false);
  const cat = await admin.delete('/api/categorias/6');
  assert.equal(cat.datos.activo, false);

  const yo = (await admin.get('/api/auth/yo')).datos.usuario;
  assert.equal((await admin.delete(`/api/usuarios/${yo.id}`)).status, 400);
});

test('las respuestas siguen el formato de biblioteca', async () => {
  const res = await fetch(`${entorno.base}/api/categorias`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: '' },
    body: JSON.stringify({ nombre: 'x' }),
  });
  const cuerpo = await res.json();
  assert.equal(res.status, 401);
  assert.deepEqual(Object.keys(cuerpo).sort(), ['message', 'success']);
  assert.equal(cuerpo.success, false);
});
