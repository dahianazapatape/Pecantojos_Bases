// HU-14 atención al cliente y configuración de zonas (HU-12) y métodos de pago (HU-13)
const config = require('../config');
const { badRequest, notFound, conflict, AppError } = require('../utils/errors');

const CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const TIPOS_METODO = ['BILLETERA', 'TRANSFERENCIA', 'TARJETA', 'EFECTIVO'];
const SIN_CUENTA = ['TARJETA', 'EFECTIVO'];

const CIUDADES_CLIENTE = 60;
function validarCliente(d) {
  const nombre = String(d.nombre || '').trim();
  const correo = String(d.correo || '').trim().toLowerCase();
  const telefono = String(d.telefono || '').replace(/\s/g, '');
  const direccion = String(d.direccion || '').trim();
  const ciudad = String(d.ciudad || '').trim();
  if (nombre.length < 3 || nombre.length > 80) throw badRequest('Escribe el nombre completo del cliente (3 a 80 caracteres)');
  if (!CORREO.test(correo)) throw badRequest('El correo no es válido');
  if (!/^\d{7,15}$/.test(telefono)) throw badRequest('El teléfono debe tener entre 7 y 15 dígitos');
  if (direccion.length > 120) throw badRequest('La dirección puede tener máximo 120 caracteres');
  if (ciudad.length > CIUDADES_CLIENTE) throw badRequest('La ciudad puede tener máximo 60 caracteres');
  return { nombre, correo, telefono, direccion, ciudad };
}

