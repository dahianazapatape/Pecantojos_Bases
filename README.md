# 🍪 Pecantojos sobre MongoDB Atlas

Sistema web de gestión de pedidos para **Pecantojos**, un emprendimiento de galletas artesanales de Medellín: tienda en línea para el cliente y panel administrativo para el negocio.

Es el **proyecto final de Bases de Datos II**: una aplicación web completa (interfaz → API → base de datos en la nube) sobre **MongoDB Atlas**, con modelo de documentos (embebidos y referencias), validadores `$jsonSchema`, transacciones, CRUD con búsqueda y filtros, y ocho reportes con Aggregation Pipeline. La guía técnica está en **[`docs/MONGODB.md`](docs/MONGODB.md)** y el paso a paso para publicar en **[`docs/DESPLIEGUE.md`](docs/DESPLIEGUE.md)**.

Universidad Católica Luis Amigó · Bases de Datos II · Prof. Juan Carlos Gómez
**Equipo:** Dahiana Zapata Peña · Jhonatan Quintero Restrepo

```
Interfaz (public/) ──▶ API REST Node.js + Express (src/) ──▶ MongoDB Atlas (nube)
```

---

## Funcionalidades

| Cliente (tienda, `/`) | Administración (`/admin`) |
|---|---|
| Catálogo con foto, descripción, precio y disponibilidad en tiempo real | Resumen: pedidos nuevos, entregas del día, pagos por confirmar y stock bajo |
| Carrito con cantidades y subtotal | Pedidos: lista, filtro por estado, detalle y cambio de estado con historial |
| Cuenta de cliente (registro e inicio de sesión) | **Calendario** mensual de pedidos por fecha del pedido o de entrega, con el detalle de cada día |
| Búsqueda de galletas por nombre o descripción | **Clientes**: registrar, editar, eliminar (si no tiene pedidos), buscar y filtrar por ciudad |
| | **Reportes**: 8 consultas de agregación con filtros de fecha y ranking |
| Domicilio por zona: su valor se suma al total **antes** del pago | Pagos: confirmar o rechazar comprobantes |
| Métodos de pago con sus datos (Nequi, Daviplata, transferencia, efectivo) | Productos: crear, editar, ocultar y subir foto |
| Mis pedidos: historial y etapa actual de cada pedido | Inventario: existencias, ajustes con motivo y movimientos |
| Atención al cliente: formulario, preguntas frecuentes y WhatsApp | Atención al cliente: responder mensajes |
| Cancelar un pedido mientras esté en "Recibido" | Configurar métodos de pago y zonas de domicilio |

**Regla de inventario:** el stock se descuenta cuando se **confirma el pago** o cuando el pedido se **despacha o entrega** (lo que ocurra primero), una sola vez y dentro de una transacción. Si un pedido pagado se cancela, las unidades vuelven al inventario.

---

## Inicio rápido (sin base de datos)

Requisitos: **Node.js 22 o superior**.

```bash
npm install
npm run demo
```

Abre <http://localhost:3000> (tienda) y <http://localhost:3000/admin> (administración).

| Rol | Usuario | Contraseña |
|---|---|---|
| Administrador | `admin` | `Pecantojos2026!` |
| Cliente | `cliente@demo.com` | `Cliente123` |

El modo demo guarda los datos en memoria y se reinicia al cerrar el servidor. Sirve como respaldo para la sustentación si no hay conexión a internet (los reportes requieren MongoDB).

## Instalación con MongoDB Atlas

Paso a paso completo (Atlas, carga de datos, GitHub y Azure) en [`docs/DESPLIEGUE.md`](docs/DESPLIEGUE.md). Resumen:

1. Crea un clúster **Free** en Atlas, un usuario de base de datos y permite tu IP en *Network Access*.
2. Copia `.env.example` como `.env` y completa `MONGODB_URI`, `ADMIN_PASSWORD` y `JWT_SECRET`.
3. `npm install` y `npm run mongo:check` (verifica la conexión).
4. `npm run mongo:cargar` (catálogo + histórico de prueba de 12 meses).
5. `npm start` y abre <http://localhost:3000>.

| Script | Qué hace |
|---|---|
| `npm start` | Inicia la tienda y el panel conectados a MongoDB |
| `npm run mongo:check` | Prueba la conexión y cuenta los documentos de cada colección |
| `npm run mongo:preparar` | Crea o actualiza colecciones, validadores e índices sin tocar los datos |
| `npm run mongo:cargar` | Carga inicial y verificación (`--reiniciar`, `--solo-base`, `--pedidos=N`, `--clientes=N`) |
| `npm run demo` | Datos en memoria, sin base de datos (respaldo sin internet) |

---

## Pruebas

```bash
npm test                 # 73 pruebas: dominio, servicios, API en memoria, armado de documentos e histórico
npm run test:mongo       # con PC_TEST_MONGO_URI: la API completa y 11 pruebas propias contra MongoDB real
npm run test:coverage    # cobertura de código
```

