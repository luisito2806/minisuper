// Reportes de ventas por rango de fechas (solo administrador): totales,
// utilidad por día, productos más vendidos, método de pago y cajero.
import { api, aviso, cantidad, descargar, esc, hoy, moneda, nombreMetodo } from '../comun.js';

const corta = (f) => f.split('-').reverse().join('/');
const pct = (utilidad, base) => (Number(base) ? `${((Number(utilidad) / Number(base)) * 100).toFixed(1)}%` : '—');

export async function render(el) {
  const [usuarios, categorias] = await Promise.all([api('GET', '/api/usuarios'), api('GET', '/api/categorias')]);

  el.innerHTML = `
    <section class="panel">
      <div class="encabezado">
        <h1><span class="acento">Reporte</span> de ventas</h1>
        <div class="opciones no-imprimir">
          <button type="button" id="excel">Exportar a Excel</button>
          <button type="button" id="imprimir">Imprimir</button>
        </div>
      </div>
      <form id="filtros" class="filtros">
        <label>Desde<input type="date" name="desde" value="${hoy().slice(0, 8)}01" required></label>
        <label>Hasta<input type="date" name="hasta" value="${hoy()}" required></label>
        <label>Cajero<select name="usuario_id"><option value="">Todos</option>
          ${usuarios.map((u) => `<option value="${esc(u.id)}">${esc(u.nombre)}</option>`).join('')}</select></label>
        <label>Categoría (más vendidos)<select name="categoria_id"><option value="">Todas</option>
          ${categorias.map((c) => `<option value="${esc(c.id)}">${esc(c.nombre)}</option>`).join('')}</select></label>
        <label>Ordenar más vendidos por<select name="orden">
          <option value="importe">Importe vendido</option>
          <option value="cantidad">Cantidad (piezas / kg)</option>
          <option value="utilidad">Utilidad</option>
        </select></label>
        <button type="submit" class="primario">Generar</button>
      </form>
      <p class="muted" id="periodo"></p>
    </section>
    <div id="tarjetas" class="tarjetas"></div>
    <section class="panel"><h2>Utilidad por día</h2>
      <p class="muted">Venta sin IVA (ya con descuentos) menos el costo de lo vendido. Es una estimación: depende de que el costo de cada producto esté bien capturado.</p>
      <div class="tabla-wrap"><table>
        <thead><tr><th>Día</th><th class="num">Ventas</th><th class="num">Total cobrado</th><th class="num">Venta sin IVA</th><th class="num">Costo</th><th class="num">Utilidad</th><th class="num">Margen</th></tr></thead>
        <tbody id="dias"></tbody><tfoot id="dias-total"></tfoot>
      </table></div></section>
    <section class="panel"><h2>Productos más vendidos</h2><div class="tabla-wrap"><table>
      <thead><tr><th>#</th><th>Producto</th><th>Categoría</th><th class="num">Cantidad</th><th class="num">Importe</th><th class="num">Utilidad aprox.</th><th class="num">Margen</th></tr></thead><tbody id="top"></tbody></table></div></section>
    <section class="panel"><h2>Por método de pago</h2><div class="tabla-wrap"><table>
      <thead><tr><th>Método</th><th class="num">Ventas</th><th class="num">Total</th></tr></thead><tbody id="metodos"></tbody></table></div></section>
    <section class="panel"><h2>Por cajero</h2><div class="tabla-wrap"><table>
      <thead><tr><th>Cajero</th><th class="num">Ventas</th><th class="num">Efectivo</th><th class="num">Crédito</th><th class="num">Total</th></tr></thead><tbody id="cajeros"></tbody></table></div></section>`;

  const form = el.querySelector('#filtros');
  const vacio = (n) => `<tr><td colspan="${n}" class="vacio">Sin ventas en el periodo.</td></tr>`;
  const filtros = () => new URLSearchParams([...new FormData(form)].filter(([, v]) => v));

  async function generar() {
    const datos = Object.fromEntries(new FormData(form));
    if (datos.desde > datos.hasta) return aviso('La fecha "desde" no puede ser posterior a "hasta".', 'error');
    let r;
    try {
      r = await api('GET', `/api/reportes/ventas?${filtros()}`);
    } catch (err) {
      return aviso(err.message, 'error');
    }
    const s = r.resumen;
    el.querySelector('#periodo').textContent = `Periodo: ${corta(datos.desde)} a ${corta(datos.hasta)}. Las ventas canceladas no se suman.`;
    const ticketPromedio = s.num_ventas ? Number(s.total) / s.num_ventas : 0;
    el.querySelector('#tarjetas').innerHTML = [
      ['Ventas', s.num_ventas],
      ['Total vendido', moneda(s.total)],
      ['Venta sin IVA', moneda(s.venta_neta)],
      ['Costo de lo vendido', moneda(s.costo)],
      ['Utilidad estimada', `${moneda(s.utilidad)} (${pct(s.utilidad, s.venta_neta)})`, 'destacada'],
      ['Descuentos', moneda(s.descuentos)],
      ['Ticket promedio', moneda(ticketPromedio)],
      ['Canceladas', `${s.num_canceladas} (${moneda(s.total_cancelado)})`],
    ].map(([e, v, c]) => `<div class="tarjeta ${c ?? ''}"><div class="etiqueta">${e}</div><div class="valor">${esc(v)}</div></div>`).join('');

    el.querySelector('#dias').innerHTML = r.utilidad_por_dia.map((d) => `
      <tr><td>${esc(corta(d.dia))}</td><td class="num">${d.num_ventas}</td><td class="num">${moneda(d.total)}</td>
      <td class="num">${moneda(d.venta_neta)}</td><td class="num">${moneda(d.costo)}</td>
      <td class="num ${Number(d.utilidad) < 0 ? 'negativo' : 'positivo'}"><strong>${moneda(d.utilidad)}</strong></td>
      <td class="num">${pct(d.utilidad, d.venta_neta)}</td></tr>`).join('') || vacio(7);
    el.querySelector('#dias-total').innerHTML = r.utilidad_por_dia.length > 1 ? `
      <tr><th>Total</th><th class="num">${s.num_ventas}</th><th class="num">${moneda(s.total)}</th><th class="num">${moneda(s.venta_neta)}</th>
      <th class="num">${moneda(s.costo)}</th><th class="num">${moneda(s.utilidad)}</th><th class="num">${pct(s.utilidad, s.venta_neta)}</th></tr>` : '';

    el.querySelector('#top').innerHTML = r.mas_vendidos.map((p, i) => `
      <tr><td>${i + 1}</td><td>${esc(p.nombre)}</td><td>${esc(p.categoria)}</td>
      <td class="num">${esc(cantidad(p.cantidad, p.unidad))}</td><td class="num">${moneda(p.importe)}</td>
      <td class="num ${Number(p.utilidad) < 0 ? 'negativo' : ''}">${moneda(p.utilidad)}</td>
      <td class="num">${pct(p.utilidad, Number(p.utilidad) + Number(p.costo))}</td></tr>`).join('') || vacio(7);
    el.querySelector('#metodos').innerHTML = r.por_metodo.map((m) => `
      <tr><td>${esc(nombreMetodo(m.metodo_pago))}</td><td class="num">${m.num_ventas}</td><td class="num">${moneda(m.total)}</td></tr>`).join('') || vacio(3);
    el.querySelector('#cajeros').innerHTML = r.por_cajero.map((c) => `
      <tr><td>${esc(c.nombre)}</td><td class="num">${c.num_ventas}</td><td class="num">${moneda(c.efectivo)}</td>
      <td class="num">${moneda(c.credito)}</td><td class="num">${moneda(c.total)}</td></tr>`).join('') || vacio(5);
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    generar();
  });
  form.orden.addEventListener('change', generar);
  el.querySelector('#imprimir').addEventListener('click', () => window.print());
  el.querySelector('#excel').addEventListener('click', () =>
    descargar(`/api/excel/reporte?${filtros()}`).catch((err) => aviso(err.message, 'error')));
  await generar();
}
