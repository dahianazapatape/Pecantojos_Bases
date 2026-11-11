# Pecantojos sobre MongoDB Atlas

Guía técnica del proyecto final de **Bases de Datos II**: modelo de documentos, carga inicial de datos, conexión de la API y consultas analíticas. El paso a paso para publicar está en [`DESPLIEGUE.md`](DESPLIEGUE.md).

```
Navegador (tienda / panel)  ──fetch──▶  API REST Node.js + Express  ──driver mongodb──▶  MongoDB Atlas
public/*.html, js/*.js                  src/routes → controllers →                      cluster gratuito
                                        services → repositories/mongo                    base "pecantojos"
```

---

## 1. Por qué MongoDB Atlas

| Criterio | Decisión |
|---|---|
| Forma de los datos | Un pedido es un agregado natural: cabecera, líneas de producto, historial de estados y pagos se leen y se escriben juntos. Un documento lo guarda completo y la pantalla de detalle se resuelve con **una sola lectura**, en vez de 4 consultas con JOIN. |
| Nube gratuita | El clúster gratuito de Atlas no cobra, no pide tarjeta, es un *replica set* de 3 nodos y corre MongoDB 8.0. |
| Transacciones | Al ser replica set, Atlas soporta transacciones multi-documento, necesarias para confirmar un pago y descontar el inventario de varios productos de forma atómica. |
| Validación | `$jsonSchema` hace que la propia base rechace datos inválidos (precios negativos, estados inexistentes, pedidos sin productos), aunque la API tuviera un error. |
| Análisis | El *Aggregation Pipeline* (`$match`, `$unwind`, `$group`, `$lookup`, `$project`, `$sort`, `$limit`) cubre los reportes del negocio. |
| Integración | El driver oficial `mongodb` para Node.js se usa directamente desde la capa de repositorios de la API. |

Límites del plan gratuito a tener presentes: 0,5 GB de almacenamiento, 100 operaciones por segundo y 500 conexiones; Atlas pausa el clúster tras 30 días sin conexiones. Para una tienda pequeña sobra.

---

## 2. Arquitectura y conexión de la API

La API está organizada en capas. Los **servicios** (reglas de negocio) solo hablan con una **interfaz de repositorios**. Hay dos implementaciones: `repositories/mongo` (la que usa la aplicación) y `repositories/memory` (para las pruebas automáticas y `npm run demo`).

```
src/
├── config/index.js              lee .env: DB_CLIENT, MONGODB_URI, MONGODB_DB
├── db/
│   ├── mongo.js                 conexión (MongoClient), transacciones y contadores de ids
│   ├── mongo-esquema.js         validadores $jsonSchema e índices
│   ├── mongo-check.js           npm run mongo:check / mongo:preparar
│   ├── cargar-datos.js          npm run mongo:cargar (carga inicial)
│   └── carga/
│       ├── historico.js         genera 12 meses de clientes, pedidos e inventario de prueba
│       └── armar-documentos.js  arma los documentos (embebidos y referencias)
├── repositories/
│   ├── index.js                 fábrica: DB_CLIENT = mongo | memory
│   ├── mongo/index.js           repositorios MongoDB (misma interfaz que memory)
│   └── mongo/reportes.js        consultas de agregación
├── services/reporteService.js   valida filtros de los reportes
└── server.js                    conecta a MongoDB al iniciar (con reintentos)
```

### Cómo se conecta

1. `src/config/index.js` lee `MONGODB_URI` y `MONGODB_DB` del archivo `.env` (local) o de las variables de entorno del servidor (nube). **La cadena de conexión nunca está en el código ni en GitHub**: `.env` está en `.gitignore`.
2. `src/db/mongo.js` crea **un solo `MongoClient`** para toda la aplicación, con un pool de hasta 10 conexiones reutilizables (`maxPoolSize: 10`). La conexión se abre la primera vez que se usa y se reutiliza en cada petición.
3. `src/server.js` hace un `ping` al iniciar e imprime `✔ Conectado a MongoDB (cluster… / pecantojos)`. Si falla, reintenta tres veces y explica qué revisar.
4. `src/repositories/index.js` entrega los repositorios MongoDB cuando `DB_CLIENT=mongo`.

