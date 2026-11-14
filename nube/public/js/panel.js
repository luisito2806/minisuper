// Panel de la nube: solo consulta. Los datos llegan cuando la tienda tiene
// internet (cada minuto) o cuando se carga un paquete traído en USB.

const $ = (s, el = document) => el.querySelector(s);
const vista = $('#vista');
let tiendas = [];
let tiendaId = null;

// ---------- Utilidades ----------
class ErrorApi extends Error {
  constructor(status, mensaje) {
    super(mensaje);
    this.status = status;
  }
}
async function api(metodo, url, cuerpo) {
  let res;
  try {
    res = await fetch(url, {
      method: metodo,
      headers: cuerpo !== undefined ? { 'Content-Type': 'application/json' } : {},
      body: cuerpo !== undefined ? JSON.stringify(cuerpo) : undefined,
      credentials: 'same-origin',
    });
  } catch {
    throw new ErrorApi(0, 'Sin conexión a internet.');
  }
  const datos = res.headers.get('content-type')?.includes('json') ? await res.json() : null;
  if (!res.ok) {
    if (res.status === 401 && !url.includes('/login')) mostrarLogin();
    throw new ErrorApi(res.status, datos?.message || `Error ${res.status}`);
  }
  return datos;
}
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const fmt = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
const moneda = (v) => fmt.format(Number(v ?? 0));
const partes = new Intl.DateTimeFormat('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Mexico_City' });
const fechaHora = (v) => (v ? partes.format(new Date(v)) : '');
const corta = (f) => f.split('-').reverse().join('/');
const hoy = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' });
const numero = (n, u) => `${Number(n).toLocaleString('es-MX', { maximumFractionDigits: u === 'pieza' ? 0 : 3 })} ${u === 'pieza' ? 'pz' : u === 'litro' ? 'L' : u ?? ''}`;
const METODOS = { efectivo: 'Efectivo', credito: 'Crédito', tarjeta: 'Tarjeta', transferencia: 'Transferencia', otro: 'Otro' };
function aviso(m, tipo = 'ok') {
  const el = document.createElement('div');
  el.className = `aviso ${tipo}`;
  el.setAttribute('role', tipo === 'error' ? 'alert' : 'status');
  el.textContent = m;
  $('#avisos').append(el);
  setTimeout(() => el.remove(), tipo === 'error' ? 7000 : 4000);
}
const estado = (e) => `<span class="estado ${{ completada: 'ok', cancelada: 'mal', abierta: 'info', cerrada: 'neutro', agotado: 'mal', bajo: 'alerta', normal: 'ok' }[e] ?? 'neutro'}">${esc({ completada: 'Completada', cancelada: 'Cancelada', abierta: 'Abierta', cerrada: 'Cerrada', agotado: 'Agotado', bajo: 'Por agotarse', normal: 'Disponible' }[e] ?? e)}</span>`;
const vacio = (n, t = 'Sin datos en el periodo.') => `<tr><td colspan="${n}" class="vacio">${t}</td></tr>`;
const filtrosFecha = (desde = hoy(), hasta = hoy()) => `
  <label>Desde<input type="date" name="desde" value="${desde}"></label>
  <label>Hasta<input type="date" name="hasta" value="${hasta}"></label>`;
const base = () => `/api/tiendas/${tiendaId}`;

/** Hace cuánto llegaron datos de la tienda. */
function frescura(t) {
  if (!t?.ultima_sync) {
    return '<div class="banner alerta"><span>Esta tienda todavía no ha enviado datos. Conecta la tienda a internet o carga un paquete de USB.</span></div>';
  }
  const min = Math.round((Date.now() - new Date(t.ultima_sync)) / 60000);
  const texto = min < 2 ? 'hace un momento' : min < 60 ? `hace ${min} minutos` : min < 1440 ? `hace ${Math.round(min / 60)} horas` : `hace ${Math.round(min / 1440)} días`;
  return `<div class="banner ${min > 1440 ? 'alerta' : 'ok'}"><span>Datos recibidos ${texto} (${esc(fechaHora(t.ultima_sync))}).
    ${min > 1440 ? 'Lo más reciente puede no aparecer: la tienda no se ha conectado.' : ''}</span></div>`;
}

