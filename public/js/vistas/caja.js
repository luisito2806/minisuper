// Caja: apertura con fondo inicial, ingresos y retiros, cierre con
// efectivo contado, e historial de cortes.
import { aEntero, aTexto } from '../dinero.js';
import { api, aviso, diferencia, esc, etiquetaEstado, fechaHora, hoy, moneda } from '../comun.js';

export async function render(el, { esAdmin, ctx, abrirDialogo, cerrarDialogo }) {
  el.innerHTML = `
    <div id="actual"></div>
    <section class="panel">
      <div class="encabezado"><h2>${esAdmin ? 'Cortes de caja' : 'Mis cortes de caja'}</h2></div>
      <form id="filtros" class="filtros">
        <label>Desde<input type="date" name="desde" value="${hoy().slice(0, 8)}01"></label>
        <label>Hasta<input type="date" name="hasta" value="${hoy()}"></label>
        <label>Estado<select name="estado"><option value="">Todas</option><option value="abierta">Abiertas</option><option value="cerrada">Cerradas</option></select></label>
        <button type="submit">Buscar</button>
      </form>
      <div class="tabla-wrap"><table>
        <thead><tr><th>Usuario</th><th>Apertura</th><th>Cierre</th><th class="num">Fondo</th><th class="num">Esperado</th><th class="num">Contado</th><th>Diferencia</th><th>Estado</th><th></th></tr></thead>
        <tbody id="historial"></tbody>
      </table></div>
    </section>`;

  const actual = el.querySelector('#actual');
  const filtros = el.querySelector('#filtros');

  // ---------- Caja del usuario actual ----------
  async function pintarActual() {
    const { sesion: s, movimientos } = await api('GET', '/api/caja/actual');
    ctx.actualizarCaja();
    if (!s) {
      actual.innerHTML = `
        <section class="panel">
          <h1><span class="acento">Abrir</span> caja</h1>
          <p class="muted">Cuenta el efectivo con el que empiezas el turno (fondo para dar cambio).</p>
          <form id="f-abrir" class="filtros" novalidate>
            <label>Fondo inicial ($)<input name="fondo_inicial" inputmode="decimal" required autofocus placeholder="0.00"></label>
            <button type="submit" class="primario">Abrir caja</button>
          </form>
          <p class="error-form" id="error-abrir" role="alert"></p>
        </section>`;
      actual.querySelector('#f-abrir').addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
          await api('POST', '/api/caja/abrir', { fondo_inicial: e.target.fondo_inicial.value.trim() });
          aviso('Caja abierta. Ya puedes vender.');
          pintarActual();
          cargarHistorial();
        } catch (err) {
          actual.querySelector('#error-abrir').textContent = err.message;
        }
      });
      return;
    }

    actual.innerHTML = `
      <section class="panel">
        <div class="encabezado">
          <h1><span class="acento">Mi</span> caja</h1>
          <span class="muted">Abierta el ${esc(fechaHora(s.abierta_en))} ${etiquetaEstado('abierta')}</span>
        </div>
        <div class="tarjetas">
          <div class="tarjeta"><div class="etiqueta">Fondo inicial</div><div class="valor">${moneda(s.fondo_inicial)}</div></div>
          <div class="tarjeta"><div class="etiqueta">Ventas en efectivo</div><div class="valor">${moneda(s.ventas_efectivo)}</div></div>
          <div class="tarjeta"><div class="etiqueta">Ingresos</div><div class="valor">${moneda(s.ingresos)}</div></div>
          <div class="tarjeta"><div class="etiqueta">Retiros</div><div class="valor">${moneda(s.retiros)}</div></div>
          <div class="tarjeta destacada"><div class="etiqueta">Efectivo esperado</div><div class="valor">${moneda(s.efectivo_esperado_actual)}</div></div>
          <div class="tarjeta"><div class="etiqueta">Ventas a crédito (no entran a caja)</div><div class="valor">${moneda(s.ventas_otros)}</div></div>
        </div>

        <div class="form-grid">
          <form id="f-mov" class="tarjeta" novalidate>
            <h3>Ingreso o retiro</h3>
            <fieldset><legend>Tipo</legend>
              <div class="opciones">
                <label class="check"><input type="radio" name="tipo" value="retiro" checked> Retiro</label>
                <label class="check"><input type="radio" name="tipo" value="ingreso"> Ingreso</label>
              </div>
            </fieldset>
            <label>Monto ($)<input name="monto" inputmode="decimal" required></label>
            <label>Motivo<input name="motivo" maxlength="255" required placeholder="Ej. pago a proveedor, cambio extra"></label>
            <p class="error-form" id="error-mov" role="alert"></p>
            <div class="acciones"><button type="submit">Registrar</button></div>
          </form>

          <form id="f-cerrar" class="tarjeta" novalidate>
            <h3>Cerrar caja</h3>
            <label>Efectivo contado ($)<input name="monto_contado" inputmode="decimal" required></label>
            <p id="previa" class="muted">Cuenta el efectivo del cajón y escríbelo aquí.</p>
            <label>Notas (opcional)<input name="notas" maxlength="255"></label>
            <p class="error-form" id="error-cerrar" role="alert"></p>
            <div class="acciones"><button type="submit" class="primario">Cerrar caja</button></div>
          </form>
        </div>

        <h3>Movimientos de efectivo</h3>
        <div class="tabla-wrap"><table>
          <thead><tr><th>Fecha</th><th>Tipo</th><th>Motivo</th><th class="num">Monto</th></tr></thead>
          <tbody>${movimientos.map((m) => `
            <tr><td>${esc(fechaHora(m.fecha))}</td><td>${m.tipo === 'ingreso' ? 'Ingreso' : 'Retiro'}</td>
            <td>${esc(m.motivo)}</td><td class="num ${m.tipo === 'retiro' ? 'negativo' : 'positivo'}">${m.tipo === 'retiro' ? '−' : '+'}${moneda(m.monto)}</td></tr>`).join('')
            || '<tr><td colspan="4" class="vacio">Sin ingresos ni retiros.</td></tr>'}
          </tbody>
        </table></div>
      </section>`;

    const fMov = actual.querySelector('#f-mov');
    fMov.addEventListener('submit', async (e) => {
      e.preventDefault();
      const datos = Object.fromEntries(new FormData(fMov));
      try {
        await api('POST', '/api/caja/movimientos', datos);
        aviso(datos.tipo === 'retiro' ? 'Retiro registrado.' : 'Ingreso registrado.');
        pintarActual();
      } catch (err) {
        actual.querySelector('#error-mov').textContent = err.message;
      }
    });

    const fCerrar = actual.querySelector('#f-cerrar');
    const esperado = aEntero(s.efectivo_esperado_actual, 2);
    fCerrar.monto_contado.addEventListener('input', () => {
      const c = aEntero(fCerrar.monto_contado.value.trim(), 2);
      actual.querySelector('#previa').innerHTML = c === null
        ? 'Cuenta el efectivo del cajón y escríbelo aquí.'
        : `Esperado ${moneda(s.efectivo_esperado_actual)} · ${diferencia(aTexto(c - esperado, 2))}`;
    });
    fCerrar.addEventListener('submit', async (e) => {
      e.preventDefault();
      const error = actual.querySelector('#error-cerrar');
      const contado = fCerrar.monto_contado.value.trim();
      if (aEntero(contado, 2) === null) {
        error.textContent = 'Escribe el efectivo contado.';
        return;
      }
      if (!confirm(`¿Cerrar la caja con ${moneda(contado)} contados? Después no podrás registrar ventas en ella.`)) return;
      try {
        const r = await api('POST', `/api/caja/${s.id}/cerrar`, { monto_contado: contado, notas: fCerrar.notas.value });
        aviso('Caja cerrada.');
        mostrarCorte(r.id);
        pintarActual();
        cargarHistorial();
      } catch (err) {
        error.textContent = err.message;
      }
    });
  }

  // ---------- Historial ----------
  let sesiones = [];
  async function cargarHistorial() {
    const q = new URLSearchParams([...new FormData(filtros)].filter(([, v]) => v));
    try {
      sesiones = await api('GET', `/api/caja?${q}`);
    } catch (err) {
      return aviso(err.message, 'error');
    }
    el.querySelector('#historial').innerHTML = sesiones.map((s, i) => `
      <tr>
        <td>${esc(s.usuario)}</td>
        <td>${esc(fechaHora(s.abierta_en))}</td>
        <td>${esc(fechaHora(s.cerrada_en))}</td>
        <td class="num">${moneda(s.fondo_inicial)}</td>
        <td class="num">${s.efectivo_esperado ? moneda(s.efectivo_esperado) : '—'}</td>
        <td class="num">${s.monto_contado ? moneda(s.monto_contado) : '—'}</td>
        <td>${s.diferencia !== null ? diferencia(s.diferencia) : '—'}</td>
        <td>${etiquetaEstado(s.estado)}</td>
        <td><button type="button" class="chico" data-i="${i}">Ver</button></td>
      </tr>`).join('') || '<tr><td colspan="9" class="vacio">Sin cortes en el periodo.</td></tr>';
  }

  async function mostrarCorte(id) {
    const { sesion: s, movimientos } = await api('GET', `/api/caja/${id}`);
    const propia = String(s.usuario_id) === String(ctx.usuario.id);
    const d = abrirDialogo(`
      <div class="encabezado"><h2>Corte de caja · ${esc(s.usuario)}</h2>${etiquetaEstado(s.estado)}</div>
      <p class="muted">Apertura ${esc(fechaHora(s.abierta_en))}${s.cerrada_en ? ` · Cierre ${esc(fechaHora(s.cerrada_en))} por ${esc(s.cerrada_por_nombre)}` : ''}</p>
      <div class="tarjetas">
        <div class="tarjeta"><div class="etiqueta">Fondo inicial</div><div class="valor">${moneda(s.fondo_inicial)}</div></div>
        <div class="tarjeta"><div class="etiqueta">Ventas efectivo</div><div class="valor">${moneda(s.ventas_efectivo)}</div></div>
        <div class="tarjeta"><div class="etiqueta">Ingresos</div><div class="valor">${moneda(s.ingresos)}</div></div>
        <div class="tarjeta"><div class="etiqueta">Retiros</div><div class="valor">${moneda(s.retiros)}</div></div>
        <div class="tarjeta"><div class="etiqueta">Esperado</div><div class="valor">${moneda(s.efectivo_esperado_actual)}</div></div>
        ${s.estado === 'cerrada' ? `
        <div class="tarjeta"><div class="etiqueta">Contado</div><div class="valor">${moneda(s.monto_contado)}</div></div>
        <div class="tarjeta"><div class="etiqueta">Diferencia</div><div class="valor">${diferencia(s.diferencia)}</div></div>` : ''}
        <div class="tarjeta"><div class="etiqueta">Ventas a crédito</div><div class="valor">${moneda(s.ventas_otros)}</div></div>
      </div>
      <p class="muted">${s.num_ventas} ventas completadas · ${s.num_canceladas} canceladas${s.notas_cierre ? ` · Notas: ${esc(s.notas_cierre)}` : ''}</p>
      ${movimientos.length ? `<div class="tabla-wrap"><table>
        <thead><tr><th>Fecha</th><th>Tipo</th><th>Motivo</th><th>Usuario</th><th class="num">Monto</th></tr></thead>
        <tbody>${movimientos.map((m) => `<tr><td>${esc(fechaHora(m.fecha))}</td><td>${m.tipo === 'ingreso' ? 'Ingreso' : 'Retiro'}</td><td>${esc(m.motivo)}</td><td>${esc(m.usuario)}</td><td class="num">${moneda(m.monto)}</td></tr>`).join('')}</tbody>
      </table></div>` : ''}
      ${s.estado === 'abierta' && esAdmin && !propia ? `
        <form id="f-cerrar-otra" class="panel" novalidate>
          <h3>Cerrar esta caja</h3>
          <div class="form-grid">
            <label>Efectivo contado ($)<input name="monto_contado" inputmode="decimal" required></label>
            <label>Notas<input name="notas" maxlength="255"></label>
          </div>
          <p class="error-form" id="error-otra" role="alert"></p>
          <div class="acciones"><button type="submit" class="primario">Cerrar caja</button></div>
        </form>` : ''}
      <div class="acciones"><button type="button" class="no-imprimir" id="imprimir-corte">Imprimir</button><button type="button" data-cerrar>Cerrar</button></div>`);

    d.querySelector('#imprimir-corte').addEventListener('click', () => window.print());
    d.querySelector('#f-cerrar-otra')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.target;
      if (!confirm(`¿Cerrar la caja de ${s.usuario}?`)) return;
      try {
        await api('POST', `/api/caja/${s.id}/cerrar`, { monto_contado: f.monto_contado.value.trim(), notas: f.notas.value });
        aviso('Caja cerrada.');
        cerrarDialogo();
        cargarHistorial();
      } catch (err) {
        d.querySelector('#error-otra').textContent = err.message;
      }
    });
  }

  filtros.addEventListener('submit', (e) => {
    e.preventDefault();
    cargarHistorial();
  });
  el.querySelector('#historial').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-i]');
    if (b) mostrarCorte(sesiones[Number(b.dataset.i)].id).catch((err) => aviso(err.message, 'error'));
  });

  await Promise.all([pintarActual(), cargarHistorial()]);
}
