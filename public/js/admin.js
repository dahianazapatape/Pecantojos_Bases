// Panel administrativo de Pecantojos
(() => {
  const { borrarDatosGuardados, api, dinero, esc, fecha, fechaCorta, hoy, toast, $, $$, guardar, ETIQUETA_DISP } = Pc;
  const ETQ = { RECIBIDO: 'Recibido', PAGADO: 'Pago confirmado', EN_PREPARACION: 'En preparación', LISTO: 'Listo', DESPACHADO: 'Despachado', ENTREGADO: 'Entregado', CANCELADO: 'Cancelado' };
  const TITULOS = { resumen: 'Resumen', pedidos: 'Pedidos', calendario: 'Calendario de pedidos', pagos: 'Pagos', productos: 'Productos', inventario: 'Inventario', atencion: 'Atención al cliente', configuracion: 'Métodos de pago y domicilios', clientes: 'Clientes', reportes: 'Reportes del negocio' };
  const st = { token: guardar.get('pc_admin_token'), nombre: guardar.get('pc_admin_nombre'), modulo: 'resumen', filtroPedidos: '', mes: hoy().slice(0, 7), campoCal: 'pedido', diaSel: null, filtroPagos: 'PENDIENTE', filtroMsj: 'ABIERTO',
    buscaPedidos: '', pedDesde: '', pedHasta: '', buscaProd: '', catProd: '', visProd: '', buscaCli: '', ciudadCli: '', repDesde: '', repHasta: '', repLimite: '5' };
  const qs = (o) => { const p = new URLSearchParams(); Object.entries(o).forEach(([k, v]) => { if (v) p.set(k, v); }); const t = p.toString(); return t ? `?${t}` : ''; };
  const C = () => $('#contenido');
  const etq = (e) => `<span class="etiqueta e-${e}">${esc(ETQ[e] || e)}</span>`;

  async function llamar(ruta, opts = {}) {
    try { return await api(ruta, { ...opts, token: st.token }); } catch (e) {
      if (e.status === 401 || e.status === 403) { salir(); toast('Tu sesión expiró. Ingresa de nuevo.', true); }
      throw e;
    }
  }
  function salir() { borrarDatosGuardados(); st.token = null; guardar.del('pc_admin_token'); guardar.del('pc_admin_nombre'); mostrar(); }
  function mostrar() {
    $('#vistaLogin').classList.toggle('oculto', !!st.token);
    $('#vistaPanel').classList.toggle('oculto', !st.token);
    if (st.token) { $('#nombreAdmin').textContent = st.nombre || ''; ir(st.modulo); }
  }
  function abrirModal(html) { $('#modalCuerpo').innerHTML = html; $('#modal').classList.remove('oculto'); }
  function cerrarModal() { $('#modal').classList.add('oculto'); }
  const datosForm = (f) => Object.fromEntries(new FormData(f).entries());

  async function ir(modulo) {
    st.modulo = modulo;
    st.refrescar = null;
    $$('[data-modulo]').forEach((b) => b.classList.toggle('activo', b.dataset.modulo === modulo));
    $('#tituloModulo').textContent = TITULOS[modulo];
    C().innerHTML = '<p class="vacio">Cargando…</p>';
    try { await MODULOS[modulo](); } catch (e) { C().innerHTML = `<div class="aviso error">${esc(e.message)}</div>`; }
    actualizarBadges();
  }
  async function actualizarBadges() {
    try {
      const r = await llamar('/admin/resumen');
      const set = (id, n) => { $(id).textContent = n; $(id).classList.toggle('oculto', !n); };
      set('#bPedidos', r.porEstado.RECIBIDO); set('#bPagos', r.pagosPendientes); set('#bMensajes', r.mensajesAbiertos);
    } catch { /* ignorado */ }
  }

  function filaPedido(p) {
    return `<tr class="fila-click" data-pedido="${p.id}"><td><span class="codigo">${esc(p.codigo)}</span></td><td>${esc(p.cliente.nombre)}<div class="chico muted">${esc(p.cliente.telefono)}</div></td>
      <td class="chico">${fechaCorta(p.fechaPedido, true)}</td><td>${fechaCorta(p.fechaEntrega)}</td><td>${p.tipoEntrega === 'DOMICILIO' ? '🛵 Domicilio' : '🏠 Recoger'}</td>
      <td>${esc(p.metodoPago)}</td><td class="num">${dinero(p.valorTotal)}</td><td>${etq(p.estado)}</td></tr>`;
  }
  const tablaPedidos = (lista) => (lista.length ? `<div class="tabla-scroll"><table><thead><tr><th>Código</th><th>Cliente</th><th>Pedido</th><th>Entrega</th><th>Tipo</th><th>Pago</th><th class="num">Total</th><th>Estado</th></tr></thead>
    <tbody>${lista.map(filaPedido).join('')}</tbody></table></div>` : '<p class="vacio">No hay pedidos.</p>');

  async function verPedido(id) {
    const p = await llamar(`/admin/pedidos/${id}`);
    const pago = p.pagos[p.pagos.length - 1];
    abrirModal(`<h2>Pedido <span class="codigo">${esc(p.codigo)}</span> ${etq(p.estado)}</h2>
      <div class="dos-col">
        <div><h3>Cliente</h3><p>${esc(p.cliente.nombre)}<br>📞 ${esc(p.cliente.telefono)}<br>✉️ ${esc(p.cliente.correo)}</p>
          <h3>Entrega</h3><p>${fecha(p.fechaEntrega)} · ${p.tipoEntrega === 'DOMICILIO' ? `Domicilio<br>${esc(p.direccionEntrega)}<br><span class="muted">${esc(p.zona)}</span>` : 'Recoger en el local'}
          ${p.observaciones ? `<br><strong>Nota:</strong> ${esc(p.observaciones)}` : ''}</p></div>
        <div><h3>Pago</h3><p>${esc(p.metodoPago)}<br>${pago ? `${etq(pago.estado)} ${pago.referencia ? `Comprobante <strong>${esc(pago.referencia)}</strong>` : 'Sin comprobante'}` : 'Contra entrega'}
          ${pago && pago.estado === 'PENDIENTE' && p.estado !== 'CANCELADO' ? `<br><button class="btn aqua mini" data-confirmar-pago="${pago.id}" style="margin-top:.4rem">Confirmar pago</button> <button class="btn borde mini" data-rechazar-pago="${pago.id}">Rechazar</button>` : ''}</p>
          <p class="chico muted">Inventario: ${p.stockDescontado ? 'ya descontado' : 'aún no descontado (se descuenta al confirmar el pago o despachar)'}</p></div>
      </div>
      <div class="tabla-scroll"><table><thead><tr><th>Producto</th><th class="num">Cant.</th><th class="num">Precio</th><th class="num">Subtotal</th></tr></thead><tbody>
        ${p.detalles.map((d) => `<tr><td>${esc(d.producto)}</td><td class="num">${d.cantidad}</td><td class="num">${dinero(d.precioUnitario)}</td><td class="num">${dinero(d.subtotal)}</td></tr>`).join('')}
        <tr><td colspan="3">Subtotal</td><td class="num">${dinero(p.valorSubtotal)}</td></tr><tr><td colspan="3">Domicilio</td><td class="num">${dinero(p.valorDomicilio)}</td></tr>
        <tr><td colspan="3"><strong>Total</strong></td><td class="num"><strong>${dinero(p.valorTotal)}</strong></td></tr></tbody></table></div>
      ${p.siguientes.length ? `<h3 style="margin-top:1rem">Cambiar estado</h3><form id="formEstado" class="barra-filtros">
        <div class="campo"><label for="nuevoEstado">Nuevo estado</label><select id="nuevoEstado" name="estado">${p.siguientes.map((s) => `<option value="${s.estado}">${esc(s.etiqueta)}</option>`).join('')}</select></div>
        <div class="campo" style="flex:1"><label for="notaEstado">Nota (opcional)</label><input id="notaEstado" name="nota"></div>
        <button class="btn" type="submit">Guardar</button></form>` : ''}
      <h3>Historial</h3><ul class="chico">${p.historial.map((h) => `<li>${fecha(h.fecha, true)} — ${h.estadoAnterior && h.estadoAnterior !== h.estadoNuevo ? `${esc(ETQ[h.estadoAnterior])} → ` : ''}<strong>${esc(ETQ[h.estadoNuevo])}</strong>${h.nota ? ` · ${esc(h.nota)}` : ''}</li>`).join('')}</ul>`);
    const f = $('#formEstado');
    if (f) f.onsubmit = async (ev) => {
      ev.preventDefault();
      try { await llamar(`/admin/pedidos/${p.id}/estado`, { method: 'PATCH', body: datosForm(f) }); toast('Estado actualizado'); verPedido(p.id); ir(st.modulo); } catch (e) { toast(e.message, true); }
    };
  }

  async function procesarPago(id, accion) {
    try { const p = await llamar(`/admin/pagos/${id}/${accion}`, { method: 'POST' }); toast(accion === 'confirmar' ? 'Pago confirmado e inventario descontado' : 'Pago rechazado'); if (!$('#modal').classList.contains('oculto')) verPedido(p.id); ir(st.modulo); } catch (e) { toast(e.message, true); }
  }

  const MODULOS = {
    async resumen() {
      const r = await llamar('/admin/resumen');
      C().innerHTML = `<div class="kpis">
        <div class="tarjeta kpi"><div class="valor">${r.porEstado.RECIBIDO}</div><div class="nombre">Pedidos nuevos</div></div>
        <div class="tarjeta kpi"><div class="valor">${r.pedidosActivos}</div><div class="nombre">Pedidos activos</div></div>
        <div class="tarjeta kpi"><div class="valor">${r.entregasHoy}</div><div class="nombre">Entregas para hoy</div></div>
        <div class="tarjeta kpi"><div class="valor">${r.pagosPendientes}</div><div class="nombre">Pagos por confirmar</div></div>
        <div class="tarjeta kpi kpi-ancho"><div class="valor">${dinero(r.ventasConfirmadas)}</div><div class="nombre">Ventas confirmadas</div></div>
        <div class="tarjeta kpi"><div class="valor">${r.mensajesAbiertos}</div><div class="nombre">Mensajes sin responder</div></div></div>
        <div class="dos-col"><div class="tarjeta"><h3>Próximas entregas</h3>${tablaPedidos(r.proximos)}</div>
        <div class="tarjeta"><h3>Stock bajo</h3>${r.stockBajo.length ? `<table><tbody>${r.stockBajo.map((i) => `<tr><td>${esc(i.producto)}</td><td class="num"><span class="etiqueta ${i.stockActual ? 'e-POCAS_UNIDADES' : 'e-AGOTADO'}">${i.stockActual} und.</span></td></tr>`).join('')}</tbody></table>` : '<p class="vacio">Todo el inventario está en buen nivel.</p>'}
          <h3 style="margin-top:1rem">Pedidos por estado</h3><table><tbody>${Object.entries(r.porEstado).map(([e, n]) => `<tr><td>${etq(e)}</td><td class="num">${n}</td></tr>`).join('')}</tbody></table></div></div>`;
    },

    // Búsqueda (código, cliente o teléfono), rango de fechas de entrega y estado: los filtra la base de datos
    async pedidos() {
      C().innerHTML = `<div class="barra-busqueda"><input type="search" data-buscar="buscaPedidos" value="${esc(st.buscaPedidos)}" placeholder="Buscar por código, cliente o teléfono" aria-label="Buscar pedidos">
          <label>Entrega desde <input type="date" data-buscar="pedDesde" value="${esc(st.pedDesde)}"></label><label>hasta <input type="date" data-buscar="pedHasta" value="${esc(st.pedHasta)}"></label></div>
        <div class="filtros" style="margin-bottom:1rem">${['', ...Object.keys(ETQ)].map((e) => `<button data-filtro-pedidos="${e}" class="${st.filtroPedidos === e ? 'activo' : ''}">${e ? ETQ[e] : 'Todos'}</button>`).join('')}</div>
        <div class="tarjeta" id="resultados"></div>`;
      st.refrescar = async () => {
        const lista = await llamar(`/admin/pedidos${qs({ estado: st.filtroPedidos, q: st.buscaPedidos, desde: st.pedDesde, hasta: st.pedHasta })}`);
        $('#resultados').innerHTML = `<p class="chico muted" style="margin-top:0">${lista.length} pedido(s)</p>${tablaPedidos(lista)}`;
      };
      await st.refrescar();
    },

    async calendario() {
      const r = await llamar(`/admin/calendario?mes=${st.mes}&campo=${st.campoCal}`);
      const [y, m] = st.mes.split('-').map(Number);
      const primero = new Date(y, m - 1, 1);
      const diasMes = new Date(y, m, 0).getDate();
      const offset = (primero.getDay() + 6) % 7; // semana inicia en lunes
      const nm = primero.toLocaleDateString('es-CO', { month: 'long' });
      const nombreMes = `${nm[0].toUpperCase()}${nm.slice(1)} ${y}`;
      const celdas = [];
      for (let i = 0; i < offset; i++) celdas.push('<div class="dia fuera"></div>');
      for (let d = 1; d <= diasMes; d++) {
        const k = `${st.mes}-${String(d).padStart(2, '0')}`;
        const ps = r.dias[k] || [];
        celdas.push(`<div class="dia ${k === hoy() ? 'hoy' : ''} ${k === st.diaSel ? 'sel' : ''}" data-dia="${k}"><span class="n">${d}</span>
          ${ps.slice(0, 3).map((p) => `<span class="ev e-${p.estado}">${esc(p.codigo)} · ${esc(p.cliente.nombre.split(' ')[0])}</span>`).join('')}${ps.length > 3 ? `<span class="chico muted">+${ps.length - 3} más</span>` : ''}</div>`);
      }
      const sel = st.diaSel && r.dias[st.diaSel] ? r.dias[st.diaSel] : null;
      C().innerHTML = `<div class="cal-cab"><div style="display:flex;gap:.5rem;align-items:center"><button class="btn borde mini" data-mes="-1" aria-label="Mes anterior">‹</button>
          <h2 style="margin:0;min-width:12ch;text-align:center">${nombreMes}</h2><button class="btn borde mini" data-mes="1" aria-label="Mes siguiente">›</button>
          <button class="btn claro mini" data-mes="0">Hoy</button></div>
        <div class="filtros"><button data-campo="pedido" class="${st.campoCal === 'pedido' ? 'activo' : ''}">Por fecha del pedido</button><button data-campo="entrega" class="${st.campoCal === 'entrega' ? 'activo' : ''}">Por fecha de entrega</button></div></div>
        <div class="tarjeta"><div class="calendario">${['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map((n) => `<div class="dia-nombre">${n}</div>`).join('')}${celdas.join('')}</div></div>
        <div class="tarjeta" style="margin-top:1rem" id="detalleDia">${st.diaSel ? `<h3>${fecha(st.diaSel)} · ${sel ? sel.length : 0} pedido(s)</h3>${sel ? sel.map((p) => `<div style="border-bottom:1px dashed var(--borde);padding:.6rem 0">
            <div class="pedido-cab"><div><span class="codigo">${esc(p.codigo)}</span> ${etq(p.estado)} — <strong>${esc(p.cliente.nombre)}</strong> <span class="muted chico">${esc(p.cliente.telefono)}</span></div>
            <div><strong>${dinero(p.valorTotal)}</strong> <button class="btn borde mini" data-pedido="${p.id}">Abrir</button></div></div>
            <div class="chico">${p.detalles.map((d) => `${d.cantidad} × ${esc(d.producto)}`).join(' · ')}</div>
            <div class="chico muted">Pedido ${fecha(p.fechaPedido, true)} · Entrega ${fecha(p.fechaEntrega)} · ${p.tipoEntrega === 'DOMICILIO' ? `Domicilio: ${esc(p.direccionEntrega)}` : 'Recoger en local'} · ${esc(p.metodoPago)}</div></div>`).join('') : '<p class="muted">Sin pedidos este día.</p>'}`
        : '<p class="muted" style="margin:0">Selecciona un día para ver los pedidos y su detalle.</p>'}</div>`;
    },

    async pagos() {
      const lista = await llamar(`/admin/pagos${st.filtroPagos ? `?estado=${st.filtroPagos}` : ''}`);
      C().innerHTML = `<div class="filtros" style="margin-bottom:1rem">${[['PENDIENTE', 'Por confirmar'], ['CONFIRMADO', 'Confirmados'], ['RECHAZADO', 'Rechazados'], ['', 'Todos']].map(([v, t]) => `<button data-filtro-pagos="${v}" class="${st.filtroPagos === v ? 'activo' : ''}">${t}</button>`).join('')}</div>
        <div class="tarjeta">${lista.length ? `<div class="tabla-scroll"><table><thead><tr><th>Pedido</th><th>Cliente</th><th>Método</th><th>Comprobante</th><th>Fecha</th><th class="num">Valor</th><th>Estado</th><th></th></tr></thead><tbody>
          ${lista.map((g) => `<tr><td><span class="codigo">${esc(g.codigoPedido)}</span> ${etq(g.estadoPedido)}</td><td>${esc(g.cliente)}</td><td>${esc(g.metodoPago)}</td><td>${esc(g.referencia || '—')}</td>
            <td>${fecha(g.fechaPago, true)}</td><td class="num">${dinero(g.valor)}</td><td>${etq(g.estado)}</td>
            <td>${g.estado === 'PENDIENTE' && g.estadoPedido !== 'CANCELADO' ? `<button class="btn aqua mini" data-confirmar-pago="${g.id}">Confirmar</button> <button class="btn borde mini" data-rechazar-pago="${g.id}">Rechazar</button>` : ''}</td></tr>`).join('')}
          </tbody></table></div>` : '<p class="vacio">No hay pagos en este filtro.</p>'}</div>
        <p class="chico muted">Al confirmar un pago el pedido pasa a “Pago confirmado” y se descuentan las unidades del inventario.</p>`;
    },

    async productos() {
      st.categorias = await llamar('/admin/categorias');
      C().innerHTML = `<div class="barra-busqueda"><button class="btn" data-producto="nuevo">+ Nuevo producto</button>
          <input type="search" data-buscar="buscaProd" value="${esc(st.buscaProd)}" placeholder="Buscar por nombre o descripción" aria-label="Buscar productos">
          <select data-buscar="catProd" aria-label="Categoría"><option value="">Todas las categorías</option>${st.categorias.map((c) => `<option value="${c.id}" ${String(c.id) === st.catProd ? 'selected' : ''}>${esc(c.nombre)}</option>`).join('')}</select>
          <select data-buscar="visProd" aria-label="Visibilidad">${[['', 'Todos'], ['visibles', 'Visibles en la tienda'], ['ocultos', 'Ocultos'], ['agotados', 'Agotados o pocas unidades']].map(([v, t]) => `<option value="${v}" ${v === st.visProd ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
        <div id="resultados"></div>`;
      st.refrescar = async () => {
        const lista = await llamar(`/admin/productos${qs({ q: st.buscaProd, categoria: st.catProd, visibilidad: st.visProd })}`);
        st.productos = lista;
        $('#resultados').innerHTML = `<p class="chico muted" style="margin-top:0">${lista.length} producto(s)</p>${lista.length ? `<div class="grid-productos">${lista.map((p) => `<article class="tarjeta producto ${p.activo ? '' : 'agotado'}"><img class="foto" src="${esc(p.imagenUrl)}" alt="${esc(p.nombre)}">
          <div class="cuerpo"><div><span class="etiqueta e-${p.disponibilidad}">${ETIQUETA_DISP[p.disponibilidad]}</span> <span class="chico muted">${esc(p.categoria || '')}</span></div>
          <h3>${esc(p.nombre)}</h3><p>${esc(p.descripcion)}</p><span class="chico muted">${p.stock == null ? 'Sin control de inventario' : `Stock: ${p.stock}`}</span>
          <div class="pie"><span class="precio">${dinero(p.precio)}</span><button class="btn borde mini" data-producto="${p.id}">Editar</button></div></div></article>`).join('')}</div>` : '<div class="tarjeta vacio">Ningún producto coincide con la búsqueda.</div>'}`;
      };
      await st.refrescar();
    },

    // Clientes: búsqueda por nombre, correo o teléfono y filtro por ciudad; la base suma sus pedidos con $lookup.
    // Se pueden registrar (pedidos por WhatsApp), editar y eliminar (solo si no tienen pedidos).
    async clientes() {
      C().innerHTML = `<div class="barra-busqueda"><button class="btn" data-cliente="nuevo">+ Nuevo cliente</button><input type="search" data-buscar="buscaCli" value="${esc(st.buscaCli)}" placeholder="Buscar por nombre, correo o teléfono" aria-label="Buscar clientes">
          <input type="search" data-buscar="ciudadCli" value="${esc(st.ciudadCli)}" placeholder="Ciudad" aria-label="Filtrar por ciudad" style="flex:0 1 180px"></div>
        <div class="tarjeta" id="resultados"></div>`;
      st.refrescar = async () => {
        const lista = await llamar(`/admin/clientes${qs({ q: st.buscaCli, ciudad: st.ciudadCli })}`);
        st.clientesLista = lista;
        $('#resultados').innerHTML = `<p class="chico muted" style="margin-top:0">${lista.length} cliente(s)</p>${lista.length ? `<div class="tabla-scroll"><table><thead><tr><th>Cliente</th><th>Teléfono</th><th>Ciudad</th><th class="num">Pedidos</th><th class="num">Total comprado</th><th>Último pedido</th><th></th></tr></thead><tbody>
          ${lista.map((c) => `<tr><td><strong>${esc(c.nombre)}</strong><div class="chico muted">${esc(c.correo)}</div></td><td>${esc(c.telefono)}</td><td>${esc(c.ciudad || '—')}</td>
            <td class="num">${c.pedidos}</td><td class="num">${dinero(c.totalComprado)}</td><td class="chico">${c.ultimoPedido ? fecha(c.ultimoPedido, true) : '—'}</td>
            <td class="acciones"><button class="btn borde mini" data-cliente="${c.id}">Editar</button>${c.pedidos ? ` <button class="btn borde mini" data-pedidos-de="${esc(c.telefono)}">Ver pedidos</button>` : ''}</td></tr>`).join('')}</tbody></table></div>` : '<p class="vacio">Ningún cliente coincide con la búsqueda.</p>'}`;
      };
      await st.refrescar();
    },

    // Reportes: consultas de Aggregation Pipeline en MongoDB (GET /api/admin/reportes/:nombre)
    async reportes() {
      C().innerHTML = `<div class="barra-busqueda"><label>Pedidos desde <input type="date" data-buscar="repDesde" value="${esc(st.repDesde)}"></label>
          <label>hasta <input type="date" data-buscar="repHasta" value="${esc(st.repHasta)}"></label>
          <label>Top <select data-buscar="repLimite">${['3', '5', '10'].map((n) => `<option ${n === st.repLimite ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
          <span class="chico muted">Las fechas filtran los reportes de ventas; los cancelados no cuentan.</span></div>
        <div class="reportes-grid" id="resultados"></div>`;
      st.refrescar = async () => {
        const f = { desde: st.repDesde, hasta: st.repHasta };
        const pedir = (n, extra = {}) => llamar(`/admin/reportes/${n}${qs({ ...f, ...extra })}`).then((r) => r.filas);
        const [top, meses, cats, zonas, clientes, estados, pagos, demanda] = await Promise.all([
          pedir('productosMasVendidos', { limite: st.repLimite }), pedir('ventasPorMes'), pedir('ventasPorCategoria'), pedir('pedidosPorZona'),
          pedir('mejoresClientes', { limite: st.repLimite }), llamar('/admin/reportes/pedidosPorEstado').then((r) => r.filas),
          llamar('/admin/reportes/pagosPorMetodo').then((r) => r.filas), llamar('/admin/reportes/inventarioVsDemanda').then((r) => r.filas)]);
        const barras = (filas, etiqueta, valor, fmt = (v) => v) => {
          const max = Math.max(1, ...filas.map(valor));
          return filas.map((x) => `<div class="barra-h"><span>${esc(etiqueta(x))}</span><span class="pista"><span class="relleno" style="width:${(100 * valor(x)) / max}%"></span></span><span class="val">${fmt(valor(x))}</span></div>`).join('');
        };
        const nombreMes = (m) => { const [y, n] = m.split('-').map(Number); const t = new Date(y, n - 1, 1).toLocaleDateString('es-CO', { month: 'short' }).replace('.', ''); return `${t} ${y}`; };
        const tabla = (cab, filas) => `<div class="tabla-scroll"><table><thead><tr>${cab.map((h) => `<th${h.startsWith('#') ? ' class="num"' : ''}>${h.replace('#', '')}</th>`).join('')}</tr></thead><tbody>${filas.join('')}</tbody></table></div>`;
        const tarjeta = (titulo, pregunta, cuerpo, filas) => `<section class="tarjeta reporte"><h3>${titulo}</h3><p class="pregunta muted">${pregunta}</p>${filas.length ? cuerpo : '<p class="vacio">Sin datos en este periodo.</p>'}</section>`;
        $('#resultados').innerHTML = [
          tarjeta('Galletas más vendidas', '¿Qué productos se venden más y cuánto dejan?', barras(top, (x) => x.producto, (x) => x.unidades, (v) => `${v} und.`)
            + tabla(['Producto', 'Categoría', '#Pedidos', '#Ingresos', '#Stock'], top.map((x) => `<tr><td>${esc(x.producto)}</td><td>${esc(x.categoria)}</td><td class="num">${x.pedidos}</td><td class="num">${dinero(x.ingresos)}</td><td class="num">${x.stockActual ?? '—'}</td></tr>`)), top),
          tarjeta('Ventas por mes', '¿Cómo van las ventas mes a mes?', barras(meses, (x) => nombreMes(x.mes), (x) => x.ventas, dinero)
            + tabla(['Mes', '#Pedidos', '#Ticket promedio', '#Domicilios'], meses.map((x) => `<tr><td>${esc(nombreMes(x.mes))}</td><td class="num">${x.pedidos}</td><td class="num">${dinero(x.ticketPromedio)}</td><td class="num">${dinero(x.domicilios)}</td></tr>`)), meses),
          tarjeta('Ventas por categoría', '¿Qué tipo de producto deja más ingresos?', barras(cats, (x) => x.categoria, (x) => x.ingresos, dinero)
            + tabla(['Categoría', '#Unidades', '#Pedidos', '#Productos'], cats.map((x) => `<tr><td>${esc(x.categoria)}</td><td class="num">${x.unidades}</td><td class="num">${x.pedidos}</td><td class="num">${x.productos}</td></tr>`)), cats),
          tarjeta('Pedidos por zona', '¿A qué zonas se envía más?', barras(zonas, (x) => x.zona, (x) => x.pedidos, (v) => `${v} ped.`)
            + tabla(['Zona', '#Ventas', '#Cobrado en domicilios'], zonas.map((x) => `<tr><td>${esc(x.zona)}</td><td class="num">${dinero(x.ventas)}</td><td class="num">${dinero(x.cobradoDomicilio)}</td></tr>`)), zonas),
          tarjeta('Mejores clientes', '¿Quiénes compran más y de dónde son?', tabla(['Cliente', 'Ciudad', '#Pedidos', '#Total', 'Última compra'], clientes.map((x) => `<tr><td>${esc(x.cliente)}</td><td>${esc(x.ciudad || '—')}</td><td class="num">${x.pedidos}</td><td class="num">${dinero(x.totalComprado)}</td><td class="chico">${fecha(x.ultimaCompra, true)}</td></tr>`)), clientes),
          tarjeta('Pedidos por estado', '¿Cuántos pedidos hay en cada etapa y cuánto dinero representan?', barras(estados, (x) => ETQ[x.estado] || x.estado, (x) => x.pedidos)
            + tabla(['Estado', '#Valor'], estados.map((x) => `<tr><td>${etq(x.estado)}</td><td class="num">${dinero(x.valor)}</td></tr>`)), estados),
          tarjeta('Pagos por método', '¿Cómo pagan los clientes y cuánto falta por confirmar?', tabla(['Método', '#Pagos', '#Confirmado', '#Pendiente', '#Rechazados'], pagos.map((x) => `<tr><td>${esc(x.metodo)}</td><td class="num">${x.pagos}</td><td class="num">${dinero(x.confirmado)}</td><td class="num">${dinero(x.pendiente)}</td><td class="num">${x.rechazados}</td></tr>`)), pagos),
          tarjeta('¿Alcanza el inventario?', 'Unidades comprometidas en pedidos que aún no descuentan stock, frente al stock actual', tabla(['Producto', '#Pedidos', '#Comprometido', '#Stock', '#Faltante'], demanda.map((x) => `<tr><td>${esc(x.producto)}</td><td class="num">${x.pedidos}</td><td class="num">${x.comprometido}</td><td class="num">${x.stockActual}</td><td class="num ${x.faltante ? 'alerta-stock' : ''}">${x.faltante}</td></tr>`)), demanda),
        ].join('');
      };
      await st.refrescar();
    },

    async inventario() {
      const [lista, movs] = await Promise.all([llamar('/admin/inventario'), llamar('/admin/inventario/movimientos')]);
      const nombre = Object.fromEntries(lista.map((i) => [i.idProducto, i.producto]));
      C().innerHTML = `<div class="dos-col"><div class="tarjeta"><h3>Existencias</h3><div class="tabla-scroll"><table><thead><tr><th>Producto</th><th class="num">Stock</th><th>Actualizado</th><th></th></tr></thead><tbody>
          ${lista.map((i) => `<tr><td>${esc(i.producto)}${i.activo ? '' : ' <span class="chico muted">(inactivo)</span>'}</td><td class="num"><span class="etiqueta ${i.stockActual === 0 ? 'e-AGOTADO' : i.bajo ? 'e-POCAS_UNIDADES' : 'e-DISPONIBLE'}">${i.stockActual}</span></td>
          <td class="chico">${fecha(i.fechaActualizacion, true)}</td><td><button class="btn borde mini" data-ajustar="${i.idProducto}" data-actual="${i.stockActual}" data-nombre="${esc(i.producto)}">Ajustar</button></td></tr>`).join('')}</tbody></table></div></div>
        <div class="tarjeta"><h3>Movimientos recientes</h3>${movs.length ? `<div class="tabla-scroll"><table><thead><tr><th>Fecha</th><th>Producto</th><th>Tipo</th><th class="num">Cant.</th><th>Motivo</th></tr></thead><tbody>
          ${movs.slice(0, 30).map((m) => `<tr><td class="chico">${fecha(m.fecha, true)}</td><td>${esc(nombre[m.idProducto] || m.idProducto)}</td><td><span class="etiqueta ${m.tipo === 'SALIDA' || m.tipo === 'AJUSTE' ? 'e-PAGADO' : 'e-DISPONIBLE'}">${m.tipo}</span></td>
          <td class="num">${m.tipo === 'SALIDA' || m.tipo === 'AJUSTE' ? '−' : '+'}${m.cantidad}</td><td class="chico">${esc(m.motivo || '')}</td></tr>`).join('')}</tbody></table></div>` : '<p class="vacio">Aún no hay movimientos.</p>'}</div></div>`;
    },

    async atencion() {
      const lista = await llamar(`/admin/soporte${st.filtroMsj ? `?estado=${st.filtroMsj}` : ''}`);
      C().innerHTML = `<div class="filtros" style="margin-bottom:1rem">${[['ABIERTO', 'Sin responder'], ['RESPONDIDO', 'Respondidos'], ['', 'Todos']].map(([v, t]) => `<button data-filtro-msj="${v}" class="${st.filtroMsj === v ? 'activo' : ''}">${t}</button>`).join('')}</div>
        ${lista.length ? lista.map((m) => `<div class="tarjeta" style="margin-bottom:1rem"><div class="pedido-cab"><div><strong>${esc(m.asunto)}</strong> <span class="etiqueta e-${m.estado}">${m.estado === 'ABIERTO' ? 'Sin responder' : 'Respondido'}</span>
          <div class="chico muted">${esc(m.nombre)} · <a href="mailto:${esc(m.correo)}">${esc(m.correo)}</a> · ${fecha(m.fecha, true)}${m.idPedido ? ' · con pedido asociado' : ''}</div></div>
          ${m.idPedido ? `<button class="btn borde mini" data-pedido="${m.idPedido}">Ver pedido</button>` : ''}</div>
          <p>${esc(m.mensaje)}</p>
          ${m.respuesta ? `<div class="aviso">Respuesta: ${esc(m.respuesta)}</div>` : `<form class="barra-filtros" data-responder="${m.id}"><div class="campo" style="flex:1"><label>Respuesta</label><input name="respuesta" required></div><button class="btn aqua" type="submit">Responder</button></form>`}</div>`).join('')
        : '<div class="tarjeta vacio">No hay mensajes en este filtro.</div>'}`;
    },

    async configuracion() {
      const [metodos, zonas] = await Promise.all([llamar('/admin/metodos-pago'), llamar('/admin/zonas')]);
      st.metodos = metodos; st.zonas = zonas;
      C().innerHTML = `<div class="dos-col"><div class="tarjeta"><div class="pedido-cab"><h3 style="margin:0">Métodos de pago</h3><button class="btn mini" data-metodo="nuevo">+ Agregar</button></div>
          <p class="chico muted">Estos datos se muestran al cliente al pagar.</p>
          ${metodos.map((m) => `<div style="border-bottom:1px dashed var(--borde);padding:.6rem 0" class="pedido-cab"><div><strong>${esc(m.nombre)}</strong> ${m.activo ? '' : '<span class="etiqueta e-NO_DISPONIBLE">Inactivo</span>'}
            <div class="chico muted">${esc(m.tipo)}${m.banco ? ` · ${esc(m.banco)}` : ''}${m.numeroCuenta ? ` · ${esc(m.numeroCuenta)}` : ''}${m.titular ? ` · ${esc(m.titular)}` : ''}</div></div><button class="btn borde mini" data-metodo="${m.id}">Editar</button></div>`).join('')}</div>
        <div class="tarjeta"><div class="pedido-cab"><h3 style="margin:0">Zonas y valor del domicilio</h3><button class="btn mini" data-zona="nuevo">+ Agregar</button></div>
          <p class="chico muted">El valor se suma al total del pedido antes del pago.</p>
          ${zonas.map((z) => `<div style="border-bottom:1px dashed var(--borde);padding:.6rem 0" class="pedido-cab"><div><strong>${esc(z.nombre)}</strong> ${z.activo ? '' : '<span class="etiqueta e-NO_DISPONIBLE">Inactiva</span>'}
            <div class="chico muted">${dinero(z.valor)}</div></div><button class="btn borde mini" data-zona="${z.id}">Editar</button></div>`).join('')}</div></div>`;
    },
  };

  // ---------- Formularios en modal ----------
  function formProducto(id) {
    const p = id === 'nuevo' ? { nombre: '', descripcion: '', precio: '', idCategoria: (st.categorias[0] || {}).id, activo: true, controlaInventario: true, imagenUrl: '/img/productos/generica.svg' } : st.productos.find((x) => x.id === Number(id));
    abrirModal(`<h2>${id === 'nuevo' ? 'Nuevo producto' : 'Editar producto'}</h2><form id="formProducto">
      <div class="fila"><div class="campo"><label for="pNombre">Nombre</label><input id="pNombre" name="nombre" value="${esc(p.nombre)}" required></div>
        <div class="campo"><label for="pPrecio">Precio (COP)</label><input id="pPrecio" name="precio" type="number" min="1" step="1" value="${esc(p.precio)}" required></div>
        <div class="campo"><label for="pCat">Categoría</label><select id="pCat" name="idCategoria">${st.categorias.map((c) => `<option value="${c.id}" ${c.id === p.idCategoria ? 'selected' : ''}>${esc(c.nombre)}</option>`).join('')}</select></div></div>
      <div class="campo"><label for="pDesc">Descripción</label><textarea id="pDesc" name="descripcion" rows="3">${esc(p.descripcion)}</textarea></div>
      <label class="check"><input type="checkbox" name="activo" ${p.activo ? 'checked' : ''}> Visible en la tienda</label>
      <label class="check"><input type="checkbox" name="controlaInventario" ${p.controlaInventario ? 'checked' : ''}> Controlar inventario (si no, se hornea por pedido)</label>
      <div class="fila" style="align-items:center"><img src="${esc(p.imagenUrl)}" alt="" style="width:120px;border-radius:14px" id="pVista">
        <div class="campo"><label for="pImg">Foto (JPG, PNG o WEBP; se ajusta sola)</label><input id="pImg" type="file" accept="image/png,image/jpeg,image/webp"></div></div>
      <button class="btn" type="submit">Guardar</button></form>${id === 'nuevo' ? '' : zonaPeligro('productos', id, p.nombre, 'productos')}`);
    const f = $('#formProducto');
    $('#pImg').onchange = () => { const file = $('#pImg').files[0]; if (file) $('#pVista').src = URL.createObjectURL(file); };
    f.onsubmit = async (ev) => {
      ev.preventDefault();
      const body = { nombre: f.nombre.value, precio: Number(f.precio.value), idCategoria: Number(f.idCategoria.value), descripcion: f.descripcion.value, activo: f.activo.checked, controlaInventario: f.controlaInventario.checked };
      try {
        const g = id === 'nuevo' ? await llamar('/admin/productos', { method: 'POST', body }) : await llamar(`/admin/productos/${id}`, { method: 'PUT', body });
        const file = $('#pImg').files[0];
        if (file) {
          const dataUrl = await reducirFoto(file);
          await llamar(`/admin/productos/${g.id}/imagen`, { method: 'POST', body: { imagen: dataUrl } });
        }
        toast('Producto guardado'); cerrarModal(); ir('productos');
      } catch (e) { toast(e.message, true); }
    };
  }
  // Reduce la foto en el navegador (máx. 1200 px, WEBP) para subir fotos de cámara de cualquier tamaño
  async function reducirFoto(file, lado = 1200) {
    const leer = () => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });
    const original = await leer();
    try {
      const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = original; });
      const k = Math.min(1, lado / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas');
      c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      for (const q of [0.85, 0.7, 0.55]) {
        let url = c.toDataURL('image/webp', q);
        if (!url.startsWith('data:image/webp')) url = c.toDataURL('image/jpeg', q);
        if (url.length * 0.75 < 1.8 * 1024 * 1024) return url;
      }
    } catch { /* si el navegador no puede procesarla se envía la original */ }
    return original;
  }
  function formAjuste(b) {
    abrirModal(`<h2>Ajustar inventario</h2><p><strong>${esc(b.dataset.nombre)}</strong> · stock actual: ${b.dataset.actual}</p><form id="formAjuste">
      <div class="fila"><div class="campo"><label for="iStock">Nuevo stock</label><input id="iStock" name="stockNuevo" type="number" min="0" value="${b.dataset.actual}" required></div>
      <div class="campo"><label for="iMotivo">Motivo</label><input id="iMotivo" name="motivo" placeholder="Ej.: horneada del día" required></div></div>
      <button class="btn" type="submit">Guardar ajuste</button></form>`);
    $('#formAjuste').onsubmit = async (ev) => {
      ev.preventDefault();
      try { await llamar(`/admin/inventario/${b.dataset.ajustar}`, { method: 'PUT', body: { stockNuevo: Number(ev.target.stockNuevo.value), motivo: ev.target.motivo.value } }); toast('Inventario actualizado'); cerrarModal(); ir('inventario'); } catch (e) { toast(e.message, true); }
    };
  }
  // Eliminar: pide confirmación con un segundo clic y muestra la regla de negocio si la base lo rechaza
  function zonaPeligro(ruta, id, nombre, volverA, aviso = 'Solo se elimina si ningún pedido lo usa. Si ya tiene pedidos, desactívalo.') {
    return `<div class="zona-peligro"><span class="chico muted">${aviso}</span>
      <button class="btn peligro mini" data-eliminar="${ruta}/${id}" data-nombre="${esc(nombre)}" data-volver="${volverA}">Eliminar</button></div>`;
  }
  async function eliminar(b) {
    if (!b.dataset.confirmar) { b.dataset.confirmar = '1'; b.textContent = '¿Seguro? Toca otra vez para eliminar'; return; }
    try {
      await llamar(`/admin/${b.dataset.eliminar}`, { method: 'DELETE' });
      toast(`“${b.dataset.nombre}” se eliminó`); cerrarModal(); ir(b.dataset.volver);
    } catch (e) { toast(e.message, true); delete b.dataset.confirmar; b.textContent = 'Eliminar'; }
  }

  function formMetodo(id) {
    const m = id === 'nuevo' ? { nombre: '', tipo: 'BILLETERA', banco: '', titular: '', numeroCuenta: '', instrucciones: '', requiereReferencia: true, activo: true } : st.metodos.find((x) => x.id === Number(id));
    abrirModal(`<h2>${id === 'nuevo' ? 'Nuevo método de pago' : 'Editar método de pago'}</h2><form id="formMetodo">
      <div class="fila"><div class="campo"><label for="mNombre">Nombre</label><input id="mNombre" name="nombre" value="${esc(m.nombre)}" required></div>
      <div class="campo"><label for="mTipo">Tipo</label><select id="mTipo" name="tipo">${['BILLETERA', 'TRANSFERENCIA', 'TARJETA', 'EFECTIVO'].map((t) => `<option ${t === m.tipo ? 'selected' : ''}>${t}</option>`).join('')}</select></div></div>
      <div class="fila"><div class="campo"><label for="mBanco">Entidad</label><input id="mBanco" name="banco" value="${esc(m.banco)}"></div>
      <div class="campo"><label for="mTitular">Titular</label><input id="mTitular" name="titular" value="${esc(m.titular)}"></div>
      <div class="campo"><label for="mCuenta">Número de cuenta o celular</label><input id="mCuenta" name="numeroCuenta" value="${esc(m.numeroCuenta)}"></div></div>
      <div class="campo"><label for="mIns">Instrucciones para el cliente</label><textarea id="mIns" name="instrucciones" rows="2">${esc(m.instrucciones)}</textarea></div>
      <label class="check"><input type="checkbox" name="requiereReferencia" ${m.requiereReferencia ? 'checked' : ''}> Pedir número de comprobante</label>
      <label class="check"><input type="checkbox" name="activo" ${m.activo ? 'checked' : ''}> Activo</label>
      <button class="btn" type="submit">Guardar</button></form>${id === 'nuevo' ? '' : zonaPeligro('metodos-pago', id, m.nombre, 'configuracion')}`);
    $('#formMetodo').onsubmit = async (ev) => {
      ev.preventDefault(); const f = ev.target;
      const body = { ...datosForm(f), requiereReferencia: f.requiereReferencia.checked, activo: f.activo.checked };
      try { await llamar(id === 'nuevo' ? '/admin/metodos-pago' : `/admin/metodos-pago/${id}`, { method: id === 'nuevo' ? 'POST' : 'PUT', body }); toast('Método de pago guardado'); cerrarModal(); ir('configuracion'); } catch (e) { toast(e.message, true); }
    };
  }
  function formZona(id) {
    const z = id === 'nuevo' ? { nombre: '', valor: '', activo: true } : st.zonas.find((x) => x.id === Number(id));
    abrirModal(`<h2>${id === 'nuevo' ? 'Nueva zona' : 'Editar zona'}</h2><form id="formZona"><div class="fila">
      <div class="campo"><label for="zNombre">Nombre de la zona</label><input id="zNombre" name="nombre" value="${esc(z.nombre)}" required></div>
      <div class="campo"><label for="zValor">Valor del domicilio (COP)</label><input id="zValor" name="valor" type="number" min="0" step="500" value="${esc(z.valor)}" required></div></div>
      <label class="check"><input type="checkbox" name="activo" ${z.activo ? 'checked' : ''}> Activa</label><button class="btn" type="submit">Guardar</button></form>${id === 'nuevo' ? '' : zonaPeligro('zonas', id, z.nombre, 'configuracion')}`);
    $('#formZona').onsubmit = async (ev) => {
      ev.preventDefault(); const f = ev.target;
      try { await llamar(id === 'nuevo' ? '/admin/zonas' : `/admin/zonas/${id}`, { method: id === 'nuevo' ? 'POST' : 'PUT', body: { nombre: f.nombre.value, valor: Number(f.valor.value), activo: f.activo.checked } }); toast('Zona guardada'); cerrarModal(); ir('configuracion'); } catch (e) { toast(e.message, true); }
    };
  }

  function formCliente(id) {
    const c = id === 'nuevo' ? { nombre: '', correo: '', telefono: '', direccion: '', ciudad: 'Medellín', pedidos: 0 } : st.clientesLista.find((x) => x.id === Number(id));
    abrirModal(`<h2>${id === 'nuevo' ? 'Nuevo cliente' : 'Editar cliente'}</h2>
      ${id === 'nuevo' ? '<p class="chico muted">Para clientes que piden por WhatsApp o teléfono. Si después crean su cuenta en la tienda con este correo, quedan con su propia contraseña.</p>' : ''}
      <form id="formCliente"><div class="campo"><label for="cNombre">Nombre completo</label><input id="cNombre" name="nombre" value="${esc(c.nombre)}" required minlength="3" maxlength="80"></div>
      <div class="fila"><div class="campo"><label for="cCorreo">Correo</label><input id="cCorreo" name="correo" type="email" value="${esc(c.correo)}" required></div>
      <div class="campo"><label for="cTel">Teléfono</label><input id="cTel" name="telefono" inputmode="numeric" pattern="[0-9 ]{7,18}" value="${esc(c.telefono)}" required></div></div>
      <div class="fila"><div class="campo"><label for="cDir">Dirección</label><input id="cDir" name="direccion" maxlength="120" value="${esc(c.direccion || '')}"></div>
      <div class="campo"><label for="cCiudad">Ciudad</label><input id="cCiudad" name="ciudad" maxlength="60" value="${esc(c.ciudad || '')}"></div></div>
      <button class="btn" type="submit">Guardar</button></form>
      ${id === 'nuevo' ? '' : zonaPeligro('clientes', id, c.nombre, 'clientes', c.pedidos ? `Tiene ${c.pedidos} pedido(s): no se puede eliminar para no perder el historial de ventas.` : 'Este cliente no tiene pedidos y se puede eliminar.')}`);
    $('#formCliente').onsubmit = async (ev) => {
      ev.preventDefault();
      try {
        await llamar(id === 'nuevo' ? '/admin/clientes' : `/admin/clientes/${id}`, { method: id === 'nuevo' ? 'POST' : 'PUT', body: datosForm(ev.target) });
        toast(id === 'nuevo' ? 'Cliente registrado' : 'Cliente actualizado'); cerrarModal(); ir('clientes');
      } catch (e) { toast(e.message, true); }
    };
  }

  // ---------- Eventos ----------
  document.addEventListener('click', (ev) => {
    const t = ev.target.closest('[data-modulo],[data-pedido],[data-filtro-pedidos],[data-filtro-pagos],[data-filtro-msj],[data-mes],[data-campo],[data-dia],[data-confirmar-pago],[data-rechazar-pago],[data-producto],[data-ajustar],[data-metodo],[data-zona],[data-cliente],[data-cerrar],[data-eliminar],[data-pedidos-de]');
    if (!t) return;
    const d = t.dataset;
    if (d.modulo) ir(d.modulo);
    else if (d.pedido) verPedido(d.pedido).catch((e) => toast(e.message, true));
    else if (d.filtroPedidos !== undefined) { st.filtroPedidos = d.filtroPedidos; ir('pedidos'); }
    else if (d.filtroPagos !== undefined) { st.filtroPagos = d.filtroPagos; ir('pagos'); }
    else if (d.filtroMsj !== undefined) { st.filtroMsj = d.filtroMsj; ir('atencion'); }
    else if (d.mes !== undefined) {
      if (d.mes === '0') st.mes = hoy().slice(0, 7);
      else { const [y, m] = st.mes.split('-').map(Number); const n = new Date(y, m - 1 + Number(d.mes), 1); st.mes = `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`; }
      st.diaSel = null; ir('calendario');
    } else if (d.campo) { st.campoCal = d.campo; ir('calendario'); }
    else if (d.dia) { st.diaSel = d.dia; ir('calendario'); }
    else if (d.confirmarPago) procesarPago(d.confirmarPago, 'confirmar');
    else if (d.rechazarPago) procesarPago(d.rechazarPago, 'rechazar');
    else if (d.producto) formProducto(d.producto);
    else if (d.ajustar) formAjuste(t);
    else if (d.metodo) formMetodo(d.metodo);
    else if (d.zona) formZona(d.zona);
    else if (d.cliente) formCliente(d.cliente);
    else if (d.eliminar) eliminar(t);
    else if (d.pedidosDe) { st.buscaPedidos = d.pedidosDe; st.filtroPedidos = ''; st.pedDesde = ''; st.pedHasta = ''; ir('pedidos'); }
    else if (t.hasAttribute('data-cerrar')) cerrarModal();
  });
  document.addEventListener('submit', async (ev) => {
    const f = ev.target;
    if (!f.dataset.responder) return;
    ev.preventDefault();
    try { await llamar(`/admin/soporte/${f.dataset.responder}/responder`, { method: 'POST', body: { respuesta: f.respuesta.value } }); toast('Respuesta enviada'); ir('atencion'); } catch (e) { toast(e.message, true); }
  });
  // Búsqueda y filtros: cada cambio vuelve a consultar la base (con una pausa corta mientras se escribe)
  let tBuscar;
  document.addEventListener('input', (ev) => {
    const k = ev.target.dataset && ev.target.dataset.buscar;
    if (!k) return;
    st[k] = ev.target.value;
    clearTimeout(tBuscar);
    tBuscar = setTimeout(() => { if (st.refrescar) st.refrescar().catch((e) => toast(e.message, true)); }, ev.target.tagName === 'SELECT' || ev.target.type === 'date' ? 0 : 300);
  });
  $('#modal').addEventListener('click', (ev) => { if (ev.target.id === 'modal') cerrarModal(); });
  document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') cerrarModal(); });
  $('#btnSalir').onclick = () => { salir(); location.href = '/'; };
  $('#btnTienda').onclick = () => { location.href = '/'; };
  $('#formLoginAdmin').onsubmit = async (ev) => {
    ev.preventDefault();
    try {
      const r = await api('/auth/admin/login', { method: 'POST', body: datosForm(ev.target) });
      st.token = r.token; st.nombre = r.admin.nombre; guardar.set('pc_admin_token', r.token); guardar.set('pc_admin_nombre', r.admin.nombre);
      $('#avisoLoginAdmin').innerHTML = ''; mostrar();
    } catch (e) { $('#avisoLoginAdmin').innerHTML = `<div class="aviso error">${esc(e.message)}</div>`; }
  };
  // Datos al día: al volver a la app y cada minuto (sin interrumpir si hay un formulario abierto)
  const refrescar = () => {
    if (!st.token || !$('#modal').classList.contains('oculto')) return;
    if (st.refrescar) st.refrescar().catch(() => {}); else ir(st.modulo);
  };
  window.addEventListener('pc:actualizar', refrescar);
  setInterval(() => { if (document.visibilityState === 'visible' && ['resumen', 'pedidos', 'pagos', 'calendario', 'atencion'].includes(st.modulo)) refrescar(); }, 60000);
  mostrar();
})();
