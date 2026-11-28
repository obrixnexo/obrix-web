/* =====================================================================
 * Obrix Nexo · sitio público (sin iniciar sesión)
 * Inicio, catálogo, ficha del saldo, pedido y seguimiento del pedido.
 * (El formulario para constructoras vive en la landing obrixnexo.com/empresas.)
 * ===================================================================== */
'use strict';

const categoryName = id => S.ref.categories.find(c => c.id === id)?.name || '';

function publicTop() {
  const panelBtn = S.session
    ? `<button class="btn btn-secondary btn-sm" onclick="navigate('#/panel')">Mi panel</button>`
    : `<button class="btn btn-secondary btn-sm" onclick="navigate('#/ingresar')">Ingresar</button>`;
  return `<header class="topbar"><div class="topbar-in">
    ${logo()}
    <label class="search"><span class="sr">Buscar materiales</span>${ICON.search}<input id="q" type="search" placeholder="Buscar inodoro, cable, porcelanato, cemento…" value="${esc(S.mk.q)}" oninput="onSearch(this.value)"></label>
    <nav class="topnav" aria-label="Principal">
      <button ${S.view === 'market' ? 'aria-current="page"' : ''} onclick="navigate('#/saldos')">Saldos de obra</button>
      <button onclick="goHomeAnchor('como')">Cómo funciona</button>
      <a href="${esc(window.OBRIX_CONFIG.landingEmpresas)}">Vende tus saldos</a>
    </nav>
    ${panelBtn}
  </div></header>`;
}
function catbar() {
  return `<div class="catbar"><div class="catbar-in" role="toolbar" aria-label="Categorías">
    <button aria-pressed="${!S.mk.categoryId}" onclick="setCategory(null)">Todos</button>
    ${S.ref.categories.map(c => `<button aria-pressed="${S.mk.categoryId === c.id}" onclick="setCategory(${c.id})">${esc(c.name)}</button>`).join('')}
  </div></div>`;
}
function goHomeAnchor(id) {
  if (S.view !== 'home') { navigate('#/'); setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' }), 300); }
  else document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
}
const footer = () => `<footer class="footer"><div class="wrap">${logo()}<span>Lima, Perú · Saldos de obra de constructoras, revisados por Obrix</span></div></footer>`;

/* =========================== INICIO =========================== */
async function loadHome() {
  const r = await api('/api/public/listings?size=6').catch(() => null);
  if (r) { S.home = { items: r.items, total: r.totalItems }; scheduleRender(); }
}
function viewHome() {
  const pics = S.home.items.filter(i => i.photoUrl).slice(0, 3);
  const minOrder = num(S.ref.settings?.minOrderAmount);
  return `${publicTop()}
  <section class="hero"><div class="hero-in">
    <div>
      <div class="eyebrow">Saldos de obra · Lima</div>
      <h1>Material de construcción nuevo, <em>a precio de liquidación</em>.</h1>
      <p class="lead">Las constructoras publican el material que les sobró en obra. Obrix revisa cada oferta, recibe tu pago y coordina la entrega. Tú compras con foto real y precio final con IGV.</p>
      <div class="hero-cta">
        <button class="btn btn-primary btn-lg" onclick="navigate('#/saldos')">Ver saldos disponibles</button>
        <a class="btn btn-secondary btn-lg" href="${esc(window.OBRIX_CONFIG.landingEmpresas)}">Soy constructora</a>
      </div>
      <div class="hero-facts">
        <div><b class="num">${S.home.total}</b>${S.home.total === 1 ? 'saldo disponible' : 'saldos disponibles'}</div>
        <div><b>Revisado</b>por Obrix antes de publicar</div>
        <div><b>48 h</b>de reserva mientras pagas</div>
      </div>
    </div>
    <div class="mosaic" aria-hidden="${pics.length ? 'false' : 'true'}">
      ${pics.length ? pics.map(p => `<figure><img src="${esc(fullUrl(p.photoUrl))}" alt="${esc(p.title)}" loading="lazy"><figcaption>${esc(p.categoryName)} · ${esc(p.district)}</figcaption></figure>`).join('')
        : '<figure></figure><figure></figure><figure></figure>'}
    </div>
  </div></section>

  ${S.home.items.length ? `<section class="sec"><div class="wrap">
    <div class="sec-h"><div><h2>Recién publicados</h2><p>Material revisado por Obrix, con foto real y precio final.</p></div><button class="btn btn-secondary" onclick="navigate('#/saldos')">Ver todo</button></div>
    <div class="pgrid">${S.home.items.map(productCard).join('')}</div>
  </div></section>` : ''}

  <section class="sec"><div class="wrap">
    <div class="sec-h"><div><h2>Compra por categoría</h2><p>Lo que más sobra en las obras de Lima.</p></div></div>
    <div class="cats">${S.ref.categories.slice(0, 12).map(c => `<button class="cat" onclick="setCategory(${c.id})"><span>${esc(c.name)}</span><small>Ver saldos</small></button>`).join('')}</div>
  </div></section>

  <section class="sec" id="como" style="padding-top:8px"><div class="wrap">
    <div class="sec-h"><div><h2>Cómo compras en Obrix Nexo</h2><p>Sin crear cuenta. Sigues tu pedido con un enlace privado.</p></div></div>
    <div class="steps">
      <div class="step"><span class="n">Paso 1</span><h3>Elige el material</h3><p>Cada saldo tiene fotos reales, cantidad disponible, estado y el distrito de la obra.</p></div>
      <div class="step"><span class="n">Paso 2</span><h3>Pide y reservamos</h3><p>Dejas tus datos (DNI o RUC). La cantidad queda separada para ti por 48 horas.</p></div>
      <div class="step"><span class="n">Paso 3</span><h3>Paga a Obrix</h3><p>Por transferencia o Yape a la cuenta de Obrix. Informas tu número de operación y lo verificamos.</p></div>
      <div class="step"><span class="n">Paso 4</span><h3>Recoge o recibe</h3><p>Con el pago verificado te damos la dirección de recojo o coordinamos la entrega.</p></div>
    </div>
    ${minOrder > 0 ? `<p class="help" style="margin-top:12px">Pedido mínimo: ${money(minOrder)} sin IGV.</p>` : ''}
  </div></section>

  <section class="sec"><div class="wrap" style="max-width:900px">
    <div class="sec-h"><div><h2>Preguntas frecuentes</h2></div></div>
    <div class="faq">
      <details><summary>¿Cómo pago?</summary><p>Al pedir te mostramos la cuenta de Obrix para pagar por transferencia o Yape. Luego informas tu número de operación en el enlace de tu pedido y un asesor lo verifica.</p></details>
      <details><summary>¿Cuánto tiempo me reservan el material?</summary><p>48 horas desde que haces el pedido. Si no se registra tu pago en ese plazo, la reserva se libera sola.</p></details>
      <details><summary>¿Dónde recojo?</summary><p>En la obra de la constructora. Te damos la dirección exacta y el contacto del almacén cuando tu pago está verificado. Si necesitas entrega, la coordinamos contigo.</p></details>
      <details><summary>¿El material está en buen estado?</summary><p>Cada saldo indica su estado y tiene fotos reales tomadas en obra. Obrix revisa cada publicación antes de que salga a la venta.</p></details>
      <details><summary>¿Me dan comprobante?</summary><p>Sí, recibes el comprobante electrónico de tu compra.</p></details>
    </div>
  </div></section>
  ${footer()}`;
}

/* =========================== CATÁLOGO =========================== */
let searchTimer;
function onSearch(v) {
  S.mk.q = v;
  if (S.view !== 'market') { navigate('#/saldos'); return; }
  clearTimeout(searchTimer); searchTimer = setTimeout(() => loadMarket(true), 300);
}
function setCategory(id) { S.mk.categoryId = id; if (S.view !== 'market') navigate('#/saldos'); else loadMarket(true); }
function setDistrict(d) { S.mk.district = d; loadMarket(true); }
function setSort(s) { S.mk.sort = s; loadMarket(true); }
function clearFilters() { Object.assign(S.mk, { q: '', categoryId: null, district: '', sort: 'recent' }); loadMarket(true); }

async function loadMarket(reset) {
  const m = S.mk;
  if (reset) { m.page = 0; }
  m.loading = true; scheduleRender();
  const p = new URLSearchParams({ page: m.page, size: 24, sort: m.sort });
  if (m.q.trim()) p.set('q', m.q.trim());
  if (m.categoryId) p.set('categoryId', m.categoryId);
  if (m.district) p.set('district', m.district);
  const r = await api('/api/public/listings?' + p).catch(fail);
  m.loading = false;
  if (r) { m.items = reset ? r.items : [...m.items, ...r.items]; m.total = r.totalItems; m.totalPages = r.totalPages; }
  scheduleRender();
}
function moreMarket() { S.mk.page++; loadMarket(false); }

function productCard(p) {
  return `<button class="pcard" onclick="navigate('#/saldo/${esc(p.publicCode)}')" aria-label="${esc(p.title)}, ${money(p.unitPriceWithIgv)} por ${esc(p.unitName)}">
    <div class="pmedia">${p.photoUrl ? `<img src="${esc(fullUrl(p.photoUrl))}" alt="" loading="lazy">` : ''}<span class="badge b-success">Disponible</span></div>
    <div class="pbody">
      <span class="eyebrow">${esc(p.categoryName)}</span>
      <span class="pname">${esc(p.title)}</span>
      <span class="muted" style="font-size:12.5px">${esc(uqty(p.quantityAvailable, p.unitCode))} · ${esc(CONDITION[p.condition] || '')}</span>
      <span class="price">${money(p.unitPriceWithIgv)}<small>/ ${esc(p.unitName.toLowerCase())} con IGV</small></span>
      <span class="loc">${ICON.pin}${esc(p.district)}, Lima · recojo hasta ${fmtDate(p.pickupDeadline)}</span>
    </div></button>`;
}

function viewMarket() {
  const m = S.mk;
  const head = m.loading && !m.items.length ? 'Buscando…'
    : `${m.total} <span class="muted" style="font-weight:400;font-family:var(--font-body);font-size:15px">${m.total === 1 ? 'saldo disponible' : 'saldos disponibles'}${m.categoryId ? ' en ' + esc(categoryName(m.categoryId)) : ''}</span>`;
  const grid = m.items.length ? m.items.map(productCard).join('')
    : m.loading ? '' : (m.q || m.categoryId || m.district)
      ? `<div class="empty"><h3>Sin resultados con estos filtros</h3><p>Prueba otra categoría o limpia los filtros.</p><p style="margin-top:12px"><button class="btn btn-secondary btn-sm" onclick="clearFilters()">Limpiar filtros</button></p></div>`
      : `<div class="empty"><h3>Aún no hay saldos publicados</h3><p>Los saldos aparecen aquí cuando una constructora publica material y Obrix lo aprueba.</p></div>`;
  return `${publicTop()}${catbar()}
  <div class="mk">
    <aside class="filters ${m.filtersOpen ? 'open' : ''}" aria-label="Filtros">
      <div class="fbox"><h4>Distrito de la obra</h4>
        <label class="check"><input type="radio" name="dist" ${!m.district ? 'checked' : ''} onchange="setDistrict('')"> Todos</label>
        ${S.ref.districts.map(d => `<label class="check"><input type="radio" name="dist" ${m.district === d ? 'checked' : ''} onchange="setDistrict('${esc(d)}')"> ${esc(d)}</label>`).join('') || '<p class="help">Sin saldos aún</p>'}
      </div>
      <div class="fbox deliver"><h4>Cómo funciona</h4><p class="help">Pides, reservamos 48 h, pagas a Obrix y recoges en obra o coordinamos la entrega.</p></div>
      <button class="btn btn-ghost btn-sm" onclick="clearFilters()">Limpiar filtros</button>
    </aside>
    <section aria-label="Saldos">
      <div class="mk-head">
        <h2>${head}</h2>
        <div class="toolbar">
          <button class="btn btn-secondary btn-sm mfilters-toggle" onclick="S.mk.filtersOpen=!S.mk.filtersOpen; render()">${ICON.filter} Filtros</button>
          <label class="sr" for="mk-sort">Ordenar</label>
          <select class="select" id="mk-sort" style="width:auto;min-height:36px" onchange="setSort(this.value)">
            <option value="recent" ${m.sort === 'recent' ? 'selected' : ''}>Más recientes</option>
            <option value="price_asc" ${m.sort === 'price_asc' ? 'selected' : ''}>Menor precio</option>
            <option value="price_desc" ${m.sort === 'price_desc' ? 'selected' : ''}>Mayor precio</option>
            <option value="deadline" ${m.sort === 'deadline' ? 'selected' : ''}>Recojo más próximo</option>
          </select>
        </div>
      </div>
      <div class="pgrid">${grid}</div>
      ${m.totalPages > m.page + 1 ? `<div class="pager"><button class="btn btn-secondary" onclick="moreMarket()" ${m.loading ? 'disabled' : ''}>Ver más saldos</button></div>` : ''}
    </section>
  </div>${footer()}`;
}

/* =========================== FICHA DEL SALDO =========================== */
async function openDetail(code) {
  openOverlay({ kind: 'detail', loading: true });
  try {
    const d = await api('/api/public/listings/' + encodeURIComponent(code));
    // Cantidad inicial: la mínima del saldo, subida lo necesario para llegar al pedido mínimo en soles
    const minAmount = num(S.ref.settings?.minOrderAmount);
    const toReachAmount = minAmount > 0 && num(d.unitPrice) > 0 ? Math.ceil(minAmount / num(d.unitPrice)) : 1;
    const start = Math.max(d.minOrderQuantity ? num(d.minOrderQuantity) : 1, toReachAmount);
    openOverlay({ kind: 'detail', d, qty: Math.min(start, num(d.quantityAvailable)), photo: 0 });
  } catch (e) { closeOverlay(); fail(e); }
}
function detailMinQty(d) { return d.minOrderQuantity ? Math.min(num(d.minOrderQuantity), num(d.quantityAvailable)) : 0.01; }
function setDetailQty(v) {
  const o = S.overlay, d = o.d;
  let n = Math.round(Number(v) * 100) / 100 || detailMinQty(d);
  n = Math.max(detailMinQty(d), Math.min(num(d.quantityAvailable), n));
  o.qty = n; renderOverlay();
}
function lineTotals(unitPrice, q) {
  const sub = Math.round(num(unitPrice) * q * 100) / 100;
  const igvRate = num(S.ref.settings?.igvRate ?? 0.18);
  const igv = Math.round(sub * igvRate * 100) / 100;
  return { sub, igv, total: Math.round((sub + igv) * 100) / 100 };
}
function detailHTML(o) {
  if (o.loading) return `<div class="scrim" onclick="closeOverlay()"></div><aside class="drawer" role="dialog" aria-modal="true"><div class="drawer-b">${loadingBox()}</div></aside>`;
  const d = o.d, photos = d.photoUrls || [];
  const t = lineTotals(d.unitPrice, o.qty);
  const minAmount = num(S.ref.settings?.minOrderAmount);
  const belowMin = minAmount > 0 && t.sub < minAmount;
  return `<div class="scrim" onclick="closeOverlay()"></div>
  <aside class="drawer" role="dialog" aria-modal="true" aria-label="${esc(d.title)}">
    <div class="drawer-h"><button class="iconbtn" onclick="closeOverlay()" aria-label="Cerrar">${ICON.back}</button><span class="crumb">Saldos de obra / ${esc(d.categoryName)}</span><span class="badge b-success">Disponible</span></div>
    <div class="drawer-b">
      <div class="dimg">${photos[o.photo] ? `<img src="${esc(fullUrl(photos[o.photo]))}" alt="${esc(d.title)}">` : ''}</div>
      ${photos.length > 1 ? `<div class="gallery-thumbs">${photos.map((u, i) => `<button aria-pressed="${i === o.photo}" onclick="S.overlay.photo=${i}; renderOverlay()" aria-label="Foto ${i + 1}"><img src="${esc(fullUrl(u))}" alt=""></button>`).join('')}</div>` : ''}
      <div class="dcontent">
        <div><span class="eyebrow">${esc(d.categoryName)} · Ref. ${esc(d.publicCode)}</span><h2 class="dname" style="margin-top:4px">${esc(d.title)}</h2></div>
        <div class="dprice">${money(d.unitPriceWithIgv)}<small>/ ${esc(d.unitName.toLowerCase())} · incluye IGV</small></div>
        <div class="specs">
          <div><span>Disponible</span><b>${esc(uqty(d.quantityAvailable, d.unitCode))}</b></div>
          <div><span>Estado</span><b>${esc(CONDITION[d.condition])}</b></div>
          <div><span>Marca</span><b>${esc(d.brand || '—')}</b></div>
          <div><span>Peso unitario</span><b>${d.unitWeightKg ? qty(d.unitWeightKg) + ' kg' : '—'}</b></div>
          <div><span>Obra</span><b>${esc(d.district)}, Lima</b></div>
          <div><span>Pedido mínimo</span><b>${d.minOrderQuantity ? esc(uqty(d.minOrderQuantity, d.unitCode)) : 'Sin mínimo'}</b></div>
          <div><span>Recojo hasta</span><b>${fmtDate(d.pickupDeadline)}</b></div>
          <div><span>Código</span><b>${esc(d.publicCode)}</b></div>
        </div>
        ${d.description ? `<p class="muted">${esc(d.description)}</p>` : ''}
        <div class="box">
          <h4>Calcula tu pedido</h4>
          <div class="qtyrow">
            <button class="iconbtn" aria-label="Menos" onclick="setDetailQty(${o.qty - 1})">−</button>
            <label class="sr" for="d-qty">Cantidad</label>
            <input class="input num" id="d-qty" type="number" step="any" min="${detailMinQty(d)}" max="${num(d.quantityAvailable)}" value="${o.qty}" onchange="setDetailQty(this.value)">
            <button class="iconbtn" aria-label="Más" onclick="setDetailQty(${o.qty + 1})">+</button>
            <span class="muted">de ${esc(uqty(d.quantityAvailable, d.unitCode))}</span>
          </div>
          <div class="summary">
            <div class="row"><span>Material · ${qty(o.qty)} × ${money(d.unitPrice)}</span><b>${money(t.sub)}</b></div>
            <div class="row"><span>IGV</span><b>${money(t.igv)}</b></div>
            <div class="total"><span>Total</span><span>${money(t.total)}</span></div>
            <div class="note">Recojo en obra sin costo. Si necesitas entrega, la coordinamos contigo.</div>
          </div>
          ${belowMin ? `<div class="alert alert-warning">El pedido mínimo es ${money(minAmount)} sin IGV. Aumenta la cantidad para continuar.</div>` : ''}
        </div>
      </div>
    </div>
    <div class="drawer-f"><button class="btn btn-primary btn-lg btn-block" ${belowMin ? 'disabled' : ''} onclick="startCheckout()">${ICON.bag} Pedir este saldo</button></div>
  </aside>`;
}

/* =========================== PEDIDO =========================== */
function startCheckout() {
  const { d, qty: q } = S.overlay;
  openOverlay({ kind: 'checkout', d, qty: q, docType: 'RUC', deliveryMode: 'RECOJO_EN_OBRA', errors: {} });
}
function coField(id, label, o = {}) {
  const err = S.overlay.errors[id];
  return `<label class="field ${err ? 'err' : ''}"><span class="label">${label}</span>
    <input class="input" id="co-${id}" value="${esc(S.overlay[id] || '')}" ${o.type ? `type="${o.type}"` : ''} ${o.mode ? `inputmode="${o.mode}"` : ''} ${o.max ? `maxlength="${o.max}"` : ''} placeholder="${esc(o.ph || '')}" oninput="S.overlay['${id}']=this.value; clearCoError(this, '${id}')">
    ${err ? `<span class="help">${esc(err)}</span>` : o.help ? `<span class="help">${o.help}</span>` : ''}</label>`;
}
/** Al corregir un campo, su mensaje de error se va (sin redibujar el formulario, para no perder el foco). */
function clearCoError(input, id) {
  if (!S.overlay?.errors?.[id]) return;
  delete S.overlay.errors[id];
  const field = input.closest('.field');
  if (field) { field.classList.remove('err'); field.querySelector('.help')?.remove(); }
  else { const alert = input.closest('label')?.nextElementSibling; if (alert?.classList.contains('alert-danger')) alert.remove(); }
}
function checkoutHTML(o) {
  const d = o.d, t = lineTotals(d.unitPrice, o.qty), ruc = o.docType === 'RUC';
  return `<div class="scrim"></div><div class="modal-wrap" role="dialog" aria-modal="true" aria-label="Pedir">
  <form class="modal" onsubmit="submitOrder(event)">
    <div class="modal-h"><h3>Pedir · ${esc(d.publicCode)}</h3><button type="button" class="iconbtn" onclick="closeOverlay()" aria-label="Cerrar">${ICON.x}</button></div>
    <div class="modal-b"><div class="co-layout">
      <div style="display:grid;gap:16px;min-width:0">
        <div class="segctl" role="group" aria-label="Documento">
          <button type="button" aria-pressed="${ruc}" onclick="S.overlay.docType='RUC'; renderOverlay()">Empresa (RUC)</button>
          <button type="button" aria-pressed="${!ruc}" onclick="S.overlay.docType='DNI'; renderOverlay()">Persona (DNI)</button>
        </div>
        <div class="grid2">
          ${coField('docNumber', ruc ? 'RUC' : 'DNI', { mode: 'numeric', max: ruc ? 11 : 8, ph: ruc ? '20XXXXXXXXX' : '8 dígitos' })}
          ${coField('name', ruc ? 'Razón social' : 'Nombre completo', { max: 200, ph: ruc ? 'Ferretería La Torre S.A.C.' : 'Nombre y apellido' })}
          ${coField('email', 'Correo', { type: 'email', max: 160, ph: 'compras@ferreteria.pe' })}
          ${coField('phone', 'Celular / WhatsApp', { mode: 'tel', max: 20, ph: '9XX XXX XXX' })}
        </div>
        <div class="segctl" role="group" aria-label="Entrega">
          ${['RECOJO_EN_OBRA', 'POR_COORDINAR', 'ENTREGA'].map(m => `<button type="button" aria-pressed="${o.deliveryMode === m}" onclick="S.overlay.deliveryMode='${m}'; renderOverlay()">${DELIVERY[m]}</button>`).join('')}
        </div>
        ${o.deliveryMode === 'ENTREGA' ? `<div class="grid2">
          <label class="field ${o.errors.deliveryDistrict ? 'err' : ''}"><span class="label">Distrito</span><select class="select" id="co-deliveryDistrict" onchange="S.overlay.deliveryDistrict=this.value"><option value="">Elige tu distrito</option>${DISTRICTS.map(x => `<option ${o.deliveryDistrict === x ? 'selected' : ''}>${x}</option>`).join('')}</select>${o.errors.deliveryDistrict ? `<span class="help">${esc(o.errors.deliveryDistrict)}</span>` : ''}</label>
          ${coField('deliveryAddress', 'Dirección de entrega', { max: 250, ph: 'Av. Tomás Marsano 2450' })}
        </div><p class="help">El costo del flete se coordina contigo antes de pagar.</p>`
        : o.deliveryMode === 'RECOJO_EN_OBRA' ? `<div class="info"><b>Recojo en la obra de ${esc(d.district)}</b><span class="muted">Te damos la dirección exacta y el contacto del almacén cuando verifiquemos tu pago.</span></div>`
        : `<div class="info"><b>Lo coordinamos contigo</b><span class="muted">Un asesor te escribe para acordar recojo o entrega.</span></div>`}
        <label class="field"><span class="label">Notas (opcional)</span><textarea class="textarea" id="co-notes" maxlength="500" placeholder="Horario de recepción, referencias…" oninput="S.overlay.notes=this.value">${esc(o.notes || '')}</textarea></label>
        <label class="privacy"><input type="checkbox" id="co-privacy" ${o.privacy ? 'checked' : ''} onchange="S.overlay.privacy=this.checked; clearCoError(this, 'privacy')"> <span>Acepto que Obrix Nexo use mis datos para gestionar este pedido (Ley 29733).</span></label>
        ${o.errors.privacy ? `<div class="alert alert-danger">${esc(o.errors.privacy)}</div>` : ''}
        <label class="privacy"><input type="checkbox" id="co-terms" ${o.terms ? 'checked' : ''} onchange="S.overlay.terms=this.checked; clearCoError(this, 'terms')"> <span>Leí y acepto los <a class="link" href="${esc(termsUrl())}" target="_blank" rel="noopener">términos y condiciones</a> de Obrix Nexo.</span></label>
        ${o.errors.terms ? `<div class="alert alert-danger">${esc(o.errors.terms)}</div>` : ''}
      </div>
      <div class="summary">
        <div class="sumprod">${d.photoUrls?.[0] ? `<img src="${esc(fullUrl(d.photoUrls[0]))}" alt="">` : '<span></span>'}<b>${esc(d.title)}</b></div>
        <div class="row"><span>${qty(o.qty)} × ${money(d.unitPrice)}</span><b>${money(t.sub)}</b></div>
        <div class="row"><span>IGV</span><b>${money(t.igv)}</b></div>
        <div class="total"><span>Total</span><span>${money(t.total)}</span></div>
        <div class="note">Reservamos la cantidad por ${S.ref.settings?.reservationHours || 48} h mientras pagas a Obrix.</div>
      </div>
    </div></div>
    <div class="modal-f">
      <button type="button" class="btn btn-secondary" onclick="openDetail('${esc(d.publicCode)}')">Atrás</button>
      <button class="btn btn-primary" type="submit" ${o.busy ? 'disabled' : ''}>${o.busy ? 'Enviando…' : 'Confirmar pedido'}</button>
    </div>
  </form></div>`;
}
function validateCheckout(o) {
  const e = {};
  const doc = (o.docNumber || '').trim();
  if (o.docType === 'DNI' && !/^\d{8}$/.test(doc)) e.docNumber = 'El DNI tiene 8 dígitos';
  if (o.docType === 'RUC' && !/^\d{11}$/.test(doc)) e.docNumber = 'El RUC tiene 11 dígitos';
  else if (o.docType === 'RUC' && !validRuc(doc)) e.docNumber = RUC_ERROR;
  if ((o.name || '').trim().length < 3) e.name = 'Escribe el nombre o razón social';
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test((o.email || '').trim())) e.email = 'Correo no válido';
  if (!validMobile(o.phone)) e.phone = MOBILE_ERROR;
  if (o.deliveryMode === 'ENTREGA') {
    if (!o.deliveryDistrict) e.deliveryDistrict = 'Elige el distrito';
    if ((o.deliveryAddress || '').trim().length < 5) e.deliveryAddress = 'Escribe la dirección';
  }
  if (!o.privacy) e.privacy = 'Debes aceptar el uso de tus datos para gestionar el pedido.';
  if (!o.terms) e.terms = 'Para pedir, acepta los términos y condiciones.';
  return e;
}
async function submitOrder(ev) {
  ev.preventDefault();
  const o = S.overlay;
  o.errors = validateCheckout(o);
  if (Object.keys(o.errors).length) { renderOverlay(); return; }
  o.busy = true; renderOverlay();
  try {
    const r = await api('/api/public/orders', {
      method: 'POST', body: {
        items: [{ publicCode: o.d.publicCode, quantity: o.qty }],
        docType: o.docType, docNumber: o.docNumber.trim(), name: o.name.trim(), email: o.email.trim(), phone: o.phone.trim(),
        deliveryMode: o.deliveryMode, deliveryDistrict: o.deliveryDistrict || null, deliveryAddress: o.deliveryAddress || null,
        notes: o.notes || null, acceptsPrivacyPolicy: true, acceptsTerms: true
      }
    });
    const mine = store.get('obrix.myOrders') || [];
    store.set('obrix.myOrders', [{ code: r.code, token: r.trackingToken, at: Date.now() }, ...mine].slice(0, 20));
    openOverlay({ kind: 'orderDone', r });
    loadMarket(true);
  } catch (e) {
    o.busy = false;
    if (e.fields && Object.keys(e.fields).length) { o.errors = { ...e.fields }; }
    renderOverlay(); fail(e);
  }
}
function trackingLink(token) { return location.origin + location.pathname + '#/pedido/' + token; }
function copyText(t) { navigator.clipboard?.writeText(t).then(() => toast('Copiado'), () => toast('No se pudo copiar: selecciónalo y cópialo')); }
function paymentInstructionsHTML(pi, total) {
  if (!pi) return '';
  return `<div class="info"><b>Paga ${money(total)} a Obrix Nexo</b>
    <span class="muted">Titular: ${esc(pi.holder || '—')}</span>
    ${pi.bank ? `<span class="muted">${esc(pi.bank)} · Cuenta ${esc(pi.account || '—')} · CCI ${esc(pi.cci || '—')}</span>` : ''}
    ${pi.yape ? `<span class="muted">Yape: ${esc(pi.yape)}</span>` : ''}
  </div>`;
}
function orderDoneHTML(o) {
  const r = o.r, link = trackingLink(r.trackingToken);
  return `<div class="scrim"></div><div class="modal-wrap" role="dialog" aria-modal="true" aria-label="Pedido recibido"><div class="modal sm"><div class="modal-b" style="gap:14px;padding:28px">
    <div class="success-ic">${ICON.check}</div>
    <h3 style="font-size:20px;text-align:center">¡Pedido ${esc(r.code)} recibido!</h3>
    <p class="muted" style="text-align:center">Reservamos tu material hasta el <b>${fmtDT(r.order.reservationExpiresAt)}</b>. Paga y luego informa tu número de operación en el enlace de tu pedido.</p>
    ${paymentInstructionsHTML(r.order.paymentInstructions, r.order.total)}
    <div><span class="label">Enlace de tu pedido (guárdalo)</span><div class="copybox" style="margin-top:6px"><code>${esc(link)}</code><button class="btn btn-secondary btn-sm" onclick="copyText('${esc(link)}')">Copiar</button></div></div>
    <button class="btn btn-primary btn-block" onclick="closeOverlay(); navigate('#/pedido/${esc(r.trackingToken)}')">Ver mi pedido e informar pago</button>
  </div></div></div>`;
}

