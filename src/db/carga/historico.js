// Histórico de prueba para la carga inicial (npm run mongo:cargar).
//
// A los datos base (catálogo, zonas, métodos de pago) les suma un histórico SINTÉTICO de ~12 meses:
// clientes, pedidos con su detalle, historial y pagos, movimientos de inventario, algunos productos
// nuevos y mensajes de soporte. Sirve para que los reportes tengan volumen y se vean tendencias.
// Los clientes de prueba usan correos @ejemplo.com y la contraseña Cliente123.
//
// Reglas que respeta (las mismas de la aplicación):
//  - Las transiciones de estado son las permitidas (src/domain/estados.js).
//  - El stock se descuenta al confirmar el pago (Nequi, Daviplata, transferencia) o al despachar /
//    entregar (efectivo y tarjeta); un pedido pagado que se cancela devuelve el stock (REINTEGRO).
//  - El stock nunca queda negativo: antes de cada salida sin existencias se registra una ENTRADA
//    (producción del día). Al final, los productos base se cuadran con un AJUSTE para que su
//    stock actual sea el de los datos base.
//  - Totales = suma de líneas + domicilio de la zona. Códigos PC-XXXXXX únicos.
//  - Los ids continúan después del mayor id de los datos base.
//
// Es determinista: con la misma semilla genera exactamente los mismos datos.
const bcrypt = require('bcryptjs');
const { transicionesValidas, movimientoInventario } = require('../../domain/estados');

const HORA = 3600000;
const DIA = 24 * HORA;

