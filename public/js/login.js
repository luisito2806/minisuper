import { api, cargarTienda } from './comun.js';

const form = document.getElementById('f-login');
const error = document.getElementById('error');

// Si ya hay sesión, ir directo a la aplicación.
fetch('/api/auth/yo', { credentials: 'same-origin' }).then((r) => {
  if (r.ok) location.replace('/app.html');
});

cargarTienda().then((t) => {
  document.getElementById('nombre-tienda').textContent = t.nombre;
  document.title = `${t.nombre} · Iniciar sesión`;
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  error.textContent = '';
  const datos = Object.fromEntries(new FormData(form));
  if (!datos.usuario.trim() || !datos.contrasena) {
    error.textContent = 'Escribe tu usuario y contraseña.';
    return;
  }
  const boton = form.querySelector('button');
  boton.disabled = true;
  try {
    await api('POST', '/api/auth/login', datos);
    location.replace('/app.html');
  } catch (err) {
    error.textContent = err.message;
    form.contrasena.value = '';
    form.contrasena.focus();
  } finally {
    boton.disabled = false;
  }
});
