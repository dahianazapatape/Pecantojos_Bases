// Datos base de Pecantojos: catálogo, zonas, métodos de pago, administradora y dos clientes de demostración.
// Los usa el modo demo (memoria) y la carga inicial de MongoDB (npm run mongo:cargar).
const bcrypt = require('bcryptjs');

function addDays(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function haceDias(n, hora = 10) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(hora, 15, 0, 0);
  return d.toISOString();
}

module.exports = function seed() {
  const ahora = new Date().toISOString();
  return {
    categorias: [
      { id: 1, nombre: 'Galletas' },
      { id: 2, nombre: 'Postres' },
    ],
    productos: [
      { id: 1, idCategoria: 1, nombre: 'Galleta de Nutella', descripcion: 'Galleta artesanal rellena de Nutella, crocante por fuera y suave por dentro.', precio: 6000, imagenUrl: '/img/productos/nutella.svg', activo: true, controlaInventario: true },
      { id: 2, idCategoria: 1, nombre: 'Galleta de Arequipe', descripcion: 'Masa de mantequilla con centro de arequipe casero.', precio: 5500, imagenUrl: '/img/productos/arequipe.svg', activo: true, controlaInventario: true },
      { id: 3, idCategoria: 1, nombre: 'Galleta de Oreo', descripcion: 'Galleta de vainilla con trozos de Oreo y chips de chocolate blanco.', precio: 6000, imagenUrl: '/img/productos/oreo.svg', activo: true, controlaInventario: true },
      { id: 4, idCategoria: 1, nombre: 'Galleta Brownie', descripcion: 'Galleta de chocolate intenso con textura de brownie.', precio: 6500, imagenUrl: '/img/productos/brownie.svg', activo: true, controlaInventario: true },
      { id: 5, idCategoria: 1, nombre: 'Galleta Red Velvet', descripcion: 'Galleta red velvet con relleno de queso crema.', precio: 6500, imagenUrl: '/img/productos/redvelvet.svg', activo: true, controlaInventario: true },
      { id: 6, idCategoria: 2, nombre: 'Caja surtida x6', descripcion: 'Seis galletas a elección del día, ideal para regalar.', precio: 33000, imagenUrl: '/img/productos/caja.svg', activo: true, controlaInventario: false },
    ],
    inventario: [
      { idProducto: 1, stockActual: 24, fechaActualizacion: ahora },
      { idProducto: 2, stockActual: 18, fechaActualizacion: ahora },
      { idProducto: 3, stockActual: 20, fechaActualizacion: ahora },
      { idProducto: 4, stockActual: 3, fechaActualizacion: ahora },
      { idProducto: 5, stockActual: 0, fechaActualizacion: ahora },
    ],
    admins: [
      { id: 1, nombre: 'Administradora Pecantojos', usuario: 'admin', passwordHash: bcrypt.hashSync('Pecantojos2026!', 8) },
    ],
    clientes: [
      { id: 1, nombre: 'Laura Gómez', correo: 'cliente@demo.com', telefono: '3001234567', direccion: 'Calle 10 # 43-20', ciudad: 'Medellín', passwordHash: bcrypt.hashSync('Cliente123', 8), fechaRegistro: ahora },
      { id: 2, nombre: 'Andrés Pérez', correo: 'andres@demo.com', telefono: '3017654321', direccion: 'Carrera 48 # 30 Sur-15', ciudad: 'Envigado', passwordHash: bcrypt.hashSync('Cliente123', 8), fechaRegistro: ahora },
    ],
    zonas: [
      { id: 1, nombre: 'Medellín (comunas centrales)', valor: 6000, activo: true },
      { id: 2, nombre: 'Envigado, Itagüí y Sabaneta', valor: 8000, activo: true },
      { id: 3, nombre: 'Bello y otras zonas del área metropolitana', valor: 10000, activo: true },
    ],
    metodos: [
      { id: 1, nombre: 'Nequi', tipo: 'BILLETERA', banco: 'Nequi', titular: 'Pecantojos', numeroCuenta: '300 000 0000', instrucciones: 'Envía el valor total al número Nequi y escribe el número de comprobante.', requiereReferencia: true, activo: true },
      { id: 2, nombre: 'Daviplata', tipo: 'BILLETERA', banco: 'Daviplata', titular: 'Pecantojos', numeroCuenta: '300 000 0000', instrucciones: 'Envía el valor total al número Daviplata y escribe el número de comprobante.', requiereReferencia: true, activo: true },
      { id: 3, nombre: 'Transferencia Bancolombia', tipo: 'TRANSFERENCIA', banco: 'Bancolombia', titular: 'Pecantojos S.A.S.', numeroCuenta: 'Ahorros 000-000000-00', instrucciones: 'Transfiere a la cuenta de ahorros y escribe el número de la transacción.', requiereReferencia: true, activo: true },
      { id: 4, nombre: 'Efectivo contra entrega', tipo: 'EFECTIVO', banco: '', titular: '', numeroCuenta: '', instrucciones: 'Paga en efectivo al recibir el pedido. Ten el valor exacto si es posible.', requiereReferencia: false, activo: true },
      { id: 5, nombre: 'Tarjeta débito o crédito', tipo: 'TARJETA', banco: '', titular: '', numeroCuenta: '', instrucciones: 'Paga con tarjeta en el datáfono al recibir o al recoger el pedido.', requiereReferencia: false, activo: true },
    ],
    pedidos: [
      { id: 1, codigo: 'PC-DEMO01', idCliente: 1, fechaPedido: haceDias(1, 15), fechaEntrega: addDays(2), tipoEntrega: 'DOMICILIO', idZona: 1, direccionEntrega: 'Calle 10 # 43-20, Medellín', valorSubtotal: 24000, valorDomicilio: 6000, valorTotal: 30000, idMetodoPago: 1, estado: 'RECIBIDO', stockDescontado: false, observaciones: 'Para un cumpleaños' },
      { id: 2, codigo: 'PC-DEMO02', idCliente: 1, fechaPedido: haceDias(3, 11), fechaEntrega: addDays(4), tipoEntrega: 'RECOGER', idZona: null, direccionEntrega: null, valorSubtotal: 33000, valorDomicilio: 0, valorTotal: 33000, idMetodoPago: 4, estado: 'EN_PREPARACION', stockDescontado: false, observaciones: '' },
      { id: 3, codigo: 'PC-DEMO03', idCliente: 2, fechaPedido: haceDias(6, 9), fechaEntrega: addDays(-4), tipoEntrega: 'DOMICILIO', idZona: 2, direccionEntrega: 'Carrera 48 # 30 Sur-15, Envigado', valorSubtotal: 23000, valorDomicilio: 8000, valorTotal: 31000, idMetodoPago: 3, estado: 'ENTREGADO', stockDescontado: true, observaciones: '' },
    ],
    detalles: [
      { id: 1, idPedido: 1, idProducto: 1, cantidad: 2, precioUnitario: 6000, subtotal: 12000 },
      { id: 2, idPedido: 1, idProducto: 3, cantidad: 2, precioUnitario: 6000, subtotal: 12000 },
      { id: 3, idPedido: 2, idProducto: 6, cantidad: 1, precioUnitario: 33000, subtotal: 33000 },
      { id: 4, idPedido: 3, idProducto: 2, cantidad: 2, precioUnitario: 5500, subtotal: 11000 },
      { id: 5, idPedido: 3, idProducto: 1, cantidad: 2, precioUnitario: 6000, subtotal: 12000 },
    ],
    historial: [
      { id: 1, idPedido: 1, estadoAnterior: null, estadoNuevo: 'RECIBIDO', idAdmin: null, nota: 'Pedido registrado por el cliente', fecha: haceDias(1, 15) },
      { id: 2, idPedido: 2, estadoAnterior: null, estadoNuevo: 'RECIBIDO', idAdmin: null, nota: 'Pedido registrado por el cliente', fecha: haceDias(3, 11) },
      { id: 3, idPedido: 2, estadoAnterior: 'RECIBIDO', estadoNuevo: 'EN_PREPARACION', idAdmin: 1, nota: '', fecha: ahora },
      { id: 4, idPedido: 3, estadoAnterior: null, estadoNuevo: 'RECIBIDO', idAdmin: null, nota: 'Pedido registrado por el cliente', fecha: haceDias(6, 9) },
      { id: 5, idPedido: 3, estadoAnterior: 'RECIBIDO', estadoNuevo: 'PAGADO', idAdmin: 1, nota: 'Pago confirmado', fecha: haceDias(6, 10) },
      { id: 6, idPedido: 3, estadoAnterior: 'PAGADO', estadoNuevo: 'EN_PREPARACION', idAdmin: 1, nota: '', fecha: haceDias(5, 8) },
      { id: 7, idPedido: 3, estadoAnterior: 'EN_PREPARACION', estadoNuevo: 'LISTO', idAdmin: 1, nota: '', fecha: haceDias(4, 9) },
      { id: 8, idPedido: 3, estadoAnterior: 'LISTO', estadoNuevo: 'DESPACHADO', idAdmin: 1, nota: '', fecha: haceDias(4, 11) },
      { id: 9, idPedido: 3, estadoAnterior: 'DESPACHADO', estadoNuevo: 'ENTREGADO', idAdmin: 1, nota: 'Recibió la portería', fecha: haceDias(4, 12) },
    ],
    pagos: [
      { id: 1, idPedido: 1, idMetodoPago: 1, valor: 30000, referencia: 'M1234567', estado: 'PENDIENTE', fechaPago: haceDias(1, 15), fechaConfirmacion: null, idAdmin: null },
      { id: 2, idPedido: 3, idMetodoPago: 3, valor: 31000, referencia: 'TRX-55102', estado: 'CONFIRMADO', fechaPago: haceDias(6, 9), fechaConfirmacion: haceDias(6, 10), idAdmin: 1 },
    ],
    movimientos: [
      { id: 1, idProducto: 2, tipo: 'SALIDA', cantidad: 2, motivo: 'Pedido 3', idPedido: 3, idAdmin: 1, fecha: haceDias(6, 10) },
      { id: 2, idProducto: 1, tipo: 'SALIDA', cantidad: 2, motivo: 'Pedido 3', idPedido: 3, idAdmin: 1, fecha: haceDias(6, 10) },
    ],
    mensajes: [
      { id: 1, idCliente: 1, nombre: 'Laura Gómez', correo: 'cliente@demo.com', asunto: '¿Hacen galletas sin azúcar?', mensaje: 'Quisiera saber si tienen opciones sin azúcar para un pedido grande.', idPedido: null, estado: 'ABIERTO', respuesta: null, fecha: haceDias(0, 9), fechaRespuesta: null },
    ],
  };
};
