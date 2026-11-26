/* =====================================================================
 * Obrix Nexo · tablero de la gerencia (Resumen del Admin Empresa)
 *
 * Arriba, "hoy": cuánto recuperó la constructora con sus saldos, en qué paso está cada saldo y qué
 * se vence pronto. Abajo, "ventas" en el periodo elegido: por mes, por obra y por material.
 * Todo se calcula en el navegador con los datos que ya trae el panel (saldos, pedidos y obras).
 *
 * Gráficos: HTML + CSS (sin librerías). Dos series con el mismo color en todos los gráficos:
 *   azul = liquidado (Obrix ya le pagó a la constructora) · naranja = por liquidar (pagado por el
 *   comprador, falta entregar o liquidar). Paleta validada para daltonismo y contraste (claro y oscuro).
 * ===================================================================== */
'use strict';

const DASH_PAID = ['CONFIRMED', 'DELIVERED', 'CLOSED'];   // el comprador ya pagó
const DASH_RANGES = [[3, '3 meses'], [6, '6 meses'], [12, '12 meses']];
const DASH_SERIES = [
  { key: 'closed', label: 'Liquidado', css: 'v1', help: 'Obrix ya te pagó' },
  { key: 'open', label: 'Por liquidar', css: 'v2', help: 'Pagado por el comprador; falta entregar o liquidar' }
];
const MONTHS_ES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'set', 'oct', 'nov', 'dic'];
const MONTHS_FULL = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'setiembre', 'octubre', 'noviembre', 'diciembre'];

const limaYM = iso => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima', year: 'numeric', month: '2-digit' }).format(new Date(iso)).slice(0, 7);
const dashToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date());
const daysUntil = ymd => Math.round((Date.parse(ymd + 'T00:00:00Z') - Date.parse(dashToday() + 'T00:00:00Z')) / 864e5);
/** S/ 1,234 · S/ 12.9 mil · S/ 1.2 M (para ejes y etiquetas cortas) */
const moneyShort = n => { n = Math.round(num(n)); return n >= 1e6 ? `S/ ${(n / 1e6).toFixed(1).replace(/\.0$/, '')} M` : n >= 1e4 ? `S/ ${(n / 1e3).toFixed(1).replace(/\.0$/, '')} mil` : money0(n); };

/** Escalones "redondos" para el eje: 0, 2 mil, 4 mil… */
function niceMax(max) {
  if (max <= 0) return { top: 1000, step: 250 };
  const raw = max / 4, pow = 10 ** Math.floor(Math.log10(raw)), f = raw / pow;
  const step = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * pow;
  return { top: Math.ceil(max / step) * step, step };
}

