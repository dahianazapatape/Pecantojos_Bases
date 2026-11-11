// Consultas analíticas con Aggregation Pipeline ($match, $unwind, $group, $lookup, $project, $sort, $limit).
// Cada reporte responde una pregunta real del negocio. Ver docs/MONGODB.md, sección 6.
const ZONA_HORARIA = 'America/Bogota';
const ACTIVOS = ['RECIBIDO', 'PAGADO', 'EN_PREPARACION', 'LISTO', 'DESPACHADO'];

const aDia = (s) => new Date(`${s}T00:00:00.000Z`);
const aFinDeDia = (s) => new Date(`${s}T23:59:59.999Z`);

// Filtro común: pedidos no cancelados, opcionalmente entre dos fechas de pedido (hora de Colombia)
function filtroVentas({ desde, hasta } = {}) {
  const f = { estado: { $ne: 'CANCELADO' } };
  if (desde || hasta) {
    f.fechaPedido = {};
    // Medianoche de Colombia = 05:00 UTC
    if (desde) f.fechaPedido.$gte = new Date(aDia(desde).getTime() + 5 * 3600e3);
    if (hasta) f.fechaPedido.$lte = new Date(aFinDeDia(hasta).getTime() + 5 * 3600e3);
  }
  return f;
}

function createReportes(col) {
  const pedidos = async (pipeline) => (await col('pedidos')).aggregate(pipeline).toArray();

  return {
    // R1. ¿Cuáles son las galletas más vendidas y cuánto dinero dejan?
    async productosMasVendidos({ desde, hasta, limite = 5 } = {}) {
      return pedidos([
        { $match: filtroVentas({ desde, hasta }) },
        { $unwind: '$detalles' },
        { $group: {
          _id: '$detalles.idProducto',
          producto: { $first: '$detalles.producto' },
          unidades: { $sum: '$detalles.cantidad' },
          ingresos: { $sum: '$detalles.subtotal' },
          pedidos: { $sum: 1 },
        } },
        { $sort: { unidades: -1, ingresos: -1 } },
        { $limit: Number(limite) || 5 },
        // $lookup: trae la categoría y el stock actual del producto (colección productos)
        { $lookup: { from: 'productos', localField: '_id', foreignField: '_id', as: 'prod' } },
        { $unwind: { path: '$prod', preserveNullAndEmptyArrays: true } },
        { $project: {
          _id: 0, idProducto: '$_id', producto: 1, unidades: 1, ingresos: 1, pedidos: 1,
          categoria: { $ifNull: ['$prod.categoria.nombre', 'Sin categoría'] },
          stockActual: { $ifNull: ['$prod.inventario.stockActual', null] },
        } },
      ]);
    },

    // R2. ¿Cómo van las ventas mes a mes? (número de pedidos, total vendido y ticket promedio)
    async ventasPorMes({ desde, hasta } = {}) {
      return pedidos([
        { $match: filtroVentas({ desde, hasta }) },
        { $group: {
          _id: { $dateToString: { format: '%Y-%m', date: '$fechaPedido', timezone: ZONA_HORARIA } },
          pedidos: { $sum: 1 },
          ventas: { $sum: '$valorTotal' },
          domicilios: { $sum: '$valorDomicilio' },
          ticketPromedio: { $avg: '$valorTotal' },
        } },
        { $sort: { _id: 1 } },
        { $project: { _id: 0, mes: '$_id', pedidos: 1, ventas: 1, domicilios: 1, ticketPromedio: { $round: ['$ticketPromedio', 0] } } },
      ]);
    },

    // R3. ¿A qué zonas se envían más pedidos? (incluye "recoger en tienda")
    async pedidosPorZona({ desde, hasta } = {}) {
      return pedidos([
        { $match: filtroVentas({ desde, hasta }) },
        { $group: {
          _id: { $ifNull: ['$zona.nombre', 'Recoge en tienda'] },
          pedidos: { $sum: 1 },
          ventas: { $sum: '$valorTotal' },
          cobradoDomicilio: { $sum: '$valorDomicilio' },
        } },
        { $sort: { pedidos: -1 } },
        { $project: { _id: 0, zona: '$_id', pedidos: 1, ventas: 1, cobradoDomicilio: 1 } },
      ]);
    },

    // R4. ¿Quiénes son los mejores clientes y de qué ciudad son?
    async mejoresClientes({ desde, hasta, limite = 5 } = {}) {
      return pedidos([
        { $match: filtroVentas({ desde, hasta }) },
        { $group: {
          _id: '$cliente._id',
          cliente: { $first: '$cliente.nombre' },
          pedidos: { $sum: 1 },
          totalComprado: { $sum: '$valorTotal' },
          ultimaCompra: { $max: '$fechaPedido' },
        } },
        { $sort: { totalComprado: -1 } },
        { $limit: Number(limite) || 5 },
        { $lookup: { from: 'clientes', localField: '_id', foreignField: '_id', as: 'c' } },
        { $unwind: { path: '$c', preserveNullAndEmptyArrays: true } },
        { $project: { _id: 0, idCliente: '$_id', cliente: 1, ciudad: { $ifNull: ['$c.ciudad', ''] }, pedidos: 1, totalComprado: 1, ultimaCompra: 1 } },
      ]);
    },

    // R8. ¿Qué categorías venden más? $unwind de los detalles y $lookup al producto para conocer su categoría actual
    async ventasPorCategoria({ desde, hasta } = {}) {
      return pedidos([
        { $match: filtroVentas({ desde, hasta }) },
        { $unwind: '$detalles' },
        { $lookup: { from: 'productos', localField: 'detalles.idProducto', foreignField: '_id', as: 'prod' } },
        { $unwind: { path: '$prod', preserveNullAndEmptyArrays: true } },
        { $group: {
          _id: { $ifNull: ['$prod.categoria.nombre', 'Sin categoría'] },
          unidades: { $sum: '$detalles.cantidad' },
          ingresos: { $sum: '$detalles.subtotal' },
          pedidos: { $addToSet: '$_id' },
          productos: { $addToSet: '$detalles.producto' },
        } },
        { $project: { _id: 0, categoria: '$_id', unidades: 1, ingresos: 1, pedidos: { $size: '$pedidos' }, productos: { $size: '$productos' } } },
        { $sort: { ingresos: -1 } },
      ]);
    },

    // R5. ¿Cuántos pedidos hay en cada estado y cuánto dinero representan?
    async pedidosPorEstado() {
      return pedidos([
        { $group: { _id: '$estado', pedidos: { $sum: 1 }, valor: { $sum: '$valorTotal' } } },
        { $sort: { pedidos: -1 } },
        { $project: { _id: 0, estado: '$_id', pedidos: 1, valor: 1 } },
      ]);
    },

    // R6. ¿Qué métodos de pago usan los clientes y cuánto está confirmado o pendiente?
    async pagosPorMetodo() {
      return pedidos([
        { $unwind: '$pagos' },
        { $group: {
          _id: '$pagos.metodoPago',
          pagos: { $sum: 1 },
          confirmado: { $sum: { $cond: [{ $eq: ['$pagos.estado', 'CONFIRMADO'] }, '$pagos.valor', 0] } },
          pendiente: { $sum: { $cond: [{ $eq: ['$pagos.estado', 'PENDIENTE'] }, '$pagos.valor', 0] } },
          rechazados: { $sum: { $cond: [{ $eq: ['$pagos.estado', 'RECHAZADO'] }, 1, 0] } },
        } },
        { $sort: { confirmado: -1 } },
        { $project: { _id: 0, metodo: '$_id', pagos: 1, confirmado: 1, pendiente: 1, rechazados: 1 } },
      ]);
    },

    // R7. ¿Alcanza el inventario para los pedidos que aún no han descontado stock?
    async inventarioVsDemanda() {
      return pedidos([
        { $match: { estado: { $in: ACTIVOS }, stockDescontado: false } },
        { $unwind: '$detalles' },
        { $group: { _id: '$detalles.idProducto', producto: { $first: '$detalles.producto' }, comprometido: { $sum: '$detalles.cantidad' }, pedidos: { $sum: 1 } } },
        { $lookup: { from: 'productos', localField: '_id', foreignField: '_id', as: 'prod' } },
        { $unwind: '$prod' },
        { $match: { 'prod.controlaInventario': true } },
        { $project: {
          _id: 0, idProducto: '$_id', producto: 1, pedidos: 1, comprometido: 1,
          stockActual: '$prod.inventario.stockActual',
          faltante: { $max: [0, { $subtract: ['$comprometido', '$prod.inventario.stockActual'] }] },
        } },
        { $sort: { faltante: -1, comprometido: -1 } },
      ]);
    },
  };
}

module.exports = { createReportes, REPORTES: ['productosMasVendidos', 'ventasPorMes', 'pedidosPorZona', 'mejoresClientes', 'ventasPorCategoria', 'pedidosPorEstado', 'pagosPorMetodo', 'inventarioVsDemanda'] };
