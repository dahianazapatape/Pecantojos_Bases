// Pruebas de integración: levantan la aplicación Express completa y la recorren por HTTP
process.env.NODE_ENV = 'test';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const os = require('os');
const fs = require('fs');
const path = require('path');
const { createApp } = require('../../src/app');
const { createMemoryRepos } = require('../../src/repositories/memory');
const { hoyISO } = require('../../src/domain/pedido');

const manana = () => { const d = new Date(); d.setDate(d.getDate() + 1); return hoyISO(d); };

describe('API REST de Pecantojos', () => {
  let server; let base; let repos; let tokenCliente; let tokenAdmin;
  const llamar = async (ruta, { method = 'GET', body, token } = {}) => {
    const headers = {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`${base}/api${ruta}`, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
    return { status: res.status, json: await res.json().catch(() => null) };
  };

  // Con PC_TEST_MONGO=1 (tests/integration/api-mongo.test.js) la misma suite corre contra MongoDB real
  const conMongo = process.env.PC_TEST_MONGO === '1';
  before(async () => {
    repos = conMongo ? await require('../helpers/mongo').reposMongoDePrueba() : createMemoryRepos();
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-it-'));
    server = createApp({ repos, opciones: { catalogo: { uploadsDir: tmp } } }).listen(0);
    await new Promise((r) => server.once('listening', r));
    base = `http://127.0.0.1:${server.address().port}`;
  });
  after(async () => {
    server.close();
    if (conMongo) await require('../../src/db/mongo').closeMongo();
  });

  it('IT-01 GET /api/salud responde ok', async () => {
    const r = await llamar('/salud');
    assert.equal(r.status, 200);
    assert.equal(r.json.data.estado, 'ok');
  });

  it('IT-02 el catálogo público trae foto, descripción, precio y disponibilidad', async () => {
    const r = await llamar('/productos');
    assert.equal(r.status, 200);
    assert.ok(r.json.data.length >= 5);
    for (const p of r.json.data) {
      assert.ok(p.imagenUrl && p.descripcion && p.precio > 0 && p.disponibilidad, p.nombre);
      assert.equal(p.passwordHash, undefined);
    }
    assert.equal(r.json.data.find((p) => p.id === 5).disponibilidad, 'AGOTADO');
  });

  it('IT-03 la configuración pública trae zonas con valor y métodos de pago con sus datos', async () => {
    const r = await llamar('/config');
    assert.ok(r.json.data.zonas.every((z) => z.valor >= 0));
    const nequi = r.json.data.metodos.find((m) => m.nombre === 'Nequi');
    assert.ok(nequi.numeroCuenta && nequi.titular && nequi.instrucciones);
    assert.ok(r.json.data.whatsapp);
  });

  it('IT-04 las rutas de cliente y admin exigen sesión y rol', async () => {
    assert.equal((await llamar('/cliente/pedidos')).status, 401);
    assert.equal((await llamar('/admin/pedidos')).status, 401);
    tokenCliente = (await llamar('/auth/login', { method: 'POST', body: { correo: 'cliente@demo.com', password: 'Cliente123' } })).json.data.token;
    tokenAdmin = (await llamar('/auth/admin/login', { method: 'POST', body: { usuario: 'admin', password: 'Pecantojos2026!' } })).json.data.token;
    assert.equal((await llamar('/admin/pedidos', { token: tokenCliente })).status, 403);
    assert.equal((await llamar('/cliente/pedidos', { token: tokenAdmin })).status, 403);
    assert.equal((await llamar('/cliente/pedidos', { token: 'token-falso' })).status, 401);
  });

  it('IT-05 registro de cliente nuevo y correo duplicado', async () => {
    const body = { nombre: 'Camila Rivera', correo: 'camila@demo.com', telefono: '3105556677', password: 'Galletas2026' };
    const r = await llamar('/auth/registro', { method: 'POST', body });
    assert.equal(r.status, 201);
    assert.ok(r.json.data.token);
    const d = await llamar('/auth/registro', { method: 'POST', body });
    assert.equal(d.status, 409);
    assert.equal(d.json.error.code, 'CORREO_REGISTRADO');
  });

  it('IT-06 cotizar el carrito suma el domicilio antes del pago', async () => {
    const r = await llamar('/pedidos/cotizar', { method: 'POST', body: { items: [{ idProducto: 3, cantidad: 3 }], tipoEntrega: 'DOMICILIO', idZona: 3 } });
    assert.equal(r.status, 200);
    assert.equal(r.json.data.subtotal, 18000);
    assert.equal(r.json.data.domicilio, 10000);
    assert.equal(r.json.data.total, 28000);
  });

  let pedido;
  it('IT-07 el cliente crea un pedido y aparece en el panel administrativo', async () => {
    const r = await llamar('/cliente/pedidos', { method: 'POST', token: tokenCliente, body: {
      items: [{ idProducto: 3, cantidad: 3 }, { idProducto: 2, cantidad: 1 }], tipoEntrega: 'DOMICILIO', idZona: 1,
      direccionEntrega: 'Calle 50 # 40-10', fechaEntrega: manana(), idMetodoPago: 2, referenciaPago: 'DAVI-123',
    } });
    assert.equal(r.status, 201);
    pedido = r.json.data;
    assert.match(pedido.codigo, /^PC-/);
    assert.equal(pedido.valorTotal, 18000 + 5500 + 6000);
    const adm = await llamar('/admin/pedidos?estado=RECIBIDO', { token: tokenAdmin });
    assert.ok(adm.json.data.some((p) => p.codigo === pedido.codigo));
    const mios = await llamar('/cliente/pedidos', { token: tokenCliente });
    assert.ok(mios.json.data.some((p) => p.codigo === pedido.codigo));
  });

  it('IT-08 pedir más unidades que el stock devuelve 409 STOCK_INSUFICIENTE', async () => {
    const r = await llamar('/cliente/pedidos', { method: 'POST', token: tokenCliente, body: {
      items: [{ idProducto: 4, cantidad: 50 }], tipoEntrega: 'RECOGER', fechaEntrega: manana(), idMetodoPago: 1,
    } });
    assert.equal(r.status, 409);
    assert.equal(r.json.error.code, 'STOCK_INSUFICIENTE');
    assert.equal(r.json.error.details.disponible, 3);
  });

  it('IT-09 confirmar el pago descuenta el stock y avanza el seguimiento del cliente', async () => {
    const antes = (await llamar('/productos/3')).json.data.stock;
    const pagos = await llamar('/admin/pagos?estado=PENDIENTE', { token: tokenAdmin });
    const pago = pagos.json.data.find((g) => g.codigoPedido === pedido.codigo);
    assert.equal(pago.referencia, 'DAVI-123');
    const r = await llamar(`/admin/pagos/${pago.id}/confirmar`, { method: 'POST', token: tokenAdmin });
    assert.equal(r.status, 200);
    assert.equal(r.json.data.estado, 'PAGADO');
    assert.equal((await llamar('/productos/3')).json.data.stock, antes - 3);
    const seg = await llamar(`/cliente/pedidos/${pedido.codigo}`, { token: tokenCliente });
    assert.equal(seg.json.data.pasos.find((p) => p.estado === 'PAGADO').completado, true);
    const otra = await llamar(`/admin/pagos/${pago.id}/confirmar`, { method: 'POST', token: tokenAdmin });
    assert.equal(otra.status, 422);
  });

  it('IT-10 el administrador avanza el pedido hasta entregado y el stock no se descuenta de nuevo', async () => {
    const stock = (await llamar('/productos/3')).json.data.stock;
    for (const estado of ['EN_PREPARACION', 'LISTO', 'DESPACHADO', 'ENTREGADO']) {
      const r = await llamar(`/admin/pedidos/${pedido.id}/estado`, { method: 'PATCH', token: tokenAdmin, body: { estado } });
      assert.equal(r.status, 200, estado);
    }
    assert.equal((await llamar('/productos/3')).json.data.stock, stock);
    const seg = await llamar(`/cliente/pedidos/${pedido.codigo}`, { token: tokenCliente });
    assert.equal(seg.json.data.estado, 'ENTREGADO');
    assert.ok(seg.json.data.pasos.every((p) => p.completado));
    assert.equal(seg.json.data.historial.length, 6);
  });

  it('IT-11 una transición inválida responde 422', async () => {
    const r = await llamar('/admin/pedidos/1/estado', { method: 'PATCH', token: tokenAdmin, body: { estado: 'ENTREGADO' } });
    assert.equal(r.status, 422);
    assert.equal(r.json.error.code, 'TRANSICION_INVALIDA');
  });

  it('IT-12 el calendario lista los pedidos del mes con su detalle', async () => {
    const mes = pedido.fechaEntrega.slice(0, 7);
    const r = await llamar(`/admin/calendario?mes=${mes}&campo=entrega`, { token: tokenAdmin });
    assert.equal(r.status, 200);
    const delDia = r.json.data.dias[pedido.fechaEntrega];
    const p = delDia.find((x) => x.codigo === pedido.codigo);
    assert.equal(p.detalles.length, 2);
    assert.ok(p.cliente.telefono);
  });

  it('IT-13 el cliente cancela un pedido recién creado', async () => {
    const c = await llamar('/cliente/pedidos', { method: 'POST', token: tokenCliente, body: {
      items: [{ idProducto: 1, cantidad: 1 }], tipoEntrega: 'RECOGER', fechaEntrega: manana(), idMetodoPago: 4,
    } });
    const r = await llamar(`/cliente/pedidos/${c.json.data.codigo}/cancelar`, { method: 'POST', token: tokenCliente });
    assert.equal(r.status, 200);
    assert.equal(r.json.data.estado, 'CANCELADO');
  });

  it('IT-14 atención al cliente: el cliente escribe y el administrador responde', async () => {
    const m = await llamar('/soporte', { method: 'POST', token: tokenCliente, body: { asunto: 'Pedido grande', mensaje: 'Necesito 100 galletas para un evento' } });
    assert.equal(m.status, 201);
    assert.equal(m.json.data.correo, 'cliente@demo.com');
    const abiertos = await llamar('/admin/soporte?estado=ABIERTO', { token: tokenAdmin });
    assert.ok(abiertos.json.data.some((x) => x.id === m.json.data.id));
    await llamar(`/admin/soporte/${m.json.data.id}/responder`, { method: 'POST', token: tokenAdmin, body: { respuesta: 'Con gusto, te escribimos por WhatsApp' } });
    const mios = await llamar('/cliente/soporte', { token: tokenCliente });
    assert.equal(mios.json.data.find((x) => x.id === m.json.data.id).estado, 'RESPONDIDO');
  });

  it('IT-15 el administrador gestiona productos, inventario, métodos de pago y zonas', async () => {
    const p = await llamar('/admin/productos', { method: 'POST', token: tokenAdmin, body: { nombre: 'Galleta de Limón', precio: 5800, idCategoria: 1, descripcion: 'Con glaseado' } });
    assert.equal(p.status, 201);
    const aj = await llamar(`/admin/inventario/${p.json.data.id}`, { method: 'PUT', token: tokenAdmin, body: { stockNuevo: 15, motivo: 'Horneada' } });
    assert.equal(aj.status, 200);
    assert.equal((await llamar(`/productos/${p.json.data.id}`)).json.data.stock, 15);
    const img = await llamar(`/admin/productos/${p.json.data.id}/imagen`, { method: 'POST', token: tokenAdmin, body: { imagen: 'data:image/png;base64,iVBORw0KGgo=' } });
    assert.equal(img.status, 200);
    const m = await llamar('/admin/metodos-pago', { method: 'POST', token: tokenAdmin, body: { nombre: 'Bre-B', tipo: 'TRANSFERENCIA', banco: 'Bre-B', numeroCuenta: '@pecantojos' } });
    assert.equal(m.status, 201);
    const z = await llamar('/admin/zonas/2', { method: 'PUT', token: tokenAdmin, body: { nombre: 'Envigado e Itagüí', valor: 9000 } });
    assert.equal(z.json.data.valor, 9000);
    const res = await llamar('/admin/resumen', { token: tokenAdmin });
    assert.ok(res.json.data.ventasConfirmadas >= 29500);
  });

  it('IT-20 búsqueda y filtros: productos por texto sin tildes y categoría, pedidos por código y clientes por ciudad', async () => {
    const t = await llamar('/productos?q=NUTÉ');
    assert.deepEqual(t.json.data.map((p) => p.nombre), ['Galleta de Nutella']);
    const desc = await llamar('/productos?q=queso crema');
    assert.ok(desc.json.data.some((p) => p.nombre === 'Galleta Red Velvet'), 'busca también en la descripción');
    const cat = await llamar('/productos?categoria=2');
    assert.ok(cat.json.data.length >= 1 && cat.json.data.every((p) => p.categoria === 'Postres'));
    assert.equal((await llamar('/productos?categoria=abc')).status, 400);
    assert.equal((await llamar('/productos?q=(((')).status, 200, 'los caracteres especiales no rompen la búsqueda');
    const ped = await llamar('/admin/pedidos?q=demo03', { token: tokenAdmin });
    assert.deepEqual(ped.json.data.map((p) => p.codigo), ['PC-DEMO03']);
    const porCliente = await llamar('/admin/pedidos?q=andres', { token: tokenAdmin });
    assert.ok(porCliente.json.data.length >= 1 && porCliente.json.data.every((p) => p.cliente.nombre === 'Andrés Pérez'));
    const cli = await llamar('/admin/clientes?ciudad=envigado', { token: tokenAdmin });
    assert.deepEqual(cli.json.data.map((c) => c.nombre), ['Andrés Pérez']);
    assert.ok(cli.json.data[0].pedidos >= 1 && cli.json.data[0].totalComprado > 0, 'cada cliente trae sus pedidos y total comprado');
    assert.equal(cli.json.data[0].passwordHash, undefined);
    const vis = await llamar('/admin/productos?visibilidad=agotados', { token: tokenAdmin });
    assert.ok(vis.json.data.every((p) => ['AGOTADO', 'POCAS_UNIDADES'].includes(p.disponibilidad)));
  });

  it('IT-21 eliminar: solo lo que ningún pedido usa; lo demás se oculta o desactiva', async () => {
    assert.equal((await llamar('/admin/productos/1', { method: 'DELETE' })).status, 401);
    const usado = await llamar('/admin/productos/1', { method: 'DELETE', token: tokenAdmin });
    assert.equal(usado.status, 409);
    assert.equal(usado.json.error.code, 'PRODUCTO_CON_PEDIDOS');
    assert.ok((await llamar('/productos/1')).status === 200, 'el producto con pedidos sigue existiendo');
    const nuevo = await llamar('/admin/productos', { method: 'POST', token: tokenAdmin, body: { nombre: 'Galleta de prueba', precio: 4000, idCategoria: 1 } });
    const del = await llamar(`/admin/productos/${nuevo.json.data.id}`, { method: 'DELETE', token: tokenAdmin });
    assert.equal(del.status, 200);
    assert.equal((await llamar(`/productos/${nuevo.json.data.id}`)).status, 404);
    assert.equal((await llamar(`/admin/productos/${nuevo.json.data.id}`, { method: 'DELETE', token: tokenAdmin })).status, 404);
    assert.equal((await llamar('/admin/zonas/1', { method: 'DELETE', token: tokenAdmin })).json.error.code, 'ZONA_EN_USO');
    const z = await llamar('/admin/zonas', { method: 'POST', token: tokenAdmin, body: { nombre: 'Zona temporal', valor: 5000 } });
    assert.equal((await llamar(`/admin/zonas/${z.json.data.id}`, { method: 'DELETE', token: tokenAdmin })).status, 200);
    assert.ok(!(await llamar('/admin/zonas', { token: tokenAdmin })).json.data.some((x) => x.id === z.json.data.id));
    assert.equal((await llamar('/admin/metodos-pago/1', { method: 'DELETE', token: tokenAdmin })).json.error.code, 'METODO_EN_USO');
    const m = await llamar('/admin/metodos-pago', { method: 'POST', token: tokenAdmin, body: { nombre: 'Pago de prueba', tipo: 'EFECTIVO' } });
    assert.equal((await llamar(`/admin/metodos-pago/${m.json.data.id}`, { method: 'DELETE', token: tokenAdmin })).status, 200);
  });

  it('IT-22 clientes: registrar, editar (con validaciones) y eliminar solo si no tiene pedidos', async () => {
    assert.equal((await llamar('/admin/clientes', { method: 'POST', body: {} })).status, 401);
    const malo = await llamar('/admin/clientes', { method: 'POST', token: tokenAdmin, body: { nombre: 'Al', correo: 'x', telefono: '12' } });
    assert.equal(malo.status, 400);
    const dup = await llamar('/admin/clientes', { method: 'POST', token: tokenAdmin, body: { nombre: 'Otra Laura', correo: 'CLIENTE@demo.com', telefono: '3000000001' } });
    assert.equal(dup.json.error.code, 'CORREO_REGISTRADO');
    const nuevo = await llamar('/admin/clientes', { method: 'POST', token: tokenAdmin, body: { nombre: 'Marta Ríos', correo: 'marta@ejemplo.com', telefono: '300 555 1234', ciudad: 'Bello' } });
    assert.equal(nuevo.status, 201);
    assert.equal(nuevo.json.data.telefono, '3005551234');
    assert.equal(nuevo.json.data.passwordHash, undefined);
    const id = nuevo.json.data.id;
    const ed = await llamar(`/admin/clientes/${id}`, { method: 'PUT', token: tokenAdmin, body: { nombre: 'Marta Ríos Henao', correo: 'marta@ejemplo.com', telefono: '3005551234', ciudad: 'Envigado' } });
    assert.equal(ed.json.data.ciudad, 'Envigado');
    assert.equal((await llamar(`/admin/clientes/${id}`, { method: 'PUT', token: tokenAdmin, body: { nombre: 'Marta', correo: 'andres@demo.com', telefono: '3005551234' } })).status, 409);
    assert.equal((await llamar('/admin/clientes?q=rios henao', { token: tokenAdmin })).json.data.length, 1);
    const conPedidos = await llamar('/admin/clientes/1', { method: 'DELETE', token: tokenAdmin });
    assert.equal(conPedidos.status, 409);
    assert.equal(conPedidos.json.error.code, 'CLIENTE_CON_PEDIDOS');
    assert.equal((await llamar(`/admin/clientes/${id}`, { method: 'DELETE', token: tokenAdmin })).status, 200);
    assert.equal((await llamar(`/admin/clientes/${id}`, { method: 'DELETE', token: tokenAdmin })).status, 404);
    // Un cliente registrado por la tienda activa su cuenta al crearla con el mismo correo
    await llamar('/admin/clientes', { method: 'POST', token: tokenAdmin, body: { nombre: 'Pedro Gil', correo: 'pedro@ejemplo.com', telefono: '3001112233' } });
    const reg = await llamar('/auth/registro', { method: 'POST', body: { nombre: 'Pedro Gil', correo: 'pedro@ejemplo.com', telefono: '3001112233', password: 'Clave1234' } });
    assert.equal(reg.status, 201);
  });

  it('IT-16 errores de formato: JSON inválido y ruta inexistente', async () => {
    const r = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{malo' });
    assert.equal(r.status, 400);
    assert.equal((await llamar('/no-existe')).status, 404);
  });
});
