const { AppError, unauthorized, forbidden } = require('../utils/errors');
const { verificar } = require('../services/authService');

const leerToken = (req) => {
  const h = req.headers.authorization || '';
  return h.startsWith('Bearer ') ? h.slice(7) : null;
};

// Exige sesión con el rol indicado ('cliente' o 'admin')
function requiereRol(rol) {
  return (req, res, next) => {
    try {
      const token = leerToken(req);
      if (!token) throw unauthorized();
      const u = verificar(token);
      if (u.rol !== rol) throw forbidden();
      req.usuario = u;
      next();
    } catch (e) { next(e); }
  };
}

// Lee la sesión si existe, sin exigirla
function sesionOpcional(req, res, next) {
  const token = leerToken(req);
  if (token) { try { req.usuario = verificar(token); } catch { /* sesión inválida: se ignora */ } }
  next();
}

// Envuelve controladores async para enviar errores a manejarErrores
const h = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function noEncontrado(req, res) {
  res.status(404).json({ error: { code: 'NO_ENCONTRADO', message: `Ruta no encontrada: ${req.method} ${req.originalUrl}` } });
}

// eslint-disable-next-line no-unused-vars
function manejarErrores(err, req, res, next) {
  if (err instanceof AppError) {
    return res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
  }
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: { code: 'ARCHIVO_GRANDE', message: 'El archivo es demasiado grande' } });
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: { code: 'DATOS_INVALIDOS', message: 'El cuerpo de la petición no es JSON válido' } });
  }
  // Errores de MongoDB: el validador $jsonSchema rechazó el documento o se violó un índice único
  if (err.name === 'MongoServerError' && err.code === 121) {
    return res.status(400).json({ error: { code: 'DATOS_INVALIDOS', message: 'La base de datos rechazó los datos porque no cumplen el esquema' } });
  }
  if (err.name === 'MongoServerError' && err.code === 11000) {
    return res.status(409).json({ error: { code: 'DUPLICADO', message: 'Ya existe un registro con ese valor único' } });
  }
  if (process.env.NODE_ENV !== 'test') console.error(err);
  return res.status(500).json({ error: { code: 'ERROR_INTERNO', message: 'Ocurrió un error inesperado. Intenta de nuevo.' } });
}

module.exports = { requiereRol, sesionOpcional, h, noEncontrado, manejarErrores };
