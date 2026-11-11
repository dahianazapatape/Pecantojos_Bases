require('dotenv').config();
const path = require('path');

const demo = process.argv.includes('--demo');

module.exports = {
  port: Number(process.env.PORT) || 3000,
  // mongo = MongoDB Atlas (base de datos en la nube) · memory = demo sin base de datos (pruebas)
  dbClient: demo ? 'memory' : (process.env.DB_CLIENT || 'mongo'),
  mongo: {
    uri: process.env.MONGODB_URI || '',
    dbName: process.env.MONGODB_DB || 'pecantojos',
  },
  jwtSecret: process.env.JWT_SECRET || 'secreto-solo-para-desarrollo',
  jwtExpires: process.env.JWT_EXPIRES || '8h',
  whatsapp: process.env.WHATSAPP_NUMERO || '573000000000',
  // Carpeta de fotos subidas desde el panel. En la nube debe estar fuera de la carpeta
  // de la app (por ejemplo /home/data/uploads en Azure) para que no se borre al publicar.
  uploadsDir: process.env.UPLOADS_DIR || path.join(__dirname, '..', '..', 'public', 'uploads'),
};