/* =========================== SEGUIMIENTO =========================== */
async function loadTrack(token) {
  S.track = { token, data: S.track.token === token ? S.track.data : null, loading: true };
  scheduleRender();
  try { S.track.data = await api('/api/public/orders/' + encodeURIComponent(token)); }
  catch (e) { S.track.data = null; S.track.error = e.message; }
  S.track.loading = false; scheduleRender();
}
const STEPS = [['REQUESTED', 'Pedido recibido'], ['CONFIRMED', 'Pago verificado'], ['DELIVERED', 'Material entregado'], ['CLOSED', 'Pedido cerrado']];
function viewTrack() {
  const t = S.track, o = t.data;
  if (!o) return `${publicTop()}<div class="track">${t.loading ? loadingBox() : noData('Pedido no encontrado', t.error || 'Revisa el enlace que recibiste.')}</div>${footer()}`;
  const at = STEPS.findIndex(s => s[0] === o.status);
  const waiting = o.status === 'REQUESTED';
  const pending = (o.payments || []).some(p => p.status === 'PENDING');
  return `${publicTop()}
  <div class="track">
    <div class="status-hero"><h1 style="font-size:24px">Pedido ${esc(o.code)}</h1>${badge(ORDER_ST, o.status)}</div>
    ${o.status === 'CANCELLED' ? `<div class="alert alert-danger">Este pedido fue cancelado (${esc(CANCEL_REASON[o.cancelReason] || '')}). La cantidad volvió al catálogo.</div>` : ''}
    ${waiting ? `<div class="alert alert-warning">Reservado hasta el <b>${fmtDT(o.reservationExpiresAt)}</b>. ${pending ? 'Ya informaste un pago: lo estamos verificando.' : 'Paga e informa tu número de operación para confirmar.'}</div>` : ''}
    <div class="track-grid">
      <div style="display:grid;gap:18px;min-width:0">
        <div class="box"><h4>Detalle</h4>
          <div class="tablewrap" style="box-shadow:none"><table style="min-width:0"><thead><tr><th>Material</th><th>Cantidad</th><th>Precio sin IGV</th><th>Subtotal</th></tr></thead><tbody>
            ${o.items.map(i => `<tr><td><b>${esc(i.title)}</b><br><small class="muted">${esc(i.publicCode || '')}</small></td><td class="num">${esc(uqty(i.quantity, i.unitCode))}</td><td class="num">${money(i.unitPrice)}</td><td class="num">${money(i.lineSubtotal)}</td></tr>`).join('')}
          </tbody></table></div>
          <div class="summary"><div class="row"><span>Subtotal</span><b>${money(o.subtotal)}</b></div><div class="row"><span>IGV</span><b>${money(o.igvAmount)}</b></div><div class="total"><span>Total</span><span>${money(o.total)}</span></div></div>
        </div>
        ${waiting ? `<div class="box"><h4>Informar mi pago</h4>
          ${paymentInstructionsHTML(o.paymentInstructions, o.total)}
          <form class="inline-form" onsubmit="reportPayment(event)">
            <div class="grid3">
              <label class="field"><span class="label">Medio</span><select class="select" id="pay-method">${Object.entries(PAYMENT_METHOD).map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></label>
              <label class="field"><span class="label">N.º de operación</span><input class="input" id="pay-op" required minlength="4" maxlength="40" placeholder="Ej. 01234567"></label>
              <label class="field"><span class="label">Monto (S/)</span><input class="input num" id="pay-amount" type="number" step="0.01" min="0.01" required value="${num(o.total).toFixed(2)}"></label>
            </div>
            <button class="btn btn-primary" type="submit">Informar pago</button>
          </form></div>` : ''}
        ${o.pickup ? `<div class="box"><h4>Recojo</h4><dl class="kv"><dt>Dirección</dt><dd>${esc(o.pickup.address)}, ${esc(o.pickup.district)}</dd><dt>Contacto en obra</dt><dd>${esc(o.pickup.contactName || '—')} · ${esc(o.pickup.contactPhone || '—')}</dd></dl><p class="help">Lleva tu DNI y el código ${esc(o.code)}.</p></div>` : ''}
      </div>
      <div style="display:grid;gap:18px">
        <div class="box"><h4>Seguimiento</h4><div class="timeline">${STEPS.map(([k, l], i) => `<div class="tl ${o.status !== 'CANCELLED' && i <= at ? 'done' : ''}"><i></i><span>${l}</span></div>`).join('')}</div></div>
        ${o.payments?.length ? `<div class="box"><h4>Pagos informados</h4>${o.payments.map(p => `<div style="display:grid;gap:2px;font-size:13px"><span>${esc(PAYMENT_METHOD[p.method])} · ${esc(p.operationNumber)} · ${money(p.amount)}</span><span>${badge(PAYMENT_ST, p.status)} ${p.rejectionNote ? `<small class="muted">${esc(p.rejectionNote)}</small>` : ''}</span></div>`).join('')}</div>` : ''}
        <div class="box"><h4>Entrega</h4><p style="font-size:13px">${esc(DELIVERY[o.deliveryMode])} · obra en ${esc(o.pickupDistrict)}</p></div>
        ${waiting ? `<button class="btn btn-ghost" onclick="cancelMyOrder()">Ya no lo quiero (cancelar)</button>` : ''}
      </div>
    </div>
  </div>${footer()}`;
}
async function reportPayment(e) {
  e.preventDefault();
  try {
    S.track.data = await api(`/api/public/orders/${encodeURIComponent(S.track.token)}/payments`, {
      method: 'POST', body: { method: val('pay-method'), operationNumber: val('pay-op'), amount: Number(val('pay-amount')) }
    });
    toast('¡Gracias! Verificamos tu pago y te confirmamos.'); render();
  } catch (err) { fail(err); }
}
async function cancelMyOrder() {
  if (!confirm('¿Seguro que quieres cancelar el pedido? La cantidad vuelve al catálogo.')) return;
  try { S.track.data = await api(`/api/public/orders/${encodeURIComponent(S.track.token)}/cancel`, { method: 'POST' }); toast('Pedido cancelado.'); render(); }
  catch (err) { fail(err); }
}