### Recorrido de una operación: confirmar un pago

```
Panel admin  ──POST /api/admin/pagos/12/confirmar──▶  routes/index.js
  → middleware requiereRol('admin')        valida el token JWT
  → controllers.admin.confirmarPago         traduce HTTP → servicio
  → pedidoService.confirmarPago             reglas: el pago debe estar PENDIENTE, el pedido no cancelado
  → repos.pedidos.aplicarTransicion         ── transacción MongoDB ──
        pedidos.findOneAndUpdate({_id, estado:'RECIBIDO'}, {$set:{estado:'PAGADO'}, $push:{historial}})
        productos.updateOne({_id, 'inventario.stockActual':{$gte:2}}, {$inc:{'inventario.stockActual':-2}})   (por cada producto)
        movimientosInventario.insertMany([...])
     ── commit (o abort si algún producto no tiene stock) ──
  → repos.pagos.actualizarEstado            pedidos.updateOne({'pagos._id':12}, {$set:{'pagos.$.estado':'CONFIRMADO'}})
  ◀── 200 { data: pedido actualizado }
```

---

## 3. Modelo de datos

### Entidades del negocio y colecciones

| Entidad | Colección | Técnica |
|---|---|---|
| Pedido + sus líneas + historial de estados + pagos | `pedidos` | detalles, historial y pagos **embebidos** |
| Producto + su inventario | `productos` | inventario **embebido** (1 a 1) |
| Categoría | `categorias` | colección propia + **referencia extendida** en productos |
| Cliente | `clientes` | colección propia + **referencia extendida** en pedidos |
| Zona de domicilio | `zonas` | colección propia + copia en pedidos |
| Método de pago | `metodosPago` | colección propia + copia en pedidos |
| Movimiento de inventario | `movimientosInventario` | **referencia** a producto y pedido |
| Mensaje de soporte | `mensajesSoporte` | **referencia** a cliente y pedido |
| Administradora | `administradores` | colección propia |
| (numeración) | `contadores` | ids numéricos consecutivos |

### Diagrama

```mermaid
erDiagram
    clientes ||--o{ pedidos : "cliente._id (ref. extendida)"
    zonas ||--o{ pedidos : "zona._id (copia)"
    metodosPago ||--o{ pedidos : "metodoPago._id (copia)"
    categorias ||--o{ productos : "categoria._id (ref. extendida)"
    productos ||--o{ movimientosInventario : "idProducto"
    pedidos ||--o{ movimientosInventario : "idPedido"
    clientes ||--o{ mensajesSoporte : "idCliente"
    pedidos ||--o{ mensajesSoporte : "idPedido"
    pedidos {
        int _id
        string codigo "único"
        object cliente "id, nombre, telefono, correo"
        date fechaPedido
        date fechaEntrega
        string estado
        array detalles "EMBEBIDO"
        array historial "EMBEBIDO"
        array pagos "EMBEBIDO"
    }
    productos {
        int _id
        string nombre
        number precio
        object categoria "id, nombre"
        object inventario "EMBEBIDO: stockActual"
    }
    clientes {
        int _id
        string correo "único sin mayúsculas"
        string passwordHash
    }
```

### Decisiones de diseño

**Embebido (Embedding)** — se usó cuando los datos hijos *pertenecen* al padre, se leen siempre con él y su cantidad está acotada:

- **`pedidos.detalles`**: un pedido de galletas tiene pocas líneas; nunca se consulta una línea sin su pedido. Además, el detalle guarda el **nombre y el precio del momento de la compra**: si mañana sube el precio de la galleta de Nutella, los pedidos viejos no cambian.
- **`pedidos.historial`**: los cambios de estado son a lo sumo 6 o 7 por pedido y se muestran en la barra de seguimiento del cliente.
- **`pedidos.pagos`**: uno o dos comprobantes por pedido.
- **`productos.inventario`**: relación 1 a 1. Al estar en el mismo documento, *crear un producto y su inventario* es un solo `insertOne`, atómico sin transacción.

