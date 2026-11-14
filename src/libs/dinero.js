/**
 * Aritmética de punto fijo con enteros para evitar errores de redondeo
 * de los números de punto flotante.
 *
 * Escalas usadas:
 *   2 → centavos            (precios, importes)
 *   3 → milésimas de unidad (cantidades: permite 0.250 kg)
 *   4 → diezmilésimas       (tasas de IVA: 0.1600)
 */

/** Convierte "12.5" o 12.5 a entero escalado. Devuelve null si no es válido. */
export function aEntero(valor, escala) {
  if (valor === null || valor === undefined) return null;
  const s = String(valor).trim();
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const [ent, dec = ''] = s.split('.');
  // Aceptar ceros sobrantes ("32.000" con escala 2), rechazar precisión real extra.
  const decRecortado = dec.replace(/0+$/, '');
  if (decRecortado.length > escala) return null;
  const n = Number(ent + decRecortado.padEnd(escala, '0'));
  return Number.isSafeInteger(n) ? n : null;
}

/** Como aEntero, pero acepta signo negativo (existencias con sobreventa). */
export function aEnteroSigno(valor, escala) {
  const s = String(valor ?? '').trim();
  if (s.startsWith('-')) {
    const n = aEntero(s.slice(1), escala);
    return n === null ? null : -n;
  }
  return aEntero(s, escala);
}

/** Convierte un entero escalado a texto decimal: (1250, 2) → "12.50". */
export function aTexto(entero, escala) {
  const neg = entero < 0;
  const s = String(Math.abs(entero)).padStart(escala + 1, '0');
  const r = `${s.slice(0, -escala)}.${s.slice(-escala)}`;
  return neg ? `-${r}` : r;
}

/** Redondeo "mitad hacia arriba" de a / b para enteros no negativos. */
function dividirRedondeando(a, b) {
  return (2n * a + b) / (2n * b);
}

/**
 * Importe de una partida en centavos: round(cantidad × precio, 2).
 * Coincide con round() de PostgreSQL para valores positivos.
 */
export function importe(cantidadMil, precioCent) {
  return Number(dividirRedondeando(BigInt(cantidadMil) * BigInt(precioCent), 1000n));
}

/** IVA contenido en un importe con IVA incluido: importe × t / (1 + t). */
export function ivaContenido(importeCent, tasaDiezMil) {
  const t = BigInt(tasaDiezMil);
  return Number(dividirRedondeando(BigInt(importeCent) * t, 10000n + t));
}

/** IVA que se agrega a un importe sin IVA: importe × t. */
export function ivaSobre(importeCent, tasaDiezMil) {
  return Number(dividirRedondeando(BigInt(importeCent) * BigInt(tasaDiezMil), 10000n));
}

/** Prorratea un valor: round(valor × num / den). */
export function prorratear(valor, num, den) {
  if (den === 0) return 0;
  return Number(dividirRedondeando(BigInt(valor) * BigInt(num), BigInt(den)));
}
