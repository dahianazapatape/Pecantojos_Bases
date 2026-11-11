// Pruebas unitarias de las reglas de negocio puras (sin base de datos ni HTTP)
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { puedeTransitar, movimientoInventario, transicionesValidas, ESTADOS } = require('../../src/domain/estados');
const { validarItems, validarFechaEntrega, calcularTotales, generarCodigo, hoyISO } = require('../../src/domain/pedido');

describe('Estados del pedido (RN-07 / SC-03)', () => {
  it('UT-01 permite el flujo completo de un domicilio', () => {
    const ruta = ['RECIBIDO', 'PAGADO', 'EN_PREPARACION', 'LISTO', 'DESPACHADO', 'ENTREGADO'];
    for (let i = 0; i < ruta.length - 1; i++) assert.ok(puedeTransitar(ruta[i], ruta[i + 1]), `${ruta[i]} -> ${ruta[i + 1]}`);
  });

  it('UT-02 rechaza saltos y retrocesos', () => {
    assert.equal(puedeTransitar('RECIBIDO', 'ENTREGADO'), false);
    assert.equal(puedeTransitar('LISTO', 'EN_PREPARACION'), false);
    assert.equal(puedeTransitar('ENTREGADO', 'CANCELADO'), false);
    assert.equal(puedeTransitar('CANCELADO', 'RECIBIDO'), false);
    assert.equal(puedeTransitar('INVENTADO', 'RECIBIDO'), false);
  });

  it('UT-03 solo se cancela antes de entrar a preparación', () => {
    assert.ok(puedeTransitar('RECIBIDO', 'CANCELADO'));
    assert.ok(puedeTransitar('PAGADO', 'CANCELADO'));
    assert.equal(puedeTransitar('EN_PREPARACION', 'CANCELADO'), false);
  });

  it('UT-04 un pedido para recoger pasa de Listo a Entregado sin Despachado', () => {
    assert.deepEqual(transicionesValidas({ estado: 'LISTO', tipoEntrega: 'RECOGER' }), ['ENTREGADO']);
    assert.deepEqual(transicionesValidas({ estado: 'LISTO', tipoEntrega: 'DOMICILIO' }), ['DESPACHADO']);
    assert.deepEqual(transicionesValidas({ estado: 'ENTREGADO', tipoEntrega: 'DOMICILIO' }), []);
  });
});

describe('Movimiento de inventario por transición (SC-02)', () => {
  it('UT-05 descuenta al pagar, despachar o entregar si aún no se descontó', () => {
    for (const e of [ESTADOS.PAGADO, ESTADOS.DESPACHADO, ESTADOS.ENTREGADO]) {
      assert.equal(movimientoInventario({ stockDescontado: false }, e), 'DESCONTAR');
    }
  });
  it('UT-06 no descuenta dos veces', () => {
    assert.equal(movimientoInventario({ stockDescontado: true }, 'DESPACHADO'), null);
    assert.equal(movimientoInventario({ stockDescontado: true }, 'ENTREGADO'), null);
  });
  it('UT-07 no mueve stock en preparación o listo', () => {
    assert.equal(movimientoInventario({ stockDescontado: false }, 'EN_PREPARACION'), null);
    assert.equal(movimientoInventario({ stockDescontado: false }, 'LISTO'), null);
  });
  it('UT-08 reintegra al cancelar solo si ya se había descontado', () => {
    assert.equal(movimientoInventario({ stockDescontado: true }, 'CANCELADO'), 'REINTEGRAR');
    assert.equal(movimientoInventario({ stockDescontado: false }, 'CANCELADO'), null);
  });
});

describe('Validación y cálculo del pedido (RN-01, RN-02, RN-06)', () => {
  it('UT-09 exige al menos un producto', () => {
    assert.throws(() => validarItems([]), { code: 'DATOS_INVALIDOS' });
    assert.throws(() => validarItems(undefined), { code: 'DATOS_INVALIDOS' });
  });
  it('UT-10 exige cantidades enteras positivas', () => {
    for (const cantidad of [0, -1, 1.5, 'abc', null]) {
      assert.throws(() => validarItems([{ idProducto: 1, cantidad }]), { code: 'DATOS_INVALIDOS' }, `cantidad ${cantidad}`);
    }
    assert.doesNotThrow(() => validarItems([{ idProducto: 1, cantidad: 3 }, { idProducto: 2, cantidad: '2' }]));
  });
  it('UT-11 rechaza productos repetidos', () => {
    assert.throws(() => validarItems([{ idProducto: 1, cantidad: 1 }, { idProducto: 1, cantidad: 2 }]), /repetidos/);
  });
  it('UT-12 suma subtotal y domicilio', () => {
    const r = calcularTotales([{ precioUnitario: 6000, cantidad: 2 }, { precioUnitario: 5500, cantidad: 1 }], 8000);
    assert.deepEqual(r, { subtotal: 17500, domicilio: 8000, total: 25500 });
    assert.deepEqual(calcularTotales([{ precioUnitario: 33000, cantidad: 1 }]), { subtotal: 33000, domicilio: 0, total: 33000 });
  });
  it('UT-13 la fecha de entrega no puede ser pasada', () => {
    const ahora = new Date(2026, 10, 10, 12);
    assert.throws(() => validarFechaEntrega('2026-11-09', ahora), /anterior a hoy/);
    assert.throws(() => validarFechaEntrega('10/11/2026', ahora), /AAAA-MM-DD/);
    assert.throws(() => validarFechaEntrega('', ahora), /obligatoria/);
    assert.doesNotThrow(() => validarFechaEntrega('2026-11-10', ahora));
    assert.equal(hoyISO(ahora), '2026-11-10');
  });
  it('UT-14 el código de seguimiento tiene el formato PC-XXXXXX sin caracteres ambiguos', () => {
    for (let i = 0; i < 200; i++) assert.match(generarCodigo(), /^PC-[A-HJ-NP-Z2-9]{6}$/);
    assert.equal(generarCodigo(() => 0), 'PC-AAAAAA');
  });
});
