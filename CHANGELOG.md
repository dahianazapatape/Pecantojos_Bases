# Registro de cambios

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y [versionado semántico](https://semver.org/lang/es/).
Los códigos SC-XX son las solicitudes de cambio respecto al diseño del Entregable 2 (ver manual técnico).

## [3.0.0] · Solución propia sobre MongoDB Atlas
### Agregado
- CRUD completo de clientes en el panel: registrar (pedidos por WhatsApp, sin contraseña), editar y eliminar solo si no tiene pedidos (`409 CLIENTE_CON_PEDIDOS`). Al editar, una transacción actualiza la copia del cliente dentro de sus pedidos (referencia extendida).
- `npm run mongo:cargar`: carga inicial con el catálogo y un histórico de prueba de 12 meses (~200 clientes, ~1.500 pedidos, inventario y mensajes) que respeta las reglas del negocio; verifica conteos y totales. `ADMIN_PASSWORD` define la contraseña de la administradora.
- Pruebas IT-22, MG-11, CA-06 a CA-10 y paso E2E-23.
### Eliminado
- SQL Server: repositorio `mssql`, scripts `database/`, `npm run mongo:migrar`, `db:check` y `db:migrar-admins`, dependencia `mssql`. La base del proyecto es MongoDB Atlas.
### Cambiado
- `docs/DESPLIEGUE.md` reemplaza a `DESPLIEGUE_AZURE.md`, con Atlas, GitHub y Azure.
- El indicador de ventas del resumen ocupa dos columnas para que los valores grandes no se corten.

## [2.1.0] · Requisitos completos del proyecto final
### Agregado
- Eliminar productos, zonas de domicilio y métodos de pago (`DELETE /api/admin/...`), con regla de negocio: lo que un pedido ya usa no se elimina, se oculta o desactiva; siempre queda al menos un método de pago activo. La verificación y el borrado van en una transacción.
- Búsqueda y filtros: productos por texto (sin mayúsculas ni tildes) y categoría, en la tienda y en el panel; pedidos por código, cliente, teléfono, estado y fechas de entrega; clientes por nombre, correo, teléfono y ciudad.
- Módulo **Clientes** en el panel, con número de pedidos, total comprado y último pedido de cada cliente (`$lookup`).
- Módulo **Reportes** en el panel con las consultas de agregación, filtros de fecha y ranking, y un octavo reporte: ventas por categoría.
- Pruebas IT-20, IT-21, UT-40, UT-41, MG-09, MG-10 y pasos E2E-20 a E2E-22.
### Cambiado
- Se quitó el índice de texto de productos: la búsqueda parcial usa expresiones regulares (ver `docs/MONGODB.md`).

## [2.0.0] · Migración a MongoDB Atlas (proyecto final Bases de Datos II)
### Agregado
- Repositorio MongoDB (`src/repositories/mongo`) con la misma interfaz que el de SQL Server: pedidos con detalle, historial y pagos embebidos; productos con inventario embebido; referencias extendidas a cliente, zona, método de pago y categoría.
- Validadores `$jsonSchema` e índices (`src/db/mongo-esquema.js`), transacciones multi-documento y contadores de ids.
- `npm run mongo:migrar`: migración SQL Server → MongoDB con verificación de conteos y totales.
- Siete reportes con Aggregation Pipeline en `/api/admin/reportes/:nombre`.
- Pruebas: transformación de la migración (MI-01 a MI-05), la API completa sobre MongoDB y MG-01 a MG-08.
### Cambiado
- `DB_CLIENT=mongo` es la base por defecto. `Iniciar-Pecantojos.bat` funciona desde cualquier carpeta.

## [1.3.1] · Ajustes de la tienda en la nube
### Corregido
- El precio de un producto ya acepta cualquier valor en pesos (antes solo 1, 101, 201…).
### Agregado
- Las fotos de productos se reducen en el navegador antes de subirlas, así sirven las fotos de la cámara del celular.
- La tienda muestra "Despertando la tienda…" y reintenta sola mientras la base de datos en la nube sale de pausa.

## [1.1.0] · Base del negocio y app para el celular
### Agregado
- `database/base_pecantojos.sql`: base de datos original del negocio (tablas, datos, funciones, procedimientos y vistas), sin contraseñas reales.
- `npm run db:migrar-admins`: pasa los usuarios de ADMINS a ADMINISTRADOR con contraseña cifrada.
- Método de pago con tarjeta (datáfono), que ya aparecía en los pagos de la base del negocio.
- App instalable en el celular (PWA): manifiestos, íconos, service worker, aviso sin conexión y actualización automática de datos.
- Pruebas: revisión de los scripts SQL (DB-01 a DB-04) e instalación de la PWA (IT-19).
### Cambiado
- `migracion_v1.sql` se ajusta a la base del negocio: convierte "En proceso" y "Pagado", fotos por nombre de producto, fecha del pedido con hora, y adapta la vista y procedimientos del curso a los estados nuevos.
- Las fechas de SQL Server se leen en la hora local (antes podían correrse un día).
- En el celular, el menú del panel es una barra desplazable.

## [1.0.0] · MVP Entregable 3
### Agregado
- Panel administrativo: resumen y pedidos (HU-04), estados (HU-07), calendario por fecha del pedido o de entrega (HU-09), pagos (HU-13), productos con foto (HU-10), inventario (HU-05), atención al cliente (HU-14), métodos de pago y zonas (HU-12, HU-13).
- Prueba funcional en navegador de 20 pasos y capturas para el manual de usuario.
- Manual técnico, manual de usuario y presentación de la sustentación.

## [0.4.0] · Tienda del cliente
### Agregado
- Catálogo con foto, descripción, precio y disponibilidad (HU-01, HU-06).
- Carrito con cantidades y subtotal (HU-02).
- Registro e inicio de sesión del cliente (HU-11).
- Checkout con domicilio por zona sumado antes del pago y datos del método de pago (HU-03, HU-12, HU-13).
- Mis pedidos: historial con barra de etapas, envío de comprobante y cancelación (HU-08, HU-11).
- Atención al cliente: preguntas frecuentes, formulario y WhatsApp (HU-14).
- Fuentes locales para funcionar sin internet.

## [0.3.0] · API REST
### Agregado
- Rutas públicas, de cliente y de administrador sobre Express, con autenticación JWT por rol.
- Manejo de errores uniforme `{ error: { code, message, details } }`.
- Pruebas de integración HTTP (16 casos) y prueba opcional contra SQL Server.

## [0.2.0] · Servicios de negocio
### Agregado
- Cuentas de cliente e inicio de sesión del administrador con contraseñas cifradas con bcrypt (HU-11, SC-01).
- Catálogo, disponibilidad, productos, imágenes e inventario con movimientos (HU-01, HU-05, HU-06, HU-10).
- Pedidos: cotización con precios del servidor, registro, seguimiento, estados con historial y calendario (HU-02 a HU-04, HU-07 a HU-09, SC-03).
- Pagos: confirmar y rechazar. El inventario se descuenta al pagar o despachar y se reintegra al cancelar (HU-13, SC-02).
- Atención al cliente, métodos de pago y zonas de domicilio (HU-12 a HU-14, SC-04 a SC-06).
- Pruebas unitarias de servicios (25 casos).

## [0.1.0] · Base del proyecto
### Cambiado
- El prototipo se reorganiza en capas sobre Express (SC-07) y las credenciales de la base de datos pasan a variables de entorno.
### Agregado
- Reglas de dominio: estados del pedido, totales y validaciones, con 14 pruebas unitarias.
- Repositorios de SQL Server con transacciones y repositorio en memoria con la misma interfaz.
- Scripts `schema.sql`, `seed.sql` y `migracion_v1.sql`.
