/* =====================================================================
 * Obrix Nexo · panel de Obrix (operador y administrador)
 * Revisión de saldos, pedidos y verificación manual de pagos, constructoras y solicitudes.
 * ===================================================================== */
'use strict';

const LEAD_ST = { NUEVO: ['Nueva', 'b-warning'], AGENDADO: ['Presentación agendada', 'b-accent'], APROBADO: ['Aprobada', 'b-success'], DESCARTADO: ['Descartada', 'b-neutral'] };

async function loadObrixSection(section) {
  const d = S.panel.data, f = S.panel.filter;
  if (section === 'revision') {
    d.queue = await api('/api/admin/listings?size=100&status=' + (f === 'ALL' ? 'PENDING_REVIEW' : f));
  } else if (section === 'pedidos') {
    const p = new URLSearchParams({ size: 100 });
    if (f !== 'ALL') p.set('status', f);
    if (S.panel.q) p.set('q', S.panel.q);
    d.orders = await api('/api/admin/orders?' + p);
  } else if (section === 'constructoras') {
    const p = new URLSearchParams({ size: 100 }); if (S.panel.q) p.set('q', S.panel.q);
    d.orgs = await api('/api/admin/organizations?' + p);
  } else if (section === 'solicitudes') {
    d.leads = await api('/api/admin/leads');
  }
}
function obrixFilter(f) { S.panel.filter = f; loadSection(); }
let obrixSearchTimer;
function obrixSearch(v) { S.panel.q = v; clearTimeout(obrixSearchTimer); obrixSearchTimer = setTimeout(loadSection, 350); }

