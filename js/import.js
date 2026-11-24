/* =====================================================================
 * Obrix Nexo · carga masiva de saldos desde Excel (panel de la constructora)
 *
 * 1. "Descargar plantilla": arma un .xlsx con las columnas del formulario "Publicar saldo"
 *    y listas desplegables con las obras de la constructora, categorías, unidades y estados.
 * 2. "Subir Excel": lee el archivo en el navegador y revisa fila por fila con las mismas
 *    reglas del formulario. Muestra qué filas están listas y cuáles tienen errores (y por qué).
 * 3. "Crear saldos": crea cada fila con el mismo servicio del formulario (POST /listings),
 *    así la API vuelve a validar todo. Los saldos quedan en BORRADOR: luego se les agregan
 *    fotos y se envían a aprobación de la constructora, igual que uno creado a mano.
 *
 * La librería ExcelJS (vendor/exceljs, licencia MIT) se carga solo al abrir esta ventana.
 * ===================================================================== */
'use strict';

const IMPORT_MAX_ROWS = 500;
const IMPORT_MAX_BYTES = 2 * 1024 * 1024;
const IMPORT_PARALLEL = 3;          // saldos que se crean a la vez (suave con el servidor)
const IMPORT_SHEET = 'Saldos';

/* Mismas columnas y límites que el formulario "Publicar saldo". */
const IMPORT_COLS = [
  { key: 'project', header: 'Obra', req: true, width: 34 },
  { key: 'category', header: 'Categoría', req: true, width: 30 },
  { key: 'title', header: 'Nombre del material', req: true, width: 42 },
  { key: 'brand', header: 'Marca', width: 18 },
  { key: 'condition', header: 'Estado', req: true, width: 24 },
  { key: 'unit', header: 'Unidad', req: true, width: 20 },
  { key: 'quantityTotal', header: 'Cantidad', req: true, width: 12 },
  { key: 'minOrderQuantity', header: 'Pedido mínimo', width: 15 },
  { key: 'unitWeightKg', header: 'Peso por unidad (kg)', width: 19 },
  { key: 'netUnitPrice', header: 'Tu precio por unidad (S/ sin IGV)', req: true, width: 24 },
  { key: 'pickupDeadline', header: 'Fecha límite de recojo', req: true, width: 21 },
  { key: 'description', header: 'Descripción', width: 50 }
];
const colHeader = c => c.header + (c.req ? ' *' : '');
const colLetter = i => String.fromCharCode(65 + i);
const colOf = key => IMPORT_COLS.findIndex(c => c.key === key);

/* ---------------- utilidades ---------------- */
/** Texto comparable: sin tildes, minúsculas, solo letras y números. */
const fold = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const limaToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date());
const short = (t, n = 70) => t && t.length > n ? t.slice(0, n) + '…' : t;
const cap = s => s[0].toUpperCase() + s.slice(1);
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const importProjects = () => (S.panel.data.projects || []).filter(p => p.status === 'ACTIVE');
const projectLabel = p => `${p.name} · ${p.district}`;

const scriptLoads = {};
function loadScript(src, globalName) {
  if (window[globalName]) return Promise.resolve();
  if (!scriptLoads[src]) {
    scriptLoads[src] = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = () => resolve();
      s.onerror = () => { delete scriptLoads[src]; s.remove(); reject(new Error('No se pudo cargar el lector de Excel. Revisa tu conexión e intenta de nuevo.')); };
      document.head.appendChild(s);
    });
  }
  return scriptLoads[src];
}
const loadExcelLib = () => loadScript('vendor/exceljs/exceljs.min.js', 'ExcelJS');

/**
 * Abre un .xlsx. Algunos programas (Google Sheets, LibreOffice, WPS…) guardan los comentarios de celda
 * de una forma que ExcelJS no entiende. Si falla, se quitan los comentarios (no se usan) y se reintenta.
 */
