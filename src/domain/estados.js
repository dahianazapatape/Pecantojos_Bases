// Estados del pedido y transiciones permitidas (RN-07, actualizado por SC-03)
const ESTADOS = Object.freeze({
  RECIBIDO: 'RECIBIDO',
  PAGADO: 'PAGADO',
  EN_PREPARACION: 'EN_PREPARACION',
  LISTO: 'LISTO',
  DESPACHADO: 'DESPACHADO',
  ENTREGADO: 'ENTREGADO',
  CANCELADO: 'CANCELADO',
});

const ETIQUETAS = Object.freeze({
  RECIBIDO: 'Recibido',
  PAGADO: 'Pago confirmado',
  EN_PREPARACION: 'En preparación',
  LISTO: 'Listo',
  DESPACHADO: 'Despachado',
  ENTREGADO: 'Entregado',
  CANCELADO: 'Cancelado',
});

const TRANSICIONES = Object.freeze({
  RECIBIDO: ['PAGADO', 'EN_PREPARACION', 'CANCELADO'],
  PAGADO: ['EN_PREPARACION', 'CANCELADO'],
  EN_PREPARACION: ['LISTO'],
  LISTO: ['DESPACHADO', 'ENTREGADO'],
  DESPACHADO: ['ENTREGADO'],
  ENTREGADO: [],
  CANCELADO: [],
});

// El stock se descuenta cuando el pedido se paga o se despacha/entrega (SC-02)
const DESCUENTAN_STOCK = new Set(['PAGADO', 'DESPACHADO', 'ENTREGADO']);

function puedeTransitar(actual, nuevo) {
  return (TRANSICIONES[actual] || []).includes(nuevo);
}

// Devuelve el movimiento de inventario que exige una transición
function movimientoInventario(pedido, nuevo) {
  if (nuevo === ESTADOS.CANCELADO && pedido.stockDescontado) return 'REINTEGRAR';
  if (DESCUENTAN_STOCK.has(nuevo) && !pedido.stockDescontado) return 'DESCONTAR';
  return null;
}

// Un pedido para recoger no pasa por "Despachado"
function transicionesValidas(pedido) {
  const base = TRANSICIONES[pedido.estado] || [];
  if (pedido.estado === 'LISTO') {
    return pedido.tipoEntrega === 'DOMICILIO' ? ['DESPACHADO'] : ['ENTREGADO'];
  }
  return base;
}

module.exports = { ESTADOS, ETIQUETAS, TRANSICIONES, puedeTransitar, movimientoInventario, transicionesValidas };