function obrixPage(cur) {
  const d = S.panel.data, f = S.panel.filter;
  if (cur === 'revision') {
    const items = d.queue?.items || [];
    return {
      title: 'Revisión de saldos', sub: 'Ya aprobados por su constructora: revisa fotos, datos y precio antes de publicarlos',
      content: `${chips([['ALL', 'Por revisar'], ['OBSERVED', 'Observados (esperan a la constructora)']], f, 'obrixFilter')}
        ${items.length ? `<div class="tablewrap"><table><thead><tr><th>Saldo</th><th>Constructora · obra</th><th>Cantidad</th><th>Precio neto</th><th>Recojo hasta</th><th>Enviado</th><th></th></tr></thead><tbody>
          ${items.map(i => `<tr class="click" onclick="openReview('${i.organizationId}','${i.id}')"><td><b>${esc(i.title)}</b><br><small class="muted">${esc(i.publicCode)} · ${esc(i.categoryName)} · ${i.photoCount} ${i.photoCount === 1 ? 'foto' : 'fotos'}</small></td>
            <td>${esc(i.organizationName)}<br><small class="muted">${esc(i.projectName)} · ${esc(i.district)}</small></td>
            <td class="num">${esc(uqty(i.quantityTotal, i.unitCode))}</td><td class="num">${money(i.netUnitPrice)}</td>
            <td>${fmtDate(i.pickupDeadline)}</td><td>${fmtDT(i.submittedAt)}</td>
            <td><button class="btn btn-primary btn-sm">Revisar</button></td></tr>`).join('')}
        </tbody></table></div>` : noData('Nada por revisar', 'Llegan aquí los saldos que ya aprobó su constructora.')}`,
      counts: { revision: f === 'ALL' ? (d.queue?.totalItems || '') : '' }
    };
  }
  if (cur === 'pedidos') {
    const items = d.orders?.items || [];
    const opts = [['ALL', 'Todos'], ['REQUESTED', 'Esperando pago'], ['CONFIRMED', 'Pagados'], ['DELIVERED', 'Entregados'], ['CLOSED', 'Cerrados'], ['CANCELLED', 'Cancelados']];
    return {
      title: 'Pedidos y pagos', sub: 'Verifica cada pago en el banco o en el Yape de Obrix antes de confirmarlo',
      actions: `<label class="search" style="max-width:280px"><span class="sr">Buscar</span>${ICON.search}<input id="ob-q" type="search" style="color:var(--ink);background:var(--surface);border-color:var(--border-strong)" placeholder="Código, cliente o documento" value="${esc(S.panel.q || '')}" oninput="obrixSearch(this.value)"></label>`,
      content: `${chips(opts, f, 'obrixFilter')}
        ${items.length ? `<div class="tablewrap"><table><thead><tr><th>Pedido</th><th>Comprador</th><th>Constructora · obra</th><th>Total</th><th>Estado</th><th>Pagos</th></tr></thead><tbody>
          ${items.map(o => `<tr class="click" onclick="openAdminOrder('${o.id}')"><td class="num"><b>${esc(o.code)}</b><br><small class="muted">${fmtDT(o.createdAt)}</small></td>
            <td>${esc(o.customerName)}</td><td>${esc(o.sellerName)}<br><small class="muted">${esc(o.projectName)}</small></td>
            <td class="num"><b>${money(o.total)}</b></td><td>${badge(ORDER_ST, o.status)}${o.status === 'REQUESTED' && o.reservationExpiresAt ? `<br><small class="muted">vence ${fmtDT(o.reservationExpiresAt)}</small>` : ''}</td>
            <td>${o.pendingPayments ? `<span class="badge b-warning">${o.pendingPayments} por verificar</span>` : '—'}</td></tr>`).join('')}
        </tbody></table></div>` : noData('Sin pedidos en esta vista', 'Los pedidos llegan cuando un comprador pide desde el catálogo.')}`
    };
  }
  if (cur === 'constructoras') {
    const items = d.orgs?.items || [];
    return {
      title: 'Constructoras', sub: 'Alta de constructoras, su primer Admin Empresa y sus niveles de aprobación',
      actions: `<label class="search" style="max-width:240px"><span class="sr">Buscar</span>${ICON.search}<input id="ob-q" type="search" style="color:var(--ink);background:var(--surface);border-color:var(--border-strong)" placeholder="Nombre o RUC" value="${esc(S.panel.q || '')}" oninput="obrixSearch(this.value)"></label>
        <button class="btn btn-primary" onclick="openOverlay({kind:'org'})">${ICON.plus} Nueva constructora</button>`,
      content: items.length ? `<div class="tablewrap"><table><thead><tr><th>Constructora</th><th>RUC</th><th>Alta</th><th>Estado</th><th></th></tr></thead><tbody>
        ${items.map(o => `<tr><td><b>${esc(o.tradeName)}</b><br><small class="muted">${esc(o.legalName)}</small></td><td class="num">${esc(o.ruc)}</td><td>${fmtDate(o.createdAt)}</td>
          <td>${o.status === 'ACTIVE' ? '<span class="badge b-success">Activa</span>' : '<span class="badge b-danger">Suspendida</span>'}</td>
          <td><div class="actions">${o.status === 'ACTIVE' ? `<button class="btn btn-secondary btn-sm" onclick="openApprovalConfig('${o.id}')">${ICON.stamp} Aprobación</button><button class="btn btn-ghost btn-sm" onclick="orgStatus('${o.id}','suspend')">Suspender</button>` : `<button class="btn btn-secondary btn-sm" onclick="orgStatus('${o.id}','reactivate')">Reactivar</button>`}</div></td></tr>`).join('')}
      </tbody></table></div>` : noData('Sin constructoras', 'Da de alta la primera con "Nueva constructora".')
    };
  }
  const leads = d.leads || [];
  return {
    title: 'Solicitudes de constructoras', sub: 'Llegan desde el formulario "Agenda una presentación" de la web',
    content: leads.length ? `<div class="tablewrap"><table><thead><tr><th>Constructora</th><th>Contacto</th><th>Obras</th><th>Recibida</th><th>Estado</th><th></th></tr></thead><tbody>
      ${leads.map(l => `<tr><td><b>${esc(l.companyName)}</b><br><small class="muted">${l.ruc ? 'RUC ' + esc(l.ruc) : 'Sin RUC'}</small></td>
        <td>${esc(l.contactName)}${l.contactRole ? ' · ' + esc(l.contactRole) : ''}<br><small class="muted">${esc(l.email)} ${esc(l.phone || '')}</small></td>
        <td class="num">${l.activeProjects ?? '—'}</td><td>${fmtDate(l.createdAt)}</td>
        <td><select class="select" style="min-height:32px;width:auto" aria-label="Estado" onchange="leadStatus('${l.id}', this.value)">${Object.entries(LEAD_ST).map(([k, [t]]) => `<option value="${k}" ${l.status === k ? 'selected' : ''}>${t}</option>`).join('')}</select></td>
        <td><button class="btn btn-secondary btn-sm" onclick="orgFromLead('${l.id}')">Dar de alta</button></td></tr>`).join('')}
    </tbody></table></div>` : noData('Sin solicitudes', 'Aparecen cuando una constructora llena el formulario de la web.'),
    counts: { solicitudes: leads.filter(l => l.status === 'NUEVO').length || '' }
  };
}

