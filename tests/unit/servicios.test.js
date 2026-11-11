// Pruebas unitarias de los servicios con repositorios en memoria
const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const os = require('os');
const fs = require('fs');
const path = require('path');
const { createMemoryRepos } = require('../../src/repositories/memory');
const { createAuthService } = require('../../src/services/authService');
const { createCatalogoService, disponibilidad } = require('../../src/services/catalogoService');
const { createPedidoService, pasosSeguimiento } = require('../../src/services/pedidoService');
const { createTiendaService } = require('../../src/services/tiendaService');
const { hoyISO } = require('../../src/domain/pedido');

const manana = () => { const d = new Date(); d.setDate(d.getDate() + 1); return hoyISO(d); };

describe('Disponibilidad del producto (HU-06)', () => {
  it('UT-15 clasifica según stock y estado', () => {
    assert.equal(disponibilidad({ activo: true, controlaInventario: true, stock: 20 }), 'DISPONIBLE');
    assert.equal(disponibilidad({ activo: true, controlaInventario: true, stock: 5 }), 'POCAS_UNIDADES');
    assert.equal(disponibilidad({ activo: true, controlaInventario: true, stock: 0 }), 'AGOTADO');
    assert.equal(disponibilidad({ activo: true, controlaInventario: false, stock: null }), 'DISPONIBLE');
    assert.equal(disponibilidad({ activo: false, controlaInventario: true, stock: 10 }), 'NO_DISPONIBLE');
  });
});

describe('Cuentas de cliente y sesión (HU-11, CU-11)', () => {
  let auth;
  beforeEach(() => { auth = createAuthService(createMemoryRepos()); });

  it('UT-16 registra un cliente y devuelve token sin exponer la contraseña', async () => {
    const r = await auth.registrarCliente({ nombre: 'Sofía Ruiz', correo: 'SOFIA@correo.com', telefono: '300 111 2233', password: 'Galleta2026' });
    assert.ok(r.token);
    assert.equal(r.cliente.correo, 'sofia@correo.com');
    assert.equal(r.cliente.passwordHash, undefined);
    const login = await auth.loginCliente({ correo: 'sofia@correo.com', password: 'Galleta2026' });
    assert.equal(auth.verificar(login.token).rol, 'cliente');
  });
  it('UT-17 valida los datos del registro', async () => {
    const base = { nombre: 'Sofía Ruiz', correo: 's@correo.com', telefono: '3001112233', password: 'Galleta2026' };
    await assert.rejects(auth.registrarCliente({ ...base, correo: 'no-es-correo' }), /correo no es válido/);
    await assert.rejects(auth.registrarCliente({ ...base, telefono: '12' }), /teléfono/);
    await assert.rejects(auth.registrarCliente({ ...base, password: 'corta1' }), /8 caracteres/);
    await assert.rejects(auth.registrarCliente({ ...base, password: 'sinnumeros' }), /letras y números/);
    await assert.rejects(auth.registrarCliente({ ...base, correo: 'cliente@demo.com' }), { code: 'CORREO_REGISTRADO' });
  });
  it('UT-18 rechaza credenciales incorrectas con un mensaje genérico', async () => {
    await assert.rejects(auth.loginCliente({ correo: 'cliente@demo.com', password: 'otra' }), { status: 401, message: 'Correo o contraseña incorrectos' });
    await assert.rejects(auth.loginCliente({ correo: 'nadie@demo.com', password: 'otra' }), { status: 401, message: 'Correo o contraseña incorrectos' });
    await assert.rejects(auth.loginAdmin({ usuario: 'admin', password: 'x' }), { status: 401 });
    const a = await auth.loginAdmin({ usuario: 'admin', password: 'Pecantojos2026!' });
    assert.equal(auth.verificar(a.token).rol, 'admin');
  });
  it('UT-19 un cliente migrado sin contraseña activa su cuenta al registrarse', async () => {
    const repos = createMemoryRepos();
    repos._db.clientes.push({ id: 99, nombre: 'Cliente Antiguo', correo: 'antiguo@demo.com', telefono: '3000000000', passwordHash: null });
    const s = createAuthService(repos);
    await assert.rejects(s.loginCliente({ correo: 'antiguo@demo.com', password: 'Cualquiera1' }), { status: 401 });
    const r = await s.registrarCliente({ nombre: 'Cliente Antiguo', correo: 'antiguo@demo.com', telefono: '3000000000', password: 'Nueva2026' });
    assert.equal(r.cliente.id, 99);
  });
  it('UT-20 un token alterado no es válido', () => {
    assert.throws(() => auth.verificar('abc.def.ghi'), { status: 401 });
  });
});

