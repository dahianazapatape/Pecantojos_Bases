// Repositorios de MongoDB: misma interfaz que repositories/memory (demo y pruebas).
//
// Modelo (ver docs/MONGODB.md):
//   productos   -> embebe su inventario (1:1) y una referencia extendida a la categoría
//   pedidos     -> embebe detalles, historial de estados y pagos (siempre se leen con el pedido)
//                  y guarda referencias extendidas al cliente, la zona y el método de pago
//   movimientosInventario, mensajesSoporte -> colecciones aparte (crecen sin límite)
//   clientes, administradores, categorias, zonas, metodosPago -> colecciones referenciadas por _id
//
// Las operaciones que tocan varias colecciones usan transacciones (enTransaccion).
const { getDb, enTransaccion, siguienteId } = require('../../db/mongo');
const { conflict, notFound } = require('../../utils/errors');
const { createReportes } = require('./reportes');

const SIN_MAYUSCULAS = { locale: 'es', strength: 2 };

// Búsqueda de texto parcial sin distinguir mayúsculas ni tildes ("nute" encuentra "Nutella", "galleta" encuentra "Galleta")
const TILDES = { a: '[aáàä]', e: '[eéèë]', i: '[iíìï]', o: '[oóòö]', u: '[uúùü]', n: '[nñ]' };
function regexBusqueda(q) {
  const limpio = String(q || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').slice(0, 60);
  if (!limpio) return null;
  const patron = limpio.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/[aeioun]/g, (c) => TILDES[c]);
  return new RegExp(patron, 'i');
}

// ---------- Conversión de fechas ----------
const iso = (d) => (d instanceof Date ? d.toISOString() : d ?? null);
// fechaEntrega es un día (sin hora): se guarda como medianoche UTC y se devuelve como 'AAAA-MM-DD'
const aDia = (s) => (s ? new Date(`${String(s).slice(0, 10)}T00:00:00.000Z`) : null);
const deDia = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : d ?? null);

// ---------- Documento MongoDB -> objeto de dominio (mismos nombres que usa la API) ----------
const mapProducto = (d) => ({
  id: d._id,
  idCategoria: d.categoria ? d.categoria._id : null,
  categoria: d.categoria ? d.categoria.nombre : null,
  nombre: d.nombre,
  descripcion: d.descripcion || '',
  precio: Number(d.precio),
  imagenUrl: d.imagenUrl || null,
  activo: !!d.activo,
  controlaInventario: !!d.controlaInventario,
  stock: d.controlaInventario ? (d.inventario ? d.inventario.stockActual : 0) : null,
});

const mapCliente = (d) => d && ({
  id: d._id, nombre: d.nombre, telefono: d.telefono, correo: d.correo, direccion: d.direccion || '',
  ciudad: d.ciudad || '', passwordHash: d.passwordHash || '', fechaRegistro: iso(d.fechaRegistro),
});

const mapZona = (d) => d && ({ id: d._id, nombre: d.nombre, valor: Number(d.valor), activo: !!d.activo });

const mapMetodo = (d) => d && ({
  id: d._id, nombre: d.nombre, tipo: d.tipo, banco: d.banco || '', titular: d.titular || '', numeroCuenta: d.numeroCuenta || '',
  instrucciones: d.instrucciones || '', requiereReferencia: !!d.requiereReferencia, activo: !!d.activo,
});

const mapPago = (g, idPedido) => ({
  id: g._id, idPedido, idMetodoPago: g.idMetodoPago, valor: Number(g.valor), referencia: g.referencia ?? null,
  estado: g.estado, fechaPago: iso(g.fechaPago), fechaConfirmacion: iso(g.fechaConfirmacion), idAdmin: g.idAdmin ?? null,
});

