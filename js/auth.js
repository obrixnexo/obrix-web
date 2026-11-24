/* =====================================================================
 * Obrix Nexo · ingreso, cambio de contraseña y armazón del panel
 * El panel que se muestra depende del rol que devuelve la API:
 *   OPERADOR / ADMIN_OBRIX → panel Obrix · ADMIN_EMPRESA → panel constructora · ADMIN_PROYECTO → panel de obra
 * ===================================================================== */
'use strict';

function viewLogin() {
  return `<div class="sessionbar">${logo()}<span class="grow"></span><button class="btn btn-ghost btn-sm" onclick="navigate('#/')">Volver a la tienda</button></div>
  <div class="auth"><form class="auth-card" onsubmit="doLogin(event)">
    <div><h1>Ingresa a tu panel</h1><p class="muted" style="margin-top:4px">Para constructoras y el equipo de Obrix.</p></div>
    <label class="field"><span class="label">Correo</span><input class="input" id="lg-email" type="email" autocomplete="username" required></label>
    <label class="field"><span class="label">Contraseña</span><input class="input" id="lg-pass" type="password" autocomplete="current-password" required></label>
    <div id="lg-error"></div>
    <button class="btn btn-primary btn-lg" type="submit" id="lg-btn">Ingresar</button>
    <p class="help">¿Olvidaste tu contraseña? Pídele al Admin de tu constructora (o a Obrix) una contraseña temporal.</p>
  </form></div>`;
}
async function doLogin(e) {
  e.preventDefault();
  const btn = $('#lg-btn'); btn.disabled = true; btn.textContent = 'Ingresando…';
  try {
    const r = await api('/api/auth/login', { method: 'POST', body: { email: val('lg-email'), password: $('#lg-pass').value } });
    saveSession(r);
    navigate(r.user.mustChangePassword ? '#/panel' : '#/panel');
  } catch (err) {
    $('#lg-error').innerHTML = `<div class="alert alert-danger">${esc(err.message)}</div>`;
    btn.disabled = false; btn.textContent = 'Ingresar';
  }
}

function viewChangePassword() {
  const forced = S.session?.user?.mustChangePassword;
  return `<div class="sessionbar">${logo()}<span class="grow"></span><button class="btn btn-ghost btn-sm" onclick="logout()">Salir</button></div>
  <div class="auth"><form class="auth-card" onsubmit="doChangePassword(event)">
    <div><h1>${forced ? 'Crea tu contraseña' : 'Cambiar contraseña'}</h1>
      <p class="muted" style="margin-top:4px">${forced ? 'Ingresaste con una contraseña temporal. Crea una propia para continuar.' : ''}</p></div>
    <label class="field"><span class="label">Contraseña ${forced ? 'temporal' : 'actual'}</span><input class="input" id="cp-current" type="password" autocomplete="current-password" required></label>
    <label class="field"><span class="label">Nueva contraseña</span><input class="input" id="cp-new" type="password" autocomplete="new-password" minlength="8" maxlength="72" required><span class="help">Mínimo 8 caracteres, con al menos una letra y un número.</span></label>
    <label class="field"><span class="label">Repite la nueva contraseña</span><input class="input" id="cp-new2" type="password" autocomplete="new-password" required></label>
    <div id="cp-error"></div>
    <button class="btn btn-primary btn-lg" type="submit">Guardar contraseña</button>
    ${forced ? '' : `<button type="button" class="btn btn-ghost" onclick="navigate('#/panel')">Cancelar</button>`}
  </form></div>`;
}
async function doChangePassword(e) {
  e.preventDefault();
  const n1 = $('#cp-new').value, n2 = $('#cp-new2').value;
  if (n1 !== n2) { $('#cp-error').innerHTML = '<div class="alert alert-danger">Las contraseñas no coinciden.</div>'; return; }
  try {
    await api('/api/auth/change-password', { method: 'POST', body: { currentPassword: $('#cp-current').value, newPassword: n1 } });
    await refreshMe();
    toast('Contraseña guardada.');
    S.view = 'panel'; navigate('#/panel');
  } catch (err) { $('#cp-error').innerHTML = `<div class="alert alert-danger">${esc(err.message)}</div>`; }
}

