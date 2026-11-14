// Configuración del negocio (solo administrador).
import { METODOS, api, aviso, descargar, esc, fechaHora } from '../comun.js';
import { htmlTicket, ventaDeEjemplo } from '../ticket-html.js';

const corta = (f) => f.split('-').reverse().join('/');
const tamano = (b) => (b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

export async function render(el, { ctx }) {
  const c = ctx.config;
  const tasa = (v) => String(Math.round(Number(v) * 10000) / 100);

  el.innerHTML = `
    <form id="f-config" novalidate>
      <section class="panel">
        <h1><span class="acento">Configuración</span> de la tienda</h1>
        <p class="muted">Última modificación: ${esc(fechaHora(c.actualizado_en))}</p>
        <div class="form-grid">
          <label>Nombre de la tienda *<input name="nombre_tienda" maxlength="120" required value="${esc(c.nombre_tienda)}"></label>
          <label>Teléfono<input name="telefono" maxlength="30" value="${esc(c.telefono)}"></label>
          <label class="ancho">Dirección<input name="direccion" maxlength="255" value="${esc(c.direccion)}"></label>
          <label>RFC<input name="rfc" maxlength="13" value="${esc(c.rfc)}" placeholder="Opcional"></label>
          <label>Moneda (código ISO)<input name="moneda" maxlength="3" value="${esc(c.moneda)}" required></label>
          <label>Formato de fecha<select name="formato_fecha">
            <option value="dd/mm/aaaa" ${c.formato_fecha === 'dd/mm/aaaa' ? 'selected' : ''}>dd/mm/aaaa (31/12/2026)</option>
            <option value="aaaa-mm-dd" ${c.formato_fecha === 'aaaa-mm-dd' ? 'selected' : ''}>aaaa-mm-dd (2026-12-31)</option>
          </select></label>
        </div>
      </section>

      <section class="panel" id="panel-ticket">
        <h2>Ticket</h2>
        <div class="config-ticket">
          <div>
            <p class="muted">El nombre, la dirección, el teléfono y el RFC de arriba también salen en el ticket.
              La vista previa cambia mientras escribes; guarda para que los tickets nuevos salgan así.</p>
            <div class="form-grid">
              <label class="ancho">Texto bajo el nombre (hasta 5 renglones)
                <textarea name="ticket_encabezado" maxlength="255" rows="3" placeholder="Ej.&#10;Abierto de 7:00 a 21:00&#10;WhatsApp 443 123 4567">${esc(c.ticket_encabezado)}</textarea></label>
              <label class="ancho">Mensaje al pie del ticket<input name="mensaje_ticket" maxlength="255" value="${esc(c.mensaje_ticket)}"></label>
              <label>Ancho del papel<select name="ticket_ancho">
                <option value="80" ${c.ticket_ancho !== '58' ? 'selected' : ''}>80 mm (el más común)</option>
                <option value="58" ${c.ticket_ancho === '58' ? 'selected' : ''}>58 mm (impresoras pequeñas)</option>
              </select></label>
              <label class="check"><input type="checkbox" name="ticket_mostrar_cajero" ${c.ticket_mostrar_cajero !== false ? 'checked' : ''}>
                Mostrar quién atendió</label>
            </div>
            <div class="acciones"><button type="button" id="ticket-prueba">Imprimir ticket de prueba</button></div>
            <p class="muted">El ticket de prueba usa lo que ya está guardado.</p>
          </div>
          <div class="vista" aria-label="Vista previa del ticket">
            <article id="vista-ticket" class="ticket"></article>
          </div>
        </div>
      </section>

      <section class="panel">
        <h2>Impuestos</h2>
        <div class="form-grid">
          <fieldset class="ancho"><legend>¿Cómo se maneja el IVA?</legend>
            <div class="opciones columna">
              <label class="check"><input type="radio" name="modo_iva" value="ninguno" ${!c.cobrar_iva ? 'checked' : ''}>
                <span><strong>No cobro IVA.</strong> El precio del producto es lo que paga el cliente; no se calcula ni se muestra IVA.</span></label>
              <label class="check"><input type="radio" name="modo_iva" value="incluido" ${c.cobrar_iva && c.precios_incluyen_iva ? 'checked' : ''}>
                <span><strong>El IVA ya viene en el precio.</strong> El cliente paga el precio; el ticket muestra cuánto IVA incluye.</span></label>
              <label class="check"><input type="radio" name="modo_iva" value="agregado" ${c.cobrar_iva && !c.precios_incluyen_iva ? 'checked' : ''}>
                <span><strong>Sumar el IVA al precio.</strong> Al total se le agrega el IVA de cada producto.</span></label>
            </div>
          </fieldset>
          <label id="etq-tasa">IVA predeterminado para productos nuevos (%)
            <input name="tasa_iva_predeterminada" inputmode="decimal" value="${tasa(c.tasa_iva_predeterminada)}"></label>
        </div>
        <p class="muted">El cambio aplica a las ventas nuevas; las ventas ya registradas no cambian.</p>
      </section>

      <section class="panel">
        <h2>Ventas e inventario</h2>
        <fieldset><legend>Métodos de pago disponibles (el crédito se descuenta en la nómina del trabajador)</legend>
          <div class="opciones">
            ${Object.entries(METODOS).map(([k, t]) => `
              <label class="check"><input type="checkbox" name="metodos_pago" value="${k}" ${c.metodos_pago.includes(k) ? 'checked' : ''}> ${t}</label>`).join('')}
          </div>
        </fieldset>
        <div class="form-grid">
          <label>Stock mínimo predeterminado (alerta de existencia baja)
            <input name="stock_minimo_predeterminado" inputmode="decimal" value="${esc(Number(c.stock_minimo_predeterminado))}"></label>
          <label class="check ancho"><input type="checkbox" name="requiere_caja_abierta" ${c.requiere_caja_abierta ? 'checked' : ''}>
            Exigir caja abierta para registrar ventas</label>
          <label class="check ancho"><input type="checkbox" name="permitir_sobreventa" ${c.permitir_sobreventa ? 'checked' : ''}>
            Permitir vender más de la existencia registrada (la existencia puede quedar negativa)</label>
        </div>
      </section>

      <p class="error-form" id="error" role="alert"></p>
      <div class="acciones"><button type="submit" class="primario">Guardar configuración</button></div>
    </form>

    <section class="panel" id="panel-nube">
      <div class="encabezado">
        <h2>Ver la tienda desde la ciudad (nube)</h2>
        <div class="opciones">
          <button type="button" id="sync-ahora" class="primario">Enviar ahora</button>
          <button type="button" id="sync-paquete">Descargar paquete</button>
          <button type="button" id="sync-todo">Enviar todo de nuevo</button>
        </div>
      </div>
      <p class="muted">Con internet, los cambios se mandan solos cada minuto. Sin internet se guardan aquí y se mandan cuando
        vuelva la conexión, o se llevan en USB (abajo) y se cargan en la página de la nube.</p>
      <div id="sync-estado" class="tarjetas"></div>
    </section>

    <section class="panel" id="panel-usb">
      <div class="encabezado"><h2>Copiar a USB</h2><button type="button" id="usb-buscar">Buscar USB</button></div>
      <p class="muted">Copia el respaldo más reciente y el paquete de cambios para la nube a la carpeta
        <code>MiniSuper</code> de la memoria. Hazlo cada semana y lleva la USB a la ciudad.</p>
      <div class="filtros">
        <label>Memoria USB<select id="usb-unidad"></select></label>
        <label class="check"><input type="checkbox" id="usb-respaldo-nuevo" checked> Hacer un respaldo nuevo antes</label>
        <label class="check"><input type="checkbox" id="usb-paquete" checked> Incluir paquete para la nube</label>
        <button type="button" id="usb-copiar" class="primario">Copiar a la USB</button>
      </div>
      <p id="usb-resultado"></p>
    </section>

    <section class="panel" id="panel-red">
      <h2>Entrar desde otra computadora</h2>
      <p class="muted">Con Tailscale instalado en esta computadora y en la de la ciudad (ver INSTALACION.md), abre en la otra
        computadora la dirección marcada como Tailscale. Solo funciona cuando la tienda tiene internet y esta computadora está prendida.</p>
      <div class="tabla-wrap"><table>
        <thead><tr><th>Red</th><th>Dirección para abrir en el navegador</th></tr></thead>
        <tbody id="red"></tbody>
      </table></div>
    </section>

    <section class="panel" id="panel-respaldos">
      <div class="encabezado"><h2>Respaldos de la base de datos</h2><button type="button" id="respaldar" class="primario">Respaldar ahora</button></div>
      <p class="muted">Cada día se hace un respaldo automático al encender el sistema (se guardan los últimos 30 en la carpeta
        <code>respaldos</code> del proyecto). Descarga uno de vez en cuando y guárdalo en una USB o en la nube.
        Para restaurar: en pgAdmin, clic derecho en la base → <em>Restore…</em></p>
      <div class="tabla-wrap"><table>
        <thead><tr><th>Archivo</th><th>Fecha</th><th class="num">Tamaño</th><th></th></tr></thead>
        <tbody id="respaldos"></tbody>
      </table></div>
    </section>

    <section class="panel" id="panel-depurar">
      <h2>Borrar ventas de hace más de un año</h2>
      <p class="muted">Para que la base de datos no crezca de más. Se borran las ventas (completadas y canceladas) anteriores
        a la fecha de corte, sus productos, su historial de inventario y los cortes de caja de esas fechas.
        <strong>Las existencias actuales no cambian</strong> y las ventas a crédito que no se han descontado en nómina se conservan.</p>
      <div id="depurar-info"></div>
      <label class="check"><input type="checkbox" id="depurar-respaldo" checked> Hacer un respaldo antes de borrar (recomendado)</label>
      <p class="error-form" id="depurar-error" role="alert"></p>
      <div class="acciones"><button type="button" id="depurar" class="peligro">Borrar ventas de hace más de un año</button></div>
    </section>`;

  // ---------- Nube ----------
  async function cargarSync() {
    const s = await api('GET', '/api/sincronizacion');
    const hace = (f) => (f ? fechaHora(f) : 'nunca');
    el.querySelector('#sync-estado').innerHTML = `
      <div class="tarjeta"><div class="etiqueta">Conexión con la nube</div><div class="valor">${s.configurada
        ? `<span class="estado ${s.ultimo_error ? 'alerta' : 'ok'}">${s.ultimo_error ? 'Sin conexión' : 'Activa'}</span>`
        : '<span class="estado neutro">No configurada</span>'}</div></div>
      <div class="tarjeta"><div class="etiqueta">Cambios por enviar</div><div class="valor">${s.pendientes}</div></div>
      <div class="tarjeta"><div class="etiqueta">Último envío correcto</div><div class="valor">${esc(hace(s.ultima_exitosa))}</div></div>
      ${s.ultimo_error ? `<div class="tarjeta ancho-total"><div class="etiqueta">Último error</div><div>${esc(s.ultimo_error)}</div></div>` : ''}
      ${s.configurada ? '' : '<div class="tarjeta ancho-total"><div class="etiqueta">Para activarla</div><div>Agrega SYNC_URL y SYNC_TOKEN al archivo .env y reinicia (ver INSTALACION.md, paso 3). Mientras tanto puedes usar la USB.</div></div>'}`;
    el.querySelector('#sync-ahora').disabled = !s.configurada;
  }
  el.querySelector('#sync-ahora').addEventListener('click', async (e) => {
    e.target.disabled = true;
    try {
      const r = await api('POST', '/api/sincronizacion/ahora', {});
      aviso(r.enviados ? `Se enviaron ${r.enviados} cambios a la nube.` : 'La nube ya tenía todo.');
    } catch (err) {
      aviso(err.message, 'error');
    } finally {
      cargarSync().catch(() => {});
    }
  });
  el.querySelector('#sync-paquete').addEventListener('click', () =>
    descargar('/api/sincronizacion/paquete').then(() => cargarSync()).catch((err) => aviso(err.message, 'error')));
  el.querySelector('#sync-todo').addEventListener('click', async () => {
    if (!confirm('Se volverán a mandar todas las ventas, productos, trabajadores y cortes. Úsalo si se perdió un paquete o la nube se reinició. ¿Continuar?')) return;
    try {
      await api('POST', '/api/sincronizacion/reenviar', {});
      aviso('Todo quedó en cola para enviarse.');
      cargarSync();
    } catch (err) {
      aviso(err.message, 'error');
    }
  });

  // ---------- USB ----------
  async function buscarUsb() {
    const r = await api('GET', '/api/sincronizacion/usb');
    const sel = el.querySelector('#usb-unidad');
    sel.innerHTML = r.unidades.length
      ? r.unidades.map((u) => `<option value="${esc(u.unidad)}">${esc(u.unidad)} ${esc(u.nombre)} (${tamano(Number(u.libre))} libres)</option>`).join('')
      : `<option value="">${r.windows ? 'Conecta una memoria USB y presiona "Buscar USB"' : 'Solo disponible en Windows'}</option>`;
    el.querySelector('#usb-copiar').disabled = !r.unidades.length;
  }
  el.querySelector('#usb-buscar').addEventListener('click', () => buscarUsb().catch((err) => aviso(err.message, 'error')));
  el.querySelector('#usb-copiar').addEventListener('click', async (e) => {
    const unidad = el.querySelector('#usb-unidad').value;
    if (!unidad) return;
    e.target.disabled = true;
    e.target.textContent = 'Copiando…';
    try {
      const r = await api('POST', '/api/sincronizacion/usb', {
        unidad,
        respaldo_nuevo: el.querySelector('#usb-respaldo-nuevo').checked,
        paquete: el.querySelector('#usb-paquete').checked,
      });
      el.querySelector('#usb-resultado').innerHTML = `<span class="estado ok">Listo</span> Se copió a <code>${esc(r.carpeta)}</code>:
        ${r.archivos.map(esc).join(', ')}${r.cambios ? ` (${r.cambios} cambios para la nube)` : ''}. Ya puedes retirar la USB.`;
      cargarSync().catch(() => {});
      cargarRespaldos().catch(() => {});
    } catch (err) {
      el.querySelector('#usb-resultado').innerHTML = `<span class="error-form">${esc(err.message)}</span>`;
    } finally {
      e.target.disabled = false;
      e.target.textContent = 'Copiar a la USB';
    }
  });

  // ---------- Red ----------
  async function cargarRed() {
    const r = await api('GET', '/api/sincronizacion/red');
    el.querySelector('#red').innerHTML = r.direcciones.map((d) => `
      <tr><td>${d.tailscale ? '<span class="estado ok">Tailscale (desde la ciudad)</span>' : esc(d.interfaz)}</td>
      <td><code>${esc(d.url)}</code></td></tr>`).join('')
      || '<tr><td colspan="2" class="vacio">Esta computadora no está conectada a ninguna red.</td></tr>';
  }

  cargarSync().catch((err) => aviso(err.message, 'error'));
  buscarUsb().catch(() => {});
  cargarRed().catch(() => {});

  // ---------- Respaldos ----------

  async function cargarRespaldos() {
    const r = await api('GET', '/api/mantenimiento/respaldos');
    el.querySelector('#respaldar').disabled = !r.disponibles;
    el.querySelector('#respaldos').innerHTML = !r.disponibles
      ? '<tr><td colspan="4" class="vacio">Los respaldos funcionan con PostgreSQL instalado (no en el modo demo).</td></tr>'
      : r.respaldos.map((x) => `
        <tr><td>${esc(x.nombre)}</td><td>${esc(fechaHora(x.fecha))}</td><td class="num">${tamano(x.tamano)}</td>
        <td><button type="button" class="chico" data-archivo="${esc(x.nombre)}">Descargar</button></td></tr>`).join('')
        || '<tr><td colspan="4" class="vacio">Todavía no hay respaldos.</td></tr>';
  }
  el.querySelector('#respaldar').addEventListener('click', async (e) => {
    e.target.disabled = true;
    e.target.textContent = 'Respaldando…';
    try {
      const r = await api('POST', '/api/mantenimiento/respaldos', {});
      aviso(`Respaldo creado: ${r.nombre}`);
    } catch (err) {
      aviso(err.message, 'error');
    } finally {
      e.target.textContent = 'Respaldar ahora';
      cargarRespaldos().catch(() => {});
    }
  });
  el.querySelector('#respaldos').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-archivo]');
    if (b) descargar(`/api/mantenimiento/respaldos/${encodeURIComponent(b.dataset.archivo)}`).catch((err) => aviso(err.message, 'error'));
  });

  // ---------- Depurar ventas viejas ----------
  let previa = null;
  async function cargarDepuracion() {
    previa = await api('GET', '/api/mantenimiento/depuracion');
    const conRespaldo = el.querySelector('#depurar-respaldo');
    if (!previa.respaldos_disponibles) {
      conRespaldo.checked = false;
      conRespaldo.disabled = true;
    }
    el.querySelector('#depurar-info').innerHTML = `
      <div class="tarjetas">
        <div class="tarjeta"><div class="etiqueta">Fecha de corte</div><div class="valor">${esc(corta(previa.corte))}</div></div>
        <div class="tarjeta"><div class="etiqueta">Ventas que se borrarían</div><div class="valor">${previa.ventas}</div></div>
        <div class="tarjeta"><div class="etiqueta">De ellas, canceladas</div><div class="valor">${previa.canceladas}</div></div>
        <div class="tarjeta"><div class="etiqueta">Crédito sin descontar (se conserva)</div><div class="valor">${previa.credito_pendiente}</div></div>
      </div>`;
    el.querySelector('#depurar').disabled = previa.ventas === 0;
  }
  el.querySelector('#depurar').addEventListener('click', async (e) => {
    const error = el.querySelector('#depurar-error');
    error.textContent = '';
    const respaldar = el.querySelector('#depurar-respaldo').checked;
    if (!confirm(`Se borrarán ${previa.ventas} venta(s) anteriores al ${corta(previa.corte)}. Esta acción NO se puede deshacer${respaldar ? ' (se hará un respaldo antes)' : ' y no se hará respaldo'}. ¿Continuar?`)) return;
    const escrito = prompt('Para confirmar, escribe BORRAR');
    if (escrito?.trim().toUpperCase() !== 'BORRAR') return aviso('No se borró nada.');
    e.target.disabled = true;
    e.target.textContent = 'Borrando…';
    try {
      const r = await api('POST', '/api/mantenimiento/depuracion', { respaldar });
      aviso(`Listo: se borraron ${r.ventas} venta(s) y ${r.cajas} corte(s) de caja anteriores al ${corta(r.corte)}.${r.respaldo ? ` Respaldo: ${r.respaldo}` : ''}`);
    } catch (err) {
      error.textContent = err.message;
    } finally {
      e.target.textContent = 'Borrar ventas de hace más de un año';
      cargarDepuracion().catch(() => {});
      cargarRespaldos().catch(() => {});
    }
  });
  cargarRespaldos().catch((err) => aviso(err.message, 'error'));
  cargarDepuracion().catch((err) => aviso(err.message, 'error'));

  const f = el.querySelector('#f-config');

  // ---------- Vista previa del ticket (con lo que está escrito, aunque no se haya guardado) ----------
  function pintarTicket() {
    const modo = f.modo_iva.value;
    const tienda = {
      nombre: f.nombre_tienda.value.trim() || 'Nombre de la tienda',
      direccion: f.direccion.value.trim(),
      telefono: f.telefono.value.trim(),
      rfc: f.rfc.value.trim().toUpperCase(),
      encabezado: f.ticket_encabezado.value,
      mensaje_ticket: f.mensaje_ticket.value.trim(),
      mostrar_cajero: f.ticket_mostrar_cajero.checked,
    };
    const vista = el.querySelector('#vista-ticket');
    vista.classList.toggle('ancho-58', f.ticket_ancho.value === '58');
    vista.innerHTML = htmlTicket(tienda, ventaDeEjemplo({ cobrar_iva: modo !== 'ninguno', precios_incluyen_iva: modo !== 'agregado' }));
  }
  f.addEventListener('input', pintarTicket);
  f.addEventListener('change', pintarTicket);
  pintarTicket();
  el.querySelector('#ticket-prueba').addEventListener('click', () =>
    window.open('/ticket.html?prueba=1', '_blank', 'width=420,height=720'));


  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const error = el.querySelector('#error');
    error.textContent = '';
    const porcentaje = Number(f.tasa_iva_predeterminada.value);
    if (Number.isNaN(porcentaje) || porcentaje < 0 || porcentaje >= 100) {
      error.textContent = 'El IVA debe ser un porcentaje entre 0 y 99.99.';
      return;
    }
    const metodos = [...f.querySelectorAll('input[name=metodos_pago]:checked')].map((x) => x.value);
    if (!metodos.length) {
      error.textContent = 'Habilita al menos un método de pago.';
      return;
    }
    if (f.permitir_sobreventa.checked && !c.permitir_sobreventa &&
        !confirm('Con la sobreventa habilitada se podrán vender productos sin existencia. ¿Continuar?')) return;
    try {
      await api('PUT', '/api/configuracion', {
        nombre_tienda: f.nombre_tienda.value,
        telefono: f.telefono.value,
        direccion: f.direccion.value,
        rfc: f.rfc.value,
        mensaje_ticket: f.mensaje_ticket.value,
        ticket_encabezado: f.ticket_encabezado.value,
        ticket_ancho: f.ticket_ancho.value,
        ticket_mostrar_cajero: f.ticket_mostrar_cajero.checked,
        moneda: f.moneda.value,
        formato_fecha: f.formato_fecha.value,
        cobrar_iva: f.modo_iva.value !== 'ninguno',
        precios_incluyen_iva: f.modo_iva.value !== 'agregado',
        tasa_iva_predeterminada: String(Math.round(porcentaje * 100) / 10000),
        metodos_pago: metodos,
        stock_minimo_predeterminado: f.stock_minimo_predeterminado.value.trim(),
        requiere_caja_abierta: f.requiere_caja_abierta.checked,
        permitir_sobreventa: f.permitir_sobreventa.checked,
      });
      await ctx.recargarConfig();
      aviso('Configuración guardada.');
      render(el, { ctx });
    } catch (err) {
      error.textContent = err.message;
    }
  });
}
