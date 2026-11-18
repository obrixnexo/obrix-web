/* =====================================================================
 * Obrix Nexo · núcleo del frontend
 * Conexión con la API, sesión, rutas (#/...), utilidades y dibujo de pantallas.
 * Todo se dibuja con plantillas de texto (como el prototipo) y se vuelve a dibujar al cambiar el estado.
 * ===================================================================== */
'use strict';

const API = window.OBRIX_CONFIG.apiBase;

/* ---------------- estado global ---------------- */
const S = {
  view: 'home',                     // home | market | track | login | password | panel
  ref: { categories: [], units: [], districts: [], settings: null },
  session: null,                    // { token, expiresAt, user }
  overlay: null,                    // { kind, ...datos } → drawer o modal abierto
  mk: { q: '', categoryId: null, district: '', sort: 'recent', page: 0, items: [], total: 0, loading: false },
  home: { items: [], total: 0 },
  track: { token: null, data: null, loading: false },
  panel: { section: null, data: {}, loading: false, filter: 'ALL', projectId: null, edit: null }
};

/* ---------------- utilidades ---------------- */
const $ = (s, el = document) => el.querySelector(s);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = v => Number(v ?? 0);
const money = n => 'S/ ' + num(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const money0 = n => 'S/ ' + Math.round(num(n)).toLocaleString('en-US');
const qty = n => num(n).toLocaleString('en-US', { maximumFractionDigits: 2 });
// Unidad abreviada y en plural cuando corresponde: 10 und, 1 rollo, 30 rollos, 120 m²
const UNIT_WORDS = { UND: ['und', 'und'], PAR: ['par', 'pares'], PQT: ['paquete', 'paquetes'], CAJA: ['caja', 'cajas'], ROLLO: ['rollo', 'rollos'], BOLSA: ['bolsa', 'bolsas'], BALDE: ['balde', 'baldes'], GALON: ['galón', 'galones'], KG: ['kg', 'kg'], M: ['m', 'm'], M2: ['m²', 'm²'], M3: ['m³', 'm³'], MILLAR: ['millar', 'millares'], PLANCHA: ['plancha', 'planchas'], VARILLA: ['varilla', 'varillas'] };
const unitWord = (code, n) => { const u = UNIT_WORDS[code]; return u ? u[num(n) === 1 ? 0 : 1] : String(code || '').toLowerCase(); };
// RUC con el mismo algoritmo de SUNAT que usa la API (prefijo + dígito verificador)
function validRuc(r) {
  if (!/^\d{11}$/.test(r || '') || !['10', '15', '16', '17', '20'].includes(r.slice(0, 2))) return false;
  const w = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const sum = w.reduce((a, x, i) => a + x * Number(r[i]), 0);
  const d = 11 - (sum % 11);
  return (d === 10 ? 0 : d === 11 ? 1 : d) === Number(r[10]);
}
// Teléfonos: mismas reglas que la API (celular: 9 dígitos que empiezan con 9; fijo: con código de zona)
const validMobile = t => /^(\+?51)? *9( ?[0-9]){8}$/.test((t || '').trim());
const validPhone = t => /^(\+?51)? *(9( ?[0-9]){8}|0?[1-8]( ?[0-9]){6,7})$/.test((t || '').trim());
const MOBILE_ERROR = 'Celular no válido: son 9 dígitos y empieza con 9 (ej. 987 654 321).';
const PHONE_ERROR = 'Teléfono no válido: escribe un celular (9 dígitos) o un fijo con su código (ej. 01 4567890).';
const RUC_ERROR = 'RUC no válido: revisa los 11 dígitos (el último es un dígito verificador).';
const uqty = (n, code) => `${qty(n)} ${unitWord(code, n)}`;
const fmtDate = v => !v ? '—' : v.length === 10 ? v.split('-').reverse().join('/') : new Date(v).toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Lima' });
const fmtDT = v => v ? new Date(v).toLocaleString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'America/Lima' }) : '—';
const todayPlus = days => { const d = new Date(); d.setDate(d.getDate() + days); return d.toISOString().slice(0, 10); };
const val = id => ($('#' + id)?.value ?? '').trim();
const fullUrl = path => path ? (path.startsWith('http') ? path : API + path) : '';

const DISTRICTS = ['Ate', 'Barranco', 'Breña', 'Callao', 'Carabayllo', 'Cercado de Lima', 'Chorrillos', 'Comas', 'El Agustino',
  'Independencia', 'Jesús María', 'La Molina', 'La Victoria', 'Lince', 'Los Olivos', 'Lurín', 'Magdalena del Mar', 'Miraflores',
  'Pachacámac', 'Pueblo Libre', 'Puente Piedra', 'Rímac', 'San Borja', 'San Isidro', 'San Juan de Lurigancho',
  'San Juan de Miraflores', 'San Luis', 'San Martín de Porres', 'San Miguel', 'Santa Anita', 'Santiago de Surco', 'Surquillo',
  'Villa El Salvador', 'Villa María del Triunfo'];

