// Error de negocio con código HTTP y código legible para el frontend
class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const badRequest = (msg, details) => new AppError(400, 'DATOS_INVALIDOS', msg, details);
const unauthorized = (msg = 'Debes iniciar sesión') => new AppError(401, 'NO_AUTORIZADO', msg);
const forbidden = (msg = 'No tienes permiso para esta acción') => new AppError(403, 'PROHIBIDO', msg);
const notFound = (msg = 'Recurso no encontrado') => new AppError(404, 'NO_ENCONTRADO', msg);
const conflict = (code, msg, details) => new AppError(409, code, msg, details);
const unprocessable = (code, msg) => new AppError(422, code, msg);

module.exports = { AppError, badRequest, unauthorized, forbidden, notFound, conflict, unprocessable };