/* ---------------- revisión de un saldo ---------------- */
async function openReview(organizationId, listingId) {
  openOverlay({ kind: 'review', loading: true });
  try { openOverlay({ kind: 'review', orgId: organizationId, l: await api(`/api/organizations/${organizationId}/listings/${listingId}`), photo: 0, timeline: null }); }
  catch (e) { closeOverlay(); fail(e); return; }
  const events = await loadTimeline(organizationId, listingId);
  if (S.overlay?.kind === 'review' && S.overlay.l.id === listingId) { S.overlay.timeline = events; renderOverlay(); }
}
function suggestedPreview() {
  const o = S.overlay, v = Number(val('rv-price'));
  const el = $('#rv-preview'); if (!el) return;
  if (!(v > 0)) { el.textContent = ''; return; }
  const unit = Math.round(v * (1 + num(o.l.price.commissionRate)) * 100) / 100;
  const total = Math.round((unit + Math.round(unit * num(S.ref.settings?.igvRate ?? 0.18) * 100) / 100) * 100) / 100;
  el.textContent = `El comprador vería ${money(total)} con IGV.`;
}
function reviewDrawer(o) {
  if (o.loading) return `<div class="scrim" onclick="closeOverlay()"></div><aside class="drawer"><div class="drawer-b">${loadingBox()}</div></aside>`;
  const l = o.l, p = l.price, ph = l.photos;
  const pending = l.status === 'PENDING_REVIEW';
  return `<div class="scrim" onclick="closeOverlay()"></div><aside class="drawer" role="dialog" aria-modal="true" aria-label="Revisión">
    <div class="drawer-h"><button class="iconbtn" onclick="closeOverlay()" aria-label="Cerrar">${ICON.x}</button><span class="crumb"><b style="color:var(--ink)">${esc(l.publicCode)}</b> · revisión</span>${badge(LISTING_ST, l.status)}</div>
    <div class="drawer-b">
      <div class="dimg">${ph[o.photo] ? authImg(ph[o.photo].url, '', l.title) : ''}</div>
      ${ph.length > 1 ? `<div class="gallery-thumbs">${ph.map((x, i) => `<button aria-pressed="${i === o.photo}" onclick="S.overlay.photo=${i}; renderOverlay()">${authImg(x.url)}</button>`).join('')}</div>` : ''}
      <div class="dcontent">
        <div><span class="eyebrow">${esc(categoryName(l.categoryId))} · ${esc(CONDITION[l.condition])}</span><h2 class="dname">${esc(l.title)}</h2></div>
        ${!ph.length ? '<div class="alert alert-danger">Este saldo no tiene fotos.</div>' : ''}
        <dl class="kv num">
          <dt>Cantidad</dt><dd>${esc(uqty(l.quantityTotal, l.unitCode))}${l.minOrderQuantity ? ` · mínimo ${qty(l.minOrderQuantity)}` : ''}</dd>
          <dt>Marca</dt><dd>${esc(l.brand || '—')}</dd>
          <dt>Peso unitario</dt><dd>${l.unitWeightKg ? qty(l.unitWeightKg) + ' kg' : '—'}</dd>
          <dt>Recojo hasta</dt><dd>${fmtDate(l.pickupDeadline)}</dd>
          <dt>Descripción</dt><dd>${esc(l.description || '—')}</dd>
        </dl>
        <div class="box"><h4>Precio</h4><dl class="kv num">
          <dt>Neto constructora</dt><dd>${money(p.netUnitPrice)}</dd>
          <dt>Comisión Obrix</dt><dd>${(num(p.commissionRate) * 100).toFixed(0)}% · ${money(p.commissionAmount)}</dd>
          <dt>Comprador paga</dt><dd><b>${money(p.unitPriceWithIgv)}</b> con IGV</dd></dl></div>
        ${timelineHTML(o.timeline)}
        ${l.status === 'OBSERVED' ? `<div class="box internal"><h4>Observación enviada</h4><p>${esc(l.reviewNote || '')}</p>${l.suggestedPrice ? `<p class="help">Precio neto sugerido: ${money(l.suggestedPrice.netUnitPrice)}</p>` : ''}</div>` : ''}
        ${pending ? `<div class="box"><h4>Observar (si hay que corregir algo)</h4>
          <label class="field"><span class="label">Qué debe corregir la constructora</span><input class="input" id="rv-note" maxlength="300" placeholder="Ej. sube una foto del lote completo"></label>
          <label class="field"><span class="label">Precio neto sugerido (opcional)</span><input class="input num" id="rv-price" type="number" step="0.01" min="0.01" placeholder="${num(p.netUnitPrice).toFixed(2)}" oninput="suggestedPreview()"><span class="help" id="rv-preview"></span><span class="help">Si propones precio, la constructora puede aceptarlo con un clic y se publica directo.</span></label>
        </div>` : ''}
      </div>
    </div>
    <div class="drawer-f">${pending ? `<button class="btn btn-ghost" onclick="observeListing()">Observar</button><button class="btn btn-primary btn-block" onclick="approveListing()" ${ph.length ? '' : 'disabled'}>${ICON.check} Aprobar y publicar</button>` : '<span class="muted" style="font-size:13px">Esperando a la constructora</span>'}</div>
  </aside>`;
}
async function approveListing() {
  try { await api(`/api/admin/listings/${S.overlay.l.id}/approve`, { method: 'POST' }); toast('Saldo publicado en el catálogo.'); closeOverlay(); loadSection(); }
  catch (e) { fail(e); }
}
async function observeListing() {
  const note = val('rv-note'), price = val('rv-price');
  if (!note) { toast('Escribe qué debe corregir la constructora.'); $('#rv-note')?.focus(); return; }
  try {
    await api(`/api/admin/listings/${S.overlay.l.id}/observe`, { method: 'POST', body: { note, suggestedNetUnitPrice: price ? Number(price) : null } });
    toast('Observación enviada a la constructora.'); closeOverlay(); loadSection();
  } catch (e) { fail(e); }
}

