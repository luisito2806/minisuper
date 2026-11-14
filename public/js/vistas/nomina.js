// Nómina (solo administrador): lo que cada trabajador compró a crédito en
// la semana (sábado a viernes) para descontárselo, y el catálogo de
// trabajadores.
import { api, aviso, descargar, elegirExcel, esc, etiquetaEstado, fechaHora, hoy, moneda } from '../comun.js';

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

function sumarDias(fecha, dias) {
  const d = new Date(`${fecha}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}
/** Sábado con el que empieza la semana de nómina que contiene `fecha`. */
function inicioSemana(fecha) {
  const dia = new Date(`${fecha}T00:00:00Z`).getUTCDay();
  return sumarDias(fecha, -((dia + 1) % 7));
}
const corta = (f) => f.split('-').reverse().join('/');

export async function render(el, { abrirDialogo, cerrarDialogo }) {
  let semana = inicioSemana(hoy());
  let trabajadores = [];
  let filasSemana = [];

  el.innerHTML = `
    <section class="panel">
      <div class="encabezado">
        <h1><span class="acento">Descuentos</span> de nómina</h1>
        <div class="opciones no-imprimir">
          <button type="button" id="excel">Exportar a Excel</button>
          <button type="button" id="imprimir">Imprimir</button>
        </div>
      </div>
      <div class="filtros no-imprimir">
        <button type="button" id="anterior">◀ Semana anterior</button>
        <label>Semana que incluye el día<input type="date" id="dia" value="${hoy()}"></label>
        <button type="button" id="actual">Esta semana</button>
        <button type="button" id="siguiente">Semana siguiente ▶</button>
      </div>
      <p id="titulo-semana" class="subtitulo"></p>
      <div id="tarjetas" class="tarjetas"></div>
      <div class="tabla-wrap"><table>
        <thead><tr>
          <th class="no-imprimir"><label class="check"><input type="checkbox" id="todos" checked aria-label="Seleccionar a todos"></label></th>
          <th>Trabajador</th><th>Núm.</th><th>Área</th><th class="num">Compras</th><th class="num">Total</th><th class="num">Pendiente</th><th>Estado</th><th class="no-imprimir"></th>
        </tr></thead>
        <tbody id="semana"></tbody>
      </table></div>
      <div class="acciones no-imprimir">
        <button type="button" id="descontar-todo" class="primario">Liquidar seleccionados</button>
      </div>
      <p class="muted no-imprimir">Todos los que tienen pendiente vienen marcados: quita la palomita a quien no se le
        descuenta esta vez y presiona <strong>Liquidar seleccionados</strong>. Así no se cobra dos veces.
        Las compras que se hagan después en la misma semana quedan pendientes.</p>
    </section>

    <section class="panel no-imprimir">
      <div class="encabezado">
        <h2>Trabajadores</h2>
        <div class="opciones">
          <button type="button" id="excel-trab">Descargar lista (Excel)</button>
          <button type="button" id="importar-trab">Importar de Excel</button>
          <button type="button" class="primario" id="nuevo">Nuevo trabajador</button>
        </div>
      </div>
      <p class="muted">¿Ya los tienes en Excel? Usa una hoja con las columnas <strong>Número</strong>, <strong>Nombre</strong> y,
        si quieres, <strong>Área</strong>. Puedes descargar la lista para usarla de plantilla. Si el número ya existe, se
        actualizan su nombre y área; los nuevos se dan de alta.</p>
      <form id="f-buscar" class="filtros"><label>Buscar<input name="q" placeholder="Nombre o número"></label><button type="submit">Buscar</button></form>
      <div class="tabla-wrap"><table>
        <thead><tr><th>Nombre</th><th>Núm.</th><th>Área</th><th class="num">Pendiente por descontar</th><th>Estado</th><th></th></tr></thead>
        <tbody id="trabajadores"></tbody>
      </table></div>
    </section>`;

  const $ = (s) => el.querySelector(s);

  async function cargarSemana() {
    let s;
    try {
      s = await api('GET', `/api/nomina?semana=${semana}`);
    } catch (err) {
      return aviso(err.message, 'error');
    }
    filasSemana = s.trabajadores;
    $('#dia').value = s.inicio;
    $('#titulo-semana').textContent = `Del ${DIAS[6]} ${corta(s.inicio)} al ${DIAS[5]} ${corta(s.fin)}`;
    $('#tarjetas').innerHTML = `
      <div class="tarjeta"><div class="etiqueta">Trabajadores con compras</div><div class="valor">${s.trabajadores.length}</div></div>
      <div class="tarjeta"><div class="etiqueta">Compras a crédito</div><div class="valor">${s.num_ventas}</div></div>
      <div class="tarjeta"><div class="etiqueta">Total de la semana</div><div class="valor">${moneda(s.total)}</div></div>
      <div class="tarjeta destacada"><div class="etiqueta">Pendiente por descontar</div><div class="valor">${moneda(s.pendiente)}</div></div>`;
    $('#semana').innerHTML = s.trabajadores.length
      ? s.trabajadores.map((t, i) => {
          const pendiente = Number(t.pendiente) > 0;
          return `
          <tr>
            <td class="no-imprimir">${pendiente
              ? `<label class="check"><input type="checkbox" class="sel" data-i="${i}" checked aria-label="Liquidar a ${esc(t.nombre)}"></label>`
              : ''}</td>
            <td><strong>${esc(t.nombre)}</strong></td>
            <td>${esc(t.numero)}</td>
            <td>${esc(t.area)}</td>
            <td class="num">${t.num_ventas}</td>
            <td class="num"><strong>${moneda(t.total)}</strong></td>
            <td class="num">${moneda(t.pendiente)}</td>
            <td>${pendiente
              ? '<span class="estado alerta">Pendiente</span>'
              : `<span class="estado ok">Descontado</span>`}</td>
            <td class="acciones-fila no-imprimir">
              <button type="button" class="chico" data-detalle="${i}">Detalle</button>
            </td>
          </tr>`;
        }).join('')
      : '<tr><td colspan="9" class="vacio">Nadie compró a crédito esta semana.</td></tr>';
    $('#todos').checked = true;
    actualizarBoton();
  }

  /** Trabajadores con palomita (y pendiente). */
  const seleccionados = () => [...el.querySelectorAll('#semana input.sel:checked')].map((c) => filasSemana[Number(c.dataset.i)]);

  function actualizarBoton() {
    const sel = seleccionados();
    const total = sel.reduce((s, t) => s + Number(t.pendiente), 0);
    const boton = $('#descontar-todo');
    boton.disabled = !sel.length;
    boton.textContent = sel.length ? `Liquidar seleccionados (${sel.length} · ${moneda(total)})` : 'Liquidar seleccionados';
  }

  async function descontar() {
    const sel = seleccionados();
    if (!sel.length) return;
    const total = sel.reduce((s, t) => s + Number(t.pendiente), 0);
    if (semana > inicioSemana(hoy()) || (semana === inicioSemana(hoy()) &&
        !confirm('La semana todavía no termina (cierra el viernes). ¿Liquidarla de todos modos?'))) return;
    if (!confirm(`¿Marcar como descontadas en nómina las compras de ${sel.length} trabajador(es) por ${moneda(total)}, semana del ${corta(semana)}?`)) return;
    try {
      const r = await api('POST', '/api/nomina/descontar', {
        semana, trabajador_ids: sel.map((t) => String(t.id)),
      });
      aviso(`${r.num_ventas} compra(s) por ${moneda(r.total)} marcadas como descontadas.`);
      cargarSemana();
      cargarTrabajadores();
    } catch (err) {
      aviso(err.message, 'error');
    }
  }

  async function detalle(t) {
    const r = await api('GET', `/api/nomina/trabajador/${t.id}?semana=${semana}`);
    abrirDialogo(`
      <h2>${esc(r.trabajador.nombre)} <span class="muted">· núm. ${esc(r.trabajador.numero)}</span></h2>
      <p class="muted">Compras a crédito del sábado ${corta(r.inicio)} al viernes ${corta(r.fin)}</p>
      <div class="tabla-wrap"><table>
        <thead><tr><th>Folio</th><th>Fecha</th><th>Productos</th><th class="num">Total</th><th>Nómina</th></tr></thead>
        <tbody>${r.ventas.map((v) => `
          <tr>
            <td>${esc(v.folio)}</td><td>${esc(fechaHora(v.fecha))}</td><td>${esc(v.productos)}</td>
            <td class="num">${moneda(v.total)}</td>
            <td>${v.descontado_en ? '<span class="estado ok">Descontado</span>' : '<span class="estado alerta">Pendiente</span>'}</td>
          </tr>`).join('')}
        </tbody>
        <tfoot><tr><th colspan="3">Total</th><th class="num">${moneda(r.ventas.reduce((s, v) => s + Number(v.total), 0))}</th><th></th></tr></tfoot>
      </table></div>
      <div class="acciones"><button type="button" data-cerrar>Cerrar</button></div>`);
  }

  // ---------- Trabajadores ----------
  async function cargarTrabajadores() {
    const q = new FormData($('#f-buscar')).get('q');
    try {
      trabajadores = await api('GET', `/api/trabajadores${q ? `?q=${encodeURIComponent(q)}` : ''}`);
    } catch (err) {
      return aviso(err.message, 'error');
    }
    $('#trabajadores').innerHTML = trabajadores.length
      ? trabajadores.map((t, i) => `
        <tr>
          <td><strong>${esc(t.nombre)}</strong></td><td>${esc(t.numero)}</td><td>${esc(t.area)}</td>
          <td class="num">${Number(t.pendiente) > 0 ? `<strong>${moneda(t.pendiente)}</strong> <span class="muted">(${t.ventas_pendientes})</span>` : moneda(0)}</td>
          <td>${etiquetaEstado(t.activo ? 'activo' : 'inactivo')}</td>
          <td><button type="button" class="chico" data-editar="${i}">Editar</button></td>
        </tr>`).join('')
      : '<tr><td colspan="6" class="vacio">No hay trabajadores. Da de alta a quienes compran a crédito.</td></tr>';
  }

  function formulario(t) {
    const nuevo = !t;
    t ??= { activo: true };
    const d = abrirDialogo(`
      <h2>${nuevo ? 'Nuevo trabajador' : 'Editar trabajador'}</h2>
      <form id="f-trab" novalidate>
        <div class="form-grid">
          <label>Número de trabajador *<input name="numero" maxlength="20" required value="${esc(t.numero)}" autofocus></label>
          <label>Nombre completo *<input name="nombre" maxlength="120" required value="${esc(t.nombre)}"></label>
          <label>Área o departamento<input name="area" maxlength="80" value="${esc(t.area)}"></label>
          <label class="check ancho"><input type="checkbox" name="activo" ${t.activo ? 'checked' : ''}> Activo (puede comprar a crédito)</label>
        </div>
        <p class="muted">Sin límite de crédito: todo lo que compre se descuenta en su nómina semanal.</p>
        <p class="error-form" id="error-trab" role="alert"></p>
        <div class="acciones"><button type="button" data-cerrar>Cancelar</button><button type="submit" class="primario">Guardar</button></div>
      </form>`);
    d.querySelector('#f-trab').addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.target;
      const datos = { numero: f.numero.value, nombre: f.nombre.value, area: f.area.value, activo: f.activo.checked };
      if (!nuevo && t.activo && !datos.activo && Number(t.pendiente) > 0 &&
          !confirm(`${t.nombre} todavía debe ${moneda(t.pendiente)} sin descontar. ¿Darlo de baja de todos modos?`)) return;
      try {
        await api(nuevo ? 'POST' : 'PUT', nuevo ? '/api/trabajadores' : `/api/trabajadores/${t.id}`, datos);
        aviso('Trabajador guardado.');
        cerrarDialogo();
        cargarTrabajadores();
      } catch (err) {
        d.querySelector('#error-trab').textContent = err.message;
      }
    });
  }

  // ---------- Eventos ----------
  $('#anterior').addEventListener('click', () => {
    semana = sumarDias(semana, -7);
    cargarSemana();
  });
  $('#siguiente').addEventListener('click', () => {
    semana = sumarDias(semana, 7);
    cargarSemana();
  });
  $('#actual').addEventListener('click', () => {
    semana = inicioSemana(hoy());
    cargarSemana();
  });
  $('#dia').addEventListener('change', (e) => {
    if (!e.target.value) return;
    semana = inicioSemana(e.target.value);
    cargarSemana();
  });
  $('#semana').addEventListener('click', (e) => {
    const det = e.target.closest('button[data-detalle]');
    if (det) detalle(filasSemana[Number(det.dataset.detalle)]).catch((err) => aviso(err.message, 'error'));
  });
  $('#semana').addEventListener('change', (e) => {
    if (!e.target.matches('input.sel')) return;
    const casillas = [...el.querySelectorAll('#semana input.sel')];
    $('#todos').checked = casillas.every((c) => c.checked);
    actualizarBoton();
  });
  $('#todos').addEventListener('change', (e) => {
    for (const c of el.querySelectorAll('#semana input.sel')) c.checked = e.target.checked;
    actualizarBoton();
  });
  $('#descontar-todo').addEventListener('click', descontar);
  $('#excel').addEventListener('click', () =>
    descargar(`/api/excel/nomina?semana=${semana}`).catch((err) => aviso(err.message, 'error')));
  $('#imprimir').addEventListener('click', () => window.print());
  $('#nuevo').addEventListener('click', () => formulario(null));
  $('#excel-trab').addEventListener('click', () =>
    descargar('/api/excel/trabajadores').catch((err) => aviso(err.message, 'error')));
  $('#importar-trab').addEventListener('click', async () => {
    try {
      const archivo = await elegirExcel();
      if (!archivo) return;
      const r = await api('POST', '/api/excel/trabajadores', { archivo });
      aviso(`Importación lista: ${r.nuevos} nuevo(s) y ${r.actualizados} actualizado(s).`);
      cargarTrabajadores();
    } catch (err) {
      // Los errores por fila vienen en varias líneas: se muestran en un diálogo.
      abrirDialogo(`
        <h2>No se pudo importar</h2>
        <pre class="errores">${esc(err.message)}</pre>
        <div class="acciones"><button type="button" data-cerrar>Cerrar</button></div>`);
    }
  });

  $('#f-buscar').addEventListener('submit', (e) => {
    e.preventDefault();
    cargarTrabajadores();
  });
  $('#trabajadores').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-editar]');
    if (b) formulario(trabajadores[Number(b.dataset.editar)]);
  });

  await Promise.all([cargarSemana(), cargarTrabajadores()]);
}
