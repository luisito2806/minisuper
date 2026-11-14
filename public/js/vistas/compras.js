// Compras a proveedores (solo administrador).
import { aEntero, aTexto, importe } from '../dinero.js';
import { api, aviso, cantidad, esc, etiquetaEstado, fechaHora, hoy, moneda } from '../comun.js';

export async function render(el, { abrirDialogo, cerrarDialogo }) {
  el.innerHTML = `
    <section class="panel">
      <div class="encabezado"><h1><span class="acento">Compras</span> a proveedores</h1><button type="button" class="primario" id="nueva">Registrar compra</button></div>
      <form id="filtros" class="filtros">
        <label>Desde<input type="date" name="desde" value="${hoy().slice(0, 8)}01"></label>
        <label>Hasta<input type="date" name="hasta" value="${hoy()}"></label>
        <button type="submit">Buscar</button>
      </form>
      <div class="tabla-wrap"><table>
        <thead><tr><th>Folio</th><th>Fecha</th><th>Proveedor</th><th>Registró</th><th>Notas</th><th class="num">Total</th><th>Estado</th><th></th></tr></thead>
        <tbody id="filas"></tbody>
      </table></div>
    </section>
    <section class="panel oculto" id="captura"></section>`;

  const form = el.querySelector('#filtros');
  const captura = el.querySelector('#captura');

  async function cargar() {
    const q = new URLSearchParams([...new FormData(form)].filter(([, v]) => v));
    try {
      const compras = await api('GET', `/api/compras?${q}`);
      el.querySelector('#filas').innerHTML = compras.length
        ? compras.map((c) => `
          <tr>
            <td>${esc(c.folio)}</td><td>${esc(fechaHora(c.fecha))}</td><td>${esc(c.proveedor)}</td>
            <td>${esc(c.registro)}</td><td>${esc(c.notas)}</td><td class="num">${moneda(c.total)}</td>
            <td>${etiquetaEstado(c.estado)}</td>
            <td><button type="button" class="chico" data-id="${esc(c.id)}">Ver</button></td>
          </tr>`).join('')
        : '<tr><td colspan="8" class="vacio">No hay compras en ese periodo.</td></tr>';
    } catch (err) {
      aviso(err.message, 'error');
    }
  }

  async function verDetalle(id) {
    const c = await api('GET', `/api/compras/${id}`);
    const d = abrirDialogo(`
      <div class="encabezado"><h2>Compra ${esc(c.folio)}</h2>${etiquetaEstado(c.estado)}</div>
      <p class="muted">${esc(fechaHora(c.fecha))} · ${esc(c.proveedor)} · Registró: ${esc(c.registro)}${c.notas ? ` · ${esc(c.notas)}` : ''}</p>
      ${c.estado === 'cancelada' ? `<p class="error-form">Cancelada el ${esc(fechaHora(c.cancelada_en))} por ${esc(c.cancelada_por_nombre)}. Motivo: ${esc(c.motivo_cancelacion)}</p>` : ''}
      <div class="tabla-wrap"><table>
        <thead><tr><th>Producto</th><th class="num">Cantidad</th><th class="num">Costo unitario</th><th class="num">Importe</th></tr></thead>
        <tbody>${c.partidas.map((p) => `
          <tr><td>${esc(p.nombre)}</td><td class="num">${esc(cantidad(p.cantidad, p.unidad))}</td>
          <td class="num">${moneda(p.costo_unitario)}</td><td class="num">${moneda(p.importe)}</td></tr>`).join('')}
        </tbody>
        <tfoot><tr><th colspan="3">Total</th><th class="num">${moneda(c.total)}</th></tr></tfoot>
      </table></div>
      ${c.estado === 'confirmada' ? `
        <form id="f-cancelar" class="panel" novalidate>
          <h3>Cancelar compra</h3>
          <p class="muted">Se retira del inventario lo que entró con esta compra. Si ya se vendió parte, no se podrá cancelar.</p>
          <label>Motivo (obligatorio)<input name="motivo" maxlength="255" required></label>
          <p class="error-form" id="error-cancelar" role="alert"></p>
          <div class="acciones"><button type="submit" class="peligro">Cancelar compra</button></div>
        </form>` : ''}
      <div class="acciones"><button type="button" data-cerrar>Cerrar</button></div>`);

    d.querySelector('#f-cancelar')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const motivo = e.target.motivo.value.trim();
      const error = d.querySelector('#error-cancelar');
      if (!motivo) {
        error.textContent = 'Escribe el motivo de la cancelación.';
        return;
      }
      if (!confirm(`¿Cancelar la compra ${c.folio}? Las existencias se reducirán.`)) return;
      try {
        await api('POST', `/api/compras/${c.id}/cancelar`, { motivo });
        aviso(`Compra ${c.folio} cancelada.`);
        cerrarDialogo();
        cargar();
      } catch (err) {
        error.textContent = err.message;
      }
    });
  }

  // ---------- Captura de una compra nueva ----------
  // `sugerida`: lista de compra que viene de Inventario ([{ id, sugerido, proveedor_id }]).
  // `proveedorInicial`: viene de Proveedores → "Registrar compra" (carga sus productos).
  async function nuevaCompra(sugerida = null, proveedorInicial = null) {
    const proveedores = (await api('GET', '/api/proveedores')).filter((p) => p.activo);
    if (!proveedores.length) {
      aviso('Primero registra un proveedor activo.', 'error');
      return;
    }
    /** @type {{p:any, cant:string, costo:string}[]} */
    let lineas = [];

    captura.classList.remove('oculto');
    captura.innerHTML = `
      <h2>Registrar compra</h2>
      <div class="form-grid">
        <label>Proveedor *<select id="proveedor">${proveedores.map((p) => `<option value="${esc(p.id)}">${esc(p.nombre)}</option>`).join('')}</select></label>
        <label>Notas (núm. de factura, etc.)<input id="notas" maxlength="255"></label>
        <label class="check"><input type="checkbox" id="act-costo" checked> Actualizar el costo de los productos</label>
      </div>
      <div class="opciones carga-proveedor">
        <button type="button" id="cargar-proveedor">Cargar todos los productos de este proveedor</button>
        <button type="button" id="cargar-sin">Cargar productos de compra manual</button>
      </div>
      <p class="muted">Al cargar, las cantidades quedan vacías: escribe solo lo que llegó. Los que se queden vacíos no se incluyen.</p>
      <form id="f-agregar" class="buscador filtros" autocomplete="off">
        <label>Escanea o escribe el producto<input id="buscar-prod" placeholder="Código de barras, código o nombre"></label>
        <button type="submit">Agregar</button>
        <label class="check"><input type="checkbox" id="modo-escaner" checked> Modo escáner: cada lectura suma 1</label>
      </form>
      <div id="opciones" class="resultados"></div>
      <div class="tabla-wrap"><table>
        <thead><tr><th>Producto</th><th class="num">Cantidad</th><th class="num">Costo unitario</th><th class="num">Importe</th><th></th></tr></thead>
        <tbody id="lineas-compra"></tbody>
        <tfoot><tr><th colspan="3">Total</th><th class="num" id="total-compra">$0.00</th><th></th></tr></tfoot>
      </table></div>
      <p class="error-form" id="error-compra" role="alert"></p>
      <div class="acciones">
        <button type="button" id="descartar">Descartar</button>
        <button type="button" class="primario" id="confirmar">Confirmar compra</button>
      </div>`;
    captura.scrollIntoView({ behavior: 'smooth' });
    const $ = (s) => captura.querySelector(s);
    $('#buscar-prod').focus();

    /** Renglones con cantidad escrita (los vacíos o en 0 no cuentan). */
    const conCantidad = () => lineas.filter((l) => l.cant !== '' && aEntero(l.cant, 3) !== 0);

    function totales() {
      let total = 0;
      const llenas = conCantidad();
      let valido = llenas.length > 0;
      for (const l of lineas) {
        const fila = captura.querySelector(`tr[data-id="${l.p.id}"]`);
        if (!llenas.includes(l)) {
          if (fila) fila.querySelector('.importe').textContent = '';
          continue;
        }
        const c = aEntero(l.cant, 3);
        const k = aEntero(l.costo, 2);
        const ok = c !== null && c > 0 && k !== null && (l.p.unidad !== 'pieza' || c % 1000 === 0);
        if (fila) fila.querySelector('.importe').textContent = ok ? moneda(aTexto(importe(c, k), 2)) : '—';
        if (ok) total += importe(c, k);
        else valido = false;
      }
      $('#total-compra').textContent = moneda(aTexto(total, 2));
      return valido;
    }

    /** Agrega (con cantidad vacía) todos los productos de un proveedor, o los de compra manual. */
    let cargado = false; // ya se usó "Cargar productos": al cambiar de proveedor se cargan los del nuevo
    async function cargarProductos(proveedorId) {
      cargado = true;
      const productos = await api('GET', `/api/productos?proveedor_id=${proveedorId}`);
      const nuevos = productos
        .filter((p) => !lineas.some((l) => String(l.p.id) === String(p.id)))
        .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
      for (const p of nuevos) lineas.push({ p, cant: '', costo: p.costo });
      pintar();
      if (!productos.length) {
        aviso(proveedorId === 'sin'
          ? 'No hay productos de compra manual (todos tienen proveedor).'
          : 'Este proveedor todavía no tiene productos. Asígnalos en Productos, o se asignan solos con su primera compra.', 'error');
      } else {
        aviso(`Se cargaron ${nuevos.length} producto(s). Escribe la cantidad de los que llegaron.`);
        captura.querySelector('#lineas-compra input.cant')?.focus();
      }
    }

    function pintar() {
      $('#lineas-compra').innerHTML = lineas.length
        ? lineas.map((l) => `
          <tr data-id="${esc(l.p.id)}">
            <td>${esc(l.p.nombre)} <span class="muted">${esc(l.p.codigo)}</span></td>
            <td class="num"><input class="cant" inputmode="decimal" size="7" value="${esc(l.cant)}" placeholder="0" aria-label="Cantidad de ${esc(l.p.nombre)}"> ${esc(l.p.unidad)}</td>
            <td class="num"><input class="costo" inputmode="decimal" size="8" value="${esc(l.costo)}" aria-label="Costo unitario"></td>
            <td class="num importe"></td>
            <td><button type="button" class="chico peligro quitar">Quitar</button></td>
          </tr>`).join('')
        : '<tr><td colspan="5" class="vacio">Agrega los productos recibidos.</td></tr>';
      totales();
    }

    function agregar(p, cant = '1') {
      const escaner = $('#modo-escaner').checked;
      const linea = lineas.find((l) => String(l.p.id) === String(p.id));
      if (linea) {
        // Escanear otra vez el mismo producto suma una pieza.
        const c = aEntero(linea.cant, 3);
        linea.cant = c === null ? cant : String((c + 1000) / 1000);
      } else {
        lineas.push({ p, cant, costo: p.costo });
      }
      pintar();
      $('#opciones').innerHTML = '';
      $('#buscar-prod').value = '';
      const fila = captura.querySelector(`tr[data-id="${p.id}"]`);
      fila?.classList.add('resaltada');
      setTimeout(() => fila?.classList.remove('resaltada'), 600);
      if (escaner && p.unidad === 'pieza') $('#buscar-prod').focus();
      else fila?.querySelector('input.cant')?.select();
    }

    $('#f-agregar').addEventListener('submit', async (e) => {
      e.preventDefault();
      const t = $('#buscar-prod').value.trim();
      if (!t) return;
      // Limpiar de inmediato: el lector puede mandar el siguiente código
      // antes de que responda el servidor.
      $('#buscar-prod').value = '';
      try {
        agregar(await api('GET', `/api/productos/codigo/${encodeURIComponent(t)}`));
        return;
      } catch (err) {
        if (err.status !== 404) return aviso(err.message, 'error');
      }
      try {
        const lista = await api('GET', `/api/productos?q=${encodeURIComponent(t)}`);
        const exacto = lista.find((p) => p.codigo === t);
        if (exacto || lista.length === 1) return agregar(exacto ?? lista[0]);
        $('#opciones')._lista = lista;
        $('#opciones').innerHTML = lista.length
          ? lista.slice(0, 15).map((p, i) => `<button type="button" data-i="${i}"><span>${esc(p.nombre)} <span class="muted">${esc(p.codigo)}</span></span><span>Costo ${moneda(p.costo)}</span></button>`).join('')
          : '<p class="muted">No se encontró el producto. Dalo de alta en Productos.</p>';
      } catch (err) {
        aviso(err.message, 'error');
      }
    });
    $('#opciones').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-i]');
      if (b) agregar($('#opciones')._lista[Number(b.dataset.i)]);
    });
    $('#lineas-compra').addEventListener('keydown', (e) => {
      // Enter en una cantidad o costo regresa al buscador.
      if (e.key === 'Enter' && e.target.matches('input')) {
        e.preventDefault();
        $('#buscar-prod').focus();
      }
    });
    $('#lineas-compra').addEventListener('input', (e) => {
      const fila = e.target.closest('tr');
      const l = lineas.find((x) => String(x.p.id) === fila?.dataset.id);
      if (!l) return;
      if (e.target.matches('.cant')) l.cant = e.target.value.trim();
      if (e.target.matches('.costo')) l.costo = e.target.value.trim();
      totales();
    });
    $('#lineas-compra').addEventListener('click', (e) => {
      if (!e.target.closest('.quitar')) return;
      const id = e.target.closest('tr').dataset.id;
      lineas = lineas.filter((l) => String(l.p.id) !== id);
      pintar();
    });
    $('#descartar').addEventListener('click', () => {
      if (lineas.length && !confirm('¿Descartar la compra capturada?')) return;
      captura.classList.add('oculto');
      captura.innerHTML = '';
    });
    $('#confirmar').addEventListener('click', async (e) => {
      const error = $('#error-compra');
      error.textContent = '';
      if (!totales()) {
        error.textContent = conCantidad().length
          ? 'Revisa las cantidades y costos (piezas en números enteros, sin negativos).'
          : 'Escribe la cantidad de al menos un producto.';
        return;
      }
      if (!confirm(`¿Confirmar la compra por ${$('#total-compra').textContent}? Las existencias aumentarán.`)) return;
      e.target.disabled = true;
      try {
        const compra = await api('POST', '/api/compras', {
          proveedor_id: $('#proveedor').value,
          notas: $('#notas').value,
          actualizar_costo: $('#act-costo').checked,
          partidas: conCantidad().map((l) => ({ producto_id: l.p.id, cantidad: l.cant, costo_unitario: l.costo })),
        });
        aviso(`Compra ${compra.folio} registrada por ${moneda(compra.total)}.`);
        captura.classList.add('oculto');
        captura.innerHTML = '';
        cargar();
      } catch (err) {
        error.textContent = err.message;
        e.target.disabled = false;
      }
    });

    $('#cargar-proveedor').addEventListener('click', () =>
      cargarProductos($('#proveedor').value).catch((err) => aviso(err.message, 'error')));

    // Cambiar de proveedor (por ejemplo de Bimbo a Coca-Cola): se quitan los
    // productos de la lista y, si ya se habían cargado, se cargan los del nuevo.
    let proveedorAnterior = $('#proveedor').value;
    $('#proveedor').addEventListener('change', async (e) => {
      const llenas = conCantidad();
      const anterior = e.target.querySelector(`option[value="${proveedorAnterior}"]`)?.textContent ?? 'el proveedor anterior';
      if (llenas.length && !confirm(
        `Ya escribiste cantidades de ${llenas.length} producto(s) de ${anterior}. Al cambiar de proveedor se quitan de la lista. ¿Cambiar de todos modos?`)) {
        e.target.value = proveedorAnterior;
        return;
      }
      proveedorAnterior = e.target.value;
      lineas = [];
      pintar();
      if (cargado) await cargarProductos(e.target.value).catch((err) => aviso(err.message, 'error'));
    });

    $('#cargar-sin').addEventListener('click', () =>
      cargarProductos('sin').catch((err) => aviso(err.message, 'error')));

    if (proveedorInicial && proveedores.some((p) => String(p.id) === String(proveedorInicial))) {
      $('#proveedor').value = String(proveedorInicial);
      proveedorAnterior = $('#proveedor').value;
      await cargarProductos(String(proveedorInicial));
    }
    if (sugerida?.length) {
      const productos = new Map((await api('GET', '/api/productos')).map((p) => [String(p.id), p]));
      for (const s of sugerida) {
        const p = productos.get(String(s.id));
        if (p) lineas.push({ p, cant: s.sugerido, costo: p.costo });
      }
      // Proveedor más frecuente de la lista.
      const cuenta = new Map();
      for (const s of sugerida) if (s.proveedor_id) cuenta.set(String(s.proveedor_id), (cuenta.get(String(s.proveedor_id)) ?? 0) + 1);
      const [masComun] = [...cuenta].sort((a, b) => b[1] - a[1])[0] ?? [];
      if (masComun && proveedores.some((p) => String(p.id) === masComun)) $('#proveedor').value = masComun;
      proveedorAnterior = $('#proveedor').value;
      aviso('Se cargó la lista de compra sugerida. Ajusta cantidades y costos con lo que realmente recibiste.');
    }
    pintar();
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    cargar();
  });
  el.querySelector('#nueva').addEventListener('click', () => nuevaCompra().catch((err) => aviso(err.message, 'error')));
  el.querySelector('#filas').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-id]');
    if (b) verDetalle(b.dataset.id).catch((err) => aviso(err.message, 'error'));
  });
  await cargar();

  // Lista de compra que viene de Inventario → "Registrar compra con esta lista".
  let sugerida = null;
  try {
    sugerida = JSON.parse(sessionStorage.getItem('compraSugerida') ?? 'null');
    sessionStorage.removeItem('compraSugerida');
  } catch {
    sugerida = null;
  }
  if (Array.isArray(sugerida) && sugerida.length) await nuevaCompra(sugerida).catch((err) => aviso(err.message, 'error'));

  // Viene de Proveedores → "Registrar compra": abre la captura con sus productos.
  let proveedorInicial = null;
  try {
    proveedorInicial = sessionStorage.getItem('compraProveedor');
    sessionStorage.removeItem('compraProveedor');
  } catch {
    proveedorInicial = null;
  }
  if (proveedorInicial) await nuevaCompra(null, proveedorInicial).catch((err) => aviso(err.message, 'error'));

}

