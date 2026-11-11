// Repositorios en memoria: misma interfaz que los de MongoDB. Se usan en las pruebas y en npm run demo.
// Se usan en las pruebas automáticas y en el modo demo (npm run demo).
const { conflict, notFound } = require('../../utils/errors');
const seed = require('./seed');

const clone = (o) => (o == null ? o : JSON.parse(JSON.stringify(o)));
// Comparación de texto sin mayúsculas ni tildes (igual que la búsqueda de MongoDB)
const norm = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const contiene = (q, ...campos) => !norm(q).trim() || campos.some((c) => norm(c).includes(norm(q).trim()));

function createMemoryRepos({ empty = false } = {}) {
  const db = empty
    ? { categorias: [], productos: [], inventario: [], admins: [], clientes: [], zonas: [], metodos: [], pedidos: [], detalles: [], historial: [], pagos: [], movimientos: [], mensajes: [] }
    : seed();
  const nextId = (arr) => arr.reduce((m, x) => Math.max(m, x.id || 0), 0) + 1;
  const now = () => new Date().toISOString();

  // Ejecuta fn sobre una copia y solo confirma si no hay error (simula una transacción)
  function tx(fn) {
    const snapshot = clone(db);
    try {
      return fn();
    } catch (e) {
      Object.keys(snapshot).forEach((k) => { db[k] = snapshot[k]; });
      throw e;
    }
  }

  const withStock = (p) => {
    const inv = db.inventario.find((i) => i.idProducto === p.id);
    const cat = db.categorias.find((c) => c.id === p.idCategoria);
    return { ...clone(p), categoria: cat ? cat.nombre : null, stock: p.controlaInventario ? (inv ? inv.stockActual : 0) : null };
  };

  const productos = {
    async listar({ incluirInactivos = false, q, idCategoria } = {}) {
      return db.productos.filter((p) => (incluirInactivos || p.activo) && contiene(q, p.nombre, p.descripcion)
        && (!idCategoria || p.idCategoria === Number(idCategoria))).map(withStock);
    },
    async eliminar(id) {
      const p = db.productos.find((x) => x.id === Number(id));
      if (!p) return null;
      const usos = new Set(db.detalles.filter((d) => d.idProducto === p.id).map((d) => d.idPedido)).size;
      if (usos > 0) return { eliminado: false, usos, producto: withStock(p) };
      const antes = withStock(p);
      db.productos = db.productos.filter((x) => x.id !== p.id);
      db.inventario = db.inventario.filter((i) => i.idProducto !== p.id);
      db.movimientos = db.movimientos.filter((m) => m.idProducto !== p.id);
      return { eliminado: true, usos: 0, producto: antes };
    },
    async buscarPorId(id) {
      const p = db.productos.find((x) => x.id === Number(id));
      return p ? withStock(p) : null;
    },
    async crear(data) {
      return tx(() => {
        const p = { id: nextId(db.productos), activo: true, ...data };
        db.productos.push(p);
        if (p.controlaInventario) db.inventario.push({ idProducto: p.id, stockActual: 0, fechaActualizacion: now() });
        return withStock(p);
      });
    },
    async actualizar(id, data) {
      const p = db.productos.find((x) => x.id === Number(id));
      if (!p) return null;
      Object.assign(p, data);
      if (p.controlaInventario && !db.inventario.find((i) => i.idProducto === p.id)) {
        db.inventario.push({ idProducto: p.id, stockActual: 0, fechaActualizacion: now() });
      }
      return withStock(p);
    },
    async categorias() { return clone(db.categorias); },
  };

  const inventario = {
    async listar() {
      return db.productos.filter((p) => p.controlaInventario).map((p) => {
        const inv = db.inventario.find((i) => i.idProducto === p.id) || { stockActual: 0, fechaActualizacion: null };
        return { idProducto: p.id, producto: p.nombre, activo: p.activo, stockActual: inv.stockActual, fechaActualizacion: inv.fechaActualizacion };
      });
    },
    async obtener(idProducto) {
      return clone(db.inventario.find((i) => i.idProducto === Number(idProducto)) || null);
    },
    async ajustar({ idProducto, stockNuevo, motivo, idAdmin }) {
      return tx(() => {
        const inv = db.inventario.find((i) => i.idProducto === Number(idProducto));
        if (!inv) throw notFound('El producto no tiene registro de inventario');
        const diferencia = stockNuevo - inv.stockActual;
        inv.stockActual = stockNuevo;
        inv.fechaActualizacion = now();
        db.movimientos.push({ id: nextId(db.movimientos), idProducto: Number(idProducto), tipo: diferencia >= 0 ? 'ENTRADA' : 'AJUSTE', cantidad: Math.abs(diferencia), motivo, idPedido: null, idAdmin, fecha: now() });
        return clone(inv);
      });
    },
    async movimientos(idProducto) {
      return clone(db.movimientos.filter((m) => !idProducto || m.idProducto === Number(idProducto)).reverse());
    },
  };

  const clientes = {
    async crear(c) {
      const nuevo = { id: nextId(db.clientes), fechaRegistro: now(), ...c };
      db.clientes.push(nuevo);
      return clone(nuevo);
    },
    async activarCuenta(id, datos) {
      const c = db.clientes.find((x) => x.id === Number(id));
      Object.assign(c, datos);
      return clone(c);
    },
    async buscarPorCorreo(correo) { return clone(db.clientes.find((c) => c.correo.toLowerCase() === String(correo).toLowerCase()) || null); },
    async buscarPorId(id) { return clone(db.clientes.find((c) => c.id === Number(id)) || null); },
    async listar({ q, ciudad } = {}) {
      return db.clientes.filter((c) => contiene(q, c.nombre, c.correo, c.telefono) && contiene(ciudad, c.ciudad))
        .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
        .map(({ passwordHash, ...c }) => {
          const ps = db.pedidos.filter((p) => p.idCliente === c.id && p.estado !== 'CANCELADO');
          return { ...clone(c), pedidos: ps.length, totalComprado: ps.reduce((t, p) => t + Number(p.valorTotal), 0),
            ultimoPedido: ps.reduce((m, p) => (!m || p.fechaPedido > m ? p.fechaPedido : m), null) };
        });
    },
    async actualizar(id, datos) {
      const c = db.clientes.find((x) => x.id === Number(id));
      if (!c) return null;
      if (db.clientes.some((x) => x.id !== c.id && x.correo.toLowerCase() === String(datos.correo).toLowerCase())) {
        throw conflict('CORREO_REGISTRADO', 'Ya existe otra cuenta con ese correo');
      }
      Object.assign(c, datos);
      return clone(c);
    },
    async eliminar(id) {
      const c = db.clientes.find((x) => x.id === Number(id));
      if (!c) return null;
      const usos = db.pedidos.filter((p) => p.idCliente === c.id).length;
      if (usos > 0) return { eliminado: false, usos, cliente: clone(c) };
      db.clientes = db.clientes.filter((x) => x.id !== c.id);
      for (const m of db.mensajes) if (m.idCliente === c.id) m.idCliente = null;
      return { eliminado: true, usos: 0, cliente: clone(c) };
    },
  };

  const admins = {
    async buscarPorUsuario(u) { return clone(db.admins.find((a) => a.usuario === u) || null); },
  };

  const catalogo = (key, usa) => ({
    async eliminar(id) {
      const x = db[key].find((y) => y.id === Number(id));
      if (!x) return null;
      const usos = db.pedidos.filter((p) => usa(p, x.id)).length;
      if (usos > 0) return { eliminado: false, usos, item: clone(x) };
      db[key] = db[key].filter((y) => y.id !== x.id);
      return { eliminado: true, usos: 0, item: clone(x) };
    },
    async listar({ soloActivos = false } = {}) { return clone(db[key].filter((x) => !soloActivos || x.activo)); },
    async buscarPorId(id) { return clone(db[key].find((x) => x.id === Number(id)) || null); },
    async guardar(data) {
      if (data.id) {
        const x = db[key].find((y) => y.id === Number(data.id));
        if (!x) return null;
        Object.assign(x, data, { id: x.id });
        return clone(x);
      }
      const nuevo = { activo: true, ...data, id: nextId(db[key]) };
      db[key].push(nuevo);
      return clone(nuevo);
    },
  });
  const zonas = catalogo('zonas', (p, id) => p.idZona === id);
  const metodos = catalogo('metodos', (p, id) => p.idMetodoPago === id || db.pagos.some((g) => g.idPedido === p.id && g.idMetodoPago === id));

  function armarPedido(p) {
    const cliente = db.clientes.find((c) => c.id === p.idCliente);
    const metodo = db.metodos.find((m) => m.id === p.idMetodoPago);
    const zona = db.zonas.find((z) => z.id === p.idZona);
    return {
      ...clone(p),
      cliente: cliente ? { id: cliente.id, nombre: cliente.nombre, telefono: cliente.telefono, correo: cliente.correo } : null,
      metodoPago: metodo ? metodo.nombre : null,
      zona: zona ? zona.nombre : null,
      detalles: db.detalles.filter((d) => d.idPedido === p.id).map((d) => ({ ...clone(d), producto: (db.productos.find((x) => x.id === d.idProducto) || {}).nombre })),
      historial: clone(db.historial.filter((h) => h.idPedido === p.id)),
      pagos: clone(db.pagos.filter((g) => g.idPedido === p.id)),
    };
  }

  function moverStock(pedidoId, tipo, idAdmin) {
    const dets = db.detalles.filter((d) => d.idPedido === pedidoId);
    for (const d of dets) {
      const prod = db.productos.find((x) => x.id === d.idProducto);
      if (!prod || !prod.controlaInventario) continue;
      const inv = db.inventario.find((i) => i.idProducto === d.idProducto);
      if (tipo === 'DESCONTAR') {
        if (!inv || inv.stockActual < d.cantidad) {
          throw conflict('STOCK_INSUFICIENTE', `No hay existencias suficientes de ${prod.nombre}`, { idProducto: prod.id, disponible: inv ? inv.stockActual : 0 });
        }
        inv.stockActual -= d.cantidad;
      } else {
        inv.stockActual += d.cantidad;
      }
      inv.fechaActualizacion = now();
      db.movimientos.push({ id: nextId(db.movimientos), idProducto: d.idProducto, tipo: tipo === 'DESCONTAR' ? 'SALIDA' : 'REINTEGRO', cantidad: d.cantidad, motivo: `Pedido ${pedidoId}`, idPedido: pedidoId, idAdmin, fecha: now() });
    }
  }

  const pedidos = {
    async crear({ pedido, detalles, pago }) {
      return tx(() => {
        const p = { ...pedido, id: nextId(db.pedidos), fechaPedido: now(), stockDescontado: false };
        db.pedidos.push(p);
        detalles.forEach((d) => db.detalles.push({ ...d, id: nextId(db.detalles), idPedido: p.id }));
        db.historial.push({ id: nextId(db.historial), idPedido: p.id, estadoAnterior: null, estadoNuevo: p.estado, idAdmin: null, nota: 'Pedido registrado por el cliente', fecha: now() });
        if (pago) db.pagos.push({ ...pago, id: nextId(db.pagos), idPedido: p.id, fechaPago: now(), fechaConfirmacion: null, idAdmin: null });
        return armarPedido(p);
      });
    },
    async buscarPorId(id) {
      const p = db.pedidos.find((x) => x.id === Number(id));
      return p ? armarPedido(p) : null;
    },
    async buscarPorCodigo(codigo) {
      const p = db.pedidos.find((x) => x.codigo === codigo);
      return p ? armarPedido(p) : null;
    },
    async existeCodigo(codigo) { return db.pedidos.some((x) => x.codigo === codigo); },
    async listar({ estado, idCliente, desde, hasta, q } = {}) {
      return db.pedidos
        .filter((p) => (!estado || p.estado === estado) && (!idCliente || p.idCliente === Number(idCliente))
          && (!desde || p.fechaEntrega >= desde) && (!hasta || p.fechaEntrega <= hasta)
          && (!q || contiene(q, p.codigo, (db.clientes.find((c) => c.id === p.idCliente) || {}).nombre, (db.clientes.find((c) => c.id === p.idCliente) || {}).telefono)))
        .sort((a, b) => (a.fechaPedido < b.fechaPedido ? 1 : -1))
        .map((p) => { const { detalles, historial, pagos: pg, ...r } = armarPedido(p); return { ...r, items: detalles.length }; });
    },
    async aplicarTransicion({ idPedido, estadoAnterior, estadoNuevo, idAdmin, nota, movimiento }) {
      return tx(() => {
        const p = db.pedidos.find((x) => x.id === Number(idPedido));
        if (!p) throw notFound('Pedido no encontrado');
        if (p.estado !== estadoAnterior) throw conflict('ESTADO_CAMBIADO', 'El pedido cambió de estado; recarga la página');
        if (movimiento) moverStock(p.id, movimiento, idAdmin);
        if (movimiento === 'DESCONTAR') p.stockDescontado = true;
        if (movimiento === 'REINTEGRAR') p.stockDescontado = false;
        p.estado = estadoNuevo;
        db.historial.push({ id: nextId(db.historial), idPedido: p.id, estadoAnterior, estadoNuevo, idAdmin, nota: nota || '', fecha: now() });
        return armarPedido(p);
      });
    },
  };

  const pagos = {
    async listar({ estado } = {}) {
      return db.pagos.filter((g) => !estado || g.estado === estado).map((g) => {
        const p = db.pedidos.find((x) => x.id === g.idPedido) || {};
        const c = db.clientes.find((x) => x.id === p.idCliente) || {};
        const m = db.metodos.find((x) => x.id === g.idMetodoPago) || {};
        return { ...clone(g), codigoPedido: p.codigo, estadoPedido: p.estado, cliente: c.nombre, metodoPago: m.nombre };
      }).reverse();
    },
    async buscarPorId(id) { return clone(db.pagos.find((g) => g.id === Number(id)) || null); },
    async crear(pago) {
      const g = { ...pago, id: nextId(db.pagos), estado: pago.estado || 'PENDIENTE', fechaPago: now(), fechaConfirmacion: null, idAdmin: null };
      db.pagos.push(g);
      return clone(g);
    },
    async actualizarReferencia(id, referencia) {
      const g = db.pagos.find((x) => x.id === Number(id));
      if (!g) return null;
      g.referencia = referencia; g.fechaPago = now();
      return clone(g);
    },
    async actualizarEstado(id, estado, idAdmin) {
      const g = db.pagos.find((x) => x.id === Number(id));
      if (!g) return null;
      g.estado = estado; g.idAdmin = idAdmin; g.fechaConfirmacion = now();
      return clone(g);
    },
  };

  const soporte = {
    async crear(m) {
      const n = { ...m, id: nextId(db.mensajes), estado: 'ABIERTO', respuesta: null, fecha: now(), fechaRespuesta: null };
      db.mensajes.push(n);
      return clone(n);
    },
    async listar({ estado } = {}) { return clone(db.mensajes.filter((m) => !estado || m.estado === estado).slice().reverse()); },
    async listarPorCliente(idCliente) { return clone(db.mensajes.filter((m) => m.idCliente === Number(idCliente)).slice().reverse()); },
    async responder(id, respuesta) {
      const m = db.mensajes.find((x) => x.id === Number(id));
      if (!m) return null;
      m.respuesta = respuesta; m.estado = 'RESPONDIDO'; m.fechaRespuesta = now();
      return clone(m);
    },
  };

  return { productos, inventario, clientes, admins, zonas, metodos, pedidos, pagos, soporte, _db: db };
}

module.exports = { createMemoryRepos };