function createTiendaService(repos) {
  return {
    async configPublica() {
      const [zonas, metodos, categorias] = await Promise.all([
        repos.zonas.listar({ soloActivos: true }), repos.metodos.listar({ soloActivos: true }), repos.productos.categorias(),
      ]);
      return {
        whatsapp: config.whatsapp,
        horario: 'Lunes a sábado, 9:00 a.m. a 7:00 p.m.',
        correo: 'hola@pecantojos.com',
        zonas, metodos, categorias,
      };
    },

    // ---- Atención al cliente ----
    async enviarMensaje(body, usuario) {
      let { nombre, correo } = body;
      if (usuario && usuario.rol === 'cliente') {
        const c = await repos.clientes.buscarPorId(usuario.sub);
        if (c) { nombre = c.nombre; correo = c.correo; }
      }
      nombre = String(nombre || '').trim();
      correo = String(correo || '').trim();
      const asunto = String(body.asunto || '').trim();
      const mensaje = String(body.mensaje || '').trim();
      if (nombre.length < 3) throw badRequest('Escribe tu nombre');
      if (!CORREO.test(correo)) throw badRequest('Escribe un correo válido para responderte');
      if (asunto.length < 3) throw badRequest('Escribe el asunto');
      if (mensaje.length < 10) throw badRequest('Cuéntanos un poco más (mínimo 10 caracteres)');
      let idPedido = null;
      if (body.codigoPedido) {
        const p = await repos.pedidos.buscarPorCodigo(String(body.codigoPedido).trim().toUpperCase());
        if (p) idPedido = p.id;
      }
      return repos.soporte.crear({
        idCliente: usuario && usuario.rol === 'cliente' ? usuario.sub : null,
        nombre, correo, asunto: asunto.slice(0, 120), mensaje: mensaje.slice(0, 1000), idPedido,
      });
    },
    misMensajes(idCliente) { return repos.soporte.listarPorCliente(idCliente); },
    mensajes(filtros) { return repos.soporte.listar(filtros); },
    async responder(id, respuesta) {
      respuesta = String(respuesta || '').trim();
      if (respuesta.length < 2) throw badRequest('Escribe la respuesta');
      const m = await repos.soporte.responder(id, respuesta.slice(0, 1000));
      if (!m) throw notFound('Mensaje no encontrado');
      return m;
    },

    // ---- Zonas de domicilio ----
    zonas() { return repos.zonas.listar(); },
    async guardarZona(d) {
      const nombre = String(d.nombre || '').trim();
      const valor = Number(d.valor);
      if (nombre.length < 3) throw badRequest('Escribe el nombre de la zona');
      if (!Number.isFinite(valor) || valor < 0) throw badRequest('El valor del domicilio debe ser cero o mayor');
      const z = await repos.zonas.guardar({ id: d.id, nombre, valor: Math.round(valor), activo: d.activo !== false });
      if (!z) throw notFound('Zona no encontrada');
      return z;
    },

    // ---- Métodos de pago ----
    metodos() { return repos.metodos.listar(); },
    async guardarMetodo(d) {
      const nombre = String(d.nombre || '').trim();
      if (nombre.length < 3) throw badRequest('Escribe el nombre del método de pago');
      if (!TIPOS_METODO.includes(d.tipo)) throw badRequest('El tipo debe ser BILLETERA, TRANSFERENCIA, TARJETA o EFECTIVO');
      if (!SIN_CUENTA.includes(d.tipo) && !String(d.numeroCuenta || '').trim()) throw badRequest('Escribe el número de cuenta o celular');
      const m = await repos.metodos.guardar({
        id: d.id, nombre, tipo: d.tipo, banco: String(d.banco || '').trim(), titular: String(d.titular || '').trim(),
        numeroCuenta: String(d.numeroCuenta || '').trim(), instrucciones: String(d.instrucciones || '').trim(),
        requiereReferencia: !SIN_CUENTA.includes(d.tipo) && d.requiereReferencia !== false, activo: d.activo !== false,
      });
      if (!m) throw notFound('Método de pago no encontrado');
      return m;
    },

    clientes({ q, ciudad } = {}) {
      if (String(q || '').length > 60 || String(ciudad || '').length > 60) throw badRequest('La búsqueda puede tener máximo 60 caracteres');
      return repos.clientes.listar({ q: String(q || '').trim(), ciudad: String(ciudad || '').trim() });
    },
    // La tienda registra clientes que piden por WhatsApp o teléfono (sin contraseña). Si después la
    // persona crea su cuenta en la tienda con el mismo correo, la cuenta se activa (authService).
    async crearCliente(d) {
      const datos = validarCliente(d);
      if (await repos.clientes.buscarPorCorreo(datos.correo)) throw conflict('CORREO_REGISTRADO', 'Ya existe un cliente con ese correo');
      const { passwordHash, ...c } = await repos.clientes.crear({ ...datos, passwordHash: null });
      return c;
    },
    async actualizarCliente(id, d) {
      const datos = validarCliente(d);
      const otro = await repos.clientes.buscarPorCorreo(datos.correo);
      if (otro && otro.id !== Number(id)) throw conflict('CORREO_REGISTRADO', 'Ya existe otra cuenta con ese correo');
      const r = await repos.clientes.actualizar(id, datos);
      if (!r) throw notFound('Cliente no encontrado');
      const { passwordHash, ...c } = r;
      return c;
    },
    // Regla: un cliente con pedidos no se elimina, porque los pedidos son el historial de ventas
    async eliminarCliente(id) {
      const r = await repos.clientes.eliminar(id);
      if (!r) throw notFound('Cliente no encontrado');
      if (!r.eliminado) throw conflict('CLIENTE_CON_PEDIDOS', `${r.cliente.nombre} tiene ${r.usos} pedido(s) registrados; no se puede eliminar porque se perdería el historial de ventas.`, { usos: r.usos });
      return { eliminado: true, id: r.cliente.id, nombre: r.cliente.nombre };
    },

    // Regla: una zona o un método de pago que algún pedido ya usó no se elimina (se desactiva),
    // y siempre debe quedar al menos un método de pago activo para que los clientes puedan pagar.
    async eliminarZona(id) {
      if (!repos.zonas.eliminar) throw new AppError(501, 'NO_DISPONIBLE', 'Eliminar requiere la base MongoDB');
      const r = await repos.zonas.eliminar(id);
      if (!r) throw notFound('Zona no encontrada');
      if (!r.eliminado) throw conflict('ZONA_EN_USO', `La zona “${r.item.nombre}” se usó en ${r.usos} pedido(s). Desmárcala como activa en lugar de eliminarla.`, { usos: r.usos });
      return { eliminado: true, id: r.item.id, nombre: r.item.nombre };
    },
    async eliminarMetodo(id) {
      if (!repos.metodos.eliminar) throw new AppError(501, 'NO_DISPONIBLE', 'Eliminar requiere la base MongoDB');
      const m = await repos.metodos.buscarPorId(id);
      if (!m) throw notFound('Método de pago no encontrado');
      if (m.activo && (await repos.metodos.listar({ soloActivos: true })).length <= 1) {
        throw conflict('ULTIMO_METODO', 'Debe quedar al menos un método de pago activo para que los clientes puedan pagar');
      }
      const r = await repos.metodos.eliminar(id);
      if (!r.eliminado) throw conflict('METODO_EN_USO', `“${r.item.nombre}” se usó en ${r.usos} pedido(s). Desmárcalo como activo en lugar de eliminarlo.`, { usos: r.usos });
      return { eliminado: true, id: r.item.id, nombre: r.item.nombre };
    },
  };
}

module.exports = { createTiendaService };
