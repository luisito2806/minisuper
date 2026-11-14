// Utilidades compartidas por las páginas del navegador.

export class ErrorApi extends Error {
  constructor(status, mensaje) {
    super(mensaje);
    this.status = status;
  }
}

/** Llama a la API. Lanza ErrorApi con el mensaje del servidor si falla. */
export async function api(metodo, url, cuerpo) {
  let res;
  try {
    res = await fetch(url, {
      method: metodo,
      headers: cuerpo !== undefined ? { 'Content-Type': 'application/json' } : {},
      body: cuerpo !== undefined ? JSON.stringify(cuerpo) : undefined,
      credentials: 'same-origin',
    });
  } catch {
    throw new ErrorApi(0, 'No hay conexión con el servidor. La operación no se completó.');
  }
  const datos = res.headers.get('content-type')?.includes('json') ? await res.json() : null;
  if (!res.ok) {
    if (res.status === 401 && !url.startsWith('/api/auth/login')) {
      location.href = '/login.html';
    }
    // Errores con el formato del servidor: { success: false, message }.
    throw new ErrorApi(res.status, datos?.message || `Error ${res.status}. La operación no se completó.`);
  }
  // Altas con el formato { success: true, data }: se devuelve solo data.
  if (datos && datos.success === true && 'data' in datos) return datos.data;
  return datos;
}

/**
 * Copia el título de cada columna a sus celdas (data-label). En el celular,
 * el CSS muestra cada fila como tarjeta con "Título: valor".
 */
export function etiquetarTablas(raiz = document) {
  for (const tabla of raiz.querySelectorAll('table')) {
    if (tabla.closest('.ticket')) continue;
    const titulos = [...tabla.querySelectorAll('thead th')].map((th) => th.textContent.trim());
    if (!titulos.length) continue;
    for (const fila of tabla.querySelectorAll('tbody tr, tfoot tr')) {
      let columna = 0;
      for (const celda of fila.children) {
        if (!celda.hasAttribute('data-label')) {
          celda.setAttribute('data-label', celda.colSpan > 1 ? '' : (titulos[columna] ?? ''));
        }
        columna += celda.colSpan || 1;
      }
    }
  }
}

/** Escapa texto para insertarlo en HTML. */