const CONDITION = { NUEVO_SELLADO: 'Nuevo, sellado', NUEVO_ABIERTO: 'Nuevo, empaque abierto', USADO_BUEN_ESTADO: 'Usado, buen estado' };
const LISTING_ST = {
  DRAFT: ['Borrador', 'b-neutral'], PENDING_REVIEW: ['En revisión', 'b-warning'], OBSERVED: ['Observado', 'b-danger'],
  PUBLISHED: ['Publicado', 'b-success'], PAUSED: ['Pausado', 'b-neutral'], SOLD_OUT: ['Agotado', 'b-accent'], EXPIRED: ['Vencido', 'b-neutral']
};
const ORDER_ST = {
  REQUESTED: ['Esperando pago', 'b-warning'], CONFIRMED: ['Pagado', 'b-success'], DELIVERED: ['Entregado', 'b-accent'],
  CLOSED: ['Cerrado', 'b-neutral'], CANCELLED: ['Cancelado', 'b-danger']
};
const PAYMENT_ST = { PENDING: ['Por verificar', 'b-warning'], VERIFIED: ['Verificado', 'b-success'], REJECTED: ['Rechazado', 'b-danger'] };
const PAYMENT_METHOD = { YAPE: 'Yape', PLIN: 'Plin', TRANSFERENCIA: 'Transferencia', DEPOSITO: 'Depósito' };
const DELIVERY = { RECOJO_EN_OBRA: 'Recojo en obra', POR_COORDINAR: 'Por coordinar', ENTREGA: 'Entrega a domicilio u obra' };
const CANCEL_REASON = { CLIENTE_DESISTE: 'El comprador desistió', SIN_PAGO: 'Sin pago a tiempo', MATERIAL_NO_DISPONIBLE: 'Material no disponible', DATOS_INVALIDOS: 'Datos inválidos', OTRO: 'Otro motivo' };
const badge = (map, key) => { const [t, c] = map[key] || [key, 'b-neutral']; return `<span class="badge ${c}">${esc(t)}</span>`; };

const ICON = {
  pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>',
  x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>',
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13l4 4L19 7"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5L12 3l9 7.5V20a1 1 0 01-1 1h-5v-6H9v6H4a1 1 0 01-1-1z"/></svg>',
  users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.9M16 3.1a4 4 0 010 7.8"/></svg>',
  brief: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2"/></svg>',
  bag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><path d="M3 6h18M16 10a4 4 0 01-8 0"/></svg>',
  list: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>',
  truck: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 3h15v13H1zM16 8h4l3 3v5h-7z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>',
  addc: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v8M8 12h8"/></svg>',
  shield: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-4"/></svg>',
  inbox: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.5 5.1L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.5-6.9A2 2 0 0016.8 4H7.2a2 2 0 00-1.7 1.1z"/></svg>',
  upload: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>',
  filter: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M22 3H2l8 9.5V19l4 2v-8.5z"/></svg>',
  logout: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/></svg>'
};
const LOGO_SVG = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><rect x="3" y="6" width="8" height="14" rx="1" fill="#fff"/><rect x="13" y="10" width="8" height="10" rx="1" fill="#fff" fill-opacity=".6"/><path d="M11 12h2" stroke="#0f2a4a" stroke-width="2" stroke-linecap="round"/></svg>';
const logo = (act = "navigate('#/')") => `<button class="logo" onclick="${act}" aria-label="Obrix Nexo, inicio"><span class="logo-mark">${LOGO_SVG}</span><span class="logo-text">Obrix<span> Nexo</span></span></button>`;
const noData = (title, text) => `<div class="empty"><h3>${esc(title)}</h3><p>${esc(text)}</p></div>`;
const loadingBox = () => '<p class="skeleton">Cargando…</p>';

let toastTimer;
function toast(msg) {
  let t = $('#toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; t.className = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
  t.textContent = msg; t.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 4200);
}

/* ---------------- almacenamiento local (puede fallar en modo privado) ---------------- */
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* sin almacenamiento: la sesión dura hasta recargar */ } },
  del(k) { try { localStorage.removeItem(k); } catch (e) { /* nada */ } }
};

/* ---------------- conexión con la API ---------------- */
class ApiError extends Error {
  constructor(status, data) {
    const fields = data?.fields ? Object.values(data.fields) : [];
    super(fields[0] || data?.detail || (status === 0 ? 'No se pudo conectar con el servidor. ¿Está encendida la API?' : 'Ocurrió un error. Intenta de nuevo.'));
    this.status = status; this.code = data?.code; this.fields = data?.fields || {};
  }
}

