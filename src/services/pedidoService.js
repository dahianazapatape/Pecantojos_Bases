// HU-02 carrito (cotización), HU-03 registrar pedido, HU-04 consultar pedidos y resumen,
// HU-07 estados, HU-08 seguimiento, HU-09 calendario, HU-12 domicilio, HU-13 pagos
const { validarItems, validarFechaEntrega, calcularTotales, generarCodigo, hoyISO } = require('../domain/pedido');
const { ETIQUETAS, ESTADOS, transicionesValidas, movimientoInventario } = require('../domain/estados');
const { badRequest, notFound, conflict, unprocessable, forbidden } = require('../utils/errors');

// Pasos que ve el cliente en la barra de progreso
function pasosSeguimiento(pedido) {
  const ruta = pedido.tipoEntrega === 'DOMICILIO'
    ? ['RECIBIDO', 'PAGADO', 'EN_PREPARACION', 'LISTO', 'DESPACHADO', 'ENTREGADO']
    : ['RECIBIDO', 'PAGADO', 'EN_PREPARACION', 'LISTO', 'ENTREGADO'];
  const vistos = new Set((pedido.historial || []).map((h) => h.estadoNuevo));
  if (pedido.pagos && pedido.pagos.some((g) => g.estado === 'CONFIRMADO')) vistos.add('PAGADO');
  const idx = ruta.indexOf(pedido.estado);
  return ruta.map((e, i) => {
    // Un pedido en efectivo puede pasar a preparación sin pago previo
    const omitido = e === 'PAGADO' && !vistos.has(e) && i < idx;
    return {
      estado: e,
      etiqueta: omitido ? 'Pago contra entrega' : ETIQUETAS[e],
      completado: pedido.estado !== 'CANCELADO' && !omitido && (vistos.has(e) || i <= idx),
      omitido,
      actual: e === pedido.estado,
    };
  });
}

function decorar(pedido) {
  if (!pedido) return pedido;
  return {
    ...pedido,
    etiquetaEstado: ETIQUETAS[pedido.estado],
    siguientes: transicionesValidas(pedido).map((e) => ({ estado: e, etiqueta: ETIQUETAS[e] })),
    pasos: pedido.detalles ? pasosSeguimiento(pedido) : undefined,
  };
}