/* ---------------- términos y condiciones (perfiles de constructora) ---------------- */
function viewTerms() {
  const u = S.session?.user;
  return `<div class="sessionbar">${logo()}<span class="grow"></span><button class="btn btn-ghost btn-sm" onclick="logout()">Salir</button></div>
  <div class="auth"><form class="auth-card terms-card" onsubmit="doAcceptTerms(event)">
    <div><h1>Términos y condiciones</h1>
      <p class="muted" style="margin-top:4px">Antes de usar el panel, lee y acepta los términos de Obrix Nexo (versión ${esc(u?.termsVersion || '')}).</p></div>
    <ul class="terms-points">
      <li>Obrix intermedia la venta: los compradores pagan a Obrix y Obrix te liquida tu precio neto después de la entrega.</li>
      <li>Cada saldo pasa por la aprobación de tu constructora y por la revisión de Obrix antes de publicarse.</li>
      <li>Publicas solo material que tu constructora puede vender, con datos, fotos y cantidades reales.</li>
      <li>Entregas en obra solo pedidos que Obrix marcó como pagados, dentro de la fecha límite de recojo.</li>
    </ul>
    <a class="btn btn-secondary" href="${esc(termsUrl())}" target="_blank" rel="noopener">Leer los términos completos</a>
    <label class="privacy"><input type="checkbox" id="tc-ok" required> <span>Leí y acepto los términos y condiciones de Obrix Nexo.</span></label>
    <div id="tc-error"></div>
    <button class="btn btn-primary btn-lg" type="submit" id="tc-btn">Aceptar y continuar</button>
  </form></div>`;
}
async function doAcceptTerms(e) {
  e.preventDefault();
  const btn = $('#tc-btn'); btn.disabled = true;
  try {
    const me = await api('/api/auth/accept-terms', { method: 'POST', body: { version: S.session.user.termsVersion } });
    S.session.user = me; store.set('obrix.session', S.session);
    toast('Términos aceptados.');
    S.panel.loaded = false; navigate('#/panel');
  } catch (err) {
    if (err.code === 'TERMS_OUTDATED') { try { await refreshMe(); } catch (x) { /* nada */ } render(); }
    $('#tc-error').innerHTML = `<div class="alert alert-danger">${esc(err.message)}</div>`; btn.disabled = false;
  }
}

