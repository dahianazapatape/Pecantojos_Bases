// Fábrica de repositorios: elige MongoDB o memoria según DB_CLIENT / --demo.
// Los servicios no saben qué base hay detrás: todos los repositorios tienen la misma interfaz.
const config = require('../config');

function createRepos(client = config.dbClient) {
  if (client === 'memory') return require('./memory').createMemoryRepos();
  return require('./mongo').createMongoRepos();
}

module.exports = { createRepos };