export function esc(valor) {
  return String(valor ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
}

let fmtMoneda = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
let formatoFecha = 'dd/mm/aaaa';
const partesFecha = new Intl.DateTimeFormat('es-MX', {
  year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  hour12: false, timeZone: 'America/Mexico_City',
});

/** Aplica la moneda y el formato de fecha de la configuración de la tienda. */
export function aplicarFormato({ moneda: codigo, formato_fecha: formato } = {}) {
  try {
    if (codigo) fmtMoneda = new Intl.NumberFormat('es-MX', { style: 'currency', currency: codigo });
  } catch {
    // Código de moneda desconocido para el navegador: se queda MXN.
  }
  if (formato) formatoFecha = formato;
}

export const moneda = (v) => fmtMoneda.format(Number(v ?? 0));
export function fechaHora(v) {
  if (!v) return '';
  const p = Object.fromEntries(partesFecha.formatToParts(new Date(v)).map((x) => [x.type, x.value]));
  const fecha = formatoFecha === 'aaaa-mm-dd' ? `${p.year}-${p.month}-${p.day}` : `${p.day}/${p.month}/${p.year}`;
  return `${fecha} ${p.hour}:${p.minute}`;
}
export const hoy = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' });

const ABREV = { pieza: 'pz', kg: 'kg', litro: 'L' };
/** Cantidad con unidad: piezas sin decimales, kg/L con hasta 3. */
export function cantidad(valor, unidad) {
  const n = Number(valor);
  const texto = unidad === 'pieza'
    ? n.toLocaleString('es-MX', { maximumFractionDigits: 0 })
    : n.toLocaleString('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 3 });
  return `${texto} ${ABREV[unidad] ?? unidad ?? ''}`.trim();
}

export function aviso(mensaje, tipo = 'ok') {
  const caja = document.getElementById('avisos');
  if (!caja) return alert(mensaje);
  const el = document.createElement('div');
  el.className = `aviso ${tipo}`;
  el.setAttribute('role', tipo === 'error' ? 'alert' : 'status');
  el.textContent = mensaje;
  caja.append(el);
  setTimeout(() => el.remove(), tipo === 'error' ? 7000 : 4000);
}

/** Etiqueta de estado con texto (no depende solo del color). */
export function etiquetaEstado(estado) {
  const clases = {
    completada: 'ok', confirmada: 'ok', activo: 'ok', normal: 'ok',
    cancelada: 'mal', agotado: 'mal', inactivo: 'neutro', bajo: 'alerta',
    abierta: 'info', cerrada: 'neutro',
  };
  const textos = {
    completada: 'Completada', confirmada: 'Confirmada', cancelada: 'Cancelada',
    activo: 'Activo', inactivo: 'Inactivo', agotado: 'Agotado', bajo: 'Existencia baja', normal: 'Disponible',
    abierta: 'Abierta', cerrada: 'Cerrada',
  };
  return `<span class="estado ${clases[estado] ?? 'neutro'}">${esc(textos[estado] ?? estado)}</span>`;
}

/**
 * Datos públicos de la tienda; también aplica moneda y formato de fecha.
 * Con `completa`, devuelve { tienda, config } (config: IVA, moneda…).
 */
export async function cargarTienda(completa = false) {
  let c;
  try {
    c = await api('GET', '/api/config');
    aplicarFormato(c);
  } catch {
    c = { tienda: { nombre: 'Mini Súper' } };
  }
  return completa ? { tienda: c.tienda, config: c } : c.tienda;
}

/** Diferencia de caja con signo y texto (sobrante / faltante). */
export function diferencia(valor) {
  const n = Number(valor);
  if (n === 0) return '<span class="estado ok">Cuadra</span>';
  return n > 0
    ? `<span class="estado info">Sobran ${moneda(n)}</span>`
    : `<span class="estado mal">Faltan ${moneda(-n)}</span>`;
}

/** Métodos de pago que se ofrecen al vender. */
export const METODOS = { efectivo: 'Efectivo', credito: 'Crédito (nómina)' };
/** Nombre de cualquier método, incluidos los de ventas viejas. */
export const nombreMetodo = (m) =>
  ({ ...METODOS, tarjeta: 'Tarjeta', transferencia: 'Transferencia', otro: 'Otro' })[m] ?? m;

/**
 * Descarga un archivo de la API (por ejemplo, un Excel). Si el servidor
 * responde con error, lanza ErrorApi con su mensaje.
 */
export async function descargar(url) {
  let res;
  try {
    res = await fetch(url, { credentials: 'same-origin' });
  } catch {
    throw new ErrorApi(0, 'No hay conexión con el servidor.');
  }
  if (!res.ok) {
    const datos = res.headers.get('content-type')?.includes('json') ? await res.json() : null;
    throw new ErrorApi(res.status, datos?.message || `Error ${res.status} al descargar.`);
  }
  const nombre = /filename="([^"]+)"/.exec(res.headers.get('content-disposition') ?? '')?.[1] ?? 'archivo.xlsx';
  const enlace = document.createElement('a');
  enlace.href = URL.createObjectURL(await res.blob());
  enlace.download = nombre;
  document.body.append(enlace);
  enlace.click();
  enlace.remove();
  setTimeout(() => URL.revokeObjectURL(enlace.href), 10000);
}

/** Pide al usuario un archivo de Excel y lo devuelve en base64 (o null si cancela). */
export function elegirExcel() {
  return new Promise((ok, falla) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    input.addEventListener('change', () => {
      const archivo = input.files?.[0];
      if (!archivo) return ok(null);
      if (archivo.size > 10 * 1024 * 1024) return falla(new ErrorApi(413, 'El archivo pesa más de 10 MB.'));
      const lector = new FileReader();
      lector.onload = () => ok(String(lector.result).split(',')[1] ?? '');
      lector.onerror = () => falla(new ErrorApi(0, 'No se pudo leer el archivo.'));
      lector.readAsDataURL(archivo);
    });
    input.click();
  });
}
