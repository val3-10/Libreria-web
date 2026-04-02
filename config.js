/**
 * URL base de la API (Node en server/). Sin barra final.
 *
 * En local: deja el valor por defecto o usa http://localhost:3000
 *
 * Si publicas el front en GitHub Pages (https://...), debes poner aquí la URL
 * pública de tu API con HTTPS. Si dejas http://localhost, el navegador
 * bloqueará las peticiones y verás "falló el guardado" al usar el carrito.
 */
(function () {
  var custom = typeof window.API_BASE === 'string' ? window.API_BASE.trim() : '';
  if (custom) {
    window.API_BASE = custom.replace(/\/$/, '');
    return;
  }
  window.API_BASE = 'http://localhost:3000';
})();
