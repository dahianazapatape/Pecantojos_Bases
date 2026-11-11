// Ejecuta TODAS las pruebas de la API (api.test.js) contra un MongoDB real.
// Se omite salvo que se defina la cadena de una base de pruebas:
//   PC_TEST_MONGO_URI="mongodb+srv://usuario:clave@cluster.mongodb.net/" npm run test:mongo
// Usa la base "pecantojos_test", que se BORRA y se vuelve a cargar en cada ejecución.
const uri = process.env.PC_TEST_MONGO_URI;
if (!uri) {
  require('node:test').describe('API REST sobre MongoDB (opcional)', { skip: 'define PC_TEST_MONGO_URI para ejecutarla' }, () => {});
} else {
  process.env.MONGODB_URI = uri;
  process.env.MONGODB_DB = 'pecantojos_test';
  process.env.PC_TEST_MONGO = '1';
  require('./api.test.js');
}