async function openWorkbook(buffer) {
  try { const wb = new ExcelJS.Workbook(); await wb.xlsx.load(buffer); return wb; }
  catch (first) {
    await loadScript('vendor/jszip/jszip.min.js', 'JSZip');
    const zip = await JSZip.loadAsync(buffer);
    const removed = [];
    for (const name of Object.keys(zip.files)) {
      if (/^xl\/(.*\/)?comments?[^/]*\.xml$/i.test(name) || /^xl\/drawings\/[^/]*\.vml$/i.test(name)) { zip.remove(name); removed.push(name); }
    }
    for (const name of Object.keys(zip.files)) {
      if (/^xl\/worksheets\/_rels\/[^/]+\.rels$/i.test(name)) {
        const xml = await zip.file(name).async('string');
        zip.file(name, xml.replace(/<Relationship\b[^>]*relationships\/(comments|vmlDrawing)"[^>]*\/>/g, ''));
      } else if (/^xl\/worksheets\/[^/]+\.xml$/i.test(name)) {
        const xml = await zip.file(name).async('string');
        zip.file(name, xml.replace(/<legacyDrawing\b[^>]*\/>/g, ''));
      }
    }
    if (zip.file('[Content_Types].xml')) {
      const xml = await zip.file('[Content_Types].xml').async('string');
      zip.file('[Content_Types].xml', xml.replace(/<Override\b[^>]*PartName="\/([^"]+)"[^>]*\/>/g, (m, part) => removed.includes(part) ? '' : m));
    }
    if (!removed.length) throw first;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await zip.generateAsync({ type: 'arraybuffer' }));
    return wb;
  }
}

function downloadBlob(buffer, filename) {
  const url = URL.createObjectURL(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/* ---------------- ventana ---------------- */
function openImport() {
  openOverlay({ kind: 'import', phase: 'start' });
  loadExcelLib().catch(() => { /* se reintenta al usarla */ });
}

function importModal(o) {
  const busy = o.phase === 'reading' || o.phase === 'creating';
  return `<div class="scrim" ${busy ? '' : 'onclick="closeOverlay()"'}></div>
  <div class="modal-wrap" role="dialog" aria-modal="true" aria-labelledby="imp-title"><div class="modal imp">
    <div class="modal-h"><h3 id="imp-title">Cargar saldos desde Excel</h3>${busy ? '' : `<button type="button" class="iconbtn" onclick="closeOverlay()" aria-label="Cerrar">${ICON.x}</button>`}</div>
    ${o.phase === 'preview' ? importPreview(o) : o.phase === 'creating' ? importProgress(o) : o.phase === 'done' ? importDone(o) : importStart(o)}
  </div></div>`;
}

function importStart(o) {
  const projects = importProjects();
  if (!projects.length) {
    return `<div class="modal-b">${noData('No tienes obras activas', isCompanyAdmin() ? 'Crea una obra en "Obras" para cargar saldos.' : 'Pide al Admin de tu constructora que te asigne una obra.')}</div>
      <div class="modal-f"><button type="button" class="btn btn-secondary" onclick="closeOverlay()">Cerrar</button></div>`;
  }
  return `<div class="modal-b">
      <div class="imp-step"><span class="imp-n">1</span><div><b>Descarga la plantilla</b>
        <p class="muted">Trae las mismas columnas del formulario y listas para elegir obra, categoría, estado y unidad.</p>
        <button type="button" class="btn btn-secondary btn-sm" onclick="downloadImportTemplate()">Descargar plantilla</button></div></div>
      <div class="imp-step"><span class="imp-n">2</span><div><b>Llénala con tus saldos</b>
        <p class="muted">Una fila por saldo, hasta ${IMPORT_MAX_ROWS} por archivo. Las fotos no van en el Excel: se agregan después.</p></div></div>
      <div class="imp-step"><span class="imp-n">3</span><div style="flex:1"><b>Súbela aquí</b>
        <div class="upload imp-drop" ondragover="event.preventDefault(); this.classList.add('over')" ondragleave="this.classList.remove('over')" ondrop="importDrop(event)">
          ${ICON.upload}<span>${o.phase === 'reading' ? 'Revisando el archivo…' : 'Arrastra el archivo aquí o elígelo. Solo .xlsx de hasta 2 MB.'}</span>
          <label class="btn btn-primary btn-sm" ${o.phase === 'reading' ? 'aria-disabled="true" style="pointer-events:none;opacity:.6"' : ''}>Elegir archivo<input type="file" id="imp-file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden onchange="importPick(this)"></label>
        </div>
        ${o.error ? `<p class="imp-error" role="alert">${esc(o.error)}</p>` : ''}</div></div>
    </div>
    <div class="modal-f"><button type="button" class="btn btn-secondary" onclick="closeOverlay()" ${o.phase === 'reading' ? 'disabled' : ''}>Cancelar</button></div>`;
}

function importPreview(o) {
  const ok = o.rows.filter(r => r.status === 'ok'), bad = o.rows.filter(r => r.status === 'error'), skip = o.rows.filter(r => r.status === 'skip');
  const projects = new Map(importProjects().map(p => [p.id, p.name]));
  const SHOW = 100;
  return `<div class="modal-b">
      <p class="muted" style="margin:0">Archivo: <b>${esc(o.fileName)}</b> · ${plural(o.rows.length, 'fila', 'filas')} con datos</p>
      <div class="imp-sum">
        <div class="imp-box ok"><b>${ok.length}</b><span>${ok.length === 1 ? 'lista para crear' : 'listas para crear'}</span></div>
        <div class="imp-box ${bad.length ? 'bad' : ''}"><b>${bad.length}</b><span>con errores</span></div>
        ${skip.length ? `<div class="imp-box"><b>${skip.length}</b><span>ya cargadas (se omiten)</span></div>` : ''}
      </div>
      ${bad.length ? `<div><h4 class="imp-h">Filas con errores</h4>
        <p class="muted" style="margin:0 0 8px">Corrígelas en tu Excel y vuelve a subirlo. Las filas que ya se hayan creado se omiten solas.</p>
        <div class="tablewrap"><table class="imp-stack"><thead><tr><th>Fila</th><th>Material</th><th>Qué corregir</th></tr></thead><tbody>
        ${bad.slice(0, SHOW).map(r => `<tr><td class="num"><span class="imp-only-m">Fila </span>${r.row}</td><td class="imp-t">${esc(short(r.titleText) || '—')}</td><td><ul class="imp-errs">${r.errors.map(e => `<li>${esc(e)}</li>`).join('')}</ul></td></tr>`).join('')}
        </tbody></table></div>
        ${bad.length > SHOW ? `<p class="muted">…y ${bad.length - SHOW} más. Descarga las filas con errores para verlas todas.</p>` : ''}
        <button type="button" class="btn btn-ghost btn-sm" onclick="downloadImportPending()">Descargar filas con errores</button></div>` : ''}
      ${skip.length ? `<div><h4 class="imp-h">Ya cargadas</h4><div class="tablewrap"><table><thead><tr><th>Fila</th><th>Material</th><th>Saldo existente</th></tr></thead><tbody>
        ${skip.slice(0, SHOW).map(r => `<tr><td class="num">${r.row}</td><td class="imp-t">${esc(short(r.titleText))}</td><td>${esc(r.existing)}</td></tr>`).join('')}
        </tbody></table></div><p class="muted" style="margin:6px 0 0">Ya existe un saldo con ese nombre en esa obra. Si es otro lote, cambia el nombre en el Excel.</p></div>` : ''}
      ${ok.length ? `<div><h4 class="imp-h">Listas para crear</h4><div class="tablewrap"><table><thead><tr><th>Fila</th><th>Material</th><th>Obra</th><th>Cantidad</th><th>Tu precio</th><th>Recojo hasta</th></tr></thead><tbody>
        ${ok.slice(0, SHOW).map(r => `<tr><td class="num">${r.row}</td><td class="imp-t">${esc(short(r.data.title))}</td><td>${esc(projects.get(r.data.projectId) || '—')}</td>
          <td class="num">${esc(uqty(r.data.quantityTotal, r.data.unitCode))}</td><td class="num">${money(r.data.netUnitPrice)}</td><td>${fmtDate(r.data.pickupDeadline)}</td></tr>`).join('')}
        </tbody></table></div>${ok.length > SHOW ? `<p class="muted">…y ${ok.length - SHOW} más.</p>` : ''}</div>` : ''}
      <div class="banner">${ICON.shield}<span>Se crean como <b>borradores</b>. Después abre cada uno, agrega al menos una foto y envíalo a aprobación de tu constructora.</span></div>
    </div>
    <div class="modal-f">
      <button type="button" class="btn btn-secondary" onclick="S.overlay={kind:'import',phase:'start'}; renderOverlay()">Subir otro archivo</button>
      <button type="button" class="btn btn-primary" onclick="runImport()" ${ok.length ? '' : 'disabled'}>${ICON.check} ${ok.length ? `Crear ${plural(ok.length, 'saldo', 'saldos')}` : 'Nada para crear'}</button>
    </div>`;
}

function importProgress(o) {
  const pct = o.total ? Math.round(o.done / o.total * 100) : 0;
  return `<div class="modal-b">
      <p style="margin:0"><b>Creando saldos…</b> ${o.done} de ${o.total}</p>
      <div class="imp-bar" role="progressbar" aria-valuemin="0" aria-valuemax="${o.total}" aria-valuenow="${o.done}" aria-label="Saldos creados"><span style="width:${pct}%"></span></div>
      <p class="muted" style="margin:0">No cierres esta ventana hasta que termine.</p>
    </div>`;
}

function importDone(o) {
  const created = o.rows.filter(r => r.result?.ok), failed = o.rows.filter(r => r.status === 'ok' && !r.result?.ok);
  const pending = o.rows.filter(r => r.status === 'error').length + failed.length;
  return `<div class="modal-b">
      <div class="imp-sum">
        <div class="imp-box ok"><b>${created.length}</b><span>${created.length === 1 ? 'saldo creado en borrador' : 'saldos creados en borrador'}</span></div>
        ${pending ? `<div class="imp-box bad"><b>${pending}</b><span>${pending === 1 ? 'fila no creada' : 'filas no creadas'}</span></div>` : ''}
      </div>
      ${o.stopped ? `<p class="imp-error" role="alert">${esc(o.stopped)}</p>` : ''}
      ${failed.length ? `<div><h4 class="imp-h">No se pudieron crear</h4><div class="tablewrap"><table><thead><tr><th>Fila</th><th>Material</th><th>Motivo</th></tr></thead><tbody>
        ${failed.slice(0, 100).map(r => `<tr><td class="num">${r.row}</td><td class="imp-t">${esc(short(r.data.title))}</td><td>${esc(r.result?.msg || 'No se intentó: la carga se detuvo.')}</td></tr>`).join('')}
        </tbody></table></div></div>` : ''}
      ${created.length ? `<div class="banner">${ICON.shield}<span><b>Siguiente paso:</b> en "Borradores", abre cada saldo, agrega al menos una foto y presiona "Enviar a aprobación".</span></div>` : ''}
      ${pending ? `<p class="muted" style="margin:0">Descarga las filas que faltan, corrígelas y vuelve a subir ese archivo.</p>` : ''}
    </div>
    <div class="modal-f">
      ${pending ? `<button type="button" class="btn btn-secondary" onclick="downloadImportPending()">Descargar filas que faltan</button>` : ''}
      <button type="button" class="btn btn-primary" onclick="finishImport()">${created.length ? 'Ver mis borradores' : 'Cerrar'}</button>
    </div>`;
}

/* ---------------- plantilla ---------------- */
async function downloadImportTemplate() {
  try {
    await loadExcelLib();
    const projects = importProjects(), cats = S.ref.categories || [], units = S.ref.units || [];
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Obrix Nexo';
    const ws = wb.addWorksheet(IMPORT_SHEET, { views: [{ state: 'frozen', ySplit: 1 }] });
    const help = wb.addWorksheet('Cómo llenarla');
    const lists = wb.addWorksheet('Listas');

    // Listas para los desplegables (hoja oculta)
    const listCols = [['Obras', projects.map(projectLabel)], ['Categorías', cats.map(c => c.name)],
      ['Unidades', units.map(u => u.name)], ['Estados', Object.values(CONDITION)]];
    listCols.forEach(([title, values], i) => {
      lists.getCell(1, i + 1).value = title; lists.getCell(1, i + 1).font = { bold: true };
      values.forEach((v, j) => { lists.getCell(j + 2, i + 1).value = v; });
      lists.getColumn(i + 1).width = 36;
    });
    lists.state = 'hidden';
    const listRef = (i, n) => `Listas!$${colLetter(i)}$2:$${colLetter(i)}$${Math.max(n, 1) + 1}`;

    // Encabezados
    ws.columns = IMPORT_COLS.map(c => ({ header: colHeader(c), key: c.key, width: c.width }));
    const head = ws.getRow(1);
    head.height = 32;
    head.eachCell((cell, i) => {
      const c = IMPORT_COLS[i - 1];
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: c.req ? 'FF0F2A4A' : 'FF4A5D75' } };
      cell.alignment = { vertical: 'middle', wrapText: true };
    });

    // Formatos y validaciones (filas 2 a 501)
    const last = IMPORT_MAX_ROWS + 1;
    const range = key => `${colLetter(colOf(key))}2:${colLetter(colOf(key))}${last}`;
    const list = (key, i, n, what) => ws.dataValidations.add(range(key), {
      type: 'list', allowBlank: true, formulae: [listRef(i, n)], showErrorMessage: true, errorStyle: 'stop',
      errorTitle: 'Valor no válido', error: `Elige ${what} de la lista.`
    });
    list('project', 0, projects.length, 'una obra');
    list('category', 1, cats.length, 'una categoría');
    list('unit', 2, units.length, 'una unidad');
    list('condition', 3, 3, 'un estado');
    const positive = (key, label) => ws.dataValidations.add(range(key), {
      type: 'decimal', operator: 'greaterThan', allowBlank: true, formulae: [0], showErrorMessage: true,
      errorStyle: 'stop', errorTitle: 'Número no válido', error: `${label} debe ser un número mayor a 0.`
    });
    positive('quantityTotal', 'La cantidad'); positive('minOrderQuantity', 'El pedido mínimo');
    positive('unitWeightKg', 'El peso'); positive('netUnitPrice', 'El precio');
    ws.dataValidations.add(range('title'), { type: 'textLength', operator: 'lessThanOrEqual', allowBlank: true, formulae: [150], showErrorMessage: true, errorTitle: 'Muy largo', error: 'Máximo 150 caracteres.' });
    ws.dataValidations.add(range('brand'), { type: 'textLength', operator: 'lessThanOrEqual', allowBlank: true, formulae: [80], showErrorMessage: true, errorTitle: 'Muy largo', error: 'Máximo 80 caracteres.' });
    ws.dataValidations.add(range('description'), { type: 'textLength', operator: 'lessThanOrEqual', allowBlank: true, formulae: [2000], showErrorMessage: true, errorTitle: 'Muy largo', error: 'Máximo 2000 caracteres.' });
    ws.dataValidations.add(range('pickupDeadline'), { type: 'date', operator: 'greaterThan', allowBlank: true, formulae: [new Date(Date.UTC(2020, 0, 1))], showErrorMessage: true, errorTitle: 'Fecha no válida', error: 'Escribe una fecha como 31/12/2026.' });
    ['quantityTotal', 'minOrderQuantity', 'netUnitPrice'].forEach(k => { ws.getColumn(colOf(k) + 1).numFmt = '#,##0.00'; });
    ws.getColumn(colOf('unitWeightKg') + 1).numFmt = '0.000';
    ws.getColumn(colOf('pickupDeadline') + 1).numFmt = 'dd/mm/yyyy';

    // Hoja de ayuda
    help.getColumn(1).width = 4; help.getColumn(2).width = 110;
    const tips = [
      'En la hoja "Saldos" llena una fila por cada saldo. No cambies ni muevas los títulos de la fila 1.',
      'Las columnas con * son obligatorias. Las demás puedes dejarlas vacías.',
      'Obra, Categoría, Estado y Unidad: elige de la lista desplegable de cada celda.',
      'Cantidad, pedido mínimo y precio: solo números, hasta 2 decimales. Peso: hasta 3 decimales.',
      'Tu precio es lo que quieres recibir por unidad, sin IGV. Obrix calcula el precio que ve el comprador.',
      'Fecha límite de recojo: día/mes/año (por ejemplo 31/12/2026). No puede ser una fecha pasada.',
      `Máximo ${IMPORT_MAX_ROWS} saldos por archivo.`,
      'Las fotos no van en el Excel. Después de la carga, abre cada saldo en "Borradores", agrega sus fotos y envíalo a aprobación.',
      'Si una fila tiene errores, la plataforma te dice cuál y qué corregir. Las filas que ya se crearon se omiten si vuelves a subir el archivo.'
    ];
    help.getCell('B1').value = 'Cómo llenar la plantilla de saldos de Obrix Nexo';
    help.getCell('B1').font = { bold: true, size: 14, color: { argb: 'FF0F2A4A' } };
    tips.forEach((t, i) => {
      help.getCell(i + 3, 1).value = i + 1; help.getCell(i + 3, 1).alignment = { vertical: 'top' };
      help.getCell(i + 3, 2).value = t; help.getCell(i + 3, 2).alignment = { wrapText: true, vertical: 'top' };
    });
    const ex = tips.length + 5;
    help.getCell(ex, 2).value = 'Ejemplo de una fila bien llenada:'; help.getCell(ex, 2).font = { bold: true };
    const sample = [projects[0] ? projectLabel(projects[0]) : 'Edificio Los Pinos · Santiago de Surco', cats[0]?.name || 'Sanitarios y grifería',
      'Inodoro one piece blanco', 'Trebol', Object.values(CONDITION)[0], units[0]?.name || 'Unidad', 40, 5, 32.5, 115, '31/12/2026', 'En caja original, almacenado bajo techo'];
    IMPORT_COLS.forEach((c, i) => {
      help.getCell(ex + 1 + i, 2).value = `${c.header}: ${sample[i]}`;
    });

    downloadBlob(await wb.xlsx.writeBuffer(), 'plantilla-saldos-obrix.xlsx');
    toast('Plantilla descargada.');
  } catch (e) { fail(e); }
}

/* ---------------- lectura y revisión ---------------- */
function importDrop(ev) {
  ev.preventDefault(); ev.currentTarget.classList.remove('over');
  const file = ev.dataTransfer?.files?.[0];
  if (file) readImportFile(file);
}
function importPick(input) { const file = input.files?.[0]; input.value = ''; if (file) readImportFile(file); }

async function readImportFile(file) {
  const o = S.overlay; if (!o || o.kind !== 'import' || o.phase === 'reading') return;
  const failRead = msg => { S.overlay = { kind: 'import', phase: 'start', error: msg }; renderOverlay(); };
  if (!/\.xlsx$/i.test(file.name)) return failRead(/\.(xls|csv|ods)$/i.test(file.name)
    ? 'Ese formato no se puede leer. En Excel usa "Guardar como" y elige "Libro de Excel (.xlsx)".'
    : 'El archivo debe ser un Excel .xlsx. Usa la plantilla de Obrix.');
  if (file.size > IMPORT_MAX_BYTES) return failRead('El archivo pesa más de 2 MB. Divide tus saldos en varios archivos.');
  o.phase = 'reading'; o.error = null; renderOverlay();
  try {
    await loadExcelLib();
    let wb;
    try { wb = await openWorkbook(await file.arrayBuffer()); }
    catch (e) { return failRead('No se pudo abrir el archivo. Verifica que sea un Excel .xlsx y que no esté dañado o protegido con contraseña.'); }
    const parsed = parseImportSheet(wb);
    if (parsed.error) return failRead(parsed.error);
    S.overlay = { kind: 'import', phase: 'preview', fileName: file.name, rows: parsed.rows };
    renderOverlay();
  } catch (e) { failRead(e.message || 'No se pudo leer el archivo.'); }
}

/** Valor "plano" de una celda de ExcelJS (texto, número, fecha o null). */
function cellValue(cell) {
  let v = cell?.value;
  if (v && typeof v === 'object' && !(v instanceof Date)) {
    if ('result' in v) v = v.result;                                   // fórmula
    else if (Array.isArray(v.richText)) v = v.richText.map(t => t.text).join('');
    else if ('text' in v) v = v.text;                                  // hipervínculo
    else v = null;                                                     // error (#N/A…) u otro
    if (v && typeof v === 'object' && !(v instanceof Date)) v = null;
  }
  if (typeof v === 'string') { v = v.trim(); if (!v) v = null; }
  return v ?? null;
}

function parseImportSheet(wb) {
  const ws = wb.getWorksheet(IMPORT_SHEET) || wb.worksheets.find(w => w.state !== 'hidden' && w.name !== 'Cómo llenarla');
  if (!ws) return { error: 'El archivo no tiene la hoja "Saldos". Usa la plantilla de Obrix.' };

  // Ubica cada columna por su título (así no importa si se movió alguna).
  const pos = {};
  ws.getRow(1).eachCell((cell, col) => {
    const f = fold(cellValue(cell));
    const c = IMPORT_COLS.find(c => fold(c.header) === f);
    if (c && !(c.key in pos)) pos[c.key] = col;
  });
  const missing = IMPORT_COLS.filter(c => c.req && !(c.key in pos)).map(c => c.header);
  if (missing.length) return { error: `Faltan columnas en la fila 1: ${missing.join(', ')}. Usa la plantilla de Obrix sin cambiar los títulos.` };

  const ctx = importContext();
  const rows = [];
  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const raw = {};
    IMPORT_COLS.forEach(c => { raw[c.key] = c.key in pos ? cellValue(row.getCell(pos[c.key])) : null; });
    if (Object.values(raw).every(v => v === null)) continue;          // fila vacía
    if (rows.length >= IMPORT_MAX_ROWS) return { error: `El archivo tiene más de ${IMPORT_MAX_ROWS} saldos. Divídelo en varios archivos.` };
    rows.push(checkImportRow(r, raw, ctx));
  }
  if (!rows.length) return { error: 'La hoja "Saldos" está vacía. Llena al menos una fila debajo de los títulos.' };
  return { rows };
}