/**
 * Llama a la API. body = objeto (se envía como JSON) o FormData (para fotos).
 * Si la sesión venció o fue cortada (401), cierra la sesión y lleva al ingreso.
 */
async function api(path, { method = 'GET', body } = {}) {
  const headers = {};
  if (S.session?.token) headers.Authorization = 'Bearer ' + S.session.token;
  let payload;
  if (body instanceof FormData) payload = body;
  else if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
  let res;
  try { res = await fetch(API + path, { method, headers, body: payload }); }
  catch (e) { throw new ApiError(0, null); }
  const text = res.status === 204 ? '' : await res.text();
  let data = null;
  if (text) { try { data = JSON.parse(text); } catch (e) { data = null; } }
  if (!res.ok) {
    const err = new ApiError(res.status, data);
    if (res.status === 401 && S.session && path !== '/api/auth/login') {
      logout(err.code === 'SESSION_INVALID' ? 'Tu acceso fue desactivado o cambió. Vuelve a ingresar.' : 'Tu sesión terminó. Vuelve a ingresar.');
    } else if (err.code === 'PASSWORD_CHANGE_REQUIRED') {
      S.view = 'password'; render();
    }
    throw err;
  }
  return data;
}

/** Muestra el error de la API en un aviso. Devuelve null para usar en .catch(). */
function fail(e) { toast(e?.message || 'Ocurrió un error.'); return null; }

/* ---------------- fotos que requieren token ---------------- */
/* Las fotos de saldos no publicados solo se ven con sesión: se descargan con el token y se muestran como blob. */
const imgCache = new Map();
const authImg = (path, cls = '', alt = '') => path ? `<img class="${cls}" data-auth-src="${esc(path)}" alt="${esc(alt)}">` : `<span class="${cls}"></span>`;
async function hydrateImages() {
  for (const img of document.querySelectorAll('img[data-auth-src]:not([src])')) {
    const path = img.dataset.authSrc;
    if (imgCache.has(path)) { img.src = imgCache.get(path); continue; }
    try {
      const res = await fetch(API + path, { headers: { Authorization: 'Bearer ' + (S.session?.token || '') } });
      if (!res.ok) continue;
      const url = URL.createObjectURL(await res.blob());
      imgCache.set(path, url);
      document.querySelectorAll(`img[data-auth-src="${CSS.escape(path)}"]`).forEach(i => { i.src = url; });
    } catch (e) { /* sin foto */ }
  }
}

/* ---------------- sesión ---------------- */
const roles = () => S.session?.user?.roles || [];
const hasRole = r => roles().includes(r);
const isStaff = () => hasRole('OPERADOR') || hasRole('ADMIN_OBRIX');
const isCompanyAdmin = () => hasRole('ADMIN_EMPRESA');
const isProjectAdmin = () => hasRole('ADMIN_PROYECTO') && !hasRole('ADMIN_EMPRESA');
const orgId = () => S.session?.user?.organizationId;

function saveSession(login) {
  S.session = { token: login.accessToken, expiresAt: login.expiresAt, user: login.user };
  store.set('obrix.session', S.session);
}
function restoreSession() {
  const s = store.get('obrix.session');
  if (s?.token && s.expiresAt && new Date(s.expiresAt) > new Date()) S.session = s; else store.del('obrix.session');
}
async function refreshMe() {
  const me = await api('/api/auth/me');
  S.session.user = me; store.set('obrix.session', S.session);
  return me;
}
function logout(message) {
  S.session = null; store.del('obrix.session'); imgCache.clear();
  S.panel = { section: null, data: {}, loading: false, filter: 'ALL', projectId: null, edit: null };
  S.overlay = null;
  if (message) toast(message);
  navigate('#/ingresar');
}