Resultado: crear un pedido completo (cabecera + detalle + historial + pago) es **un solo `insertOne` atómico**; en un modelo relacional serían 4 tablas dentro de una transacción.

**Referencia (Referencing)** — se usó cuando los datos tienen vida propia, se consultan solos o crecen sin límite:

- **`movimientosInventario`**: crece con cada venta y cada ajuste; embebido en el producto superaría con el tiempo el límite de 16 MB por documento. Guarda `idProducto` e `idPedido`.
- **`mensajesSoporte`**: se gestiona desde su propia pantalla; puede o no estar asociado a un cliente o pedido.
- **`clientes`, `zonas`, `metodosPago`, `categorias`**: se administran por separado y los usan muchos documentos.

**Referencia extendida** — un punto medio: el pedido guarda el `_id` del cliente **y** los campos que se muestran (`nombre`, `telefono`, `correo`). La lista de pedidos del panel no necesita `$lookup`. El costo es mantener la copia: cuando la administradora edita el nombre, teléfono o correo de un cliente, el repositorio ejecuta `pedidos.updateMany({'cliente._id': id}, {$set: …})` en la misma transacción. La zona y el método de pago se copian como **foto histórica** (valor del domicilio cobrado ese día) y no se actualizan.

**Ids numéricos** — se usan enteros como `_id` (en vez de `ObjectId`), porque el frontend, los enlaces (`/api/admin/pedidos/15`) y la conversación con los clientes ("el pedido 1250") usan números cortos. La colección `contadores` genera el siguiente número con `findOneAndUpdate({_id:'pedidos'}, {$inc:{valor:1}})`, que es atómico.

---

## 4. Colecciones

### `pedidos` (documento real de la base)

```json
{
  "_id": 3,
  "codigo": "PC-DEMO03",
  "cliente": { "_id": 2, "nombre": "Andrés Pérez", "telefono": "3017654321", "correo": "andres@demo.com" },
  "fechaPedido": ISODate("2026-11-02T14:15:00Z"),
  "fechaEntrega": ISODate("2026-11-04T00:00:00Z"),
  "tipoEntrega": "DOMICILIO",
  "zona": { "_id": 2, "nombre": "Envigado, Itagüí y Sabaneta", "valor": 8000 },
  "direccionEntrega": "Carrera 48 # 30 Sur-15, Envigado",
  "valorSubtotal": 23000, "valorDomicilio": 8000, "valorTotal": 31000,
  "metodoPago": { "_id": 3, "nombre": "Transferencia Bancolombia", "tipo": "TRANSFERENCIA" },
  "estado": "ENTREGADO",
  "stockDescontado": true,
  "detalles": [
    { "_id": 4, "idProducto": 2, "producto": "Galleta de Arequipe", "cantidad": 2, "precioUnitario": 5500, "subtotal": 11000 },
    { "_id": 5, "idProducto": 1, "producto": "Galleta de Nutella", "cantidad": 2, "precioUnitario": 6000, "subtotal": 12000 }
  ],
  "historial": [
    { "_id": 4, "estadoAnterior": null, "estadoNuevo": "RECIBIDO", "idAdmin": null, "nota": "Pedido registrado por el cliente", "fecha": ISODate("…") },
    { "_id": 5, "estadoAnterior": "RECIBIDO", "estadoNuevo": "PAGADO", "idAdmin": 1, "nota": "Pago confirmado", "fecha": ISODate("…") },
    "… EN_PREPARACION, LISTO, DESPACHADO, ENTREGADO"
  ],
  "pagos": [
    { "_id": 2, "idMetodoPago": 3, "metodoPago": "Transferencia Bancolombia", "valor": 31000, "referencia": "TRX-55102",
      "estado": "CONFIRMADO", "fechaPago": ISODate("…"), "fechaConfirmacion": ISODate("…"), "idAdmin": 1 }
  ]
}
```