function importContext() {
  const projects = importProjects();
  const projectByKey = new Map();
  const nameCount = new Map();
  projects.forEach(p => nameCount.set(fold(p.name), (nameCount.get(fold(p.name)) || 0) + 1));
  projects.forEach(p => {
    projectByKey.set(fold(projectLabel(p)), p.id);
    if (nameCount.get(fold(p.name)) === 1) projectByKey.set(fold(p.name), p.id);   // solo el nombre, si no se repite
  });
  const categoryByKey = new Map((S.ref.categories || []).map(c => [fold(c.name), c.id]));
  const unitByKey = new Map();
  (S.ref.units || []).forEach(u => { unitByKey.set(fold(u.name), u.code); unitByKey.set(fold(u.code), u.code); });
  const conditionByKey = new Map();
  Object.entries(CONDITION).forEach(([code, label]) => { conditionByKey.set(fold(label), code); conditionByKey.set(fold(code), code); });
  conditionByKey.set(fold('Nuevo abierto'), 'NUEVO_ABIERTO'); conditionByKey.set(fold('Usado'), 'USADO_BUEN_ESTADO');
  const existing = new Map();
  (S.panel.data.listings || []).forEach(l => existing.set(l.projectId + '|' + fold(l.title), l.publicCode));
  return { projectByKey, categoryByKey, unitByKey, conditionByKey, existing, today: limaToday() };
}

