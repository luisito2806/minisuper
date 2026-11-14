// Dibuja el ticket. Lo usan la página del ticket (ticket.html) y la vista
// previa de Configuración, para que se vean exactamente igual.
import { aEntero, aTexto, importe, ivaContenido, ivaSobre } from './dinero.js';
import { cantidad, esc, fechaHora, moneda, nombreMetodo } from './comun.js';

/** Texto en varias líneas (encabezado extra): una línea centrada por renglón. */
const lineas = (texto) => String(texto ?? '').split('\n').map((l) => l.trim()).filter(Boolean)
  .map((l) => `<p class="centro">${esc(l)}</p>`).join('');

/**
 * tienda: { nombre, direccion, telefono, rfc, encabezado, mensaje_ticket, mostrar_cajero }
 * v: la venta como la devuelve /api/ventas/:id
 */
export function htmlTicket(tienda, v) {
  // El ticket solo muestra lo que paga el cliente: sin subtotal ni IVA.
  return `
    <h1>${esc(tienda.nombre)}</h1>
    ${lineas(tienda.encabezado)}
    ${tienda.direccion ? `<p class="centro">${esc(tienda.direccion)}</p>` : ''}
    ${tienda.telefono ? `<p class="centro">Tel. ${esc(tienda.telefono)}</p>` : ''}
    ${tienda.rfc ? `<p class="centro">RFC ${esc(tienda.rfc)}</p>` : ''}
    <hr>
    <div>Folio: <strong>${esc(v.folio)}</strong></div>
    <div>Fecha: ${esc(fechaHora(v.fecha))}</div>
    ${tienda.mostrar_cajero !== false ? `<div>Atendió: ${esc(v.cajero)}</div>` : ''}
    ${v.estado === 'cancelada' ? '<div class="cancelada">VENTA CANCELADA</div>' : ''}
    <hr>
    <table>
      <thead><tr><th>Artículo</th><th class="num">Importe</th></tr></thead>
      <tbody>
        ${v.partidas.map((p) => `
          <tr><td colspan="2">${esc(p.nombre)}</td></tr>
          <tr><td>${esc(cantidad(p.cantidad, p.unidad))} × ${moneda(p.precio_unitario)}</td>
              <td class="num">${moneda(p.importe)}</td></tr>`).join('')}
      </tbody>
    </table>
    <hr>
    <table>
      ${Number(v.descuento) > 0 ? `<tr><td>Descuento</td><td class="num">-${moneda(v.descuento)}</td></tr>` : ''}
      <tr class="total"><td>TOTAL</td><td class="num">${moneda(v.total)}</td></tr>
      <tr><td>Pago: ${esc(nombreMetodo(v.metodo_pago))}</td><td class="num">${v.monto_recibido ? moneda(v.monto_recibido) : ''}</td></tr>
      ${v.metodo_pago === 'efectivo' ? `<tr><td>Cambio</td><td class="num">${moneda(v.cambio)}</td></tr>` : ''}
    </table>
    ${v.trabajador ? `
      <hr>
      <div>Trabajador: <strong>${esc(v.trabajador.nombre)}</strong></div>
      <div>Núm. de trabajador: ${esc(v.trabajador.numero)}</div>
      <p>Autorizo que se descuente de mi nómina.</p>
      <p class="firma">Firma: ______________________</p>` : ''}
    ${tienda.mensaje_ticket ? `<hr><p class="centro">${esc(tienda.mensaje_ticket)}</p>` : ''}`;

}

/**
 * Venta de ejemplo para la vista previa y el ticket de prueba. Calcula el
 * IVA con la configuración dada (cobrar_iva, precios_incluyen_iva).
 */
export function ventaDeEjemplo({ cobrar_iva: cobraIva = true, precios_incluyen_iva: incluye = true } = {}) {
  const productos = [
    { nombre: 'Refresco cola 600 ml', unidad: 'pieza', cantidad: '2', precio: '20.00', tasa: '0.16' },
    { nombre: 'Arroz 1 kg', unidad: 'pieza', cantidad: '1', precio: '32.00', tasa: '0' },
    { nombre: 'Jitomate', unidad: 'kg', cantidad: '0.75', precio: '28.00', tasa: '0' },
  ];
  const conIva = cobraIva ? incluye : true;
  let subtotal = 0;
  let iva = 0;
  const partidas = productos.map((p) => {
    const imp = importe(aEntero(p.cantidad, 3), aEntero(p.precio, 2));
    const tasa = cobraIva ? aEntero(p.tasa, 4) : 0;
    subtotal += imp;
    iva += conIva ? ivaContenido(imp, tasa) : ivaSobre(imp, tasa);
    return {
      nombre: p.nombre, unidad: p.unidad, cantidad: p.cantidad, precio_unitario: p.precio,
      tasa_iva: aTexto(tasa, 4), importe: aTexto(imp, 2),
    };
  });
  const total = conIva ? subtotal : subtotal + iva;
  const recibido = Math.ceil(total / 10000) * 10000; // siguiente billete de $100
  return {
    folio: 'V-000123',
    fecha: new Date().toISOString(),
    cajero: 'Cajero 1',
    estado: 'completada',
    precios_incluyen_iva: conIva,
    subtotal: aTexto(subtotal, 2),
    descuento: '0.00',
    impuestos: aTexto(iva, 2),
    total: aTexto(total, 2),
    metodo_pago: 'efectivo',
    monto_recibido: aTexto(recibido, 2),
    cambio: aTexto(recibido - total, 2),
    partidas,
  };
}