/* ---------------- datos ---------------- */
function dashData() {
  const d = S.panel.data, L = d.listings || [], O = d.orders || [], P = d.projects || [];
  const months = S.panel.range || 6;
  // meses del periodo (del más antiguo al actual)
  const now = dashToday(), y = +now.slice(0, 4), m = +now.slice(5, 7);
  const keys = Array.from({ length: months }, (_, i) => { const t = new Date(Date.UTC(y, m - 1 - (months - 1 - i), 1)); return t.toISOString().slice(0, 7); });
  const inRange = new Set(keys);
  const paid = O.filter(o => DASH_PAID.includes(o.status));
  const split = o => o.status === 'CLOSED' ? 'closed' : 'open';
  const periodOrders = paid.filter(o => inRange.has(limaYM(o.createdAt)));

  const byMonth = keys.map(k => ({ key: k, label: MONTHS_ES[+k.slice(5, 7) - 1] + (k.slice(5, 7) === '01' || k === keys[0] ? ' ' + k.slice(2, 4) : ''), full: MONTHS_FULL[+k.slice(5, 7) - 1] + ' ' + k.slice(0, 4), closed: 0, open: 0, orders: 0 }));
  const monthIdx = Object.fromEntries(keys.map((k, i) => [k, i]));
  periodOrders.forEach(o => { const b = byMonth[monthIdx[limaYM(o.createdAt)]]; b[split(o)] += num(o.netTotal); b.orders++; });

  const group = (keyOf, nameOf) => {
    const map = new Map();
    periodOrders.forEach(o => (keyOf(o) || []).forEach(([k, name, amount]) => {
      const g = map.get(k) || { label: name, closed: 0, open: 0 };
      g[split(o)] += amount; map.set(k, g);
    }));
    return [...map.values()].map(g => ({ ...g, total: g.closed + g.open })).sort((a, b) => b.total - a.total);
  };
  const byProject = group(o => [[o.projectId, o.projectName || (P.find(p => p.id === o.projectId)?.name ?? 'Obra')]].map(([k, n]) => [k, n, num(o.netTotal)]));
  const byMaterial = group(o => (o.items || []).map(i => [i.title.trim().toLowerCase(), i.title, num(i.netAmount)]));

  const published = L.filter(l => l.status === 'PUBLISHED');
  const expiring = published.filter(l => l.pickupDeadline && daysUntil(l.pickupDeadline) <= 14)
    .sort((a, b) => a.pickupDeadline.localeCompare(b.pickupDeadline));
  const count = st => L.filter(l => st.includes(l.status)).length;
  return {
    months, keys, byMonth, byProject, byMaterial, expiring,
    recovered: paid.filter(o => o.status === 'CLOSED').reduce((a, o) => a + num(o.netTotal), 0),
    recoveredOrders: paid.filter(o => o.status === 'CLOSED').length,
    toReceive: paid.filter(o => o.status !== 'CLOSED').reduce((a, o) => a + num(o.netTotal), 0),
    toDeliver: O.filter(o => o.status === 'CONFIRMED').length,
    inStore: published.reduce((a, l) => a + num(l.price?.netUnitPrice ?? l.netUnitPrice) * num(l.quantityAvailable), 0),
    periodTotal: periodOrders.reduce((a, o) => a + num(o.netTotal), 0), periodOrders: periodOrders.length,
    pipeline: [
      { label: 'Borradores', n: count(['DRAFT']), filter: 'DRAFT' },
      { label: 'Por aprobar', n: count(['PENDING_APPROVAL']), filter: 'PENDING_APPROVAL' },
      { label: 'Revisión de Obrix', n: count(['PENDING_REVIEW']), filter: 'PENDING_REVIEW' },
      { label: 'En la tienda', n: published.length, filter: 'PUBLISHED' },
      { label: 'Agotados', n: count(['SOLD_OUT']), filter: 'SOLD_OUT' }
    ],
    toFix: count(['REJECTED', 'OBSERVED']), hasRejected: count(['REJECTED']) > 0
  };
}