const mapMensaje = (d) => d && ({
  id: d._id, idCliente: d.idCliente ?? null, nombre: d.nombre, correo: d.correo, asunto: d.asunto, mensaje: d.mensaje,
  idPedido: d.idPedido ?? null, estado: d.estado, respuesta: d.respuesta ?? null, fecha: iso(d.fecha), fechaRespuesta: iso(d.fechaRespuesta),
});

const mapMovimiento = (d) => ({
  id: d._id, idProducto: d.idProducto, tipo: d.tipo, cantidad: d.cantidad, motivo: d.motivo ?? null,
  idPedido: d.idPedido ?? null, idAdmin: d.idAdmin ?? null, fecha: iso(d.fecha),
});

function mapPedido(d, { completo = true } = {}) {
  const p = {
    id: d._id,
    codigo: d.codigo,
    idCliente: d.cliente._id,
    fechaPedido: iso(d.fechaPedido),
    fechaEntrega: deDia(d.fechaEntrega),
    tipoEntrega: d.tipoEntrega,
    idZona: d.zona ? d.zona._id : null,
    direccionEntrega: d.direccionEntrega ?? null,
    valorSubtotal: Number(d.valorSubtotal),
    valorDomicilio: Number(d.valorDomicilio),
    valorTotal: Number(d.valorTotal),
    idMetodoPago: d.metodoPago._id,
    estado: d.estado,
    stockDescontado: !!d.stockDescontado,
    observaciones: d.observaciones || '',
    cliente: { id: d.cliente._id, nombre: d.cliente.nombre, telefono: d.cliente.telefono, correo: d.cliente.correo },
    metodoPago: d.metodoPago.nombre,
    zona: d.zona ? d.zona.nombre : null,
  };
  if (completo) {
    p.detalles = (d.detalles || []).map((x) => ({
      id: x._id, idPedido: d._id, idProducto: x.idProducto, producto: x.producto, cantidad: x.cantidad,
      precioUnitario: Number(x.precioUnitario), subtotal: Number(x.subtotal),
    }));
    p.historial = (d.historial || []).map((h) => ({
      id: h._id, idPedido: d._id, estadoAnterior: h.estadoAnterior ?? null, estadoNuevo: h.estadoNuevo,
      idAdmin: h.idAdmin ?? null, nota: h.nota || '', fecha: iso(h.fecha),
    }));
    p.pagos = (d.pagos || []).map((g) => mapPago(g, d._id));
  }
  return p;
}