`fechaEntrega` es un día sin hora: se guarda como medianoche UTC y la API la devuelve como `"2026-11-04"`. `fechaPedido` es un instante real; los reportes la agrupan en hora de Colombia (`timezone: 'America/Bogota'`).

### `productos`

```json
{
  "_id": 4, "nombre": "Galleta Brownie", "descripcion": "Galleta de chocolate intenso con textura de brownie.",
  "precio": 6500, "imagenUrl": "/img/productos/brownie.svg", "activo": true, "controlaInventario": true,
  "categoria": { "_id": 1, "nombre": "Galletas" },
  "inventario": { "stockActual": 3, "fechaActualizacion": ISODate("…") }
}
```

Los productos que no controlan inventario (por ejemplo la caja surtida) tienen `inventario: null`.

### Resto de colecciones

| Colección | Campos |
|---|---|
| `clientes` | `_id, nombre, telefono, correo, direccion, ciudad, passwordHash (bcrypt), fechaRegistro` |
| `administradores` | `_id, nombre, usuario, passwordHash` |
| `categorias` | `_id, nombre, descripcion` |
| `zonas` | `_id, nombre, valor, activo` |
| `metodosPago` | `_id, nombre, tipo, banco, titular, numeroCuenta, instrucciones, requiereReferencia, activo` |
| `movimientosInventario` | `_id, idProducto, producto, tipo (ENTRADA/SALIDA/AJUSTE/REINTEGRO), cantidad, motivo, idPedido, idAdmin, fecha` |
| `mensajesSoporte` | `_id, idCliente, nombre, correo, asunto, mensaje, idPedido, estado (ABIERTO/RESPONDIDO), respuesta, fecha, fechaRespuesta` |
| `contadores` | `_id (nombre de la colección), valor (último id usado)` |

---

## 5. Reglas de negocio, validaciones e índices

Las reglas se aplican en **dos capas**:

1. **API (servicios)** — la validación principal, con mensajes claros para el usuario: precios calculados en el servidor (no se confía en el navegador), fecha de entrega no anterior a hoy, stock suficiente, transiciones de estado permitidas (`RECIBIDO → PAGADO → EN_PREPARACION → LISTO → DESPACHADO/ENTREGADO`), el cliente solo cancela en `RECIBIDO`, contraseña de 8+ caracteres con letras y números, etc.
2. **Base de datos (`$jsonSchema`)** — segunda línea de defensa; si por un error de programación llega un dato inválido, MongoDB lo rechaza (código 121) y la API responde 400.

| Regla | Validador MongoDB |
|---|---|
| `precio > 0` | `precio: { minimum: 0, exclusiveMinimum: true }` |
| `stock_actual >= 0` | `inventario.stockActual: { minimum: 0 }` |
| `estado_pedido IN (…)` | `estado: { enum: [7 estados] }` |
| `tipo_entrega IN ('DOMICILIO','RECOGER')` | `tipoEntrega: { enum: [...] }` |
| `cantidad > 0` | `detalles.cantidad: { minimum: 1 }` |
| pedido con al menos un producto | `detalles: { minItems: 1 }` |
| estado del pago | `pagos.estado: { enum: ['PENDIENTE','CONFIRMADO','RECHAZADO'] }` |
| formato de correo | `correo: { pattern: '^[^\\s@]+@…' }` |

**Índices** (definidos en `src/db/mongo-esquema.js`):

| Colección | Índice | Para qué |
|---|---|---|
| `clientes` | `correo` único, *collation* `es` fuerza 2 | inicio de sesión; `Laura@Demo.com` y `laura@demo.com` son el mismo correo |
| `administradores` | `usuario` único | inicio de sesión del panel |
| `pedidos` | `codigo` único | seguimiento por código `PC-XXXXXX` |
| `pedidos` | `cliente._id + fechaPedido` | "Mis pedidos" |
| `pedidos` | `estado + fechaEntrega` | filtros del panel y calendario |
| `pedidos` | `pagos._id` único (multikey) | ubicar un pago embebido |
| `pedidos` | `pagos.estado` | pagos por confirmar |
| `productos` | `activo + categoria._id` | catálogo de la tienda y filtro por categoría |
| `movimientosInventario`, `mensajesSoporte` | por producto / estado / cliente | listados del panel |

