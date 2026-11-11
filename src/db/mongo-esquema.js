// Esquema de la base MongoDB de Pecantojos: validadores ($jsonSchema) e índices.
// Los validadores protegen la calidad de los datos: si un documento
// no los cumple, MongoDB rechaza la escritura aunque la API tuviera un error.
// Se aplica con:  npm run mongo:preparar   (también lo ejecuta la carga inicial: npm run mongo:cargar)

const ESTADOS_PEDIDO = ['RECIBIDO', 'PAGADO', 'EN_PREPARACION', 'LISTO', 'DESPACHADO', 'ENTREGADO', 'CANCELADO'];
const ESTADOS_PAGO = ['PENDIENTE', 'CONFIRMADO', 'RECHAZADO'];
const TIPOS_METODO = ['BILLETERA', 'TRANSFERENCIA', 'TARJETA', 'EFECTIVO'];
const TIPOS_MOVIMIENTO = ['ENTRADA', 'SALIDA', 'AJUSTE', 'REINTEGRO'];

const entero = { bsonType: ['int', 'long'] };
const enteroONulo = { bsonType: ['int', 'long', 'null'] };
const numero = { bsonType: ['int', 'long', 'double', 'decimal'] };
const texto = { bsonType: 'string' };
const textoONulo = { bsonType: ['string', 'null'] };
const fecha = { bsonType: 'date' };
const fechaONula = { bsonType: ['date', 'null'] };
const booleano = { bsonType: 'bool' };
// Referencia extendida: copia el id y los campos que se muestran, para no hacer $lookup al leer
const refExtendida = (campos, nula = false) => ({
  bsonType: nula ? ['object', 'null'] : 'object',
  required: ['_id', ...Object.keys(campos)],
  properties: { _id: entero, ...campos },
});

const VALIDADORES = {
  administradores: {
    bsonType: 'object',
    required: ['_id', 'nombre', 'usuario', 'passwordHash'],
    properties: { _id: entero, nombre: texto, usuario: { bsonType: 'string', minLength: 3 }, passwordHash: texto },
  },
  clientes: {
    bsonType: 'object',
    required: ['_id', 'nombre', 'telefono', 'correo', 'fechaRegistro'],
    properties: {
      _id: entero,
      nombre: { bsonType: 'string', minLength: 3 },
      telefono: texto,
      correo: { bsonType: 'string', pattern: '^[^\\s@]+@[^\\s@]+\\.[^\\s@]{2,}$' },
      direccion: textoONulo,
      ciudad: textoONulo,
      passwordHash: textoONulo,
      fechaRegistro: fecha,
    },
  },
  categorias: {
    bsonType: 'object',
    required: ['_id', 'nombre'],
    properties: { _id: entero, nombre: texto, descripcion: textoONulo },
  },
  productos: {
    bsonType: 'object',
    required: ['_id', 'nombre', 'precio', 'activo', 'controlaInventario'],
    properties: {
      _id: entero,
      nombre: { bsonType: 'string', minLength: 3 },
      descripcion: textoONulo,
      precio: { ...numero, minimum: 0, exclusiveMinimum: true }, // CHECK (precio > 0)
      imagenUrl: textoONulo,
      activo: booleano,
      controlaInventario: booleano,
      categoria: refExtendida({ nombre: texto }, true),
      // Inventario embebido (relación 1 a 1 con el producto)
      inventario: {
        bsonType: ['object', 'null'],
        required: ['stockActual', 'fechaActualizacion'],
        properties: { stockActual: { ...entero, minimum: 0 }, fechaActualizacion: fecha }, // CHECK (stock >= 0)
      },
    },
  },
  zonas: {
    bsonType: 'object',
    required: ['_id', 'nombre', 'valor', 'activo'],
    properties: { _id: entero, nombre: texto, valor: { ...numero, minimum: 0 }, activo: booleano },
  },
  metodosPago: {
    bsonType: 'object',
    required: ['_id', 'nombre', 'tipo', 'requiereReferencia', 'activo'],
    properties: {
      _id: entero, nombre: texto, tipo: { enum: TIPOS_METODO }, banco: textoONulo, titular: textoONulo,
      numeroCuenta: textoONulo, instrucciones: textoONulo, requiereReferencia: booleano, activo: booleano,
    },
  },
  pedidos: {
    bsonType: 'object',
    required: ['_id', 'codigo', 'cliente', 'fechaPedido', 'fechaEntrega', 'tipoEntrega', 'valorSubtotal', 'valorDomicilio',
      'valorTotal', 'metodoPago', 'estado', 'stockDescontado', 'detalles', 'historial', 'pagos'],
    properties: {
      _id: entero,
      codigo: { bsonType: 'string', pattern: '^PC-[A-Z0-9]{4,10}$' },
      cliente: refExtendida({ nombre: texto, telefono: texto, correo: texto }),
      fechaPedido: fecha,
      fechaEntrega: fecha,
      tipoEntrega: { enum: ['DOMICILIO', 'RECOGER'] },
      zona: refExtendida({ nombre: texto, valor: numero }, true),
      direccionEntrega: textoONulo,
      valorSubtotal: { ...numero, minimum: 0 },
      valorDomicilio: { ...numero, minimum: 0 },
      valorTotal: { ...numero, minimum: 0 },
      metodoPago: refExtendida({ nombre: texto, tipo: texto }),
      estado: { enum: ESTADOS_PEDIDO },
      stockDescontado: booleano,
      observaciones: textoONulo,
      // Detalle embebido: siempre se lee y se escribe junto con el pedido
      detalles: {
        bsonType: 'array',
        minItems: 1, // un pedido sin productos no es válido
        items: {
          bsonType: 'object',
          required: ['_id', 'idProducto', 'producto', 'cantidad', 'precioUnitario', 'subtotal'],
          properties: {
            _id: entero, idProducto: entero, producto: texto,
            cantidad: { ...entero, minimum: 1 }, precioUnitario: numero, subtotal: numero,
          },
        },
      },
      historial: {
        bsonType: 'array',
        items: {
          bsonType: 'object',
          required: ['_id', 'estadoNuevo', 'fecha'],
          properties: {
            _id: entero, estadoAnterior: { enum: [...ESTADOS_PEDIDO, null] }, estadoNuevo: { enum: ESTADOS_PEDIDO },
            idAdmin: enteroONulo, nota: textoONulo, fecha,
          },
        },
      },
      pagos: {
        bsonType: 'array',
        items: {
          bsonType: 'object',
          required: ['_id', 'idMetodoPago', 'metodoPago', 'valor', 'estado', 'fechaPago'],
          properties: {
            _id: entero, idMetodoPago: entero, metodoPago: texto, valor: numero, referencia: textoONulo,
            estado: { enum: ESTADOS_PAGO }, fechaPago: fecha, fechaConfirmacion: fechaONula, idAdmin: enteroONulo,
          },
        },
      },
    },
  },
  movimientosInventario: {
    bsonType: 'object',
    required: ['_id', 'idProducto', 'producto', 'tipo', 'cantidad', 'fecha'],
    properties: {
      _id: entero, idProducto: entero, producto: texto, tipo: { enum: TIPOS_MOVIMIENTO }, cantidad: { ...entero, minimum: 0 },
      motivo: textoONulo, idPedido: enteroONulo, idAdmin: enteroONulo, fecha,
    },
  },
  mensajesSoporte: {
    bsonType: 'object',
    required: ['_id', 'nombre', 'correo', 'asunto', 'mensaje', 'estado', 'fecha'],
    properties: {
      _id: entero, idCliente: enteroONulo, nombre: texto, correo: texto, asunto: texto, mensaje: texto,
      idPedido: enteroONulo, estado: { enum: ['ABIERTO', 'RESPONDIDO'] }, respuesta: textoONulo, fecha, fechaRespuesta: fechaONula,
    },
  },
};

