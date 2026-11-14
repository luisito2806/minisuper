// Existencias, alertas, ajustes manuales e historial de movimientos.
import { aEntero } from '../dinero.js';
import { api, aviso, cantidad, descargar, elegirExcel, esc, etiquetaEstado, fechaHora, hoy, moneda } from '../comun.js';

const TIPOS = {
  inicial: 'Saldo inicial',
  compra: 'Compra',
  venta: 'Venta',
  cancelacion_venta: 'Cancelación de venta',
  cancelacion_compra: 'Cancelación de compra',
  ajuste_entrada: 'Ajuste (entrada)',
  ajuste_salida: 'Ajuste (salida)',
  saldo_depurado: 'Saldo (historial depurado)',
};

export async function render(el, { esAdmin, abrirDialogo, cerrarDialogo }) {
  let productos = [];
  el.innerHTML = `
    <div id="resumen" class="tarjetas"></div>
    ${esAdmin ? `
    <section class="panel" id="panel-compra">
      <div class="encabezado">
        <h2><span class="acento">Lista de compra</span> sugerida</h2>
        <div class="opciones no-imprimir">
          <button type="button" id="crear-compra" class="primario">Registrar compra con esta lista</button>
          <button type="button" id="excel-compra">Excel</button>
        </div>
      </div>
      <p class="muted">Productos en o por debajo de su mínimo. Se sugiere comprar lo necesario para llegar al doble del mínimo,
        o a lo que se vendió en las últimas 2 semanas si es más.</p>
      <div class="tabla-wrap"><table>
        <thead><tr><th>Proveedor (última compra)</th><th>Producto</th><th class="num">Existencia</th><th class="num">Mínimo</th><th class="num">Vendido 14 días</th><th class="num">Comprar</th><th class="num">Costo aprox.</th></tr></thead>
        <tbody id="sugerida"></tbody>
        <tfoot id="sugerida-total"></tfoot>
      </table></div>
    </section>
    <section class="panel oculto" id="panel-conteo"></section>` : ''}
    <section class="panel">
      <div class="encabezado">
        <h1><span class="acento">Inventario</span> actual</h1>
        <div class="opciones no-imprimir">
          ${esAdmin ? '<button type="button" id="abrir-conteo" class="primario">Conteo físico</button>' : ''}
          <button type="button" id="imprimir">Imprimir</button>
        </div>
      </div>
      <form id="filtros" class="filtros">
        <label>Mostrar
          <select name="nivel">
            <option value="">Todos los productos</option>
            <option value="bajo" selected>Existencia baja o agotados</option>
            <option value="agotado">Solo agotados</option>
          </select>
        </label>
        <label>Buscar<input name="q" placeholder="Nombre o código"></label>
        <button type="submit">Aplicar</button>
      </form>
      <div class="tabla-wrap"><table>
        <thead><tr><th>Código</th><th>Nombre</th><th>Categoría</th><th class="num">Existencia</th><th class="num">Mínimo</th><th>Estado</th>${esAdmin ? '<th></th>' : ''}</tr></thead>
        <tbody id="filas"></tbody>
      </table></div>
      ${esAdmin ? '' : '<p class="muted">Los ajustes de inventario los hace un administrador.</p>'}
    </section>
    ${esAdmin ? `
    <section class="panel">
      <div class="encabezado"><h2>Historial de movimientos</h2></div>
      <form id="filtros-mov" class="filtros">
        <label>Desde<input type="date" name="desde" value="${hoy().slice(0, 8)}01"></label>
        <label>Hasta<input type="date" name="hasta" value="${hoy()}"></label>
        <label>Tipo<select name="tipo"><option value="">Todos</option>
          ${Object.entries(TIPOS).map(([k, t]) => `<option value="${k}">${t}</option>`).join('')}</select></label>
        <label>Producto<input name="q" placeholder="Nombre o código"></label>
        <button type="submit">Buscar</button>
      </form>
      <div class="tabla-wrap"><table>
        <thead><tr><th>Fecha</th><th>Producto</th><th>Tipo</th><th class="num">Cantidad</th><th class="num">Antes</th><th class="num">Después</th><th>Referencia / motivo</th><th>Usuario</th></tr></thead>
        <tbody id="movs"></tbody>
      </table></div>
    </section>` : ''}`;

  const form = el.querySelector('#filtros');

  async function cargarResumen() {
    if (!esAdmin) return;
    const { resumen: r } = await api('GET', '/api/reportes/inventario');
    el.querySelector('#resumen').innerHTML = `
      <div class="tarjeta"><div class="etiqueta">Productos activos</div><div class="valor">${r.num_productos}</div></div>
      <div class="tarjeta"><div class="etiqueta">Existencia baja</div><div class="valor">${r.bajos}</div></div>
      <div class="tarjeta"><div class="etiqueta">Agotados</div><div class="valor">${r.agotados}</div></div>
      <div class="tarjeta"><div class="etiqueta">Valor a costo</div><div class="valor">${moneda(r.valor_costo)}</div></div>
      <div class="tarjeta"><div class="etiqueta">Valor a precio de venta</div><div class="valor">${moneda(r.valor_venta)}</div></div>`;
  }

  async function cargar() {
    const q = new URLSearchParams([...new FormData(form)].filter(([, v]) => v));
    try {
      productos = await api('GET', `/api/productos?${q}`);
      el.querySelector('#filas').innerHTML = productos.length
        ? productos.map((p, i) => `
          <tr>
            <td>${esc(p.codigo)}</td><td>${esc(p.nombre)}</td><td>${esc(p.categoria)}</td>
            <td class="num ${Number(p.existencia) < 0 ? 'negativo' : ''}">${esc(cantidad(p.existencia, p.unidad))}</td>
            <td class="num">${esc(cantidad(p.stock_minimo, p.unidad))}</td>
            <td>${etiquetaEstado(p.nivel_stock)}</td>
            ${esAdmin ? `<td><button type="button" class="chico" data-i="${i}">Ajustar</button></td>` : ''}
          </tr>`).join('')
        : `<tr><td colspan="${esAdmin ? 7 : 6}" class="vacio">Sin productos con ese criterio.</td></tr>`;
    } catch (err) {
      aviso(err.message, 'error');
    }
  }

  async function cargarMovimientos() {
    const f = el.querySelector('#filtros-mov');
    if (!f) return;
    const q = new URLSearchParams([...new FormData(f)].filter(([, v]) => v));
    try {
      const movs = await api('GET', `/api/inventario/movimientos?${q}`);
      el.querySelector('#movs').innerHTML = movs.map((m) => {
        const ref = m.folio_venta ? `Venta ${m.folio_venta}` : m.folio_compra ? `Compra ${m.folio_compra}` : '';
        const n = Number(m.cantidad);
        return `
          <tr>
            <td>${esc(fechaHora(m.fecha))}</td>
            <td>${esc(m.producto)} <span class="muted">${esc(m.codigo)}</span></td>
            <td>${esc(TIPOS[m.tipo])}</td>
            <td class="num ${n < 0 ? 'negativo' : 'positivo'}">${n > 0 ? '+' : '−'}${esc(cantidad(Math.abs(n), m.unidad))}</td>
            <td class="num">${esc(cantidad(m.existencia_anterior, m.unidad))}</td>
            <td class="num">${esc(cantidad(m.existencia_nueva, m.unidad))}</td>
            <td>${esc([ref, m.motivo].filter(Boolean).join(' · '))}</td>
            <td>${esc(m.usuario)}</td>
          </tr>`;
      }).join('') || '<tr><td colspan="8" class="vacio">Sin movimientos en el periodo.</td></tr>';
    } catch (err) {
      aviso(err.message, 'error');
    }
  }

  function ajustar(p) {
    const d = abrirDialogo(`
      <h2><span class="acento">Ajustar</span> inventario</h2>
      <p><strong>${esc(p.nombre)}</strong> <span class="muted">${esc(p.codigo)}</span> · existencia registrada:
         <strong>${esc(cantidad(p.existencia, p.unidad))}</strong></p>
      <form id="f-ajuste" novalidate>
        <fieldset><legend>Tipo de ajuste</legend>
          <div class="opciones">
            <label class="check"><input type="radio" name="modo" value="salida" checked> Salida (merma, caducidad, daño)</label>
            <label class="check"><input type="radio" name="modo" value="entrada"> Entrada (sobrante, devolución)</label>
            <label class="check"><input type="radio" name="modo" value="conteo"> Conteo físico</label>
          </div>
        </fieldset>
        <div class="form-grid">
          <label id="etq-cant">Cantidad (${esc(p.unidad)})<input name="cantidad" inputmode="decimal" required autofocus></label>
          <label>Motivo (obligatorio)<input name="motivo" maxlength="255" required></label>
        </div>
        <p class="muted" id="previa"></p>
        <p class="error-form" id="error-ajuste" role="alert"></p>
        <div class="acciones"><button type="button" data-cerrar>Cancelar</button><button type="submit" class="primario">Aplicar ajuste</button></div>
      </form>`);
    const f = d.querySelector('#f-ajuste');
    const previa = () => {
      const modo = f.modo.value;
      const c = Number(f.cantidad.value);
      d.querySelector('#etq-cant').firstChild.textContent = modo === 'conteo' ? `Existencia contada (${p.unidad})` : `Cantidad (${p.unidad})`;
      if (!f.cantidad.value || Number.isNaN(c)) return (d.querySelector('#previa').textContent = '');
      const actual = Number(p.existencia);
      const nueva = modo === 'entrada' ? actual + c : modo === 'salida' ? actual - c : c;
      d.querySelector('#previa').textContent = `Quedará en ${cantidad(nueva, p.unidad)} (${nueva - actual >= 0 ? '+' : ''}${cantidad(nueva - actual, p.unidad)}).`;
    };
    f.addEventListener('input', previa);
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const datos = { producto_id: p.id, ...Object.fromEntries(new FormData(f)) };
      const error = d.querySelector('#error-ajuste');
      if (!datos.motivo.trim()) {
        error.textContent = 'Escribe el motivo del ajuste.';
        return;
      }
      if (!confirm(`¿Aplicar el ajuste a "${p.nombre}"? Quedará registrado en el historial.`)) return;
      try {
        const r = await api('POST', '/api/inventario/ajustes', datos);
        aviso(`Ajuste aplicado. Existencia: ${cantidad(r.existencia, p.unidad)}.`);
        cerrarDialogo();
        cargar();
        cargarResumen();
        cargarMovimientos();
      } catch (err) {
        error.textContent = err.message;
      }
    });
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    cargar();
  });
  form.nivel.addEventListener('change', cargar);
  el.querySelector('#filtros-mov')?.addEventListener('submit', (e) => {
    e.preventDefault();
    cargarMovimientos();
  });
  el.querySelector('#filas').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-i]');
    if (b) ajustar(productos[Number(b.dataset.i)]);
  });
  // ---------- Lista de compra sugerida ----------
  let sugerida = [];
  async function cargarSugerida() {
    if (!esAdmin) return;
    sugerida = await api('GET', '/api/inventario/sugerida');
    el.querySelector('#sugerida').innerHTML = sugerida.length
      ? sugerida.map((p) => `
        <tr>
          <td>${p.proveedor ? esc(p.proveedor) : '<span class="muted">Sin compras registradas</span>'}</td>
          <td>${esc(p.nombre)} <span class="muted">${esc(p.codigo)}</span></td>
          <td class="num ${Number(p.existencia) <= 0 ? 'negativo' : ''}">${esc(cantidad(p.existencia, p.unidad))}</td>
          <td class="num">${esc(cantidad(p.stock_minimo, p.unidad))}</td>
          <td class="num">${esc(cantidad(p.vendido_14_dias, p.unidad))}</td>
          <td class="num"><strong>${esc(cantidad(p.sugerido, p.unidad))}</strong></td>
          <td class="num">${moneda(Number(p.sugerido) * Number(p.costo))}</td>
        </tr>`).join('')
      : '<tr><td colspan="7" class="vacio">Todo está por encima de su mínimo. No hace falta comprar nada.</td></tr>';
    const total = sugerida.reduce((s, p) => s + Number(p.sugerido) * Number(p.costo), 0);
    el.querySelector('#sugerida-total').innerHTML = sugerida.length
      ? `<tr><th colspan="6">Costo aproximado</th><th class="num">${moneda(total)}</th></tr>` : '';
    el.querySelector('#crear-compra').disabled = !sugerida.some((p) => Number(p.sugerido) > 0);
  }

  // ---------- Conteo físico ----------
  async function abrirConteo() {
    const panel = el.querySelector('#panel-conteo');
    const categorias = (await api('GET', '/api/categorias')).filter((c) => c.activo);
    /** @type {Map<string, string>} producto_id → contado */
    const contados = new Map();
    let lista = [];
    panel.classList.remove('oculto');
    panel.innerHTML = `
      <div class="encabezado">
        <h2><span class="acento">Conteo</span> físico</h2>
        <div class="opciones">
          <button type="button" id="hoja-conteo">Descargar hoja de conteo (Excel)</button>
          <button type="button" id="cargar-conteo">Cargar conteo de Excel</button>
        </div>
      </div>
      <p class="muted">Escribe lo que hay en el anaquel. Solo se ajustan los productos que tengan cantidad y no coincidan;
        los vacíos no se tocan. También puedes descargar la hoja, llenarla en Excel y cargarla.</p>
      <div class="filtros">
        <label>Categoría<select id="conteo-cat"><option value="">Todas</option>
          ${categorias.map((c) => `<option value="${esc(c.id)}">${esc(c.nombre)}</option>`).join('')}</select></label>
        <label>Buscar<input id="conteo-q" placeholder="Nombre o código"></label>
      </div>
      <div class="tabla-wrap"><table>
        <thead><tr><th>Código</th><th>Producto</th><th class="num">Registrado</th><th class="num">Contado</th><th class="num">Diferencia</th></tr></thead>
        <tbody id="conteo-filas"></tbody>
      </table></div>
      <div class="form-grid">
        <label>Notas del conteo (opcional)<input id="conteo-motivo" maxlength="200" placeholder="Ej. Conteo de fin de mes"></label>
      </div>
      <p id="conteo-resumen" class="muted"></p>
      <p class="error-form" id="conteo-error" role="alert"></p>
      <div class="acciones">
        <button type="button" id="cerrar-conteo">Cerrar</button>
        <button type="button" id="aplicar-conteo" class="primario">Aplicar conteo</button>
      </div>`;
    panel.scrollIntoView({ behavior: 'smooth' });
    const $c = (s) => panel.querySelector(s);

    const diferencia = (p) => {
      const v = contados.get(String(p.id));
      if (v === undefined || v === '') return null;
      const n = aEntero(v, 3);
      if (n === null || (p.unidad === 'pieza' && n % 1000 !== 0)) return NaN;
      return n / 1000 - Number(p.existencia);
    };
    const textoDif = (p) => {
      const d = diferencia(p);
      if (d === null) return '';
      if (Number.isNaN(d)) return '<span class="negativo">Cantidad inválida</span>';
      if (Math.abs(d) < 0.0005) return '<span class="muted">Cuadra</span>';
      return `<span class="${d < 0 ? 'negativo' : 'positivo'}">${d > 0 ? '+' : '−'}${esc(cantidad(Math.abs(d), p.unidad))}</span>`;
    };
    function resumen() {
      const llenos = [...contados.values()].filter((x) => x !== '').length;
      $c('#conteo-resumen').textContent = llenos ? `${llenos} producto(s) contados.` : '';
    }
    async function cargarLista() {
      const q = new URLSearchParams();
      if ($c('#conteo-cat').value) q.set('categoria_id', $c('#conteo-cat').value);
      if ($c('#conteo-q').value.trim()) q.set('q', $c('#conteo-q').value.trim());
      lista = await api('GET', `/api/productos?${q}`);
      $c('#conteo-filas').innerHTML = lista.map((p) => `
        <tr data-id="${esc(p.id)}">
          <td>${esc(p.codigo)}</td><td>${esc(p.nombre)}</td>
          <td class="num">${esc(cantidad(p.existencia, p.unidad))}</td>
          <td class="num"><input class="cant" inputmode="decimal" size="7" value="${esc(contados.get(String(p.id)) ?? '')}" aria-label="Contado de ${esc(p.nombre)}"> ${p.unidad === 'pieza' ? 'pz' : esc(p.unidad)}</td>
          <td class="num dif">${textoDif(p)}</td>
        </tr>`).join('') || '<tr><td colspan="5" class="vacio">Sin productos.</td></tr>';
    }

    $c('#conteo-filas').addEventListener('input', (e) => {
      if (!e.target.matches('input.cant')) return;
      const fila = e.target.closest('tr');
      contados.set(fila.dataset.id, e.target.value.trim());
      fila.querySelector('.dif').innerHTML = textoDif(lista.find((p) => String(p.id) === fila.dataset.id));
      resumen();
    });
    $c('#conteo-filas').addEventListener('keydown', (e) => {
      // Enter baja al siguiente producto, como en una hoja de cálculo.
      if (e.key !== 'Enter' || !e.target.matches('input.cant')) return;
      e.preventDefault();
      e.target.closest('tr').nextElementSibling?.querySelector('input.cant')?.focus();
    });
    $c('#conteo-cat').addEventListener('change', cargarLista);
    $c('#conteo-q').addEventListener('input', () => {
      clearTimeout($c('#conteo-q')._t);
      $c('#conteo-q')._t = setTimeout(cargarLista, 300);
    });
    $c('#hoja-conteo').addEventListener('click', () => {
      const cat = $c('#conteo-cat').value;
      descargar(`/api/excel/conteo${cat ? `?categoria_id=${cat}` : ''}`).catch((err) => aviso(err.message, 'error'));
    });
    $c('#cargar-conteo').addEventListener('click', async () => {
      try {
        const archivo = await elegirExcel();
        if (!archivo) return;
        const r = await api('POST', '/api/excel/conteo', { archivo });
        for (const p of r.partidas) contados.set(String(p.id), p.contado);
        $c('#conteo-cat').value = '';
        $c('#conteo-q').value = '';
        await cargarLista();
        resumen();
        aviso(`Se cargaron ${r.partidas.length} producto(s) del archivo. Revisa las diferencias y aplica el conteo.`);
        if (r.no_encontrados.length) aviso(`No se encontraron: ${r.no_encontrados.slice(0, 5).join('; ')}${r.no_encontrados.length > 5 ? '…' : ''}`, 'error');
      } catch (err) {
        aviso(err.message, 'error');
      }
    });
    $c('#cerrar-conteo').addEventListener('click', () => {
      if ([...contados.values()].some((x) => x !== '') && !confirm('¿Cerrar sin aplicar el conteo?')) return;
      panel.classList.add('oculto');
      panel.innerHTML = '';
    });
    $c('#aplicar-conteo').addEventListener('click', async (e) => {
      const error = $c('#conteo-error');
      error.textContent = '';
      const partidas = [...contados].filter(([, v]) => v !== '').map(([producto_id, contado]) => ({ producto_id, contado }));
      if (!partidas.length) {
        error.textContent = 'Escribe la cantidad contada de al menos un producto.';
        return;
      }
      if (!confirm(`¿Aplicar el conteo de ${partidas.length} producto(s)? Las existencias que no coincidan se ajustarán y quedará en el historial.`)) return;
      e.target.disabled = true;
      try {
        const r = await api('POST', '/api/inventario/conteo', { motivo: $c('#conteo-motivo').value, partidas });
        aviso(`Conteo aplicado: ${r.revisados} revisados, ${r.ajustados} ajustados.`);
        panel.classList.add('oculto');
        panel.innerHTML = '';
        cargar();
        cargarResumen();
        cargarMovimientos();
        cargarSugerida();
      } catch (err) {
        error.textContent = err.message;
        e.target.disabled = false;
      }
    });
    await cargarLista();
    $c('input.cant')?.focus();
  }

  el.querySelector('#abrir-conteo')?.addEventListener('click', () => abrirConteo().catch((err) => aviso(err.message, 'error')));
  el.querySelector('#excel-compra')?.addEventListener('click', () =>
    descargar('/api/excel/sugerida').catch((err) => aviso(err.message, 'error')));
  el.querySelector('#crear-compra')?.addEventListener('click', () => {
    // La pantalla de Compras toma la lista y abre la captura ya llenada.
    const lineas = sugerida.filter((p) => Number(p.sugerido) > 0)
      .map((p) => ({ id: p.id, sugerido: String(Number(p.sugerido)), proveedor_id: p.proveedor_id }));
    try {
      sessionStorage.setItem('compraSugerida', JSON.stringify(lineas));
    } catch {
      return aviso('El navegador no permitió pasar la lista a Compras.', 'error');
    }
    location.hash = '#compras';
  });

  el.querySelector('#imprimir').addEventListener('click', () => window.print());
  await Promise.all([cargarResumen(), cargar(), cargarMovimientos(), cargarSugerida()]);

}