Prueba funcional en navegador (24 pasos), contra la app con los datos base:

```bash
npm i -D playwright && npx playwright install chromium
npm run demo                                   # en otra terminal
node tests/e2e/flujo-completo.js docs/capturas
```

---

## Usarlo desde el celular

La tienda y el panel son una **app instalable (PWA)**: en Android aparece el botón **Instalar app** (o menú ⋮ › *Instalar aplicación*); en iPhone, Safari › Compartir › *Agregar a inicio*. La app abre aunque no haya señal y muestra la última información guardada; con conexión, los datos se piden siempre al servidor y se actualizan al volver a la app y cada minuto en el panel.

Para instalarla el celular debe abrir la app por **HTTPS**:

- **Rápido (tu PC encendido):** `npm start` y en otra terminal `cloudflared tunnel --url http://localhost:3000`. Abre en el celular la dirección `https://….trycloudflare.com` que aparece. La dirección cambia cada vez que inicias el túnel.
- **Siempre disponible:** publica la app en Azure App Service con la base en MongoDB Atlas ([`docs/DESPLIEGUE.md`](docs/DESPLIEGUE.md)).

En la misma red Wi-Fi también puedes abrir `http://IP-de-tu-PC:3000` para probar, pero sin HTTPS el navegador no permite instalarla como app.

## Arquitectura

```
public/            Interfaz web (HTML, CSS y JavaScript sin frameworks)
  index.html       Tienda del cliente
  admin.html       Panel administrativo
src/
  server.js        Punto de entrada
  app.js           Composición: repositorios → servicios → controladores → rutas
  config/          Variables de entorno
  domain/          Reglas de negocio puras (estados, totales, validaciones)
  services/        Casos de uso (auth, catálogo, pedidos, tienda)
  controllers/     Traducción HTTP ⇄ servicios
  routes/          API REST (/api, /api/cliente, /api/admin)
  middleware/      Autenticación JWT por rol y manejo de errores
  repositories/
    mongo/         Acceso a MongoDB (documentos embebidos, transacciones y reportes de agregación)
    memory/        Implementación en memoria con la misma interfaz (pruebas y demo)
  db/              Conexión a MongoDB, esquema (validadores e índices) y carga inicial (carga/)
tests/             unit/, integration/, e2e/
docs/              MONGODB.md (guía técnica), DESPLIEGUE.md y evidencias/
```

### API principal

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/productos` | Catálogo público |
| GET | `/api/config` | Zonas, métodos de pago, WhatsApp |
| POST | `/api/pedidos/cotizar` | Subtotal + domicilio + total del carrito |
| POST | `/api/auth/registro` · `/api/auth/login` · `/api/auth/admin/login` | Cuentas y sesión |
| POST | `/api/soporte` | Mensaje de atención al cliente |
| GET/POST | `/api/cliente/pedidos` | Mis pedidos / crear pedido |
| GET | `/api/cliente/pedidos/:codigo` | Seguimiento con etapas |
| POST | `/api/cliente/pedidos/:codigo/pago` · `/cancelar` | Enviar comprobante · cancelar |
| GET | `/api/admin/resumen` · `/pedidos` · `/calendario?mes=AAAA-MM&campo=pedido\|entrega` | Panel |
| PATCH | `/api/admin/pedidos/:id/estado` | Cambiar estado (aplica la regla de inventario) |
| POST | `/api/admin/pagos/:id/confirmar` · `/rechazar` | Gestionar pagos |
| GET/POST/PUT | `/api/admin/productos` · `/inventario` · `/metodos-pago` · `/zonas` · `/soporte` | Administración |
| GET | `/api/admin/reportes/:nombre?desde&hasta&limite` | Reportes con Aggregation Pipeline (8 reportes, ver `docs/MONGODB.md`) |
| POST/PUT/DELETE | `/api/admin/clientes[/:id]` | Registrar, editar y eliminar clientes |
| DELETE | `/api/admin/productos/:id`, `/api/admin/zonas/:id`, `/api/admin/metodos-pago/:id`, `/api/admin/clientes/:id` | Eliminar (solo si ningún pedido lo usa) |
| GET | `/api/productos?q&categoria`, `/api/admin/pedidos?q&estado&desde&hasta`, `/api/admin/clientes?q&ciudad` | Búsqueda y filtros |

Las respuestas tienen la forma `{ "data": ... }` o `{ "error": { "code", "message", "details" } }`.

---

## Flujo de trabajo con Git (Gitflow)

- `main`: versiones publicadas, con etiqueta `vX.Y.Z`.
- `develop`: integración.
- `feature/HU-XX-descripcion`: una rama por historia de usuario, que se une a `develop` con `--no-ff`.
- `release/vX.Y.0`: estabilización antes de unir a `main`.
- Mensajes con [Conventional Commits](https://www.conventionalcommits.org/es/): `feat`, `fix`, `test`, `docs`, `chore`, `refactor`.

Consulta `CONTRIBUTING.md` y `CHANGELOG.md`.