function crearAzar(semilla) {
  let a = semilla >>> 0;
  const r = () => { // mulberry32
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  r.entero = (min, max) => min + Math.floor(r() * (max - min + 1));
  r.uno = (lista) => lista[Math.floor(r() * lista.length)];
  r.prob = (p) => r() < p;
  r.pesado = (pares) => { // [[valor, peso], ...]
    const total = pares.reduce((s, [, w]) => s + w, 0);
    let x = r() * total;
    for (const [v, w] of pares) { if ((x -= w) < 0) return v; }
    return pares[pares.length - 1][0];
  };
  return r;
}

const NOMBRES = ['Valentina', 'Santiago', 'Mariana', 'Sebastián', 'Isabella', 'Samuel', 'Sara', 'Matías', 'Daniela', 'Alejandro',
  'Camila', 'Juan José', 'Sofía', 'Tomás', 'Luciana', 'Emilio', 'Gabriela', 'David', 'Manuela', 'Nicolás', 'Paula', 'Felipe',
  'Juliana', 'Andrés', 'Natalia', 'Esteban', 'Catalina', 'Simón', 'María José', 'Jerónimo', 'Antonia', 'Miguel', 'Salomé',
  'Carlos', 'Laura', 'Julián', 'Verónica', 'Cristian', 'Paola', 'Mateo', 'Alejandra', 'Diego', 'Luisa', 'Óscar', 'Carolina',
  'Jorge', 'Ana María', 'Ricardo', 'Melissa', 'Hernán'];
const APELLIDOS = ['Restrepo', 'Gómez', 'Rodríguez', 'Zapata', 'Ospina', 'Álvarez', 'Henao', 'Mejía', 'Vélez', 'Londoño',
  'Muñoz', 'Arango', 'Jaramillo', 'Giraldo', 'Correa', 'Montoya', 'Cardona', 'Echeverri', 'Hernández', 'Pérez', 'Duque',
  'Sánchez', 'Castaño', 'Uribe', 'Ramírez', 'Quintero', 'Marín', 'Toro', 'Agudelo', 'Betancur', 'Rivera', 'Osorio',
  'Gaviria', 'Valencia', 'Posada', 'Bedoya', 'Salazar', 'Villa', 'Moreno', 'Franco'];
// Ciudad -> palabra para buscar la zona de domicilio correspondiente
const CIUDADES = [['Medellín', 'Medellín', 55], ['Envigado', 'Envigado', 14], ['Itagüí', 'Itagüí', 9], ['Sabaneta', 'Sabaneta', 7],
  ['Bello', 'Bello', 9], ['La Estrella', 'otras', 3], ['Copacabana', 'otras', 3]];
const VIAS = ['Calle', 'Carrera', 'Circular', 'Transversal', 'Diagonal', 'Avenida'];
const OBSERVACIONES = ['Para un cumpleaños', 'Es un regalo, por favor sin precio', 'Tocar el timbre del apartamento',
  'Dejar en portería', 'Llamar al llegar', 'Para una reunión de oficina', 'Para el día de la madre', 'Con tarjeta de feliz cumpleaños',
  'Entregar después de las 3 p. m.', 'Por favor bien empacadas'];
const NOTAS_ENTREGA = ['', '', '', 'Recibió el cliente', 'Recibió la portería', 'Entregado sin novedad'];
const MOTIVOS_CANCELACION = ['El cliente canceló el pedido', 'No se recibió el pago', 'El cliente cambió la fecha y pidió de nuevo',
  'Dirección fuera de cobertura'];

const PRODUCTOS_NUEVOS = [
  { nombre: 'Galleta de Maní', descripcion: 'Galleta de mantequilla de maní con trozos de maní tostado.', precio: 5500, mesesDesde: 9 },
  { nombre: 'Galleta de Avena y Arándanos', descripcion: 'Avena, arándanos deshidratados y un toque de canela.', precio: 5000, mesesDesde: 7 },
  { nombre: 'Galleta de Limón', descripcion: 'Galleta suave con ralladura de limón y glaseado cítrico.', precio: 5500, mesesDesde: 5 },
  { nombre: 'Galleta de Chocolate Blanco y Macadamia', descripcion: 'Chips de chocolate blanco y nueces de macadamia.', precio: 7000, mesesDesde: 3 },
];

// Peso relativo de pedidos por mes (0 = enero). Picos en mayo (madres), septiembre (amor y amistad) y diciembre.
const PESO_MES = [0.8, 0.85, 0.9, 0.95, 1.5, 1.0, 0.95, 0.95, 1.3, 1.05, 1.15, 1.8];
const PESO_DIA = [1.35, 0.75, 0.8, 0.85, 1.0, 1.3, 1.5]; // domingo..sábado

const dos = (n) => String(n).padStart(2, '0');
const isoDia = (d) => `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`;
const maxId = (lista) => lista.reduce((m, x) => Math.max(m, Number(x.id) || 0), 0);
const sinTildes = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const conHora = (dia, h, m = 0) => { const d = new Date(dia); d.setHours(h, m, 0, 0); return d; };

/**
 * @param {object} origen  datos base con la forma de seed.js (no se modifica)
 * @param {object} opciones { clientes, pedidos, semilla, ahora }
 * @returns {{ datos: object, resumen: object }}  datos = base + filas generadas
 */
function generarHistorico(origen, opciones = {}) {
  const cfg = { clientes: 200, pedidos: 1500, mensajes: 40, semilla: 2026, ahora: new Date(), ...opciones };
  const r = crearAzar(cfg.semilla);
  const ahora = new Date(cfg.ahora);
  const inicio = new Date(ahora); inicio.setFullYear(inicio.getFullYear() - 1); inicio.setHours(0, 0, 0, 0);

  const d = Object.fromEntries(Object.entries(origen).map(([k, v]) => [k, Array.isArray(v) ? v.map((x) => ({ ...x })) : v]));
  const sig = Object.fromEntries(['clientes', 'productos', 'pedidos', 'detalles', 'historial', 'pagos', 'movimientos', 'mensajes']
    .map((k) => [k, maxId(d[k] || [])]));
  const nuevoId = (k) => ++sig[k];
  const idAdmin = d.admins.length ? Number(d.admins[0].id) : null;
  const antes = Object.fromEntries(Object.entries(d).map(([k, v]) => [k, v.length]));

  // ---------- Productos nuevos ----------
  const catGalletas = d.categorias.find((c) => sinTildes(c.nombre).includes('galleta')) || d.categorias[0];
  const nombresExistentes = new Set(d.productos.map((p) => sinTildes(p.nombre)));
  const lanzamiento = new Map(); // idProducto -> fecha desde la que se vende
  for (const p of PRODUCTOS_NUEVOS) {
    if (nombresExistentes.has(sinTildes(p.nombre))) continue;
    const id = nuevoId('productos');
    d.productos.push({ id, idCategoria: catGalletas.id, nombre: p.nombre, descripcion: p.descripcion, precio: p.precio,
      imagenUrl: '/img/productos/generica.svg', activo: true, controlaInventario: true });
    d.inventario.push({ idProducto: id, stockActual: 0, fechaActualizacion: ahora });
    const desde = new Date(ahora); desde.setMonth(desde.getMonth() - p.mesesDesde);
    lanzamiento.set(id, desde);
  }
  const vendibles = d.productos.filter((p) => p.activo);
  if (!vendibles.length) throw new Error('Los datos base no tienen productos activos para generar pedidos');
  const productoPorId = new Map(d.productos.map((p) => [Number(p.id), p]));
  const popularidad = new Map(vendibles.map((p, i) => [Number(p.id), [6, 5, 4.5, 3.5, 3, 2.5][i] || 2.5]));

  // ---------- Zonas y métodos ----------
  const zonasActivas = d.zonas.filter((z) => z.activo);
  const zonaDeCiudad = (palabra) => zonasActivas.find((z) => sinTildes(z.nombre).includes(sinTildes(palabra)))
    || zonasActivas[zonasActivas.length - 1] || null;
  const metodosActivos = d.metodos.filter((m) => m.activo);
  if (!metodosActivos.length) throw new Error('Los datos base no tienen métodos de pago activos');
  const pesoMetodo = (m) => ({ BILLETERA: m.nombre.toLowerCase().includes('nequi') ? 40 : 14, TRANSFERENCIA: 18, EFECTIVO: 18, TARJETA: 10 }[m.tipo] || 10);
  const esDigital = (m) => m.tipo === 'BILLETERA' || m.tipo === 'TRANSFERENCIA';

  // ---------- Clientes ----------
  const hash = bcrypt.hashSync('Cliente123', 8); // misma contraseña para todos los clientes de prueba
  const correos = new Set(d.clientes.map((c) => sinTildes(c.correo)));
  const telefonos = new Set(d.clientes.map((c) => String(c.telefono)));
  const nuevosClientes = [];
  for (let i = 0; i < cfg.clientes; i++) {
    const nombre = r.uno(NOMBRES);
    const ap1 = r.uno(APELLIDOS); let ap2 = r.uno(APELLIDOS); if (ap2 === ap1) ap2 = r.uno(APELLIDOS);
    const usuario = `${sinTildes(nombre).replace(/ /g, '')}.${sinTildes(ap1)}`;
    let correo = `${usuario}@ejemplo.com`;
    for (let n = 2; correos.has(correo); n++) correo = `${usuario}${n}@ejemplo.com`;
    correos.add(correo);
    let telefono;
    do telefono = `3${r.uno(['00', '01', '04', '10', '11', '13', '14', '15', '16', '17', '20', '22', '23'])}${r.entero(1000000, 9999999)}`; while (telefonos.has(telefono));
    telefonos.add(telefono);
    const [ciudad, palabraZona] = r.pesado(CIUDADES.map(([c, z, w]) => [[c, z], w]));
    const direccion = `${r.uno(VIAS)} ${r.entero(1, 120)}${r.prob(0.2) ? r.uno(['A', 'B', ' Sur']) : ''} # ${r.entero(1, 99)}-${r.entero(1, 99)}${r.prob(0.4) ? `, apto ${r.entero(101, 1504)}` : ''}`;
    // Registro: la mayoría antes o durante el primer semestre del periodo
    const registro = new Date(inicio.getTime() - r.entero(0, 60) * DIA + Math.pow(r(), 1.6) * (ahora - inicio) * 0.92);
    registro.setHours(r.entero(7, 22), r.entero(0, 59), 0, 0);
    const c = { id: nuevoId('clientes'), nombre: `${nombre} ${ap1} ${ap2}`, telefono, correo, direccion, ciudad,
      passwordHash: hash, fechaRegistro: registro };
    c._zona = zonaDeCiudad(palabraZona);
    c._fidelidad = Math.pow(r(), 2.2) * 9 + 0.3; // pocos clientes muy frecuentes, muchos ocasionales
    nuevosClientes.push(c);
  }
  // Los clientes base también pueden aparecer en el histórico
  const todosClientes = [...d.clientes.map((c) => ({ ...c, _zona: zonasActivas[0] || null, _fidelidad: 3,
    fechaRegistro: c.fechaRegistro ? new Date(c.fechaRegistro) : inicio })), ...nuevosClientes];

  // ---------- Fechas de los pedidos (estacionalidad) ----------
  const dias = [];
  for (let t = new Date(inicio); t <= ahora; t = new Date(t.getTime() + DIA)) {
    const crecimiento = 0.7 + 0.6 * ((t - inicio) / (ahora - inicio)); // el negocio crece durante el año
    dias.push([new Date(t), PESO_MES[t.getMonth()] * PESO_DIA[t.getDay()] * crecimiento]);
  }
  const fechasPedido = [];
  for (let i = 0; i < cfg.pedidos; i++) {
    const dia = r.pesado(dias);
    let f = conHora(dia, r.pesado([[8, 1], [9, 2], [10, 3], [11, 3], [12, 2], [13, 2], [14, 3], [15, 3], [16, 3], [17, 3], [18, 4], [19, 4], [20, 3], [21, 2]]), r.entero(0, 59));
    if (f > ahora) f = new Date(ahora.getTime() - r.entero(10, 300) * 60000);
    fechasPedido.push(f);
  }
  fechasPedido.sort((a, b) => a - b);

  // ---------- Pedidos ----------
  const codigos = new Set(d.pedidos.map((p) => p.codigo));
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const codigoUnico = () => { let c; do { c = 'PC-'; for (let i = 0; i < 6; i++) c += abc[Math.floor(r() * abc.length)]; } while (codigos.has(c)); codigos.add(c); return c; };
  const eventosStock = []; // { fecha, idProducto, cantidad, tipo, idPedido }
  const pedidosGenerados = [];

  for (const fechaPedido of fechasPedido) {
    const candidatos = todosClientes.filter((c) => c.fechaRegistro <= fechaPedido);
    const cliente = candidatos.length ? r.pesado(candidatos.map((c) => [c, c._fidelidad])) : todosClientes[0];
    const id = nuevoId('pedidos');

    // Líneas: 1 a 4 productos distintos, disponibles en esa fecha
    const disponibles = vendibles.filter((p) => !lanzamiento.has(Number(p.id)) || lanzamiento.get(Number(p.id)) <= fechaPedido);
    const nLineas = r.pesado([[1, 35], [2, 35], [3, 20], [4, 10]]);
    const elegidos = new Map();
    for (let k = 0; k < nLineas && elegidos.size < disponibles.length; k++) {
      const p = r.pesado(disponibles.filter((x) => !elegidos.has(Number(x.id))).map((x) => [x, popularidad.get(Number(x.id)) || 2.5]));
      const esCaja = !p.controlaInventario && Number(p.precio) > 15000;
      const cantidad = esCaja ? r.pesado([[1, 80], [2, 20]]) : r.pesado([[1, 15], [2, 30], [3, 20], [4, 18], [6, 12], [10, 5]]);
      elegidos.set(Number(p.id), { p, cantidad });
    }
    const detalles = [...elegidos.values()].map(({ p, cantidad }) => ({
      id: nuevoId('detalles'), idPedido: id, idProducto: Number(p.id), cantidad, precioUnitario: Number(p.precio), subtotal: Number(p.precio) * cantidad,
    }));
    const subtotal = detalles.reduce((s, x) => s + x.subtotal, 0);

    const domicilio = cliente._zona && r.prob(0.68);
    const zona = domicilio ? cliente._zona : null;
    const valorDomicilio = zona ? Number(zona.valor) : 0;
    const metodo = r.pesado(metodosActivos.map((m) => [m, pesoMetodo(m)]));
    const fechaEntrega = new Date(fechaPedido.getTime() + r.pesado([[1, 35], [2, 35], [3, 20], [5, 10]]) * DIA);

    const pedido = {
      id, codigo: codigoUnico(), idCliente: Number(cliente.id), fechaPedido, fechaEntrega: isoDia(fechaEntrega),
      tipoEntrega: zona ? 'DOMICILIO' : 'RECOGER', idZona: zona ? Number(zona.id) : null,
      direccionEntrega: zona ? `${cliente.direccion || 'Calle 10 # 10-10'}, ${cliente.ciudad || 'Medellín'}` : null,
      valorSubtotal: subtotal, valorDomicilio, valorTotal: subtotal + valorDomicilio, idMetodoPago: Number(metodo.id),
      estado: 'RECIBIDO', stockDescontado: false, observaciones: r.prob(0.25) ? r.uno(OBSERVACIONES) : '',
    };
    const historial = [{ id: nuevoId('historial'), idPedido: id, estadoAnterior: null, estadoNuevo: 'RECIBIDO', idAdmin: null, nota: 'Pedido registrado por el cliente', fecha: fechaPedido }];
    const pago = {
      id: nuevoId('pagos'), idPedido: id, idMetodoPago: Number(metodo.id), valor: pedido.valorTotal,
      referencia: esDigital(metodo) ? (metodo.tipo === 'TRANSFERENCIA' ? `TRX-${r.entero(10000, 99999)}` : `${metodo.nombre[0].toUpperCase()}${r.entero(1000000, 9999999)}`) : null,
      estado: 'PENDIENTE', fechaPago: fechaPedido, fechaConfirmacion: null, idAdmin: null,
    };

    // Avanza el pedido por los estados permitidos; cada paso respeta transicionesValidas().
    // En los pedidos de los últimos días la tienda todavía no ha hecho todo: quedan pedidos en curso.
    const limite = fechaPedido > ahora - 4 * DIA ? new Date(ahora - r.entero(0, 48) * HORA) : ahora;
    const mover = (nuevo, fecha, nota = '') => {
      if (fecha > limite) return false;
      if (!transicionesValidas(pedido).includes(nuevo)) throw new Error(`Transición inválida generada: ${pedido.estado} -> ${nuevo}`);
      const mov = movimientoInventario(pedido, nuevo);
      if (mov) {
        for (const x of detalles) {
          if (productoPorId.get(x.idProducto).controlaInventario) {
            eventosStock.push({ fecha, idProducto: x.idProducto, cantidad: x.cantidad, tipo: mov === 'DESCONTAR' ? 'SALIDA' : 'REINTEGRO', idPedido: id });
          }
        }
        pedido.stockDescontado = mov === 'DESCONTAR';
      }
      historial.push({ id: nuevoId('historial'), idPedido: id, estadoAnterior: pedido.estado, estadoNuevo: nuevo, idAdmin, nota, fecha });
      pedido.estado = nuevo;
      return true;
    };
    const despues = (base, hMin, hMax) => new Date(base.getTime() + r.entero(hMin * 60, hMax * 60) * 60000);
    const diaEntrega = conHora(fechaEntrega, 8);

    let t = fechaPedido;
    const cancelar = r.prob(0.05);
    if (esDigital(metodo)) {
      if (cancelar && r.prob(0.5)) { // pago rechazado y pedido cancelado
        t = despues(t, 0.3, 3);
        if (t <= limite) { pago.estado = 'RECHAZADO'; pago.fechaConfirmacion = t; pago.idAdmin = idAdmin; }
        mover('CANCELADO', despues(t, 1, 20), r.uno(MOTIVOS_CANCELACION));
      } else {
        t = despues(t, 0.2, 4);
        if (mover('PAGADO', t, 'Pago confirmado')) {
          pago.estado = 'CONFIRMADO'; pago.fechaConfirmacion = t; pago.idAdmin = idAdmin;
          if (cancelar) mover('CANCELADO', despues(t, 2, 24), r.uno(MOTIVOS_CANCELACION));
        }
      }
    } else if (cancelar) {
      mover('CANCELADO', despues(t, 1, 30), r.uno(MOTIVOS_CANCELACION));
    }
    if (pedido.estado === 'PAGADO' || (pedido.estado === 'RECIBIDO' && !esDigital(metodo))) {
      const prep = new Date(Math.max(despues(t, 1, 6), diaEntrega.getTime() - DIA + 15 * HORA));
      const listo = new Date(Math.max(despues(prep, 2, 5), diaEntrega.getTime() + r.entero(0, 90) * 60000));
      if (mover('EN_PREPARACION', prep) && mover('LISTO', listo)) {
        if (pedido.tipoEntrega === 'DOMICILIO') {
          const salida = despues(listo, 0.3, 3);
          if (mover('DESPACHADO', salida)) mover('ENTREGADO', despues(salida, 0.4, 1.5), r.uno(NOTAS_ENTREGA));
        } else {
          mover('ENTREGADO', despues(listo, 0.5, 8), r.uno(['', '', 'El cliente recogió en el local']));
        }
        if (!esDigital(metodo) && pedido.estado === 'ENTREGADO') { // efectivo / tarjeta: se cobra al entregar
          const h = historial[historial.length - 1].fecha;
          pago.estado = 'CONFIRMADO'; pago.fechaConfirmacion = h; pago.idAdmin = idAdmin;
        }
      }
    }
    pedidosGenerados.push({ pedido, detalles, historial, pago });
  }

  // ---------- Inventario: entradas de producción, salidas, reintegros y cuadre final ----------
  eventosStock.sort((a, b) => a.fecha - b.fecha);
  const stock = new Map();
  const ultimaFecha = new Map();
  const movs = [];
  const mov = (idProducto, tipo, cantidad, motivo, idPedido, fecha) => {
    movs.push({ id: 0, idProducto, tipo, cantidad, motivo, idPedido, idAdmin, fecha });
    ultimaFecha.set(idProducto, fecha);
  };
  for (const e of eventosStock) {
    const s = stock.get(e.idProducto) || 0;
    if (e.tipo === 'SALIDA') {
      if (s < e.cantidad) { // producción antes de despachar
        const lote = e.cantidad - s + r.entero(12, 36);
        mov(e.idProducto, 'ENTRADA', lote, s === 0 && !stock.has(e.idProducto) ? 'Inventario inicial' : 'Producción del día', null, new Date(e.fecha.getTime() - r.entero(30, 180) * 60000));
        stock.set(e.idProducto, s + lote);
      }
      stock.set(e.idProducto, stock.get(e.idProducto) - e.cantidad);
    } else {
      stock.set(e.idProducto, s + e.cantidad);
    }
    mov(e.idProducto, e.tipo, e.cantidad, `Pedido ${e.idPedido}`, e.idPedido, e.fecha);
  }
  const inventario = new Map(d.inventario.map((i) => [Number(i.idProducto), i]));
  const cierre = new Date(Math.min(ahora.getTime() - 5 * 60000, Math.max(...movs.map((m) => m.fecha.getTime()), inicio.getTime()) + HORA));
  for (const [idProducto, s] of stock) {
    const inv = inventario.get(idProducto);
    if (lanzamiento.has(idProducto)) { // producto nuevo: su stock es lo que quedó
      inv.stockActual = s; inv.fechaActualizacion = ultimaFecha.get(idProducto) || ahora;
    } else if (s > 0) { // producto base: se cuadra para conservar su stock actual
      mov(idProducto, 'AJUSTE', s, 'Cierre de inventario: merma y degustaciones', null, cierre);
    }
  }
  movs.sort((a, b) => a.fecha - b.fecha);
  for (const m of movs) m.id = nuevoId('movimientos');

  // ---------- Mensajes de soporte ----------
  const ASUNTOS = [
    ['¿Hacen pedidos para empresas?', 'Necesito 60 galletas para un evento de la oficina, ¿manejan descuento por cantidad?', 'Sí, para pedidos de más de 50 unidades te ofrecemos un descuento. Te escribimos por WhatsApp.'],
    ['Cambio de fecha de entrega', 'Hice un pedido y necesito cambiar la fecha de entrega, ¿es posible?', 'Claro, ya actualizamos la fecha. Gracias por avisar.'],
    ['¿Tienen opciones sin azúcar?', 'Quisiera saber si tienen galletas sin azúcar para mi papá.', 'Por ahora no, pero estamos probando una receta. Te avisaremos.'],
    ['No me llegó el comprobante', 'Pagué por Nequi y no veo la confirmación del pedido.', 'Ya confirmamos tu pago, el pedido está en preparación.'],
    ['Felicitaciones', 'Las galletas de Nutella estaban deliciosas, ¡gracias!', '¡Muchas gracias! Nos alegra mucho que te hayan gustado.'],
    ['¿Envían a Rionegro?', 'Quería saber si hacen domicilios a Rionegro.', 'Por ahora solo cubrimos el área metropolitana, pero puedes recoger en el local.'],
    ['Pedido incompleto', 'Me faltó una galleta en el pedido.', 'Qué pena contigo, te enviamos la galleta que faltó sin costo.'],
  ];
  const conPedido = pedidosGenerados.filter((x) => x.pedido.estado !== 'CANCELADO');
  for (let i = 0; i < cfg.mensajes && conPedido.length; i++) {
    const x = r.uno(conPedido);
    const c = todosClientes.find((k) => Number(k.id) === x.pedido.idCliente);
    const [asunto, mensaje, respuesta] = r.uno(ASUNTOS);
    const fecha = despuesDe(x.pedido.fechaPedido, r.entero(1, 72) * HORA, ahora);
    const respondido = fecha < ahora - 2 * DIA || r.prob(0.4);
    d.mensajes.push({
      id: nuevoId('mensajes'), idCliente: Number(c.id), nombre: c.nombre, correo: c.correo, asunto, mensaje,
      idPedido: r.prob(0.6) ? x.pedido.id : null, estado: respondido ? 'RESPONDIDO' : 'ABIERTO',
      respuesta: respondido ? respuesta : null, fecha, fechaRespuesta: respondido ? despuesDe(fecha, r.entero(1, 20) * HORA, ahora) : null,
    });
  }

  // ---------- Resultado ----------
  for (const c of nuevosClientes) { delete c._zona; delete c._fidelidad; d.clientes.push(c); }
  for (const x of pedidosGenerados) {
    d.pedidos.push(x.pedido); d.detalles.push(...x.detalles); d.historial.push(...x.historial); d.pagos.push(x.pago);
  }
  d.movimientos.push(...movs);

  const resumen = Object.fromEntries(Object.keys(d).map((k) => [k, (d[k].length - (antes[k] || 0))]));
  resumen.periodo = `${isoDia(inicio)} a ${isoDia(ahora)}`;
  return { datos: d, resumen };
}

function despuesDe(base, ms, tope) {
  return new Date(Math.min(base.getTime() + ms, tope.getTime() - 60000));
}

module.exports = { generarHistorico };