**Búsqueda de texto**: se hace con una expresión regular sin distinguir mayúsculas ni tildes sobre `nombre` y `descripcion` (`"nute"` encuentra *Nutella*, `"perez"` encuentra *Pérez*). Se probó el índice de texto (`$text`) y se descartó: solo encuentra palabras completas, y en la tienda la gente escribe parte de la palabra. Con decenas de productos la expresión regular recorre la colección en milisegundos; si el catálogo creciera a miles, se usaría Atlas Search. Los caracteres especiales se escapan antes de armar la expresión, para que una búsqueda como `.*` no devuelva todo.

**Transacciones**: se usan solo donde se tocan varios documentos: `aplicarTransicion` (estado del pedido + inventario de cada producto + movimientos), `inventario.ajustar` (producto + movimiento) y las eliminaciones (`productos.eliminar`, `zonas.eliminar`, `metodosPago.eliminar`, `clientes.eliminar`), que cuentan si algún pedido usa el registro y lo borran en la misma transacción, para que ningún pedido nuevo se cuele entre la verificación y el borrado. Si un producto no tiene stock, la transacción se deshace completa; la prueba `MG-03` lo comprueba. Para evitar que dos administradores cambien el mismo pedido a la vez, el `findOneAndUpdate` filtra por el estado esperado (**bloqueo optimista**).

---

## 6. Consultas, reportes e indicadores

Endpoints del panel (requieren sesión de administrador):

```
GET /api/admin/reportes                         lista de reportes
GET /api/admin/reportes/:nombre?desde=AAAA-MM-DD&hasta=AAAA-MM-DD&limite=5
```

| # | Reporte | Pregunta que responde | Operadores |
|---|---|---|---|
| R1 | `productosMasVendidos` | ¿Qué galletas se venden más y cuánto dinero dejan? | `$match $unwind $group $sort $limit $lookup $project` |
| R2 | `ventasPorMes` | ¿Cómo van las ventas mes a mes? (pedidos, total, ticket promedio) | `$match $group($dateToString, $avg) $sort $project` |
| R3 | `pedidosPorZona` | ¿A qué zonas se envía más? ¿Cuánto se cobra en domicilios? | `$match $group($ifNull) $sort` |
| R4 | `mejoresClientes` | ¿Quiénes compran más y de qué ciudad son? | `$group $sort $limit $lookup(clientes) $project` |
| R8 | `ventasPorCategoria` | ¿Qué tipo de producto deja más ingresos? | `$match $unwind $lookup(productos) $unwind $group($addToSet) $project($size) $sort` |
| R5 | `pedidosPorEstado` | ¿Cuántos pedidos hay en cada etapa y cuánto dinero representan? | `$group $sort` |
| R6 | `pagosPorMetodo` | ¿Qué métodos de pago se usan? ¿Cuánto está confirmado y cuánto pendiente? | `$unwind(pagos) $group($cond)` |
| R7 | `inventarioVsDemanda` | ¿Alcanza el stock para los pedidos que aún no lo han descontado? | `$match $unwind $group $lookup $project($subtract, $max)` |

Ejemplo, R1 (`src/repositories/mongo/reportes.js`):

```js
db.pedidos.aggregate([
  { $match: { estado: { $ne: 'CANCELADO' } } },
  { $unwind: '$detalles' },                                  // una fila por línea de producto
  { $group: { _id: '$detalles.idProducto',
              producto: { $first: '$detalles.producto' },
              unidades: { $sum: '$detalles.cantidad' },
              ingresos: { $sum: '$detalles.subtotal' } } },
  { $sort: { unidades: -1 } },
  { $limit: 5 },
  { $lookup: { from: 'productos', localField: '_id', foreignField: '_id', as: 'prod' } },  // categoría y stock actual
  { $unwind: '$prod' },
  { $project: { _id: 0, producto: 1, unidades: 1, ingresos: 1,
                categoria: '$prod.categoria.nombre', stockActual: '$prod.inventario.stockActual' } }
])
```

