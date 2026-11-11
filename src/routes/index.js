// Rutas de la API REST
//   /api/...          públicas (catálogo, configuración, registro, login, soporte)
//   /api/cliente/...  requieren sesión de cliente
//   /api/admin/...    requieren sesión de administrador
const express = require('express');
const { requiereRol, sesionOpcional, h } = require('../middleware');

function createRouter(c) {
  const api = express.Router();

  api.get('/salud', (req, res) => res.json({ data: { estado: 'ok', hora: new Date().toISOString() } }));
  api.get('/productos', h(c.publico.catalogo));
  api.get('/productos/:id', h(c.publico.producto));
  api.get('/config', h(c.publico.config));
  api.post('/pedidos/cotizar', h(c.publico.cotizar));
  api.post('/auth/registro', h(c.publico.registro));
  api.post('/auth/login', h(c.publico.login));
  api.post('/auth/admin/login', h(c.publico.loginAdmin));
  api.post('/soporte', sesionOpcional, h(c.publico.soporte));

  const cli = express.Router();
  cli.use(requiereRol('cliente'));
  cli.get('/perfil', h(c.cliente.perfil));
  cli.get('/pedidos', h(c.cliente.misPedidos));
  cli.post('/pedidos', h(c.cliente.crearPedido));
  cli.get('/pedidos/:codigo', h(c.cliente.miPedido));
  cli.post('/pedidos/:codigo/pago', h(c.cliente.referencia));
  cli.post('/pedidos/:codigo/cancelar', h(c.cliente.cancelar));
  cli.get('/soporte', h(c.cliente.misMensajes));
  api.use('/cliente', cli);

  const adm = express.Router();
  adm.use(requiereRol('admin'));
  adm.get('/resumen', h(c.admin.resumen));
  adm.get('/pedidos', h(c.admin.pedidos));
  adm.get('/pedidos/:id', h(c.admin.pedido));
  adm.patch('/pedidos/:id/estado', h(c.admin.cambiarEstado));
  adm.get('/calendario', h(c.admin.calendario));
  adm.get('/productos', h(c.admin.productos));
  adm.get('/categorias', h(c.admin.categorias));
  adm.post('/productos', h(c.admin.crearProducto));
  adm.put('/productos/:id', h(c.admin.actualizarProducto));
  adm.delete('/productos/:id', h(c.admin.eliminarProducto));
  adm.post('/productos/:id/imagen', h(c.admin.imagenProducto));
  adm.get('/inventario', h(c.admin.inventario));
  adm.get('/inventario/movimientos', h(c.admin.movimientos));
  adm.put('/inventario/:idProducto', h(c.admin.ajustarStock));
  adm.get('/pagos', h(c.admin.pagos));
  adm.post('/pagos/:id/confirmar', h(c.admin.confirmarPago));
  adm.post('/pagos/:id/rechazar', h(c.admin.rechazarPago));
  adm.get('/metodos-pago', h(c.admin.metodos));
  adm.post('/metodos-pago', h(c.admin.guardarMetodo));
  adm.put('/metodos-pago/:id', h(c.admin.guardarMetodo));
  adm.delete('/metodos-pago/:id', h(c.admin.eliminarMetodo));
  adm.get('/zonas', h(c.admin.zonas));
  adm.post('/zonas', h(c.admin.guardarZona));
  adm.put('/zonas/:id', h(c.admin.guardarZona));
  adm.delete('/zonas/:id', h(c.admin.eliminarZona));
  adm.get('/soporte', h(c.admin.mensajes));
  adm.post('/soporte/:id/responder', h(c.admin.responder));
  adm.get('/clientes', h(c.admin.clientes));
  adm.post('/clientes', h(c.admin.crearCliente));
  adm.put('/clientes/:id', h(c.admin.actualizarCliente));
  adm.delete('/clientes/:id', h(c.admin.eliminarCliente));
  adm.get('/reportes', h(c.admin.reportes));
  adm.get('/reportes/:nombre', h(c.admin.reporte));
  api.use('/admin', adm);

  return api;
}

module.exports = { createRouter };