describe('Pedidos, pagos e inventario (HU-02 a HU-09, HU-12, HU-13)', () => {
  let repos; let pedidos;
  beforeEach(() => { repos = createMemoryRepos(); pedidos = createPedidoService(repos); });
  const stock = (id) => repos._db.inventario.find((i) => i.idProducto === id).stockActual;
  const nuevo = (extra = {}) => pedidos.crear(1, {
    items: [{ idProducto: 1, cantidad: 2 }, { idProducto: 6, cantidad: 1 }], tipoEntrega: 'DOMICILIO', idZona: 2,
    direccionEntrega: 'Calle 1 # 2-3', fechaEntrega: manana(), idMetodoPago: 1, referenciaPago: 'N111', ...extra,
  });

  it('UT-21 la cotización usa precios del servidor y suma el domicilio de la zona', async () => {
    const c = await pedidos.cotizar({ items: [{ idProducto: 1, cantidad: 2, precioUnitario: 1 }], tipoEntrega: 'DOMICILIO', idZona: 2 });
    assert.equal(c.subtotal, 12000);
    assert.equal(c.domicilio, 8000);
    assert.equal(c.total, 20000);
    const r = await pedidos.cotizar({ items: [{ idProducto: 1, cantidad: 2 }], tipoEntrega: 'RECOGER' });
    assert.equal(r.domicilio, 0);
  });
  it('UT-22 la cotización rechaza más unidades que el stock y productos agotados', async () => {
    await assert.rejects(pedidos.cotizar({ items: [{ idProducto: 4, cantidad: 4 }] }), { code: 'STOCK_INSUFICIENTE' });
    await assert.rejects(pedidos.cotizar({ items: [{ idProducto: 5, cantidad: 1 }] }), { code: 'STOCK_INSUFICIENTE' });
    await assert.rejects(pedidos.cotizar({ items: [{ idProducto: 999, cantidad: 1 }] }), { code: 'PRODUCTO_NO_DISPONIBLE' });
    await assert.rejects(pedidos.cotizar({ items: [{ idProducto: 1, cantidad: 1 }], tipoEntrega: 'DOMICILIO' }), /zona/);
  });
  it('UT-23 crear el pedido NO descuenta inventario', async () => {
    const p = await nuevo();
    assert.equal(p.estado, 'RECIBIDO');
    assert.equal(p.valorTotal, 12000 + 33000 + 8000);
    assert.equal(p.pagos[0].estado, 'PENDIENTE');
    assert.equal(stock(1), 24);
  });
  it('UT-24 confirmar el pago descuenta inventario una sola vez', async () => {
    const p = await nuevo();
    const r = await pedidos.confirmarPago(p.pagos[0].id, 1);
    assert.equal(r.estado, 'PAGADO');
    assert.equal(stock(1), 22);
    await pedidos.cambiarEstado(p.id, { estado: 'EN_PREPARACION' }, 1);
    await pedidos.cambiarEstado(p.id, { estado: 'LISTO' }, 1);
    await pedidos.cambiarEstado(p.id, { estado: 'DESPACHADO' }, 1);
    const fin = await pedidos.cambiarEstado(p.id, { estado: 'ENTREGADO' }, 1);
    assert.equal(fin.estado, 'ENTREGADO');
    assert.equal(stock(1), 22);
    assert.equal(repos._db.movimientos.filter((m) => m.idPedido === p.id).length, 1, 'la caja surtida no controla inventario');
  });
  it('UT-25 un pedido en efectivo descuenta inventario al despacharse', async () => {
    const p = await nuevo({ idMetodoPago: 4, referenciaPago: '' });
    await pedidos.cambiarEstado(p.id, { estado: 'EN_PREPARACION' }, 1);
    await pedidos.cambiarEstado(p.id, { estado: 'LISTO' }, 1);
    assert.equal(stock(1), 24);
    const d = await pedidos.cambiarEstado(p.id, { estado: 'DESPACHADO' }, 1);
    assert.equal(d.stockDescontado, true);
    assert.equal(stock(1), 22);
  });
  it('UT-26 cancelar un pedido pagado reintegra las unidades', async () => {
    const p = await nuevo();
    await pedidos.confirmarPago(p.pagos[0].id, 1);
    assert.equal(stock(1), 22);
    const c = await pedidos.cambiarEstado(p.id, { estado: 'CANCELADO', nota: 'Cliente desistió' }, 1);
    assert.equal(c.estado, 'CANCELADO');
    assert.equal(stock(1), 24);
    assert.ok(repos._db.movimientos.some((m) => m.tipo === 'REINTEGRO' && m.idPedido === p.id));
  });
  it('UT-27 si no hay stock al confirmar, nada cambia (transacción)', async () => {
    const p = await pedidos.crear(1, { items: [{ idProducto: 4, cantidad: 3 }], tipoEntrega: 'RECOGER', fechaEntrega: manana(), idMetodoPago: 1 });
    repos._db.inventario.find((i) => i.idProducto === 4).stockActual = 1;
    await assert.rejects(pedidos.confirmarPago(p.pagos[0].id, 1), { code: 'STOCK_INSUFICIENTE' });
    const d = await pedidos.detalle(p.id);
    assert.equal(d.estado, 'RECIBIDO');
    assert.equal(d.pagos[0].estado, 'PENDIENTE');
    assert.equal(stock(4), 1);
  });
  it('UT-28 rechaza transiciones inválidas con código TRANSICION_INVALIDA', async () => {
    const p = await nuevo();
    await assert.rejects(pedidos.cambiarEstado(p.id, { estado: 'ENTREGADO' }, 1), { code: 'TRANSICION_INVALIDA', status: 422 });
    await assert.rejects(pedidos.cambiarEstado(9999, { estado: 'PAGADO' }, 1), { status: 404 });
  });
  it('UT-29 el cliente solo ve y cancela sus propios pedidos', async () => {
    const p = await nuevo();
    await assert.rejects(pedidos.miPedido(2, p.codigo), { status: 404 });
    const c = await pedidos.cancelarPorCliente(1, p.codigo);
    assert.equal(c.estado, 'CANCELADO');
    await assert.rejects(pedidos.cancelarPorCliente(1, 'PC-DEMO02'), { status: 403 });
  });
  it('UT-30 el cliente puede registrar el comprobante después', async () => {
    const p = await nuevo({ referenciaPago: '' });
    const r = await pedidos.registrarReferencia(1, p.codigo, 'NEQ-7788');
    assert.equal(r.pagos[0].referencia, 'NEQ-7788');
    await assert.rejects(pedidos.registrarReferencia(1, p.codigo, '1'), /comprobante/);
  });
  it('UT-31 valida dirección, método de pago y fecha', async () => {
    await assert.rejects(nuevo({ direccionEntrega: '' }), /dirección/);
    await assert.rejects(nuevo({ idMetodoPago: 999 }), /método de pago/);
    await assert.rejects(nuevo({ fechaEntrega: '2020-01-01' }), /anterior a hoy/);
  });
  it('UT-32 los pasos de seguimiento muestran el progreso y el pago contra entrega', () => {
    const p = { estado: 'EN_PREPARACION', tipoEntrega: 'RECOGER', historial: [{ estadoNuevo: 'RECIBIDO' }, { estadoNuevo: 'EN_PREPARACION' }], pagos: [] };
    const pasos = pasosSeguimiento(p);
    assert.deepEqual(pasos.map((x) => x.estado), ['RECIBIDO', 'PAGADO', 'EN_PREPARACION', 'LISTO', 'ENTREGADO']);
    assert.equal(pasos[1].omitido, true);
    assert.equal(pasos[2].actual, true);
    assert.equal(pasos[3].completado, false);
  });
  it('UT-33 el calendario agrupa por fecha del pedido o de entrega', async () => {
    const p = await nuevo();
    const mesEntrega = p.fechaEntrega.slice(0, 7);
    const porEntrega = await pedidos.calendario({ mes: mesEntrega, campo: 'entrega' });
    assert.ok(porEntrega.dias[p.fechaEntrega].some((x) => x.codigo === p.codigo));
    assert.ok(porEntrega.dias[p.fechaEntrega][0].detalles.length > 0, 'incluye el detalle');
    const hoy = hoyISO();
    const porPedido = await pedidos.calendario({ mes: hoy.slice(0, 7), campo: 'pedido' });
    assert.ok(porPedido.dias[hoy].some((x) => x.codigo === p.codigo));
    await assert.rejects(pedidos.calendario({ mes: hoy.slice(0, 7), campo: 'otro' }), { status: 400 });
  });
});