/* ---------------- vista ---------------- */
function dashboardContent() {
  const D = dashData(), O = S.panel.data.orders || [];
  setTimeout(animateDashHero, 30);
  const tipData = (title, rows, foot) => esc(JSON.stringify({ title, rows, foot }));
  return `<section class="dash-today" aria-label="Tu constructora hoy">
      <div class="dash-hero">
        <span class="dash-eyebrow">Recuperado con tus saldos</span>
        <div class="dash-figure" id="dash-hero" data-value="${Math.round(D.recovered)}">${money0(D.recovered)}</div>
        <p class="dash-hero-sub">${D.recoveredOrders ? `${D.recoveredOrders} ${D.recoveredOrders === 1 ? 'pedido liquidado' : 'pedidos liquidados'}: material que no terminó en desmonte.` : 'Cuando se liquide tu primer pedido, aquí verás lo que recuperaste.'}</p>
        <dl class="dash-facts">
          <div><dt>Por recibir</dt><dd>${money0(D.toReceive)}</dd></div>
          <div><dt>En la tienda ahora</dt><dd>${money0(D.inStore)}</dd></div>
          <div><dt>Pedidos por entregar</dt><dd>${D.toDeliver}</dd></div>
        </dl>
      </div>
      <div class="dash-card dash-flow">
        <div class="dash-card-h"><h3>Tus saldos hoy</h3>${D.toFix ? `<button class="badge b-danger dash-fix" onclick="S.panel.nextFilter='${D.hasRejected ? 'REJECTED' : 'OBSERVED'}'; goPanel('saldos')">${D.toFix} para corregir</button>` : ''}</div>
        <ol class="flow">${D.pipeline.map(s => `<li><button onclick="S.panel.nextFilter='${s.filter}'; goPanel('saldos')" ${s.n ? '' : 'class="zero"'} aria-label="${esc(s.label)}: ${s.n}"><b>${s.n}</b><span>${esc(s.label)}</span></button></li>`).join('')}</ol>
        ${D.expiring.length ? `<div class="dash-expiring"><h4>Se vencen en los próximos 14 días</h4><ul>${D.expiring.slice(0, 4).map(l => { const n = daysUntil(l.pickupDeadline); return `<li><button onclick="openListing('${l.id}')"><span class="t">${esc(l.title)}</span><span class="badge ${n <= 3 ? 'b-danger' : 'b-warning'}">${n <= 0 ? 'Vence hoy' : n === 1 ? 'Vence mañana' : `${n} días`}</span></button></li>`; }).join('')}</ul>${D.expiring.length > 4 ? `<p class="muted">y ${D.expiring.length - 4} más</p>` : ''}</div>`
          : `<p class="dash-ok">${ICON.check} Ningún saldo publicado vence en los próximos 14 días.</p>`}
      </div>
    </section>
    ${isApprover() && S.approvalsPending ? `<div class="banner">${ICON.stamp}<span>Tienes ${S.approvalsPending} ${S.approvalsPending === 1 ? 'saldo esperando' : 'saldos esperando'} tu aprobación. <button class="btn btn-primary btn-sm" onclick="goPanel('aprobaciones')">Revisar</button></span></div>` : ''}

    <section class="dash-sales" aria-labelledby="dash-sales-h">
      <div class="dash-sales-h">
        <div><h3 id="dash-sales-h">Ventas</h3><p class="muted">${money0(D.periodTotal)} en ${D.periodOrders} ${D.periodOrders === 1 ? 'pedido pagado' : 'pedidos pagados'} · lo que recibe tu constructora, sin IGV ni comisión</p></div>
        <div class="seg" role="group" aria-label="Periodo">${DASH_RANGES.map(([v, t]) => `<button aria-pressed="${D.months === v}" onclick="S.panel.range=${v}; render()">${t}</button>`).join('')}</div>
      </div>
      <div class="viz-legend" aria-label="Leyenda">${DASH_SERIES.map(s => `<span><i class="sw ${s.css}"></i>${s.label} <small class="muted">· ${s.help}</small></span>`).join('')}</div>
      <div class="dash-grid">
        <div class="dash-card span2"><h4>Por mes</h4>${columnsChart(D.byMonth, tipData)}</div>
        <div class="dash-card"><h4>Por obra</h4>${barsChart(D.byProject.slice(0, 6), tipData, 'Aún no hay ventas en este periodo.')}</div>
        <div class="dash-card"><h4>Lo que más se vende</h4>${barsChart(D.byMaterial.slice(0, 6), tipData, 'Aún no hay ventas en este periodo.')}</div>
      </div>
      <details class="dash-table"><summary>Ver los números en tabla</summary>
        <div class="tablewrap"><table><thead><tr><th>Mes</th><th class="num">Liquidado</th><th class="num">Por liquidar</th><th class="num">Pedidos</th></tr></thead>
        <tbody>${D.byMonth.map(b => `<tr><td>${esc(b.full)}</td><td class="num">${money0(b.closed)}</td><td class="num">${money0(b.open)}</td><td class="num">${b.orders}</td></tr>`).join('')}</tbody></table></div>
      </details>
    </section>

    <h3 style="font-size:15px">Obras</h3>${projectCards()}
    <h3 style="font-size:15px">Últimos pedidos</h3>${ordersTable(O.slice(0, 5))}`;
}

/** Columnas apiladas por mes (liquidado abajo, por liquidar arriba). */
function columnsChart(rows, tipData) {
  const max = Math.max(0, ...rows.map(r => r.closed + r.open));
  const { top, step } = niceMax(max);
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
  const peak = max > 0 ? rows.reduce((best, r, i) => (r.closed + r.open) > (rows[best].closed + rows[best].open) ? i : best, 0) : -1;
  return `<div class="cols ${max ? '' : 'empty'}" role="img" aria-label="Ventas por mes: ${rows.map(r => `${r.label} ${money0(r.closed + r.open)}`).join(', ')}">
    <div class="cols-y" aria-hidden="true">${ticks.map(t => `<span style="bottom:${t / top * 100}%">${moneyShort(t)}</span>`).join('')}</div>
    <div class="cols-plot">
      ${ticks.map(t => `<i class="grid" style="bottom:${t / top * 100}%"></i>`).join('')}
      ${rows.map((r, i) => { const total = r.closed + r.open; return `<div class="col" tabindex="0" data-tip="${tipData(r.full || r.label, [['Liquidado', money0(r.closed), 'v1'], ['Por liquidar', money0(r.open), 'v2']], `${r.orders} ${r.orders === 1 ? 'pedido' : 'pedidos'} · total ${money0(total)}`)}">
          <div class="stack" style="height:${total / top * 100}%">${i === peak ? `<b class="cap">${moneyShort(total)}</b>` : ''}${r.open ? `<span class="seg v2" style="flex:${r.open}"></span>` : ''}${r.closed ? `<span class="seg v1" style="flex:${r.closed}"></span>` : ''}</div>
          <small>${esc(r.label)}</small></div>`; }).join('')}
      ${max ? '' : '<p class="cols-empty">Aún no hay ventas en este periodo.</p>'}
    </div>
  </div>`;
}

