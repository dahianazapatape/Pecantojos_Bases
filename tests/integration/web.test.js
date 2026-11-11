// Pruebas de integración de la interfaz web servida por Express
process.env.NODE_ENV = 'test';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../../src/app');
const { createMemoryRepos } = require('../../src/repositories/memory');

describe('Interfaz web', () => {
  let server; let base;
  before(async () => {
    server = createApp({ repos: createMemoryRepos() }).listen(0);
    await new Promise((r) => server.once('listening', r));
    base = `http://127.0.0.1:${server.address().port}`;
  });
  after(() => server.close());

  it('IT-17 sirve la tienda con sus recursos', async () => {
    const t = await fetch(`${base}/`);
    assert.equal(t.status, 200);
    const html = await t.text();
    assert.match(html, /Pecantojos/);
    for (const r of ['/css/estilos.css', '/js/comun.js', '/js/tienda.js', '/img/productos/nutella.svg', '/fonts/nunito-latin-400-normal.woff2']) {
      assert.equal((await fetch(`${base}${r}`)).status, 200, r);
    }
  });

  it('IT-18 sirve el panel administrativo en /admin', async () => {
    const a = await fetch(`${base}/admin`);
    assert.equal(a.status, 200);
    assert.match(await a.text(), /Panel administrativo/);
    assert.equal((await fetch(`${base}/js/admin.js`)).status, 200);
  });

  it('IT-19 la app se puede instalar en el celular (manifiestos, íconos y service worker)', async () => {
    for (const m of ['/manifest.webmanifest', '/admin.webmanifest']) {
      const r = await fetch(`${base}${m}`);
      assert.equal(r.status, 200, m);
      const j = JSON.parse(await r.text());
      assert.equal(j.display, 'standalone');
      assert.ok(j.icons.some((i) => i.sizes === '512x512'));
      for (const i of j.icons) assert.equal((await fetch(`${base}${i.src}`)).status, 200, i.src);
    }
    const sw = await fetch(`${base}/sw.js`);
    assert.equal(sw.status, 200);
    assert.match(sw.headers.get('content-type'), /javascript/);
  });
});
