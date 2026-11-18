/* =====================================================================
 * Obrix Nexo · panel de la constructora
 * Admin Empresa: resumen, saldos, publicar, pedidos, obras y perfiles de toda la constructora.
 * Admin Proyecto: publicar, sus saldos y los pedidos de sus obras (la API ya filtra por sus obras).
 * ===================================================================== */
'use strict';

const orgPath = p => `/api/organizations/${orgId()}${p}`;
const projName = id => (S.panel.data.projects || []).find(p => p.id === id)?.name || '—';

async function loadCompanySection(section) {
  const d = S.panel.data;
  const needs = {
    resumen: ['listings', 'orders', 'projects'], saldos: ['listings', 'projects'], publicar: ['projects'],
    pedidos: ['orders'], obras: ['projects'], perfiles: ['members', 'projects']
  }[section] || [];
  const loaders = {
    listings: () => api(orgPath('/listings')), orders: () => api(orgPath('/orders')),
    projects: () => api(orgPath('/projects')), members: () => api(orgPath('/members'))
  };
  const results = await Promise.all(needs.map(n => loaders[n]()));
  needs.forEach((n, i) => { d[n] = results[i]; });
  if (section === 'publicar') initPublishForm();
}

function companyCounts() {
  const d = S.panel.data;
  return {
    saldos: (d.listings || []).filter(l => l.status === 'OBSERVED').length || '',
    pedidos: (d.orders || []).filter(o => o.status === 'CONFIRMED').length || ''
  };
}

function companyPage(cur) {
  const d = S.panel.data;
  const company = isCompanyAdmin() ? 'Tu constructora' : 'Tu obra';
  switch (cur) {
    case 'resumen': return { title: 'Resumen', sub: company, content: resumenContent(), counts: companyCounts() };
    case 'saldos': return {
      title: isCompanyAdmin() ? 'Saldos' : 'Mis saldos', sub: 'Lo que publicaste y en qué estado está',
      actions: `<button class="btn btn-primary" onclick="newListing()">${ICON.plus} Publicar saldo</button>`,
      content: listingsContent(), counts: companyCounts()
    };
    case 'publicar': return { title: S.panel.edit ? 'Editar saldo' : 'Publicar saldo', sub: S.panel.edit ? esc(S.panel.edit.publicCode) : 'Crea el saldo, sube fotos y envíalo a revisión de Obrix', content: publishForm() };
    case 'pedidos': return { title: 'Pedidos', sub: 'Lo que compraron de tus saldos y lo que vas a recibir', content: ordersContent(), counts: companyCounts() };
    case 'obras': return {
      title: 'Obras', sub: 'Cada saldo pertenece a una obra',
      actions: `<button class="btn btn-primary" onclick="openOverlay({kind:'project'})">${ICON.plus} Nueva obra</button>`, content: projectsContent()
    };
    case 'perfiles': return {
      title: 'Perfiles', sub: 'Personas de tu constructora que usan Obrix',
      actions: `<button class="btn btn-primary" onclick="openOverlay({kind:'member', role:'ADMIN_PROYECTO', projectIds:[]})">${ICON.plus} Crear perfil</button>`, content: membersContent()
    };
    default: return { title: '', content: '' };
  }
}

/* ---------------- resumen ---------------- */
function resumenContent() {
  const d = S.panel.data, L = d.listings || [], O = d.orders || [];
  const sum = (arr) => arr.reduce((a, o) => a + num(o.netTotal), 0);
  const toDeliver = O.filter(o => o.status === 'CONFIRMED');
  const toReceive = O.filter(o => ['CONFIRMED', 'DELIVERED'].includes(o.status));
  const closed = O.filter(o => o.status === 'CLOSED');
  const observed = L.filter(l => l.status === 'OBSERVED');
  return `<div class="stats">
      <div class="stat"><div class="label">Saldos publicados</div><div class="v">${L.filter(l => l.status === 'PUBLISHED').length}</div><div class="s">${L.filter(l => l.status === 'PENDING_REVIEW').length} en revisión de Obrix</div></div>
      <div class="stat"><div class="label">Observados</div><div class="v">${observed.length}</div><div class="s">${observed.length ? 'Requieren tu acción' : 'Nada pendiente'}</div></div>
      <div class="stat"><div class="label">Por entregar</div><div class="v">${toDeliver.length}</div><div class="s">Pedidos pagados esperando recojo</div></div>
      <div class="stat"><div class="label">Por recibir</div><div class="v">${money0(sum(toReceive))}</div><div class="s">Obrix te liquida tras la entrega</div></div>
      <div class="stat"><div class="label">Recuperado</div><div class="v">${money0(sum(closed))}</div><div class="s">${closed.length} ${closed.length === 1 ? 'pedido liquidado' : 'pedidos liquidados'}</div></div>
    </div>
    ${observed.length ? `<div class="banner">${ICON.shield}<span>Tienes ${observed.length} ${observed.length === 1 ? 'saldo observado' : 'saldos observados'} por Obrix. <button class="btn btn-secondary btn-sm" onclick="S.panel.nextFilter='OBSERVED'; goPanel('saldos')">Revisar</button></span></div>` : ''}
    <h3 style="font-size:15px">Obras</h3>${projectCards()}
    <h3 style="font-size:15px">Últimos pedidos</h3>${ordersTable(O.slice(0, 5))}`;
}
function projectCards() {
  const d = S.panel.data, P = d.projects || [], L = d.listings || [], O = d.orders || [];
  if (!P.length) return noData('Sin obras', 'Crea tu primera obra para publicar saldos.');
  return `<div class="pcards">${P.map(p => {
    const pl = L.filter(l => l.projectId === p.id), po = O.filter(o => o.projectId === p.id && o.status !== 'CANCELLED');
    return `<div class="projcard"><div><h3>${esc(p.name)}</h3><span class="loc" style="margin-top:4px">${ICON.pin}${esc(p.district)} · ${p.status === 'ACTIVE' ? 'Activa' : 'Cerrada'}</span></div>
      <div class="metrics"><div><b>${pl.filter(l => l.status === 'PUBLISHED').length}</b><span>Publicados</span></div><div><b>${po.length}</b><span>Pedidos</span></div><div><b>${money0(po.filter(o => o.status === 'CLOSED').reduce((a, o) => a + num(o.netTotal), 0))}</b><span>Recuperado</span></div></div></div>`;
  }).join('')}</div>`;
}

