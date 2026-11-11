// Arma los documentos de MongoDB a partir de listas planas (una lista por entidad, campos en camelCase,
// como las de src/repositories/memory/seed.js y src/db/carga/historico.js). Aquí se aplican las
// decisiones del modelo: qué se EMBEBE y qué se REFERENCIA. Es una función pura: no se conecta a
// nada, por eso se prueba sin base de datos (tests/unit/carga.test.js).
//
//   ENTIDAD                       COLECCIÓN                  TÉCNICA
//   administradora                administradores            colección propia
//   cliente                       clientes                   colección propia (los pedidos la referencian)
//   categoría                     categorias                 colección propia + copia {_id, nombre} en productos
//   producto + inventario         productos                  inventario EMBEBIDO (relación 1:1)
//   zona de domicilio             zonas                      colección propia + copia en pedidos
//   método de pago                metodosPago                colección propia + copia en pedidos
//   pedido + líneas + historial
//     + pagos                     pedidos                    detalles, historial y pagos EMBEBIDOS
//   movimiento de inventario      movimientosInventario      REFERENCIA a producto y pedido (crece sin límite)
//   mensaje de soporte            mensajesSoporte            REFERENCIA a cliente y pedido

const dos = (n) => String(n).padStart(2, '0');
const fecha = (v) => (v == null || v === '' ? null : v instanceof Date ? v : new Date(v));
// Día sin hora -> medianoche UTC. Acepta 'AAAA-MM-DD' o un Date (medianoche local)
function dia(v) {
  if (v == null || v === '') return null;
  const s = v instanceof Date ? `${v.getFullYear()}-${dos(v.getMonth() + 1)}-${dos(v.getDate())}` : String(v).slice(0, 10);
  return new Date(`${s}T00:00:00.000Z`);
}
const num = (v) => (v == null ? v : Number(v));
const texto = (v) => (v == null || v === '' ? null : String(v));
const porId = (lista) => new Map(lista.map((x) => [Number(x.id), x]));
const agrupar = (lista, campo) => {
  const m = new Map();
  for (const x of lista) {
    const k = Number(x[campo]);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(x);
  }
  return m;
};
const ordenarPorId = (a, b) => Number(a.id) - Number(b.id);