/** Número desde una celda: acepta 12.5, "12,5", "1,250.50", "1.250,50" y "S/ 100". */
function parseNumber(v) {
  if (v === null) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : NaN;
  if (v instanceof Date) return NaN;
  let s = String(v).replace(/s\/\.?|\s/gi, '');
  if (s.includes(',') && s.includes('.')) {
    s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (/^\d{1,3}(,\d{3})+$/.test(s)) {
    s = s.replace(/,/g, '');                                           // 1,250 = mil doscientos cincuenta
  } else {
    s = s.replace(',', '.');
  }
  return /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : NaN;
}
const decimalsOk = (n, d) => Math.abs(n * 10 ** d - Math.round(n * 10 ** d)) < 1e-6;
const roundTo = (n, d) => Number(n.toFixed(d));

/** Fecha desde una celda → "AAAA-MM-DD", o "bad". */
function parseDate(v) {
  if (v === null) return null;
  const iso = (y, m, d) => {
    const dt = new Date(Date.UTC(+y, +m - 1, +d));
    return dt.getUTCFullYear() === +y && dt.getUTCMonth() === +m - 1 && dt.getUTCDate() === +d ? dt.toISOString().slice(0, 10) : 'bad';
  };
  if (v instanceof Date) return isNaN(v) ? 'bad' : v.toISOString().slice(0, 10);   // ExcelJS entrega las fechas en UTC
  if (typeof v === 'number') return v > 0 && v < 2958466 ? new Date(Date.UTC(1899, 11, 30) + Math.floor(v) * 86400000).toISOString().slice(0, 10) : 'bad';
  const s = String(v).trim();
  let m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (m) return iso(m[3], m[2], m[1]);
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return iso(m[1], m[2], m[3]);
  return 'bad';
}

function checkImportRow(rowNumber, raw, ctx) {
  const errors = [];
  const text = v => v === null ? '' : v instanceof Date ? v.toISOString().slice(0, 10) : String(v).trim();
  const pick = (key, map, label) => {
    const t = text(raw[key]);
    if (!t) { errors.push(`Falta ${label}.`); return null; }
    const found = map.get(fold(t));
    if (found === undefined) errors.push(`${cap(label)} "${t}" no está en la lista. Elige una opción de la lista desplegable.`);
    return found ?? null;
  };
  const number = (key, label, { req, decimals, maxInt }) => {
    const n = parseNumber(raw[key]);
    if (n === null) { if (req) errors.push(`Falta ${label}.`); return null; }
    if (Number.isNaN(n)) { errors.push(`${cap(label)} debe ser un número.`); return null; }
    if (n <= 0) { errors.push(`${cap(label)} debe ser mayor a 0.`); return null; }
    if (!decimalsOk(n, decimals)) { errors.push(`${cap(label)}: máximo ${decimals} decimales.`); return null; }
    if (Math.trunc(n).toString().length > maxInt) { errors.push(`${cap(label)} es demasiado grande.`); return null; }
    return roundTo(n, decimals);
  };
  const limited = (key, label, max, req) => {
    const t = text(raw[key]);
    if (!t) { if (req) errors.push(`Falta ${label}.`); return null; }
    if (t.length > max) errors.push(`${cap(label)}: máximo ${max} caracteres (tiene ${t.length}).`);
    return t;
  };

  const projectId = pick('project', ctx.projectByKey, 'la obra');
  const categoryId = pick('category', ctx.categoryByKey, 'la categoría');
  const title = limited('title', 'el nombre del material', 150, true);
  const brand = limited('brand', 'la marca', 80, false);
  const condition = pick('condition', ctx.conditionByKey, 'el estado');
  const unitCode = pick('unit', ctx.unitByKey, 'la unidad');
  const quantityTotal = number('quantityTotal', 'la cantidad', { req: true, decimals: 2, maxInt: 10 });
  const minOrderQuantity = number('minOrderQuantity', 'el pedido mínimo', { decimals: 2, maxInt: 10 });
  const unitWeightKg = number('unitWeightKg', 'el peso por unidad', { decimals: 3, maxInt: 7 });
  const netUnitPrice = number('netUnitPrice', 'el precio', { req: true, decimals: 2, maxInt: 8 });
  const description = limited('description', 'la descripción', 2000, false);

  let pickupDeadline = parseDate(raw.pickupDeadline);
  if (pickupDeadline === null) errors.push('Falta la fecha límite de recojo.');
  else if (pickupDeadline === 'bad') { errors.push('La fecha límite de recojo no es válida. Escríbela como 31/12/2026.'); pickupDeadline = null; }
  else if (pickupDeadline < ctx.today) errors.push(`La fecha límite de recojo (${fmtDate(pickupDeadline)}) ya pasó.`);

  if (quantityTotal && minOrderQuantity && minOrderQuantity > quantityTotal) errors.push('El pedido mínimo no puede ser mayor que la cantidad.');

  const base = { row: rowNumber, raw, titleText: title || text(raw.title) };
  if (errors.length) return { ...base, status: 'error', errors };

  const existing = ctx.existing.get(projectId + '|' + fold(title));
  const data = { projectId, categoryId, unitCode, title, description, brand, condition, quantityTotal, minOrderQuantity, netUnitPrice, unitWeightKg, pickupDeadline };
  if (existing) return { ...base, status: 'skip', existing, data };
  return { ...base, status: 'ok', data, errors: [] };
}

/* ---------------- creación ---------------- */
async function runImport() {
  const o = S.overlay; if (!o || o.phase !== 'preview') return;
  const queue = o.rows.filter(r => r.status === 'ok');
  Object.assign(o, { phase: 'creating', busy: true, done: 0, total: queue.length, stopped: null });
  renderOverlay();
  const worker = async () => {
    while (queue.length && !o.stopped) {
      const r = queue.shift();
      try {
        const l = await api(orgPath('/listings'), { method: 'POST', body: r.data });
        r.result = { ok: true, code: l.publicCode };
      } catch (e) {
        r.result = { ok: false, msg: e.message };
        if (e.status === 0) o.stopped = 'Se perdió la conexión con el servidor y la carga se detuvo. Descarga las filas que faltan y vuelve a subirlas.';
        if (e.status === 401) o.stopped = 'Tu sesión terminó y la carga se detuvo.';
      }
      o.done++;
      if (S.overlay === o) renderOverlay();
    }
  };
  await Promise.all(Array.from({ length: IMPORT_PARALLEL }, worker));
  o.phase = 'done'; o.busy = false;
  if (S.overlay === o) renderOverlay();
  refreshListingsInBackground();
}

function finishImport() {
  const created = (S.overlay?.rows || []).some(r => r.result?.ok);
  closeOverlay();
  if (!created) return;
  if (S.panel.section === 'saldos') { S.panel.filter = 'DRAFT'; render(); }
  else { S.panel.nextFilter = 'DRAFT'; goPanel('saldos'); }
}

/** Excel con las filas que faltan (con errores o que no se pudieron crear) y el motivo, listo para corregir y volver a subir. */
async function downloadImportPending() {
  const o = S.overlay; if (!o?.rows) return;
  const pending = o.rows.filter(r => r.status === 'error' || (r.status === 'ok' && o.phase === 'done' && !r.result?.ok));
  if (!pending.length) return toast('No hay filas pendientes.');
  try {
    await loadExcelLib();
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(IMPORT_SHEET, { views: [{ state: 'frozen', ySplit: 1 }] });
    ws.columns = [...IMPORT_COLS.map(c => ({ header: colHeader(c), key: c.key, width: c.width })),
      { header: 'Qué corregir', key: 'problem', width: 60 }, { header: 'Fila original', key: 'origin', width: 12 }];
    ws.getRow(1).font = { bold: true };
    ws.getColumn(colOf('pickupDeadline') + 1).numFmt = 'dd/mm/yyyy';
    pending.forEach(r => {
      const values = { ...r.raw, problem: r.status === 'error' ? r.errors.join(' ') : (r.result?.msg || 'No se intentó: la carga se detuvo.'), origin: r.row };
      const added = ws.addRow(values);
      added.getCell('problem').font = { color: { argb: 'FFB42318' } };
    });
    downloadBlob(await wb.xlsx.writeBuffer(), 'saldos-por-corregir.xlsx');
  } catch (e) { fail(e); }
}
