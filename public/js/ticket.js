// Página del ticket: /ticket.html?id=<venta>  o  /ticket.html?prueba=1
// (ticket de ejemplo con los datos guardados en Configuración).
import { api, cargarTienda } from './comun.js';
import { htmlTicket, ventaDeEjemplo } from './ticket-html.js';

const contenedor = document.getElementById('ticket');

document.getElementById('imprimir').addEventListener('click', () => window.print());
document.getElementById('cerrar').addEventListener('click', () => window.close());

async function mostrar() {
  const params = new URLSearchParams(location.search);
  try {
    const { tienda, config } = await cargarTienda(true); // aplica moneda y formato de fecha
    contenedor.classList.toggle('ancho-58', tienda.ancho === '58');
    if (params.get('prueba')) {
      document.title = 'Ticket de prueba';
      contenedor.innerHTML = htmlTicket(tienda, ventaDeEjemplo(config));
      return;
    }
    const v = await api('GET', `/api/ventas/${encodeURIComponent(params.get('id'))}`);
    document.title = `Ticket ${v.folio}`;
    contenedor.innerHTML = htmlTicket(tienda, v);
    // Desde "Imprimir ticket" al cobrar: abre la impresión sola y cierra la
    // ventana al terminar. Con la impresión directa del instalador
    // (--kiosk-printing) sale en la impresora sin preguntar.
    if (params.get('imprimir')) {
      window.addEventListener('afterprint', () => window.close(), { once: true });
      setTimeout(() => window.print(), 300);
    }

  } catch (err) {
    contenedor.textContent = err.message;
  }
}

mostrar();