function construirDocumentos(d) {
  const categorias = porId(d.categorias);
  const productos = porId(d.productos);
  const clientes = porId(d.clientes);
  const zonas = porId(d.zonas);
  const metodos = porId(d.metodos);
  const inventario = new Map(d.inventario.map((i) => [Number(i.idProducto), i]));
  const detallesPorPedido = agrupar(d.detalles, 'idPedido');
  const historialPorPedido = agrupar(d.historial, 'idPedido');
  const pagosPorPedido = agrupar(d.pagos, 'idPedido');

  const docs = {
    administradores: d.admins.map((a) => ({ _id: Number(a.id), nombre: a.nombre, usuario: a.usuario, passwordHash: a.passwordHash })),

    clientes: d.clientes.map((c) => ({
      _id: Number(c.id), nombre: c.nombre, telefono: String(c.telefono || ''), correo: String(c.correo || '').trim(),
      direccion: texto(c.direccion), ciudad: texto(c.ciudad), passwordHash: texto(c.passwordHash), fechaRegistro: fecha(c.fechaRegistro) || new Date(),
    })),

    categorias: d.categorias.map((c) => ({ _id: Number(c.id), nombre: c.nombre, descripcion: texto(c.descripcion) })),

    productos: d.productos.map((p) => {
      const cat = categorias.get(Number(p.idCategoria));
      const inv = inventario.get(Number(p.id));
      return {
        _id: Number(p.id),
        nombre: p.nombre,
        descripcion: texto(p.descripcion),
        precio: num(p.precio),
        imagenUrl: texto(p.imagenUrl),
        activo: !!p.activo,
        controlaInventario: !!p.controlaInventario,
        categoria: cat ? { _id: Number(cat.id), nombre: cat.nombre } : null,
        inventario: p.controlaInventario
          ? { stockActual: inv ? Number(inv.stockActual) : 0, fechaActualizacion: fecha(inv && inv.fechaActualizacion) || new Date() }
          : null,
      };
    }),

    zonas: d.zonas.map((z) => ({ _id: Number(z.id), nombre: z.nombre, valor: num(z.valor), activo: !!z.activo })),

    metodosPago: d.metodos.map((m) => ({
      _id: Number(m.id), nombre: m.nombre, tipo: m.tipo, banco: texto(m.banco), titular: texto(m.titular), numeroCuenta: texto(m.numeroCuenta),
      instrucciones: texto(m.instrucciones), requiereReferencia: !!m.requiereReferencia, activo: !!m.activo,
    })),

    pedidos: d.pedidos.map((p) => {
      const c = clientes.get(Number(p.idCliente)) || {};
      const z = p.idZona ? zonas.get(Number(p.idZona)) : null;
      const m = metodos.get(Number(p.idMetodoPago)) || {};
      return {
        _id: Number(p.id),
        codigo: p.codigo,
        // Referencias extendidas: id + datos que se muestran en pantalla
        cliente: { _id: Number(p.idCliente), nombre: c.nombre || '', telefono: String(c.telefono || ''), correo: c.correo || '' },
        fechaPedido: fecha(p.fechaPedido),
        fechaEntrega: dia(p.fechaEntrega),
        tipoEntrega: p.tipoEntrega,
        zona: z ? { _id: Number(z.id), nombre: z.nombre, valor: num(z.valor) } : null,
        direccionEntrega: texto(p.direccionEntrega),
        valorSubtotal: num(p.valorSubtotal),
        valorDomicilio: num(p.valorDomicilio) || 0,
        valorTotal: num(p.valorTotal),
        metodoPago: { _id: Number(p.idMetodoPago), nombre: m.nombre || '', tipo: m.tipo || '' },
        estado: p.estado,
        stockDescontado: !!p.stockDescontado,
        observaciones: texto(p.observaciones),
        // Documentos embebidos: siempre se leen y se escriben junto con el pedido
        detalles: (detallesPorPedido.get(Number(p.id)) || []).sort(ordenarPorId).map((x) => ({
          _id: Number(x.id), idProducto: Number(x.idProducto), producto: (productos.get(Number(x.idProducto)) || {}).nombre || '',
          cantidad: Number(x.cantidad), precioUnitario: num(x.precioUnitario), subtotal: num(x.subtotal),
        })),
        historial: (historialPorPedido.get(Number(p.id)) || []).sort(ordenarPorId).map((h) => ({
          _id: Number(h.id), estadoAnterior: h.estadoAnterior || null, estadoNuevo: h.estadoNuevo,
          idAdmin: h.idAdmin == null ? null : Number(h.idAdmin), nota: texto(h.nota), fecha: fecha(h.fecha),
        })),
        pagos: (pagosPorPedido.get(Number(p.id)) || []).sort(ordenarPorId).map((g) => ({
          _id: Number(g.id), idMetodoPago: Number(g.idMetodoPago), metodoPago: (metodos.get(Number(g.idMetodoPago)) || {}).nombre || '',
          valor: num(g.valor), referencia: texto(g.referencia), estado: g.estado, fechaPago: fecha(g.fechaPago),
          fechaConfirmacion: fecha(g.fechaConfirmacion), idAdmin: g.idAdmin == null ? null : Number(g.idAdmin),
        })),
      };
    }),

    movimientosInventario: d.movimientos.map((x) => ({
      _id: Number(x.id), idProducto: Number(x.idProducto), producto: (productos.get(Number(x.idProducto)) || {}).nombre || '',
      tipo: x.tipo, cantidad: Number(x.cantidad), motivo: texto(x.motivo), idPedido: x.idPedido == null ? null : Number(x.idPedido),
      idAdmin: x.idAdmin == null ? null : Number(x.idAdmin), fecha: fecha(x.fecha),
    })),

    mensajesSoporte: d.mensajes.map((x) => ({
      _id: Number(x.id), idCliente: x.idCliente == null ? null : Number(x.idCliente), nombre: x.nombre, correo: x.correo,
      asunto: x.asunto, mensaje: x.mensaje, idPedido: x.idPedido == null ? null : Number(x.idPedido), estado: x.estado,
      respuesta: texto(x.respuesta), fecha: fecha(x.fecha), fechaRespuesta: fecha(x.fechaRespuesta),
    })),
  };

  // Contadores: el siguiente id que asigne la aplicación continúa después de los datos cargados
  const max = (lista) => lista.reduce((m, x) => Math.max(m, Number(x.id) || 0), 0);
  const contadores = [
    ['administradores', max(d.admins)], ['clientes', max(d.clientes)], ['categorias', max(d.categorias)],
    ['productos', max(d.productos)], ['zonas', max(d.zonas)], ['metodosPago', max(d.metodos)], ['pedidos', max(d.pedidos)],
    ['detallesPedido', max(d.detalles)], ['historialEstados', max(d.historial)], ['pagos', max(d.pagos)],
    ['movimientosInventario', max(d.movimientos)], ['mensajesSoporte', max(d.mensajes)],
  ].map(([_id, valor]) => ({ _id, valor }));

  return { docs, contadores };
}

module.exports = { construirDocumentos, dia };