// ---------- Secciones ----------
const SECCIONES = {
  async resumen() {
    vista.innerHTML = `
      ${frescura(tiendas.find((t) => t.id === tiendaId))}
      <section class="panel">
        <div class="encabezado"><h1><span class="acento">Resumen</span></h1></div>
        <form class="filtros" id="f">${filtrosFecha()}<button type="submit" class="primario">Ver</button></form>
        <div id="tarjetas" class="tarjetas"></div>
      </section>
      <div class="dos-columnas">
        <section class="panel"><h2>Por día</h2><div class="tabla-wrap"><table>
          <thead><tr><th>Día</th><th class="num">Ventas</th><th class="num">Total</th><th class="num">Crédito</th><th class="num">Utilidad</th></tr></thead>
          <tbody id="dias"></tbody></table></div></section>
        <section class="panel"><h2>Más vendidos</h2><div class="tabla-wrap"><table>
          <thead><tr><th>Producto</th><th class="num">Cantidad</th><th class="num">Importe</th></tr></thead>
          <tbody id="top"></tbody></table></div></section>
      </div>
      <section class="panel"><h2>Cajas abiertas ahora</h2><div class="tabla-wrap"><table>
        <thead><tr><th>Cajero</th><th>Abrió</th><th class="num">Fondo</th><th class="num">Ventas efectivo</th><th class="num">Ingresos</th><th class="num">Retiros</th></tr></thead>
        <tbody id="abiertas"></tbody></table></div></section>`;
    const cargar = async () => {
      const q = new URLSearchParams(new FormData($('#f')));
      const r = await api('GET', `${base()}/resumen?${q}`);
      $('#tarjetas').innerHTML = [
        ['Ventas', r.num_ventas],
        ['Total vendido', moneda(r.total)],
        ['En efectivo', moneda(r.efectivo)],
        ['A crédito (nómina)', moneda(r.credito)],
        ['Utilidad estimada', moneda(r.utilidad), 'destacada'],
        ['Canceladas', `${r.num_canceladas} (${moneda(r.total_cancelado)})`],
        ['Productos agotados', r.inventario.agotados],
        ['Por agotarse', r.inventario.bajos],
      ].map(([e, v, c]) => `<div class="tarjeta ${c ?? ''}"><div class="etiqueta">${e}</div><div class="valor">${esc(v)}</div></div>`).join('');
      $('#dias').innerHTML = r.por_dia.map((d) => `<tr><td>${corta(d.dia)}</td><td class="num">${d.num_ventas}</td><td class="num">${moneda(d.total)}</td><td class="num">${moneda(d.credito)}</td><td class="num">${moneda(d.utilidad)}</td></tr>`).join('') || vacio(5);
      $('#top').innerHTML = r.mas_vendidos.map((p) => `<tr><td>${esc(p.nombre)}</td><td class="num">${esc(numero(p.cantidad, p.unidad))}</td><td class="num">${moneda(p.importe)}</td></tr>`).join('') || vacio(3);
      $('#abiertas').innerHTML = r.cajas_abiertas.map((c) => `<tr><td>${esc(c.usuario)}</td><td>${esc(fechaHora(c.abierta_en))}</td><td class="num">${moneda(c.fondo_inicial)}</td><td class="num">${moneda(c.ventas_efectivo)}</td><td class="num">${moneda(c.ingresos)}</td><td class="num">${moneda(c.retiros)}</td></tr>`).join('') || vacio(6, 'No hay cajas abiertas.');
    };
    $('#f').addEventListener('submit', (e) => { e.preventDefault(); cargar().catch((err) => aviso(err.message, 'error')); });
    await cargar();
  },

  async ventas() {
    vista.innerHTML = `
      <section class="panel">
        <div class="encabezado"><h1><span class="acento">Ventas</span></h1></div>
        <form class="filtros" id="f">${filtrosFecha()}
          <label>Estado<select name="estado"><option value="completada">Completadas</option><option value="cancelada">Canceladas</option><option value="">Todas</option></select></label>
          <button type="submit" class="primario">Buscar</button></form>
        <div class="tabla-wrap"><table>
          <thead><tr><th>Folio</th><th>Fecha</th><th>Cajero</th><th>Pago</th><th class="num">Total</th><th>Estado</th><th></th></tr></thead>
          <tbody id="filas"></tbody></table></div>
      </section>`;
    const cargar = async () => {
      const ventas = await api('GET', `${base()}/ventas?${new URLSearchParams(new FormData($('#f')))}`);
      $('#filas').innerHTML = ventas.map((v) => `
        <tr><td>${esc(v.folio)}</td><td>${esc(fechaHora(v.fecha))}</td><td>${esc(v.cajero)}</td>
        <td>${esc(METODOS[v.metodo_pago] ?? v.metodo_pago)}${v.trabajador_nombre ? ` · ${esc(v.trabajador_nombre)}` : ''}</td>
        <td class="num">${moneda(v.total)}</td><td>${estado(v.estado)}</td>
        <td><button type="button" class="chico" data-id="${esc(v.id)}">Ver</button></td></tr>`).join('') || vacio(7);
    };
    $('#f').addEventListener('submit', (e) => { e.preventDefault(); cargar().catch((err) => aviso(err.message, 'error')); });
    $('#filas').addEventListener('click', async (e) => {
      const b = e.target.closest('button[data-id]');
      if (!b) return;
      try {
        const v = await api('GET', `${base()}/ventas/${b.dataset.id}`);
        abrirDialogo(`
          <div class="encabezado"><h2>Venta ${esc(v.folio)}</h2>${estado(v.estado)}</div>
          <p class="muted">${esc(fechaHora(v.fecha))} · ${esc(v.cajero)} · ${esc(METODOS[v.metodo_pago] ?? v.metodo_pago)}${v.trabajador_nombre ? ` · ${esc(v.trabajador_nombre)} (${esc(v.trabajador_numero)})` : ''}</p>
          <div class="tabla-wrap"><table><thead><tr><th>Producto</th><th class="num">Cantidad</th><th class="num">Precio</th><th class="num">Importe</th></tr></thead>
          <tbody>${v.partidas.map((p) => `<tr><td>${esc(p.nombre)}</td><td class="num">${esc(numero(p.cantidad, p.unidad))}</td><td class="num">${moneda(p.precio)}</td><td class="num">${moneda(p.importe)}</td></tr>`).join('')}</tbody>
          <tfoot><tr><th colspan="3">Total</th><th class="num">${moneda(v.total)}</th></tr></tfoot></table></div>
          ${v.estado === 'cancelada' ? `<p class="error-form">Cancelada: ${esc(v.motivo_cancelacion)}</p>` : ''}
          <div class="acciones"><button type="button" data-cerrar>Cerrar</button></div>`);
      } catch (err) {
        aviso(err.message, 'error');
      }
    });
    await cargar();
  },

  async inventario() {
    vista.innerHTML = `
      ${frescura(tiendas.find((t) => t.id === tiendaId))}
      <section class="panel">
        <div class="encabezado"><h1><span class="acento">Inventario</span></h1></div>
        <form class="filtros" id="f">
          <label>Mostrar<select name="nivel"><option value="bajo">Por agotarse y agotados</option><option value="">Todo</option></select></label>
          <label>Buscar<input name="q" placeholder="Nombre o código"></label>
          <button type="submit" class="primario">Ver</button></form>
        <div class="tabla-wrap"><table>
          <thead><tr><th>Código</th><th>Producto</th><th>Categoría</th><th class="num">Existencia</th><th class="num">Mínimo</th><th class="num">Precio</th><th>Estado</th></tr></thead>
          <tbody id="filas"></tbody></table></div>
      </section>`;
    const cargar = async () => {
      const productos = await api('GET', `${base()}/inventario?${new URLSearchParams(new FormData($('#f')))}`);
      $('#filas').innerHTML = productos.map((p) => `
        <tr><td>${esc(p.codigo)}</td><td>${esc(p.nombre)}</td><td>${esc(p.categoria)}</td>
        <td class="num">${esc(numero(p.existencia, p.unidad))}</td><td class="num">${esc(numero(p.stock_minimo, p.unidad))}</td>
        <td class="num">${moneda(p.precio_venta)}</td><td>${estado(p.nivel)}</td></tr>`).join('') || vacio(7, 'Nada por agotarse.');
    };
    $('#f').addEventListener('submit', (e) => { e.preventDefault(); cargar().catch((err) => aviso(err.message, 'error')); });
    await cargar();
  },

  async nomina() {
    vista.innerHTML = `
      <section class="panel">
        <div class="encabezado"><h1><span class="acento">Nómina</span> semanal</h1></div>
        <form class="filtros" id="f"><label>Semana que incluye el día<input type="date" name="semana" value="${hoy()}"></label><button type="submit" class="primario">Ver</button></form>
        <p id="titulo" class="subtitulo"></p>
        <div class="tabla-wrap"><table>
          <thead><tr><th>Núm.</th><th>Trabajador</th><th class="num">Compras</th><th class="num">Total</th><th class="num">Pendiente</th></tr></thead>
          <tbody id="filas"></tbody><tfoot id="total"></tfoot></table></div>
        <p class="muted">Los descuentos se marcan como aplicados desde la tienda (sección Nómina).</p>
      </section>`;
    const cargar = async () => {
      const r = await api('GET', `${base()}/nomina?${new URLSearchParams(new FormData($('#f')))}`);
      $('#titulo').textContent = `Del sábado ${corta(r.inicio)} al viernes ${corta(r.fin)}`;
      $('#filas').innerHTML = r.trabajadores.map((t) => `<tr><td>${esc(t.numero)}</td><td>${esc(t.nombre)}</td><td class="num">${t.num_ventas}</td><td class="num"><strong>${moneda(t.total)}</strong></td><td class="num">${moneda(t.pendiente)}</td></tr>`).join('') || vacio(5, 'Nadie compró a crédito esa semana.');
      const total = r.trabajadores.reduce((s, t) => s + Number(t.total), 0);
      $('#total').innerHTML = r.trabajadores.length ? `<tr><th colspan="3">Total</th><th class="num">${moneda(total)}</th><th></th></tr>` : '';
    };
    $('#f').addEventListener('submit', (e) => { e.preventDefault(); cargar().catch((err) => aviso(err.message, 'error')); });
    await cargar();
  },

  async cajas() {
    vista.innerHTML = `
      <section class="panel">
        <div class="encabezado"><h1><span class="acento">Cortes</span> de caja</h1></div>
        <form class="filtros" id="f">${filtrosFecha(hoy().slice(0, 8) + '01')}<button type="submit" class="primario">Ver</button></form>
        <div class="tabla-wrap"><table>
          <thead><tr><th>Cajero</th><th>Abrió</th><th>Cerró</th><th class="num">Ventas efectivo</th><th class="num">Crédito</th><th class="num">Esperado</th><th class="num">Contado</th><th class="num">Diferencia</th><th>Estado</th></tr></thead>
          <tbody id="filas"></tbody></table></div>
      </section>`;
    const cargar = async () => {
      const cajas = await api('GET', `${base()}/cajas?${new URLSearchParams(new FormData($('#f')))}`);
      $('#filas').innerHTML = cajas.map((c) => {
        const d = Number(c.diferencia);
        return `<tr><td>${esc(c.usuario)}</td><td>${esc(fechaHora(c.abierta_en))}</td><td>${esc(fechaHora(c.cerrada_en))}</td>
          <td class="num">${moneda(c.ventas_efectivo)}</td><td class="num">${moneda(c.ventas_credito)}</td>
          <td class="num">${c.efectivo_esperado === null ? '' : moneda(c.efectivo_esperado)}</td>
          <td class="num">${c.monto_contado === null ? '' : moneda(c.monto_contado)}</td>
          <td class="num ${d < 0 ? 'negativo' : ''}">${c.diferencia === null ? '' : d === 0 ? 'Cuadra' : moneda(d)}</td>
          <td>${estado(c.estado)}</td></tr>`;
      }).join('') || vacio(9);
    };
    $('#f').addEventListener('submit', (e) => { e.preventDefault(); cargar().catch((err) => aviso(err.message, 'error')); });
    await cargar();
  },

  async usb() {
    vista.innerHTML = `
      <section class="panel">
        <h1><span class="acento">Cargar</span> datos traídos en USB</h1>
        <p>Cuando la tienda no tiene internet: en la tienda, <em>Configuración → Copiar a USB</em> guarda un archivo
          <code>paquete_minisuper_….json.gz</code>. Trae la USB, elige ese archivo aquí y los datos aparecerán en el panel.</p>
        <p class="muted">Se puede cargar el mismo paquete dos veces sin que se dupliquen las ventas.</p>
        <form id="f" class="filtros"><label>Paquete<input type="file" name="archivo" accept=".gz,application/gzip" required></label>
          <button type="submit" class="primario">Cargar</button></form>
        <p id="resultado"></p>
      </section>`;
    $('#f').addEventListener('submit', async (e) => {
      e.preventDefault();
      const archivo = e.target.archivo.files[0];
      if (!archivo) return aviso('Elige el archivo del paquete.', 'error');
      const base64 = await new Promise((ok, falla) => {
        const l = new FileReader();
        l.onload = () => ok(String(l.result).split(',')[1] ?? '');
        l.onerror = falla;
        l.readAsDataURL(archivo);
      });
      try {
        const r = await api('POST', `${base()}/paquete`, { archivo: base64 });
        $('#resultado').innerHTML = `<span class="estado ok">Listo</span> Se recibieron ${r.recibido.ventas} ventas, ${r.recibido.productos} productos, ${r.recibido.trabajadores} trabajadores y ${r.recibido.cajas} cortes de caja.`;
        await cargarTiendas();
      } catch (err) {
        $('#resultado').innerHTML = `<span class="error-form">${esc(err.message)}</span>`;
      }
    });
  },
};

