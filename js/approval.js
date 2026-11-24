/* =====================================================================
 * Obrix Nexo · aprobación interna de saldos y avisos
 *
 * - Avisos (la campanita): lo que le pasó a tus saldos o lo que espera tu aprobación.
 * - Bandeja del aprobador: saldos que esperan en SU nivel, con filtros, ficha completa, Aprobar o Rechazar (con motivo).
 * - Línea de tiempo de cada saldo: quién lo envió, aprobó o rechazó, en qué nivel y cuándo.
 * - Back office de Obrix: niveles de aprobación de cada constructora y quién aprueba en cada nivel.
 * ===================================================================== */
'use strict';

/* ---------------- avisos ---------------- */
let notifTimer = null;
const NOTIF_EVERY_MS = 60000;

function startNotifications() {
  if (notifTimer) return;
  refreshNotifications();
  notifTimer = setInterval(() => { if (S.session && S.view === 'panel' && !document.hidden) refreshNotifications(); }, NOTIF_EVERY_MS);
}
async function refreshNotifications() {
  try {
    const [n, inbox] = await Promise.all([
      api('/api/notifications'),
      isApprover() ? api(orgPath('/approvals')).catch(() => null) : Promise.resolve(null)
    ]);
    const changed = n.unread !== S.notifs?.unread || (inbox && inbox.items.length !== S.approvalsPending);
    S.notifs = n;
    if (inbox) S.approvalsPending = inbox.items.length;
    if (S.overlay?.kind === 'notifs') renderOverlay();
    else if (changed && S.view === 'panel') scheduleRender();
  } catch (e) { /* sin avisos por ahora */ }
}
function openNotifications() { openOverlay({ kind: 'notifs' }); refreshNotifications(); }
function notificationsDrawer() {
  const n = S.notifs, items = n?.items || [];
  return `<div class="scrim" onclick="closeOverlay()"></div>
  <aside class="drawer drawer-sm" role="dialog" aria-modal="true" aria-labelledby="nt-title">
    <div class="drawer-h"><button class="iconbtn" onclick="closeOverlay()" aria-label="Cerrar">${ICON.x}</button><h3 id="nt-title" class="crumb" style="color:var(--ink);font-size:15px">Avisos</h3>
      ${n?.unread ? `<button class="btn btn-ghost btn-sm" onclick="readAllNotifications()">Marcar todo como leído</button>` : ''}</div>
    <div class="drawer-b">${!n ? loadingBox() : items.length ? `<ul class="notifs">${items.map(x => `<li><button class="notif ${x.readAt ? '' : 'unread'}" onclick="openNotification('${x.id}')">
        <b>${esc(x.title)}</b>${x.body ? `<span>${esc(x.body)}</span>` : ''}<small>${fmtDT(x.createdAt)}</small></button></li>`).join('')}</ul>`
      : noData('Sin avisos', 'Aquí te avisamos cuando un saldo espere tu aprobación o cambie de estado.')}</div>
  </aside>`;
}
async function openNotification(id) {
  const x = (S.notifs?.items || []).find(i => i.id === id); if (!x) return;
  if (!x.readAt) { x.readAt = new Date().toISOString(); S.notifs.unread = Math.max(0, S.notifs.unread - 1); api(`/api/notifications/${id}/read`, { method: 'POST' }).catch(() => {}); }
  closeOverlay();
  if (x.link) { S.panel.loaded = false; navigate(x.link); } else render();
}
async function readAllNotifications() {
  try { await api('/api/notifications/read-all', { method: 'POST' }); (S.notifs.items || []).forEach(i => { i.readAt = i.readAt || new Date().toISOString(); }); S.notifs.unread = 0; renderOverlay(); render(); }
  catch (e) { fail(e); }
}

/* ---------------- línea de tiempo de un saldo ---------------- */
const TIMELINE_TEXT = {
  SUBMITTED: e => 'Lo envió a aprobación', RESUBMITTED: e => 'Lo corrigió y lo reenvió (vuelve al nivel 1)',
  APPROVED: e => `Aprobó el nivel ${e.level}${e.levelsTotal > 1 ? ' de ' + e.levelsTotal : ''}`,
  REJECTED: e => `Rechazó en el nivel ${e.level}`, OBRIX_APPROVED: e => 'Obrix lo revisó y lo publicó en la tienda',
  OBRIX_OBSERVED: e => 'Obrix lo observó'
};
function timelineHTML(events) {
  if (!events) return `<div class="box"><h4>Historial de aprobación</h4>${loadingBox()}</div>`;
  if (!events.length) return '';
  return `<div class="box"><h4>Historial de aprobación</h4><div class="timeline">${events.map(e => `<div class="tl done ${e.action === 'REJECTED' || e.action === 'OBRIX_OBSERVED' ? 'bad' : ''}"><i></i><span>
      <b>${esc(TIMELINE_TEXT[e.action]?.(e) || e.action)}</b><br><small class="muted">${esc(e.actorName)}${e.actorLabel ? ' · ' + esc(e.actorLabel) : ''} · ${fmtDT(e.at)}</small>
      ${e.reason ? `<br><small>Motivo: ${esc(e.reason)}</small>` : ''}</span></div>`).join('')}</div></div>`;
}
async function loadTimeline(orgIdValue, listingId) {
  try { return (await api(`/api/organizations/${orgIdValue}/listings/${listingId}/approval-history`)).events; }
  catch (e) { return []; }
}