// Comparación de texto sin distinguir mayúsculas ni tildes (correos y usuarios)
const SIN_MAYUSCULAS = { locale: 'es', strength: 2 };

const INDICES = {
  administradores: [{ key: { usuario: 1 }, name: 'usuario_unico', unique: true }],
  clientes: [{ key: { correo: 1 }, name: 'correo_unico', unique: true, collation: SIN_MAYUSCULAS }],
  productos: [
    { key: { activo: 1, 'categoria._id': 1 }, name: 'activo_categoria' },
  ],
  pedidos: [
    { key: { codigo: 1 }, name: 'codigo_unico', unique: true },
    { key: { 'cliente._id': 1, fechaPedido: -1 }, name: 'pedidos_por_cliente' },
    { key: { estado: 1, fechaEntrega: 1 }, name: 'estado_fecha_entrega' },
    { key: { fechaPedido: -1 }, name: 'fecha_pedido' },
    { key: { 'pagos._id': 1 }, name: 'pago_id', unique: true, partialFilterExpression: { 'pagos._id': { $exists: true } } },
    { key: { 'pagos.estado': 1 }, name: 'pago_estado' },
  ],
  movimientosInventario: [{ key: { idProducto: 1, _id: -1 }, name: 'movimientos_por_producto' }],
  mensajesSoporte: [
    { key: { estado: 1, _id: -1 }, name: 'mensajes_por_estado' },
    { key: { idCliente: 1, _id: -1 }, name: 'mensajes_por_cliente' },
  ],
};

const COLECCIONES = Object.keys(VALIDADORES);

// Crea las colecciones con su validador (o lo actualiza si ya existen) y sus índices
async function prepararBase(db, { log = () => {} } = {}) {
  const existentes = new Set((await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name));
  for (const nombre of COLECCIONES) {
    const validator = { $jsonSchema: VALIDADORES[nombre] };
    if (existentes.has(nombre)) {
      await db.command({ collMod: nombre, validator, validationLevel: 'strict', validationAction: 'error' });
    } else {
      await db.createCollection(nombre, { validator, validationLevel: 'strict', validationAction: 'error' });
    }
    for (const idx of INDICES[nombre] || []) {
      const { key, ...opciones } = idx;
      await db.collection(nombre).createIndex(key, opciones);
    }
    log(`  ✔ ${nombre} (validador + ${(INDICES[nombre] || []).length} índice(s))`);
  }
  if (!existentes.has('contadores')) await db.createCollection('contadores');
}

module.exports = { prepararBase, VALIDADORES, INDICES, COLECCIONES, ESTADOS_PEDIDO };
