import { ErrorApp } from './errores.js';
import { aEntero } from './dinero.js';

const invalido = (mensaje) => new ErrorApp(400, mensaje);

/** Texto recortado. Con `requerido`, no puede quedar vacío. */
export function texto(valor, campo, { max = 255, requerido = false } = {}) {
  if (valor === undefined || valor === null || valor === '') {
    if (requerido) throw invalido(`El campo "${campo}" es obligatorio.`);
    return null;
  }
  if (typeof valor !== 'string') throw invalido(`El campo "${campo}" debe ser texto.`);
  const v = valor.trim();
  if (!v) {
    if (requerido) throw invalido(`El campo "${campo}" es obligatorio.`);
    return null;
  }
  if (v.length > max) throw invalido(`El campo "${campo}" admite máximo ${max} caracteres.`);
  return v;
}

/** Identificador numérico positivo (se maneja como texto porque es BIGINT). */
export function id(valor, campo = 'id') {
  const s = String(valor ?? '').trim();
  if (!/^[1-9]\d{0,17}$/.test(s)) throw invalido(`El campo "${campo}" no es un identificador válido.`);
  return s;
}

/**
 * Número decimal no negativo convertido a entero escalado.
 * Opciones: escala, positivo (> 0), max (en unidades sin escalar).
 */
export function decimal(valor, campo, { escala, positivo = false, max, requerido = true } = {}) {
  if (valor === undefined || valor === null || valor === '') {
    if (requerido) throw invalido(`El campo "${campo}" es obligatorio.`);
    return null;
  }
  const n = aEntero(valor, escala);
  if (n === null) {
    throw invalido(`El campo "${campo}" debe ser un número no negativo con máximo ${escala} decimales.`);
  }
  if (positivo && n === 0) throw invalido(`El campo "${campo}" debe ser mayor que cero.`);
  if (max !== undefined && n > max * 10 ** escala) {
    throw invalido(`El campo "${campo}" no puede ser mayor que ${max}.`);
  }
  return n;
}

export function opcion(valor, campo, opciones) {
  if (!opciones.includes(valor)) {
    throw invalido(`El campo "${campo}" debe ser uno de: ${opciones.join(', ')}.`);
  }
  return valor;
}

export function booleano(valor, campo, porDefecto) {
  if (valor === undefined) return porDefecto;
  if (typeof valor !== 'boolean') throw invalido(`El campo "${campo}" debe ser verdadero o falso.`);
  return valor;
}

/** Fecha AAAA-MM-DD. */
export function fecha(valor, campo) {
  if (valor === undefined || valor === '') return null;
  if (typeof valor !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(valor) || Number.isNaN(Date.parse(valor))) {
    throw invalido(`El campo "${campo}" debe tener formato AAAA-MM-DD.`);
  }
  return valor;
}

export function lista(valor, campo, { min = 1, max = 200 } = {}) {
  if (!Array.isArray(valor)) throw invalido(`El campo "${campo}" debe ser una lista.`);
  if (valor.length < min) throw invalido(`Agrega al menos ${min} elemento(s) en "${campo}".`);
  if (valor.length > max) throw invalido(`"${campo}" admite máximo ${max} elementos.`);
  return valor;
}
