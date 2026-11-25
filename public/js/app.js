import { api, aplicarFormato, aviso, cargarTienda, esc, etiquetarTablas } from './comun.js';

// Secciones. `admin: true` → solo las ve el administrador (el servidor
// también lo valida; ocultarlas aquí es solo por comodidad).
const SECCIONES = [
  { id: 'venta', titulo: 'Vender', modulo: './vistas/venta.js' },
  { id: 'caja', titulo: 'Caja', modulo: './vistas/caja.js' },
  { id: 'ventas', titulo: 'Ventas', modulo: './vistas/ventas.js' },
  { id: 'nomina', titulo: 'Nómina', modulo: './vistas/nomina.js', admin: true },
  { id: 'productos', titulo: 'Productos', modulo: './vistas/productos.js' },
  { id: 'inventario', titulo: 'Inventario', modulo: './vistas/inventario.js' },
  { id: 'compras', titulo: 'Compras', modulo: './vistas/compras.js', admin: true },
  { id: 'proveedores', titulo: 'Proveedores', modulo: './vistas/proveedores.js', admin: true },
  { id: 'reportes', titulo: 'Reportes', modulo: './vistas/reportes.js', admin: true },
  { id: 'usuarios', titulo: 'Usuarios', modulo: './vistas/usuarios.js', admin: true },
  { id: 'configuracion', titulo: 'Configuración', modulo: './vistas/configuracion.js', admin: true },
  { id: 'cuenta', titulo: 'Mi cuenta', modulo: './vistas/cuenta.js', oculta: true },
];

const vista = document.getElementById('vista');
const dialogo = document.getElementById('dialogo');
const dialogoContenido = document.getElementById('dialogo-contenido');
let controlVista = null;

/** Abre un diálogo modal con el HTML dado. Devuelve el contenedor. */
function abrirDialogo(html) {
  dialogoContenido.innerHTML = html;
  if (!dialogo.open) dialogo.showModal();
  dialogoContenido.querySelector('[autofocus], input, select, button')?.focus();
  return dialogoContenido;
}
function cerrarDialogo() {
  if (dialogo.open) dialogo.close();
  dialogoContenido.innerHTML = '';
}
dialogo.addEventListener('click', (e) => {
  if (e.target.closest('[data-cerrar]')) cerrarDialogo();
});