/* ---------------- rutas ---------------- */
function navigate(hash) {
  if (location.hash === hash) route(); else location.hash = hash;
}
function route() {
  const h = location.hash.replace(/^#\/?/, '');
  const [path, query] = h.split('?');
  const [first, second] = path.split('/');
  S.overlay = null;
  if (first === 'saldos') {
    // Enlaces desde la landing: #/saldos?q=cable o #/saldos?cat=2
    const qs = new URLSearchParams(query || '');
    if (qs.has('q')) S.mk.q = qs.get('q');
    if (qs.has('cat')) S.mk.categoryId = Number(qs.get('cat')) || null;
    S.view = 'market'; loadMarket(true);
  }
  else if (first === 'saldo' && second) { S.view = 'market'; if (!S.mk.items.length) loadMarket(true); openDetail(decodeURIComponent(second)); }
  else if (first === 'pedido' && second) { S.view = 'track'; loadTrack(decodeURIComponent(second)); }
  else if (first === 'ingresar') { S.view = S.session ? 'panel' : 'login'; if (S.session) openPanel(); }
  else if (first === 'panel') {
    if (!S.session) { S.view = 'login'; }
    else if (S.session.user?.mustChangePassword) { S.view = 'password'; }
    else { S.view = 'panel'; openPanel(second); }
  }
  else { S.view = 'home'; loadHome(); }
  render();
  window.scrollTo({ top: 0 });
}

/* ---------------- dibujo ---------------- */
let renderQueued = false;
function render() {
  const app = $('#app');
  const focusId = document.activeElement?.id; const sel = document.activeElement?.selectionStart;
  let html;
  switch (S.view) {
    case 'market': html = viewMarket(); break;
    case 'track': html = viewTrack(); break;
    case 'login': html = viewLogin(); break;
    case 'password': html = viewChangePassword(); break;
    case 'panel': html = viewPanel(); break;
    default: html = viewHome();
  }
  app.innerHTML = html;
  if (focusId) { const el = document.getElementById(focusId); if (el?.focus) { el.focus({ preventScroll: true }); try { if (sel != null && el.setSelectionRange) el.setSelectionRange(sel, sel); } catch (e) { /* nada */ } } }
  renderOverlay();
  hydrateImages();
}
function scheduleRender() { if (renderQueued) return; renderQueued = true; requestAnimationFrame(() => { renderQueued = false; render(); }); }

function renderOverlay() {
  const ov = $('#overlay');
  const focusId = document.activeElement?.id; const sel = document.activeElement?.selectionStart;
  const scrollEl = ov.querySelector('.drawer-b, .modal-b'); const st = scrollEl ? scrollEl.scrollTop : 0;
  const html = S.overlay ? overlayHTML(S.overlay) : '';
  ov.innerHTML = html;
  document.body.style.overflow = html ? 'hidden' : '';
  const ns = ov.querySelector('.drawer-b, .modal-b'); if (ns && st) ns.scrollTop = st;
  if (focusId && ov.contains(document.getElementById(focusId))) { const el = document.getElementById(focusId); el.focus({ preventScroll: true }); try { if (sel != null && el.setSelectionRange) el.setSelectionRange(sel, sel); } catch (e) { /* nada */ } }
  hydrateImages();
}
function overlayHTML(o) {
  switch (o.kind) {
    case 'detail': return detailHTML(o);
    case 'checkout': return checkoutHTML(o);
    case 'orderDone': return orderDoneHTML(o);
    default: return panelOverlayHTML(o);       // los paneles definen el resto
  }
}
function openOverlay(o) { S.overlay = o; renderOverlay(); }
function closeOverlay() {
  if (S.overlay?.kind === 'detail' && location.hash.startsWith('#/saldo/')) { history.replaceState(null, '', '#/saldos'); }
  S.overlay = null; renderOverlay();
}
document.addEventListener('keydown', e => { if (e.key === 'Escape' && S.overlay && !S.overlay.busy) closeOverlay(); });

/* ---------------- arranque ---------------- */
async function loadReference() {
  const [categories, units, districts, settings] = await Promise.all([
    api('/api/public/categories').catch(() => []),
    api('/api/public/units').catch(() => []),
    api('/api/public/districts').catch(() => []),
    api('/api/public/settings').catch(() => null)
  ]);
  Object.assign(S.ref, { categories, units, districts, settings });
}
/*
 * En el hosting gratis (Render) la API se apaga tras 15 min sin visitas y tarda ~1 min en volver.
 * Antes de mostrar la página esperamos a que responda, con un aviso si demora.
 */
async function waitForApi(maxMs = 150000) {
  const t0 = Date.now();
  let done = false;
  const timer = setTimeout(() => {
    if (done) return;
    $('#app').innerHTML = `<div class="wake"><div class="wake-card">${logo()}
      <h1>Encendiendo la demo…</h1>
      <p>El servidor estaba en reposo. La primera vez puede tardar hasta 1 minuto; luego todo va rápido.</p>
      <div class="wake-bar"><span></span></div></div></div>`;
  }, 1500);
  while (Date.now() - t0 < maxMs) {
    try {
      const r = await fetch(API + '/api/public/settings', { cache: 'no-store' });
      if (r.ok) { done = true; clearTimeout(timer); return true; }
    } catch (e) { /* aún despertando */ }
    await new Promise(res => setTimeout(res, 3000));
  }
  done = true; clearTimeout(timer);
  return false;
}
async function start() {
  restoreSession();
  await waitForApi();
  window.addEventListener('hashchange', route);
  route();
  await loadReference();
  if (!S.ref.categories.length) toast('No se pudo conectar con la API (' + API + '). ¿Está encendida?');
  if (S.session) { try { await refreshMe(); } catch (e) { /* api() ya cerró la sesión si corresponde */ } }
  scheduleRender();
}
