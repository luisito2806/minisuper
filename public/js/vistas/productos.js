// Catálogo de productos y categorías.
import { api, aviso, cantidad, descargar, elegirExcel, esc, etiquetaEstado, moneda } from '../comun.js';

const UNIDADES = [['pieza', 'Pieza'], ['kg', 'Kilogramo'], ['litro', 'Litro']];

export async function render(el, { esAdmin, config, abrirDialogo, cerrarDialogo }) {
  let categorias = await api('GET', '/api/categorias');
  // Proveedores solo los ve el administrador.
  const proveedores = esAdmin ? await api('GET', '/api/proveedores') : [];
  let productos = [];

  el.innerHTML = `
    <section class="panel">
      <div class="encabezado">
        <h1><span class="acento">Catálogo</span> de productos</h1>
        ${esAdmin ? `
        <div class="opciones">
          <button type="button" id="exportar">Exportar a Excel</button>
          <button type="button" id="importar">Importar de Excel</button>
          <button type="button" class="primario" id="nuevo">Nuevo producto</button>
        </div>` : ''}
      </div>
      ${esAdmin ? `<p class="muted">Para dar de alta o cambiar precios de muchos productos a la vez: exporta el catálogo,
        edítalo en Excel (mismas columnas) e impórtalo. Los códigos que ya existen se actualizan; los nuevos se dan de alta
        con su existencia. La existencia de los que ya existen no cambia: para eso usa el conteo físico en Inventario.</p>` : ''}
      <form id="filtros" class="filtros">
        <label>Buscar<input name="q" placeholder="Nombre o código" autofocus></label>
        <label>Categoría<select name="categoria_id"></select></label>
        ${esAdmin ? `<label>Proveedor<select name="proveedor_id"><option value="">Todos</option>
          ${proveedores.map((p) => `<option value="${esc(p.id)}">${esc(p.nombre)}</option>`).join('')}
          <option value="sin">Compra manual (sin proveedor)</option></select></label>` : ''}
        ${esAdmin ? '<label class="check"><input type="checkbox" name="incluir_inactivos" value="1"> Incluir inactivos</label>' : ''}
        <button type="submit">Buscar</button>
      </form>
      <div class="tabla-wrap">
        <table>
          <thead><tr>
            <th>Código</th><th>Nombre</th><th>Categoría</th>${esAdmin ? '<th>Proveedor</th>' : ''}<th class="num">Precio</th>
            ${esAdmin ? '<th class="num">Costo</th>' : ''}
            ${config.cobrar_iva ? '<th class="num">IVA</th>' : ''}<th class="num">Existencia</th><th>Estado</th>${esAdmin ? '<th></th>' : ''}
          </tr></thead>
          <tbody id="filas"></tbody>
        </table>
      </div>
    </section>
    ${esAdmin ? `
    <section class="panel">
      <div class="encabezado"><h2>Categorías</h2><button type="button" id="nueva-cat">Nueva categoría</button></div>
      <div class="tabla-wrap"><table>
        <thead><tr><th>Nombre</th><th>Descripción</th><th class="num">Productos</th><th>Estado</th><th></th></tr></thead>
        <tbody id="filas-cat"></tbody>
      </table></div>
    </section>` : ''}`;

  const form = el.querySelector('#filtros');

  function pintarSelectCategorias() {
    const actual = form.categoria_id.value;
    form.categoria_id.innerHTML = '<option value="">Todas</option>' +
      categorias.map((c) => `<option value="${esc(c.id)}">${esc(c.nombre)}</option>`).join('');
    form.categoria_id.value = actual;
  }

  async function cargar() {
    const q = new URLSearchParams([...new FormData(form)].filter(([, v]) => v));
    try {
      productos = await api('GET', `/api/productos?${q}`);
    } catch (err) {
      return aviso(err.message, 'error');
    }
    el.querySelector('#filas').innerHTML = productos.length
      ? productos.map((p, i) => `
        <tr>
          <td>${esc(p.codigo)}</td>
          <td>${esc(p.nombre)}</td>
          <td>${esc(p.categoria)}</td>
          ${esAdmin ? `<td>${p.proveedor ? esc(p.proveedor) : '<span class="muted">Compra manual</span>'}</td>` : ''}
          <td class="num">${moneda(p.precio_venta)}</td>
          ${esAdmin ? `<td class="num">${moneda(p.costo)}</td>` : ''}
          ${config.cobrar_iva ? `<td class="num">${Math.round(Number(p.tasa_iva) * 10000) / 100}%</td>` : ''}
          <td class="num">${esc(cantidad(p.existencia, p.unidad))}</td>
          <td>${p.activo ? etiquetaEstado(p.nivel_stock) : etiquetaEstado('inactivo')}</td>
          ${esAdmin ? `<td><button type="button" class="chico" data-i="${i}">Editar</button></td>` : ''}
        </tr>`).join('')
      : `<tr><td colspan="${esAdmin ? 10 : 7}" class="vacio">No se encontraron productos.</td></tr>`;
  }

  function formularioProducto(p) {
    const nuevo = !p;
    p ??= {
      unidad: 'pieza',
      tasa_iva: config.tasa_iva_predeterminada,
      stock_minimo: config.stock_minimo_predeterminado,
      activo: true,
      existencia: '0',
    };
    const d = abrirDialogo(`
      <h2>${nuevo ? 'Nuevo producto' : `Editar: ${esc(p.nombre)}`}</h2>
      <form id="f-prod" novalidate>
        <div class="form-grid">
          <label>Código de barras o interno *<input name="codigo" maxlength="50" required value="${esc(p.codigo)}"></label>
          <label>Nombre *<input name="nombre" maxlength="120" required value="${esc(p.nombre)}"></label>
          <label class="ancho">Descripción<input name="descripcion" maxlength="255" value="${esc(p.descripcion)}"></label>
          <label>Categoría *<select name="categoria_id" required>
            ${categorias.filter((c) => c.activo || String(c.id) === String(p.categoria_id))
              .map((c) => `<option value="${esc(c.id)}" ${String(c.id) === String(p.categoria_id) ? 'selected' : ''}>${esc(c.nombre)}</option>`).join('')}
          </select></label>
          <label>Proveedor habitual<select name="proveedor_id">
            <option value="">Compra manual (sin proveedor)</option>
            ${proveedores.filter((x) => x.activo || String(x.id) === String(p.proveedor_id))
              .map((x) => `<option value="${esc(x.id)}" ${String(x.id) === String(p.proveedor_id) ? 'selected' : ''}>${esc(x.nombre)}</option>`).join('')}
          </select></label>
          <label>Unidad *<select name="unidad">

            ${UNIDADES.map(([v, t]) => `<option value="${v}" ${p.unidad === v ? 'selected' : ''}>${t}</option>`).join('')}
          </select></label>
          <label>Precio de venta${config.cobrar_iva ? ` (${config.precios_incluyen_iva ? 'IVA incluido' : 'sin IVA'})` : ''} *<input name="precio_venta" inputmode="decimal" required value="${esc(p.precio_venta)}"></label>
          <label>Costo de compra *<input name="costo" inputmode="decimal" required value="${esc(p.costo)}"></label>
          <label class="${config.cobrar_iva ? '' : 'oculto'}">IVA<select name="tasa_iva">
            <option value="0.16" ${Number(p.tasa_iva) === 0.16 ? 'selected' : ''}>16 %</option>
            <option value="0.08" ${Number(p.tasa_iva) === 0.08 ? 'selected' : ''}>8 % (zona fronteriza)</option>
            <option value="0" ${Number(p.tasa_iva) === 0 ? 'selected' : ''}>0 % / exento</option>
          </select></label>
          <label>Stock mínimo (alerta)<input name="stock_minimo" inputmode="decimal" value="${esc(Number(p.stock_minimo))}"></label>
          ${nuevo
            ? '<label>Existencia inicial<input name="existencia" inputmode="decimal" value="0"></label>'
            : `<p class="muted">Existencia actual: <strong>${esc(cantidad(p.existencia, p.unidad))}</strong>. Para corregirla usa un ajuste en Inventario.</p>`}
          <label class="check ancho"><input type="checkbox" name="activo" ${p.activo ? 'checked' : ''}> Activo (disponible para venta)</label>
        </div>
        <p class="error-form" id="error-prod" role="alert"></p>
        <div class="acciones">
          <button type="button" data-cerrar>Cancelar</button>
          <button type="submit" class="primario">Guardar</button>
        </div>
      </form>`);

    d.querySelector('#f-prod').addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.target;
      const datos = Object.fromEntries(new FormData(f));
      datos.activo = f.activo.checked;
      const error = d.querySelector('#error-prod');
      if (!datos.codigo.trim() || !datos.nombre.trim() || !datos.precio_venta || !datos.costo) {
        error.textContent = 'Llena los campos marcados con *.';
        return;
      }
      if (!nuevo && !datos.activo && p.activo && !confirm('¿Desactivar este producto? Ya no aparecerá para venta.')) return;
      try {
        await api(nuevo ? 'POST' : 'PUT', nuevo ? '/api/productos' : `/api/productos/${p.id}`, datos);
        aviso(nuevo ? 'Producto creado.' : 'Producto actualizado.');
        cerrarDialogo();
        cargar();
      } catch (err) {
        error.textContent = err.message;
      }
    });
  }

  // ---------- Categorías ----------
  function pintarCategorias() {
    const tbody = el.querySelector('#filas-cat');
    if (!tbody) return;
    tbody.innerHTML = categorias.map((c, i) => `
      <tr>
        <td>${esc(c.nombre)}</td><td>${esc(c.descripcion)}</td><td class="num">${c.num_productos}</td>
        <td>${etiquetaEstado(c.activo ? 'activo' : 'inactivo')}</td>
        <td><button type="button" class="chico" data-cat="${i}">Editar</button></td>
      </tr>`).join('') || '<tr><td colspan="5" class="vacio">Sin categorías.</td></tr>';
  }

  function formularioCategoria(c) {
    const nueva = !c;
    c ??= { activo: true };
    const d = abrirDialogo(`
      <h2>${nueva ? 'Nueva categoría' : 'Editar categoría'}</h2>
      <form id="f-cat" novalidate>
        <div class="form-grid">
          <label>Nombre *<input name="nombre" maxlength="60" required value="${esc(c.nombre)}"></label>
          <label>Descripción<input name="descripcion" maxlength="200" value="${esc(c.descripcion)}"></label>
          <label class="check ancho"><input type="checkbox" name="activo" ${c.activo ? 'checked' : ''}> Activa</label>
        </div>
        <p class="error-form" id="error-cat" role="alert"></p>
        <div class="acciones"><button type="button" data-cerrar>Cancelar</button><button type="submit" class="primario">Guardar</button></div>
      </form>`);
    d.querySelector('#f-cat').addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.target;
      try {
        await api(nueva ? 'POST' : 'PUT', nueva ? '/api/categorias' : `/api/categorias/${c.id}`, {
          nombre: f.nombre.value, descripcion: f.descripcion.value, activo: f.activo.checked,
        });
        aviso('Categoría guardada.');
        cerrarDialogo();
        categorias = await api('GET', '/api/categorias');
        pintarCategorias();
        pintarSelectCategorias();
      } catch (err) {
        d.querySelector('#error-cat').textContent = err.message;
      }
    });
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    cargar();
  });
  form.categoria_id.addEventListener('change', cargar);
  form.proveedor_id?.addEventListener('change', cargar);
  form.incluir_inactivos?.addEventListener('change', cargar);
  el.querySelector('#nuevo')?.addEventListener('click', () => formularioProducto(null));
  el.querySelector('#nueva-cat')?.addEventListener('click', () => formularioCategoria(null));
  el.querySelector('#filas').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-i]');
    if (b) formularioProducto(productos[Number(b.dataset.i)]);
  });
  el.querySelector('#filas-cat')?.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-cat]');
    if (b) formularioCategoria(categorias[Number(b.dataset.cat)]);
  });

  pintarSelectCategorias();
  pintarCategorias();
  el.querySelector('#exportar')?.addEventListener('click', () =>
    descargar('/api/excel/productos').catch((err) => aviso(err.message, 'error')));
  el.querySelector('#importar')?.addEventListener('click', async () => {
    try {
      const archivo = await elegirExcel();
      if (!archivo) return;
      const r = await api('POST', '/api/excel/productos', { archivo });
      aviso(`Importación lista: ${r.nuevos} nuevo(s), ${r.actualizados} actualizado(s)${r.categorias_nuevas ? `, ${r.categorias_nuevas} categoría(s) nueva(s)` : ''}.`);
      categorias = await api('GET', '/api/categorias');
      render(el, { esAdmin, config, abrirDialogo, cerrarDialogo });
    } catch (err) {
      // Los errores por fila vienen en varias líneas: se muestran en un diálogo.
      abrirDialogo(`
        <h2>No se pudo importar</h2>
        <pre class="errores">${esc(err.message)}</pre>
        <div class="acciones"><button type="button" data-cerrar>Cerrar</button></div>`);
    }
  });

  await cargar();

}
