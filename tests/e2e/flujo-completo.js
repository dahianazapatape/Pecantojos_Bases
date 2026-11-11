// Prueba funcional de extremo a extremo (navegador real) + capturas para el manual de usuario.
// Requisitos: servidor con los datos base (npm run demo, o MongoDB cargado con npm run mongo:cargar -- --solo-base) y Playwright:
//   npm i -D playwright && npx playwright install chromium
//   node tests/e2e/flujo-completo.js [carpeta-capturas]
const path = require('path');
const fs = require('fs');
const assert = require('assert/strict');
const { chromium } = require('playwright');

const BASE = process.env.PC_URL || 'http://localhost:3000';
const OUT = path.resolve(process.argv[2] || 'docs/capturas');
fs.mkdirSync(OUT, { recursive: true });
const resultados = [];

async function paso(nombre, fn) {
  const t = Date.now();
  try { await fn(); resultados.push({ nombre, ok: true, ms: Date.now() - t }); console.log(`  ✔ ${nombre}`); } catch (e) {
    resultados.push({ nombre, ok: false, ms: Date.now() - t, error: e.message }); console.log(`  ✘ ${nombre}: ${e.message}`);
  }
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 820 }, deviceScaleFactor: 2, locale: 'es-CO' });
  const page = await ctx.newPage();
  const errores = [];
  page.on('pageerror', (e) => errores.push(e.message));
  const sinToast = (pg) => pg.evaluate(() => document.querySelectorAll('.toast').forEach((t) => t.classList.add('oculto')));
  const foto = async (n, opts = {}) => { await sinToast(page); return page.screenshot({ path: path.join(OUT, `${n}.png`), ...opts }); };
  const esperar = (ms = 350) => page.waitForTimeout(ms);
  let codigo;

  console.log('Tienda (cliente)');
  await paso('E2E-01 El catálogo muestra fotos, precios y disponibilidad', async () => {
    await page.goto(BASE); await page.waitForSelector('.producto');
    await foto('c01-inicio');
    assert.equal(await page.locator('.producto').count(), 6);
    assert.ok(await page.locator('.producto.agotado button[disabled]').count() >= 1, 'el agotado no se puede agregar');
    await page.locator('#catalogo').scrollIntoViewIfNeeded(); await esperar();
    await foto('c02-catalogo');
  });
  await paso('E2E-02 Registro de un cliente nuevo', async () => {
    await page.click('#btnCuenta'); await page.click('#irRegistro');
    await page.fill('#rNombre', 'Valentina Ospina'); await page.fill('#rCorreo', `valentina${Date.now() % 10000}@correo.com`);
    await page.fill('#rTel', '3124567890'); await page.fill('#rDir', 'Calle 33 # 65-20'); await page.fill('#rPass', 'Galletas2026');
    await foto('c03-registro');
    await page.click('#formRegistro [type=submit]'); await page.waitForSelector('#modalLogin.oculto', { state: 'attached' });
    assert.match(await page.textContent('#btnCuenta'), /Salir \(Valentina\)/);
    await page.click('#btnCuenta'); await esperar();
  });
  await paso('E2E-03 Inicio de sesión del cliente', async () => {
    await page.click('#btnCuenta'); await page.fill('#lCorreo', 'cliente@demo.com'); await page.fill('#lPass', 'Cliente123');
    await foto('c04-login');
    await page.click('#formLogin [type=submit]'); await esperar();
    assert.match(await page.textContent('#btnCuenta'), /Laura/);
  });
  await paso('E2E-04 Carrito con productos y subtotal', async () => {
    await page.click('[data-agregar="1"]'); await page.click('[data-agregar="1"]'); await page.click('[data-agregar="2"]'); await page.click('[data-agregar="6"]');
    await page.click('#btnCarrito'); await esperar();
    assert.equal(await page.textContent('#contador'), '4');
    assert.match(await page.textContent('#subtotalCarrito'), /50\.500/);
    await foto('c05-carrito');
  });
  await paso('E2E-05 El domicilio se suma al total antes del pago', async () => {
    await page.click('#btnPagar'); await page.waitForSelector('#paso1:not(.oculto)');
    await page.selectOption('#cZona', '2'); await esperar(500);
    assert.match(await page.textContent('#resumenTotales'), /8\.000/);
    assert.match(await page.textContent('#resumenTotales .total'), /58\.500/);
    await foto('c06-checkout-entrega');
  });
  await paso('E2E-06 Método de pago con sus datos y confirmación del pedido', async () => {
    await page.click('#paso1 [type=submit]'); await esperar();
    await page.check('#opcionesPago input[value="3"]'); await esperar();
    assert.match(await page.textContent('#datosPago'), /Bancolombia/);
    await page.fill('#cRef', 'TRX-908172');
    await foto('c07-checkout-pago');
    await page.click('#paso2 [type=submit]'); await page.waitForSelector('#paso3:not(.oculto)');
    codigo = (await page.textContent('#codigoConfirmado')).trim();
    assert.match(codigo, /^PC-/);
    await foto('c08-confirmacion');
  });
  await paso('E2E-07 Mis pedidos muestra la etapa de cada pedido', async () => {
    await page.click('#paso3 a'); await page.waitForSelector('.progreso'); await esperar();
    assert.ok((await page.textContent('#misPedidos')).includes(codigo));
    await foto('c09-mis-pedidos');
    await page.click(`[data-ver="${codigo}"]`); await esperar();
    await foto('c10-detalle-pedido');
    await page.click('#modalPedido [data-cerrar]');
  });
  await paso('E2E-08 Atención al cliente', async () => {
    await page.goto(`${BASE}/#ayuda`); await esperar(500);
    await page.fill('#sAsunto', 'Cambio de dirección'); await page.fill('#sPedido', codigo);
    await page.fill('#sMensaje', 'Hola, ¿puedo cambiar la dirección de entrega de mi pedido?');
    await page.click('#formSoporte [type=submit]'); await esperar(600);
    assert.match(await page.textContent('#avisoSoporte'), /Recibimos tu mensaje/);
    await foto('c11-atencion-cliente');
  });

  console.log('Panel administrativo');
  const adm = await ctx.newPage();
  adm.on('pageerror', (e) => errores.push(`admin: ${e.message}`));
  const fotoA = async (n) => { await sinToast(adm); return adm.screenshot({ path: path.join(OUT, `${n}.png`) }); };
  const modulo = async (m) => { await adm.click(`[data-modulo="${m}"]`); await adm.waitForTimeout(500); };
  await paso('E2E-09 Inicio de sesión del administrador', async () => {
    await adm.goto(`${BASE}/admin`); await adm.fill('#aUsuario', 'admin'); await adm.fill('#aPass', 'Pecantojos2026!');
    await fotoA('a01-login');
    await adm.click('#formLoginAdmin [type=submit]'); await adm.waitForSelector('.kpi'); await adm.waitForTimeout(400);
    await fotoA('a02-resumen');
  });
  await paso('E2E-10 El pedido del cliente aparece en el panel', async () => {
    await modulo('pedidos');
    assert.ok((await adm.textContent('#contenido')).includes(codigo));
    await fotoA('a03-pedidos');
  });
  let stockAntes;
  await paso('E2E-11 Confirmar el pago descuenta el inventario', async () => {
    await modulo('inventario');
    stockAntes = Number((await adm.locator('tr', { hasText: 'Galleta de Nutella' }).locator('.etiqueta').first().textContent()).trim());
    await modulo('pagos');
    await fotoA('a04-pagos');
    await adm.locator('tr', { hasText: codigo }).locator('[data-confirmar-pago]').click(); await adm.waitForTimeout(600);
    await modulo('inventario');
    const despues = Number((await adm.locator('tr', { hasText: 'Galleta de Nutella' }).locator('.etiqueta').first().textContent()).trim());
    assert.equal(despues, stockAntes - 2);
    await fotoA('a07-inventario');
  });
  await paso('E2E-12 Cambiar el estado del pedido', async () => {
    await modulo('pedidos');
    await adm.locator('tr', { hasText: codigo }).click(); await adm.waitForSelector('#formEstado');
    await adm.selectOption('#nuevoEstado', 'EN_PREPARACION'); await adm.fill('#notaEstado', 'Horneando');
    await fotoA('a05-detalle-pedido');
    await adm.click('#formEstado [type=submit]'); await adm.waitForTimeout(600);
    assert.match(await adm.textContent('#modalCuerpo'), /En preparación/);
    await adm.click('#modal [data-cerrar]');
  });
  await paso('E2E-13 Calendario por fecha del pedido con detalle del día', async () => {
    await modulo('calendario');
    const hoy = await adm.evaluate(() => Pc.hoy());
    await adm.click(`[data-dia="${hoy}"]`); await adm.waitForTimeout(500);
    assert.ok((await adm.textContent('#detalleDia')).includes(codigo));
    await fotoA('a06-calendario');
    await adm.locator('#detalleDia').scrollIntoViewIfNeeded(); await adm.waitForTimeout(200);
    await fotoA('a06b-calendario-detalle');
  });
  await paso('E2E-14 Ajuste manual de inventario', async () => {
    await modulo('inventario');
    await adm.locator('tr', { hasText: 'Galleta Red Velvet' }).locator('[data-ajustar]').click();
    await adm.fill('#iStock', '15'); await adm.fill('#iMotivo', 'Horneada del día');
    await fotoA('a08-ajuste-inventario');
    await adm.click('#formAjuste [type=submit]'); await adm.waitForTimeout(500);
    assert.equal((await adm.locator('tr', { hasText: 'Galleta Red Velvet' }).locator('.etiqueta').first().textContent()).trim(), '15');
  });
  await paso('E2E-15 Gestión de productos', async () => {
    await modulo('productos'); await fotoA('a09-productos');
    await adm.click('[data-producto="2"]'); await adm.waitForSelector('#formProducto');
    await fotoA('a10-editar-producto');
    await adm.click('#modal [data-cerrar]');
  });
  await paso('E2E-16 Responder un mensaje de atención al cliente', async () => {
    await modulo('atencion');
    await fotoA('a11-atencion');
    const f = adm.locator('form[data-responder]').first();
    await f.locator('input').fill('¡Claro! Ya actualizamos la dirección.'); await f.locator('button').click(); await adm.waitForTimeout(500);
  });
  await paso('E2E-17 Métodos de pago y zonas de domicilio', async () => {
    await modulo('configuracion'); await fotoA('a12-configuracion');
    await adm.click('[data-metodo="1"]'); await adm.waitForSelector('#formMetodo');
    await fotoA('a13-editar-metodo');
    await adm.click('#modal [data-cerrar]');
  });
  await paso('E2E-18 El cliente ve el nuevo estado de su pedido', async () => {
    await page.goto(`${BASE}/#pedidos`); await page.waitForSelector('.progreso'); await page.waitForTimeout(400);
    const tarjeta = page.locator('article', { hasText: codigo });
    assert.match(await tarjeta.textContent(), /En preparación/);
  });
  await paso('E2E-19 Vista en celular', async () => {
    const m = await browser.newContext({ ...require('playwright').devices['iPhone 13'], locale: 'es-CO' });
    const mp = await m.newPage(); await mp.goto(BASE); await mp.waitForSelector('.producto');
    await mp.screenshot({ path: path.join(OUT, 'c12-movil.png') });
    await m.close();
  });
  await paso('E2E-20 Búsqueda en la tienda y en el panel (productos, pedidos y clientes)', async () => {
    const t = await ctx.newPage(); t.on('pageerror', (e) => errores.push(`busqueda: ${e.message}`));
    await t.goto(BASE); await t.waitForSelector('.producto');
    await t.fill('#buscarProducto', 'queso crema'); await t.waitForTimeout(900);
    assert.deepEqual(await t.locator('#productos .producto h3').allTextContents(), ['Galleta Red Velvet']);
    await t.close();
    await modulo('productos'); await adm.fill('[data-buscar="buscaProd"]', 'NUTE'); await adm.waitForTimeout(900);
    assert.deepEqual(await adm.locator('#resultados .producto h3').allTextContents(), ['Galleta de Nutella']);
    await fotoA('a15-busqueda-productos');
    await modulo('clientes'); await adm.fill('[data-buscar="ciudadCli"]', 'envigado'); await adm.waitForTimeout(900);
    assert.ok((await adm.textContent('#resultados')).includes('Andrés Pérez'));
    assert.ok(!(await adm.textContent('#resultados')).includes('Laura Gómez'));
    await fotoA('a16-clientes');
    await adm.locator('[data-pedidos-de]').first().click(); await adm.waitForTimeout(900);
    assert.ok((await adm.inputValue('[data-buscar="buscaPedidos"]')).length > 0, 'Ver pedidos lleva a Pedidos filtrado por el cliente');
  });
  await paso('E2E-21 Eliminar: un producto con pedidos se rechaza y uno nuevo sin pedidos se elimina', async () => {
    await modulo('productos'); await adm.fill('[data-buscar="buscaProd"]', ''); await adm.waitForTimeout(700);
    await adm.click('[data-producto="1"]'); await adm.click('[data-eliminar]'); await adm.click('[data-eliminar]'); await adm.waitForTimeout(700);
    assert.ok((await adm.textContent('body')).includes('no se puede eliminar'));
    await fotoA('a17-eliminar-rechazado');
    await adm.keyboard.press('Escape');
    await adm.click('[data-producto="nuevo"]'); await adm.fill('#pNombre', 'Galleta temporal'); await adm.fill('#pPrecio', '3000');
    await adm.click('#formProducto [type=submit]'); await adm.waitForTimeout(900);
    await adm.fill('[data-buscar="buscaProd"]', 'temporal'); await adm.waitForTimeout(900);
    await adm.locator('#resultados [data-producto]').first().click();
    await adm.click('[data-eliminar]'); await adm.click('[data-eliminar]'); await adm.waitForTimeout(900);
    assert.equal(await adm.locator('#resultados .producto').count(), 0);
  });
  await paso('E2E-22 Reportes: las 8 consultas de agregación se muestran (solo con MongoDB)', async () => {
    await modulo('reportes'); await adm.waitForTimeout(1200);
    const txt = await adm.textContent('#contenido');
    if (txt.includes('requieren la base MongoDB')) { console.log('    (omitido: el modo demo no usa MongoDB)'); return; }
    assert.equal(await adm.locator('.reporte').count(), 8);
    assert.ok(await adm.locator('.barra-h').count() > 0);
    await adm.screenshot({ path: path.join(OUT, 'a18-reportes.png'), fullPage: true });
  });
  await paso('E2E-23 Clientes: registrar, editar y eliminar (el que tiene pedidos no se elimina)', async () => {
    await modulo('clientes'); await adm.fill('[data-buscar="ciudadCli"]', ''); await adm.waitForTimeout(700);
    await adm.click('[data-cliente="nuevo"]');
    await adm.fill('#cNombre', 'Marta Ríos'); await adm.fill('#cCorreo', 'marta.rios@ejemplo.com'); await adm.fill('#cTel', '3005551234'); await adm.fill('#cCiudad', 'Bello');
    await adm.click('#formCliente [type=submit]'); await adm.waitForTimeout(900);
    await adm.fill('[data-buscar="buscaCli"]', 'marta'); await adm.waitForTimeout(900);
    assert.ok((await adm.textContent('#resultados')).includes('Marta Ríos'));
    await adm.locator('#resultados [data-cliente]').first().click();
    await adm.fill('#cCiudad', 'Envigado'); await fotoA('a19-editar-cliente');
    await adm.click('#formCliente [type=submit]'); await adm.waitForTimeout(900);
    assert.ok((await adm.textContent('#resultados')).includes('Envigado'));
    await adm.locator('#resultados [data-cliente]').first().click();
    await adm.click('[data-eliminar]'); await adm.click('[data-eliminar]'); await adm.waitForTimeout(900);
    assert.ok(!(await adm.textContent('#resultados')).includes('Marta Ríos'));
    await adm.fill('[data-buscar="buscaCli"]', 'laura'); await adm.waitForTimeout(900);
    await adm.locator('#resultados [data-cliente]').first().click();
    await adm.click('[data-eliminar]'); await adm.click('[data-eliminar]'); await adm.waitForTimeout(700);
    assert.ok((await adm.textContent('body')).includes('no se puede eliminar'));
    await adm.keyboard.press('Escape');
  });
  await paso('E2E-24 Sin errores de JavaScript en las páginas', async () => { assert.deepEqual(errores, []); });

  await browser.close();
  const fallas = resultados.filter((r) => !r.ok).length;
  fs.writeFileSync(path.join(OUT, 'resultados-e2e.json'), JSON.stringify({ fecha: new Date().toISOString(), base: BASE, total: resultados.length, fallas, resultados }, null, 2));
  console.log(`\n${resultados.length - fallas}/${resultados.length} pasos correctos`);
  process.exitCode = fallas ? 1 : 0;
})();
