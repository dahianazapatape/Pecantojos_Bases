// npm run mongo:check     -> verifica la conexión con MongoDB y muestra cuántos documentos hay
// npm run mongo:preparar  -> crea/actualiza colecciones, validadores e índices sin tocar los datos
const config = require('../config');
const { getDb, closeMongo } = require('./mongo');
const { prepararBase, COLECCIONES } = require('./mongo-esquema');

(async () => {
  try {
    const db = await getDb();
    await db.command({ ping: 1 });
    const host = config.mongo.uri.replace(/^mongodb(\+srv)?:\/\/([^@/]*@)?/, '').split(/[/?]/)[0];
    console.log(`Conexión a MongoDB: OK (${host} / ${config.mongo.dbName})`);
    if (process.argv.includes('--preparar')) {
      await prepararBase(db, { log: console.log });
      console.log('Colecciones, validadores e índices listos.');
    }
    for (const c of COLECCIONES) console.log(`  ${c.padEnd(22)} ${await db.collection(c).countDocuments()} documento(s)`);
  } catch (e) {
    console.error('No fue posible conectar con MongoDB:', e.message);
    console.error('Revisa MONGODB_URI en el .env, el usuario/contraseña de Atlas y que tu IP esté en Network Access.');
    process.exitCode = 1;
  } finally {
    await closeMongo();
  }
})();