// ---------- Diálogo ----------
const dialogo = $('#dialogo');
function abrirDialogo(html) {
  $('#dialogo-contenido').innerHTML = html;
  if (!dialogo.open) dialogo.showModal();
}
dialogo.addEventListener('click', (e) => {
  if (e.target.closest('[data-cerrar]') || e.target === dialogo) dialogo.close();
});

// ---------- Navegación y sesión ----------
async function mostrar() {
  const id = location.hash.slice(1) || 'resumen';
  const seccion = SECCIONES[id] ? id : 'resumen';
  for (const a of document.querySelectorAll('#menu a')) {
    if (a.dataset.seccion === seccion) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }
  if (!tiendaId) {
    vista.innerHTML = '<div class="panel"><p>Tu usuario no tiene tiendas asignadas.</p></div>';
    return;
  }
  vista.innerHTML = '<p class="muted">Cargando…</p>';
  try {
    await SECCIONES[seccion]();
  } catch (err) {
    vista.innerHTML = `<div class="panel"><p class="error-form">${esc(err.message)}</p></div>`;
  }
}

async function cargarTiendas() {
  tiendas = await api('GET', '/api/tiendas');
  let guardada = null;
  try { guardada = Number(localStorage.getItem('tienda')); } catch { /* sin almacenamiento */ }
  tiendaId = tiendas.find((t) => t.id === guardada)?.id ?? tiendas[0]?.id ?? null;
  $('#tienda').innerHTML = tiendas.map((t) => `<option value="${t.id}" ${t.id === tiendaId ? 'selected' : ''}>${esc(t.nombre)}</option>`).join('');
  $('#tienda').classList.toggle('oculto', tiendas.length < 2);
}