/* ---------------- bandeja del aprobador ---------------- */
async function loadApprovals() {
  const f = S.panel.af || (S.panel.af = {});
  const p = new URLSearchParams();
  ['projectId', 'q', 'from', 'to'].forEach(k => { if (f[k]) p.set(k, f[k]); });
  const [inbox, projects] = await Promise.all([api(orgPath('/approvals?' + p)), S.panel.data.projects ? Promise.resolve(S.panel.data.projects) : api(orgPath('/projects')).catch(() => [])]);
  S.panel.data.inbox = inbox; S.panel.data.projects = projects;
  if (!['projectId', 'q', 'from', 'to'].some(k => f[k])) S.approvalsPending = inbox.items.length;
}
let approvalSearchTimer;
function approvalFilter(k, v) {
  S.panel.af[k] = v;
  clearTimeout(approvalSearchTimer);
  approvalSearchTimer = setTimeout(async () => { try { await loadApprovals(); } catch (e) { fail(e); } render(); }, k === 'q' ? 350 : 0);
}
function approvalsPage() {
  const inbox = S.panel.data.inbox, f = S.panel.af || {};
  const items = inbox?.items || [];
  const levelText = inbox ? `Nivel ${inbox.level}${inbox.levels > 1 ? ' de ' + inbox.levels : ''}` : '';
  const projects = S.panel.data.projects || [];
  const filtered = ['projectId', 'q', 'from', 'to'].some(k => f[k]);
  return {
    title: 'Aprobaciones', sub: `${levelText} · Ningún saldo sale a la tienda sin tu aprobación`,
    counts: { aprobaciones: S.approvalsPending || '' },
    content: `<div class="toolbar filters" role="search" aria-label="Filtrar saldos por aprobar">
        <label class="field"><span class="label">Obra</span><select class="select" id="af-project" onchange="approvalFilter('projectId', this.value)"><option value="">Todas</option>${projects.map(p => `<option value="${p.id}" ${f.projectId === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label>
        <label class="field grow"><span class="label">Material</span><input class="input" id="af-q" type="search" placeholder="Nombre, marca o código" value="${esc(f.q || '')}" oninput="approvalFilter('q', this.value)"></label>
        <label class="field"><span class="label">Enviado desde</span><input class="input" id="af-from" type="date" value="${esc(f.from || '')}" onchange="approvalFilter('from', this.value)"></label>
        <label class="field"><span class="label">Hasta</span><input class="input" id="af-to" type="date" value="${esc(f.to || '')}" onchange="approvalFilter('to', this.value)"></label>
      </div>
      ${items.length ? `<div class="tablewrap"><table><thead><tr><th>Saldo</th><th>Obra</th><th>Cantidad</th><th>Precio esperado</th><th>Recojo hasta</th><th>Lo cargó</th><th>Enviado</th><th></th></tr></thead><tbody>
        ${items.map(i => { const l = i.listing; return `<tr class="click" tabindex="0" onclick="openApproval('${l.id}')" onkeydown="if(event.key==='Enter')openApproval('${l.id}')">
          <td><div class="cellprod">${authImg(l.photos[0]?.url, 'thumb')}<span><b>${esc(l.title)}</b><small>${esc(l.publicCode)} · ${esc(CONDITION[l.condition])}</small></span></div></td>
          <td>${esc(i.projectName)}<br><small class="muted">${esc(i.district)}</small></td>
          <td class="num">${esc(uqty(l.quantityTotal, l.unitCode))}</td>
          <td class="num">${money(l.price.netUnitPrice)}<br><small class="muted">comprador ${money(l.price.unitPriceWithIgv)}</small></td>
          <td>${fmtDate(l.pickupDeadline)}</td>
          <td>${esc(i.loadedBy)}</td><td>${fmtDT(l.submittedAt)}</td>
          <td>${i.canAct ? '<button class="btn btn-primary btn-sm">Revisar</button>' : '<span class="badge b-neutral">Lo cargaste tú</span>'}</td></tr>`; }).join('')}
      </tbody></table></div>`
        : noData(filtered ? 'Nada con esos filtros' : 'No tienes saldos por aprobar', filtered ? 'Prueba quitando algún filtro.' : 'Cuando alguien de tu constructora envíe un saldo a tu nivel, te avisamos y aparece aquí.')}`
  };
}

/* ---------------- ficha del saldo para aprobar ---------------- */
async function openApproval(id) {
  let item = (S.panel.data.inbox?.items || []).find(i => i.listing.id === id);
  openOverlay({ kind: 'approval', loading: !item, item, photo: 0, timeline: null });
  if (!item) {
    try { await loadApprovals(); item = (S.panel.data.inbox?.items || []).find(i => i.listing.id === id); }
    catch (e) { /* abajo */ }
    if (!item) { closeOverlay(); openListing(id); toast('Ese saldo ya no está esperando tu aprobación.'); return; }
    openOverlay({ kind: 'approval', item, photo: 0, timeline: null });
  }
  const events = await loadTimeline(orgId(), id);
  if (S.overlay?.kind === 'approval' && S.overlay.item.listing.id === id) { S.overlay.timeline = events; renderOverlay(); }
}
function approvalDrawer(o) {
  if (o.loading) return `<div class="scrim" onclick="closeOverlay()"></div><aside class="drawer"><div class="drawer-b">${loadingBox()}</div></aside>`;
  const i = o.item, l = i.listing, p = l.price, ph = l.photos;
  return `<div class="scrim" ${o.busy ? '' : 'onclick="closeOverlay()"'}></div>
  <aside class="drawer" role="dialog" aria-modal="true" aria-label="Aprobar ${esc(l.title)}">
    <div class="drawer-h"><button class="iconbtn" onclick="closeOverlay()" aria-label="Cerrar">${ICON.x}</button><span class="crumb"><b style="color:var(--ink)">${esc(l.publicCode)}</b> · ${esc(i.projectName)}</span>${listingBadge(l)}</div>
    <div class="drawer-b">
      <div class="dimg">${ph[o.photo] ? authImg(ph[o.photo].url, '', l.title) : ''}</div>
      ${ph.length > 1 ? `<div class="gallery-thumbs">${ph.map((x, n) => `<button aria-pressed="${n === o.photo}" aria-label="Foto ${n + 1}" onclick="S.overlay.photo=${n}; renderOverlay()">${authImg(x.url)}</button>`).join('')}</div>` : ''}
      <div class="dcontent">
        <div><span class="eyebrow">${esc(categoryName(l.categoryId))} · ${esc(CONDITION[l.condition])}</span><h2 class="dname">${esc(l.title)}</h2></div>
        ${!i.canAct ? `<div class="alert alert-warning">Este saldo lo cargaste o enviaste tú. Otro aprobador de tu nivel debe revisarlo.</div>` : ''}
        <div class="box"><h4>Precio esperado</h4><dl class="kv num">
          <dt>Recibe la constructora</dt><dd><b>${money(p.netUnitPrice)}</b> por ${esc(unitWord(l.unitCode, 1))}</dd>
          <dt>Total si se vende todo</dt><dd>${money(num(p.netUnitPrice) * num(l.quantityTotal))}</dd>
          <dt>Paga el comprador</dt><dd>${money(p.unitPriceWithIgv)} con IGV (incluye comisión Obrix)</dd></dl></div>
        <dl class="kv num">
          <dt>Cantidad</dt><dd>${esc(uqty(l.quantityTotal, l.unitCode))}${l.minOrderQuantity ? ` · pedido mínimo ${esc(uqty(l.minOrderQuantity, l.unitCode))}` : ''}</dd>
          <dt>Disponible</dt><dd>${esc(uqty(l.quantityAvailable, l.unitCode))}</dd>
          <dt>Estado</dt><dd>${esc(CONDITION[l.condition])}</dd>
          <dt>Marca</dt><dd>${esc(l.brand || '—')}</dd>
          <dt>Peso unitario</dt><dd>${l.unitWeightKg ? qty(l.unitWeightKg) + ' kg' : '—'}</dd>
          <dt>Recojo hasta</dt><dd>${fmtDate(l.pickupDeadline)}</dd>
          <dt>Ubicación</dt><dd>${esc(i.projectName)} · ${esc(i.projectAddress || '')}, ${esc(i.district)}</dd>
          <dt>Responsable de obra</dt><dd>${esc(i.responsibleName || '—')}${i.responsiblePhone ? ' · ' + esc(i.responsiblePhone) : ''}</dd>
          <dt>Lo cargó</dt><dd>${esc(i.loadedBy)}${i.submittedBy && i.submittedBy !== i.loadedBy ? ` · lo envió ${esc(i.submittedBy)}` : ''}</dd>
          <dt>Descripción</dt><dd>${esc(l.description || '—')}</dd>
        </dl>
        ${timelineHTML(o.timeline)}
        ${o.rejecting ? `<div class="box"><h4>Rechazar saldo</h4>
          <label class="field ${o.reasonError ? 'err' : ''}"><span class="label">Motivo (lo verá quien lo cargó)</span>
            <textarea class="textarea" id="ap-reason" maxlength="1000" placeholder="Ej. la cantidad no coincide con el kardex de la obra" oninput="S.overlay.reason=this.value">${esc(o.reason || '')}</textarea>
            ${o.reasonError ? `<span class="help">${esc(o.reasonError)}</span>` : ''}</label></div>` : ''}
      </div>
    </div>
    <div class="drawer-f" style="flex-wrap:wrap">${!i.canAct ? '<span class="muted" style="font-size:13px">No puedes aprobar ni rechazar lo que cargaste.</span>'
      : o.rejecting ? `<button class="btn btn-ghost" onclick="S.overlay.rejecting=false; renderOverlay()" ${o.busy ? 'disabled' : ''}>Volver</button><button class="btn btn-danger btn-block" onclick="rejectApproval()" ${o.busy ? 'disabled' : ''}>Rechazar y devolver</button>`
      : `<button class="btn btn-ghost" onclick="S.overlay.rejecting=true; renderOverlay(); setTimeout(()=>$('#ap-reason')?.focus(),0)">Rechazar</button><button class="btn btn-primary btn-block" onclick="approveApproval()" ${o.busy ? 'disabled' : ''}>${ICON.check} ${l.approvalLevelCurrent < l.approvalLevelsTotal ? `Aprobar y pasar al nivel ${l.approvalLevelCurrent + 1}` : 'Aprobar'}</button>`}</div>
  </aside>`;
}
async function approveApproval() {
  const o = S.overlay; o.busy = true; renderOverlay();
  try {
    const l = await api(orgPath(`/listings/${o.item.listing.id}/approve`), { method: 'POST' });
    toast(l.status === 'PENDING_APPROVAL' ? `Aprobado. Pasó al nivel ${l.approvalLevelCurrent}.` : 'Aprobado. Ahora Obrix lo revisa y lo publica.');
    closeOverlay(); await loadSection();
  } catch (e) { o.busy = false; renderOverlay(); fail(e); if (e.code === 'NOT_PENDING_APPROVAL') { closeOverlay(); loadSection(); } }
}
async function rejectApproval() {
  const o = S.overlay, reason = (o.reason || '').trim();
  if (!reason) { o.reasonError = 'Escribe el motivo: sin motivo no se puede rechazar.'; renderOverlay(); $('#ap-reason')?.focus(); return; }
  o.busy = true; o.reasonError = null; renderOverlay();
  try {
    await api(orgPath(`/listings/${o.item.listing.id}/reject`), { method: 'POST', body: { reason } });
    toast('Rechazado. Se devolvió a quien lo cargó con tu motivo.');
    closeOverlay(); await loadSection();
  } catch (e) { o.busy = false; renderOverlay(); fail(e); }
}

/* ---------------- back office: aprobación de una constructora ---------------- */
async function openApprovalConfig(orgIdValue) {
  const name = (S.panel.data.orgs?.items || []).find(x => x.id === orgIdValue)?.tradeName || 'Constructora';
  openOverlay({ kind: 'approvalCfg', orgId: orgIdValue, name, loading: true });
  try { const cfg = await api(`/api/admin/organizations/${orgIdValue}/approval`); Object.assign(S.overlay, { cfg, levels: cfg.levels, loading: false }); renderOverlay(); }
  catch (e) { closeOverlay(); fail(e); }
}
function approvalConfigModal(o) {
  if (o.loading) return `<div class="scrim" onclick="closeOverlay()"></div><div class="modal-wrap"><div class="modal">${loadingBox()}</div></div>`;
  const c = o.cfg, active = c.members.filter(m => m.status === 'ACTIVE');
  const maxSel = Math.min(c.maxLevels, Math.max(o.levels, c.levels, ...c.members.map(m => m.level || 0)) + 1);
  const perLevel = n => active.filter(m => m.level === n).length;
  return `<div class="scrim" onclick="closeOverlay()"></div><div class="modal-wrap" role="dialog" aria-modal="true" aria-labelledby="ac-title"><div class="modal">
    <div class="modal-h"><h3 id="ac-title">Aprobación de saldos · ${esc(o.name)}</h3><button type="button" class="iconbtn" onclick="closeOverlay()" aria-label="Cerrar">${ICON.x}</button></div>
    <div class="modal-b">
      <div class="box"><h4>Niveles de aprobación</h4>
        <p class="help" style="margin:0">Según el convenio. Un saldo se envía a Obrix solo cuando aprueba el último nivel. El cambio aplica a los saldos que se envíen desde ahora.</p>
        <div class="levels">${Array.from({ length: c.levels }, (_, n) => `<span class="badge ${perLevel(n + 1) ? 'b-success' : 'b-danger'}">Nivel ${n + 1}: ${perLevel(n + 1)} ${perLevel(n + 1) === 1 ? 'aprobador' : 'aprobadores'}${c.pendingByLevel[n + 1] ? ` · ${c.pendingByLevel[n + 1]} esperando` : ''}</span>`).join('')}</div>
        <div class="actions" style="align-items:end">
          <label class="field" style="max-width:160px"><span class="label">Niveles que exige</span><select class="select" id="ac-levels" onchange="S.overlay.levels=Number(this.value); renderOverlay()">${Array.from({ length: c.maxLevels }, (_, n) => `<option value="${n + 1}" ${o.levels === n + 1 ? 'selected' : ''}>${n + 1}</option>`).join('')}</select></label>
          <button class="btn btn-primary btn-sm" onclick="saveApprovalLevels()" ${o.levels === c.levels ? 'disabled' : ''}>Guardar niveles</button>
        </div>
        ${o.levels > c.levels ? `<p class="help">Antes de guardar ${o.levels} niveles, asigna al menos un aprobador activo en cada nivel.</p>` : ''}
      </div>
      <div class="tablewrap"><table><thead><tr><th>Perfil</th><th>Nivel</th><th>Cargo (referencia)</th><th></th></tr></thead><tbody>
        ${c.members.map(m => `<tr>
          <td><b>${esc(m.fullName)}</b><br><small class="muted">${esc(m.email)} · ${m.role === 'ADMIN_EMPRESA' ? 'Admin Empresa' : 'Admin Proyecto'}${m.status !== 'ACTIVE' ? ' · desactivado' : ''}</small></td>
          <td><select class="select ac-sel" id="ac-l-${m.memberId}" aria-label="Nivel de ${esc(m.fullName)}" ${m.status !== 'ACTIVE' && !m.level ? 'disabled' : ''}>
            <option value="">No aprueba</option>${Array.from({ length: maxSel }, (_, n) => `<option value="${n + 1}" ${m.level === n + 1 ? 'selected' : ''}>Nivel ${n + 1}</option>`).join('')}</select></td>
          <td><input class="input" id="ac-t-${m.memberId}" maxlength="80" placeholder="Ej. Subgerente" value="${esc(m.label || '')}" aria-label="Cargo de ${esc(m.fullName)}"></td>
          <td><button class="btn btn-secondary btn-sm" onclick="saveApprover('${m.memberId}')">Guardar</button></td></tr>`).join('')}
      </tbody></table></div>
      <p class="help">El sistema decide por nivel, no por cargo. Si un nivel tiene varios aprobadores, basta que uno actúe. No se puede quitar ni desactivar al último aprobador de un nivel en uso.</p>
    </div>
    <div class="modal-f"><button class="btn btn-secondary" onclick="closeOverlay()">Cerrar</button></div>
  </div></div>`;
}
async function saveApprovalLevels() {
  const o = S.overlay;
  try { o.cfg = await api(`/api/admin/organizations/${o.orgId}/approval`, { method: 'PUT', body: { levels: o.levels } }); toast(`Listo: ${o.cfg.levels} ${o.cfg.levels === 1 ? 'nivel' : 'niveles'} de aprobación.`); renderOverlay(); }
  catch (e) { fail(e); }
}
async function saveApprover(memberId) {
  const o = S.overlay, level = val('ac-l-' + memberId), label = val('ac-t-' + memberId);
  try {
    o.cfg = await api(`/api/admin/organizations/${o.orgId}/approval/members/${memberId}`, { method: 'PUT', body: { level: level ? Number(level) : null, label: label || null } });
    toast(level ? `Aprobador de nivel ${level} guardado.` : 'Ya no aprueba saldos.'); renderOverlay();
  } catch (e) { fail(e); renderOverlay(); }
}
