// Conexión a MongoDB (Atlas en la nube o un servidor local).
// La cadena de conexión viene de MONGODB_URI en el archivo .env; nunca se escribe en el código.
const dns = require('dns');
const { MongoClient } = require('mongodb');
const config = require('../config');

let clientePromise = null;

// Las cadenas mongodb+srv:// necesitan una consulta DNS de tipo SRV. Algunos routers e
// ISP no la responden y Node (sobre todo en Windows) falla con "querySrv ECONNREFUSED".
// Si pasa, se repite la consulta con DNS públicos (Google y Cloudflare).
const DNS_PUBLICOS = ['8.8.8.8', '1.1.1.1'];
async function prepararDns(uri) {
  if (!uri.startsWith('mongodb+srv://')) return;
  const host = uri.slice('mongodb+srv://'.length).split('@').pop().split(/[/?]/)[0];
  try {
    await dns.promises.resolveSrv(`_mongodb._tcp.${host}`);
  } catch (e) {
    if (process.env.MONGODB_DNS === 'sistema') throw e;
    dns.setServers(DNS_PUBLICOS);
    dns.promises.setServers(DNS_PUBLICOS);
    await dns.promises.resolveSrv(`_mongodb._tcp.${host}`);
    console.log(`DNS del sistema sin respuesta SRV (${e.code || e.message}); se usan DNS públicos ${DNS_PUBLICOS.join(', ')}`);
  }
}

function getClient() {
  if (!clientePromise) {
    if (!config.mongo.uri) {
      return Promise.reject(new Error('Falta MONGODB_URI en el archivo .env'));
    }
    const cliente = new MongoClient(config.mongo.uri, {
      appName: 'pecantojos',
      maxPoolSize: 10, // conexiones reutilizables entre peticiones
      serverSelectionTimeoutMS: 15000,
    });
    clientePromise = prepararDns(config.mongo.uri).then(() => cliente.connect()).catch((e) => {
      clientePromise = null;
      throw e;
    });
  }
  return clientePromise;
}

async function getDb() {
  return (await getClient()).db(config.mongo.dbName);
}

// Ejecuta fn dentro de una transacción multi-documento (Atlas siempre es un replica set).
// Si fn lanza un error, MongoDB deshace todos los cambios hechos con esa sesión.
async function enTransaccion(fn) {
  const cliente = await getClient();
  const session = cliente.startSession();
  try {
    let resultado;
    await session.withTransaction(async () => { resultado = await fn(session); }, {
      readConcern: { level: 'snapshot' },
      writeConcern: { w: 'majority' },
    });
    return resultado;
  } finally {
    await session.endSession();
  }
}

// Ids numéricos consecutivos (más fáciles de leer que un ObjectId en códigos y pantallas).
// Se guardan en la colección "contadores": { _id: 'pedidos', valor: 15 }.
// Con cantidad > 1 reserva un bloque y devuelve el primero.
async function siguienteId(nombre, { cantidad = 1, session } = {}) {
  const db = await getDb();
  const r = await db.collection('contadores').findOneAndUpdate(
    { _id: nombre },
    { $inc: { valor: cantidad } },
    { upsert: true, returnDocument: 'after', session },
  );
  return r.valor - cantidad + 1;
}

async function closeMongo() {
  if (clientePromise) {
    const c = await clientePromise.catch(() => null);
    clientePromise = null;
    if (c) await c.close();
  }
}

module.exports = { getClient, getDb, enTransaccion, siguienteId, closeMongo };