describe('Productos, inventario y atención (HU-05, HU-10, HU-12 a HU-14)', () => {
  let repos; let cat; let tienda; let tmp;
  beforeEach(() => {
    repos = createMemoryRepos();
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-'));
    cat = createCatalogoService(repos, { uploadsDir: tmp });
    tienda = createTiendaService(repos);
  });

  it('UT-34 crea productos válidos y rechaza precio o nombre inválidos', async () => {
    const p = await cat.crear({ nombre: 'Galleta de Avena', precio: 5000, idCategoria: 1 });
    assert.equal(p.stock, 0);
    assert.equal(p.disponibilidad, 'AGOTADO');
    await assert.rejects(cat.crear({ nombre: 'X', precio: 5000 }), /nombre/);
    await assert.rejects(cat.crear({ nombre: 'Galleta', precio: 0 }), /precio/);
  });
  it('UT-35 un producto inactivo no aparece en el catálogo público', async () => {
    await cat.actualizar(1, { activo: false });
    assert.equal((await cat.catalogo()).some((p) => p.id === 1), false);
    await assert.rejects(cat.producto(1), { status: 404 });
    assert.equal((await cat.listarAdmin()).some((p) => p.id === 1), true);
  });
  it('UT-36 el ajuste manual de stock queda registrado', async () => {
    await cat.ajustarStock(5, { stockNuevo: 12, motivo: 'Horneada del día' }, 1);
    assert.equal((await cat.producto(5)).stock, 12);
    const m = await cat.movimientos(5);
    assert.equal(m[0].tipo, 'ENTRADA');
    assert.equal(m[0].cantidad, 12);
    await assert.rejects(cat.ajustarStock(5, { stockNuevo: -1, motivo: 'x' }, 1), /entero/);
    await assert.rejects(cat.ajustarStock(5, { stockNuevo: 3, motivo: '' }, 1), /motivo/);
  });
  it('UT-37 sube imágenes válidas y rechaza otros formatos', async () => {
    const png = `data:image/png;base64,${Buffer.from('89504e470d0a1a0a', 'hex').toString('base64')}`;
    const p = await cat.subirImagen(2, png);
    assert.match(p.imagenUrl, /^\/uploads\/producto-2-\d+\.png$/);
    assert.ok(fs.existsSync(path.join(tmp, path.basename(p.imagenUrl))));
    await assert.rejects(cat.subirImagen(2, 'data:text/plain;base64,aGVsbG8='), /PNG, JPG o WEBP/);
  });
  it('UT-38 los mensajes de atención al cliente se validan y se responden', async () => {
    await assert.rejects(tienda.enviarMensaje({ nombre: 'Ana', correo: 'mal', asunto: 'Hola', mensaje: 'Necesito ayuda con mi pedido' }), /correo/);
    const m = await tienda.enviarMensaje({ nombre: 'Ana Ríos', correo: 'ana@correo.com', asunto: 'Pedido', mensaje: 'Quiero cambiar la dirección', codigoPedido: 'pc-demo01' });
    assert.equal(m.idPedido, 1);
    const r = await tienda.responder(m.id, 'Claro, ya la cambiamos');
    assert.equal(r.estado, 'RESPONDIDO');
  });
  it('UT-39 valida métodos de pago y zonas', async () => {
    await assert.rejects(tienda.guardarMetodo({ nombre: 'Bancolombia', tipo: 'TRANSFERENCIA' }), /cuenta/);
    await assert.rejects(tienda.guardarMetodo({ nombre: 'Cripto', tipo: 'OTRO' }), /tipo/);
    const m = await tienda.guardarMetodo({ nombre: 'Efectivo en local', tipo: 'EFECTIVO' });
    assert.equal(m.requiereReferencia, false);
    const t = await tienda.guardarMetodo({ nombre: 'Datáfono', tipo: 'TARJETA' });
    assert.equal(t.requiereReferencia, false, 'la tarjeta no pide cuenta ni comprobante');
    await assert.rejects(tienda.guardarZona({ nombre: 'Rionegro', valor: -1 }), /valor/);
    const z = await tienda.guardarZona({ id: 1, nombre: 'Medellín centro', valor: 7000 });
    assert.equal(z.valor, 7000);
  });
});

describe('Reglas de eliminación', () => {
  it('UT-40 no deja eliminar el último método de pago activo', async () => {
    const repos = createMemoryRepos({ empty: true });
    const tienda = createTiendaService(repos);
    const unico = await repos.metodos.guardar({ nombre: 'Efectivo', tipo: 'EFECTIVO', activo: true });
    await assert.rejects(tienda.eliminarMetodo(unico.id), (e) => e.code === 'ULTIMO_METODO');
    await repos.metodos.guardar({ nombre: 'Nequi', tipo: 'BILLETERA', numeroCuenta: '300', activo: true });
    assert.equal((await tienda.eliminarMetodo(unico.id)).eliminado, true);
  });
  it('UT-41 la búsqueda de productos rechaza textos de más de 60 caracteres y categorías inválidas', async () => {
    const catalogo = createCatalogoService(createMemoryRepos());
    await assert.rejects(catalogo.catalogo({ q: 'x'.repeat(61) }), /60/);
    await assert.rejects(catalogo.catalogo({ categoria: '-3' }), /categoría/);
    assert.ok((await catalogo.catalogo({ q: 'arequipe' })).length === 1);
  });
});