/* ---------------- detalle de un pedido ---------------- */
async function openAdminOrder(id) {
  openOverlay({ kind: 'adminOrder', loading: true });
  try { openOverlay({ kind: 'adminOrder', o: await api(`/api/admin/orders/${id}`) }); }
  catch (e) { closeOverlay(); fail(e); }
}
async function orderAction(path, body, okMsg) {
  const ov = S.overlay;
  try { ov.o = await api(`/api/admin/orders/${ov.o.id}${path}`, { method: 'POST', body }); ov.panel = null; toast(okMsg); renderOverlay(); loadSection(); }
  catch (e) { fail(e); }
}
function adminOrderDrawer(ov) {
  if (ov.loading) return `<div class="scrim" onclick="closeOverlay()"></div><aside class="drawer"><div class="drawer-b">${loadingBox()}</div></aside>`;
  const o = ov.o, c = o.customer;
  const req = o.status === 'REQUESTED';
  return `<div class="scrim" onclick="closeOverlay()"></div><aside class="drawer" role="dialog" aria-modal="true" aria-label="Pedido ${esc(o.code)}">
    <div class="drawer-h"><button class="iconbtn" onclick="closeOverlay()" aria-label="Cerrar">${ICON.x}</button><span class="crumb"><b class="num" style="color:var(--ink)">${esc(o.code)}</b> · ${fmtDT(o.createdAt)}</span>${badge(ORDER_ST, o.status)}</div>
    <div class="drawer-b"><div class="dcontent">
      ${req ? `<div class="alert alert-warning">Reserva hasta ${fmtDT(o.reservationExpiresAt)}. Confirma el pago solo si ya lo ves en la cuenta de Obrix.</div>` : ''}
      ${o.status === 'CANCELLED' ? `<div class="alert alert-danger">Cancelado: ${esc(CANCEL_REASON[o.cancelReason] || '')}</div>` : ''}
      <div class="box"><h4>Pagos</h4>
        ${o.payments.length ? o.payments.map(p => `<div style="display:grid;gap:6px;border-bottom:1px solid var(--border-subtle);padding-bottom:10px">
          <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap"><span><b>${esc(PAYMENT_METHOD[p.method])}</b> · op. <b class="num">${esc(p.operationNumber)}</b> · ${money(p.amount)}</span>${badge(PAYMENT_ST, p.status)}</div>
          <small class="muted">${p.reportedByCustomer ? 'Informado por el comprador' : 'Registrado por Obrix'} · ${fmtDT(p.createdAt)}${p.paidOn ? ' · pagó el ' + fmtDate(p.paidOn) : ''}${p.rejectionNote ? ' · ' + esc(p.rejectionNote) : ''}</small>
          ${p.status === 'PENDING' && req ? `<div class="actions"><button class="btn btn-primary btn-sm" onclick="if(confirm('¿Confirmas que ${money(p.amount)} con operación ${esc(p.operationNumber)} ya está en la cuenta de Obrix?'))orderAction('/payments/${p.id}/verify', undefined, 'Pago verificado: pedido confirmado.')">${ICON.check} Verificar</button>
            <button class="btn btn-ghost btn-sm" onclick="S.overlay.panel='reject:${p.id}'; renderOverlay()">Rechazar</button></div>` : ''}
          ${ov.panel === 'reject:' + p.id ? `<div class="inline-form"><input class="input" id="rj-note" maxlength="300" placeholder="Motivo (ej. no aparece en la cuenta)"><div class="actions"><button class="btn btn-danger btn-sm" onclick="if(val('rj-note'))orderAction('/payments/${p.id}/reject', {note: val('rj-note')}, 'Pago rechazado.'); else toast('Escribe el motivo')">Rechazar pago</button></div></div>` : ''}
        </div>`).join('') : '<p class="help">El comprador aún no informa su pago.</p>'}
        ${req ? (ov.panel === 'register' ? `<form class="inline-form" onsubmit="event.preventDefault(); orderAction('/payments', {method: val('rg-method'), operationNumber: val('rg-op'), amount: Number(val('rg-amount'))}, 'Pago registrado: pedido confirmado.')">
            <div class="grid3"><label class="field"><span class="label">Medio</span><select class="select" id="rg-method">${Object.entries(PAYMENT_METHOD).map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></label>
            <label class="field"><span class="label">N.º operación</span><input class="input" id="rg-op" required minlength="4" maxlength="40"></label>
            <label class="field"><span class="label">Monto</span><input class="input num" id="rg-amount" type="number" step="0.01" value="${num(o.total).toFixed(2)}" required></label></div>
            <div class="actions"><button class="btn btn-primary btn-sm" type="submit">Registrar y confirmar</button><button type="button" class="btn btn-ghost btn-sm" onclick="S.overlay.panel=null; renderOverlay()">Cancelar</button></div></form>`
          : `<button class="btn btn-secondary btn-sm" style="justify-self:start" onclick="S.overlay.panel='register'; renderOverlay()">Registrar un pago no informado</button>`) : ''}
      </div>
      <div class="box"><h4>Montos</h4><dl class="kv num">
        <dt>Comprador paga</dt><dd><b>${money(o.total)}</b> <span class="muted">(${money(o.subtotal)} + IGV ${money(o.igvAmount)})</span></dd>
        <dt>Comisión Obrix</dt><dd>${money(o.commissionTotal)}</dd>
        <dt>Liquidar a constructora</dt><dd>${money(o.netTotal)} <span class="muted">a ${esc(o.sellerName)}</span></dd></dl>
        <div class="tablewrap" style="box-shadow:none"><table style="min-width:0"><thead><tr><th>Material</th><th>Cant.</th><th>Neto</th><th>Comisión</th><th>Subtotal</th></tr></thead><tbody>
          ${o.items.map(i => `<tr><td>${esc(i.title)}<br><small class="muted">${esc(i.publicCode || '')}</small></td><td class="num">${esc(uqty(i.quantity, i.unitCode))}</td><td class="num">${money(i.netAmount)}</td><td class="num">${money(i.commissionAmount)}</td><td class="num">${money(i.lineSubtotal)}</td></tr>`).join('')}
        </tbody></table></div></div>
      <div class="box"><h4>Comprador</h4><dl class="kv">
        <dt>${esc(c.docType)}</dt><dd class="num">${esc(c.docNumber)}</dd><dt>Nombre</dt><dd>${esc(c.name)}</dd>
        <dt>Contacto</dt><dd>${esc(c.phone)} · ${esc(c.email)}</dd>
        <dt>Entrega</dt><dd>${esc(DELIVERY[o.deliveryMode])}${o.deliveryAddress ? ` · ${esc(o.deliveryAddress)}, ${esc(o.deliveryDistrict || '')}` : ''}</dd>
        ${o.notes ? `<dt>Notas</dt><dd>${esc(o.notes)}</dd>` : ''}
        <dt>Recojo</dt><dd>${esc(o.projectName)} · ${esc(o.projectAddress)}, ${esc(o.projectDistrict)}</dd></dl></div>
      <div class="box"><h4>Historial</h4><div class="timeline">${o.history.map(h => `<div class="tl done" style="font-size:12.5px"><i></i><span>${badge(ORDER_ST, h.toStatus)} ${fmtDT(h.at)}${h.changedBy ? ' · ' + esc(h.changedBy) : ''}${h.note ? `<br><small class="muted">${esc(h.note)}</small>` : ''}</span></div>`).join('')}</div></div>
      ${ov.panel === 'cancel' ? `<div class="box"><h4>Cancelar pedido</h4>
        <label class="field"><span class="label">Motivo</span><select class="select" id="cn-reason">${Object.entries(CANCEL_REASON).map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></label>
        <label class="field"><span class="label">Nota${o.status === 'CONFIRMED' ? ' (obligatoria: cómo se devuelve el dinero)' : ''}</span><input class="input" id="cn-note" maxlength="300"></label>
        <div class="actions"><button class="btn btn-danger btn-sm" onclick="orderAction('/cancel', {reason: val('cn-reason'), note: val('cn-note') || null}, 'Pedido cancelado: la cantidad volvió al catálogo.')">Cancelar pedido</button><button class="btn btn-ghost btn-sm" onclick="S.overlay.panel=null; renderOverlay()">Volver</button></div></div>` : ''}
    </div></div>
    <div class="drawer-f" style="flex-wrap:wrap">
      ${o.status === 'CONFIRMED' ? `<button class="btn btn-primary" onclick="orderAction('/deliver', undefined, 'Marcado como entregado.')">Marcar entregado</button>` : ''}
      ${o.status === 'DELIVERED' ? `<button class="btn btn-primary" onclick="if(confirm('¿Ya le transferiste ${money(o.netTotal)} a ${esc(o.sellerName)}?'))orderAction('/close', {note: 'Liquidado a la constructora'}, 'Pedido cerrado.')">Cerrar (ya se liquidó)</button>` : ''}
      ${['REQUESTED', 'CONFIRMED'].includes(o.status) && ov.panel !== 'cancel' ? `<button class="btn btn-ghost" onclick="S.overlay.panel='cancel'; renderOverlay()">Cancelar pedido</button>` : ''}
      ${['CLOSED', 'CANCELLED'].includes(o.status) ? '<span class="muted" style="font-size:13px">Pedido terminado</span>' : ''}
    </div>
  </aside>`;
}

/* ---------------- constructoras ---------------- */
function orgModal(o) {
  const v = o.prefill || {};
  return `<div class="scrim" onclick="closeOverlay()"></div><div class="modal-wrap" role="dialog" aria-modal="true" aria-label="Nueva constructora"><form class="modal" onsubmit="saveOrg(event)">
    <div class="modal-h"><h3>Nueva constructora</h3><button type="button" class="iconbtn" onclick="closeOverlay()" aria-label="Cerrar">${ICON.x}</button></div>
    <div class="modal-b">
      <div class="grid2">
        <label class="field"><span class="label">Nombre comercial</span><input class="input" id="og-trade" required maxlength="150" value="${esc(v.tradeName || '')}"></label>
        <label class="field"><span class="label">Razón social</span><input class="input" id="og-legal" required maxlength="200" value="${esc(v.legalName || '')}"></label>
        <label class="field"><span class="label">RUC</span><input class="input num" id="og-ruc" required inputmode="numeric" maxlength="11" value="${esc(v.ruc || '')}"><span class="help">Se valida el dígito verificador. No se puede cambiar luego.</span></label>
        <label class="field"><span class="label">Correo de contacto</span><input class="input" id="og-email" type="email" required maxlength="160" value="${esc(v.email || '')}"></label>
        <label class="field"><span class="label">Teléfono (opcional)</span><input class="input" id="og-phone" maxlength="20" value="${esc(v.phone || '')}"></label>
      </div>
      <h4 style="font-size:14px">Primer Admin Empresa</h4>
      <div class="grid2">
        <label class="field"><span class="label">Nombre</span><input class="input" id="og-first" required maxlength="80" value="${esc(v.first || '')}"></label>
        <label class="field"><span class="label">Apellido</span><input class="input" id="og-last" required maxlength="80" value="${esc(v.last || '')}"></label>
        <label class="field"><span class="label">Correo (usuario)</span><input class="input" id="og-aemail" type="email" required maxlength="160" value="${esc(v.email || '')}"></label>
        <label class="field"><span class="label">Celular (opcional)</span><input class="input" id="og-aphone" maxlength="20" value="${esc(v.phone || '')}"></label>
      </div>
      <p class="help">Al guardar verás la contraseña temporal del Admin Empresa para entregársela.</p>
    </div>
    <div class="modal-f"><button type="button" class="btn btn-secondary" onclick="closeOverlay()">Cancelar</button><button class="btn btn-primary" type="submit">Crear constructora</button></div>
  </form></div>`;
}
async function saveOrg(e) {
  e.preventDefault();
  const body = {
    tradeName: val('og-trade'), legalName: val('og-legal'), ruc: val('og-ruc'), contactEmail: val('og-email'), contactPhone: val('og-phone') || null,
    admin: { firstName: val('og-first'), lastName: val('og-last'), email: val('og-aemail'), phone: val('og-aphone') || null }
  };
  if (!validRuc(body.ruc)) { toast(RUC_ERROR); $('#og-ruc').focus(); return; }
  if (body.contactPhone && !validPhone(body.contactPhone)) { toast(PHONE_ERROR); $('#og-phone').focus(); return; }
  if (body.admin.phone && !validMobile(body.admin.phone)) { toast(MOBILE_ERROR); $('#og-aphone').focus(); return; }
  try {
    const r = await api('/api/admin/organizations', { method: 'POST', body });
    openOverlay({ kind: 'tempPassword', title: `${r.organization.tradeName} creada`, who: `${r.admin.fullName} (${r.admin.email})`, password: r.temporaryPassword });
  } catch (err) { fail(err); }
}
async function orgStatus(id, action) {
  if (action === 'suspend' && !confirm('Nadie de la constructora podrá ingresar y sus saldos saldrán del catálogo. ¿Suspender?')) return;
  try { await api(`/api/admin/organizations/${id}/${action}`, { method: 'POST' }); toast(action === 'suspend' ? 'Constructora suspendida.' : 'Constructora reactivada.'); loadSection(); }
  catch (e) { fail(e); }
}
async function leadStatus(id, status) {
  try { await api(`/api/admin/leads/${id}/status`, { method: 'PUT', body: { status } }); toast('Estado actualizado.'); }
  catch (e) { fail(e); loadSection(); }
}
function orgFromLead(id) {
  const l = (S.panel.data.leads || []).find(x => x.id === id); if (!l) return;
  const [first, ...rest] = l.contactName.split(' ');
  openOverlay({ kind: 'org', prefill: { tradeName: l.companyName, legalName: l.companyName, ruc: l.ruc, email: l.email, phone: l.phone, first, last: rest.join(' ') } });
}

function obrixOverlayHTML(o) {
  switch (o.kind) {
    case 'review': return reviewDrawer(o);
    case 'adminOrder': return adminOrderDrawer(o);
    case 'org': return orgModal(o);
    case 'approvalCfg': return approvalConfigModal(o);
    case 'tempPassword': return tempPasswordModal(o.title, o.who, o.password);
    default: return '';
  }
}
