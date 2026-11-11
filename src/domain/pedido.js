const { badRequest } = require('../utils/errors');

// Reglas de cálculo y validación del pedido (RN-01, RN-02, RN-06)

function validarItems(items) {
  if (!Array.isArray(items) || items.length === 0) {
    throw badRequest('El pedido debe tener al menos un producto');
  }
  const vistos = new Set();
  for (const it of items) {
    const cantidad = Number(it.cantidad);
    if (!Number.isInteger(cantidad) || cantidad <= 0) {
      throw badRequest('Cada producto debe tener una cantidad entera mayor que cero');
    }
    if (vistos.has(Number(it.idProducto))) throw badRequest('Hay productos repetidos en el pedido');
    vistos.add(Number(it.idProducto));
  }
}

function hoyISO(ahora = new Date()) {
  const local = new Date(ahora.getTime() - ahora.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function validarFechaEntrega(fecha, ahora = new Date()) {
  if (!fecha || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) throw badRequest('La fecha de entrega es obligatoria (AAAA-MM-DD)');
  if (fecha < hoyISO(ahora)) throw badRequest('La fecha de entrega no puede ser anterior a hoy');
}

// lineas: [{ precioUnitario, cantidad }]
function calcularTotales(lineas, valorDomicilio = 0) {
  const subtotal = lineas.reduce((s, l) => s + Number(l.precioUnitario) * Number(l.cantidad), 0);
  const domicilio = Number(valorDomicilio) || 0;
  return { subtotal, domicilio, total: subtotal + domicilio };
}

function generarCodigo(rand = Math.random) {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let c = '';
  for (let i = 0; i < 6; i++) c += abc[Math.floor(rand() * abc.length)];
  return `PC-${c}`;
}

module.exports = { validarItems, validarFechaEntrega, calcularTotales, generarCodigo, hoyISO };
