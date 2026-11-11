// Carga inicial: armado de documentos e histórico de prueba (no necesita MongoDB)
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { construirDocumentos } = require('../../src/db/carga/armar-documentos');
const seed = require('../../src/repositories/memory/seed');

describe('Armado de documentos (embebidos y referencias)', () => {
  const datos = seed();
  const { docs, contadores } = construirDocumentos(datos);

  it('CA-01 una colección por entidad principal y las tablas hijas quedan embebidas', () => {
    assert.deepEqual(Object.keys(docs).sort(), ['administradores', 'categorias', 'clientes', 'mensajesSoporte', 'metodosPago',
      'movimientosInventario', 'pedidos', 'productos', 'zonas']);
    const total = (k) => docs.pedidos.reduce((n, p) => n + p[k].length, 0);
    assert.equal(total('detalles'), datos.detalles.length);
    assert.equal(total('historial'), datos.historial.length);
    assert.equal(total('pagos'), datos.pagos.length);
  });

  it('CA-02 conserva los ids y deja los contadores en el máximo', () => {
    assert.deepEqual(docs.pedidos.map((p) => p._id), datos.pedidos.map((p) => p.id));
    assert.equal(contadores.find((c) => c._id === 'pedidos').valor, Math.max(...datos.pedidos.map((p) => p.id)));
  });

  it('CA-03 copia los datos de las referencias extendidas', () => {
    const p = docs.pedidos.find((x) => x._id === 3);
    assert.equal(p.cliente.nombre, 'Andrés Pérez');
    assert.equal(p.zona.nombre, 'Envigado, Itagüí y Sabaneta');
    assert.equal(p.metodoPago.tipo, 'TRANSFERENCIA');
    assert.equal(p.detalles[0].producto, 'Galleta de Arequipe');
  });

  it('CA-04 normaliza fechas sin hora (Date local) y números decimales', () => {
    const base = seed();
    base.pedidos[0].fechaEntrega = new Date(2026, 10, 20);
    base.productos[0].precio = 6000.0;
    const { docs: d } = construirDocumentos(base);
    assert.equal(d.pedidos[0].fechaEntrega.toISOString(), '2026-11-20T00:00:00.000Z');
    assert.equal(d.productos[0].precio, 6000);
  });

  it('CA-05 un producto que no controla inventario no lleva inventario embebido', () => {
    assert.equal(docs.productos.find((p) => p._id === 6).inventario, null);
    assert.equal(docs.productos.find((p) => p._id === 5).inventario.stockActual, 0);
  });
});

describe('Histórico de prueba (npm run mongo:cargar)', () => {
  const { generarHistorico } = require('../../src/db/carga/historico');
  const { puedeTransitar } = require('../../src/domain/estados');
  const origen = seed();
  const ahora = new Date('2026-11-10T18:00:00');
  const { datos, resumen } = generarHistorico(origen, { clientes: 60, pedidos: 300, mensajes: 10, ahora });

  it('CA-06 agrega filas sin modificar el origen y los ids continúan la numeración', () => {
    assert.equal(origen.pedidos.length, 3);
    assert.equal(resumen.clientes, 60);
    assert.equal(resumen.pedidos, 300);
    assert.equal(Math.min(...datos.pedidos.slice(3).map((p) => p.id)), 4);
    assert.equal(new Set(datos.pedidos.map((p) => p.codigo)).size, datos.pedidos.length);
    assert.ok(datos.pedidos.every((p) => /^PC-[A-Z0-9]{4,10}$/.test(p.codigo)));
    assert.equal(new Set(datos.clientes.map((c) => c.correo)).size, datos.clientes.length);
  });

  it('CA-07 es determinista: la misma semilla produce los mismos datos', () => {
    const otra = generarHistorico(seed(), { clientes: 60, pedidos: 300, mensajes: 10, ahora }).datos;
    assert.deepEqual(otra.pedidos.map((p) => [p.codigo, p.valorTotal, p.estado]), datos.pedidos.map((p) => [p.codigo, p.valorTotal, p.estado]));
  });

  it('CA-08 totales, historial y pagos son coherentes con las reglas del negocio', () => {
    const det = new Map(); for (const x of datos.detalles) det.set(x.idPedido, (det.get(x.idPedido) || 0) + x.subtotal);
    for (const p of datos.pedidos) {
      assert.equal(det.get(p.id), p.valorSubtotal);
      assert.equal(p.valorTotal, p.valorSubtotal + p.valorDomicilio);
      const h = datos.historial.filter((x) => x.idPedido === p.id).sort((a, b) => a.id - b.id);
      assert.equal(h[0].estadoNuevo, 'RECIBIDO');
      for (let i = 1; i < h.length; i++) {
        assert.ok(puedeTransitar(h[i].estadoAnterior, h[i].estadoNuevo), `${p.codigo}: ${h[i].estadoAnterior} -> ${h[i].estadoNuevo}`);
        assert.ok(new Date(h[i].fecha) >= new Date(h[i - 1].fecha));
      }
      assert.equal(h[h.length - 1].estadoNuevo, p.estado);
    }
  });

  it('CA-09 el stock nunca queda negativo y los productos del origen conservan su stock actual', () => {
    const generados = datos.movimientos.filter((m) => m.id > origen.movimientos.length).sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
    const s = new Map();
    for (const m of generados) {
      const v = (s.get(m.idProducto) || 0) + (m.tipo === 'ENTRADA' || m.tipo === 'REINTEGRO' ? 1 : -1) * m.cantidad;
      assert.ok(v >= 0, `stock negativo en producto ${m.idProducto}`);
      s.set(m.idProducto, v);
    }
    for (const i of origen.inventario) {
      assert.equal(datos.inventario.find((x) => x.idProducto === i.idProducto).stockActual, i.stockActual);
      assert.equal(s.get(i.idProducto) || 0, 0);
    }
  });

  it('CA-10 el resultado se transforma en documentos válidos', () => {
    const { docs } = construirDocumentos(datos);
    assert.equal(docs.pedidos.length, 303);
    assert.ok(docs.pedidos.every((p) => p.detalles.length >= 1 && p.historial.length >= 1));
    assert.ok(docs.pedidos.filter((p) => p._id > 3).every((p) => p.pagos.length === 1));
  });
});
