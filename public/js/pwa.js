// Instalación como app (PWA), aviso sin conexión y actualización automática de datos
(() => {
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }

  // Botón "Instalar app" (Android / Chrome / Edge). En iPhone: Compartir > Agregar a inicio.
  let aviso = null;
  const btn = document.getElementById('btnInstalar');
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    aviso = e;
    if (btn) btn.classList.remove('oculto');
  });
  if (btn) btn.addEventListener('click', async () => {
    if (!aviso) return;
    aviso.prompt();
    await aviso.userChoice.catch(() => {});
    aviso = null;
    btn.classList.add('oculto');
  });
  window.addEventListener('appinstalled', () => btn && btn.classList.add('oculto'));

  // Franja de "sin conexión"
  const franja = document.createElement('div');
  franja.className = 'sin-conexion oculto';
  franja.setAttribute('role', 'status');
  franja.textContent = 'Sin conexión: estás viendo la última información guardada.';
  document.body.appendChild(franja);
  const estadoRed = () => franja.classList.toggle('oculto', navigator.onLine);
  window.addEventListener('online', () => { estadoRed(); avisar(); });
  window.addEventListener('offline', estadoRed);
  estadoRed();

  // Cuando la app vuelve a primer plano o regresa la conexión, las pantallas recargan sus datos
  let ultimo = Date.now();
  function avisar() {
    if (Date.now() - ultimo < 5000) return;
    ultimo = Date.now();
    window.dispatchEvent(new CustomEvent('pc:actualizar'));
  }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') avisar(); });
})();
