// HU-01 catálogo, HU-06 disponibilidad, HU-10 productos e imágenes, HU-05 inventario
const fs = require('fs');
const path = require('path');
const { badRequest, notFound, conflict, AppError } = require('../utils/errors');

const UPLOADS = require('../config').uploadsDir;
const TIPOS_IMAGEN = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };
const MAX_IMAGEN = 2 * 1024 * 1024;
const STOCK_BAJO = 5;

function disponibilidad(p) {
  if (!p.activo) return 'NO_DISPONIBLE';
  if (!p.controlaInventario) return 'DISPONIBLE';
  if (p.stock <= 0) return 'AGOTADO';
  if (p.stock <= STOCK_BAJO) return 'POCAS_UNIDADES';
  return 'DISPONIBLE';
}

const conDisponibilidad = (p) => ({ ...p, disponibilidad: disponibilidad(p) });

function validarProducto(d, parcial = false) {
  const out = {};
  if (!parcial || d.nombre !== undefined) {
    const nombre = String(d.nombre || '').trim();
    if (nombre.length < 3) throw badRequest('El nombre del producto debe tener al menos 3 caracteres');
    out.nombre = nombre;
  }
  if (!parcial || d.precio !== undefined) {
    const precio = Number(d.precio);
    if (!Number.isFinite(precio) || precio <= 0) throw badRequest('El precio debe ser un número mayor que cero');
    out.precio = Math.round(precio);
  }
  if (d.descripcion !== undefined) out.descripcion = String(d.descripcion).trim().slice(0, 400);
  if (d.idCategoria !== undefined) out.idCategoria = d.idCategoria ? Number(d.idCategoria) : null;
  if (d.activo !== undefined) out.activo = Boolean(d.activo);
  if (d.controlaInventario !== undefined) out.controlaInventario = Boolean(d.controlaInventario);
  else if (!parcial) out.controlaInventario = true;
  if (d.imagenUrl !== undefined) out.imagenUrl = d.imagenUrl;
  return out;
}

function filtrosProducto({ q, categoria }) {
  const out = {};
  if (q !== undefined && String(q).trim()) {
    if (String(q).trim().length > 60) throw badRequest('La búsqueda puede tener máximo 60 caracteres');
    out.q = String(q).trim();
  }
  if (categoria !== undefined && categoria !== '') {
    const n = Number(categoria);
    if (!Number.isInteger(n) || n < 1) throw badRequest('La categoría no es válida');
    out.idCategoria = n;
  }
  return out;
}

function createCatalogoService(repos, { uploadsDir = UPLOADS } = {}) {
  return {
    STOCK_BAJO,
    disponibilidad,

    // Búsqueda y filtrado: texto (nombre o descripción) y categoría
    async catalogo({ q, categoria } = {}) {
      return (await repos.productos.listar(filtrosProducto({ q, categoria }))).map(conDisponibilidad);
    },
    async producto(id) {
      const p = await repos.productos.buscarPorId(id);
      if (!p || !p.activo) throw notFound('Producto no encontrado');
      return conDisponibilidad(p);
    },
    async listarAdmin({ q, categoria, visibilidad } = {}) {
      let lista = (await repos.productos.listar({ incluirInactivos: true, ...filtrosProducto({ q, categoria }) })).map(conDisponibilidad);
      if (visibilidad === 'visibles') lista = lista.filter((p) => p.activo);
      else if (visibilidad === 'ocultos') lista = lista.filter((p) => !p.activo);
      else if (visibilidad === 'agotados') lista = lista.filter((p) => p.disponibilidad === 'AGOTADO' || p.disponibilidad === 'POCAS_UNIDADES');
      return lista;
    },

    // Regla: un producto que ya está en algún pedido no se elimina (se perdería la trazabilidad
    // de ventas e inventario); se oculta de la tienda. Uno sin pedidos sí se puede eliminar.
    async eliminar(id) {
      if (!repos.productos.eliminar) throw new AppError(501, 'NO_DISPONIBLE', 'Eliminar productos requiere la base MongoDB');
      const r = await repos.productos.eliminar(id);
      if (!r) throw notFound('Producto no encontrado');
      if (!r.eliminado) {
        throw conflict('PRODUCTO_CON_PEDIDOS', `“${r.producto.nombre}” está en ${r.usos} pedido(s) y no se puede eliminar. Desmarca “Visible en la tienda” para ocultarlo.`, { usos: r.usos });
      }
      return { eliminado: true, id: r.producto.id, nombre: r.producto.nombre };
    },
    categorias() { return repos.productos.categorias(); },

    async crear(data) {
      const d = validarProducto(data);
      return conDisponibilidad(await repos.productos.crear({ imagenUrl: '/img/productos/generica.svg', descripcion: '', ...d }));
    },
    async actualizar(id, data) {
      const d = validarProducto(data, true);
      const p = await repos.productos.actualizar(id, d);
      if (!p) throw notFound('Producto no encontrado');
      return conDisponibilidad(p);
    },

    // Recibe la imagen como data URL (base64) para no depender de librerías de multipart
    async subirImagen(id, dataUrl) {
      const p = await repos.productos.buscarPorId(id);
      if (!p) throw notFound('Producto no encontrado');
      const m = /^data:(image\/[a-z]+);base64,(.+)$/.exec(String(dataUrl || ''));
      if (!m || !TIPOS_IMAGEN[m[1]]) throw badRequest('La imagen debe ser PNG, JPG o WEBP');
      const buf = Buffer.from(m[2], 'base64');
      if (buf.length > MAX_IMAGEN) throw badRequest('La imagen no puede pesar más de 2 MB');
      fs.mkdirSync(uploadsDir, { recursive: true });
      const nombre = `producto-${p.id}-${Date.now()}.${TIPOS_IMAGEN[m[1]]}`;
      fs.writeFileSync(path.join(uploadsDir, nombre), buf);
      return conDisponibilidad(await repos.productos.actualizar(p.id, { imagenUrl: `/uploads/${nombre}` }));
    },

    async inventario() {
      return (await repos.inventario.listar()).map((i) => ({ ...i, bajo: i.stockActual <= STOCK_BAJO }));
    },
    async ajustarStock(idProducto, { stockNuevo, motivo }, idAdmin) {
      const s = Number(stockNuevo);
      if (!Number.isInteger(s) || s < 0) throw badRequest('El stock debe ser un número entero mayor o igual a cero');
      if (!String(motivo || '').trim()) throw badRequest('Indica el motivo del ajuste');
      return repos.inventario.ajustar({ idProducto: Number(idProducto), stockNuevo: s, motivo: String(motivo).trim(), idAdmin });
    },
    movimientos(idProducto) { return repos.inventario.movimientos(idProducto); },
  };
}

module.exports = { createCatalogoService, disponibilidad, STOCK_BAJO };