/* ---------------- saldos ---------------- */
function listingsContent() {
  const L = S.panel.data.listings || [], f = S.panel.filter;
  const rows = L.filter(l => f === 'ALL' || l.status === f);
  const opts = [['ALL', 'Todos'], ['DRAFT', 'Borradores'], ['PENDING_REVIEW', 'En revisión'], ['OBSERVED', 'Observados'], ['PUBLISHED', 'Publicados'], ['PAUSED', 'Pausados'], ['SOLD_OUT', 'Agotados'], ['EXPIRED', 'Vencidos']];
  return `${chips(opts, f, 'setFilter')}
    ${rows.length ? `<div class="tablewrap"><table><thead><tr><th>Saldo</th><th>Obra</th><th>Disponible</th><th>Precio comprador</th><th>Recojo hasta</th><th>Estado</th></tr></thead><tbody>
      ${rows.map(l => `<tr class="click" tabindex="0" onclick="openListing('${l.id}')" onkeydown="if(event.key==='Enter')openListing('${l.id}')">
        <td><div class="cellprod">${authImg(l.photos[0]?.url, 'thumb')}<span><b>${esc(l.title)}</b><small>${esc(l.publicCode)} · ${l.photos.length} ${l.photos.length === 1 ? 'foto' : 'fotos'}</small></span></div></td>
        <td>${esc(projName(l.projectId))}</td>
        <td class="num">${qty(l.quantityAvailable)} <small class="muted">de ${esc(uqty(l.quantityTotal, l.unitCode))}</small></td>
        <td class="num">${money(l.price.unitPriceWithIgv)}<br><small class="muted">recibes ${money(l.price.netUnitPrice)}</small></td>
        <td>${fmtDate(l.pickupDeadline)}</td>
        <td>${badge(LISTING_ST, l.status)}${l.status === 'OBSERVED' && l.reviewNote ? `<br><small class="muted">${esc(l.reviewNote)}</small>` : ''}</td></tr>`).join('')}
    </tbody></table></div>` : noData('Nada en esta vista', 'Publica tu primer saldo con el botón "Publicar saldo".')}`;
}
function newListing() { S.panel.edit = null; S.panel.form = null; goPanel('publicar'); }

/* ---------------- publicar / editar ---------------- */
function initPublishForm() {
  const e = S.panel.edit;
  const active = (S.panel.data.projects || []).filter(p => p.status === 'ACTIVE');
  if (S.panel.form && S.panel.form.editId === (e?.id || null)) return;
  S.panel.form = e ? {
    editId: e.id, projectId: e.projectId, categoryId: e.categoryId, unitCode: e.unitCode, title: e.title, brand: e.brand || '',
    condition: e.condition, quantityTotal: e.quantityTotal, minOrderQuantity: e.minOrderQuantity ?? '', netUnitPrice: e.price.netUnitPrice,
    unitWeightKg: e.unitWeightKg ?? '', pickupDeadline: e.pickupDeadline, description: e.description || '', files: []
  } : {
    editId: null, projectId: active[0]?.id || '', categoryId: S.ref.categories[0]?.id || '', unitCode: 'UND', title: '', brand: '',
    condition: 'NUEVO_SELLADO', quantityTotal: '', minOrderQuantity: '', netUnitPrice: '', unitWeightKg: '', pickupDeadline: todayPlus(30), description: '', files: []
  };
  if (S.panel.form.netUnitPrice) updatePricePreview();
}
function pf(k, v) { S.panel.form[k] = v; if (k === 'netUnitPrice' || k === 'categoryId') updatePricePreview(); }
let previewTimer;
function updatePricePreview() {
  clearTimeout(previewTimer);
  previewTimer = setTimeout(async () => {
    const f = S.panel.form; if (!f) return;
    const el = $('#pf-preview');
    if (!(Number(f.netUnitPrice) > 0)) { f.preview = null; if (el) el.innerHTML = previewHTML(null); return; }
    try {
      f.preview = await api(`/api/pricing/preview?netUnitPrice=${encodeURIComponent(f.netUnitPrice)}&categoryId=${f.categoryId || ''}`);
    } catch (e) { f.preview = null; }
    const el2 = $('#pf-preview'); if (el2) el2.innerHTML = previewHTML(f.preview);
  }, 350);
}
const previewHTML = p => p ? `<span>El comprador verá</span><b>${money(p.unitPriceWithIgv)}</b><span class="muted">Tú recibes ${money(p.netUnitPrice)} · comisión Obrix ${(num(p.commissionRate) * 100).toFixed(0)}% · IGV ${money(p.igvAmount)}</span>`
  : '<span class="muted">Escribe tu precio para ver cuánto pagará el comprador.</span>';