Respuesta con la carga inicial (los números cambian un poco según el día en que se cargue):

```json
[{ "producto": "Galleta de Nutella",  "unidades": 1825, "ingresos": 10950000, "categoria": "Galletas", "stockActual": 24 },
 { "producto": "Galleta de Arequipe", "unidades": 1548, "ingresos": 8514000,  "categoria": "Galletas", "stockActual": 18 },
 { "producto": "Galleta de Oreo",     "unidades": 1388, "ingresos": 8328000,  "categoria": "Galletas", "stockActual": 20 }]
```

Los ocho reportes se ven en el panel, módulo **📈 Reportes**, con filtros de fecha y de tamaño del ranking.

R7 es el más útil para el negocio: antes de hornear, dice cuántas unidades de cada galleta están comprometidas en pedidos activos y cuántas faltan.

---

## 6b. CRUD, búsqueda y filtros

| Entidad | Crear | Consultar | Actualizar | Eliminar | Buscar y filtrar |
|---|---|---|---|---|---|
| Productos | Panel › Productos › + Nuevo | tienda y panel | Editar (precio, foto, visible) | Editar › Eliminar | texto (nombre o descripción), categoría, visibles/ocultos/agotados; en la tienda, cuadro *Buscar galletas* |
| Pedidos | el cliente en la tienda | panel, Mis pedidos, calendario | cambio de estado, pago | el cliente lo cancela en *Recibido* | código, cliente o teléfono; estado; rango de fechas de entrega |
| Clientes | registro en la tienda, o panel › Clientes › + Nuevo cliente (pedidos por WhatsApp) | panel › Clientes (con sus pedidos y total comprado vía `$lookup`) | panel › Clientes › Editar (actualiza la copia en sus pedidos) | Editar › Eliminar | nombre, correo o teléfono; ciudad |
| Zonas de domicilio | Pagos y domicilios › + Agregar | tienda y panel | Editar | Editar › Eliminar | — |
| Métodos de pago | Pagos y domicilios › + Agregar | tienda y panel | Editar | Editar › Eliminar | — |
| Inventario | al crear el producto | panel › Inventario | Ajustar (con movimiento) | — | — |

**Reglas al eliminar** (`DELETE /api/admin/productos/:id`, `/zonas/:id`, `/metodos-pago/:id`, `/clientes/:id`):

- Un producto, una zona, un método de pago o un cliente que **algún pedido ya usa no se elimina**: la API responde `409` con el número de pedidos y sugiere ocultarlo o desactivarlo. Así no se pierde la trazabilidad de ventas, inventario y pagos.
- Debe quedar **al menos un método de pago activo**, para que los clientes puedan pagar.
- Al eliminar un producto sin pedidos se borran también sus movimientos de inventario (no quedan registros huérfanos). Al eliminar un cliente sin pedidos, sus mensajes de soporte se conservan sin la referencia.
- Un cliente registrado desde el panel no tiene contraseña; si después crea su cuenta en la tienda con el mismo correo, la cuenta se activa y conserva su historial.

---

## 7. Carga inicial de datos

```bash
npm run mongo:cargar                    # datos base + histórico de prueba de 12 meses
npm run mongo:cargar -- --solo-base     # solo catálogo, zonas, métodos, administradora y 2 clientes
npm run mongo:cargar -- --reiniciar     # borra las colecciones y vuelve a cargar
# opcionales: --clientes=200 --pedidos=1500 --mensajes=40 --semilla=2026
```

El script (`src/db/cargar-datos.js`) hace siete pasos:

1. **Datos base**: el catálogo real de Pecantojos (6 productos, 2 categorías), 3 zonas, 5 métodos de pago, la administradora y 2 clientes de demostración. La contraseña de la administradora sale de `ADMIN_PASSWORD` en el `.env`.
2. **Histórico de prueba** (`src/db/carga/historico.js`): ~200 clientes con correos `@ejemplo.com` (contraseña `Cliente123`), 4 sabores nuevos lanzados durante el año, ~1.500 pedidos con picos en mayo, septiembre y diciembre, sus pagos, los movimientos de inventario y ~40 mensajes de soporte. Respeta las reglas de la aplicación: solo transiciones permitidas, el stock nunca queda negativo (antes de vender sin existencias registra una entrada de producción), totales iguales a la suma de las líneas y códigos únicos. Es determinista (misma semilla, mismos datos) y deja en curso los pedidos de los últimos días.
3. **Armar documentos** (`src/db/carga/armar-documentos.js`): embebe detalles, historial, pagos e inventario y arma las referencias extendidas.
4. **Preparar** las colecciones con sus validadores `$jsonSchema` e índices.
5. **Insertar** con `insertMany({ ordered: false })`: si el validador rechaza un documento, inserta los demás y lista el rechazado con el motivo.
6. **Contadores**: el siguiente pedido que se cree desde la tienda continúa la numeración.
7. **Verificar**: compara los documentos esperados con los que quedaron en MongoDB, cuenta los embebidos con `$size` y compara la suma de ventas.

```
[7/7] Verificando
  ✔ clientes               esperado   202  ·  en MongoDB   202
  ✔ productos              esperado    10  ·  en MongoDB    10
  ✔ pedidos                esperado  1503  ·  en MongoDB  1503
  ✔ movimientosInventario  esperado  3077  ·  en MongoDB  3077
  ✔ pedidos.detalles       esperado  3083  ·  en MongoDB  3083  (embebidos)
  ✔ pedidos.historial      esperado  7764  ·  en MongoDB  7764  (embebidos)
  ✔ ventas totales          esperado 72832500  ·  en MongoDB 72832500

✔ Carga completada sin diferencias.
```

Si la base ya tiene datos, el script se detiene sin tocar nada (protección contra duplicados). La creación del clúster de Atlas, la conexión y la publicación en Azure están en [`DESPLIEGUE.md`](DESPLIEGUE.md).

---

## 8. Pruebas

| Comando | Qué prueba |
|---|---|
| `npm test` | 73 pruebas sin base de datos: dominio, servicios, API con datos en memoria, armado de documentos y el histórico de prueba (CA-01 a CA-10) |
| `npm test` con `PC_TEST_MONGO_URI` | 103 pruebas: las anteriores más las pruebas de la API contra MongoDB real y 11 propias de MongoDB (MG-01 a MG-11: documentos embebidos, rollback de la transacción, validadores, correo único, contadores, reportes, eliminación protegida, búsqueda y actualización de la referencia extendida). Usa bases `pecantojos_test*`, que borra y recarga |
| `node tests/e2e/flujo-completo.js` | Recorre la tienda y el panel en un navegador real (24 pasos, incluidos búsqueda, eliminación, CRUD de clientes y reportes) contra la app en ejecución |

Para correr las pruebas de MongoDB en Windows (PowerShell):

```powershell
$env:PC_TEST_MONGO_URI="mongodb+srv://pecantojos_app:TU_CLAVE@pecantojos.xxxxx.mongodb.net/"; npm run test:mongo
```

---

## 9. Solución de problemas

| Mensaje | Causa y solución |
|---|---|
| `querySrv ENOTFOUND` | La cadena está mal copiada o no hay internet. Copia de nuevo desde *Connect › Drivers*. |
| `bad auth : authentication failed` | Usuario o contraseña incorrectos, o la contraseña tiene caracteres sin codificar. |
| `Server selection timed out` | Tu IP no está en **Network Access**. Agrégala (cambia si cambias de red). |
| `not authorized … to execute command collMod/createIndexes` | El usuario no tiene permisos de administración: usa el rol *Atlas admin* para la carga inicial. |
| `La base "pecantojos" ya tiene datos` | Ya hiciste la carga antes. Usa `--reiniciar` si quieres volver a cargar (borra todo). |
| `Documento rechazado por el validador` | Un dato no cumple una regla del esquema; el mensaje dice cuál. |
