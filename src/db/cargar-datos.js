// Carga inicial de la base MongoDB (Atlas o local)
//
//   npm run mongo:cargar                         datos base + histórico de prueba de 12 meses
//   npm run mongo:cargar -- --solo-base          solo catálogo, zonas, métodos, administradora y 2 clientes
//   npm run mongo:cargar -- --reiniciar          borra las colecciones y vuelve a cargar
//   opcionales: --clientes=200 --pedidos=1500 --mensajes=40 --semilla=2026
//
// La contraseña de la administradora se toma de ADMIN_PASSWORD (.env). Si no existe, queda la de
// demostración y se muestra una advertencia para cambiarla antes de publicar.
//
// Pasos: 1) datos base  2) histórico de prueba  3) armar documentos (embebidos y referencias)
//        4) colecciones con validadores e índices  5) insertar  6) contadores  7) verificar
const bcrypt = require('bcryptjs');
const config = require('../config');
const { getDb, closeMongo } = require('./mongo');
const { prepararBase, COLECCIONES } = require('./mongo-esquema');
const { construirDocumentos } = require('./carga/armar-documentos');
const { generarHistorico } = require('./carga/historico');
const datosBase = require('../repositories/memory/seed');

const args = process.argv.slice(2);
const reiniciar = args.includes('--reiniciar');
const soloBase = args.includes('--solo-base');
const opcion = (n) => { const a = args.find((x) => x.startsWith(`--${n}=`)); return a ? Number(a.split('=')[1]) : undefined; };
const titulo = (n, t) => console.log(`\n[${n}/7] ${t}`);

