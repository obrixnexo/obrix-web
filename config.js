/*
 * Dirección de la API.
 * - En tu laptop (localhost) usa la API que corre en IntelliJ.
 * - Publicada en internet usa API_EN_LA_NUBE.
 *
 * Cuando crees el servicio en Render, cambia API_EN_LA_NUBE por la dirección que te da Render
 * (algo como https://obrix-api-xxxx.onrender.com), SIN barra "/" al final.
 */
const API_EN_LA_NUBE = 'https://obrix-api.onrender.com';

/* Landing para constructoras (el enlace "Vende tus saldos" lleva ahí). */
const LANDING_EMPRESAS = 'https://obrixnexo.com/empresas/';

window.OBRIX_CONFIG = {
  apiBase: ['localhost', '127.0.0.1'].includes(location.hostname)
    ? 'http://localhost:8080'
    : API_EN_LA_NUBE,
  landingEmpresas: ['localhost', '127.0.0.1'].includes(location.hostname)
    ? 'http://localhost:5600/empresas/'
    : LANDING_EMPRESAS
};