function createPedidoService(repos, { rand = Math.random, ahora = () => new Date() } = {}) {
  // Calcula líneas y totales con precios del servidor; no confía en el navegador
  async function cotizar({ items, tipoEntrega = 'RECOGER', idZona }) {
    validarItems(items);
    const lineas = [];
    for (const it of items) {
      const p = await repos.productos.buscarPorId(it.idProducto);
      if (!p || !p.activo) throw unprocessable('PRODUCTO_NO_DISPONIBLE', 'Uno de los productos ya no está disponible');
      const cantidad = Number(it.cantidad);
      if (p.controlaInventario && p.stock < cantidad) {
        throw conflict('STOCK_INSUFICIENTE', `Solo quedan ${p.stock} unidades de ${p.nombre}`, { idProducto: p.id, disponible: p.stock });
      }
      lineas.push({ idProducto: p.id, producto: p.nombre, imagenUrl: p.imagenUrl, cantidad, precioUnitario: p.precio, subtotal: p.precio * cantidad });
    }
    let zona = null;
    if (tipoEntrega === 'DOMICILIO') {
      if (!idZona) throw badRequest('Selecciona la zona del domicilio');
      zona = await repos.zonas.buscarPorId(idZona);
      if (!zona || !zona.activo) throw badRequest('La zona de domicilio no está disponible');
    } else if (tipoEntrega !== 'RECOGER') {
      throw badRequest('El tipo de entrega debe ser DOMICILIO o RECOGER');
    }
    const totales = calcularTotales(lineas, zona ? zona.valor : 0);
    return { lineas, zona, tipoEntrega, ...totales };
  }

  async function codigoUnico() {
    for (let i = 0; i < 10; i++) {
      const c = generarCodigo(rand);
      if (!(await repos.pedidos.existeCodigo(c))) return c;
    }
    throw new Error('No fue posible generar un código de seguimiento');
  }

  async function obtener(id) {
    const p = await repos.pedidos.buscarPorId(id);
    if (!p) throw notFound('Pedido no encontrado');
    return p;
  }

  async function transitar(pedido, nuevo, idAdmin, nota) {
    if (!transicionesValidas(pedido).includes(nuevo)) {
      throw unprocessable('TRANSICION_INVALIDA', `No se puede pasar de "${ETIQUETAS[pedido.estado]}" a "${ETIQUETAS[nuevo] || nuevo}"`);
    }
    return repos.pedidos.aplicarTransicion({
      idPedido: pedido.id, estadoAnterior: pedido.estado, estadoNuevo: nuevo, idAdmin, nota, movimiento: movimientoInventario(pedido, nuevo),
    });
  }

  return {
    cotizar,

    async crear(idCliente, body) {
      const cot = await cotizar(body);
      validarFechaEntrega(body.fechaEntrega, ahora());
      const metodo = body.idMetodoPago && await repos.metodos.buscarPorId(body.idMetodoPago);
      if (!metodo || !metodo.activo) throw badRequest('Selecciona un método de pago disponible');
      const direccion = String(body.direccionEntrega || '').trim();
      if (cot.tipoEntrega === 'DOMICILIO' && direccion.length < 5) throw badRequest('Escribe la dirección de entrega');
      const referencia = String(body.referenciaPago || '').trim();
      const pedido = {
        codigo: await codigoUnico(),
        idCliente,
        fechaEntrega: body.fechaEntrega,
        tipoEntrega: cot.tipoEntrega,
        idZona: cot.zona ? cot.zona.id : null,
        direccionEntrega: cot.tipoEntrega === 'DOMICILIO' ? direccion : null,
        valorSubtotal: cot.subtotal,
        valorDomicilio: cot.domicilio,
        valorTotal: cot.total,
        idMetodoPago: metodo.id,
        estado: ESTADOS.RECIBIDO,
        observaciones: String(body.observaciones || '').trim().slice(0, 300),
      };
      const detalles = cot.lineas.map(({ idProducto, cantidad, precioUnitario, subtotal }) => ({ idProducto, cantidad, precioUnitario, subtotal }));
      const pago = { idMetodoPago: metodo.id, valor: cot.total, referencia: referencia || null, estado: 'PENDIENTE' };
      return decorar(await repos.pedidos.crear({ pedido, detalles, pago }));
    },

    async misPedidos(idCliente) {
      return (await repos.pedidos.listar({ idCliente })).map(decorar);
    },
    async miPedido(idCliente, codigo) {
      const p = await repos.pedidos.buscarPorCodigo(codigo);
      if (!p || p.idCliente !== Number(idCliente)) throw notFound('No encontramos ese pedido en tu cuenta');
      return decorar(p);
    },
    async registrarReferencia(idCliente, codigo, referencia) {
      const p = await this.miPedido(idCliente, codigo);
      referencia = String(referencia || '').trim();
      if (referencia.length < 4) throw badRequest('Escribe el número de comprobante');
      if (p.estado === 'CANCELADO') throw unprocessable('PEDIDO_CANCELADO', 'El pedido está cancelado');
      const pendiente = p.pagos.find((g) => g.estado === 'PENDIENTE');
      if (pendiente) await repos.pagos.actualizarReferencia(pendiente.id, referencia);
      else if (!p.pagos.some((g) => g.estado === 'CONFIRMADO')) {
        await repos.pagos.crear({ idPedido: p.id, idMetodoPago: p.idMetodoPago, valor: p.valorTotal, referencia, estado: 'PENDIENTE' });
      } else throw unprocessable('PAGO_CONFIRMADO', 'El pago de este pedido ya fue confirmado');
      return this.miPedido(idCliente, codigo);
    },
    async cancelarPorCliente(idCliente, codigo) {
      const p = await this.miPedido(idCliente, codigo);
      if (p.estado !== 'RECIBIDO') throw forbidden('Solo puedes cancelar pedidos que aún no se han pagado ni preparado. Escríbenos si necesitas ayuda.');
      return decorar(await repos.pedidos.aplicarTransicion({
        idPedido: p.id, estadoAnterior: p.estado, estadoNuevo: 'CANCELADO', idAdmin: null, nota: 'Cancelado por el cliente', movimiento: movimientoInventario(p, 'CANCELADO'),
      }));
    },

    // ---- Administración ----
    async listar(filtros = {}) {
      return (await repos.pedidos.listar(filtros)).map(decorar);
    },
    async detalle(id) { return decorar(await obtener(id)); },
    async cambiarEstado(id, { estado, nota }, idAdmin) {
      if (!estado) throw badRequest('Indica el nuevo estado');
      return decorar(await transitar(await obtener(id), estado, idAdmin, nota));
    },

    pagos(filtros) { return repos.pagos.listar(filtros); },
    async confirmarPago(idPago, idAdmin) {
      const g = await repos.pagos.buscarPorId(idPago);
      if (!g) throw notFound('Pago no encontrado');
      if (g.estado !== 'PENDIENTE') throw unprocessable('PAGO_PROCESADO', 'Este pago ya fue procesado');
      const p = await obtener(g.idPedido);
      if (p.estado === 'CANCELADO') throw unprocessable('PEDIDO_CANCELADO', 'El pedido está cancelado');
      // Al confirmar el pago se descuenta el inventario (SC-02)
      if (p.estado === 'RECIBIDO') {
        await transitar(p, 'PAGADO', idAdmin, 'Pago confirmado');
      } else if (!p.stockDescontado) {
        await repos.pedidos.aplicarTransicion({ idPedido: p.id, estadoAnterior: p.estado, estadoNuevo: p.estado, idAdmin, nota: 'Pago confirmado', movimiento: 'DESCONTAR' });
      }
      await repos.pagos.actualizarEstado(g.id, 'CONFIRMADO', idAdmin);
      return decorar(await obtener(p.id));
    },
    async rechazarPago(idPago, idAdmin) {
      const g = await repos.pagos.buscarPorId(idPago);
      if (!g) throw notFound('Pago no encontrado');
      if (g.estado !== 'PENDIENTE') throw unprocessable('PAGO_PROCESADO', 'Este pago ya fue procesado');
      await repos.pagos.actualizarEstado(g.id, 'RECHAZADO', idAdmin);
      return decorar(await obtener(g.idPedido));
    },

    // Calendario mensual. campo = 'pedido' (fecha en que se hizo) o 'entrega'
    async calendario({ mes, campo = 'pedido' } = {}) {
      if (!/^\d{4}-\d{2}$/.test(mes || '')) mes = hoyISO(ahora()).slice(0, 7);
      if (!['pedido', 'entrega'].includes(campo)) throw badRequest('El campo debe ser "pedido" o "entrega"');
      const todos = await repos.pedidos.listar({});
      const clave = (p) => (campo === 'entrega' ? p.fechaEntrega : hoyISO(new Date(p.fechaPedido)));
      const dias = {};
      for (const p of todos) {
        const k = clave(p);
        if (!k || !k.startsWith(mes)) continue;
        (dias[k] = dias[k] || []).push(p);
      }
      const resultado = {};
      for (const k of Object.keys(dias).sort()) {
        resultado[k] = await Promise.all(dias[k].map(async (p) => decorar(await repos.pedidos.buscarPorId(p.id))));
      }
      return { mes, campo, dias: resultado };
    },

    async resumen() {
      const todos = await repos.pedidos.listar({});
      const hoy = hoyISO(ahora());
      const porEstado = Object.fromEntries(Object.keys(ETIQUETAS).map((e) => [e, 0]));
      todos.forEach((p) => { porEstado[p.estado]++; });
      const pagos = await repos.pagos.listar({});
      const inventario = await repos.inventario.listar();
      const mensajes = await repos.soporte.listar({ estado: 'ABIERTO' });
      return {
        porEstado,
        pedidosActivos: todos.filter((p) => !['ENTREGADO', 'CANCELADO'].includes(p.estado)).length,
        entregasHoy: todos.filter((p) => p.fechaEntrega === hoy && p.estado !== 'CANCELADO').length,
        ventasConfirmadas: pagos.filter((g) => g.estado === 'CONFIRMADO').reduce((s, g) => s + g.valor, 0),
        pagosPendientes: pagos.filter((g) => g.estado === 'PENDIENTE' && g.estadoPedido !== 'CANCELADO').length,
        stockBajo: inventario.filter((i) => i.activo && i.stockActual <= 5),
        mensajesAbiertos: mensajes.length,
        proximos: todos.filter((p) => p.fechaEntrega >= hoy && !['ENTREGADO', 'CANCELADO'].includes(p.estado))
          .sort((a, b) => (a.fechaEntrega < b.fechaEntrega ? -1 : 1)).slice(0, 5).map(decorar),
      };
    },
  };
}

module.exports = { createPedidoService, pasosSeguimiento };
