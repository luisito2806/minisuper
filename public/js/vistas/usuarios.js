// Administración de usuarios (solo administrador).
import { api, aviso, esc, etiquetaEstado, fechaHora } from '../comun.js';

export async function render(el, { usuario: yo, abrirDialogo, cerrarDialogo }) {
  let usuarios = [];
  el.innerHTML = `
    <section class="panel">
      <div class="encabezado"><h1><span class="acento">Usuarios</span> y permisos</h1><button type="button" class="primario" id="nuevo">Nuevo usuario</button></div>
      <div class="tabla-wrap"><table>
        <thead><tr><th>Nombre</th><th>Usuario</th><th>Rol</th><th>Alta</th><th>Estado</th><th></th></tr></thead>
        <tbody id="filas"></tbody>
      </table></div>
    </section>`;

  async function cargar() {
    usuarios = await api('GET', '/api/usuarios');
    el.querySelector('#filas').innerHTML = usuarios.map((u, i) => `
      <tr>
        <td>${esc(u.nombre)}${String(u.id) === String(yo.id) ? ' <span class="muted">(tú)</span>' : ''}</td>
        <td>${esc(u.usuario)}</td>
        <td>${u.rol === 'administrador' ? 'Administrador' : 'Cajero'}</td>
        <td>${esc(fechaHora(u.creado_en))}</td>
        <td>${etiquetaEstado(u.activo ? 'activo' : 'inactivo')}${u.activo && u.debe_cambiar_contrasena ? ' <span class="muted">· falta que cambie su contraseña</span>' : ''}</td>
        <td><button type="button" class="chico" data-i="${i}">Editar</button></td>
      </tr>`).join('');
  }

  function formulario(u) {
    const nuevo = !u;
    u ??= { rol: 'cajero', activo: true };
    const soyYo = !nuevo && String(u.id) === String(yo.id);
    const d = abrirDialogo(`
      <h2>${nuevo ? 'Nuevo usuario' : `Editar: ${esc(u.usuario)}`}</h2>
      <form id="f-usr" novalidate>
        <div class="form-grid">
          <label>Nombre completo *<input name="nombre" maxlength="100" required value="${esc(u.nombre)}"></label>
          ${nuevo ? '<label>Usuario (para iniciar sesión) *<input name="usuario" maxlength="50" required autocomplete="off"></label>' : ''}
          <label>Rol<select name="rol" ${soyYo ? 'disabled' : ''}>
            <option value="cajero" ${u.rol === 'cajero' ? 'selected' : ''}>Cajero</option>
            <option value="administrador" ${u.rol === 'administrador' ? 'selected' : ''}>Administrador</option>
          </select></label>
          <label>${nuevo ? 'Contraseña * (mín. 8)' : 'Nueva contraseña (vacío = no cambiar)'}
            <input name="contrasena" type="password" autocomplete="new-password" minlength="8"></label>
          ${soyYo ? '' : '<p class="muted ancho">Al entrar con la contraseña que pongas aquí, el sistema le pedirá elegir una propia.</p>'}
          <label class="check ancho"><input type="checkbox" name="activo" ${u.activo ? 'checked' : ''} ${soyYo ? 'disabled' : ''}> Activo (puede iniciar sesión)</label>
        </div>
        <p class="error-form" id="error-usr" role="alert"></p>
        <div class="acciones"><button type="button" data-cerrar>Cancelar</button><button type="submit" class="primario">Guardar</button></div>
      </form>`);
    d.querySelector('#f-usr').addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.target;
      const datos = {
        nombre: f.nombre.value,
        rol: soyYo ? u.rol : f.rol.value,
        activo: soyYo ? true : f.activo.checked,
        contrasena: f.contrasena.value || undefined,
      };
      if (nuevo) datos.usuario = f.usuario.value;
      if (!nuevo && u.activo && !datos.activo && !confirm(`¿Desactivar a ${u.nombre}? Ya no podrá iniciar sesión.`)) return;
      try {
        await api(nuevo ? 'POST' : 'PUT', nuevo ? '/api/usuarios' : `/api/usuarios/${u.id}`, datos);
        aviso('Usuario guardado.');
        cerrarDialogo();
        cargar();
      } catch (err) {
        d.querySelector('#error-usr').textContent = err.message;
      }
    });
  }

  el.querySelector('#nuevo').addEventListener('click', () => formulario(null));
  el.querySelector('#filas').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-i]');
    if (b) formulario(usuarios[Number(b.dataset.i)]);
  });
  await cargar();
}