/* ---------------- armazón del panel ---------------- */
function panelKind() { return isStaff() ? 'obrix' : isCompanyAdmin() ? 'empresa' : 'proyecto'; }
function panelNav() {
  const k = panelKind();
  if (k === 'obrix') return [
    { id: 'revision', label: 'Revisión de saldos', icon: 'shield' }, { id: 'pedidos', label: 'Pedidos y pagos', icon: 'bag' },
    { id: 'constructoras', label: 'Constructoras', icon: 'brief' }, { id: 'solicitudes', label: 'Solicitudes', icon: 'inbox' }];
  const approvals = isApprover() ? [{ id: 'aprobaciones', label: 'Aprobaciones', icon: 'stamp' }] : [];
  if (k === 'empresa') return [
    { id: 'resumen', label: 'Resumen', icon: 'home' }, ...approvals, { id: 'saldos', label: 'Saldos', icon: 'list' },
    { id: 'publicar', label: 'Publicar saldo', icon: 'addc' }, { id: 'pedidos', label: 'Pedidos', icon: 'truck' },
    { id: 'obras', label: 'Obras', icon: 'brief' }, { id: 'perfiles', label: 'Perfiles', icon: 'users' }];
  return [...approvals, { id: 'publicar', label: 'Publicar saldo', icon: 'addc' }, { id: 'saldos', label: 'Mis saldos', icon: 'list' },
    { id: 'pedidos', label: 'Pedidos', icon: 'truck' }];
}
function openPanel(section) {
  const nav = panelNav();
  const target = nav.find(n => n.id === section)?.id || nav[0].id;
  startNotifications();
  if (S.panel.section !== target || !S.panel.loaded) {
    S.panel.section = target; S.panel.filter = S.panel.nextFilter || 'ALL'; S.panel.nextFilter = null;
    S.panel.q = ''; S.panel.data = {}; S.panel.loaded = false; S.panel.af = {};
    if (target !== 'publicar') S.panel.edit = null;
    loadSection();
  } else if (S.panel.openId) {
    openPendingItem();
  }
}
/** Abre el saldo que pedía el enlace del aviso (#/panel/...?saldo=ID), una vez cargada la sección. */
function openPendingItem() {
  const id = S.panel.openId; S.panel.openId = null;
  if (!id || panelKind() === 'obrix') return;
  if (S.panel.section === 'aprobaciones') openApproval(id); else openListing(id);
}
function goPanel(section) { navigate('#/panel/' + section); }
async function loadSection() {
  S.panel.loading = true; scheduleRender();
  try {
    const k = panelKind();
    if (k === 'obrix') await loadObrixSection(S.panel.section);
    else await loadCompanySection(S.panel.section);
    S.panel.loaded = true;
  } catch (e) { fail(e); }
  S.panel.loading = false; scheduleRender();
  if (S.panel.openId) setTimeout(openPendingItem, 0);
}
function viewPanel() {
  if (!S.session) return viewLogin();
  const k = panelKind(), nav = panelNav(), cur = S.panel.section || nav[0].id;
  const u = S.session.user;
  const roleLabel = (k === 'obrix' ? 'Obrix · Backoffice' : k === 'empresa' ? 'Admin Empresa' : 'Admin Proyecto · Almacén')
    + (isApprover() ? ` · Aprobador nivel ${approverLevel()}` : '');
  const unread = S.notifs?.unread || 0;
  const page = S.panel.loading && !S.panel.loaded ? { title: nav.find(n => n.id === cur)?.label || '', content: loadingBox() }
    : k === 'obrix' ? obrixPage(cur) : companyPage(cur);
  return `<div class="shell">
    <aside class="side" aria-label="Menú del panel">
      ${logo("navigate('#/')")}
      <div class="side-role">${esc(roleLabel)}</div>
      <button class="nav" onclick="openNotifications()" aria-label="Avisos${unread ? `, ${unread} sin leer` : ''}">${ICON.bell}<span>Avisos</span>${unread ? `<span class="count">${unread}</span>` : ''}</button>
      ${nav.map(n => { const c = page.counts?.[n.id] || (n.id === 'aprobaciones' ? S.approvalsPending || '' : ''); return `<button class="nav" ${cur === n.id ? 'aria-current="page"' : ''} onclick="goPanel('${n.id}')">${ICON[n.icon]}<span>${n.label}</span>${c ? `<span class="count">${c}</span>` : ''}</button>`; }).join('')}
      <div class="side-foot">
        <span><b style="color:#fff">${esc(u.fullName)}</b><br>${esc(u.email)}</span>
        <button class="btn btn-ghost btn-sm" style="color:var(--ink-on-navy-muted);justify-content:flex-start" onclick="S.view='password'; render()">Cambiar contraseña</button>
        <button class="btn btn-ghost btn-sm" style="color:var(--ink-on-navy-muted);justify-content:flex-start" onclick="logout('Sesión cerrada.')">${ICON.logout} Cerrar sesión</button>
      </div>
    </aside>
    <main class="main">
      <div class="main-h"><h2>${page.title}${page.sub ? `<span class="sub">${page.sub}</span>` : ''}</h2>${page.actions || ''}</div>
      <div class="content">${page.content}</div>
    </main>
  </div>`;
}
function panelOverlayHTML(o) {
  if (o.kind === 'notifs') return notificationsDrawer(o);
  return panelKind() === 'obrix' ? obrixOverlayHTML(o) : companyOverlayHTML(o);
}

/* ---------------- piezas comunes de los paneles ---------------- */
function chips(options, current, onClick) {
  return `<div class="toolbar" role="toolbar" aria-label="Filtrar">${options.map(([k, l]) => `<button class="chip" aria-pressed="${current === k}" onclick="${onClick}('${k}')">${l}</button>`).join('')}</div>`;
}
function setFilter(f) { S.panel.filter = f; render(); }
function tempPasswordModal(title, who, password) {
  return `<div class="scrim"></div><div class="modal-wrap" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="modal sm">
    <div class="modal-h"><h3>${esc(title)}</h3></div>
    <div class="modal-b">
      <p>Contraseña temporal de <b>${esc(who)}</b>:</p>
      <div class="pw" id="tmp-pw">${esc(password)}</div>
      <div class="alert alert-warning">Cópiala y entrégasela por un canal seguro (WhatsApp o en persona). <b>Solo se muestra esta vez.</b> Al ingresar se le pedirá crear su propia contraseña.</div>
    </div>
    <div class="modal-f"><button class="btn btn-secondary" onclick="copyText('${esc(password)}')">Copiar</button><button class="btn btn-primary" onclick="closeOverlay(); loadSection()">Listo</button></div>
  </div></div>`;
}
const priceCell = p => `${money(p.unitPriceWithIgv)}<br><small class="muted">neto ${money(p.netUnitPrice)}</small>`;
