// Historial de ventas. El cajero ve las suyas; el administrador ve todas,
// puede cancelarlas y exportarlas a Excel. Las canceladas se ocultan por
// defecto (filtro "Estado").
import { METODOS, api, aviso, cantidad, descargar, esc, etiquetaEstado, fechaHora, hoy, moneda, nombreMetodo } from '../comun.js';

export async function render(el, { esAdmin, abrirDialogo, cerrarDialogo }) {
  el.innerHTML = `
    <section class="panel">
      <div class="encabezado">
        <h1><span class="acento">Historial</span> de ventas</h1>
        ${esAdmin ? '<button type="button" id="excel">Exportar a Excel</button>' : ''}
      </div>
      <form id="filtros" class="filtros">
        <label>Desde<input type="date" name="desde" value="${hoy()}"></label>
        <label>Hasta<input type="date" name="hasta" value="${hoy()}"></label>
        <label>Estado
          <select name="estado">
            <option value="completada" selected>Completadas</option>
            <option value="cancelada">Canceladas</option>
            <option value="">Todas</option>
          </select>
        </label>
        <label>Método
          <select name="metodo_pago"><option value="">Todos</option>
            ${Object.entries(METODOS).map(([k, t]) => `<option value="${k}">${esc(t)}</option>`).join('')}
          </select>
        </label>
        <label>Folio<input name="folio" placeholder="V-000001" size="10"></label>
        <button type="submit">Buscar</button>
      </form>
      <div class="tabla-wrap">
        <table>
          <thead><tr><th>Folio</th><th>Fecha</th><th>Cajero</th><th>Pago</th><th class="num">Total</th><th>Estado</th><th></th></tr></thead>
          <tbody id="filas"></tbody>
        </table>
      </div>
      <p class="muted" id="pie"></p>
    </section>`;

  const form = el.querySelector('#filtros');
  let ventas = [];

  const pago = (v) => v.metodo_pago === 'credito' && v.trabajador
    ? `Crédito · ${esc(v.trabajador.nombre)} <span class="muted">(${esc(v.trabajador.numero)})</span>`
    : esc(nombreMetodo(v.metodo_pago));

  async function cargar() {
    const q = new URLSearchParams([...new FormData(form)].filter(([, v]) => v));
    if (q.get('folio')) {
      q.delete('desde');
      q.delete('hasta');
      q.delete('estado');
    }
    try {
      ventas = await api('GET', `/api/ventas?${q}`);
      el.querySelector('#filas').innerHTML = ventas.length
        ? ventas.map((v, i) => `
          <tr>
            <td>${esc(v.folio)}</td>
            <td>${esc(fechaHora(v.fecha))}</td>
            <td>${esc(v.cajero)}</td>
            <td>${pago(v)}</td>
            <td class="num">${moneda(v.total)}</td>
            <td>${etiquetaEstado(v.estado)}</td>
            <td class="acciones-fila">
              <button type="button" class="chico" data-ver="${i}">Ver</button>
              ${esAdmin && v.estado === 'completada' ? `<button type="button" class="chico peligro" data-cancelar="${i}">Cancelar</button>` : ''}
            </td>
          </tr>`).join('')
        : '<tr><td colspan="7" class="vacio">No hay ventas con esos filtros.</td></tr>';
      const suma = ventas.filter((v) => v.estado === 'completada').reduce((s, v) => s + Number(v.total), 0);
      el.querySelector('#pie').textContent = ventas.length
        ? `${ventas.length} venta(s) · total completadas: ${moneda(suma)}${q.get('estado') === 'completada' ? ' · las canceladas están ocultas (cambia el filtro "Estado" para verlas)' : ''}`
        : '';
    } catch (err) {
      aviso(err.message, 'error');
    }
  }

  /** Diálogo para cancelar con motivo. */
  function cancelar(v) {
    const d = abrirDialogo(`
      <h2>Cancelar venta ${esc(v.folio)}</h2>
      <p>${esc(fechaHora(v.fecha))} · ${pago(v)} · <strong>${moneda(v.total)}</strong></p>
      <p class="muted">Los productos regresan al inventario. La venta deja de contar en caja, reportes y nómina,
        y se oculta del historial. Se borra por completo con la depuración anual (Configuración).</p>
      <form id="f-cancelar" novalidate>
        <label>Motivo (obligatorio)<input name="motivo" maxlength="255" required autofocus></label>
        <p class="error-form" id="error-cancelar" role="alert"></p>
        <div class="acciones">
          <button type="button" data-cerrar>No cancelar</button>
          <button type="submit" class="peligro">Cancelar venta</button>
        </div>
      </form>`);
    d.querySelector('#f-cancelar').addEventListener('submit', async (e) => {
      e.preventDefault();
      const motivo = e.target.motivo.value.trim();
      const error = d.querySelector('#error-cancelar');
      if (!motivo) {
        error.textContent = 'Escribe el motivo de la cancelación.';
        return;
      }
      try {
        const r = await api('POST', `/api/ventas/${v.id}/cancelar`, { motivo });
        aviso(`Venta ${v.folio} cancelada. El inventario fue repuesto.`);
        if (r.aviso_caja) aviso(r.aviso_caja, 'error');
        if (r.aviso_nomina) aviso(r.aviso_nomina, 'error');
        cerrarDialogo();
        cargar();
      } catch (err) {
        error.textContent = err.message;
      }
    });
  }

  async function verDetalle(id) {
    const v = await api('GET', `/api/ventas/${id}`);
    const d = abrirDialogo(`
      <div class="encabezado"><h2>Venta ${esc(v.folio)}</h2>${etiquetaEstado(v.estado)}</div>
      <p class="muted">${esc(fechaHora(v.fecha))} · Cajero: ${esc(v.cajero)} · Pago: ${pago(v)}</p>
      ${v.metodo_pago === 'credito' ? `<p>${v.descontado_en
        ? `<span class="estado ok">Descontada en nómina</span> el ${esc(fechaHora(v.descontado_en))} por ${esc(v.descontado_por_nombre)}`
        : '<span class="estado alerta">Pendiente de descontar en nómina</span>'}</p>` : ''}
      <div class="tabla-wrap"><table>
        <thead><tr><th>Producto</th><th class="num">Cantidad</th><th class="num">Precio</th><th class="num">Importe</th></tr></thead>
        <tbody>${v.partidas.map((p) => `
          <tr><td>${esc(p.nombre)}</td><td class="num">${esc(cantidad(p.cantidad, p.unidad))}</td>
              <td class="num">${moneda(p.precio_unitario)}</td><td class="num">${moneda(p.importe)}</td></tr>`).join('')}
        </tbody>
      </table></div>
      <dl class="tarjetas">
        <div class="tarjeta"><dt class="etiqueta">Subtotal</dt><dd class="valor">${moneda(v.subtotal)}</dd></div>
        <div class="tarjeta"><dt class="etiqueta">Descuento</dt><dd class="valor">${moneda(v.descuento)}</dd></div>
        <div class="tarjeta"><dt class="etiqueta">${v.precios_incluyen_iva ? 'IVA incluido' : 'IVA'}</dt><dd class="valor">${moneda(v.impuestos)}</dd></div>
        <div class="tarjeta"><dt class="etiqueta">Total</dt><dd class="valor">${moneda(v.total)}</dd></div>
      </dl>
      ${v.estado === 'cancelada' ? `
        <p class="error-form">Cancelada el ${esc(fechaHora(v.cancelada_en))} por ${esc(v.cancelada_por_nombre)}.
        Motivo: ${esc(v.motivo_cancelacion)}</p>` : ''}
      <div class="acciones">
        ${esAdmin && v.estado === 'completada' ? '<button type="button" id="cancelar" class="peligro">Cancelar venta</button>' : ''}
        <button type="button" id="ticket">Ver ticket</button>
        <button type="button" data-cerrar>Cerrar</button>
      </div>`);

    d.querySelector('#ticket').addEventListener('click', () =>
      window.open(`/ticket.html?id=${encodeURIComponent(v.id)}`, '_blank', 'width=420,height=720'),
    );
    d.querySelector('#cancelar')?.addEventListener('click', () => cancelar(v));
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    cargar();
  });
  form.estado.addEventListener('change', cargar);
  form.metodo_pago.addEventListener('change', cargar);
  el.querySelector('#filas').addEventListener('click', (e) => {
    const ver = e.target.closest('button[data-ver]');
    if (ver) verDetalle(ventas[Number(ver.dataset.ver)].id).catch((err) => aviso(err.message, 'error'));
    const c = e.target.closest('button[data-cancelar]');
    if (c) cancelar(ventas[Number(c.dataset.cancelar)]);
  });
  el.querySelector('#excel')?.addEventListener('click', () => {
    const { desde, hasta } = Object.fromEntries(new FormData(form));
    descargar(`/api/excel/ventas?${new URLSearchParams({ desde, hasta })}`).catch((err) => aviso(err.message, 'error'));
  });

  await cargar();
}
