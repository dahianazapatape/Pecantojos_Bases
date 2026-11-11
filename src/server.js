// Punto de entrada: npm start (MongoDB Atlas por defecto) o npm run demo (datos en memoria)
const config = require('./config');
const { createApp } = require('./app');
const { createRepos } = require('./repositories');

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

// Intenta conectar varias veces antes de rendirse (la nube puede tardar en responder)
async function conectar(nombre, fn, { intentos, detalle, siFalla }) {
  for (let i = 1; i <= intentos; i++) {
    try {
      await fn();
      console.log(`✔ Conectado a ${nombre} (${detalle})`);
      return;
    } catch (e) {
      console.error(`✘ No fue posible conectar con ${nombre} (intento ${i}/${intentos}): ${e.message}`);
      if (i < intentos) await esperar(15000);
    }
  }
  siFalla();
}

async function main() {
  if (config.dbClient === 'mongo') {
    const { getDb } = require('./db/mongo');
    const host = config.mongo.uri.replace(/^mongodb(\+srv)?:\/\/([^@/]*@)?/, '').split(/[/?]/)[0] || 'sin MONGODB_URI';
    await conectar('MongoDB', async () => (await getDb()).command({ ping: 1 }), {
      intentos: 3,
      detalle: `${host} / ${config.mongo.dbName}`,
      siFalla: () => {
        console.error('  Revisa MONGODB_URI en el archivo .env y que tu IP esté permitida en Atlas (Network Access).');
        console.error('  El servidor inicia igual y volverá a intentar con la siguiente petición.');
      },
    });
  } else {
    console.log('ⓘ Modo demostración: datos en memoria (se reinician al cerrar el servidor)');
  }

  const app = createApp({ repos: createRepos(config.dbClient) });
  const server = app.listen(config.port, () => {
    console.log(`\n  Tienda:         http://localhost:${config.port}`);
    console.log(`  Administración: http://localhost:${config.port}/admin\n`);
  });
  server.on('error', (e) => {
    if (e.code === 'EADDRINUSE') {
      console.error(`✘ El puerto ${config.port} ya está en uso. Cierra la otra ventana del servidor o cambia PORT en el archivo .env`);
    } else {
      console.error(`✘ No fue posible iniciar el servidor: ${e.message}`);
    }
    process.exit(1);
  });
}

main();
