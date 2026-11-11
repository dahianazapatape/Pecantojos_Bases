// Pruebas propias de MongoDB: transacciones, validadores, índices y reportes.
//   PC_TEST_MONGO_URI="mongodb+srv://..." npm run test:mongo
process.env.NODE_ENV = 'test';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');

const uri = process.env.PC_TEST_MONGO_URI;
if (uri) {
  process.env.MONGODB_URI = uri;
  process.env.MONGODB_DB = 'pecantojos_test_mongo';
}

describe('MongoDB: modelo, transacciones y reportes (opcional)', { skip: !uri && 'define PC_TEST_MONGO_URI para ejecutarla' }, () => {
  let repos; let db; let s;
  const manana = () => { const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10); };

  before(async () => {
    repos = await require('../helpers/mongo').reposMongoDePrueba();
    db = await require('../../src/db/mongo').getDb();
    s = require('../../src/services/pedidoService').createPedidoService(repos);
  });
  after(() => require('../../src/db/mongo').closeMongo());

  it('MG-01 el pedido guarda detalle, historial y pago embebidos y la referencia extendida del cliente', async () => {
    const d = await db.collection('pedidos').findOne({ _id: 1 });
    assert.equal(d.detalles.length, 2);
    assert.equal(d.historial[0].estadoNuevo, 'RECIBIDO');
    assert.equal(d.pagos[0].metodoPago, 'Nequi');
    assert.deepEqual(Object.keys(d.cliente).sort(), ['_id', 'correo', 'nombre', 'telefono']);
    assert.ok(d.fechaEntrega instanceof Date);
  });

  it('MG-02 el producto embebe su inventario y una copia del nombre de la categoría', async () => {
    const p = await db.collection('productos').findOne({ _id: 1 });
    assert.equal(p.inventario.stockActual, 24);
    assert.deepEqual(p.categoria, { _id: 1, nombre: 'Galletas' });
    assert.equal((await db.collection('productos').findOne({ _id: 6 })).inventario, null);
  });

  it('MG-03 la transacción se deshace completa si un producto no tiene stock', async () => {
    // Pedido con Nutella (hay stock) + Brownie (solo 3): luego se deja el Brownie en 0
    const p = await s.crear(1, { items: [{ idProducto: 1, cantidad: 2 }, { idProducto: 4, cantidad: 2 }], tipoEntrega: 'RECOGER', fechaEntrega: manana(), idMetodoPago: 1 });
    await repos.inventario.ajustar({ idProducto: 4, stockNuevo: 0, motivo: 'prueba', idAdmin: 1 });
    const antes = (await repos.productos.buscarPorId(1)).stock;
    const movsAntes = await db.collection('movimientosInventario').countDocuments();
    await assert.rejects(() => s.confirmarPago(p.pagos[0].id, 1), (e) => e.code === 'STOCK_INSUFICIENTE');
    assert.equal((await repos.productos.buscarPorId(1)).stock, antes, 'el descuento de Nutella se revirtió');
    assert.equal(await db.collection('movimientosInventario').countDocuments(), movsAntes, 'no quedaron movimientos sueltos');
    const despues = await repos.pedidos.buscarPorId(p.id);
    assert.equal(despues.estado, 'RECIBIDO');
    assert.equal(despues.historial.length, 1, 'tampoco quedó el cambio de estado');
  });

  it('MG-04 el validador $jsonSchema rechaza datos que la API nunca debería enviar', async () => {
    const malos = [
      () => db.collection('productos').insertOne({ _id: 900, nombre: 'Gratis', precio: 0, activo: true, controlaInventario: false }),
      () => db.collection('productos').updateOne({ _id: 1 }, { $set: { 'inventario.stockActual': -1 } }),
      () => db.collection('pedidos').updateOne({ _id: 1 }, { $set: { estado: 'PERDIDO' } }),
      () => db.collection('pedidos').updateOne({ _id: 1 }, { $set: { detalles: [] } }),
      () => db.collection('clientes').insertOne({ _id: 900, nombre: 'Sin correo', telefono: '300', correo: 'no-es-correo', fechaRegistro: new Date() }),
    ];
    for (const f of malos) await assert.rejects(f, (e) => e.code === 121);
  });

  it('MG-05 el correo es único sin importar mayúsculas (índice con collation)', async () => {
    assert.equal((await repos.clientes.buscarPorCorreo('CLIENTE@DEMO.COM')).id, 1);
    await assert.rejects(() => repos.clientes.crear({ nombre: 'Copia', telefono: '3000000000', correo: 'Cliente@Demo.com', passwordHash: 'x' }),
      (e) => e.code === 'CORREO_REGISTRADO');
  });

  it('MG-06 los ids nuevos continúan la numeración migrada', async () => {
    const z = await repos.zonas.guardar({ nombre: 'Rionegro', valor: 15000 });
    assert.equal(z.id, 4);
  });

  it('MG-07 reportes con Aggregation Pipeline', async () => {
    const top = await repos.reportes.productosMasVendidos({ limite: 3 });
    assert.ok(top.length > 0 && top.length <= 3);
    assert.ok(top[0].unidades >= top[top.length - 1].unidades);
    assert.ok(top.every((x) => x.categoria && x.producto));

    const meses = await repos.reportes.ventasPorMes();
    assert.ok(meses.every((m) => /^\d{4}-\d{2}$/.test(m.mes) && m.ventas > 0));

    const zonas = await repos.reportes.pedidosPorZona();
    assert.ok(zonas.some((z) => z.zona === 'Recoge en tienda'));

    const clientes = await repos.reportes.mejoresClientes();
    assert.equal(clientes[0].ciudad, 'Medellín');

    const cats = await repos.reportes.ventasPorCategoria();
    assert.ok(cats.length >= 1 && cats.every((c) => c.categoria && c.unidades > 0 && c.pedidos > 0));
    assert.equal(cats.reduce((t, c) => t + c.unidades, 0), top.length ? (await repos.reportes.productosMasVendidos({ limite: 50 })).reduce((t, x) => t + x.unidades, 0) : 0);

    const estados = await repos.reportes.pedidosPorEstado();
    assert.equal(estados.reduce((n, e) => n + e.pedidos, 0), await db.collection('pedidos').countDocuments());

    const pagos = await repos.reportes.pagosPorMetodo();
    assert.ok(pagos.find((p) => p.metodo === 'Transferencia Bancolombia').confirmado >= 31000);

    const demanda = await repos.reportes.inventarioVsDemanda();
    assert.ok(demanda.every((d) => d.faltante === Math.max(0, d.comprometido - d.stockActual)));
  });

  it('MG-09 eliminar un producto con pedidos se rechaza dentro de una transacción y no borra nada', async () => {
    const antes = await db.collection('productos').countDocuments();
    const r = await repos.productos.eliminar(1);
    assert.equal(r.eliminado, false);
    assert.ok(r.usos >= 1);
    assert.equal(await db.collection('productos').countDocuments(), antes);
  });

  it('MG-10 la búsqueda ignora mayúsculas y tildes y escapa caracteres especiales', async () => {
    assert.equal((await repos.productos.listar({ q: 'NUTÉLLA' })).length, 1);
    assert.equal((await repos.productos.listar({ q: '.*' })).length, 0);
    assert.equal((await repos.clientes.listar({ q: 'perez' }))[0].nombre, 'Andrés Pérez');
  });

  it('MG-11 editar un cliente actualiza la copia embebida en sus pedidos (referencia extendida)', async () => {
    await repos.clientes.actualizar(2, { nombre: 'Andrés Pérez Gómez', correo: 'andres@demo.com', telefono: '3017654321', direccion: 'Carrera 48 # 30 Sur-15', ciudad: 'Envigado' });
    const p = await db.collection('pedidos').findOne({ 'cliente._id': 2 });
    assert.equal(p.cliente.nombre, 'Andrés Pérez Gómez');
    const r = await repos.clientes.eliminar(2);
    assert.equal(r.eliminado, false);
    assert.ok(await db.collection('clientes').findOne({ _id: 2 }));
    await repos.clientes.actualizar(2, { nombre: 'Andrés Pérez', correo: 'andres@demo.com', telefono: '3017654321', direccion: 'Carrera 48 # 30 Sur-15', ciudad: 'Envigado' });
  });

  it('MG-08 el servicio de reportes valida filtros', async () => {
    const r = require('../../src/services/reporteService').createReporteService(repos);
    await assert.rejects(() => r.generar('inventado'), (e) => e.status === 404);
    await assert.rejects(() => r.generar('ventasPorMes', { desde: '2026/01/01' }), (e) => e.status === 400);
    await assert.rejects(() => r.generar('mejoresClientes', { limite: '500' }), (e) => e.status === 400);
    const ok = await r.generar('ventasPorMes', { desde: '2020-01-01', hasta: '2099-12-31' });
    assert.ok(Array.isArray(ok.filas));
  });
});
