// Tienda Pecantojos: catálogo, carrito, checkout, mis pedidos y atención al cliente
(() => {
  const { borrarDatosGuardados, api, dinero, esc, fecha, hoy, toast, $, $$, guardar, ETIQUETA_DISP } = Pc;
  const estado = {
    productos: [], config: null, categoria: 'todas',
    carrito: JSON.parse(guardar.get('pc_carrito') || '[]'),
    token: guardar.get('pc_token'), cliente: JSON.parse(guardar.get('pc_cliente') || 'null'),
    cotizacion: null, metodo: null, despuesDeLogin: null,
  };

  // ---------- Sesión ----------
  function setSesion(token, cliente) {
    estado.token = token; estado.cliente = cliente;
    if (token) { guardar.set('pc_token', token); guardar.set('pc_cliente', JSON.stringify(cliente)); } else { guardar.del('pc_token'); guardar.del('pc_cliente'); }
    pintarCuenta();
  }
  function pintarCuenta() {
    $('#btnCuenta').textContent = estado.cliente ? `Salir (${estado.cliente.nombre.split(' ')[0]})` : 'Ingresar';
    if (estado.cliente) { $('#sNombre').value = estado.cliente.nombre; $('#sCorreo').value = estado.cliente.correo; }
  }
  async function llamar(ruta, opts = {}) {
    try { return await api(ruta, { ...opts, token: estado.token }); } catch (e) {
      if (e.status === 401 && estado.token) { setSesion(null, null); toast('Tu sesión expiró. Ingresa de nuevo.', true); }
      throw e;
    }
  }

  // ---------- Navegación ----------
  function mostrarVista() {
    const v = (location.hash || '#inicio').slice(1);
    const vista = ['pedidos', 'ayuda'].includes(v) ? v : 'inicio';
    $$('[data-seccion]').forEach((s) => s.classList.toggle('oculto', s.dataset.seccion !== vista));
    $$('[data-vista]').forEach((a) => a.classList.toggle('activo', a.dataset.vista === vista));
    if (vista === 'pedidos') cargarPedidos();
    if (vista === 'ayuda') cargarMensajes();
    if (v === 'catalogo') document.getElementById('catalogo').scrollIntoView();
  }

  // ---------- Catálogo ----------
  function pintarFiltros() {
    const cats = [{ id: 'todas', nombre: 'Todas' }, ...estado.config.categorias];
    $('#filtros').innerHTML = cats.map((c) => `<button data-cat="${c.id}" class="${String(estado.categoria) === String(c.id) ? 'activo' : ''}">${esc(c.nombre)}</button>`).join('');
  }
  function enCarrito(id) { return (estado.carrito.find((l) => l.idProducto === id) || {}).cantidad || 0; }
  // Búsqueda en el servidor (GET /api/productos?q=…&categoria=…): la base devuelve los que coinciden
  let tBusqueda;
  async function buscarEnServidor() {
    const q = $('#buscarProducto').value.trim();
    if (!q) { estado.resultados = null; pintarProductos(); return; }
    const params = new URLSearchParams({ q });
    if (estado.categoria !== 'todas') params.set('categoria', estado.categoria);
    try { estado.resultados = new Set((await api(`/productos?${params}`)).map((p) => p.id)); } catch (e) { estado.resultados = null; toast(e.message, true); }
    pintarProductos();
  }
  function pintarProductos() {
    const lista = estado.productos.filter((p) => (estado.categoria === 'todas' || String(p.idCategoria) === String(estado.categoria))
      && (!estado.resultados || estado.resultados.has(p.id)));
    if (!lista.length) { $('#productos').innerHTML = `<p class="vacio">${estado.resultados ? 'Ninguna galleta coincide con tu búsqueda.' : 'No hay productos en esta categoría.'}</p>`; return; }
    $('#productos').innerHTML = lista.map((p) => {
      const agotado = p.disponibilidad === 'AGOTADO';
      const stockTxt = p.stock == null ? 'Se hornea por pedido' : agotado ? 'Sin unidades por hoy' : `${p.stock} unidades disponibles`;
      return `<article class="tarjeta producto ${agotado ? 'agotado' : ''}">
        <img class="foto" src="${esc(p.imagenUrl || '/img/productos/generica.svg')}" alt="${esc(p.nombre)}" loading="lazy">
        <div class="cuerpo">
          <div><span class="etiqueta e-${p.disponibilidad}">${ETIQUETA_DISP[p.disponibilidad]}</span> <span class="chico muted">${esc(p.categoria || '')}</span></div>
          <h3>${esc(p.nombre)}</h3>
          <p>${esc(p.descripcion)}</p>
          <span class="chico muted">${stockTxt}</span>
          <div class="pie"><span class="precio">${dinero(p.precio)}</span>
            <button class="btn mini" data-agregar="${p.id}" ${agotado ? 'disabled' : ''}>${enCarrito(p.id) ? `En carrito (${enCarrito(p.id)}) +` : 'Agregar'}</button></div>
        </div></article>`;
    }).join('');
  }
  // La base gratuita en la nube se pausa sin uso: mientras despierta se reintenta solo
  async function cargarCatalogo(intento = 1) {
    const lento = setTimeout(() => { $('#productos').innerHTML = '<p class="vacio">Despertando la tienda, un momento… ☕</p>'; }, 4000);
    try {
      [estado.productos, estado.config] = await Promise.all([api('/productos'), api('/config')]);
      clearTimeout(lento);
      depurarCarrito();
      pintarFiltros(); pintarProductos(); pintarCarrito(); pintarAyuda();
    } catch (e) {
      clearTimeout(lento);
      if (intento < 12 && (e.code === 'SIN_CONEXION' || !e.status || e.status >= 500)) {
        $('#productos').innerHTML = '<p class="vacio">Despertando la tienda, un momento… ☕</p>';
        setTimeout(() => cargarCatalogo(intento + 1), 5000);
        return;
      }
      $('#productos').innerHTML = `<p class="vacio">${esc(e.message)}</p>`;
    }
  }

  // ---------- Carrito ----------
  function guardarCarrito() { guardar.set('pc_carrito', JSON.stringify(estado.carrito)); pintarCarrito(); pintarProductos(); }
  function depurarCarrito() {
    estado.carrito = estado.carrito.filter((l) => estado.productos.some((p) => p.id === l.idProducto && p.disponibilidad !== 'AGOTADO'));
  }
  function agregar(id, delta = 1) {
    const p = estado.productos.find((x) => x.id === id);
    if (!p) return;
    const l = estado.carrito.find((x) => x.idProducto === id);
    const nueva = (l ? l.cantidad : 0) + delta;
    if (p.stock != null && nueva > p.stock) { toast(`Solo hay ${p.stock} unidades de ${p.nombre}`, true); return; }
    if (nueva <= 0) estado.carrito = estado.carrito.filter((x) => x.idProducto !== id);
    else if (l) l.cantidad = nueva;
    else estado.carrito.push({ idProducto: id, cantidad: nueva });
    if (delta > 0 && !l) toast(`${p.nombre} agregada al carrito`);
    guardarCarrito();
  }
  function subtotalCarrito() {
    return estado.carrito.reduce((s, l) => s + ((estado.productos.find((p) => p.id === l.idProducto) || {}).precio || 0) * l.cantidad, 0);
  }
  function pintarCarrito() {
    const n = estado.carrito.reduce((s, l) => s + l.cantidad, 0);
    $('#contador').textContent = n;
    $('#btnPagar').disabled = n === 0;
    $('#subtotalCarrito').textContent = dinero(subtotalCarrito());
    if (!estado.carrito.length) { $('#lineasCarrito').innerHTML = '<p class="vacio">Tu carrito está vacío.<br>¡Agrega unas galletas! 🍪</p>'; return; }
    $('#lineasCarrito').innerHTML = estado.carrito.map((l) => {
      const p = estado.productos.find((x) => x.id === l.idProducto) || {};
      return `<div class="linea"><img src="${esc(p.imagenUrl)}" alt="">
        <div><strong>${esc(p.nombre)}</strong><div class="chico muted">${dinero(p.precio)} c/u</div>
          <div class="cantidad" style="margin-top:.3rem"><button data-menos="${p.id}" aria-label="Quitar una">−</button><span>${l.cantidad}</span><button data-mas="${p.id}" aria-label="Agregar una">+</button></div></div>
        <strong>${dinero(p.precio * l.cantidad)}</strong></div>`;
    }).join('');
  }
  function abrirCarrito(abrir = true) { $('#panelCarrito').classList.toggle('oculto', !abrir); $('#velo').classList.toggle('oculto', !abrir); }

  // ---------- Modales ----------
  function abrirModal(id) { $(id).classList.remove('oculto'); }
  function cerrarModales() { $$('.modal').forEach((m) => m.classList.add('oculto')); }
  function aviso(sel, msg, error = true) { $(sel).innerHTML = msg ? `<div class="aviso ${error ? 'error' : ''}">${esc(msg)}</div>` : ''; }
  function abrirLogin(despues) {
    estado.despuesDeLogin = despues || null;
    aviso('#avisoLogin', '');
    $('#formLogin').classList.remove('oculto'); $('#formRegistro').classList.add('oculto');
    abrirModal('#modalLogin');
  }
  const datosForm = (f) => Object.fromEntries(new FormData(f).entries());

  // ---------- Checkout ----------
  function paso(n) {
    ['#paso1', '#paso2', '#paso3'].forEach((s, i) => $(s).classList.toggle('oculto', i !== n - 1));
    $$('.pasos-checkout span').forEach((s) => s.classList.toggle('hecho', Number(s.dataset.p) <= n));
  }
  function pintarTotales(sel) {
    const c = estado.cotizacion;
    if (!c) { $(sel).innerHTML = ''; return; }
    $(sel).innerHTML = `${c.lineas.map((l) => `<div><span>${l.cantidad} × ${esc(l.producto)}</span><span>${dinero(l.subtotal)}</span></div>`).join('')}
      <div><span>Subtotal</span><span>${dinero(c.subtotal)}</span></div>
      <div><span>Domicilio${c.zona ? ` · ${esc(c.zona.nombre)}` : ''}</span><span>${c.domicilio ? dinero(c.domicilio) : 'Gratis'}</span></div>
      <div class="total"><span>Total a pagar</span><span>${dinero(c.total)}</span></div>`;
  }
  async function cotizar() {
    const f = $('#paso1');
    const tipoEntrega = f.tipoEntrega.value;
    $('#camposDomicilio').classList.toggle('oculto', tipoEntrega !== 'DOMICILIO');
    try {
      estado.cotizacion = await api('/pedidos/cotizar', { method: 'POST', body: { items: estado.carrito, tipoEntrega, idZona: Number(f.idZona.value) } });
      aviso('#avisoCheckout', '');
    } catch (e) { estado.cotizacion = null; aviso('#avisoCheckout', e.message); }
    pintarTotales('#resumenTotales');
  }
  function abrirCheckout() {
    if (!estado.token) { abrirLogin(abrirCheckout); return; }
    abrirCarrito(false);
    const f = $('#paso1');
    f.idZona.innerHTML = estado.config.zonas.map((z) => `<option value="${z.id}">${esc(z.nombre)} — ${dinero(z.valor)}</option>`).join('');
    f.fechaEntrega.min = hoy(); if (!f.fechaEntrega.value) f.fechaEntrega.value = hoy(1);
    if (!f.direccionEntrega.value && estado.cliente.direccion) f.direccionEntrega.value = [estado.cliente.direccion, estado.cliente.ciudad].filter(Boolean).join(', ');
    $('#opcionesPago').innerHTML = estado.config.metodos.map((m, i) => `<label class="opcion"><input type="radio" name="idMetodoPago" value="${m.id}" ${i === 0 ? 'checked' : ''}>
      <span><strong>${esc(m.nombre)}</strong><br><span class="muted chico">${esc(m.tipo === 'EFECTIVO' ? 'Pagas al recibir' : m.tipo === 'TARJETA' ? 'Datáfono al recibir o recoger' : m.tipo === 'TRANSFERENCIA' ? `Transferencia a ${m.banco}` : `Billetera digital · ${m.numeroCuenta}`)}</span></span></label>`).join('');
    aviso('#avisoCheckout', '');
    paso(1); abrirModal('#modalCheckout'); cotizar();
  }
  function pintarMetodo() {
    const id = Number($('#paso2').idMetodoPago.value);
    const m = estado.config.metodos.find((x) => x.id === id);
    estado.metodo = m;
    const filas = [['Método', m.nombre], m.banco && ['Entidad', m.banco], m.titular && ['Titular', m.titular], m.numeroCuenta && ['Cuenta / celular', m.numeroCuenta], ['Valor', dinero(estado.cotizacion.total)]].filter(Boolean);
    $('#datosPago').innerHTML = `<dl>${filas.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl><p class="chico" style="margin:0">${esc(m.instrucciones)}</p>`;
    $('#campoReferencia').classList.toggle('oculto', !m.requiereReferencia);
  }

  // ---------- Mis pedidos ----------
  function barraPasos(p) {
    if (p.estado === 'CANCELADO') return '<div class="aviso error">Este pedido fue cancelado.</div>';
    return `<div class="progreso">${p.pasos.map((s, i) => `<div class="paso ${s.completado ? 'hecho' : ''} ${s.actual ? 'actual' : ''} ${s.omitido ? 'omitido' : ''}">
      <i>${s.completado && !s.actual ? '✓' : i + 1}</i>${esc(s.etiqueta)}</div>`).join('')}</div>`;
  }
  async function cargarPedidos() {
    const sin = !estado.token;
    $('#pedidosSinSesion').classList.toggle('oculto', !sin);
    $('#saludo').textContent = sin ? '' : `Hola, ${estado.cliente.nombre}. Aquí ves el estado de cada pedido.`;
    if (sin) { $('#misPedidos').innerHTML = ''; return; }
    $('#misPedidos').innerHTML = '<p class="vacio">Cargando…</p>';
    try {
      const lista = await llamar('/cliente/pedidos');
      if (!lista.length) { $('#misPedidos').innerHTML = '<div class="tarjeta vacio">Aún no tienes pedidos. <a href="#inicio">Ve al catálogo</a>.</div>'; return; }
      const detalles = await Promise.all(lista.map((p) => llamar(`/cliente/pedidos/${p.codigo}`)));
      $('#misPedidos').innerHTML = detalles.map((p) => `<article class="tarjeta">
        <div class="pedido-cab"><div><span class="codigo">${esc(p.codigo)}</span> <span class="etiqueta e-${p.estado}">${esc(p.etiquetaEstado)}</span>
          <div class="chico muted">Pedido el ${fecha(p.fechaPedido, true)} · Entrega ${fecha(p.fechaEntrega)} · ${p.tipoEntrega === 'DOMICILIO' ? 'Domicilio' : 'Recoger en local'}</div></div>
          <div style="text-align:right"><div class="precio">${dinero(p.valorTotal)}</div><button class="btn borde mini" data-ver="${esc(p.codigo)}">Ver detalle</button></div></div>
        ${barraPasos(p)}</article>`).join('');
    } catch (e) { $('#misPedidos').innerHTML = `<p class="vacio">${esc(e.message)}</p>`; }
  }
  async function verPedido(codigo) {
    try {
      const p = await llamar(`/cliente/pedidos/${codigo}`);
      const pago = p.pagos[p.pagos.length - 1];
      const pagoTxt = !pago ? 'Pago contra entrega' : pago.estado === 'CONFIRMADO' ? 'Pago confirmado ✓' : pago.estado === 'RECHAZADO' ? 'Pago rechazado: escríbenos o registra otro comprobante' : pago.referencia ? `Comprobante ${pago.referencia} en revisión` : 'Pendiente de pago';
      const pideRef = p.estado !== 'CANCELADO' && !(pago && pago.estado === 'CONFIRMADO') && (estado.config.metodos.find((m) => m.id === p.idMetodoPago) || {}).requiereReferencia === true;
      $('#detallePedido').innerHTML = `<h2>Pedido <span class="codigo">${esc(p.codigo)}</span></h2>
        <span class="etiqueta e-${p.estado}">${esc(p.etiquetaEstado)}</span>
        ${barraPasos(p)}
        <div class="tabla-scroll"><table><thead><tr><th>Producto</th><th class="num">Cant.</th><th class="num">Precio</th><th class="num">Subtotal</th></tr></thead><tbody>
          ${p.detalles.map((d) => `<tr><td>${esc(d.producto)}</td><td class="num">${d.cantidad}</td><td class="num">${dinero(d.precioUnitario)}</td><td class="num">${dinero(d.subtotal)}</td></tr>`).join('')}
          <tr><td colspan="3">Domicilio</td><td class="num">${dinero(p.valorDomicilio)}</td></tr>
          <tr><td colspan="3"><strong>Total</strong></td><td class="num"><strong>${dinero(p.valorTotal)}</strong></td></tr></tbody></table></div>
        <p><strong>Entrega:</strong> ${fecha(p.fechaEntrega)} · ${p.tipoEntrega === 'DOMICILIO' ? `Domicilio a ${esc(p.direccionEntrega)} (${esc(p.zona)})` : 'Recoger en el local'}<br>
        <strong>Pago:</strong> ${esc(p.metodoPago)} · ${esc(pagoTxt)}${p.observaciones ? `<br><strong>Observaciones:</strong> ${esc(p.observaciones)}` : ''}</p>
        ${pideRef ? `<form id="formRef" class="fila" style="align-items:end"><div class="campo"><label for="refPago">Número de comprobante</label><input id="refPago" name="referencia" required></div>
          <div class="campo"><button class="btn aqua" type="submit">Enviar comprobante</button></div></form>` : ''}
        <h3>Historial</h3><ul class="chico">${p.historial.map((h) => `<li>${fecha(h.fecha, true)} — ${esc(h.estadoNuevo === h.estadoAnterior ? (h.nota || 'Actualización') : (h.nota || h.estadoNuevo.replace('_', ' ').toLowerCase()))}</li>`).join('')}</ul>
        ${p.estado === 'RECIBIDO' ? '<button class="btn peligro mini" id="btnCancelar">Cancelar pedido</button>' : ''}`;
      const fr = $('#formRef');
      if (fr) fr.onsubmit = async (ev) => { ev.preventDefault(); try { await llamar(`/cliente/pedidos/${codigo}/pago`, { method: 'POST', body: { referencia: fr.referencia.value } }); toast('Comprobante enviado. Lo revisaremos pronto.'); verPedido(codigo); cargarPedidos(); } catch (e) { toast(e.message, true); } };
      const bc = $('#btnCancelar');
      if (bc) bc.onclick = async () => { if (bc.dataset.ok !== '1') { bc.dataset.ok = '1'; bc.textContent = '¿Seguro? Toca de nuevo para cancelar'; return; }
        try { await llamar(`/cliente/pedidos/${codigo}/cancelar`, { method: 'POST' }); toast('Pedido cancelado'); cerrarModales(); cargarPedidos(); cargarCatalogo(); } catch (e) { toast(e.message, true); } };
      abrirModal('#modalPedido');
    } catch (e) { toast(e.message, true); }
  }

  // ---------- Ayuda ----------
  function pintarAyuda() {
    const c = estado.config;
    $('#horario').textContent = `(${c.horario.toLowerCase()})`;
    $('#linkWhatsapp').href = `https://wa.me/${c.whatsapp}?text=${encodeURIComponent('Hola Pecantojos, necesito ayuda con')}`;
    $('#faqZonas').innerHTML = `<ul>${c.zonas.map((z) => `<li>${esc(z.nombre)}: <strong>${dinero(z.valor)}</strong></li>`).join('')}</ul><p>Recoger en el local no tiene costo.</p>`;
  }
  async function cargarMensajes() {
    if (!estado.token) { $('#misMensajes').innerHTML = ''; return; }
    try {
      const ms = await llamar('/cliente/soporte');
      $('#misMensajes').innerHTML = ms.length ? `<h3>Tus mensajes</h3>${ms.map((m) => `<div class="tarjeta" style="box-shadow:none;border:1px solid var(--borde);margin-bottom:.6rem">
        <strong>${esc(m.asunto)}</strong> <span class="etiqueta e-${m.estado}">${m.estado === 'ABIERTO' ? 'En revisión' : 'Respondido'}</span>
        <p class="chico" style="margin:.3rem 0">${esc(m.mensaje)}</p>${m.respuesta ? `<p class="chico" style="margin:0;color:var(--aqua-fuerte)"><strong>Pecantojos:</strong> ${esc(m.respuesta)}</p>` : ''}</div>`).join('')}` : '';
    } catch { /* sin mensajes */ }
  }

  // ---------- Eventos ----------
  document.addEventListener('click', (ev) => {
    const t = ev.target.closest('button, a');
    if (!t) return;
    if (t.dataset.cat) { estado.categoria = t.dataset.cat; pintarFiltros(); if (estado.resultados) buscarEnServidor(); else pintarProductos(); }
    if (t.dataset.agregar) agregar(Number(t.dataset.agregar));
    if (t.dataset.mas) agregar(Number(t.dataset.mas), 1);
    if (t.dataset.menos) agregar(Number(t.dataset.menos), -1);
    if (t.dataset.ver) verPedido(t.dataset.ver);
    if (t.hasAttribute('data-cerrar')) cerrarModales();
    if (t.hasAttribute('data-cerrar-carrito')) abrirCarrito(false);
    if (t.hasAttribute('data-abrir-login')) abrirLogin(() => cargarPedidos());
  });
  $('#velo').onclick = () => abrirCarrito(false);
  $$('.modal').forEach((m) => m.addEventListener('click', (ev) => { if (ev.target === m) cerrarModales(); }));
  document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') { cerrarModales(); abrirCarrito(false); } });
  $('#btnCarrito').onclick = () => abrirCarrito(true);
  $('#btnPagar').onclick = abrirCheckout;
  $('#btnRecargarPedidos').onclick = cargarPedidos;
  $('#btnCuenta').onclick = () => {
    if (estado.cliente) { setSesion(null, null); borrarDatosGuardados(); toast('Cerraste sesión'); if (location.hash === '#pedidos') cargarPedidos(); } else abrirLogin();
  };
  $('#irRegistro').onclick = (e) => { e.preventDefault(); aviso('#avisoLogin', ''); $('#formLogin').classList.add('oculto'); $('#formRegistro').classList.remove('oculto'); $('#tituloLogin').textContent = 'Crea tu cuenta'; };
  $('#irLogin').onclick = (e) => { e.preventDefault(); aviso('#avisoLogin', ''); $('#formRegistro').classList.add('oculto'); $('#formLogin').classList.remove('oculto'); $('#tituloLogin').textContent = 'Ingresa a tu cuenta'; };

  async function trasLogin(r) {
    setSesion(r.token, r.cliente); cerrarModales(); toast(`¡Hola, ${r.cliente.nombre.split(' ')[0]}!`);
    const f = estado.despuesDeLogin; estado.despuesDeLogin = null;
    if (f) f(); else if (location.hash === '#pedidos') cargarPedidos();
  }
  // Un solo inicio de sesión: con correo entra el cliente; con usuario (sin @) entra el equipo y pasa al panel
  $('#formLogin').onsubmit = async (ev) => {
    ev.preventDefault();
    const datos = datosForm(ev.target);
    const usuario = String(datos.correo || '').trim();
    try {
      if (!usuario.includes('@')) {
        const r = await api('/auth/admin/login', { method: 'POST', body: { usuario, password: datos.password } });
        guardar.set('pc_admin_token', r.token);
        guardar.set('pc_admin_nombre', r.admin.nombre);
        location.href = '/admin';
        return;
      }
      trasLogin(await api('/auth/login', { method: 'POST', body: { correo: usuario, password: datos.password } }));
    } catch (e) {
      aviso('#avisoLogin', usuario.includes('@') ? e.message : 'Usuario o contraseña incorrectos. Si eres cliente, ingresa con tu correo.');
    }
  };
  $('#formRegistro').onsubmit = async (ev) => { ev.preventDefault(); try { trasLogin(await api('/auth/registro', { method: 'POST', body: datosForm(ev.target) })); } catch (e) { aviso('#avisoLogin', e.message); } };

  $('#paso1').addEventListener('change', (ev) => { if (['tipoEntrega', 'idZona'].includes(ev.target.name)) cotizar(); });
  $('#paso1').onsubmit = (ev) => {
    ev.preventDefault();
    const f = ev.target;
    if (!estado.cotizacion) return;
    if (f.tipoEntrega.value === 'DOMICILIO' && f.direccionEntrega.value.trim().length < 5) { aviso('#avisoCheckout', 'Escribe la dirección de entrega'); return; }
    if (!f.fechaEntrega.value || f.fechaEntrega.value < hoy()) { aviso('#avisoCheckout', 'Elige una fecha de entrega desde hoy en adelante'); return; }
    aviso('#avisoCheckout', ''); pintarTotales('#resumenTotales2'); pintarMetodo(); paso(2);
  };
  $('#paso2').addEventListener('change', pintarMetodo);
  $('#volverPaso1').onclick = () => paso(1);
  $('#paso2').onsubmit = async (ev) => {
    ev.preventDefault();
    const f1 = datosForm($('#paso1')); const f2 = datosForm(ev.target);
    const btn = ev.target.querySelector('[type=submit]'); btn.disabled = true;
    try {
      const p = await llamar('/cliente/pedidos', { method: 'POST', body: {
        items: estado.carrito, tipoEntrega: f1.tipoEntrega, idZona: Number(f1.idZona), direccionEntrega: f1.direccionEntrega,
        fechaEntrega: f1.fechaEntrega, observaciones: f1.observaciones, idMetodoPago: Number(f2.idMetodoPago), referenciaPago: f2.referenciaPago,
      } });
      estado.carrito = []; guardarCarrito(); ev.target.reset(); $('#paso1').observaciones.value = '';
      $('#codigoConfirmado').textContent = p.codigo;
      $('#mensajeConfirmado').textContent = !estado.metodo.requiereReferencia
        ? `Paga ${dinero(p.valorTotal)} ${estado.metodo.tipo === 'TARJETA' ? 'con tarjeta' : 'en efectivo'} al recibir tu pedido.`
        : f2.referenciaPago ? 'Revisaremos tu comprobante y confirmaremos el pago en breve.' : `Recuerda enviar el comprobante del pago de ${dinero(p.valorTotal)} desde Mis pedidos.`;
      paso(3); cargarCatalogo();
    } catch (e) {
      aviso('#avisoCheckout', e.message);
      if (e.code === 'STOCK_INSUFICIENTE') cargarCatalogo();
    } finally { btn.disabled = false; }
  };

  $('#formSoporte').onsubmit = async (ev) => {
    ev.preventDefault();
    try {
      await llamar('/soporte', { method: 'POST', body: datosForm(ev.target) });
      aviso('#avisoSoporte', '¡Gracias! Recibimos tu mensaje y te responderemos pronto.', false);
      ev.target.asunto.value = ''; ev.target.mensaje.value = ''; ev.target.codigoPedido.value = '';
      cargarMensajes();
    } catch (e) { aviso('#avisoSoporte', e.message); }
  };

  window.addEventListener('pc:actualizar', () => {
    cargarCatalogo();
    if (location.hash === '#pedidos') cargarPedidos();
  });
  window.addEventListener('hashchange', mostrarVista);
  $('#buscarProducto').addEventListener('input', () => { clearTimeout(tBusqueda); tBusqueda = setTimeout(buscarEnServidor, 300); });
  pintarCuenta(); cargarCatalogo(); mostrarVista();
})();
