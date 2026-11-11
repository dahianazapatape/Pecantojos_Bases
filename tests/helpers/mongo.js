// Carga los datos de demostración en una base MongoDB de pruebas (se borra cada vez)
// usando el mismo armado de documentos de la carga inicial, y devuelve los repositorios MongoDB.
const { getDb } = require('../../src/db/mongo');
const { prepararBase } = require('../../src/db/mongo-esquema');
const { construirDocumentos } = require('../../src/db/carga/armar-documentos');
const { createMongoRepos } = require('../../src/repositories/mongo');
const seed = require('../../src/repositories/memory/seed');

async function reposMongoDePrueba() {
  const db = await getDb();
  if (!/test|prueba/i.test(db.databaseName)) throw new Error(`Por seguridad la base de pruebas debe llamarse *_test (es "${db.databaseName}")`);
  await db.dropDatabase();
  await prepararBase(db);
  const { docs, contadores } = construirDocumentos(seed());
  for (const [c, lista] of Object.entries(docs)) if (lista.length) await db.collection(c).insertMany(lista);
  await db.collection('contadores').insertMany(contadores);
  return createMongoRepos();
}

module.exports = { reposMongoDePrueba };
