// Controladores: traducen HTTP <-> servicios. No contienen reglas de negocio.
function createControllers(s) {
  const ok = (res, data, status = 200) => res.status(status).json({ data });

  const publico = {
    catalogo: async (req, res) => ok(res, await s.catalogo.catalogo({ q: req.query.q, categoria: req.query.categoria })),
    producto: async (req, res) => ok(res, await s.catalogo.producto(req.params.id)),
    config: async (req, res) => ok(res, await s.tienda.configPublica()),
    cotizar: async (req, res) => ok(res, await s.pedidos.cotizar(req.body || {})),
    registro: async (req, res) => ok(res, await s.auth.registrarCliente(req.body || {}), 201),
    login: async (req, res) => ok(res, await s.auth.loginCliente(req.body || {})),
    loginAdmin: async (req, res) => ok(res, await s.auth.loginAdmin(req.body || {})),
    soporte: async (req, res) => ok(res, await s.tienda.enviarMensaje(req.body || {}, req.usuario), 201),
  };

  const cliente = {
    perfil: async (req, res) => ok(res, await s.auth.perfil(req.usuario.sub)),
    crearPedido: async (req, res) => ok(res, await s.pedidos.crear(req.usuario.sub, req.body || {}), 201),
    misPedidos: async (req, res) => ok(res, await s.pedidos.misPedidos(req.usuario.sub)),
    miPedido: async (req, res) => ok(res, await s.pedidos.miPedido(req.usuario.sub, req.params.codigo)),
    referencia: async (req, res) => ok(res, await s.pedidos.registrarReferencia(req.usuario.sub, req.params.codigo, (req.body || {}).referencia)),
    cancelar: async (req, res) => ok(res, await s.pedidos.cancelarPorCliente(req.usuario.sub, req.params.codigo)),
    misMensajes: async (req, res) => ok(res, await s.tienda.misMensajes(req.usuario.sub)),
  };

  const admin = {
    resumen: async (req, res) => ok(res, await s.pedidos.resumen()),
    pedidos: async (req, res) => ok(res, await s.pedidos.listar({ estado: req.query.estado, desde: req.query.desde, hasta: req.query.hasta, q: req.query.q })),
    pedido: async (req, res) => ok(res, await s.pedidos.detalle(req.params.id)),
    cambiarEstado: async (req, res) => ok(res, await s.pedidos.cambiarEstado(req.params.id, req.body || {}, req.usuario.sub)),
    calendario: async (req, res) => ok(res, await s.pedidos.calendario({ mes: req.query.mes, campo: req.query.campo })),
    productos: async (req, res) => ok(res, await s.catalogo.listarAdmin({ q: req.query.q, categoria: req.query.categoria, visibilidad: req.query.visibilidad })),
    eliminarProducto: async (req, res) => ok(res, await s.catalogo.eliminar(req.params.id)),
    categorias: async (req, res) => ok(res, await s.catalogo.categorias()),
    crearProducto: async (req, res) => ok(res, await s.catalogo.crear(req.body || {}), 201),
    actualizarProducto: async (req, res) => ok(res, await s.catalogo.actualizar(req.params.id, req.body || {})),
    imagenProducto: async (req, res) => ok(res, await s.catalogo.subirImagen(req.params.id, (req.body || {}).imagen)),
    inventario: async (req, res) => ok(res, await s.catalogo.inventario()),
    ajustarStock: async (req, res) => ok(res, await s.catalogo.ajustarStock(req.params.idProducto, req.body || {}, req.usuario.sub)),
    movimientos: async (req, res) => ok(res, await s.catalogo.movimientos(req.query.idProducto)),
    pagos: async (req, res) => ok(res, await s.pedidos.pagos({ estado: req.query.estado })),
    confirmarPago: async (req, res) => ok(res, await s.pedidos.confirmarPago(req.params.id, req.usuario.sub)),
    rechazarPago: async (req, res) => ok(res, await s.pedidos.rechazarPago(req.params.id, req.usuario.sub)),
    metodos: async (req, res) => ok(res, await s.tienda.metodos()),
    guardarMetodo: async (req, res) => ok(res, await s.tienda.guardarMetodo({ ...req.body, id: req.params.id }), req.params.id ? 200 : 201),
    eliminarMetodo: async (req, res) => ok(res, await s.tienda.eliminarMetodo(req.params.id)),
    zonas: async (req, res) => ok(res, await s.tienda.zonas()),
    guardarZona: async (req, res) => ok(res, await s.tienda.guardarZona({ ...req.body, id: req.params.id }), req.params.id ? 200 : 201),
    eliminarZona: async (req, res) => ok(res, await s.tienda.eliminarZona(req.params.id)),
    mensajes: async (req, res) => ok(res, await s.tienda.mensajes({ estado: req.query.estado })),
    responder: async (req, res) => ok(res, await s.tienda.responder(req.params.id, (req.body || {}).respuesta)),
    clientes: async (req, res) => ok(res, await s.tienda.clientes({ q: req.query.q, ciudad: req.query.ciudad })),
    crearCliente: async (req, res) => ok(res, await s.tienda.crearCliente(req.body), 201),
    actualizarCliente: async (req, res) => ok(res, await s.tienda.actualizarCliente(req.params.id, req.body)),
    eliminarCliente: async (req, res) => ok(res, await s.tienda.eliminarCliente(req.params.id)),
    reportes: async (req, res) => ok(res, s.reportes.disponibles()),
    reporte: async (req, res) => ok(res, await s.reportes.generar(req.params.nombre, req.query)),
  };

  return { publico, cliente, admin };
}

module.exports = { createControllers };