function createMongoRepos() {
  const col = async (nombre) => (await getDb()).collection(nombre);

  // ================= Productos (inventario embebido) =================
  async function categoriaRef(idCategoria) {
    if (!idCategoria) return null;
    const c = await (await col('categorias')).findOne({ _id: Number(idCategoria) });
    return c ? { _id: c._id, nombre: c.nombre } : null;
  }

  const productos = {
    // Consulta con búsqueda por texto (nombre o descripción) y filtro por categoría
    async listar({ incluirInactivos = false, q, idCategoria } = {}) {
      const filtro = incluirInactivos ? {} : { activo: true };
      const re = regexBusqueda(q);
      if (re) filtro.$or = [{ nombre: re }, { descripcion: re }];
      if (idCategoria) filtro['categoria._id'] = Number(idCategoria);
      return (await (await col('productos')).find(filtro).sort({ _id: 1 }).toArray()).map(mapProducto);
    },
    // Eliminar: solo si ningún pedido lo incluye (los pedidos guardan una copia del producto en sus detalles).
    // La verificación y el borrado van en la misma transacción para que ningún pedido nuevo se cuele entre ambos.
    async eliminar(id) {
      return enTransaccion(async (session) => {
        const prods = await col('productos');
        const p = await prods.findOne({ _id: Number(id) }, { session });
        if (!p) return null;
        const usos = await (await col('pedidos')).countDocuments({ 'detalles.idProducto': p._id }, { session });
        if (usos > 0) return { eliminado: false, usos, producto: mapProducto(p) };
        await prods.deleteOne({ _id: p._id }, { session });
        await (await col('movimientosInventario')).deleteMany({ idProducto: p._id }, { session });
        return { eliminado: true, usos: 0, producto: mapProducto(p) };
      });
    },
    async buscarPorId(id) {
      const d = await (await col('productos')).findOne({ _id: Number(id) });
      return d ? mapProducto(d) : null;
    },
    async crear(d) {
      const id = await siguienteId('productos');
      const doc = {
        _id: id,
        nombre: d.nombre,
        descripcion: d.descripcion || null,
        precio: d.precio,
        imagenUrl: d.imagenUrl || null,
        activo: d.activo !== false,
        controlaInventario: !!d.controlaInventario,
        categoria: await categoriaRef(d.idCategoria),
        // Un solo insertOne crea el producto y su inventario: es atómico sin transacción
        inventario: d.controlaInventario ? { stockActual: 0, fechaActualizacion: new Date() } : null,
      };
      await (await col('productos')).insertOne(doc);
      return mapProducto(doc);
    },
    async actualizar(id, d) {
      const c = await col('productos');
      const actual = await c.findOne({ _id: Number(id) });
      if (!actual) return null;
      const set = {};
      for (const k of ['nombre', 'descripcion', 'precio', 'imagenUrl', 'activo', 'controlaInventario']) {
        if (d[k] !== undefined) set[k] = d[k];
      }
      if (d.idCategoria !== undefined) set.categoria = await categoriaRef(d.idCategoria);
      const controla = d.controlaInventario !== undefined ? d.controlaInventario : actual.controlaInventario;
      if (controla && !actual.inventario) set.inventario = { stockActual: 0, fechaActualizacion: new Date() };
      const r = await c.findOneAndUpdate({ _id: Number(id) }, { $set: set }, { returnDocument: 'after' });
      return r ? mapProducto(r) : null;
    },
    async categorias() {
      return (await (await col('categorias')).find().sort({ _id: 1 }).toArray()).map((x) => ({ id: x._id, nombre: x.nombre }));
    },
  };

  // ================= Inventario =================
  const inventario = {
    async listar() {
      const docs = await (await col('productos')).find({ controlaInventario: true })
        .project({ nombre: 1, activo: 1, inventario: 1 }).sort({ _id: 1 }).toArray();
      return docs.map((x) => ({
        idProducto: x._id, producto: x.nombre, activo: !!x.activo,
        stockActual: x.inventario ? x.inventario.stockActual : 0, fechaActualizacion: x.inventario ? iso(x.inventario.fechaActualizacion) : null,
      }));
    },
    async obtener(idProducto) {
      const x = await (await col('productos')).findOne({ _id: Number(idProducto) }, { projection: { inventario: 1 } });
      return x && x.inventario ? { idProducto: x._id, stockActual: x.inventario.stockActual, fechaActualizacion: iso(x.inventario.fechaActualizacion) } : null;
    },
    async ajustar({ idProducto, stockNuevo, motivo, idAdmin }) {
      const idMov = await siguienteId('movimientosInventario');
      return enTransaccion(async (session) => {
        const prods = await col('productos');
        const p = await prods.findOne({ _id: Number(idProducto) }, { session });
        if (!p || !p.inventario) throw notFound('El producto no tiene registro de inventario');
        const dif = stockNuevo - p.inventario.stockActual;
        await prods.updateOne({ _id: p._id },
          { $set: { 'inventario.stockActual': stockNuevo, 'inventario.fechaActualizacion': new Date() } }, { session });
        await (await col('movimientosInventario')).insertOne({
          _id: idMov, idProducto: p._id, producto: p.nombre, tipo: dif >= 0 ? 'ENTRADA' : 'AJUSTE', cantidad: Math.abs(dif),
          motivo: motivo || null, idPedido: null, idAdmin: idAdmin || null, fecha: new Date(),
        }, { session });
        return { idProducto: p._id, stockActual: stockNuevo };
      });
    },
    async movimientos(idProducto) {
      const filtro = idProducto ? { idProducto: Number(idProducto) } : {};
      return (await (await col('movimientosInventario')).find(filtro).sort({ _id: -1 }).limit(200).toArray()).map(mapMovimiento);
    },
  };

  // ================= Clientes y administradores =================
  const clientes = {
    async crear(c) {
      const doc = {
        _id: await siguienteId('clientes'), nombre: c.nombre, telefono: c.telefono, correo: c.correo,
        direccion: c.direccion || null, ciudad: c.ciudad || null, passwordHash: c.passwordHash, fechaRegistro: new Date(),
      };
      try {
        await (await col('clientes')).insertOne(doc);
      } catch (e) {
        if (e.code === 11000) throw conflict('CORREO_REGISTRADO', 'Ya existe una cuenta con ese correo');
        throw e;
      }
      return mapCliente(doc);
    },
    async activarCuenta(id, c) {
      const set = { nombre: c.nombre, telefono: c.telefono, direccion: c.direccion || null, ciudad: c.ciudad || null, passwordHash: c.passwordHash };
      const r = await (await col('clientes')).findOneAndUpdate({ _id: Number(id) }, { $set: set }, { returnDocument: 'after' });
      // Los pedidos guardan una copia del nombre y teléfono del cliente: se mantiene al día
      await (await col('pedidos')).updateMany({ 'cliente._id': Number(id) }, { $set: { 'cliente.nombre': c.nombre, 'cliente.telefono': c.telefono } });
      return mapCliente(r);
    },
    async buscarPorCorreo(correo) {
      const d = await (await col('clientes')).findOne({ correo: String(correo).trim() }, { collation: SIN_MAYUSCULAS });
      return mapCliente(d) || null;
    },
    async buscarPorId(id) {
      return mapCliente(await (await col('clientes')).findOne({ _id: Number(id) })) || null;
    },
    // Búsqueda por nombre, correo o teléfono y filtro por ciudad.
    // $lookup trae de la colección pedidos cuántos pedidos tiene cada cliente y cuánto ha comprado.
    async listar({ q, ciudad } = {}) {
      const filtro = {};
      const re = regexBusqueda(q);
      if (re) filtro.$or = [{ nombre: re }, { correo: re }, { telefono: re }];
      const reCiudad = regexBusqueda(ciudad);
      if (reCiudad) filtro.ciudad = reCiudad;
      const docs = await (await col('clientes')).aggregate([
        { $match: filtro },
        { $sort: { nombre: 1 } },
        { $lookup: {
          from: 'pedidos', localField: '_id', foreignField: 'cliente._id', as: 'peds',
          pipeline: [{ $match: { estado: { $ne: 'CANCELADO' } } }, { $project: { valorTotal: 1, fechaPedido: 1 } }],
        } },
        { $addFields: { pedidos: { $size: '$peds' }, totalComprado: { $sum: '$peds.valorTotal' }, ultimoPedido: { $max: '$peds.fechaPedido' } } },
        { $project: { passwordHash: 0, peds: 0 } },
      ]).toArray();
      return docs.map((d) => {
        const { passwordHash, ...c } = mapCliente(d);
        return { ...c, pedidos: d.pedidos, totalComprado: Number(d.totalComprado), ultimoPedido: iso(d.ultimoPedido) };
      });
    },
    // Edición desde el panel. Los pedidos guardan una copia del nombre, teléfono y correo del cliente
    // (referencia extendida): en la misma transacción se actualizan esas copias.
    async actualizar(id, c) {
      try {
        return await enTransaccion(async (session) => {
          const set = { nombre: c.nombre, telefono: c.telefono, correo: c.correo, direccion: c.direccion || null, ciudad: c.ciudad || null };
          const r = await (await col('clientes')).findOneAndUpdate({ _id: Number(id) }, { $set: set }, { returnDocument: 'after', session });
          if (!r) return null;
          await (await col('pedidos')).updateMany({ 'cliente._id': Number(id) },
            { $set: { 'cliente.nombre': c.nombre, 'cliente.telefono': c.telefono, 'cliente.correo': c.correo } }, { session });
          return mapCliente(r);
        });
      } catch (e) {
        if (e.code === 11000) throw conflict('CORREO_REGISTRADO', 'Ya existe otra cuenta con ese correo');
        throw e;
      }
    },
    // Solo se elimina un cliente sin pedidos (los pedidos son historia contable de la tienda).
    // Sus mensajes de soporte se conservan sin la referencia (guardan su propio nombre y correo).
    async eliminar(id) {
      return enTransaccion(async (session) => {
        const clientesCol = await col('clientes');
        const c = await clientesCol.findOne({ _id: Number(id) }, { session });
        if (!c) return null;
        const usos = await (await col('pedidos')).countDocuments({ 'cliente._id': c._id }, { session });
        if (usos > 0) return { eliminado: false, usos, cliente: mapCliente(c) };
        await clientesCol.deleteOne({ _id: c._id }, { session });
        await (await col('mensajesSoporte')).updateMany({ idCliente: c._id }, { $set: { idCliente: null } }, { session });
        return { eliminado: true, usos: 0, cliente: mapCliente(c) };
      });
    },
  };

  const admins = {
    async buscarPorUsuario(u) {
      const x = await (await col('administradores')).findOne({ usuario: u });
      return x ? { id: x._id, nombre: x.nombre, usuario: x.usuario, passwordHash: x.passwordHash } : null;
    },
  };

  // ================= Zonas y métodos de pago =================
  // usosEn: dónde se guarda la referencia en los pedidos (para no eliminar algo que un pedido usa)
  function catalogo(nombreCol, mapear, aDoc, usosEn) {
    return {
      async eliminar(id) {
        return enTransaccion(async (session) => {
          const c = await col(nombreCol);
          const d = await c.findOne({ _id: Number(id) }, { session });
          if (!d) return null;
          const usos = await (await col('pedidos')).countDocuments({ $or: usosEn.map((campo) => ({ [campo]: d._id })) }, { session });
          if (usos > 0) return { eliminado: false, usos, item: mapear(d) };
          await c.deleteOne({ _id: d._id }, { session });
          return { eliminado: true, usos: 0, item: mapear(d) };
        });
      },
      async listar({ soloActivos = false } = {}) {
        return (await (await col(nombreCol)).find(soloActivos ? { activo: true } : {}).sort({ _id: 1 }).toArray()).map(mapear);
      },
      async buscarPorId(id) {
        return mapear(await (await col(nombreCol)).findOne({ _id: Number(id) })) || null;
      },
      async guardar(d) {
        const c = await col(nombreCol);
        const doc = aDoc(d);
        if (d.id) {
          const r = await c.findOneAndUpdate({ _id: Number(d.id) }, { $set: doc }, { returnDocument: 'after' });
          return r ? mapear(r) : null;
        }
        const nuevo = { _id: await siguienteId(nombreCol), ...doc };
        await c.insertOne(nuevo);
        return mapear(nuevo);
      },
    };
  }
  const zonas = catalogo('zonas', mapZona, (d) => ({ nombre: d.nombre, valor: d.valor, activo: d.activo !== false }), ['zona._id']);
  const metodos = catalogo('metodosPago', mapMetodo, (d) => ({
    nombre: d.nombre, tipo: d.tipo, banco: d.banco || null, titular: d.titular || null, numeroCuenta: d.numeroCuenta || null,
    instrucciones: d.instrucciones || null, requiereReferencia: !!d.requiereReferencia, activo: d.activo !== false,
  }), ['metodoPago._id', 'pagos.idMetodoPago']);

  // ================= Pedidos (detalles, historial y pagos embebidos) =================
  const pedidos = {
    async crear({ pedido, detalles, pago }) {
      const [cliente, zona, metodo, prods] = await Promise.all([
        (await col('clientes')).findOne({ _id: Number(pedido.idCliente) }),
        pedido.idZona ? (await col('zonas')).findOne({ _id: Number(pedido.idZona) }) : null,
        (await col('metodosPago')).findOne({ _id: Number(pedido.idMetodoPago) }),
        (await col('productos')).find({ _id: { $in: detalles.map((d) => Number(d.idProducto)) } }).project({ nombre: 1 }).toArray(),
      ]);
      if (!cliente) throw notFound('Cliente no encontrado');
      if (!metodo) throw notFound('Método de pago no encontrado');
      const nombreProd = new Map(prods.map((p) => [p._id, p.nombre]));
      const [id, idDet, idHist] = await Promise.all([
        siguienteId('pedidos'), siguienteId('detallesPedido', { cantidad: detalles.length }), siguienteId('historialEstados'),
      ]);
      const ahora = new Date();
      const doc = {
        _id: id,
        codigo: pedido.codigo,
        cliente: { _id: cliente._id, nombre: cliente.nombre, telefono: cliente.telefono, correo: cliente.correo },
        fechaPedido: ahora,
        fechaEntrega: aDia(pedido.fechaEntrega),
        tipoEntrega: pedido.tipoEntrega,
        zona: zona ? { _id: zona._id, nombre: zona.nombre, valor: zona.valor } : null,
        direccionEntrega: pedido.direccionEntrega || null,
        valorSubtotal: pedido.valorSubtotal,
        valorDomicilio: pedido.valorDomicilio,
        valorTotal: pedido.valorTotal,
        metodoPago: { _id: metodo._id, nombre: metodo.nombre, tipo: metodo.tipo },
        estado: pedido.estado,
        stockDescontado: false,
        observaciones: pedido.observaciones || null,
        detalles: detalles.map((d, i) => ({
          _id: idDet + i, idProducto: Number(d.idProducto), producto: nombreProd.get(Number(d.idProducto)) || '',
          cantidad: d.cantidad, precioUnitario: d.precioUnitario, subtotal: d.subtotal,
        })),
        historial: [{ _id: idHist, estadoAnterior: null, estadoNuevo: pedido.estado, idAdmin: null, nota: 'Pedido registrado por el cliente', fecha: ahora }],
        pagos: pago ? [{
          _id: await siguienteId('pagos'), idMetodoPago: metodo._id, metodoPago: metodo.nombre, valor: pago.valor,
          referencia: pago.referencia || null, estado: pago.estado || 'PENDIENTE', fechaPago: ahora, fechaConfirmacion: null, idAdmin: null,
        }] : [],
      };
      // Pedido + detalle + historial + pago en un solo documento: un insertOne atómico
      await (await col('pedidos')).insertOne(doc);
      return mapPedido(doc);
    },
    async buscarPorId(id) {
      const d = await (await col('pedidos')).findOne({ _id: Number(id) });
      return d ? mapPedido(d) : null;
    },
    async buscarPorCodigo(codigo) {
      const d = await (await col('pedidos')).findOne({ codigo: String(codigo) });
      return d ? mapPedido(d) : null;
    },
    async existeCodigo(codigo) {
      return (await (await col('pedidos')).countDocuments({ codigo: String(codigo) }, { limit: 1 })) > 0;
    },
    // Filtros: estado, cliente, rango de fechas de entrega y búsqueda por código o nombre del cliente
    async listar({ estado, idCliente, desde, hasta, q } = {}) {
      const filtro = {};
      if (estado) filtro.estado = estado;
      const re = regexBusqueda(q);
      if (re) filtro.$or = [{ codigo: re }, { 'cliente.nombre': re }, { 'cliente.telefono': re }];
      if (idCliente) filtro['cliente._id'] = Number(idCliente);
      if (desde || hasta) {
        filtro.fechaEntrega = {};
        if (desde) filtro.fechaEntrega.$gte = aDia(desde);
        if (hasta) filtro.fechaEntrega.$lte = aDia(hasta);
      }
      const docs = await (await col('pedidos')).aggregate([
        { $match: filtro },
        { $sort: { fechaPedido: -1 } },
        { $addFields: { items: { $size: '$detalles' } } },
        { $project: { detalles: 0, historial: 0, pagos: 0 } },
      ]).toArray();
      return docs.map((d) => ({ ...mapPedido(d, { completo: false }), items: d.items }));
    },
    async aplicarTransicion({ idPedido, estadoAnterior, estadoNuevo, idAdmin, nota, movimiento }) {
      const idHist = await siguienteId('historialEstados');
      await enTransaccion(async (session) => {
        const peds = await col('pedidos');
        const set = { estado: estadoNuevo };
        if (movimiento === 'DESCONTAR') set.stockDescontado = true;
        if (movimiento === 'REINTEGRAR') set.stockDescontado = false;
        // Bloqueo optimista: solo cambia si el estado sigue siendo el que vio el administrador
        const r = await peds.findOneAndUpdate(
          { _id: Number(idPedido), estado: estadoAnterior },
          { $set: set, $push: { historial: { _id: idHist, estadoAnterior, estadoNuevo, idAdmin: idAdmin || null, nota: nota || null, fecha: new Date() } } },
          { session, returnDocument: 'before' },
        );
        if (!r) {
          const existe = await peds.countDocuments({ _id: Number(idPedido) }, { session, limit: 1 });
          if (!existe) throw notFound('Pedido no encontrado');
          throw conflict('ESTADO_CAMBIADO', 'El pedido cambió de estado; recarga la página');
        }
        if (!movimiento) return;

        const prods = await col('productos');
        const controlados = new Set((await prods.find(
          { _id: { $in: r.detalles.map((d) => d.idProducto) }, controlaInventario: true }, { session, projection: { _id: 1 } },
        ).toArray()).map((p) => p._id));
        const dets = r.detalles.filter((d) => controlados.has(d.idProducto));
        if (!dets.length) return;
        const primerMov = await siguienteId('movimientosInventario', { cantidad: dets.length, session });
        const movs = [];
        for (const [i, d] of dets.entries()) {
          const signo = movimiento === 'DESCONTAR' ? -1 : 1;
          const filtro = { _id: d.idProducto };
          // Solo descuenta si hay existencias suficientes (equivale a WHERE stock_actual >= @c)
          if (signo < 0) filtro['inventario.stockActual'] = { $gte: d.cantidad };
          const u = await prods.updateOne(filtro,
            { $inc: { 'inventario.stockActual': signo * d.cantidad }, $set: { 'inventario.fechaActualizacion': new Date() } }, { session });
          if (u.matchedCount === 0) {
            const inv = await prods.findOne({ _id: d.idProducto }, { session, projection: { inventario: 1 } });
            throw conflict('STOCK_INSUFICIENTE', `No hay existencias suficientes de ${d.producto}`,
              { idProducto: d.idProducto, disponible: inv && inv.inventario ? inv.inventario.stockActual : 0 });
          }
          movs.push({
            _id: primerMov + i, idProducto: d.idProducto, producto: d.producto, tipo: signo < 0 ? 'SALIDA' : 'REINTEGRO',
            cantidad: d.cantidad, motivo: `Pedido ${idPedido}`, idPedido: Number(idPedido), idAdmin: idAdmin || null, fecha: new Date(),
          });
        }
        await (await col('movimientosInventario')).insertMany(movs, { session });
      });
      return this.buscarPorId(idPedido);
    },
  };

  // ================= Pagos (embebidos en el pedido) =================
  async function buscarPago(id) {
    const d = await (await col('pedidos')).findOne({ 'pagos._id': Number(id) }, { projection: { 'pagos.$': 1 } });
    return d ? mapPago(d.pagos[0], d._id) : null;
  }

  const pagos = {
    async listar({ estado } = {}) {
      // $unwind convierte cada pago embebido en una fila, como un JOIN PAGO-PEDIDOS
      const docs = await (await col('pedidos')).aggregate([
        ...(estado ? [{ $match: { 'pagos.estado': estado } }] : []),
        { $unwind: '$pagos' },
        ...(estado ? [{ $match: { 'pagos.estado': estado } }] : []),
        { $sort: { 'pagos._id': -1 } },
        { $project: { _id: 0, pago: '$pagos', idPedido: '$_id', codigoPedido: '$codigo', estadoPedido: '$estado', cliente: '$cliente.nombre' } },
      ]).toArray();
      return docs.map((x) => ({
        ...mapPago(x.pago, x.idPedido), codigoPedido: x.codigoPedido, estadoPedido: x.estadoPedido, cliente: x.cliente, metodoPago: x.pago.metodoPago,
      }));
    },
    buscarPorId: buscarPago,
    async crear(g) {
      const metodo = await (await col('metodosPago')).findOne({ _id: Number(g.idMetodoPago) });
      const pago = {
        _id: await siguienteId('pagos'), idMetodoPago: Number(g.idMetodoPago), metodoPago: metodo ? metodo.nombre : '',
        valor: g.valor, referencia: g.referencia || null, estado: g.estado || 'PENDIENTE', fechaPago: new Date(), fechaConfirmacion: null, idAdmin: null,
      };
      const r = await (await col('pedidos')).updateOne({ _id: Number(g.idPedido) }, { $push: { pagos: pago } });
      if (!r.matchedCount) throw notFound('Pedido no encontrado');
      return mapPago(pago, Number(g.idPedido));
    },
    async actualizarReferencia(id, referencia) {
      // El operador posicional $ actualiza solo el pago que coincidió en el filtro
      const r = await (await col('pedidos')).updateOne({ 'pagos._id': Number(id) },
        { $set: { 'pagos.$.referencia': referencia, 'pagos.$.fechaPago': new Date() } });
      return r.matchedCount ? buscarPago(id) : null;
    },
    async actualizarEstado(id, estado, idAdmin) {
      const r = await (await col('pedidos')).updateOne({ 'pagos._id': Number(id) },
        { $set: { 'pagos.$.estado': estado, 'pagos.$.idAdmin': idAdmin || null, 'pagos.$.fechaConfirmacion': new Date() } });
      return r.matchedCount ? buscarPago(id) : null;
    },
  };

  // ================= Atención al cliente =================
  const soporte = {
    async crear(m) {
      const doc = {
        _id: await siguienteId('mensajesSoporte'), idCliente: m.idCliente || null, nombre: m.nombre, correo: m.correo,
        asunto: m.asunto, mensaje: m.mensaje, idPedido: m.idPedido || null, estado: 'ABIERTO', respuesta: null, fecha: new Date(), fechaRespuesta: null,
      };
      await (await col('mensajesSoporte')).insertOne(doc);
      return mapMensaje(doc);
    },
    async listar({ estado } = {}) {
      return (await (await col('mensajesSoporte')).find(estado ? { estado } : {}).sort({ _id: -1 }).toArray()).map(mapMensaje);
    },
    async listarPorCliente(idCliente) {
      return (await (await col('mensajesSoporte')).find({ idCliente: Number(idCliente) }).sort({ _id: -1 }).toArray()).map(mapMensaje);
    },
    async responder(id, respuesta) {
      const r = await (await col('mensajesSoporte')).findOneAndUpdate({ _id: Number(id) },
        { $set: { respuesta, estado: 'RESPONDIDO', fechaRespuesta: new Date() } }, { returnDocument: 'after' });
      return mapMensaje(r) || null;
    },
  };

  return { productos, inventario, clientes, admins, zonas, metodos, pedidos, pagos, soporte, reportes: createReportes(col) };
}

module.exports = { createMongoRepos, aDia, deDia };
