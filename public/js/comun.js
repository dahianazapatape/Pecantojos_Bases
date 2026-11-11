// Utilidades compartidas por la tienda y el panel administrativo
const Pc = (() => {
  const memoria = {};
  const guardar = {
    get(k) { try { return localStorage.getItem(k); } catch { return memoria[k] ?? null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { memoria[k] = v; } },
    del(k) { try { localStorage.removeItem(k); } catch { delete memoria[k]; } },
  };

  async function api(ruta, { method = 'GET', body, token } = {}) {
    const headers = {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (token) headers.Authorization = `Bearer ${token}`;
    let res;
    try {
      res = await fetch(`/api${ruta}`, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
    } catch {
      throw Object.assign(new Error('No hay conexión con el servidor'), { code: 'SIN_CONEXION' });
    }
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const e = new Error((json.error && json.error.message) || 'Ocurrió un error');
      e.code = json.error && json.error.code;
      e.status = res.status;
      e.details = json.error && json.error.details;
      throw e;
    }
    return json.data;
  }

  const pesos = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
  const dinero = (v) => pesos.format(Number(v) || 0);

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function fecha(iso, conHora = false) {
    if (!iso) return '';
    const d = iso.length === 10 ? new Date(`${iso}T12:00:00`) : new Date(iso);
    return d.toLocaleDateString('es-CO', conHora
      ? { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }
      : { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  }

  function fechaCorta(iso, conHora = false) {
    if (!iso) return '';
    const d = iso.length === 10 ? new Date(`${iso}T12:00:00`) : new Date(iso);
    return d.toLocaleDateString('es-CO', conHora ? { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' } : { weekday: 'short', day: 'numeric', month: 'short' });
  }

  function hoy(diasMas = 0) {
    const d = new Date();
    d.setDate(d.getDate() + diasMas);
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  }

  let timer;
  function toast(msg, error = false) {
    let t = document.querySelector('.toast');
    if (!t) { t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
    t.textContent = msg;
    t.classList.toggle('error', error);
    t.classList.remove('oculto');
    clearTimeout(timer);
    timer = setTimeout(() => t.classList.add('oculto'), 3500);
  }

  const $ = (sel, raiz = document) => raiz.querySelector(sel);
  const $$ = (sel, raiz = document) => [...raiz.querySelectorAll(sel)];

  const ETIQUETA_DISP = { DISPONIBLE: 'Disponible', POCAS_UNIDADES: 'Pocas unidades', AGOTADO: 'Agotado', NO_DISPONIBLE: 'No disponible' };

  // Al cerrar sesión se borran los datos guardados para uso sin conexión
  function borrarDatosGuardados() {
    try { if (navigator.serviceWorker && navigator.serviceWorker.controller) navigator.serviceWorker.controller.postMessage('borrar-datos'); } catch { /* sin service worker */ }
  }

  return { borrarDatosGuardados, api, dinero, esc, fecha, fechaCorta, hoy, toast, $, $$, guardar, ETIQUETA_DISP };
})();
