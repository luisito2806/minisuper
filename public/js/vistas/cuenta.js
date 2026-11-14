// Cambio de contraseña del usuario actual.
import { api, aviso, esc } from '../comun.js';

export async function render(el, { usuario }) {
  el.innerHTML = `
    <section class="panel">
      <h1><span class="acento">Mi</span> cuenta</h1>
      <p>${esc(usuario.nombre)} · usuario <strong>${esc(usuario.usuario)}</strong> · ${usuario.rol === 'administrador' ? 'Administrador' : 'Cajero'}</p>
      <form id="f-pass" novalidate>
        <h2>Cambiar contraseña</h2>
        <div class="form-grid">
          <label>Contraseña actual<input name="actual" type="password" autocomplete="current-password" required></label>
          <label>Nueva contraseña (mín. 8)<input name="nueva" type="password" autocomplete="new-password" minlength="8" required></label>
          <label>Repite la nueva contraseña<input name="repite" type="password" autocomplete="new-password" required></label>
        </div>
        <p class="error-form" id="error" role="alert"></p>
        <div class="acciones"><button type="submit" class="primario">Cambiar contraseña</button></div>
      </form>
    </section>`;

  el.querySelector('#f-pass').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    const error = el.querySelector('#error');
    error.textContent = '';
    if (f.nueva.value.length < 8) return void (error.textContent = 'La nueva contraseña debe tener al menos 8 caracteres.');
    if (f.nueva.value !== f.repite.value) return void (error.textContent = 'Las contraseñas nuevas no coinciden.');
    try {
      await api('POST', '/api/auth/cambiar-contrasena', { actual: f.actual.value, nueva: f.nueva.value });
      f.reset();
      aviso('Contraseña actualizada.');
    } catch (err) {
      error.textContent = err.message;
    }
  });
}