async function iniciar() {
  let usuario;
  let config;
  try {
    ({ usuario } = await api('GET', '/api/auth/yo'));
    // Contraseña inicial o puesta por el administrador: solo se puede cambiar.
    if (usuario.debe_cambiar_contrasena) return void (await soloCambiarContrasena(usuario));
    config = await api('GET', '/api/configuracion');
  } catch (err) {
    if (err.status !== 401) vista.innerHTML = `<div class="panel"><p class="error-form">${esc(err.message)}</p></div>`;
    return;
  }
  aplicarFormato(config);
  const esAdmin = usuario.rol === 'administrador';
  const permitidas = SECCIONES.filter((s) => !s.admin || esAdmin);

  const ctx = {
    usuario,
    esAdmin,
    config,
    abrirDialogo,
    cerrarDialogo,
    /** Vuelve a leer la configuración (después de guardarla). */
    async recargarConfig() {
      ctx.config = await api('GET', '/api/configuracion');
      aplicarFormato(ctx.config);
      pintarTienda();
    },
    /** Actualiza el indicador de caja de la barra superior. */
    async actualizarCaja() {
      const el = document.getElementById('estado-caja');
      try {
        const { sesion } = await api('GET', '/api/caja/actual');
        ctx.caja = sesion;
        el.innerHTML = sesion
          ? '<a href="#caja" class="estado ok estado-caja">Caja abierta</a>'
          : `<a href="#caja" class="estado ${ctx.config.requiere_caja_abierta ? 'alerta' : 'neutro'} estado-caja">Caja cerrada</a>`;
      } catch {
        el.textContent = '';
      }
      return ctx.caja;
    },
  };

  function pintarTienda() {
    document.getElementById('nombre-tienda').textContent = ctx.config.nombre_tienda;
    document.title = ctx.config.nombre_tienda;
  }
  pintarTienda();
  ctx.actualizarCaja();

  document.getElementById('usuario-actual').textContent =
    `${usuario.nombre} · ${esAdmin ? 'Administrador' : 'Cajero'}`;
  document.getElementById('menu').innerHTML = permitidas
    .filter((s) => !s.oculta)
    .map((s) => `<a href="#${s.id}" data-seccion="${s.id}">${esc(s.titulo)}</a>`)
    .join('');
  document.getElementById('salir').addEventListener('click', async () => {
    try {
      await api('POST', '/api/auth/logout', {});
    } finally {
      location.replace('/login.html');
    }
  });

  async function mostrar() {
    const id = location.hash.slice(1) || 'venta';
    const seccion = permitidas.find((s) => s.id === id);
    if (!seccion) {
      location.hash = '#venta';
      return;
    }
    controlVista?.abort();
    controlVista = new AbortController();
    cerrarDialogo();
    for (const a of document.querySelectorAll('#menu a')) {
      if (a.dataset.seccion === id) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    }
    vista.innerHTML = '<p class="muted">Cargando…</p>';
    try {
      const modulo = await import(seccion.modulo);
      await modulo.render(vista, { ...ctx, ctx, senal: controlVista.signal, recargar: mostrar });
    } catch (err) {
      vista.innerHTML = `<div class="panel"><p class="error-form">${esc(err.message)}</p></div>`;
    }
  }

  // Menú en el celular: el botón lo abre; al elegir una sección se cierra.
  const barra = document.querySelector('.barra');
  const botonMenu = document.getElementById('menu-boton');
  const menuAbierto = (abierto) => {
    barra.classList.toggle('abierta', abierto);
    document.body.classList.toggle('menu-abierto', abierto); // la página de atrás no se mueve
    botonMenu.setAttribute('aria-expanded', String(abierto));
    botonMenu.textContent = abierto ? 'Cerrar' : 'Menú';
  };
  botonMenu.addEventListener('click', () => menuAbierto(!barra.classList.contains('abierta')));
  window.addEventListener('hashchange', () => menuAbierto(false));
  // Tocar el fondo oscurecido (fuera de la tarjeta) o presionar Esc lo cierra.
  barra.addEventListener('click', (e) => {
    if (e.target === barra && barra.classList.contains('abierta')) menuAbierto(false);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && barra.classList.contains('abierta')) menuAbierto(false);
  });
  // "Mi cuenta" no cambia de sección si ya estás ahí: también cierra.
  document.getElementById('menu-panel').addEventListener('click', (e) => {
    if (e.target.closest('a')) menuAbierto(false);
  });


  // Tablas como tarjetas en el celular: etiquetar cada vez que cambia el contenido.
  let pendiente = false;
  new MutationObserver(() => {
    if (pendiente) return;
    pendiente = true;
    requestAnimationFrame(() => {
      pendiente = false;
      etiquetarTablas(document);
    });
  }).observe(document.body, { childList: true, subtree: true });

  window.addEventListener('hashchange', mostrar);

  mostrar();
}

/** Pantalla única "cambia tu contraseña" (sin menú) hasta que la cambie. */
async function soloCambiarContrasena(usuario) {
  const tienda = await cargarTienda().catch(() => null);
  if (tienda) document.getElementById('nombre-tienda').textContent = tienda.nombre;
  document.getElementById('usuario-actual').textContent = usuario.nombre;
  document.getElementById('menu').innerHTML = '';
  // En el celular, el botón "Menú" deja llegar a "Salir".
  document.getElementById('menu-boton').addEventListener('click', () => {
    document.querySelector('.barra').classList.toggle('abierta');
  });
  document.getElementById('salir').addEventListener('click', async () => {
    try {
      await api('POST', '/api/auth/logout', {});
    } finally {
      location.replace('/login.html');
    }
  });
  const { render } = await import('./vistas/cuenta.js');
  await render(vista, { usuario, obligatorio: true });
}

// Errores no capturados en manejadores: se muestran en lugar de perderse.
window.addEventListener('unhandledrejection', (e) => {
  aviso(e.reason?.message || 'Ocurrió un error inesperado.', 'error');
});

iniciar();