async function main() {
  if (!config.mongo.uri) throw new Error('Falta MONGODB_URI en el archivo .env');
  const db = await getDb();

  // Protección: no mezclar con datos que ya existan
  const conDatos = [];
  for (const c of COLECCIONES) if (await db.collection(c).estimatedDocumentCount() > 0) conDatos.push(c);
  if (conDatos.length && !reiniciar) {
    throw new Error(`La base "${config.mongo.dbName}" ya tiene datos (${conDatos.join(', ')}). Ejecuta de nuevo con --reiniciar para borrarla y cargarla otra vez.`);
  }

  titulo(1, 'Datos base de Pecantojos');
  let datos = datosBase();
  if (process.env.ADMIN_PASSWORD) {
    if (process.env.ADMIN_PASSWORD.length < 8) throw new Error('ADMIN_PASSWORD debe tener al menos 8 caracteres');
    datos.admins = datos.admins.map((a) => ({ ...a, passwordHash: bcrypt.hashSync(process.env.ADMIN_PASSWORD, 10) }));
    console.log('  Contraseña de la administradora tomada de ADMIN_PASSWORD');
  } else {
    console.log('  ⚠ Sin ADMIN_PASSWORD: la administradora queda con la contraseña de demostración. Cámbiala antes de publicar.');
  }

  titulo(2, soloBase ? 'Histórico de prueba omitido (--solo-base)' : 'Generando histórico de prueba (12 meses)');
  if (!soloBase) {
    const opciones = {};
    for (const n of ['clientes', 'pedidos', 'mensajes', 'semilla']) if (opcion(n) !== undefined) opciones[n] = opcion(n);
    const r = generarHistorico(datos, opciones);
    datos = r.datos;
    const { periodo, ...extra } = r.resumen;
    console.log(`  Periodo ${periodo}`);
    console.log(`  ${Object.entries(extra).filter(([, n]) => n > 0).map(([k, n]) => `${k} +${n}`).join(' · ')}`);
  }
  const filas = Object.fromEntries(Object.entries(datos).map(([k, v]) => [k, v.length]));

  titulo(3, 'Armando documentos (embebidos y referencias)');
  const { docs, contadores } = construirDocumentos(datos);
  for (const [c, lista] of Object.entries(docs)) console.log(`  ${c.padEnd(22)} ${lista.length} documento(s)`);

  titulo(4, `Preparando la base "${config.mongo.dbName}" (validadores $jsonSchema e índices)`);
  if (reiniciar) {
    for (const c of [...COLECCIONES, 'contadores']) await db.collection(c).drop().catch(() => {});
    console.log('  Colecciones anteriores eliminadas (--reiniciar)');
  }
  await prepararBase(db, { log: console.log });

  titulo(5, 'Insertando documentos');
  const rechazados = [];
  for (const [c, lista] of Object.entries(docs)) {
    if (!lista.length) continue;
    try {
      // ordered:false -> inserta todos los válidos y reporta los que el validador rechazó
      await db.collection(c).insertMany(lista, { ordered: false });
    } catch (e) {
      for (const w of (e.writeErrors || [e])) {
        const idx = w.index ?? (w.err && w.err.index);
        rechazados.push({ coleccion: c, _id: lista[idx] ? lista[idx]._id : '?', motivo: w.errmsg || w.message });
      }
    }
    console.log(`  ✔ ${c}`);
  }

  titulo(6, 'Ajustando contadores de ids (los nuevos registros continúan la numeración)');
  await db.collection('contadores').bulkWrite(contadores.map((x) => ({
    updateOne: { filter: { _id: x._id }, update: { $set: { valor: x.valor } }, upsert: true },
  })));

  titulo(7, 'Verificando');
  const esperado = {
    administradores: filas.admins, clientes: filas.clientes, categorias: filas.categorias, productos: filas.productos,
    zonas: filas.zonas, metodosPago: filas.metodos, pedidos: filas.pedidos, movimientosInventario: filas.movimientos, mensajesSoporte: filas.mensajes,
  };
  let ok = rechazados.length === 0;
  for (const [c, n] of Object.entries(esperado)) {
    const real = await db.collection(c).countDocuments();
    if (real !== n) ok = false;
    console.log(`  ${real === n ? '✔' : '✘'} ${c.padEnd(22)} esperado ${String(n).padStart(5)}  ·  en MongoDB ${String(real).padStart(5)}`);
  }
  const [emb] = await db.collection('pedidos').aggregate([{ $group: {
    _id: null, detalles: { $sum: { $size: '$detalles' } }, historial: { $sum: { $size: '$historial' } }, pagos: { $sum: { $size: '$pagos' } },
    total: { $sum: '$valorTotal' },
  } }]).toArray();
  const e = emb || { detalles: 0, historial: 0, pagos: 0, total: 0 };
  for (const [k, n] of [['detalles', filas.detalles], ['historial', filas.historial], ['pagos', filas.pagos]]) {
    if (e[k] !== n) ok = false;
    console.log(`  ${e[k] === n ? '✔' : '✘'} ${`pedidos.${k}`.padEnd(22)} esperado ${String(n).padStart(5)}  ·  en MongoDB ${String(e[k]).padStart(5)}  (embebidos)`);
  }
  const totalEsperado = datos.pedidos.reduce((s, p) => s + Number(p.valorTotal), 0);
  if (Math.abs(totalEsperado - e.total) > 0.01) ok = false;
  console.log(`  ${Math.abs(totalEsperado - e.total) < 0.01 ? '✔' : '✘'} ventas totales          esperado ${totalEsperado}  ·  en MongoDB ${e.total}`);

  if (rechazados.length) {
    console.log('\n✘ Documentos rechazados por el validador:');
    for (const r of rechazados) console.log(`  - ${r.coleccion} _id=${r._id}: ${r.motivo}`);
  }
  console.log(ok ? '\n✔ Carga completada sin diferencias.' : '\n✘ La carga terminó con diferencias; revisa los mensajes anteriores.');
  if (!ok) process.exitCode = 1;
}

main()
  .catch((e) => { console.error('\n✘', e.message); process.exitCode = 1; })
  .finally(() => closeMongo().catch(() => {}));
