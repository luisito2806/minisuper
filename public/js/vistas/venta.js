// Punto de venta: pantalla rápida y usable solo con teclado.
//   Enter  → agrega el producto por código o nombre
//   F2     → cobrar
//   F4     → volver al buscador
//   F8     → cambiar entre efectivo y crédito
import { aEntero, aEnteroSigno, aTexto, importe, ivaContenido, ivaSobre, prorratear } from '../dinero.js';
import { METODOS, api, aviso, cantidad, esc, moneda } from '../comun.js';

export async function render(el, { esAdmin, config, senal, ctx }) {
  /** @type {{p: any, cant: string, valida?: boolean, imp?: number}[]} */
  let carrito = [];
  let cobrando = false;
  // Sin IVA: el precio es el precio final y no se calcula impuesto.
  const cobraIva = config.cobrar_iva;
  const conIva = cobraIva ? config.precios_incluyen_iva : true;
  const sobreventa = config.permitir_sobreventa;
  const caja = await ctx.actualizarCaja();
  const bloqueada = config.requiere_caja_abierta && !caja;
  const conCredito = config.metodos_pago.includes('credito');
  /** @type {{id:any, numero:string, nombre:string}[]} */
  let trabajadores = [];
  if (conCredito) {
    try {
      trabajadores = await api('GET', '/api/trabajadores');
    } catch (err) {
      aviso(err.message, 'error');
    }
  }

  el.innerHTML = `
    ${bloqueada ? `
      <div class="banner alerta" role="alert">
        <span>Tu caja está cerrada. Ábrela para poder cobrar.</span>
        <a class="boton" href="#caja">Abrir caja</a>
      </div>` : ''}
    <div id="alerta-stock"></div>
    <div class="pos">
      <section class="panel" aria-labelledby="t-venta">
        <h1 id="t-venta"><span class="acento">Nueva</span> venta</h1>
        <form id="f-buscar" class="buscador" autocomplete="off">
          <input id="buscar" aria-label="Código o nombre del producto" placeholder="Escanea o escribe código / nombre y presiona Enter" autofocus>
          <button type="submit">Agregar</button>
        </form>
        <div id="resultados" class="resultados"></div>
        <div class="tabla-wrap">
          <table class="carrito">
            <thead><tr><th>Producto</th><th class="num">Precio${conIva ? '' : ' (sin IVA)'}</th><th class="num">Cantidad</th><th class="num">Importe</th><th><span class="oculto">Quitar</span></th></tr></thead>
            <tbody id="lineas"></tbody>
          </table>
        </div>
        <p class="atajos"><kbd>Enter</kbd> agregar · <kbd>F2</kbd> cobrar · <kbd>F4</kbd> buscar${conCredito ? ' · <kbd>F8</kbd> efectivo / crédito' : ''}${sobreventa ? ' · Sobreventa habilitada' : ''}</p>
      </section>

      <aside class="panel cobro" aria-labelledby="t-cobro">
        <div id="zona-cobro">
          <h2 id="t-cobro">Cobro</h2>
          <dl>
            <dt>Subtotal</dt><dd id="subtotal">$0.00</dd>
            <dt>Descuento</dt><dd id="desc-mostrar">$0.00</dd>
            ${cobraIva ? `<dt>${conIva ? 'IVA incluido' : 'IVA'}</dt><dd id="iva">$0.00</dd>` : ''}
            <dt>Total</dt><dd class="total" id="total">$0.00</dd>
          </dl>
          ${esAdmin ? '<label>Descuento ($)<input id="descuento" inputmode="decimal" value="0"></label>' : ''}
          <label>Método de pago
            <select id="metodo">${config.metodos_pago.map((m) => `<option value="${m}">${esc(METODOS[m])}</option>`).join('')}</select>
          </label>
          <div id="zona-trabajador" class="oculto">
            <label>Trabajador (escribe parte del nombre)
              <input id="trabajador" autocomplete="off" placeholder="Ej. juan" role="combobox"
                     aria-autocomplete="list" aria-controls="sugerencias-trabajador" aria-expanded="false">
            </label>
            <div id="sugerencias-trabajador" class="resultados sugerencias" role="listbox"></div>
            <p id="trabajador-elegido" class="muted"></p>
          </div>
          <label id="zona-recibido">Monto recibido ($)
            <input id="recibido" inputmode="decimal" placeholder="0.00">
          </label>
          <dl id="zona-cambio"><dt>Cambio</dt><dd id="cambio" class="cambio-valor">$0.00</dd></dl>
          <p id="error-cobro" class="error-form" role="alert"></p>
          <button id="cobrar" class="marca-btn" type="button" ${bloqueada ? 'disabled' : ''}>Cobrar (F2)</button>
          <div class="acciones"><button id="vaciar" type="button" class="chico">Vaciar venta</button></div>
        </div>
        <div id="zona-exito" class="exito oculto" aria-live="polite"></div>
      </aside>
    </div>`;

  const $ = (s) => el.querySelector(s);
  const buscar = $('#buscar');
  const resultados = $('#resultados');

  // ---------- Alerta de productos por agotarse ----------
  api('GET', '/api/productos?nivel=bajo').then((bajos) => {
    if (!bajos.length) return;
    const agotados = bajos.filter((p) => Number(p.existencia) <= 0).length;
    $('#alerta-stock').innerHTML = `
      <div class="banner alerta" role="status">
        <span>${bajos.length} producto${bajos.length === 1 ? '' : 's'} por agotarse${agotados ? ` (${agotados} agotado${agotados === 1 ? '' : 's'})` : ''}.</span>
        <a class="boton" href="#inventario">${esAdmin ? 'Ver lista de compra' : 'Ver inventario'}</a>
      </div>`;
  }).catch(() => {});

  // ---------- Trabajador (ventas a crédito) ----------
  // Al escribir unas letras aparecen los trabajadores que coinciden (sin
  // importar acentos ni mayúsculas): "jua" → Juan Pérez, Juana López…
  // También se puede escribir el número de trabajador.
  const normal = (t) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  let elegido = null;
  let sugeridos = [];

  function coincidencias(texto) {
    const palabras = normal(texto).split(/\s+/).filter(Boolean);
    if (!palabras.length) return [];
    return trabajadores
      .filter((t) => {
        const nombre = normal(t.nombre);
        return palabras.every((p) => nombre.split(/\s+/).some((w) => w.startsWith(p)) || nombre.includes(p))
          || normal(t.numero).startsWith(palabras.join(''));
      })
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
      .slice(0, 8);
  }

  function pintarSugerencias() {
    const lista = $('#sugerencias-trabajador');
    lista.innerHTML = sugeridos.map((t, i) => `
      <button type="button" role="option" data-i="${i}">
        <span>${esc(t.nombre)}</span><span class="muted">núm. ${esc(t.numero)}</span>
      </button>`).join('');
    $('#trabajador').setAttribute('aria-expanded', String(sugeridos.length > 0));
  }

  function elegirTrabajador(t) {
    elegido = t;
    sugeridos = [];
    $('#trabajador').value = t.nombre;
    pintarSugerencias();
    pintarTrabajador();
  }

  function trabajadorElegido() {
    return elegido;
  }

  function pintarTrabajador() {
    const p = $('#trabajador-elegido');
    const texto = $('#trabajador').value.trim();
    if (elegido) {
      p.className = 'positivo';
      p.textContent = `✓ ${elegido.nombre} (núm. ${elegido.numero}) · se descontará de su nómina.`;
    } else if (!texto) {
      p.className = 'muted';
      p.textContent = trabajadores.length
        ? 'Se descontará de su nómina.'
        : 'No hay trabajadores dados de alta (sección Nómina).';
    } else {
      p.className = sugeridos.length ? 'muted' : 'error-form';
      p.textContent = sugeridos.length
        ? 'Toca el nombre del trabajador.'
        : 'No hay un trabajador activo con ese nombre o número.';
    }
  }

  function escribirTrabajador() {
    elegido = null;
    sugeridos = coincidencias($('#trabajador').value);
    // Si el número escrito es exacto, se elige solo.
    const exacto = trabajadores.find((t) => normal(t.numero) === normal($('#trabajador').value));
    if (exacto) return elegirTrabajador(exacto);
    pintarSugerencias();
    pintarTrabajador();
  }

  // ---------- Cálculos (mismas reglas que el servidor) ----------
  function calcular() {
    let subtotal = 0;
    let iva = 0;
    let error = '';
    for (const l of carrito) {
      const c = aEntero(l.cant, 3);
      l.valida = c !== null && c > 0;
      if (l.valida && l.p.unidad === 'pieza' && c % 1000 !== 0) l.valida = false;
      if (!l.valida) {
        error ||= `Revisa la cantidad de "${l.p.nombre}".`;
        l.imp = 0;
        continue;
      }
      if (!sobreventa && c > aEnteroSigno(l.p.existencia, 3)) {
        l.valida = false;
        error ||= `Solo hay ${cantidad(Math.max(Number(l.p.existencia), 0), l.p.unidad)} de "${l.p.nombre}".`;
        l.imp = 0;
        continue;
      }
      l.imp = importe(c, aEntero(l.p.precio_venta, 2));
      subtotal += l.imp;
      const tasa = cobraIva ? aEntero(l.p.tasa_iva, 4) : 0;
      iva += conIva ? ivaContenido(l.imp, tasa) : ivaSobre(l.imp, tasa);
    }
    let descuento = aEntero($('#descuento')?.value.trim() || '0', 2);
    if (descuento === null) {
      error ||= 'El descuento no es válido.';
      descuento = 0;
    } else if (descuento > subtotal) {
      error ||= 'El descuento no puede ser mayor que el subtotal.';
    }
    const neto = Math.max(subtotal - descuento, 0);
    const impuestos = prorratear(iva, neto, subtotal);
    const total = conIva ? neto : neto + impuestos;
    const metodo = $('#metodo').value;
    let recibido = null;
    let cambio = 0;
    let trabajador = null;
    if (metodo === 'efectivo') {
      recibido = aEntero($('#recibido').value.trim() || 'x', 2);
      if (recibido !== null) cambio = Math.max(recibido - total, 0);
    } else if (metodo === 'credito') {
      trabajador = trabajadorElegido();
    }
    return { subtotal, descuento, total, impuestos, metodo, recibido, cambio, trabajador, error };
  }

  function pintarTotales() {
    const t = calcular();
    $('#subtotal').textContent = moneda(aTexto(t.subtotal, 2));
    $('#desc-mostrar').textContent = moneda(aTexto(t.descuento, 2));
    if (cobraIva) $('#iva').textContent = moneda(aTexto(t.impuestos, 2));
    $('#total').textContent = moneda(aTexto(t.total, 2));
    $('#cambio').textContent = moneda(aTexto(t.cambio, 2));
    $('#zona-recibido').classList.toggle('oculto', t.metodo !== 'efectivo');
    $('#zona-cambio').classList.toggle('oculto', t.metodo !== 'efectivo');
    $('#zona-trabajador').classList.toggle('oculto', t.metodo !== 'credito');
    for (const l of carrito) {
      const fila = el.querySelector(`tr[data-id="${l.p.id}"]`);
      if (!fila) continue;
      fila.querySelector('.importe').textContent = l.valida ? moneda(aTexto(l.imp, 2)) : '—';
      fila.querySelector('input.cant').setAttribute('aria-invalid', String(!l.valida));
    }
    return t;
  }

  function pintarCarrito() {
    $('#lineas').innerHTML = carrito.length
      ? carrito.map((l) => `
        <tr data-id="${esc(l.p.id)}">
          <td><strong>${esc(l.p.nombre)}</strong><br><span class="muted">${esc(l.p.codigo)} · disp. ${esc(cantidad(l.p.existencia, l.p.unidad))}</span></td>
          <td class="num">${moneda(l.p.precio_venta)}</td>
          <td class="num"><input class="cant" inputmode="decimal" value="${esc(l.cant)}" aria-label="Cantidad de ${esc(l.p.nombre)}"> ${l.p.unidad === 'pieza' ? 'pz' : esc(l.p.unidad)}</td>
          <td class="num importe"></td>
          <td><button type="button" class="chico peligro quitar" aria-label="Quitar ${esc(l.p.nombre)}">Quitar</button></td>
        </tr>`).join('')
      : '<tr><td colspan="5" class="vacio">Agrega productos con el buscador.</td></tr>';
    pintarTotales();
  }

  function agregar(p) {
    if (!sobreventa && Number(p.existencia) <= 0) {
      aviso(`"${p.nombre}" está agotado.`, 'error');
      return;
    }
    const linea = carrito.find((l) => String(l.p.id) === String(p.id));
    if (linea && p.unidad === 'pieza') {
      const c = aEntero(linea.cant, 3);
      linea.cant = c === null ? '1' : String((c + 1000) / 1000);
    } else if (!linea) {
      carrito.push({ p, cant: '1' });
    }
    pintarCarrito();
    resultados.innerHTML = '';
    if (p.unidad !== 'pieza') {
      // Productos a granel: ir directo a capturar el peso o volumen.
      const input = el.querySelector(`tr[data-id="${p.id}"] input.cant`);
      input?.focus();
      input?.select();
    } else {
      buscar.focus();
    }
  }

  // ---------- Búsqueda ----------
  $('#f-buscar').addEventListener('submit', async (e) => {
    e.preventDefault();
    const texto = buscar.value.trim();
    if (!texto) return;
    // Limpiar de inmediato: un lector de códigos puede enviar el siguiente
    // código antes de que responda el servidor.
    buscar.value = '';
    try {
      agregar(await api('GET', `/api/productos/codigo/${encodeURIComponent(texto)}`));
      return;
    } catch (err) {
      if (err.status !== 404) return aviso(err.message, 'error');
    }
    try {
      const lista = await api('GET', `/api/productos?q=${encodeURIComponent(texto)}`);
      if (lista.length === 1) return agregar(lista[0]);
      resultados.innerHTML = lista.length
        ? lista.slice(0, 15).map((p, i) => {
            const agotado = Number(p.existencia) <= 0;
            return `
            <button type="button" data-i="${i}" ${agotado && !sobreventa ? 'disabled' : ''}>
              <span>${esc(p.nombre)} <span class="muted">${esc(p.codigo)}</span></span>
              <span>${moneda(p.precio_venta)} · ${agotado ? 'Agotado' : esc(cantidad(p.existencia, p.unidad))}</span>
            </button>`;
          }).join('')
        : `<p class="muted">No se encontró ningún producto activo con "${esc(texto)}".</p>`;
      resultados._lista = lista;
      resultados.querySelector('button:not([disabled])')?.focus();
    } catch (err) {
      aviso(err.message, 'error');
    }
  });

  resultados.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-i]');
    if (b) agregar(resultados._lista[Number(b.dataset.i)]);
  });

  // ---------- Carrito ----------
  $('#lineas').addEventListener('input', (e) => {
    if (!e.target.matches('input.cant')) return;
    const id = e.target.closest('tr').dataset.id;
    carrito.find((l) => String(l.p.id) === id).cant = e.target.value.trim();
    pintarTotales();
  });
  $('#lineas').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.matches('input.cant')) buscar.focus();
  });
  $('#lineas').addEventListener('click', (e) => {
    if (!e.target.closest('.quitar')) return;
    const id = e.target.closest('tr').dataset.id;
    carrito = carrito.filter((l) => String(l.p.id) !== id);
    pintarCarrito();
    buscar.focus();
  });

  for (const s of ['#metodo', '#recibido', '#descuento']) {
    el.querySelector(s)?.addEventListener('input', pintarTotales);
  }
  $('#trabajador').addEventListener('input', escribirTrabajador);
  $('#trabajador').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      // Enter: si ya hay trabajador elegido, cobra; si no, elige el primero de la lista.
      if (elegido) cobrar();
      else if (sugeridos.length) elegirTrabajador(sugeridos[0]);
    } else if (e.key === 'ArrowDown' && sugeridos.length) {
      e.preventDefault();
      $('#sugerencias-trabajador button')?.focus();
    }
  });
  $('#sugerencias-trabajador').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-i]');
    if (b) elegirTrabajador(sugeridos[Number(b.dataset.i)]);
  });
  $('#sugerencias-trabajador').addEventListener('keydown', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); b.nextElementSibling?.focus(); }
    if (e.key === 'ArrowUp') { e.preventDefault(); (b.previousElementSibling ?? $('#trabajador')).focus(); }
  });
  function cambioMetodo() {
    pintarTotales();
    if ($('#metodo').value === 'efectivo') $('#recibido').focus();
    else if ($('#metodo').value === 'credito') $('#trabajador').focus();
  }
  $('#metodo').addEventListener('change', cambioMetodo);

  $('#vaciar').addEventListener('click', () => {
    if (carrito.length && !confirm('¿Vaciar la venta actual?')) return;
    nuevaVenta();
  });

  function nuevaVenta() {
    carrito = [];
    $('#recibido').value = '';
    $('#trabajador').value = '';
    elegido = null;
    sugeridos = [];
    pintarSugerencias();
    pintarTrabajador();
    if ($('#descuento')) $('#descuento').value = '0';
    $('#metodo').selectedIndex = 0;
    $('#error-cobro').textContent = '';
    $('#zona-exito').classList.add('oculto');
    $('#zona-cobro').classList.remove('oculto');
    pintarCarrito();
    buscar.focus();
  }

  // ---------- Cobro ----------
  async function cobrar() {
    if (cobrando || bloqueada) return;
    const errorCobro = $('#error-cobro');
    errorCobro.textContent = '';
    if (!carrito.length) {
      errorCobro.textContent = 'Agrega al menos un producto.';
      return buscar.focus();
    }
    const t = pintarTotales();
    if (t.error) {
      errorCobro.textContent = t.error;
      return;
    }
    if (t.metodo === 'efectivo' && (t.recibido === null || t.recibido < t.total)) {
      errorCobro.textContent = `El monto recibido debe cubrir el total de ${moneda(aTexto(t.total, 2))}.`;
      return $('#recibido').focus();
    }
    if (t.metodo === 'credito' && !t.trabajador) {
      errorCobro.textContent = 'Elige al trabajador: escribe parte de su nombre y tócalo en la lista.';
      return $('#trabajador').focus();
    }

    cobrando = true;
    $('#cobrar').disabled = true;
    try {
      const venta = await api('POST', '/api/ventas', {
        metodo_pago: t.metodo,
        monto_recibido: t.metodo === 'efectivo' ? aTexto(t.recibido, 2) : undefined,
        trabajador_id: t.metodo === 'credito' ? t.trabajador.id : undefined,
        descuento: aTexto(t.descuento, 2),
        partidas: carrito.map((l) => ({ producto_id: l.p.id, cantidad: l.cant })),
      });
      $('#zona-cobro').classList.add('oculto');
      const exito = $('#zona-exito');
      exito.classList.remove('oculto');
      exito.innerHTML = `
        <h2><span class="acento-verde">Venta</span> registrada</h2>
        <p class="folio">${esc(venta.folio)}</p>
        <p>Total: <strong>${moneda(venta.total)}</strong></p>
        ${t.metodo === 'efectivo' ? `<p class="cambio">Cambio: <strong class="positivo">${moneda(venta.cambio)}</strong></p>` : ''}
        ${t.metodo === 'credito' ? `<p>A crédito de <strong>${esc(t.trabajador.nombre)}</strong> (núm. ${esc(t.trabajador.numero)}).<br><span class="muted">Imprime el ticket para que lo firme.</span></p>` : ''}
        <div class="acciones">
          <button type="button" id="ver-ticket">Imprimir ticket</button>
          <button type="button" id="nueva" class="primario">Nueva venta (Enter)</button>
        </div>
        ${esAdmin ? '<div class="acciones"><button type="button" id="cancelar-venta" class="chico peligro">Cancelar esta venta</button></div>' : ''}`;
      exito.querySelector('#cancelar-venta')?.addEventListener('click', () => cancelarVenta(venta));
      exito.querySelector('#ver-ticket').addEventListener('click', () =>
        window.open(`/ticket.html?id=${encodeURIComponent(venta.id)}&imprimir=1`, '_blank', 'width=420,height=720'),
      );
      exito.querySelector('#nueva').addEventListener('click', nuevaVenta);
      exito.querySelector('#nueva').focus();
    } catch (err) {
      // La venta no se guardó: el carrito se conserva para corregir y reintentar.
      errorCobro.textContent = err.message;
      if (err.status === 409 && /caja/i.test(err.message)) ctx.actualizarCaja();
    } finally {
      cobrando = false;
      $('#cobrar').disabled = bloqueada;
    }
  }

  /** Cancelar la venta recién cobrada (solo administrador). */
  function cancelarVenta(venta) {
    const d = ctx.abrirDialogo(`
      <h2>Cancelar venta ${esc(venta.folio)}</h2>
      <p class="muted">Los productos regresan al inventario y la venta deja de contar en caja, reportes y nómina.</p>
      <form id="f-cancelar-pos" novalidate>
        <label>Motivo (obligatorio)<input name="motivo" maxlength="255" required autofocus></label>
        <p class="error-form" id="error-cancelar-pos" role="alert"></p>
        <div class="acciones"><button type="button" data-cerrar>No cancelar</button><button type="submit" class="peligro">Cancelar venta</button></div>
      </form>`);
    d.querySelector('#f-cancelar-pos').addEventListener('submit', async (e) => {
      e.preventDefault();
      const motivo = e.target.motivo.value.trim();
      if (!motivo) {
        d.querySelector('#error-cancelar-pos').textContent = 'Escribe el motivo de la cancelación.';
        return;
      }
      try {
        const r = await api('POST', `/api/ventas/${venta.id}/cancelar`, { motivo });
        ctx.cerrarDialogo();
        aviso(`Venta ${venta.folio} cancelada. El inventario fue repuesto.`);
        if (r.aviso_caja) aviso(r.aviso_caja, 'error');
        nuevaVenta();
      } catch (err) {
        d.querySelector('#error-cancelar-pos').textContent = err.message;
      }
    });
  }

  $('#cobrar').addEventListener('click', cobrar);
  document.addEventListener(
    'keydown',
    (e) => {
      if (e.key === 'F2') {
        e.preventDefault();
        if (!$('#zona-cobro').classList.contains('oculto')) cobrar();
      } else if (e.key === 'F4') {
        e.preventDefault();
        buscar.focus();
      } else if (e.key === 'F8' && conCredito && config.metodos_pago.includes('efectivo')) {
        e.preventDefault();
        $('#metodo').value = $('#metodo').value === 'efectivo' ? 'credito' : 'efectivo';
        cambioMetodo();
      } else if (e.key === 'Escape' && document.activeElement === buscar) {
        resultados.innerHTML = '';
        buscar.value = '';
      }
    },
    { signal: senal },
  );

  pintarTrabajador();
  pintarCarrito();
}

