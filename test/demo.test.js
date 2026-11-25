// Datos de demostración: que cada sección tenga información y que todo
// cuadre (existencias con su historial, cortes de caja, fechas).
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { levantar } from './ayuda.js';
import { cargarDemostracion } from '../src/libs/demostracion.js';

let entorno;
let resultado;

before(async () => {
  entorno = await levantar();
  resultado = await cargarDemostracion({ dias: 8 });
});

after(() => entorno.cerrar());

const filas = async (sql) => (await entorno.db.query(sql)).rows;

test('la demostración llena ventas, caja, compras, inventario y nómina', async () => {
  assert.ok(resultado.ventas > 20);
  assert.ok(resultado.cortes >= 8);
  assert.ok(resultado.compras >= 2);
  const [c] = await filas(`SELECT
      (SELECT count(*) FROM ventas WHERE metodo_pago = 'credito')::int AS credito,
      (SELECT count(*) FROM sesiones_caja WHERE estado = 'abierta')::int AS abiertas,
      (SELECT count(*) FROM movimientos_caja)::int AS movimientos_caja,
      (SELECT count(*) FROM usuarios)::int AS usuarios`);
  assert.ok(c.credito > 0);
  assert.equal(c.abiertas, 1); // la caja de hoy sigue abierta
  assert.ok(c.movimientos_caja > 0);
  assert.equal(c.usuarios, 3);
  // Nadie tiene que cambiar contraseña en la demo.
  assert.deepEqual(await filas('SELECT usuario FROM usuarios WHERE debe_cambiar_contrasena'), []);
});

test('la existencia de cada producto cuadra con su historial y nunca es negativa', async () => {
  const descuadres = await filas(`
    SELECT p.codigo, p.existencia, coalesce(sum(m.cantidad), 0) AS historial
      FROM productos p LEFT JOIN movimientos_inventario m ON m.producto_id = p.id
     GROUP BY p.id HAVING p.existencia <> coalesce(sum(m.cantidad), 0) OR p.existencia < 0`);
  assert.deepEqual(descuadres, []);
});

test('las fechas quedan repartidas en el pasado, en horario de tienda', async () => {
  const [f] = await filas(`SELECT
      (SELECT count(*) FROM ventas WHERE fecha > now())::int AS futuras,
      (SELECT count(DISTINCT (fecha AT TIME ZONE 'America/Mexico_City')::date) FROM ventas)::int AS dias,
      (SELECT count(*) FROM sesiones_caja s WHERE EXISTS (
         SELECT 1 FROM ventas v WHERE v.sesion_caja_id = s.id
            AND (v.fecha < s.abierta_en OR (s.cerrada_en IS NOT NULL AND v.fecha > s.cerrada_en))))::int AS fuera_de_caja`);
  assert.equal(f.futuras, 0);
  assert.equal(f.dias, 9);
  assert.equal(f.fuera_de_caja, 0); // cada venta ocurrió con su caja abierta
});

test('no se carga dos veces sobre una base con ventas', async () => {
  await assert.rejects(cargarDemostracion(), /ya tiene ventas/);
});