/** Barras horizontales ordenadas (por obra, por material), apiladas liquidado + por liquidar. */
function barsChart(rows, tipData, emptyText) {
  if (!rows.length) return `<p class="muted bars-empty">${esc(emptyText)}</p>`;
  const max = Math.max(...rows.map(r => r.total));
  return `<ul class="bars">${rows.map(r => `<li tabindex="0" data-tip="${tipData(r.full || r.label, [['Liquidado', money0(r.closed), 'v1'], ['Por liquidar', money0(r.open), 'v2']], `Total ${money0(r.total)}`)}">
      <span class="bars-name">${esc(r.label)}</span>
      <span class="bars-track"><span class="bars-fill" style="width:${r.total / max * 100}%">${r.closed ? `<span class="seg v1" style="flex:${r.closed}"></span>` : ''}${r.open ? `<span class="seg v2" style="flex:${r.open}"></span>` : ''}</span><b>${moneyShort(r.total)}</b></span>
    </li>`).join('')}</ul>`;
}

/* ---------------- tooltip (uno solo para todo el tablero) ---------------- */
function dashTip(target) {
  let tip = document.getElementById('viz-tip');
  if (!target) { if (tip) tip.hidden = true; return; }
  if (!tip) { tip = document.createElement('div'); tip.id = 'viz-tip'; tip.setAttribute('role', 'tooltip'); document.body.appendChild(tip); }
  let data; try { data = JSON.parse(target.dataset.tip); } catch (e) { return; }
  tip.replaceChildren();
  const h = document.createElement('div'); h.className = 'tt'; h.textContent = data.title; tip.appendChild(h);
  data.rows.forEach(([name, value, css]) => {
    const row = document.createElement('div'); row.className = 'tr';
    const key = document.createElement('i'); key.className = 'key ' + css;
    const v = document.createElement('b'); v.textContent = value;
    const n = document.createElement('span'); n.textContent = name;
    row.append(key, v, n); tip.appendChild(row);
  });
  if (data.foot) { const f = document.createElement('div'); f.className = 'tf'; f.textContent = data.foot; tip.appendChild(f); }
  tip.hidden = false;
  const r = target.getBoundingClientRect(), w = tip.offsetWidth, hgt = tip.offsetHeight;
  const left = Math.min(window.innerWidth - w - 8, Math.max(8, r.left + r.width / 2 - w / 2));
  const topPos = r.top - hgt - 8 > 8 ? r.top - hgt - 8 : r.bottom + 8;
  tip.style.left = left + 'px'; tip.style.top = topPos + 'px';
}
document.addEventListener('pointerover', e => dashTip(e.target.closest?.('[data-tip]')));
document.addEventListener('focusin', e => dashTip(e.target.closest?.('[data-tip]')));
document.addEventListener('focusout', () => dashTip(null));
window.addEventListener('scroll', () => dashTip(null), { passive: true });

/* ---------------- el único momento animado: la cifra principal sube al entrar ---------------- */
function animateDashHero() {
  const el = document.getElementById('dash-hero');
  if (!el || S.panel.heroDone || !S.panel.loaded) return;
  S.panel.heroDone = true;
  const target = Number(el.dataset.value) || 0;
  if (!target || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const t0 = performance.now(), dur = 900;
  const tick = now => {
    const node = document.getElementById('dash-hero'); if (!node) return;
    const p = Math.min(1, (now - t0) / dur), eased = 1 - (1 - p) ** 3;
    node.textContent = money0(target * eased);
    if (p < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