function mostrarLogin() {
  $('#app').classList.add('oculto');
  $('#login').classList.remove('oculto');
}

async function iniciar() {
  try {
    const { usuario } = await api('GET', '/api/auth/yo');
    $('#usuario-actual').textContent = usuario.nombre;
    await cargarTiendas();
  } catch {
    return mostrarLogin();
  }
  $('#login').classList.add('oculto');
  $('#app').classList.remove('oculto');
  mostrar();
}

$('#f-login').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    await api('POST', '/api/auth/login', { usuario: e.target.usuario.value, contrasena: e.target.contrasena.value });
    e.target.reset();
    iniciar();
  } catch (err) {
    $('#error-login').textContent = err.message;
  }
});
$('#salir').addEventListener('click', async () => {
  await api('POST', '/api/auth/logout', {}).catch(() => {});
  location.reload();
});
$('#tienda').addEventListener('change', (e) => {
  tiendaId = Number(e.target.value);
  try { localStorage.setItem('tienda', String(tiendaId)); } catch { /* sin almacenamiento */ }
  mostrar();
});
// ---------- Celular: menú desplegable y tablas como tarjetas ----------
const barra = $('.barra');
const botonMenu = $('#menu-boton');
function menuAbierto(abierto) {
  barra.classList.toggle('abierta', abierto);
  document.body.classList.toggle('menu-abierto', abierto);
  botonMenu.setAttribute('aria-expanded', String(abierto));
  botonMenu.textContent = abierto ? 'Cerrar' : 'Menú';
}
botonMenu.addEventListener('click', () => menuAbierto(!barra.classList.contains('abierta')));
window.addEventListener('hashchange', () => menuAbierto(false));
barra.addEventListener('click', (e) => {
  if (e.target === barra && barra.classList.contains('abierta')) menuAbierto(false);
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && barra.classList.contains('abierta')) menuAbierto(false);
});


/** Copia el título de cada columna a sus celdas; el CSS las muestra como "Título: valor". */
function etiquetarTablas() {
  for (const tabla of document.querySelectorAll('table')) {
    const titulos = [...tabla.querySelectorAll('thead th')].map((th) => th.textContent.trim());
    if (!titulos.length) continue;
    for (const fila of tabla.querySelectorAll('tbody tr, tfoot tr')) {
      let columna = 0;
      for (const celda of fila.children) {
        if (!celda.hasAttribute('data-label')) celda.setAttribute('data-label', celda.colSpan > 1 ? '' : (titulos[columna] ?? ''));
        columna += celda.colSpan || 1;
      }
    }
  }
}
let pendiente = false;
new MutationObserver(() => {
  if (pendiente) return;
  pendiente = true;
  requestAnimationFrame(() => { pendiente = false; etiquetarTablas(); });
}).observe(document.body, { childList: true, subtree: true });

window.addEventListener('hashchange', mostrar);
iniciar();

