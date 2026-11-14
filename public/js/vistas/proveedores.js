// Proveedores (solo administrador): alta y edición, y los productos de cada
// uno con sus precios, para cambiarlos todos juntos cuando el proveedor sube.
import { aEntero, aTexto } from '../dinero.js';
import { api, aviso, cantidad, esc, etiquetaEstado, moneda } from '../comun.js';

/** Margen de ganancia sobre el precio de venta (texto). */
function margen(costo, precio) {
  const c = Number(costo);
  const p = Number(precio);
  if (!p || Number.isNaN(c) || Number.isNaN(p)) return '—';
  return `${(((p - c) / p) * 100).toFixed(1)}%`;
}

/** Sube o baja un importe un porcentaje y lo redondea hacia arriba (0 = centavos). */
function ajustar(valor, porcentaje, redondeo) {
  const centavos = aEntero(valor, 2);
  if (centavos === null) return valor;
  let nuevo = Math.round(centavos * (1 + porcentaje / 100));
  if (redondeo > 0) nuevo = Math.ceil(nuevo / redondeo) * redondeo;
  return aTexto(Math.max(nuevo, 0), 2);
}

export async function render(el, { abrirDialogo, cerrarDialogo }) {
  let proveedores = [];
  el.innerHTML = `
    <section class="panel">
      <div class="encabezado"><h1><span class="acento">Proveedores</span> registrados</h1><button type="button" class="primario" id="nuevo">Nuevo proveedor</button></div>
      <div class="tabla-wrap"><table>
        <thead><tr><th>Nombre</th><th>Teléfono</th><th class="num">Productos</th><th>Estado</th><th></th></tr></thead>
        <tbody id="filas"></tbody>
      </table></div>
      <p class="muted">Cada producto tiene un proveedor habitual (se pone en Productos, o solo con la primera compra).
        Los que no tienen proveedor son los de <strong>compra manual</strong>.</p>
    </section>
    <section class="panel oculto" id="precios"></section>`;

  async function cargar() {
    proveedores = await api('GET', '/api/proveedores');
    const { num_productos: sinProveedor } = await api('GET', '/api/proveedores/sin-proveedor');
    el.querySelector('#filas').innerHTML = proveedores.map((p, i) => `
        <tr>
          <td><strong>${esc(p.nombre)}</strong></td><td>${esc(p.telefono)}</td>
          <td class="num">${p.num_productos}</td>
          <td>${etiquetaEstado(p.activo ? 'activo' : 'inactivo')}</td>
          <td class="acciones-fila">
            <button type="button" class="primario boton-precios" data-precios="${i}">Ver productos y precios</button>
            <button type="button" class="chico" data-editar="${i}">Editar</button>
          </td>
        </tr>`).join('') + `
        <tr>
          <td><strong>Compra manual</strong> <span class="muted">(sin proveedor)</span></td><td></td>
          <td class="num">${sinProveedor}</td><td></td>
          <td class="acciones-fila"><button type="button" class="primario boton-precios" data-precios="sin">Ver productos y precios</button></td>
        </tr>`;
  }

  // ---------- Productos y precios de un proveedor ----------
  async function verPrecios(proveedor) {
    const panel = el.querySelector('#precios');
    const id = proveedor ? proveedor.id : 'sin';
    const nombre = proveedor ? proveedor.nombre : 'Compra manual (sin proveedor)';
    const productos = (await api('GET', `/api/productos?proveedor_id=${id}`))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
    // Valores editados (texto) por id; se comparan contra los originales.
    const editados = new Map(productos.map((p) => [String(p.id), { costo: p.costo, precio_venta: p.precio_venta }]));
    const original = new Map(productos.map((p) => [String(p.id), p]));

    panel.classList.remove('oculto');
    panel.innerHTML = `
      <div class="encabezado">
        <h2>Productos de <span class="acento">${esc(nombre)}</span></h2>
        <div class="opciones">
          ${proveedor ? '<button type="button" id="ir-compra">Registrar compra</button>' : ''}
          <button type="button" id="cerrar-precios">Cerrar</button>
        </div>
      </div>
      ${productos.length ? `
      <div class="filtros ajuste-masivo">
        <label>Cambiar todos (%)<input id="porcentaje" inputmode="decimal" placeholder="Ej. 8 o -5"></label>
        <label>Aplicar a<select id="aplicar-a">
          <option value="ambos">Costo y precio de venta</option>
          <option value="costo">Solo costo</option>
          <option value="precio">Solo precio de venta</option>
        </select></label>
        <label>Redondear precio a<select id="redondeo">
          <option value="0">Centavos (sin redondear)</option>
          <option value="50">$0.50</option>
          <option value="100">$1.00</option>
        </select></label>
        <button type="button" id="aplicar">Aplicar</button>
      </div>` : ''}
      <div class="tabla-wrap"><table>
        <thead><tr><th>Producto</th><th class="num">Existencia</th><th class="num">Costo</th><th class="num">Precio venta</th><th class="num">Margen</th></tr></thead>
        <tbody id="filas-precios"></tbody>
      </table></div>
      <p class="error-form" id="error-precios" role="alert"></p>
      <div class="acciones">
        <button type="button" id="descartar-precios">Descartar cambios</button>
        <button type="button" class="primario" id="guardar-precios" disabled>Guardar cambios</button>
      </div>`;
    panel.scrollIntoView({ behavior: 'smooth' });
    const $ = (s) => panel.querySelector(s);

    const cambiados = () => productos.filter((p) => {
      const e = editados.get(String(p.id));
      return aEntero(e.costo, 2) !== aEntero(p.costo, 2) || aEntero(e.precio_venta, 2) !== aEntero(p.precio_venta, 2);
    });

    function pintar() {
      $('#filas-precios').innerHTML = productos.length
        ? productos.map((p) => {
            const e = editados.get(String(p.id));
            const cambio = cambiados().includes(p);
            return `
            <tr data-id="${esc(p.id)}" class="${cambio ? 'resaltada' : ''}">
              <td>${esc(p.nombre)} <span class="muted">${esc(p.codigo)}</span></td>
              <td class="num">${esc(cantidad(p.existencia, p.unidad))}</td>
              <td class="num"><input class="costo" inputmode="decimal" size="8" value="${esc(e.costo)}" aria-label="Costo de ${esc(p.nombre)}"></td>
              <td class="num"><input class="precio" inputmode="decimal" size="8" value="${esc(e.precio_venta)}" aria-label="Precio de venta de ${esc(p.nombre)}"></td>
              <td class="num margen">${margen(e.costo, e.precio_venta)}</td>
            </tr>`;
          }).join('')
        : `<tr><td colspan="5" class="vacio">${proveedor
            ? 'Este proveedor todavía no tiene productos. Asígnalos en Productos (campo "Proveedor"), o se asignan solos con su primera compra.'
            : 'Todos los productos tienen proveedor.'}</td></tr>`;
      actualizarBoton();
    }

    function actualizarBoton() {
      const n = cambiados().length;
      $('#guardar-precios').disabled = !n;
      $('#guardar-precios').textContent = n ? `Guardar cambios (${n})` : 'Guardar cambios';
    }

    $('#filas-precios').addEventListener('input', (ev) => {
      const fila = ev.target.closest('tr');
      const e = editados.get(fila?.dataset.id);
      if (!e) return;
      if (ev.target.matches('.costo')) e.costo = ev.target.value.trim();
      if (ev.target.matches('.precio')) e.precio_venta = ev.target.value.trim();
      fila.querySelector('.margen').textContent = margen(e.costo, e.precio_venta);
      fila.classList.toggle('resaltada', cambiados().includes(original.get(fila.dataset.id)));
      actualizarBoton();
    });

    $('#aplicar')?.addEventListener('click', () => {
      const porcentaje = Number(String($('#porcentaje').value).replace(',', '.'));
      if (!porcentaje || Number.isNaN(porcentaje) || porcentaje <= -100 || porcentaje > 500) {
        aviso('Escribe un porcentaje válido, por ejemplo 8 (sube) o -5 (baja).', 'error');
        return;
      }
      const a = $('#aplicar-a').value;
      const redondeo = Number($('#redondeo').value);
      for (const p of productos) {
        const e = editados.get(String(p.id));
        if (a !== 'precio') e.costo = ajustar(p.costo, porcentaje, 0);
        if (a !== 'costo') e.precio_venta = ajustar(p.precio_venta, porcentaje, redondeo);
      }
      pintar();
      aviso(`Se calculó el ${porcentaje > 0 ? 'aumento' : 'descuento'} del ${Math.abs(porcentaje)}%. Revisa y presiona "Guardar cambios".`);
    });

    $('#guardar-precios').addEventListener('click', async (ev) => {
      const lista = cambiados();
      const error = $('#error-precios');
      error.textContent = '';
      const invalido = lista.find((p) => {
        const e = editados.get(String(p.id));
        return aEntero(e.costo, 2) === null || aEntero(e.precio_venta, 2) === null;
      });
      if (invalido) {
        error.textContent = `Revisa los importes de "${invalido.nombre}" (números sin negativos, máximo 2 decimales).`;
        return;
      }
      const debajo = lista.filter((p) => {
        const e = editados.get(String(p.id));
        return aEntero(e.precio_venta, 2) < aEntero(e.costo, 2);
      });
      if (debajo.length && !confirm(`${debajo.length} producto(s) quedarían con precio de venta MENOR al costo (${debajo.map((p) => p.nombre).slice(0, 3).join(', ')}…). ¿Guardar de todos modos?`)) return;
      ev.target.disabled = true;
      try {
        const r = await api('PUT', '/api/productos/precios', {
          productos: lista.map((p) => ({ id: p.id, ...editados.get(String(p.id)) })),
        });
        aviso(`Precios actualizados en ${r.actualizados} producto(s).`);
        verPrecios(proveedor);
      } catch (err) {
        error.textContent = err.message;
        ev.target.disabled = false;
      }
    });

    $('#descartar-precios').addEventListener('click', () => verPrecios(proveedor));
    $('#cerrar-precios').addEventListener('click', () => {
      if (cambiados().length && !confirm('Hay cambios sin guardar. ¿Cerrar de todos modos?')) return;
      panel.classList.add('oculto');
      panel.innerHTML = '';
    });
    $('#ir-compra')?.addEventListener('click', () => {
      try {
        sessionStorage.setItem('compraProveedor', String(proveedor.id));
      } catch {
        // Sin almacenamiento: se abre Compras normal.
      }
      location.hash = '#compras';
    });
    pintar();
  }

  // ---------- Alta y edición ----------
  function formulario(p) {
    const nuevo = !p;
    p ??= { activo: true };
    const d = abrirDialogo(`
      <h2>${nuevo ? 'Nuevo proveedor' : 'Editar proveedor'}</h2>
      <form id="f-prov" novalidate>
        <div class="form-grid">
          <label>Nombre *<input name="nombre" maxlength="120" required value="${esc(p.nombre)}"></label>
          <label>Teléfono<input name="telefono" maxlength="20" inputmode="tel" value="${esc(p.telefono)}"></label>
          <label>Correo<input name="correo" maxlength="120" type="email" value="${esc(p.correo)}"></label>
          <label>Dirección<input name="direccion" maxlength="255" value="${esc(p.direccion)}"></label>
          <label class="check ancho"><input type="checkbox" name="activo" ${p.activo ? 'checked' : ''}> Activo</label>
        </div>
        <p class="error-form" id="error-prov" role="alert"></p>
        <div class="acciones"><button type="button" data-cerrar>Cancelar</button><button type="submit" class="primario">Guardar</button></div>
      </form>`);
    d.querySelector('#f-prov').addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.target;
      const datos = Object.fromEntries(new FormData(f));
      datos.activo = f.activo.checked;
      try {
        await api(nuevo ? 'POST' : 'PUT', nuevo ? '/api/proveedores' : `/api/proveedores/${p.id}`, datos);
        aviso('Proveedor guardado.');
        cerrarDialogo();
        cargar();
      } catch (err) {
        d.querySelector('#error-prov').textContent = err.message;
      }
    });
  }

  el.querySelector('#nuevo').addEventListener('click', () => formulario(null));
  el.querySelector('#filas').addEventListener('click', (e) => {
    const editar = e.target.closest('button[data-editar]');
    if (editar) formulario(proveedores[Number(editar.dataset.editar)]);
    const precios = e.target.closest('button[data-precios]');
    if (precios) {
      const proveedor = precios.dataset.precios === 'sin' ? null : proveedores[Number(precios.dataset.precios)];
      verPrecios(proveedor).catch((err) => aviso(err.message, 'error'));
    }
  });
  await cargar();
}