function publishForm() {
  const f = S.panel.form; if (!f) return loadingBox();
  const projects = (S.panel.data.projects || []).filter(p => p.status === 'ACTIVE' || p.id === f.projectId);
  if (!projects.length) return noData('No tienes obras activas', isCompanyAdmin() ? 'Crea una obra en "Obras" para publicar saldos.' : 'Pide al Admin de tu constructora que te asigne una obra.');
  const inp = (k, label, o = {}) => `<label class="field"><span class="label">${label}</span><input class="input ${o.num ? 'num' : ''}" id="pf-${k}" ${o.type ? `type="${o.type}"` : ''} ${o.step ? `step="${o.step}"` : ''} ${o.min != null ? `min="${o.min}"` : ''} ${o.max ? `maxlength="${o.max}"` : ''} ${o.req ? 'required' : ''} value="${esc(f[k])}" placeholder="${esc(o.ph || '')}" oninput="pf('${k}', this.value)">${o.help ? `<span class="help">${o.help}</span>` : ''}</label>`;
  const sel = (k, label, options) => `<label class="field"><span class="label">${label}</span><select class="select" id="pf-${k}" onchange="pf('${k}', this.value)">${options.map(([v, l]) => `<option value="${esc(v)}" ${String(f[k]) === String(v) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>`;
  return `<form style="display:grid;gap:20px" onsubmit="submitListing(event)">
    ${f.editId ? `<div class="banner">${ICON.shield}<span>Si el saldo ya estaba enviado o publicado, al guardar vuelve a revisión de Obrix. Las fotos se cambian desde el detalle del saldo.</span></div>` : `
    <div class="form-card"><h3>Fotos del material (hasta 8)</h3>
      ${f.files.length ? `<div class="photo-grid">${f.files.map((x, i) => `<div class="photo-item"><img src="${x.url}" alt="">${i === 0 ? '<span class="cover">Portada</span>' : ''}<div class="ph-actions"><button type="button" onclick="removeDraftFile(${i})">Quitar</button></div></div>`).join('')}</div>` : ''}
      <div class="upload">${ICON.upload}<span>Toma la foto en obra con buena luz y el material completo a la vista. JPG, PNG o WebP de hasta 5 MB.</span>
        <label class="btn btn-secondary btn-sm">Elegir fotos<input type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onchange="addDraftFiles(this)"></label>
      </div>
    </div>`}
    <div class="form-card"><h3>Datos del saldo</h3>
      <div class="grid2">
        ${sel('projectId', 'Obra', projects.map(p => [p.id, `${p.name} · ${p.district}`]))}
        ${sel('categoryId', 'Categoría', S.ref.categories.map(c => [c.id, c.name]))}
        ${inp('title', 'Nombre del material', { ph: 'Inodoro one piece blanco', max: 150, req: true })}
        ${inp('brand', 'Marca (opcional)', { ph: 'Trebol', max: 80 })}
        ${sel('condition', 'Estado', Object.entries(CONDITION))}
        ${sel('unitCode', 'Unidad', S.ref.units.map(u => [u.code, u.name]))}
      </div>
      <div class="grid3">
        ${inp('quantityTotal', 'Cantidad', { type: 'number', step: '0.01', min: 0.01, num: true, req: true, ph: '10' })}
        ${inp('minOrderQuantity', 'Pedido mínimo (opcional)', { type: 'number', step: '0.01', min: 0.01, num: true, ph: '2' })}
        ${inp('unitWeightKg', 'Peso por unidad kg (opcional)', { type: 'number', step: '0.001', min: 0.001, num: true, ph: '25' })}
      </div>
      <div class="grid2">
        ${inp('netUnitPrice', 'Tu precio por unidad (S/, sin IGV)', { type: 'number', step: '0.01', min: 0.01, num: true, req: true, ph: '100.00', help: 'Lo que recibe la constructora por unidad.' })}
        <div class="field"><span class="label">Precio al comprador</span><div class="price-preview" id="pf-preview">${previewHTML(f.preview)}</div></div>
      </div>
      ${inp('pickupDeadline', 'Fecha límite de recojo', { type: 'date', req: true, help: 'Después de esta fecha el saldo vence y sale del catálogo.' })}
      <label class="field"><span class="label">Descripción (opcional)</span><textarea class="textarea" id="pf-description" maxlength="2000" placeholder="Cómo está almacenado, si está en su empaque original, acceso para camión…" oninput="pf('description', this.value)">${esc(f.description)}</textarea></label>
    </div>
    <div style="display:flex;justify-content:flex-end;gap:10px;flex-wrap:wrap">
      <button type="button" class="btn btn-secondary" onclick="S.panel.form=null; S.panel.edit=null; goPanel('saldos')">Cancelar</button>
      ${f.editId ? `<button class="btn btn-primary" type="submit" ${f.busy ? 'disabled' : ''}>${f.busy ? 'Guardando…' : 'Guardar cambios'}</button>`
        : `<button class="btn btn-secondary" type="submit" name="draft" onclick="S.panel.form.onlyDraft=true" ${f.busy ? 'disabled' : ''}>Guardar borrador</button>
           <button class="btn btn-primary" type="submit" onclick="S.panel.form.onlyDraft=false" ${f.busy ? 'disabled' : ''}>${f.busy ? 'Enviando…' : ICON.check + ' Enviar a revisión de Obrix'}</button>`}
    </div>
  </form>`;
}
function addDraftFiles(input) {
  const f = S.panel.form;
  for (const file of input.files) {
    if (f.files.length >= 8) { toast('Máximo 8 fotos por saldo.'); break; }
    if (file.size > 5 * 1024 * 1024) { toast(`"${file.name}" pesa más de 5 MB.`); continue; }
    f.files.push({ file, url: URL.createObjectURL(file) });
  }
  render();
}
function removeDraftFile(i) { const f = S.panel.form; URL.revokeObjectURL(f.files[i].url); f.files.splice(i, 1); render(); }
function listingBody(f) {
  const n = v => (v === '' || v == null) ? null : Number(v);
  return {
    projectId: f.projectId, categoryId: Number(f.categoryId), unitCode: f.unitCode, title: f.title.trim(), brand: f.brand.trim() || null,
    condition: f.condition, quantityTotal: n(f.quantityTotal), minOrderQuantity: n(f.minOrderQuantity), netUnitPrice: n(f.netUnitPrice),
    unitWeightKg: n(f.unitWeightKg), pickupDeadline: f.pickupDeadline, description: f.description.trim() || null
  };
}
async function submitListing(e) {
  e.preventDefault();
  const f = S.panel.form;
  if (!f.editId && !f.onlyDraft && !f.files.length) { toast('Agrega al menos una foto para enviar a revisión (o guárdalo como borrador).'); return; }
  f.busy = true; render();
  try {
    if (f.editId) {
      const l = await api(orgPath(`/listings/${f.editId}`), { method: 'PUT', body: listingBody(f) });
      toast(l.status === 'PENDING_REVIEW' ? 'Guardado. Volvió a revisión de Obrix.' : 'Cambios guardados.');
      S.panel.form = null; S.panel.edit = null; goPanel('saldos'); setTimeout(() => openListing(l.id), 200);
      return;
    }
    let l = await api(orgPath('/listings'), { method: 'POST', body: listingBody(f) });
    let failed = 0;
    for (const x of f.files) {
      const fd = new FormData(); fd.append('file', x.file);
      try { l = await api(orgPath(`/listings/${l.id}/photos`), { method: 'POST', body: fd }); } catch (err) { failed++; toast(`Foto no subida: ${err.message}`); }
    }
    if (!f.onlyDraft && l.photos.length) {
      l = await api(orgPath(`/listings/${l.id}/submit`), { method: 'POST' });
      toast(`Saldo ${l.publicCode} enviado. Obrix lo revisa y lo publica.`);
    } else {
      toast(failed ? 'Se guardó como borrador: revisa las fotos y envíalo a revisión.' : `Borrador ${l.publicCode} guardado.`);
    }
    f.files.forEach(x => URL.revokeObjectURL(x.url));
    S.panel.form = null; S.panel.filter = 'ALL'; goPanel('saldos');
  } catch (err) { f.busy = false; render(); fail(err); }
}

/* ---------------- detalle de un saldo ---------------- */
async function openListing(id) {
  openOverlay({ kind: 'listing', loading: true });
  try { openOverlay({ kind: 'listing', l: await api(orgPath(`/listings/${id}`)) }); }
  catch (e) { closeOverlay(); fail(e); }
}
async function listingAction(path, method = 'POST', body, okMsg) {
  const o = S.overlay;
  try {
    o.l = await api(orgPath(`/listings/${o.l.id}${path}`), { method, body });
    if (okMsg) toast(okMsg);
    renderOverlay(); refreshListingsInBackground();
  } catch (e) { fail(e); }
}
function refreshListingsInBackground() {
  api(orgPath('/listings')).then(L => { S.panel.data.listings = L; render(); }).catch(() => {});
}
async function uploadListingPhotos(input) {
  const o = S.overlay;
  for (const file of input.files) {
    const fd = new FormData(); fd.append('file', file);
    try { o.l = await api(orgPath(`/listings/${o.l.id}/photos`), { method: 'POST', body: fd }); renderOverlay(); }
    catch (e) { fail(e); }
  }
  refreshListingsInBackground();
}
function makeCover(photoId) {
  const ids = S.overlay.l.photos.map(p => p.id);
  listingAction('/photos/order', 'PUT', { photoIds: [photoId, ...ids.filter(i => i !== photoId)] }, 'Portada actualizada.');
}
function editListing() { S.panel.edit = S.overlay.l; S.panel.form = null; closeOverlay(); goPanel('publicar'); }
function listingDrawer(o) {
  if (o.loading) return `<div class="scrim" onclick="closeOverlay()"></div><aside class="drawer"><div class="drawer-b">${loadingBox()}</div></aside>`;
  const l = o.l, st = l.status, editable = ['DRAFT', 'PENDING_REVIEW', 'OBSERVED', 'PUBLISHED', 'PAUSED'].includes(st);
  const p = l.price, sp = l.suggestedPrice;
  const actions = [];
  if (st === 'DRAFT') actions.push(`<button class="btn btn-primary" onclick="listingAction('/submit','POST',undefined,'Enviado a revisión de Obrix.')">${ICON.check} Enviar a revisión</button>`);
  if (st === 'OBSERVED') {
    if (sp) actions.push(`<button class="btn btn-primary" onclick="listingAction('/accept-suggested-price','POST',undefined,'Precio aceptado: el saldo ya está publicado.')">Aceptar ${money(sp.netUnitPrice)} y publicar</button>`);
    actions.push(`<button class="btn btn-secondary" onclick="listingAction('/submit','POST',undefined,'Reenviado a revisión.')">Reenviar sin cambios</button>`);
  }
  if (st === 'PUBLISHED') actions.push(`<button class="btn btn-secondary" onclick="listingAction('/pause','POST',undefined,'Saldo pausado.')">Pausar</button>`);
  if (st === 'PAUSED') actions.push(`<button class="btn btn-primary" onclick="listingAction('/resume','POST',undefined,'Saldo publicado de nuevo.')">Reanudar</button>`);
  if (['PUBLISHED', 'PAUSED', 'SOLD_OUT', 'DRAFT', 'PENDING_REVIEW', 'OBSERVED'].includes(st)) actions.push(`<button class="btn btn-ghost" onclick="S.overlay.stock=true; renderOverlay()">Ajustar cantidad</button>`);
  if (editable) actions.push(`<button class="btn btn-ghost" onclick="editListing()">Editar datos</button>`);
  return `<div class="scrim" onclick="closeOverlay()"></div>
  <aside class="drawer" role="dialog" aria-modal="true" aria-label="${esc(l.title)}">
    <div class="drawer-h"><button class="iconbtn" onclick="closeOverlay()" aria-label="Cerrar">${ICON.x}</button><span class="crumb"><b style="color:var(--ink)">${esc(l.publicCode)}</b> · ${esc(projName(l.projectId))}</span>${badge(LISTING_ST, st)}</div>
    <div class="drawer-b"><div class="dcontent">
      <div><span class="eyebrow">${esc(categoryName(l.categoryId))} · ${esc(CONDITION[l.condition])}</span><h2 class="dname">${esc(l.title)}</h2></div>
      ${st === 'OBSERVED' ? `<div class="box internal"><h4>Observación de Obrix</h4><p>${esc(l.reviewNote || '')}</p>${sp ? `<p>Obrix propone un precio neto de <b>${money(sp.netUnitPrice)}</b> (el comprador vería ${money(sp.unitPriceWithIgv)}). Puedes aceptarlo con un clic o editar el saldo.</p>` : '<p class="help">Corrige lo indicado (datos o fotos) y vuelve a enviarlo.</p>'}</div>` : ''}
      ${st === 'PENDING_REVIEW' ? `<div class="banner">${ICON.shield}<span>Obrix está revisando este saldo. Te avisaremos si hay que corregir algo.</span></div>` : ''}
      ${st === 'EXPIRED' ? `<div class="banner">Pasó la fecha límite de recojo. Para volver a ofrecerlo, crea un saldo nuevo.</div>` : ''}
      <div class="box"><h4>Fotos <span class="muted" style="font-weight:400;font-size:12px">${l.photos.length}/8</span></h4>
        ${l.photos.length ? `<div class="photo-grid">${l.photos.map((ph, i) => `<div class="photo-item">${authImg(ph.url)}${i === 0 ? '<span class="cover">Portada</span>' : ''}${editable ? `<div class="ph-actions">${i > 0 ? `<button onclick="makeCover('${ph.id}')">Portada</button>` : ''}<button onclick="if(confirm('¿Quitar esta foto?'))listingAction('/photos/${ph.id}','DELETE',undefined,'Foto quitada.')">Quitar</button></div>` : ''}</div>`).join('')}</div>` : '<p class="help">Sin fotos todavía.</p>'}
        ${editable && l.photos.length < 8 ? `<label class="btn btn-secondary btn-sm" style="justify-self:start">${ICON.upload} Subir fotos<input type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onchange="uploadListingPhotos(this)"></label>${st === 'PUBLISHED' || st === 'PAUSED' ? '<p class="help">Agregar una foto a un saldo publicado lo devuelve a revisión.</p>' : ''}` : ''}
      </div>
      ${o.stock ? `<form class="box" onsubmit="event.preventDefault(); listingAction('/stock','PUT',{quantityAvailable:Number(val('st-qty'))},'Cantidad actualizada.'); S.overlay.stock=false">
        <h4>Ajustar cantidad disponible</h4>
        <label class="field"><span class="label">Disponible (de ${esc(uqty(l.quantityTotal, l.unitCode))})</span><input class="input num" id="st-qty" type="number" step="0.01" min="0" max="${num(l.quantityTotal)}" value="${num(l.quantityAvailable)}"></label>
        <p class="help">Úsalo si parte del material se usó en obra. 0 = agotado.</p>
        <div class="actions"><button class="btn btn-primary btn-sm" type="submit">Guardar</button><button type="button" class="btn btn-ghost btn-sm" onclick="S.overlay.stock=false; renderOverlay()">Cancelar</button></div></form>` : ''}
      <div class="box"><h4>Precio</h4><dl class="kv num">
        <dt>Tú recibes</dt><dd>${money(p.netUnitPrice)} por ${esc(unitWord(l.unitCode, 1))}</dd>
        <dt>Comisión Obrix</dt><dd>${(num(p.commissionRate) * 100).toFixed(0)}% · ${money(p.commissionAmount)}</dd>
        <dt>Comprador paga</dt><dd><b>${money(p.unitPriceWithIgv)}</b> (con IGV)</dd></dl></div>
      <dl class="kv num">
        <dt>Disponible</dt><dd>${qty(l.quantityAvailable)} de ${esc(uqty(l.quantityTotal, l.unitCode))}</dd>
        <dt>Pedido mínimo</dt><dd>${l.minOrderQuantity ? esc(uqty(l.minOrderQuantity, l.unitCode)) : 'Sin mínimo'}</dd>
        <dt>Recojo hasta</dt><dd>${fmtDate(l.pickupDeadline)}</dd>
        <dt>Marca</dt><dd>${esc(l.brand || '—')}</dd>
        <dt>Descripción</dt><dd>${esc(l.description || '—')}</dd>
        ${l.publishedAt ? `<dt>Publicado</dt><dd>${fmtDT(l.publishedAt)}</dd>` : ''}
        ${st === 'PUBLISHED' ? `<dt>En el catálogo</dt><dd><a class="link" href="#/saldo/${esc(l.publicCode)}" target="_blank" rel="noopener">Ver como comprador</a></dd>` : ''}
      </dl>
    </div></div>
    <div class="drawer-f" style="flex-wrap:wrap">${actions.join('') || '<span class="muted" style="font-size:13px">Sin acciones disponibles</span>'}</div>
  </aside>`;
}

/* ---------------- pedidos ---------------- */
function ordersContent() {
  const O = S.panel.data.orders || [], f = S.panel.filter;
  const opts = [['ALL', 'Todos'], ['REQUESTED', 'Esperando pago'], ['CONFIRMED', 'Por entregar'], ['DELIVERED', 'Entregados'], ['CLOSED', 'Cerrados'], ['CANCELLED', 'Cancelados']];
  return `${chips(opts, f, 'setFilter')}<div class="banner">${ICON.shield}<span>Los datos del comprador aparecen cuando Obrix verifica su pago. Entrega solo pedidos en estado <b>Pagado</b>.</span></div>${ordersTable(O.filter(o => f === 'ALL' || o.status === f), true)}`;
}
function ordersTable(rows, full) {
  if (!rows.length) return noData('Sin pedidos', 'Cuando alguien pida uno de tus saldos, lo verás aquí.');
  return `<div class="tablewrap"><table><thead><tr><th>Pedido</th><th>Obra</th><th>Material</th><th>Recibes</th><th>Comprador</th><th>Estado</th>${full ? '<th></th>' : ''}</tr></thead><tbody>
    ${rows.map(o => `<tr><td class="num"><b>${esc(o.code)}</b><br><small class="muted">${fmtDT(o.createdAt)}</small></td>
      <td>${esc(o.projectName || '—')}</td>
      <td>${o.items.map(i => `${esc(i.title)} <small class="muted">× ${esc(uqty(i.quantity, i.unitCode))}</small>`).join('<br>')}</td>
      <td class="num"><b>${money(o.netTotal)}</b></td>
      <td>${o.customer ? `${esc(o.customer.name)}<br><small class="muted">${esc(o.customer.phone)} · ${esc(DELIVERY[o.deliveryMode])}</small>` : '<small class="muted">Visible al pagar</small>'}</td>
      <td>${badge(ORDER_ST, o.status)}</td>
      ${full ? `<td>${o.status === 'CONFIRMED' ? `<button class="btn btn-primary btn-sm" onclick="markDelivered('${o.id}')">Marcar entregado</button>` : ''}</td>` : ''}</tr>`).join('')}
  </tbody></table></div>`;
}
async function markDelivered(id) {
  if (!confirm('¿Confirmas que el material ya se entregó al comprador?')) return;
  try { await api(orgPath(`/orders/${id}/deliver`), { method: 'POST' }); toast('Pedido marcado como entregado.'); loadSection(); }
  catch (e) { fail(e); }
}

/* ---------------- obras ---------------- */
function projectsContent() {
  const P = S.panel.data.projects || [];
  if (!P.length) return noData('Sin obras', 'Crea tu primera obra para empezar a publicar saldos.');
  return `<div class="pcards">${P.map(p => `<div class="projcard">
      <div style="display:flex;justify-content:space-between;gap:8px;align-items:start"><div><h3>${esc(p.name)}</h3><span class="loc" style="margin-top:4px">${ICON.pin}${esc(p.address)}, ${esc(p.district)}</span></div>${p.status === 'ACTIVE' ? '<span class="badge b-success">Activa</span>' : '<span class="badge b-neutral">Cerrada</span>'}</div>
      <dl class="kv" style="grid-template-columns:110px 1fr"><dt>Responsable</dt><dd>${esc(p.responsibleName || '—')} ${p.responsiblePhone ? '· ' + esc(p.responsiblePhone) : ''}</dd>
      <dt>Almacén</dt><dd>${p.assignees.length ? p.assignees.map(a => esc(a.fullName)).join(', ') : '<span class="muted">Sin Admin Proyecto</span>'}</dd></dl>
      ${isCompanyAdmin() ? `<div class="actions"><button class="btn btn-secondary btn-sm" onclick="editProject('${p.id}')">Editar</button>
        ${p.status === 'ACTIVE' ? `<button class="btn btn-ghost btn-sm" onclick="projectStatus('${p.id}','close')">Cerrar obra</button>` : `<button class="btn btn-ghost btn-sm" onclick="projectStatus('${p.id}','reopen')">Reabrir</button>`}</div>` : ''}
    </div>`).join('')}</div>`;
}
function editProject(id) { openOverlay({ kind: 'project', p: (S.panel.data.projects || []).find(p => p.id === id) }); }
async function projectStatus(id, action) {
  if (action === 'close' && !confirm('Al cerrar la obra, sus saldos publicados se pausan y los Admin Proyecto dejan de verla. ¿Continuar?')) return;
  try { await api(orgPath(`/projects/${id}/${action}`), { method: 'POST' }); toast(action === 'close' ? 'Obra cerrada.' : 'Obra reabierta.'); loadSection(); }
  catch (e) { fail(e); }
}
function projectModal(o) {
  const p = o.p || {};
  return `<div class="scrim" onclick="closeOverlay()"></div><div class="modal-wrap" role="dialog" aria-modal="true" aria-label="Obra"><form class="modal sm" onsubmit="saveProject(event)">
    <div class="modal-h"><h3>${p.id ? 'Editar obra' : 'Nueva obra'}</h3><button type="button" class="iconbtn" onclick="closeOverlay()" aria-label="Cerrar">${ICON.x}</button></div>
    <div class="modal-b">
      <label class="field"><span class="label">Nombre interno</span><input class="input" id="pj-name" required maxlength="150" value="${esc(p.name || '')}" placeholder="Edificio Los Pinos"><span class="help">No se muestra en el catálogo.</span></label>
      <label class="field"><span class="label">Dirección</span><input class="input" id="pj-address" required maxlength="250" value="${esc(p.address || '')}" placeholder="Av. Ejemplo 123"><span class="help">Se comparte con el comprador recién cuando paga.</span></label>
      <label class="field"><span class="label">Distrito</span><select class="select" id="pj-district" required><option value="">Elige el distrito</option>${DISTRICTS.map(d => `<option ${p.district === d ? 'selected' : ''}>${d}</option>`).join('')}</select><span class="help">Esto sí se muestra en el catálogo.</span></label>
      <div class="grid2">
        <label class="field"><span class="label">Responsable en obra</span><input class="input" id="pj-resp" maxlength="120" value="${esc(p.responsibleName || '')}"></label>
        <label class="field"><span class="label">Celular</span><input class="input" id="pj-phone" maxlength="20" value="${esc(p.responsiblePhone || '')}"></label>
      </div>
    </div>
    <div class="modal-f"><button type="button" class="btn btn-secondary" onclick="closeOverlay()">Cancelar</button><button class="btn btn-primary" type="submit">Guardar</button></div>
  </form></div>`;
}
async function saveProject(e) {
  e.preventDefault();
  const p = S.overlay.p;
  const body = { name: val('pj-name'), address: val('pj-address'), district: val('pj-district'), responsibleName: val('pj-resp') || null, responsiblePhone: val('pj-phone') || null };
  if (body.responsiblePhone && !validMobile(body.responsiblePhone)) { toast(MOBILE_ERROR); $('#pj-phone').focus(); return; }
  try {
    await api(orgPath(p ? `/projects/${p.id}` : '/projects'), { method: p ? 'PUT' : 'POST', body });
    toast(p ? 'Obra actualizada.' : 'Obra creada.'); closeOverlay(); loadSection();
  } catch (err) { fail(err); }
}

/* ---------------- perfiles ---------------- */
function membersContent() {
  const M = S.panel.data.members || [];
  if (!M.length) return noData('Sin perfiles', 'Crea un perfil por cada jefe de almacén o encargado de obra.');
  const me = S.session.user.id;
  return `<div class="tablewrap"><table><thead><tr><th>Nombre</th><th>Rol</th><th>Obras</th><th>Estado</th><th>Último ingreso</th><th></th></tr></thead><tbody>
    ${M.map(m => `<tr><td><b>${esc(m.fullName)}</b>${m.userId === me ? ' <small class="muted">(tú)</small>' : ''}<br><small class="muted">${esc(m.email)}${m.phone ? ' · ' + esc(m.phone) : ''}</small></td>
      <td>${m.role === 'ADMIN_EMPRESA' ? 'Admin Empresa' : 'Admin Proyecto'}</td>
      <td>${m.role === 'ADMIN_EMPRESA' ? '<small class="muted">Todas</small>' : m.projects.map(p => `<span class="badge b-accent">${esc(p.name)}</span>`).join(' ') || '—'}</td>
      <td>${m.status === 'ACTIVE' ? (m.mustChangePassword ? '<span class="badge b-warning">Pendiente de ingresar</span>' : '<span class="badge b-success">Activo</span>') : '<span class="badge b-neutral">Desactivado</span>'}</td>
      <td>${fmtDT(m.lastLoginAt)}</td>
      <td>${m.userId === me ? '' : `<div class="actions">
        ${m.role === 'ADMIN_PROYECTO' && m.status === 'ACTIVE' ? `<button class="btn btn-secondary btn-sm" onclick="editAssignments('${m.id}')">Obras</button>` : ''}
        ${m.status === 'ACTIVE' ? `<button class="btn btn-ghost btn-sm" onclick="resetPassword('${m.id}')">Contraseña temporal</button>
          <button class="btn btn-ghost btn-sm" onclick="memberStatus('${m.id}','disable')">Desactivar</button>`
          : `<button class="btn btn-ghost btn-sm" onclick="memberStatus('${m.id}','enable')">Activar</button>`}</div>`}</td></tr>`).join('')}
  </tbody></table></div>`;
}
const activeProjectsChecklist = selected => `<div class="checklist">${(S.panel.data.projects || []).filter(p => p.status === 'ACTIVE').map(p => `<label class="check"><input type="checkbox" name="mb-proj" value="${p.id}" ${selected.includes(p.id) ? 'checked' : ''}> ${esc(p.name)} · ${esc(p.district)}</label>`).join('') || '<p class="help">No hay obras activas.</p>'}</div>`;
const checkedProjects = () => [...document.querySelectorAll('input[name="mb-proj"]:checked')].map(i => i.value);
function memberModal(o) {
  return `<div class="scrim" onclick="closeOverlay()"></div><div class="modal-wrap" role="dialog" aria-modal="true" aria-label="Crear perfil"><form class="modal sm" onsubmit="saveMember(event)">
    <div class="modal-h"><h3>Crear perfil</h3><button type="button" class="iconbtn" onclick="closeOverlay()" aria-label="Cerrar">${ICON.x}</button></div>
    <div class="modal-b">
      <div class="grid2"><label class="field"><span class="label">Nombre</span><input class="input" id="mb-first" required maxlength="80"></label>
      <label class="field"><span class="label">Apellido</span><input class="input" id="mb-last" required maxlength="80"></label></div>
      <label class="field"><span class="label">Correo (usuario)</span><input class="input" id="mb-email" type="email" required maxlength="160" placeholder="almacen@constructora.pe"></label>
      <label class="field"><span class="label">Celular (opcional)</span><input class="input" id="mb-phone" maxlength="20"></label>
      <div class="segctl" role="group" aria-label="Rol">
        <button type="button" aria-pressed="${o.role === 'ADMIN_PROYECTO'}" onclick="S.overlay.role='ADMIN_PROYECTO'; renderOverlay()">Admin Proyecto (almacén)</button>
        <button type="button" aria-pressed="${o.role === 'ADMIN_EMPRESA'}" onclick="S.overlay.role='ADMIN_EMPRESA'; renderOverlay()">Admin Empresa</button>
      </div>
      ${o.role === 'ADMIN_PROYECTO' ? `<div class="field"><span class="label">Obras que verá</span>${activeProjectsChecklist(o.projectIds)}</div>` : '<p class="help">El Admin Empresa ve y administra todas las obras y perfiles.</p>'}
      <p class="help">Al guardar verás una contraseña temporal para entregarle.</p>
    </div>
    <div class="modal-f"><button type="button" class="btn btn-secondary" onclick="closeOverlay()">Cancelar</button><button class="btn btn-primary" type="submit">Crear perfil</button></div>
  </form></div>`;
}
async function saveMember(e) {
  e.preventDefault();
  const o = S.overlay;
  const body = { firstName: val('mb-first'), lastName: val('mb-last'), email: val('mb-email'), phone: val('mb-phone') || null, role: o.role, projectIds: o.role === 'ADMIN_PROYECTO' ? checkedProjects() : [] };
  if (body.phone && !validMobile(body.phone)) { toast(MOBILE_ERROR); $('#mb-phone').focus(); return; }
  try {
    const r = await api(orgPath('/members'), { method: 'POST', body });
    openOverlay({ kind: 'tempPassword', title: 'Perfil creado', who: `${r.member.fullName} (${r.member.email})`, password: r.temporaryPassword });
  } catch (err) { fail(err); }
}
function editAssignments(id) {
  const m = (S.panel.data.members || []).find(x => x.id === id);
  openOverlay({ kind: 'assign', m: { id: m.id, fullName: m.fullName, projectIds: m.projects.map(p => p.id) } });
}
function assignModal(o) {
  return `<div class="scrim" onclick="closeOverlay()"></div><div class="modal-wrap" role="dialog" aria-modal="true" aria-label="Obras asignadas"><form class="modal sm" onsubmit="saveAssign(event)">
    <div class="modal-h"><h3>Obras de ${esc(o.m.fullName)}</h3><button type="button" class="iconbtn" onclick="closeOverlay()" aria-label="Cerrar">${ICON.x}</button></div>
    <div class="modal-b">${activeProjectsChecklist(o.m.projectIds)}<p class="help">El cambio se aplica de inmediato, sin que tenga que volver a ingresar.</p></div>
    <div class="modal-f"><button type="button" class="btn btn-secondary" onclick="closeOverlay()">Cancelar</button><button class="btn btn-primary" type="submit">Guardar</button></div>
  </form></div>`;
}
async function saveAssign(e) {
  e.preventDefault();
  try { await api(orgPath(`/members/${S.overlay.m.id}/projects`), { method: 'PUT', body: { projectIds: checkedProjects() } }); toast('Obras actualizadas.'); closeOverlay(); loadSection(); }
  catch (err) { fail(err); }
}
async function memberStatus(id, action) {
  if (action === 'disable' && !confirm('La persona ya no podrá ingresar y su sesión abierta se cerrará. ¿Continuar?')) return;
  try { await api(orgPath(`/members/${id}/${action}`), { method: 'POST' }); toast(action === 'disable' ? 'Perfil desactivado.' : 'Perfil activado.'); loadSection(); }
  catch (e) { fail(e); }
}
async function resetPassword(id) {
  const name = (S.panel.data.members || []).find(x => x.id === id)?.fullName || '';
  if (!confirm(`¿Generar una contraseña temporal nueva para ${name}? La actual dejará de funcionar.`)) return;
  try {
    const r = await api(orgPath(`/members/${id}/reset-password`), { method: 'POST' });
    openOverlay({ kind: 'tempPassword', title: 'Contraseña temporal', who: name, password: r.temporaryPassword });
  } catch (e) { fail(e); }
}

function companyOverlayHTML(o) {
  switch (o.kind) {
    case 'listing': return listingDrawer(o);
    case 'project': return projectModal(o);
    case 'member': return memberModal(o);
    case 'assign': return assignModal(o);
    case 'tempPassword': return tempPasswordModal(o.title, o.who, o.password);
    default: return '';
  }
}
