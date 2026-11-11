// Composición de la aplicación: repositorios -> servicios -> controladores -> rutas
const path = require('path');
const express = require('express');
const config = require('./config');
const { createRepos } = require('./repositories');
const { createAuthService } = require('./services/authService');
const { createCatalogoService } = require('./services/catalogoService');
const { createPedidoService } = require('./services/pedidoService');
const { createTiendaService } = require('./services/tiendaService');
const { createReporteService } = require('./services/reporteService');
const { createControllers } = require('./controllers');
const { createRouter } = require('./routes');
const { noEncontrado, manejarErrores } = require('./middleware');

function createApp({ repos = createRepos(), opciones = {} } = {}) {
  const services = {
    auth: createAuthService(repos),
    catalogo: createCatalogoService(repos, opciones.catalogo),
    pedidos: createPedidoService(repos, opciones.pedidos),
    tienda: createTiendaService(repos),
    reportes: createReporteService(repos),
  };

  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '3mb' }));
  app.use('/api', createRouter(createControllers(services)));
  app.use('/api', noEncontrado);
  app.use('/uploads', express.static(config.uploadsDir, { maxAge: '7d' }));
  app.use(express.static(path.join(__dirname, '..', 'public')));
  app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'admin.html')));
  app.use(manejarErrores);
  app.locals.services = services;
  app.locals.repos = repos;
  return app;
}

module.exports = { createApp };
