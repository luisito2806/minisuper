import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aEntero, aTexto, importe, ivaContenido, prorratear } from '../src/libs/dinero.js';

test('aEntero convierte decimales sin errores de punto flotante', () => {
  assert.equal(aEntero('0.1', 2), 10);
  assert.equal(aEntero('19.99', 2), 1999);
  assert.equal(aEntero('32.000', 2), 3200); // ceros sobrantes de PostgreSQL
  assert.equal(aEntero(1.5, 3), 1500);
  assert.equal(aEntero('0.1600', 4), 1600);
});

test('aEntero rechaza valores inválidos', () => {
  for (const malo of ['-1', 'abc', '1.234', '', '1e5', ' ', '1.', null, undefined]) {
    assert.equal(aEntero(malo, 2), null, `debió rechazar ${malo}`);
  }
});

test('aTexto da formato con decimales fijos', () => {
  assert.equal(aTexto(1999, 2), '19.99');
  assert.equal(aTexto(5, 2), '0.05');
  assert.equal(aTexto(250, 3), '0.250');
});

test('importe redondea a centavos igual que PostgreSQL', () => {
  assert.equal(importe(3000, 1999), 5997); // 3 × 19.99
  assert.equal(importe(250, 2800), 700); // 0.250 kg × 28.00
  assert.equal(importe(333, 1000), 333); // 0.333 × 10.00 = 3.33
  assert.equal(importe(1005, 100), 101); // 1.005 × 1.00 = 1.005 → 1.01
});

test('IVA contenido y prorrateo', () => {
  assert.equal(ivaContenido(11600, 1600), 1600); // 116.00 con IVA → 16.00
  assert.equal(ivaContenido(5000, 0), 0);
  assert.equal(prorratear(1600, 9000, 10000), 1440);
  assert.equal(prorratear(100, 1, 0), 0);
});
