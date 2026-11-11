// Reportes y métricas del negocio (consultas de agregación en MongoDB)
const { badRequest, notFound, AppError } = require('../utils/errors');
const { REPORTES } = require('../repositories/mongo/reportes');

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

function createReporteService(repos) {
  return {
    disponibles() { return REPORTES; },

    async generar(nombre, { desde, hasta, limite } = {}) {
      if (!repos.reportes) throw new AppError(501, 'NO_DISPONIBLE', 'Los reportes requieren la base MongoDB (DB_CLIENT=mongo)');
      if (!REPORTES.includes(nombre)) throw notFound(`No existe el reporte "${nombre}"`);
      if (desde && !FECHA.test(desde)) throw badRequest('"desde" debe tener el formato AAAA-MM-DD');
      if (hasta && !FECHA.test(hasta)) throw badRequest('"hasta" debe tener el formato AAAA-MM-DD');
      if (desde && hasta && desde > hasta) throw badRequest('"desde" no puede ser posterior a "hasta"');
      let n;
      if (limite !== undefined) {
        n = Number(limite);
        if (!Number.isInteger(n) || n < 1 || n > 50) throw badRequest('"limite" debe ser un entero entre 1 y 50');
      }
      return { reporte: nombre, filtros: { desde: desde || null, hasta: hasta || null, limite: n || null }, filas: await repos.reportes[nombre]({ desde, hasta, limite: n }) };
    },
  };
}

module.exports = { createReporteService };
