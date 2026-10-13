'use strict';
/* FEA Report Maker 2 - page logic.  No libraries, no internet needed. */

// ───────────────────────────── small helpers ─────────────────────────────
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const JSON_H = { 'Content-Type': 'application/json' };

function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'value') el.value = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid === null || kid === undefined || kid === false) continue;
    el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

async function api(url, opts) {
  let r;
  try { r = await fetch(url, opts); }
  catch (e) {
    if (e && e.name === 'AbortError') throw e;                // the user pressed Cancel
    throw new Error('Cannot reach the program. Is the black program window still open?');
  }
  let j = null;
  try { j = await r.json(); } catch (e) { /* not JSON */ }
  if (!r.ok) { const err = new Error((j && j.error) || `Error ${r.status}`); err.data = j; throw err; }
  return j;
}
const post = (url, body) => api(url, { method: 'POST', headers: JSON_H, body: JSON.stringify(body) });

const NUM_RE = /^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/;
const isNum = v => NUM_RE.test(String(v ?? '').trim().replace(',', '.'));
const num = v => (isNum(v) ? parseFloat(String(v).trim().replace(',', '.')) : null);
const nice = v => (v === null || v === undefined ? '' : String(v));

const ROLES = [['geometry', 'Geometry (the model)'], ['mesh', 'Mesh'], ['bc', 'Setup: loads & supports'],
               ['deformation', 'Total deformation'], ['stress', 'Von-Mises stress'],
               ['x_other', 'Another result (shear, principal, one part ...)'], ['view', 'Zoomed or cut-section picture'],
               ['x_deformation', 'Extra view: deformation'], ['x_stress', 'Extra view: stress'], ['x_bc', 'Extra view: setup'],
               ['unused', 'Not used'], ['unknown', 'Choose ...']];
const CASE_ROLES = new Set(['bc', 'deformation', 'stress', 'x_bc', 'x_deformation', 'x_stress', 'x_other', 'view']);
const STRESS_KINDS = new Set(['vm', 'max_shear', 'max_principal', 'min_principal', 'mid_principal', 'intensity', 'shear', 'normal']);
const VIEW_DEFAULT = { zoom: 'Zoomed view', section: 'Cut section' };
const KIND_LABEL = { bc: 'setup', deformation: 'deformation', stress: 'stress', other: 'other result' };
const LAYOUT_NAMES = { side: 'Side by side', stack: 'Stacked', separate: 'One per slide' };
const WORDING = [['deformation_caption', 'Caption under the deformation picture'], ['stress_caption', 'Caption under the stress picture'],
                 ['conclusion', 'Closing line (leave empty for none)']];
const BASIS_OPTIONS = [
  ['asis', 'Report it as it is', 'The peak stress is compared with the allowable stress (the template wording).'],
  ['singularity', 'The peak is a local singularity (support, sharp corner, contact edge)', 'Report the stress AWAY from the peak instead. You say where the peak is and what the stress is elsewhere.'],
  ['refine', 'No conclusion yet: the model must be refined', 'The report says the peak is mesh-dependent and no conclusion can be drawn.'],
];

// ───────────────────────────── state ─────────────────────────────
const freshBuild = () => ({ key: null, slides: [], notes: [], name: 'FEA_Report', status: 'idle', error: '', cur: 0, sig: '', pdfMethod: null,
                            running: false, again: false, promise: null, downloaded: false });
const S = {
  status: null, sid: null, took: 0, skipped: [], images: [], cover: {}, short: '', fos: 1.3, fosText: '1.3', units: '',
  mat: { rows: [], gov: 0 }, defLimit: '', showUtil: true, geometry: [], meshes: [], meshStats: {}, assumed: {}, assumeCustom: '',
  layouts: { results: 'auto', geometry: 'auto', bc: 'auto', extras: 'auto' },
  cases: [], warnings: [], checks: [], suggest: null, layoutPlan: null, missing: 'skip', manual: false, build: freshBuild(), dlBusy: false, unordered: [],
};
const STATE_KEYS = ['took', 'skipped', 'cover', 'short', 'fos', 'fosText', 'units', 'mat', 'defLimit', 'showUtil', 'geometry', 'meshes',
                    'meshStats', 'assumed', 'assumeCustom', 'layouts', 'cases', 'warnings', 'missing', 'manual', 'unordered'];

const KEY = 'fea_maker_v2';
function loadSaved() { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } }
function writeSaved(o) { try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) { /* storage not available - fine */ } }
function saveSaved() {      // remembers material + FOS (never the yield: it must be typed for every job)
  const r = S.mat.rows[0] || {}, o = loadSaved();
  writeSaved(Object.assign(o, { fos: S.fos, units: S.units, showUtil: S.showUtil, missing: S.missing,
    material: { material: r.material, item: r.item, E: r.E, nu: r.nu, rho: r.rho } }));
}
const HIST_KEYS = ['client', 'short', 'bc', 'prepared_by', 'checked_by'];
const hist = k => (loadSaved().hist || {})[k] || [];
function pushHist(entries) {   // suggestions for the next job (browser storage only)
  const o = loadSaved(); o.hist = o.hist || {};
  for (const [k, vals] of Object.entries(entries)) {
    const cur = o.hist[k] || [];
    for (const v of [].concat(vals)) { const t = String(v || '').trim(); if (t && !/\[.*\]/.test(t)) { const i = cur.indexOf(t); if (i >= 0) cur.splice(i, 1); cur.unshift(t); } }
    o.hist[k] = cur.slice(0, 40);
  }
  writeSaved(o);
}

const allowOf = row => { const y = num(row && row.yield); return (y && S.fos > 0) ? Math.floor(y / S.fos + 1e-9) : null; };
const govRow = () => S.mat.rows[S.mat.gov] || S.mat.rows[0];
const govAllow = () => allowOf(govRow());

// ───────────────────────────── overlays ─────────────────────────────
let busyTimer = null;
function busy(msg, onCancel) {
  const el = $('#busy'), cb = $('#busy-cancel'), extra = $('#busy-extra');
  clearInterval(busyTimer); busyTimer = null;
  if (!msg) { el.hidden = true; cb.hidden = true; extra.textContent = ''; return; }
  $('#busy-msg').textContent = msg; extra.textContent = '';
  cb.hidden = !onCancel; cb.onclick = onCancel || null;
  el.hidden = false;
  const t0 = Date.now();                                      // shows that the program is alive, however long it takes
  busyTimer = setInterval(() => {
    const s = Math.round((Date.now() - t0) / 1000);
    extra.textContent = s < 4 ? '' : s < 25 ? `${s} s` : `${s} s - large pictures take longer. Still working ...`;
  }, 1000);
}
function showAlert(content, kind = 'bad') {
  const a = $('#alert'); a.className = 'alert ' + kind; a.replaceChildren(content); a.hidden = false;
  a.scrollIntoView({ block: 'nearest' });
}
const hideAlert = () => { $('#alert').hidden = true; };
const ICONS = {
  refresh: '<path d="M20 12a8 8 0 1 1-2.5-5.8M20 4v5.2h-5.2"/>', expand: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  download: '<path d="M12 4v11m0 0l-4.5-4.5M12 15l4.5-4.5M5 20h14"/>', eye: '<path d="M2 12s3.7-7 10-7 10 7 10 7-3.7 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  save: '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>',
};
function ico(name) {          // small line icon (inline SVG: no font or image files needed)
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('class', 'ico'); svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = ICONS[name]; return svg;
}
function setStep(stage) { $$('#steps li').forEach(li => li.classList.toggle('on', li.dataset.stage === stage)); }
function show(stage) {
  for (const s of ['upload', 'review']) $('#s-' + s).hidden = s !== stage;
  $('#bar').hidden = stage !== 'review';
  setStep(stage);
  window.scrollTo({ top: 0 });
}
function toast(content, kind = 'ok', ms = 9000) {
  const t = h('div', { class: 'toast ' + kind, role: 'status' }, h('div', { class: 'tx' }, content),
    h('button', { class: 'x', type: 'button', 'aria-label': 'Close', onclick: () => t.remove() }, '\u2715'));
  $('#toasts').append(t);
  if (ms) setTimeout(() => t.remove(), ms);
  return t;
}
function modal(title, body, buttons) {
  const m = $('#modal');
  m.replaceChildren(h('div', { class: 'box', role: 'dialog', 'aria-modal': 'true' }, h('h3', {}, title), body,
    h('div', { class: 'btns' }, buttons.map(b => h('button', { class: b.primary ? 'primary' : 'secondary', type: 'button',
      onclick: () => { m.hidden = true; if (b.run) b.run(); } }, b.label)))));
  m.hidden = false;
}
function lightbox(url) { const lb = $('#lightbox'); $('img', lb).src = url; lb.hidden = false; }
document.addEventListener('keydown', e => { if (e.key === 'Escape') { $('#lightbox').hidden = true; $('#modal').hidden = true; } });
document.addEventListener('click', e => { if (e.target.closest('#lightbox')) $('#lightbox').hidden = true; });

// ───────────────────────────── boot + upload ─────────────────────────────
async function boot() {
  bindUpload();
  try { S.status = await api('/api/status'); }
  catch (e) { showAlert(e.message); return; }
  renderChips();
  $('#btn-example').hidden = !S.status.has_examples;
  S.missing = loadSaved().missing || S.status.settings.missing_pictures || 'skip';
  if (!S.status.ocr) {
    showAlert(h('div', {}, h('b', {}, 'Heads-up: '), S.status.ocr_message, ' ',
      h('button', { class: 'link', type: 'button', onclick: () => location.reload() }, 'Check again')), 'warn');
  }
  checkResume();
}

function renderChips() {
  const st = S.status;
  const chip = (cls, label, text) => h('span', { class: 'chip ' + cls }, h('i'), `${label}: ${text}`);
  $('#chips').replaceChildren(
    h('span', { class: 'chip ver', id: 'chip-version', title: 'Version of this program. If you do not see the version you expect, an older copy is still open.' }, 'v' + st.version),
    chip(st.ocr ? 'ok' : 'info', 'Picture reader', st.ocr ? 'ready' : 'manual mode'),
    chip('ok', 'PDF', st.pdf_method === 'libreoffice' ? 'via LibreOffice' : 'from slide pictures'));
}

function bindUpload() {
  initUpload();                                   // the upload page itself: upload.js
  $('#btn-example').addEventListener('click', loadExample);
  $('#btn-preview').addEventListener('click', () => { const c = $('#pv-card'); if (c) c.scrollIntoView({ block: 'start' }); previewNow().catch(() => {}); });
  $('#btn-pdf').addEventListener('click', () => downloadReport('pdf'));
  $('#btn-pptx').addEventListener('click', () => downloadReport('pptx'));
  if ($('#btn-save')) $('#btn-save').addEventListener('click', () => saveCurrentWork(true));
  if ($('#btn-top-save')) $('#btn-top-save').addEventListener('click', () => saveCurrentWork(true));
  if ($('#btn-aside-save')) $('#btn-aside-save').addEventListener('click', () => saveCurrentWork(true));
  if ($('#btn-new-report')) $('#btn-new-report').addEventListener('click', startNewReport);
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      saveCurrentWork(true);
    }
  });
  bindSlideBox();
}

async function loadExample() {
  const ac = new AbortController();
  busy('Reading the 9 example pictures ...', () => ac.abort());
  try { startReview(await api('/api/analyze_example', { method: 'POST', signal: ac.signal })); }
  catch (e) { if (ac.signal.aborted) showAlert('Cancelled.', 'warn'); else showAlert(e.message); }
  finally { busy(false); }
}

// ───────────────────────────── auto-save + manual save + recent files ─────────────────────────────
function snapshot() { const o = { ver: 3 }; for (const k of STATE_KEYS) o[k] = S[k]; return JSON.parse(JSON.stringify(o)); }
let saveTimer = null;

async function saveStateNow(manual = false) {
  if (!S.sid) return null;
  clearTimeout(saveTimer);
  const needsCount = $$('#s-review .need').length;
  const r = await post('/api/state', { sid: S.sid, state: snapshot(), needs_count: needsCount, manual_save: manual });
  updateSaveIndicator(r.entry || { saved_dt: r.saved_dt, status: needsCount === 0 ? 'full' : 'partial', status_label: needsCount === 0 ? 'Fully Saved' : 'Partially Saved' });
  await loadRecentFiles();
  return r;
}

function updateSaveIndicator(entry) {
  const box = $('#recent-save-state');
  if (!box || !entry) return;
  box.hidden = false;
  const isFull = entry.status === 'full';
  box.className = 'recent-save-state ' + (isFull ? 'full' : 'partial');
  box.replaceChildren(
    h('span', { class: 'rss-dot' }),
    h('span', {}, h('b', {}, isFull ? 'Fully Saved' : 'Partially Saved'), entry.saved_dt ? ` \u00b7 ${entry.saved_dt}` : '')
  );
}

function showSaveConfirmation(entry) {
  if (!entry) return;
  updateSaveIndicator(entry);
  const isFull = entry.status === 'full';
  const statusTxt = isFull ? 'Fully Completed & Saved' : (entry.stage === 'upload' ? 'Partially Saved (Upload Stage)' : `Partially Saved (${entry.needs_count || 0} item${entry.needs_count === 1 ? '' : 's'} remaining)`);
  toast(h('div', {},
    h('b', {}, `\u2713 File Saved: ${entry.title || 'Report'}`),
    h('br'),
    `Status: ${statusTxt}`,
    h('small', {}, `Saved on ${entry.saved_dt || 'just now'} \u2014 available in Recent Files on the right.`)
  ), 'ok', 6000);
}

async function saveCurrentWork(manual = true) {
  if (!$('#s-review').hidden && S.sid) {
    try {
      const r = await saveStateNow(manual);
      if (manual && r) showSaveConfirmation(r.entry);
    } catch (e) {
      if (manual) showAlert(e.message);
    }
    return;
  }
  if (!$('#s-upload').hidden && typeof U !== 'undefined' && U.items && U.items.length > 0) {
    await saveUploadDraft();
    return;
  }
  if (S.sid) {
    try {
      const r = await saveStateNow(manual);
      if (manual && r) showSaveConfirmation(r.entry);
    } catch (e) {
      if (manual) showAlert(e.message);
    }
    return;
  }
  showAlert('Please add pictures first before saving a file.', 'warn');
}

async function startNewReport() {
  if (!$('#s-review').hidden && S.sid) {
    await saveStateNow(false).catch(() => {});
  }
  S.sid = null;
  if (typeof U !== 'undefined') {
    U.items.forEach(it => URL.revokeObjectURL(it.url));
    U.items = [];
    U.sid = null;
    renderZones();
    renderList();
  }
  show('upload');
  loadRecentFiles();
}

function scheduleSave() {
  if (!S.sid || $('#s-review').hidden) return;
  markOutdated();                                          // the preview is NOT rebuilt: it only says "out of date"
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { saveStateNow(false).catch(() => {}); }, 800);
}

const ago = t => { const m = Math.max(0, Math.round((Date.now() / 1000 - t) / 60)); return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`; };

async function loadRecentFiles() {
  try {
    const r = await api('/api/recent');
    renderRecentFiles(r.items || []);
  } catch (e) { /* ignore background error */ }
}

function renderRecentFiles(items) {
  const list = $('#recent-list'), cnt = $('#recent-count');
  if (!list) return;
  if (cnt) cnt.textContent = String(items.length);
  if (!items.length) {
    list.replaceChildren(h('div', { class: 'rf-empty' },
      h('b', {}, 'No saved files yet'),
      h('p', {}, 'Press the "Save" button at any time (even if partially filled) and your file will appear here with its date and time.')));
    return;
  }
  const activeSid = !$('#s-review').hidden ? S.sid : (typeof U !== 'undefined' ? U.sid : null);
  list.replaceChildren(...items.map(it => {
    const isFull = it.status === 'full';
    const isActive = activeSid === it.sid;
    const statusBadge = h('span', { class: 'rf-status ' + (isFull ? 'full' : 'partial') },
      isFull ? '\u2713 Fully Saved' : '\u25d0 Partially Saved');
    const detailText = isFull
      ? 'All fields complete'
      : (it.stage === 'upload' ? 'Upload draft (pictures added)' : `${it.needs_count} field${it.needs_count === 1 ? '' : 's'} left to fill`);
    const thumbEl = it.thumb_url
      ? h('img', { class: 'rf-thumb', src: it.thumb_url, alt: '' })
      : h('div', { class: 'rf-thumb empty' }, 'FEA');

    return h('div', { class: 'rf-item' + (isActive ? ' active' : ''), onclick: () => openRecentFile(it.sid) },
      h('div', { class: 'rf-top' },
        thumbEl,
        h('div', { class: 'rf-info' },
          h('div', { class: 'rf-title-row' },
            h('b', { class: 'rf-title', title: it.title }, it.title || 'Unnamed Report'),
            isActive ? h('span', { class: 'rf-current' }, 'Open') : null
          ),
          it.subtitle ? h('div', { class: 'rf-sub', title: it.subtitle }, it.subtitle) : null,
          h('div', { class: 'rf-meta' }, `${it.pictures} picture${it.pictures !== 1 ? 's' : ''}${it.cases_count ? ` \u00b7 ${it.cases_count} case${it.cases_count !== 1 ? 's' : ''}` : ''}`)
        ),
        h('button', { class: 'rf-del', type: 'button', title: 'Delete this saved file', onclick: e => { e.stopPropagation(); deleteRecentFile(it.sid, it.title); } }, '\u2715')
      ),
      h('div', { class: 'rf-badges' },
        statusBadge,
        h('span', { class: 'rf-detail' }, detailText)
      ),
      h('div', { class: 'rf-datetime' },
        h('span', { class: 'rf-dt-main' }, `\ud83d\udcc5 ${it.saved_dt || ''}`),
        h('span', { class: 'rf-ago' }, ago(it.saved_at))
      ),
      h('div', { class: 'rf-actions' },
        h('button', { class: isActive ? 'secondary rf-open' : 'primary rf-open', type: 'button', onclick: e => { e.stopPropagation(); openRecentFile(it.sid); } },
          isActive ? 'Currently Open' : (isFull ? 'Open Complete File' : 'Continue Editing'))
      )
    );
  }));
}

async function openRecentFile(sid) {
  try {
    if (!$('#s-review').hidden && S.sid && S.sid !== sid) {
      await saveStateNow(false).catch(() => {});
    }
    busy('Opening saved file ...');
    const r = await api(`/api/session/${sid}`);
    busy(false);
    if (!r.found) { showAlert('That saved file could not be found.'); return; }
    if (r.stage === 'upload') {
      await restoreUploadDraft(r);
      if (r.entry) updateSaveIndicator(r.entry);
    } else {
      resume(r);
      if (r.entry) updateSaveIndicator(r.entry);
      await loadRecentFiles();
    }
  } catch (e) {
    busy(false);
    showAlert(e.message);
  }
}

async function deleteRecentFile(sid, title) {
  await post('/api/discard', { sid }).catch(() => {});
  if (S.sid === sid) {
    const box = $('#recent-save-state');
    if (box) box.hidden = true;
  }
  if (typeof U !== 'undefined' && U.sid === sid) U.sid = null;
  await loadRecentFiles();
  const resEl = $('#resume');
  if (resEl) resEl.replaceChildren();
  toast(`Removed "${title || 'Saved file'}" from Recent Files.`, 'info', 4000);
}

async function checkResume() {
  await loadRecentFiles();
  try {
    const r = await api('/api/last');
    if (!r.found || !r.state || ![2, 3].includes(r.state.ver)) return;
    const statusBadge = r.status === 'full' ? 'Fully Saved' : 'Partially Saved';
    $('#resume').replaceChildren(h('div', { class: 'resume' },
      h('div', { class: 'grow' }, h('b', {}, 'Continue your last saved report?'), h('br'),
        h('span', {}, `${r.title || 'Unnamed report'}  \u00b7  ${statusBadge}  \u00b7  ${r.pictures} pictures  \u00b7  ${r.saved_dt || ('saved ' + ago(r.saved_at))}`)),
      h('button', { class: 'primary', type: 'button', onclick: () => resume(r) }, 'Continue'),
      h('button', { class: 'secondary', type: 'button', onclick: async () => { await deleteRecentFile(r.sid, r.title); } }, 'Discard')));
  } catch (e) { /* nothing to resume */ }
}
function resume(r) {
  hideAlert();
  S.sid = r.sid; S.images = r.images;
  for (const k of STATE_KEYS) if (r.state[k] !== undefined) S[k] = r.state[k];
  S.cases.forEach(c => { c.more = c.more || []; c.views = c.views || []; });
  S.unordered = S.unordered || [];
  S.checks = []; S.suggest = null; S.layoutPlan = null; S.build = freshBuild(); S.missing = r.state.missing || S.missing;
  $('#resume').replaceChildren();
  show('review'); renderReview(); scheduleDerive(); setTimeout(() => buildNow().catch(() => {}), 60);
  loadRecentFiles();
}

// ───────────────────────────── start the review ─────────────────────────────
function newCase(dc) {
  return Object.assign({}, dc, {
    def_max: nice(dc.def_max), stress_max: nice(dc.stress_max), notes: [], texts: {}, dirty: {}, obs: [], exceeds: null, tier: null,
    needsBasis: false, bc_items: dc.bc_items.slice(), bc_legend: (dc.bc_legend || []).slice(),
    basis: '', sing_loc: '', stress_away: '', loc_stress: '', loc_def: '', react_applied: '', react_sum: '', layout: '', bc_layout: '',
    extras: (dc.extras || []).map(e => Object.assign({}, e, { caption: '' })),
    more: (dc.more || []).map(m => Object.assign({}, m, { max: nice(m.max), min: nice(m.min), allow: '', caption_edit: '', auto_caption: '', tier: null })),
    views: (dc.views || []).map(v => Object.assign({}, v, { slide_label: '' })),
  });
}

function startReview(r) {
  hideAlert();
  Object.assign(S, { sid: r.sid, took: r.took, skipped: r.skipped || [], images: r.images, warnings: r.warnings, checks: [], suggest: null,
                     layoutPlan: null, build: freshBuild(), manual: !!r.manual });
  S.cover = { title: r.cover.title, report_no: r.cover.report_no, date: r.cover.date, client: r.cover.client,
              revision: '', prepared_by: '', checked_by: '', ref: '' };
  S.short = r.cover.short;
  const st = S.status.settings, saved = loadSaved();
  S.fos = saved.fos || st.fos; S.fosText = String(S.fos); S.units = saved.units || st.units;
  S.showUtil = saved.showUtil !== undefined ? saved.showUtil : st.show_utilisation;
  const m = Object.assign({}, st.material, saved.material || {});
  S.mat = { rows: [{ material: m.material, item: m.item, E: m.E, nu: m.nu, rho: m.rho, yield: '' }], gov: 0 };
  S.defLimit = '';
  S.meshStats = { type: '', elements: '', nodes: '', size: '', skew_avg: '', skew_max: '', oq_min: '' };
  S.assumed = {}; S.assumeCustom = '';
  S.layouts = { results: 'auto', geometry: 'auto', bc: 'auto', extras: 'auto' };
  S.geometry = r.geometry.map(g => ({ id: g.id, heading: g.heading, caption: '' }));
  S.meshes = r.meshes.map(g => ({ id: g.id, heading: g.heading, caption: '' }));
  S.cases = r.cases.map(newCase);
  S.unordered = r.unordered || [];
  show('review');
  renderReview();
  scheduleDerive();
  saveStateNow(false).catch(() => {});
  setTimeout(() => buildNow().catch(() => {}), 60);                 // the preview appears by itself, nobody has to ask for it
}

// ───────────────────────────── review page ─────────────────────────────
function card(num, title, sub, ...body) {
  return h('section', { class: 'card' }, h('h2', {}, num ? h('span', { class: 'num' }, num) : null, title),
    sub ? h('p', { class: 'sub' }, sub) : null, ...body);
}

function thumb(id, cls = 'thumb', w = 240) {
  if (id === null || id === undefined) return h('div', { class: cls + ' missing' }, 'none');
  const url = `/api/img/${S.sid}/${id}`;
  const im = h('img', { class: cls, src: `${url}?w=${w}`, alt: '', title: 'Click to enlarge' });
  im.addEventListener('click', () => lightbox(url));
  return im;
}

function evid(id, kind, caption, w = 300) {
  if (id === null || id === undefined) return null;
  const im = h('img', { src: `/api/crop/${S.sid}/${id}/${kind}?w=${w}`, alt: caption, title: 'Click to enlarge' });
  im.addEventListener('click', () => lightbox(`/api/crop/${S.sid}/${id}/${kind}?w=900`));
  return h('figure', { class: 'evid' }, im, h('figcaption', {}, caption));
}

function inp(obj, key, o = {}) {
  const el = h('input', { type: 'text', value: nice(obj[key]), placeholder: o.ph, 'data-need': o.need, 'data-label': o.label,
                          'data-casename': o.casename, 'aria-label': o.label, list: o.list });
  el.addEventListener('input', () => { obj[key] = el.value; if (o.onchange) o.onchange(el); updateNeeds(); });
  return el;
}
function field(label, obj, key, o = {}) {
  return h('label', { class: 'f ' + (o.span || '') }, h('span', {}, label, o.optional ? h('span', { class: 'opt' }, '  (optional)') : null),
    inp(obj, key, Object.assign({ label }, o)), o.hint ? h('small', {}, o.hint) : null);
}

function readSummary(i) {
  const bits = [];
  if (['deformation', 'stress', 'x_deformation', 'x_stress', 'x_other'].includes(i.role))
    bits.push(i.max !== null && i.max !== undefined ? `Max ${i.max} ${i.unit || ''}` : 'Max not read');
  if (i.role === 'x_other' && i.result_kind) bits.push(i.result_kind);
  if (i.role === 'bc' || i.role === 'x_bc') bits.push(`${i.bc_legend.length} load / support entries`);
  if (i.role === 'geometry') bits.push(i.z_dir === 'up' ? 'Z axis points up: top view' : i.z_dir === 'down' ? 'Z axis points down: bottom view' : 'view direction unknown');
  if (i.role === 'mesh') bits.push('mesh pattern');
  if (i.letter) bits.push(`ANSYS case ${i.letter}`);
  if (i.confidence === 'medium' && ['geometry', 'mesh'].includes(i.role)) bits.push('no ANSYS title: told apart by how the picture looks');
  if (i.dup_of !== null && i.dup_of !== undefined) bits.push('same picture as another one: used once');
  if (i.role === 'x_other') bits.push(i.scope ? `part: ${i.scope}` : 'whole model');
  if (i.role === 'view') {
    bits.push(i.view_kind === 'section' ? 'cut section' : i.view_kind === 'zoom' ? 'zoomed view' : 'detail view (kind not clear)');
    const par = S.images.find(x => x.id === i.parent_id);
    bits.push(par ? `belongs to ${par.name}${i.parent_conf === 'guess' ? ' (my guess: check it)' : ''}` : 'belongs to no plot yet');
  }
  return bits.join('  \u00b7  ');
}

function renderReview() {
  const root = $('#s-review');
  const parts = [introCard(), orderCard(), previewCard(), checksCard(), picturesCard(), coverCard(), materialCard(), layoutCard(), geometryCard(), assumptionsCard()];
  if (S.cases.length) S.cases.forEach((c, k) => parts.push(caseCard(c, k)));
  else parts.push(card('7', 'Load cases', 'No load case found. Use the pictures table above to say which pictures are setup, deformation and stress pictures.'));
  const dl = h('div', { hidden: true });
  for (const k of HIST_KEYS) dl.append(h('datalist', { id: 'dl-' + k }, hist(k).map(v => h('option', { value: v }))));
  parts.push(dl);
  root.replaceChildren(...parts.filter(Boolean));              // (orderCard() is null when the order of the cases is clear)
  renderChecks(); renderVerdicts(); renderHint(); refreshAllowable(); renderLayoutCard(); renderBasisBoxes(); refreshMoreStatus(); updateNeeds(); renderPreview();
}

function introCard() {
  return h('section', { class: 'card intro' },
    h('h2', {}, `I read ${S.images.length} picture${S.images.length > 1 ? 's' : ''} in ${S.took} s. Here is the first draft.`),
    h('p', {}, 'The preview below is your real report. It does not change while you type: press ', h('b', {}, 'Preview'), ' to update it. ', h('span', { class: 'need-legend' }, 'Yellow boxes'),
      ' need your input, but nothing blocks you: you can download at any time, and whatever is not filled in appears as [text in brackets] in the report. ',
      h('button', { class: 'link', type: 'button', onclick: () => { show('upload'); } }, 'Use other pictures')),
    S.manual ? h('p', { class: 'manual-note' }, h('b', {}, 'Manual mode: '),
      'the picture reader is not installed, so the pictures were sorted by their file names and the numbers are left for you to type.') : null);
}

function checksCard() {
  return h('section', { class: 'card', id: 'checks-card' }, h('h2', {}, 'Checks'),
    h('p', { class: 'sub' }, 'Things I noticed while reading the pictures. They update as you type.'), h('ul', { class: 'checks', id: 'checks' }));
}

function renderChecks() {
  const ul = $('#checks'); if (!ul) return;
  const items = [...S.warnings, ...S.checks, ...localChecks()];
  const order = { bad: 0, warn: 1, info: 2, ok: 3 }, icon = { bad: '\u2716', warn: '!', info: 'i', ok: '\u2713' };
  items.sort((a, b) => order[a.level] - order[b.level]);
  if (!items.length) items.push({ level: 'ok', text: 'Nothing unusual found.' });
  ul.replaceChildren(...items.map(it => h('li', { class: it.level }, h('b', {}, icon[it.level]), h('span', {}, it.text))));
}

function localChecks() {
  const out = [];
  const names = S.cases.map(c => (c.name || '').trim().toLowerCase());
  if (names.some((n, i) => names.indexOf(n) !== i))
    out.push({ level: 'warn', text: 'Two load cases have the same name. Give every case its own name (what is different between them?).' });
  S.skipped.forEach(f => out.push({ level: 'info', text: `Skipped (not a picture file): ${f}` }));
  return out;
}

// ----- pictures table
const prettyKind = t => String(t || '').replace('Von-mises', 'Von-Mises');
function touch(img, field, value) { img[field] = value; (img._t = img._t || {})[field] = true; }          // only what the engineer changed is sent back
const assignOf = img => { const a = { id: img.id, role: img.role, case: img.case }; for (const f of Object.keys(img._t || {})) a[f] = img[f]; return a; };

function plotChoices(onlyCase) {                                      // every result plot that can carry zoomed / section pictures
  const out = [];
  for (const c of S.cases) {
    if (onlyCase !== undefined && c.n !== onlyCase) continue;
    if (c.def_id !== null && c.def_id !== undefined) out.push({ id: c.def_id, text: `Case ${c.n}: Total deformation` });
    if (c.stress_id !== null && c.stress_id !== undefined) out.push({ id: c.stress_id, text: `Case ${c.n}: Von-Mises stress` });
    for (const m of c.more || []) out.push({ id: m.id, text: `Case ${c.n}: ${m.scope ? m.scope + ' \u2013 ' : ''}${prettyKind(m.heading)}` });
  }
  return out;
}

function optSelect(label, options, current, onchange, cls = 'sub-sel') {
  const sel = h('select', { class: cls, 'aria-label': label }, options.map(([v, t]) => h('option', { value: v, selected: String(v) === String(current ?? '') }, t)));
  sel.addEventListener('change', () => onchange(sel.value));
  return sel;
}

function picturesCard() {
  const rows = S.images.map(img => {
    const role = h('select', { class: 'sel', 'data-need': 'role', 'data-label': `What is ${img.name}`, 'aria-label': `What is ${img.name}` },
      ROLES.filter(r => r[0] !== 'unknown' || img.role === 'unknown').map(([v, t]) => h('option', { value: v, selected: v === img.role }, t)));
    const isCase = CASE_ROLES.has(img.role), isView = img.role === 'view';
    const cs = h('select', { class: 'cs', disabled: !isCase, 'data-need': isCase && !isView ? 'req' : null, 'data-label': `Load case of ${img.name}`, 'aria-label': `Load case of ${img.name}` },
      isCase && !img.case ? h('option', { value: '', selected: true }, isView ? 'Same as its plot' : 'Choose ...') : null,
      Array.from({ length: 12 }, (_, i) => i + 1).map(n => h('option', { value: n, selected: n === img.case }, 'Case ' + n)));
    role.addEventListener('change', () => { img.role = role.value; if (CASE_ROLES.has(img.role) && img.role !== 'view' && !img.case) img.case = 1; regroup(); });
    cs.addEventListener('change', () => { img.case = cs.value ? parseInt(cs.value, 10) : null; regroup(); });
    const extra = [];
    if (img.role === 'x_other') {
      extra.push(h('label', { class: 'sub' }, h('span', {}, 'Which result?'),
        optSelect(`Which result is ${img.name}`, RESULT_OPTIONS, img.kind, v => { touch(img, 'kind', v); regroup(); })));
      const sc = h('input', { type: 'text', value: nice(img.scope), placeholder: 'part, e.g. Shaft (empty = whole model)', 'aria-label': `Part shown in ${img.name}` });
      sc.addEventListener('change', () => { touch(img, 'scope', sc.value.trim()); regroup(); });
      extra.push(h('label', { class: 'sub' }, h('span', {}, 'Which part?'), sc));
    }
    if (isView) {
      extra.push(h('label', { class: 'sub' }, h('span', {}, 'Kind of picture'),
        optSelect(`Kind of picture ${img.name}`, VIEW_OPTIONS, img.view_kind, v => { touch(img, 'view_kind', v); regroup(); })));
      extra.push(h('label', { class: 'sub' }, h('span', {}, 'Belongs to'),
        optSelect(`Which plot does ${img.name} belong to`, [['', 'Choose the plot ...'], ...plotChoices().map(p => [p.id, p.text])], img.parent_id,
          v => { touch(img, 'parent_id', v === '' ? null : parseInt(v, 10)); regroup(); }, 'sub-sel parent')));
    }
    const attn = img.notes.length || img.confidence === 'low' || img.role === 'unknown' || (isView && (img.parent_id === null || img.parent_id === undefined));
    const why = img.why ? h('div', { class: 'why' }, 'Why: ', img.why) : null;
    return h('tr', { class: attn ? 'attn' : '' }, h('td', {}, thumb(img.id)), h('td', { class: 'fn' }, img.name, img.label ? h('small', {}, `your name: ${img.label}`) : null),
      h('td', {}, role, ...extra), h('td', {}, cs), h('td', { class: 'read' }, readSummary(img), why,
        ...img.notes.map(n => h('div', { class: 'pnote' }, n))));
  });
  return card('1', 'Pictures', 'I looked at every picture and sorted it like this (the grey line says why). If one is wrong, change it here and the draft is rebuilt. A zoomed or cut-section picture belongs to a plot and goes on that plot\'s slide; another result (shear, principal, one part) gets its own slide.',
    h('div', { class: 'scroll' }, h('table', { class: 'pics' },
      h('thead', {}, h('tr', {}, ['', 'File', 'What is it?', 'Load case', 'What I read'].map(t => h('th', {}, t)))), h('tbody', {}, rows))));
}

// ----- the load cases could not be put in order: the engineer decides
function orderCard() {
  const gs = S.unordered || [];
  if (!gs.length) return null;
  const imgOf = id => S.images.find(x => x.id === id);
  const caseOf = g => { const i = g.ids.map(imgOf).find(x => x && CASE_ROLES.has(x.role) && x.role !== 'view'); return i ? i.case : null; };
  if (gs.every(g => g.ids.map(imgOf).filter(x => x && CASE_ROLES.has(x.role)).every(x => x.case))) return null;
  const rows = gs.map(g => {
    const sel = h('select', { class: 'cs', 'data-need': 'req', 'data-label': `Which load case is system ${g.letter || ''}`, 'aria-label': `Load case of system ${g.letter || ''}` },
      !caseOf(g) ? h('option', { value: '', selected: true }, 'Choose ...') : null,
      Array.from({ length: Math.max(gs.length, 2) + 1 }, (_, i) => i + 1).map(n => h('option', { value: n, selected: n === caseOf(g) }, 'Case ' + n)));
    sel.addEventListener('change', () => {
      const n = sel.value ? parseInt(sel.value, 10) : null;
      g.ids.map(imgOf).forEach(i => { if (i && CASE_ROLES.has(i.role)) i.case = n; });
      regroup();
    });
    return h('div', { class: 'og' }, h('div', { class: 'ogp' }, g.ids.slice(0, 4).map(id => thumb(id, 'thumb', 150))),
      h('div', { class: 'ogt' }, h('b', {}, `ANSYS system ${g.letter || '?'}`), h('small', {}, g.model || ''), h('small', {}, `Loads: ${(g.loads || []).join(', ') || 'not read'}`)),
      h('label', { class: 'f' }, h('span', {}, 'This group is'), sel));
  });
  return h('section', { class: 'card order', id: 'order-card' }, h('h2', {}, h('span', { class: 'num' }, '!'), 'Which load case is which?'),
    h('p', { class: 'sub' }, 'The pictures come from different ANSYS systems and the loads do not show which one is Case 1, so I did not guess. Please choose the case number of every group. The slides follow your numbers.'),
    ...rows);
}

// ----- report details
function coverCard() {
  return card('2', 'Report details', 'Shown on the cover page and used in the sentences.',
    h('div', { class: 'grid' },
      field('Report title', S.cover, 'title', { span: 'span2', need: 'title', hint: 'Made from the ANSYS model name: check it' }),
      field('Report number', S.cover, 'report_no', { need: 'req', hint: 'From the job number in the model name' }),
      field('Date', S.cover, 'date', { need: 'req' }),
      field('Client', S.cover, 'client', { span: 'span2', need: 'req', list: 'dl-client' }),
      field('Short name of the structure', S, 'short', { span: 'span2', need: 'req', onchange: scheduleDerive, list: 'dl-short',
        hint: 'Used in sentences such as "Total deformation in the ____ is ..."' })),
    h('p', { class: 'sublabel' }, 'Sign-off (printed on the cover only if filled in)'),
    h('div', { class: 'grid' },
      field('Revision', S.cover, 'revision', { optional: true }), field('Prepared by', S.cover, 'prepared_by', { optional: true, list: 'dl-prepared_by' }),
      field('Checked by', S.cover, 'checked_by', { optional: true, list: 'dl-checked_by' }), field('Drawing / model reference', S.cover, 'ref', { optional: true })));
}

// ----- material
function materialCard() {
  const wrap = h('div', { class: 'scroll', id: 'mat-wrap' });
  const fosEl = h('input', { type: 'text', value: S.fosText, 'data-need': 'num', 'data-label': 'Factor of safety (FOS)', style: 'width:90px', 'aria-label': 'FOS' });
  fosEl.addEventListener('input', () => {
    S.fosText = fosEl.value; const v = num(fosEl.value); if (v && v > 0) S.fos = v; refreshAllowable(); updateNeeds();
  });
  const limEl = h('input', { type: 'text', value: S.defLimit, style: 'width:100px', 'aria-label': 'Allowable deformation', placeholder: 'none', 'data-need': 'optnum', 'data-label': 'Allowable deformation' });
  limEl.addEventListener('input', () => { S.defLimit = limEl.value; scheduleDerive(); updateNeeds(); });
  const utilEl = h('input', { type: 'checkbox', checked: S.showUtil, 'aria-label': 'Show utilisation' });
  utilEl.addEventListener('change', () => { S.showUtil = utilEl.checked; scheduleDerive(); scheduleSave(); });
  const unitsEl = h('input', { type: 'text', value: S.units, 'data-need': 'req', 'data-label': 'Units line', 'aria-label': 'Units line' });
  unitsEl.addEventListener('input', () => { S.units = unitsEl.value; updateNeeds(); });
  const c = card('3', 'Material & acceptance criteria', 'Allowable stress = Yield stress \u00f7 FOS, rounded down (the formula on the material page of your template).',
    wrap,
    h('div', { class: 'rowtools' },
      h('button', { class: 'link', type: 'button', onclick: addMaterialRow }, '+ Add another material'),
      h('label', { class: 'unit' }, h('span', {}, 'Factor of safety (FOS)'), fosEl)),
    h('div', { class: 'hintbox', id: 'yield-hint', hidden: true }),
    h('div', { class: 'rowtools' },
      h('label', { class: 'unit' }, h('span', {}, 'Allowable deformation'), limEl, h('em', {}, 'mm  (optional)')),
      h('label', { class: 'chk' }, utilEl, 'Show utilisation (stress \u00f7 allowable) in the sentences')),
    h('label', { class: 'f', style: 'margin-top:14px;display:block' }, h('span', {}, 'Units line on the material page'), unitsEl));
  renderMaterialTable(wrap);
  return c;
}

function renderMaterialTable(wrap) {
  wrap = wrap || $('#mat-wrap');
  const head = S.status.settings.material_header, multi = S.mat.rows.length > 1;
  const th = t => h('th', {}, t.split('\n').flatMap((p, k) => (k ? [h('br'), p] : [p])));
  const keys = ['material', 'item', 'E', 'nu', 'rho', 'yield'];
  const body = S.mat.rows.map((r, idx) => {
    const cells = keys.map(k => {
      const el = h('input', { type: 'text', value: nice(r[k]), 'data-need': k === 'yield' ? 'num' : 'req', 'data-label': k === 'yield' ? 'Yield stress' : `Material: ${k}`,
                              'data-yield': k === 'yield' ? idx : null, placeholder: k === 'yield' ? 'type it' : null, 'aria-label': k });
      el.addEventListener('input', () => { r[k] = el.value; if (k === 'yield') refreshAllowable(); else scheduleDerive(); updateNeeds(); });
      return h('td', {}, el);
    });
    return h('tr', {}, ...cells, h('td', { class: 'auto', 'data-allow': idx }, '\u2013'),
      multi ? h('td', { class: 'gov' }, h('input', { type: 'radio', name: 'gov', checked: idx === S.mat.gov, title: 'Use this material for the pass / fail checks',
        onchange: () => { S.mat.gov = idx; refreshAllowable(); } })) : null,
      multi ? h('td', {}, h('button', { class: 'icon', type: 'button', title: 'Remove this row', onclick: () => {
        S.mat.rows.splice(idx, 1); S.mat.gov = Math.min(S.mat.gov, S.mat.rows.length - 1); renderMaterialTable(); refreshAllowable(); updateNeeds(); } }, '\u2715')) : null);
  });
  wrap.replaceChildren(h('table', { class: 'mat' },
    h('thead', {}, h('tr', {}, head.map(th), multi ? h('th', { class: 'gov' }, 'Used for checks') : null, multi ? h('th') : null)), h('tbody', {}, body)));
}

function addPartRow(part) {                       // one more material row for a part (Shaft, Dowel pin ...): its results then use ITS allowable
  const r0 = S.mat.rows[0] || {};
  if (!S.mat.rows.some(r => String(r.item || '').trim().toLowerCase() === String(part).toLowerCase()))
    S.mat.rows.push({ material: '', item: part, E: r0.E || '', nu: r0.nu || '', rho: r0.rho || '', yield: '' });
  renderMaterialTable(); refreshAllowable(); updateNeeds();
  const w = $('#mat-wrap'); if (w) w.scrollIntoView({ block: 'center' });
  const el = $$('#mat-wrap input[data-yield]').pop(); if (el) el.focus();
}

function addMaterialRow() {
  const r0 = S.mat.rows[0] || {};
  S.mat.rows.push({ material: r0.material || '', item: r0.item || '', E: r0.E || '', nu: r0.nu || '', rho: r0.rho || '', yield: '' });
  renderMaterialTable(); refreshAllowable(); updateNeeds();
}

function refreshAllowable() {
  $$('[data-allow]').forEach(td => { const a = allowOf(S.mat.rows[+td.dataset.allow]); td.textContent = a === null ? '\u2013' : a; });
  renderHint(); scheduleDerive();
}

function renderHint() {
  const box = $('#yield-hint'); if (!box) return;
  const sg = S.suggest;
  box.hidden = !sg; if (!sg) return;
  const row = govRow(), a = allowOf(row);
  if (a !== null && Math.abs(a - sg.allowable) <= 0.5) {
    box.className = 'hintbox okk';
    box.replaceChildren(`\u2713 Your yield stress gives an allowable of ${a} MPa: the same value the stress-picture legends are set to.`);
  } else {
    box.className = 'hintbox';
    box.replaceChildren(h('span', {}, h('b', {}, 'Tip: '), `the stress pictures use ${sg.allowable} MPa as the start of the top colour band. With FOS ${S.fos} that fits a yield stress of ${sg.yield} MPa.`),
      h('button', { type: 'button', onclick: () => {
        row.yield = String(sg.yield); const el = $(`[data-yield="${S.mat.rows.indexOf(row)}"]`); if (el) el.value = row.yield;
        refreshAllowable(); updateNeeds(); } }, `Use ${sg.yield} MPa`));
  }
}

// ----- layout (big / wide models)
function layoutCard() {
  return h('section', { class: 'card', id: 'layout-card' }, h('h2', {}, h('span', { class: 'num' }, '4'), 'Picture layout'),
    h('p', { class: 'sub' }, 'Big or wide models make the pictures small when two share a slide. The numbers show how large the text INSIDE your screenshots (legend, axes) will be on the slide. The template standard is about 5.5 pt.'),
    h('div', { id: 'layout-body' }));
}

function modeChip(p, m) {
  const o = p.options[m]; if (!o) return null;
  return h('span', { class: 'chipk ' + (o.pt >= p.thr ? 'good' : 'low') + (m === p.effective ? ' pick' : '') }, `${LAYOUT_NAMES[m]}: ${o.pt} pt`);
}

function renderLayoutCard() {
  const body = $('#layout-body'); if (!body) return;
  if (body.contains(document.activeElement) && document.activeElement.tagName === 'SELECT') return;
  const pl = S.layoutPlan;
  if (!pl) { body.replaceChildren(h('p', { class: 'sub' }, 'Calculating ...')); return; }
  const rows = [];
  const mk = (key, label, modes) => {
    const p = pl[key]; if (!p) return;
    const sel = h('select', { 'aria-label': label },
      h('option', { value: 'auto', selected: S.layouts[key] === 'auto' }, `Auto (recommended): ${LAYOUT_NAMES[p.auto]}`),
      modes.map(m => h('option', { value: m, selected: S.layouts[key] === m }, LAYOUT_NAMES[m])));
    sel.addEventListener('change', () => { S.layouts[key] = sel.value; scheduleDerive(); scheduleSave(); });
    rows.push(h('tr', {}, h('td', {}, label), h('td', {}, sel), h('td', { class: 'pt' }, modes.map(m => modeChip(p, m)))));
  };
  mk('results', 'Deformation + stress plots', ['side', 'stack', 'separate']);
  mk('bc', 'Setup picture + list', ['side', 'stack']);
  if (S.geometry.length > 1 || S.meshes.length > 1) mk('geometry', 'Geometry / mesh views', ['side', 'stack', 'separate']);
  if (pl.extras) mk('extras', 'Additional views', ['side', 'stack', 'separate']);
  const parts = [h('div', { class: 'scroll' }, h('table', { class: 'lay' }, h('thead', {}, h('tr', {}, ['Which pictures', 'Layout', 'Text size on the slide'].map(t => h('th', {}, t)))), h('tbody', {}, rows)))];
  if (S.cases.length > 1 && pl.results) {
    const crow = S.cases.map(c => {
      const e = pl.cases[String(c.n)] || {};
      const mkSel = (field, modes, label, cur) => {
        const sel = h('select', { 'aria-label': `${label} of case ${c.n}` }, h('option', { value: '', selected: !cur }, 'Same as above'),
          modes.map(m => h('option', { value: m, selected: cur === m }, LAYOUT_NAMES[m])));
        sel.addEventListener('change', () => { c[field] = sel.value; scheduleDerive(); scheduleSave(); });
        return sel;
      };
      if (e.views) return h('tr', {}, h('td', {}, `Case ${c.n}`), h('td', { colspan: 3, class: 'pt' }, 'Every plot has its own slide, with its zoomed / section pictures on it.'));
      return h('tr', {}, h('td', {}, `Case ${c.n}`), h('td', {}, mkSel('layout', ['side', 'stack', 'separate'], 'Result plots', c.layout)),
        h('td', {}, mkSel('bc_layout', ['side', 'stack'], 'Setup picture', c.bc_layout)),
        h('td', { class: 'pt' }, e.results ? ['side', 'stack', 'separate'].map(m => h('span', { class: 'chipk ' + (e.results[m].pt >= pl.results.thr ? 'good' : 'low') }, `${LAYOUT_NAMES[m]}: ${e.results[m].pt} pt`)) : null));
    });
    parts.push(h('details', { class: 'wording' }, h('summary', {}, 'A different layout for one load case (optional)'),
      h('div', { class: 'in' }, h('div', { class: 'scroll' }, h('table', { class: 'lay' }, h('thead', {}, h('tr', {}, ['', 'Result plots', 'Setup picture', 'Predicted text size'].map(t => h('th', {}, t)))), h('tbody', {}, crow))))));
  }
  body.replaceChildren(...parts);
}

// ----- geometry & mesh
function viewRow(v, k, n, label) {
  return h('div', { class: 'view' }, thumb(v.id, 'thumb big', 320),
    n > 1 ? h('div', { class: 'f' }, field(`Heading of ${label} ${k + 1}`, v, 'heading', { need: 'bracket', hint: k === 0 && label === 'view' ? 'Taken from the axis arrows in the picture' : null }),
      field('Caption', v, 'caption', { optional: true }))
          : h('div', { class: 'f' }, h('span', {}, label === 'view' ? 'Geometry' : 'Mesh'), h('small', {}, 'One picture: it gets its own slide.'),
              field('Caption', v, 'caption', { optional: true })));
}

function geometryCard() {
  const geo = S.geometry.map((g, k) => viewRow(g, k, S.geometry.length, 'view'));
  const mesh = S.meshes.map((g, k) => viewRow(g, k, S.meshes.length, 'mesh view'));
  const ms = S.meshStats;
  const mf = (label, key, hint) => h('label', { class: 'f' }, h('span', {}, label), inp(ms, key, { label, onchange: scheduleDerive }), hint ? h('small', {}, hint) : null);
  return card('5', 'Geometry & mesh', 'One slide each (two views are placed side by side). Section views of the model or of the mesh are just more views: give each a heading that says where the cut is.',
    geo.length ? h('div', { class: 'sublabel' }, 'Geometry') : null, geo.length ? h('div', { class: 'views' }, ...geo) : h('p', { class: 'hint' }, 'No geometry picture: that slide is simply left out. (Assign one in the pictures table if you have it.)'),
    h('div', { class: 'sublabel' }, 'Mesh'), mesh.length ? h('div', { class: 'views' }, ...mesh) : h('p', { class: 'hint' }, 'No mesh picture: that slide is simply left out. (Assign one in the pictures table if you have it.)'),
    h('details', { class: 'wording' }, h('summary', {}, 'Mesh statistics (optional): element count and quality, printed under the mesh picture'),
      h('div', { class: 'in' }, h('div', { class: 'mini-grid' },
        mf('Element type', 'type', 'e.g. SOLID187'), mf('Elements', 'elements'), mf('Nodes', 'nodes'), mf('Element size (mm)', 'size'),
        mf('Average skewness', 'skew_avg'), mf('Maximum skewness', 'skew_max', 'ANSYS: >= 0.9 is "bad"'), mf('Min. orthogonal quality', 'oq_min', 'ANSYS: keep above 0.1')),
        h('small', { class: 'hint' }, 'Reviewers nearly always ask for these. Read them from "Details of Mesh" in ANSYS. The limits used for the warnings are in settings.json.'))));
}

// ----- assumptions
function assumptionsList() {
  const lib = S.status.settings.assumption_library || [];
  const ticked = lib.filter((_, i) => S.assumed[i]);
  const custom = (S.assumeCustom || '').split('\n').map(t => t.trim()).filter(Boolean);
  return [...ticked, ...custom];
}
function assumptionsCard() {
  const lib = S.status.settings.assumption_library || [];
  const count = h('small', { class: 'hint', id: 'assume-count' });
  const upd = () => { const n = assumptionsList().length; count.textContent = n ? `${n} line${n > 1 ? 's' : ''} selected: the slide "4. Assumptions & Scope" is added after the mesh.` : 'Nothing selected: no assumptions slide.'; };
  const boxes = lib.map((t, i) => {
    const cb = h('input', { type: 'checkbox', checked: !!S.assumed[i], 'aria-label': t });
    cb.addEventListener('change', () => { S.assumed[i] = cb.checked; upd(); scheduleDerive(); scheduleSave(); });
    return h('label', {}, cb, h('span', {}, t));
  });
  const ta = h('textarea', { rows: 2, placeholder: 'Your own lines, one per line (e.g. "Design temperature 210 \u00b0C: yield stress taken at that temperature.")', 'aria-label': 'Own assumptions' });
  ta.value = S.assumeCustom || '';
  ta.addEventListener('input', () => { S.assumeCustom = ta.value; upd(); scheduleSave(); });
  upd();
  return card('6', 'Assumptions & scope (optional)', 'Tick only what is TRUE for this model. Nothing is ticked for you, because a wrong assumption is worse than none.',
    h('div', { class: 'assume' }, boxes), h('div', { style: 'margin-top:10px' }, ta), count);
}

// ----- load cases
function caseCard(c, k) {
  const moreBox = h('div', { class: 'xlist', 'data-more': c.n }), viewsBox = h('div', { class: 'xlist', 'data-views': c.n });
  renderMore(c, moreBox); renderViews(c, viewsBox);
  const bcBox = h('div'), noteBox = h('div'), xBox = h('div', { class: 'xlist', 'data-extras': c.n }), obsBox = h('div', { 'data-obsbox': c.n, class: 'in', style: 'padding:0;display:grid;gap:12px' });
  renderLines(c, 'bc', bcBox); renderLines(c, 'notes', noteBox); renderExtras(c, xBox);
  const wordFlags = [];
  const wording = h('details', { class: 'wording' },
    h('summary', {}, 'Wording of captions and observations (written automatically, edit if you like)'),
    h('div', { class: 'in' }, WORDING.slice(0, 2).map(([key, label]) => wordField(c, key, label, wordFlags, 'input')), obsBox,
      wordField(c, 'conclusion', WORDING[2][1], wordFlags, 'input'),
      h('div', {}, h('button', { class: 'link', type: 'button', onclick: () => resetWording(c, wordFlags) }, 'Reset the wording of this case to automatic'))));
  renderObs(c, obsBox, wordFlags);

  const nameEl = inp(c, 'name', { need: 'casename', casename: '1', label: `Case ${c.n} name`, onchange: () => {
    if (!c.dirty.short) { c.short_name = c.name; shortEl.value = c.name; } scheduleDerive(); renderChecks(); } });
  const shortEl = inp(c, 'short_name', { need: 'req', label: `Case ${c.n} short name`, onchange: () => { c.dirty.short = true; scheduleDerive(); renderChecks(); } });
  const defEl = inp(c, 'def_max', { need: 'num', label: `Case ${c.n} max deformation`, onchange: scheduleDerive });
  const strEl = inp(c, 'stress_max', { need: 'num', label: `Case ${c.n} max stress`, onchange: scheduleDerive });
  const lf = (label, el, extra) => h('label', { class: 'f ' + (extra || '') }, h('span', {}, label), el);
  const ev = (key, label, hint) => h('label', { class: 'f' }, h('span', {}, label, h('span', { class: 'opt' }, '  (optional)')), inp(c, key, { label: `Case ${c.n}: ${label}`, onchange: scheduleDerive }), hint ? h('small', {}, hint) : null);

  return h('section', { class: 'card', 'data-casecard': c.n },
    h('div', { class: 'case-head' }, h('h2', {}, h('span', { class: 'num' }, String(7 + k)), `Load case ${c.n}`), h('span', { class: 'badge', 'data-badge': c.n, hidden: true })),
    h('div', { class: 'casepics' },
      h('figure', {}, thumb(c.bc_id, 'thumb big', 300), h('figcaption', {}, 'Setup')),
      h('figure', {}, thumb(c.def_id, 'thumb big', 300), h('figcaption', {}, 'Deformation')),
      h('figure', {}, thumb(c.stress_id, 'thumb big', 300), h('figcaption', {}, 'Stress'))),
    h('div', { class: 'grid' },
      lf('Case name (slide title)', nameEl, 'span2'), lf('Subtitle', inp(c, 'subtitle', { label: `Case ${c.n} subtitle` }), 'span2'),
      lf('Short name in the final summary table', shortEl, 'span2')),
    h('h3', { class: 'mini' }, 'Boundary conditions ', h('small', {}, '(the letters A, B, C ... follow the legend in the setup picture)')),
    h('div', { class: 'cols2' }, h('div', {}, bcBox), evid(c.bc_id, 'bc', 'What I read in the setup legend (compare)', 760)),
    h('h3', { class: 'mini' }, 'Notes ', h('small', {}, '(optional, shown under the list)')),
    noteBox,
    h('h3', { class: 'mini' }, 'Results ', h('small', {}, '(read from the colour legends, each TWICE. Compare with the crop and correct if wrong)')),
    h('div', { class: 'resrow' },
      h('div', { class: 'resbox' }, h('div', {}, lf('Maximum total deformation', h('div', { class: 'unit' }, defEl, h('em', {}, 'mm')))), evid(c.def_id, 'legend', 'the legend I read', 420)),
      h('div', { class: 'resbox' }, h('div', {}, lf('Maximum von-Mises stress', h('div', { class: 'unit' }, strEl, h('em', {}, 'MPa'))), h('div', { class: 'verdict-line', 'data-verdict': c.n })),
        evid(c.stress_id, 'legend', 'the legend I read', 420))),
    h('div', { 'data-basisbox': c.n }),
    c.more.length ? h('h3', { class: 'mini' }, 'Further results ', h('small', {}, '(shear, principal, one part ...: each gets its own slide, with its zoomed / section pictures)')) : null,
    c.more.length ? moreBox : null,
    c.views.length ? h('h3', { class: 'mini' }, 'Zoomed and cut-section pictures ', h('small', {}, '(placed on the slide of the plot they belong to)')) : null,
    c.views.length ? viewsBox : null,
    h('h3', { class: 'mini' }, 'Additional views ', h('small', {}, '(section, detail, other result types: each gets its own slide)')),
    xBox,
    h('details', { class: 'wording' }, h('summary', {}, 'Engineering evidence (optional): where is the maximum, reaction-force check'),
      h('div', { class: 'in' }, h('div', { class: 'grid' },
        h('div', { class: 'span2' }, ev('loc_stress', 'Where does the maximum stress occur?', 'e.g. "the weld toe at the hub" - becomes a sentence in the observations')),
        h('div', { class: 'span2' }, ev('loc_def', 'Where does the maximum deformation occur?', 'e.g. "the free end of the shaft"')),
        h('div', { class: 'span2' }, ev('react_applied', 'Total applied load (N)', 'from your load calculation')),
        h('div', { class: 'span2' }, ev('react_sum', 'Sum of the reaction forces (N)', 'from ANSYS "Force Reaction" - the app compares the two (should agree within 2 %)'))))),
    wording);
}

function wordField(c, key, label, flags, kind) {
  const el = kind === 'area' ? h('textarea', { rows: 2 }) : h('input', { type: 'text' });
  el.value = c.texts[key] || ''; el.dataset.case = c.n; el.dataset.key = key;
  const flag = h('em', { class: 'edited', hidden: !c.dirty[key] }, 'edited by you');
  flags.push(flag);
  el.addEventListener('input', () => { c.texts[key] = el.value; c.dirty[key] = true; flag.hidden = false; scheduleSave(); });
  return h('label', { class: 'f' }, h('span', {}, label, flag), el);
}

function renderObs(c, box, flags) {
  const n = Math.max(3, c.obs.length);
  const flag = h('em', { class: 'edited', hidden: !c.dirty.obs }, 'edited by you');
  if (flags) flags.push(flag);
  box.replaceChildren(...Array.from({ length: n }, (_, i) => {
    const el = h('textarea', { rows: 2, 'aria-label': `Observation ${i + 1}` });
    el.value = c.obs[i] || '';
    el.addEventListener('input', () => {
      c.obs[i] = el.value; c.dirty.obs = true; flag.hidden = false; box.dataset.touched = '1'; scheduleSave();
    });
    return h('label', { class: 'f' }, h('span', {}, `Observation ${i + 1}`, i === 0 ? flag : null), el);
  }));
}

function resetWording(c, flags) {
  c.dirty = {}; c.texts = {}; c.obs = [];
  $$(`[data-case="${c.n}"][data-key]`).forEach(el => { el.value = ''; });
  flags.forEach(f => { f.hidden = true; });
  scheduleDerive();
}

function renderLines(c, kind, box) {
  const items = kind === 'bc' ? c.bc_items : c.notes;
  const rows = items.map((t, k) => {
    const el = h('input', { type: 'text', value: t, 'data-need': kind === 'bc' ? 'bracket' : 'bracketOpt', list: kind === 'bc' ? 'dl-bc' : null,
      'data-label': kind === 'bc' ? `Case ${c.n}, boundary condition ${String.fromCharCode(65 + k)}` : `Case ${c.n}, note ${k + 1}`,
      placeholder: kind === 'bc' ? 'e.g. Fixed support applied on the left shaft.' : 'e.g. Welds are not modelled.' });
    el.addEventListener('input', () => { items[k] = el.value; if (kind === 'bc') scheduleDerive(); updateNeeds(); });
    const lg = kind === 'bc' && c.bc_legend[k] ? c.bc_legend[k].replace(/mm\/s[?*"']?/, 'mm/s\u00b2').replace(/N-mm/g, 'N\u00b7mm') : '';
    return h('div', { class: 'line' }, h('span', { class: kind === 'bc' ? 'letter' : 'letter n' }, kind === 'bc' ? String.fromCharCode(65 + k) : String(k + 1)),
      h('div', { class: 'grow' }, el, lg ? h('small', { class: 'hint' }, `Picture legend: ${lg}`) : null),
      h('button', { class: 'icon', type: 'button', title: 'Remove this line', onclick: () => {
        items.splice(k, 1); if (kind === 'bc') c.bc_legend.splice(k, 1); renderLines(c, kind, box); updateNeeds(); scheduleDerive(); } }, '\u2715'));
  });
  const adds = [h('button', { class: 'link add', type: 'button', onclick: () => {
    items.push(''); if (kind === 'bc') c.bc_legend.push(''); renderLines(c, kind, box); updateNeeds();
    const ins = $$('input', box); if (ins.length) ins[ins.length - 1].focus(); } }, kind === 'bc' ? '+ Add a line' : '+ Add a note')];
  if (kind === 'notes') adds.push(h('button', { class: 'link add', type: 'button', style: 'margin-left:14px', onclick: () => {
    items.push('This load case is at the working temperature of [value - please confirm] \u00b0C.'); renderLines(c, kind, box); updateNeeds(); } }, '+ Working-temperature note'));
  box.replaceChildren(...rows, h('div', {}, adds));
}

// ----- further results of a case (shear, principal, one part ...)
function renderMore(c, box) {
  box.replaceChildren(...c.more.map(m => {
    const img = S.images.find(i => i.id === m.id) || {};
    const stressy = STRESS_KINDS.has(m.kind), shear = m.kind === 'max_shear' || m.kind === 'shear', low = m.kind === 'min_principal' || m.kind === 'safety';
    const val = inp(m, low ? 'min' : 'max', { need: 'num', label: `Case ${c.n}: ${low ? 'minimum' : 'maximum'} of ${m.scope || ''} ${m.heading}`, onchange: scheduleDerive });
    const allow = inp(m, 'allow', { need: 'allow', label: `Case ${c.n}: allowable ${shear ? 'shear ' : ''}stress for ${m.scope || 'the model'}`, onchange: scheduleDerive });
    allow.dataset.scoped = m.scope ? '1' : ''; allow.dataset.moreallow = m.id; allow.style.width = '130px';
    const cap = inp(m, 'caption_edit', { label: `Case ${c.n}: caption of ${m.heading}`, ph: 'written automatically', onchange: scheduleSave });
    cap.dataset.morecap = m.id;
    const lf = (label, el) => h('label', { class: 'f' }, h('span', {}, label), el);
    return h('div', { class: 'xitem more' }, thumb(m.id, 'thumb', 220),
      h('div', {}, h('span', { class: 'kindtag' }, m.scope ? m.scope : 'whole model'), h('span', { class: 'meta' }, `${m.kind_label || m.heading}  \u00b7  ${img.name || ''}`),
        h('div', { class: 'grid' },
          lf(`${low ? 'Minimum' : 'Maximum'} ${prettyKind(m.heading).toLowerCase().replace('von-mises', 'von-Mises')}`, h('div', { class: 'unit' }, val, h('em', {}, m.unit || ''))),
          stressy ? lf(`Allowable ${shear ? 'shear ' : ''}stress (MPa)`, allow) : h('span')),
        lf('Caption under the picture (empty = written automatically)', cap),
        m.scope ? h('button', { class: 'link', type: 'button', hidden: true, 'data-addmat': m.id, onclick: () => addPartRow(m.scope) }, `Add "${m.scope}" to the material table (its allowable is then filled in for you)`) : null,
        h('div', { class: 'verdict-line', 'data-morever': m.id }),
        evid(m.id, 'legend', 'the legend I read', 360)),
      h('div', { class: 'acts' }, h('button', { type: 'button', onclick: () => { const im = S.images.find(i => i.id === m.id); if (im) { im.role = 'unused'; im.case = null; regroup(); } } }, 'Remove')));
  }));
}

function refreshMoreStatus() {
  for (const c of S.cases) for (const m of c.more || []) {
    $$(`[data-morecap="${m.id}"]`).forEach(el => { el.placeholder = m.auto_caption || 'no number: no caption'; });
    $$(`[data-moreallow="${m.id}"]`).forEach(el => {
      const known = m.allow_auto && m.allow_val !== null && m.allow_val !== undefined;
      el.placeholder = known ? (m.allow_src ? `${m.allow_val} (row '${m.allow_src}')` : `${m.allow_val} (material table)`) : m.scope ? `type the allowable of the ${m.scope}` : 'optional';
      el.title = known && m.allow_src ? `Taken from the material table, row "${m.allow_src}". Type a number to use another value.` : '';
      el.dataset.scoped = m.scope && !known ? '1' : '';                          // a part with no material row still needs its allowable (yellow)
    });
    $$(`[data-addmat="${m.id}"]`).forEach(b => { b.hidden = !(m.scope && !(m.allow_auto && m.allow_val !== null && m.allow_val !== undefined) && !num(m.allow)); });
    $$(`[data-morever="${m.id}"]`).forEach(el => {
      const t = m.tier;
      el.className = 'verdict-line' + (t === 'exceeds' ? ' badtxt' : t === 'pass' ? ' oktxt' : '');
      el.textContent = t === 'pass' ? `\u2714 Within the allowable (${m.allow_val} MPa)` : t === 'exceeds' ? `\u2716 Exceeds the allowable (${m.allow_val} MPa)`
        : STRESS_KINDS.has(m.kind) ? (m.scope ? `Enter the allowable stress of the ${m.scope} - or add the ${m.scope} to the material table - to get the pass / fail sentence.` : 'Enter the allowable stress to get the pass / fail sentence.') : '';
    });
  }
}

// ----- zoomed / section pictures of a case
function renderViews(c, box) {
  const plots = plotChoices(c.n);
  box.replaceChildren(...c.views.map(v => {
    const img = S.images.find(i => i.id === v.id) || {};
    const kind = optSelect(`Kind of picture ${img.name || ''}`, VIEW_OPTIONS, v.view_kind, x => { touch(img, 'view_kind', x); regroup(); });
    const par = optSelect(`Plot of ${img.name || ''}`, [['', 'Choose the plot ...'], ...plots.map(p => [p.id, p.text])], v.parent_id,
      x => { touch(img, 'parent_id', x === '' ? null : parseInt(x, 10)); regroup(); }, 'sub-sel parent');
    par.dataset.need = 'parent'; par.dataset.label = `Case ${c.n}: which plot does ${img.name || 'this picture'} belong to`;
    const lab = h('input', { type: 'text', value: nice(v.slide_label), placeholder: VIEW_DEFAULT[v.view_kind] || 'Detail view', 'aria-label': 'Label on the slide' });
    lab.addEventListener('input', () => { v.slide_label = lab.value; scheduleSave(); });
    const lf = (label, el) => h('label', { class: 'f' }, h('span', {}, label), el);
    return h('div', { class: 'xitem view' }, thumb(v.id, 'thumb', 260),
      h('div', {},
        h('div', { class: 'head-row' },
          h('span', { class: 'kindtag' }, v.view_kind === 'section' ? 'cut section' : v.view_kind === 'zoom' ? 'zoomed view' : 'detail view'),
          h('span', { class: 'fn-title' }, img.name || ''),
          v.parent_conf === 'guess' ? h('span', { class: 'meta' }, '\u00b7  my guess for the plot: please check') : null),
        h('div', { class: 'grid view-grid' },
          lf('1. Kind of picture', kind),
          lf('2. Belongs to (which slide it goes on)', par),
          lf('3. Label on the slide', lab))),
      h('div', { class: 'acts' }, h('button', { type: 'button', onclick: () => { if (img.id !== undefined) { img.role = 'unused'; img.case = null; regroup(); } } }, 'Remove')));
  }));
}

// ----- additional views of a case
function renderExtras(c, box) {
  if (!c.extras.length) {
    box.replaceChildren(h('small', { class: 'hint' }, 'None. A second picture of the same kind (e.g. a section view of the stress) is added here automatically, or choose "Extra view" for a picture in the Pictures table.'));
    return;
  }
  box.replaceChildren(...c.extras.map(e => {
    const img = S.images.find(i => i.id === e.id) || {};
    const acts = [];
    if (['bc', 'deformation', 'stress'].includes(e.kind)) acts.push(h('button', { type: 'button', onclick: () => swapMain(c, e) }, 'Use as main plot'));
    acts.push(h('button', { type: 'button', onclick: () => dropPicture(e) }, 'Remove'));
    const meta = [];
    if (e.max !== null && e.max !== undefined) meta.push(`Max ${e.max} ${e.unit || ''}`);
    if (e.auto) meta.push('chosen automatically: the main plot has the higher Max');
    return h('div', { class: 'xitem' }, thumb(e.id, 'thumb', 220),
      h('div', {}, h('span', { class: 'kindtag' }, KIND_LABEL[e.kind] || e.kind),
        h('span', { class: 'meta' }, img.name || ''),
        field('Heading (also the slide title)', e, 'heading', { need: 'bracket', label: `Case ${c.n}: heading of the additional view ${img.name || ''}`, onchange: scheduleDerive }),
        field('Caption', e, 'caption', { optional: true, label: 'Caption' }),
        h('div', { class: 'meta' }, meta.join('  \u00b7  '))),
      h('div', { class: 'acts' }, acts));
  }));
}

function swapMain(c, e) {
  const ex = S.images.find(i => i.id === e.id); if (!ex) return;
  const base = ex.role.replace(/^x_/, '');
  const old = S.images.find(i => i.role === base && i.case === ex.case);
  if (old) old.role = 'x_' + base;
  ex.role = base; regroup();
}
function dropPicture(e) {
  const ex = S.images.find(i => i.id === e.id); if (!ex) return;
  ex.role = 'unused'; ex.case = null; regroup();
}

// ----- how to report an over-limit peak (the singularity guard)
function renderBasisBoxes() {
  for (const c of S.cases) {
    const box = $(`[data-basisbox="${c.n}"]`); if (!box) continue;
    const active = ['exceeds', 'beyond_yield', 'suspect'].includes(c.tier);
    const sig = `${c.tier}|${c.basis}|${c.needsBasis}`;
    if (box.dataset.sig === sig) continue;
    if (box.contains(document.activeElement) && document.activeElement.tagName === 'INPUT' && document.activeElement.type === 'text') { box.dataset.sig = sig; continue; }
    box.dataset.sig = sig;
    if (!active) { box.replaceChildren(); continue; }
    const suspect = c.tier === 'suspect';
    const sy = num(govRow() && govRow().yield), sx = num(c.stress_max);
    const radios = BASIS_OPTIONS.map(([v, title, sub]) => {
      const checked = c.basis === v || (!suspect && !c.basis && v === 'asis');
      const r = h('input', { type: 'radio', name: `basis-${c.n}`, value: v, checked });
      r.addEventListener('change', () => { c.basis = v; box.dataset.sig = ''; renderBasisBoxes(); scheduleDerive(); updateNeeds(); });
      return h('label', { class: 'opt-row' }, r, h('span', {}, title, h('small', {}, sub)));
    });
    const subs = [];
    if (c.basis === 'singularity' || c.basis === 'refine') {
      subs.push(field('Where is the peak? (location)', c, 'sing_loc', { need: 'req', label: `Case ${c.n}: location of the peak stress`, onchange: scheduleDerive }));
      if (c.basis === 'singularity') subs.push(field('Stress AWAY from the peak (MPa)', c, 'stress_away', { need: 'num', label: `Case ${c.n}: stress away from the peak`, onchange: scheduleDerive,
        hint: 'Read it in ANSYS with a probe or by moving the legend. The app never guesses it.' }));
    }
    const inner = [
      h('h4', {}, suspect ? 'Check this before you trust the verdict' : 'How is the peak stress reported?'),
      h('p', {}, suspect
        ? `The peak stress (${c.stress_max} MPa)${sy && sx ? ' is ' + (sx / sy).toFixed(0) + ' times the YIELD strength' : ' is far above yield'}. In a real steel structure this is almost always a stress singularity (a point support, a sharp corner, a contact edge) or a load / unit error. Choose how the report should treat it.`
        : 'The peak stress is above the allowable. By default the report says so, as in your template. Change this only if you know the peak is not representative.'),
      ...radios];
    if (subs.length) inner.push(h('div', { class: 'sub' }, ...subs));
    const wrap = h('div', { class: 'basis' + (suspect ? '' : ' soft'), 'data-need': suspect ? 'basis' : null, 'data-bad': c.needsBasis ? '1' : '',
                            'data-label': `Case ${c.n}: how to report the peak stress` }, ...inner);
    box.replaceChildren(suspect ? wrap : h('details', { class: 'wording', open: !!c.basis }, h('summary', {}, 'The peak stress is above the allowable: how is it reported? (default: as in the template)'), h('div', { class: 'in' }, wrap)));
  }
}

function renderVerdicts() {
  const allow = govAllow();
  S.cases.forEach(c => {
    $$(`[data-badge="${c.n}"]`).forEach(b => {
      if (c.exceeds === null || c.exceeds === undefined) { b.hidden = true; return; }
      b.hidden = false;
      const t = c.tier;
      b.className = 'badge ' + (t === 'pass' ? 'ok' : 'bad');
      b.textContent = t === 'pass' ? '\u2714 Within the allowable stress' : t === 'exceeds' ? '\u2716 Exceeds the allowable stress'
        : t === 'beyond_yield' ? '\u2716 Above yield strength' : '\u2716 Peak far above yield: check it';
    });
    $$(`[data-verdict="${c.n}"]`).forEach(v => {
      v.textContent = allow === null ? 'Enter the yield stress to see the pass / fail result.' : `Allowable stress: ${allow} MPa` + (c.util ? `  \u00b7  utilisation ${c.util < 10 ? c.util.toFixed(1) : c.util.toFixed(0)} %` : '');
    });
  });
}

// ───────────────────────────── regroup (user changed a picture's role) ─────────────────────────────
async function regroup() {
  busy('Updating the draft ...');
  try {
    const r = await post('/api/regroup', { sid: S.sid, assign: S.images.map(assignOf) });
    S.images = r.images; S.warnings = r.warnings;
    const keep = (oldList, id) => oldList.find(o => o.id === id);
    const og = S.geometry, om = S.meshes;
    S.geometry = r.geometry.map(g => { const o = keep(og, g.id); return { id: g.id, heading: o ? o.heading : g.heading, caption: o ? o.caption : '' }; });
    S.meshes = r.meshes.map(g => { const o = keep(om, g.id); return { id: g.id, heading: o ? o.heading : g.heading, caption: o ? o.caption : '' }; });
    const old = new Map(S.cases.map(c => [c.n, c]));
    S.cases = r.cases.map(dc => {
      const o = old.get(dc.n);
      if (!o) return newCase(dc);
      const c = Object.assign({}, o);
      const bcChanged = o.bc_id !== dc.bc_id;
      c.bc_id = dc.bc_id; c.def_id = dc.def_id; c.stress_id = dc.stress_id;
      c.stress_red_px = dc.stress_red_px; c.stress_legend = dc.stress_legend; c.stress_unit = dc.stress_unit; c.def_unit = dc.def_unit;
      c.gravity = dc.gravity; c.legend_px = dc.legend_px;
      c.extras = dc.extras.map(e => { const oe = (o.extras || []).find(x => x.id === e.id); return Object.assign({}, e, { heading: oe ? oe.heading : e.heading, caption: oe ? oe.caption : '' }); });
      c.more = (dc.more || []).map(m => { const om = (o.more || []).find(x => x.id === m.id);
        return Object.assign({}, m, { max: nice(om ? om.max : m.max), min: nice(om ? om.min : m.min), allow: om ? om.allow : '', caption_edit: om ? om.caption_edit : '',
                                      auto_caption: om ? om.auto_caption : '', tier: om ? om.tier : null }); });
      c.views = (dc.views || []).map(v => { const ov = (o.views || []).find(x => x.id === v.id); return Object.assign({}, v, { slide_label: ov ? ov.slide_label : '' }); });
      if (bcChanged) { c.bc_items = dc.bc_items.slice(); c.bc_legend = dc.bc_legend.slice(); c.name = dc.name; c.subtitle = dc.subtitle; c.short_name = dc.short_name; }
      if (o.def_id !== dc.def_id) c.def_max = nice(dc.def_max);
      if (o.stress_id !== dc.stress_id) c.stress_max = nice(dc.stress_max);
      return c;
    });
    renderReview(); scheduleDerive();
  } catch (e) { showAlert(e.message); }
  finally { busy(false); }
}

// ───────────────────────────── live wording + checks ─────────────────────────────
let deriveTimer = null;
function scheduleDerive() { clearTimeout(deriveTimer); deriveTimer = setTimeout(() => { runDerive().catch(() => {}); }, 250); }
async function flushDerive() { clearTimeout(deriveTimer); await runDerive().catch(() => {}); }

function deriveBody() {
  const row = govRow() || {};
  return { sid: S.sid, allowable: govAllow(), yield: num(row.yield), fos: S.fos, short: S.short, show_utilisation: S.showUtil,
    def_limit: num(S.defLimit), material: { E: row.E, nu: row.nu, rho: row.rho }, mat_rows: S.mat.rows.map(r => ({ item: r.item, material: r.material, yield: num(r.yield) })),
    mesh_stats: S.meshStats, assumptions: assumptionsList(),
    layouts: S.layouts, geometry: S.geometry.map(g => ({ id: g.id })), meshes: S.meshes.map(g => ({ id: g.id })),
    cases: S.cases.map(c => ({ n: c.n, def_max: num(c.def_max), stress_max: num(c.stress_max), red_px: c.stress_red_px, legend: c.stress_legend || [],
      stress_unit: c.stress_unit, def_unit: c.def_unit, basis: c.basis, sing_loc: c.sing_loc, stress_away: c.stress_away, loc_stress: c.loc_stress,
      loc_def: c.loc_def, react_applied: c.react_applied, react_sum: c.react_sum, gravity: c.gravity, legend_px: c.legend_px, layout: c.layout,
      bc_layout: c.bc_layout, bc_id: c.bc_id, def_id: c.def_id, stress_id: c.stress_id, bc_items: c.bc_items, notes: c.notes,
      extras: c.extras.map(e => ({ id: e.id, kind: e.kind, heading: e.heading, max: e.max })),
      more: c.more.map(m => ({ id: m.id, kind: m.kind, kind_label: m.kind_label, scope: m.scope, heading: m.heading, max: num(m.max), min: num(m.min), unit: m.unit, allow: num(m.allow) })),
      views: c.views.map(v => ({ id: v.id, view_kind: v.view_kind, parent_id: v.parent_id })) })) };
}

async function runDerive() {
  if (!S.sid) return;
  const r = await post('/api/derive', deriveBody());
  S.checks = r.checks; S.suggest = r.suggest; S.layoutPlan = r.layout;
  for (const c of S.cases) {
    const d = r.cases[String(c.n)]; if (!d) continue;
    c.exceeds = d.exceeds; c.tier = d.tier; c.needsBasis = d.needs_basis; c.util = d.util;
    (d.more || []).forEach(dm => { const m = c.more.find(x => x.id === dm.id); if (m) { m.auto_caption = dm.caption; m.allow_val = dm.allow; m.allow_auto = dm.allow_auto; m.allow_src = dm.allow_src || ''; m.tier = dm.tier; } });
    const t = d.texts, auto = { deformation_caption: t.deformation_caption, stress_caption: t.stress_caption, conclusion: t.conclusion };
    for (const [key, val] of Object.entries(auto)) {
      if (c.dirty[key]) continue;
      c.texts[key] = val;
      $$(`[data-case="${c.n}"][data-key="${key}"]`).forEach(el => { el.value = val; });
    }
    if (!c.dirty.obs) {
      const same = JSON.stringify(c.obs) === JSON.stringify(t.observations);
      c.obs = t.observations.slice();
      const box = $(`[data-obsbox="${c.n}"]`);
      if (box && !same && !box.contains(document.activeElement)) renderObs(c, box, null);
    }
  }
  renderChecks(); renderVerdicts(); renderHint(); renderLayoutCard(); renderBasisBoxes(); refreshMoreStatus(); updateNeeds();
}

// ───────────────────────────── "needs your input" tracking ─────────────────────────────
function updateNeeds() {
  const names = S.cases.map(c => (c.name || '').trim().toLowerCase());
  $$('#s-review [data-need]').forEach(el => {
    const v = (el.value || '').trim(); let bad = false;
    switch (el.dataset.need) {
      case 'req': bad = v === ''; break;
      case 'bracket': bad = v === '' || /\[[^\]]*\]/.test(v); break;
      case 'bracketOpt': bad = /\[[^\]]*\]/.test(v); break;
      case 'num': bad = !isNum(v); break;
      case 'optnum': bad = v !== '' && !isNum(v); break;
      case 'title': bad = v === '' || /\bof$/i.test(v); break;
      case 'role': bad = v === 'unknown'; break;
      case 'casename': bad = v === '' || names.filter(n => n === v.toLowerCase()).length > 1; break;
      case 'basis': bad = el.dataset.bad === '1'; break;
      case 'allow': bad = (v === '' && el.dataset.scoped === '1') || (v !== '' && !isNum(v)); break;
      case 'parent': bad = v === ''; break;
    }
    el.classList.toggle('need', bad);
  });
  const n = $$('#s-review .need').length, msg = $('#bar-msg');
  if (n === 0) { msg.className = 'bar-msg ok'; msg.textContent = '\u2713 Nothing left to fill in.'; }
  else {
    msg.className = 'bar-msg todo';
    msg.replaceChildren(`${n} ${n === 1 ? 'item needs' : 'items need'} your input (yellow). You can download anyway.`,
      h('button', { class: 'link', type: 'button', onclick: gotoNeed }, 'Show me'));
  }
  renderTodo();
  scheduleSave();
}
function gotoNeed() {
  const el = $('#s-review .need'); if (!el) return;
  el.scrollIntoView({ block: 'center' }); if (el.focus) el.focus();
}

// ───────────────────────────── generate + done ─────────────────────────────
function textsPayload(c) {
  const t = {}, x = c.texts;
  if (c.dirty.deformation_caption) t.deformation_caption = x.deformation_caption || '';
  if (c.dirty.stress_caption) t.stress_caption = x.stress_caption || '';
  if (c.dirty.obs) t.observations = c.obs.filter(Boolean);
  if (c.dirty.conclusion) t.conclusion = x.conclusion || '';
  return t;
}

function buildPayload() {
  const row = govRow() || {};
  return {
    sid: S.sid, cover: S.cover, short: S.short, fos: S.fos, yield: num(row.yield), allowable: govAllow(), show_utilisation: S.showUtil, def_limit: num(S.defLimit),
    material: { rows: S.mat.rows.map(r => [r.material, r.item, r.E, r.nu, r.rho, r.yield, String(allowOf(r) ?? '')]), units: S.units },
    geometry: S.geometry.map(g => ({ id: g.id, heading: g.heading, caption: g.caption })),
    meshes: S.meshes.map(g => ({ id: g.id, heading: g.heading, caption: g.caption })), mesh_stats: S.meshStats,
    assumptions: assumptionsList(), layouts: S.layouts,
    cases: S.cases.map(c => ({ n: c.n, name: c.name, subtitle: c.subtitle, short_name: c.short_name, bc_id: c.bc_id, def_id: c.def_id,
      stress_id: c.stress_id, bc_items: c.bc_items, notes: c.notes, def_max: c.def_max, stress_max: c.stress_max, basis: c.basis, sing_loc: c.sing_loc,
      stress_away: c.stress_away, loc_stress: c.loc_stress, loc_def: c.loc_def, react_applied: c.react_applied, react_sum: c.react_sum,
      layout: c.layout, bc_layout: c.bc_layout, legend_px: c.legend_px, extras: c.extras.map(e => ({ id: e.id, kind: e.kind, heading: e.heading, caption: e.caption, max: e.max })),
      more: c.more.map(m => ({ id: m.id, kind: m.kind, kind_label: m.kind_label, scope: m.scope, heading: m.heading, max: m.max, min: m.min, unit: m.unit, allow: m.allow, caption_edit: m.caption_edit })),
      views: c.views.map(v => ({ id: v.id, view_kind: v.view_kind, label: v.slide_label || '', parent_id: v.parent_id })),
      texts: textsPayload(c) })),
    missing: S.missing,
  };
}

// ───────────────────────────── the live preview of the real report ─────────────────────────────
const slideUrl = (n, w) => `/api/slide/${S.sid}/${S.build.key}/${n}?w=${w}`;
function slideWidth() {
  const f = $('#pv-frame'), css = f && f.clientWidth ? f.clientWidth : 900;
  return Math.min(2000, Math.max(640, Math.ceil(css * (window.devicePixelRatio || 1) / 160) * 160));
}

function previewCard() {
  const nav = (cls, label, txt, delta) => h('button', { class: 'pv-nav ' + cls, type: 'button', id: 'pv-' + cls, 'aria-label': label,
    onclick: e => { e.stopPropagation(); gotoSlide(S.build.cur + delta); } }, txt);
  const frame = h('div', { class: 'pv-frame loading', id: 'pv-frame', title: 'Click to see the slide full screen', onclick: openSlideBox },
    h('img', { id: 'pv-img', alt: 'Preview of the slide' }), h('div', { class: 'pv-wait', id: 'pv-wait' }));
  const missing = h('select', { id: 'pv-missing', 'aria-label': 'What to do when a picture is missing' },
    h('option', { value: 'skip', selected: S.missing === 'skip' }, 'Leave that slide out'),
    h('option', { value: 'frame', selected: S.missing === 'frame' }, 'Keep an empty frame to fill in PowerPoint'));
  missing.addEventListener('change', () => { S.missing = missing.value; saveSaved(); scheduleSave(); });
  return h('section', { class: 'card pv', id: 'pv-card' },
    h('div', { class: 'pv-head' }, h('h2', {}, 'Report preview'),
      h('span', { class: 'pv-status busy', id: 'pv-status' }, h('i'), h('span', { id: 'pv-status-text' }, 'Preparing ...')),
      h('button', { class: 'secondary', type: 'button', id: 'pv-refresh', onclick: () => previewNow().catch(() => {}) }, ico('refresh'), 'Update preview'),
      h('button', { class: 'secondary', type: 'button', id: 'pv-full', onclick: openSlideBox }, ico('expand'), 'Full screen')),
    h('p', { class: 'sub' }, 'This is your real report, drawn from the PowerPoint file that is built from what you see below. It is made once when I have read the pictures. After that it changes only when you press the ', h('b', {}, 'Preview'), ' button.'),
    h('div', { class: 'pv-outdated', id: 'pv-outdated', hidden: true }, h('span', {}, 'You changed something after this preview was made, so it still shows the previous version.'),
      h('button', { class: 'primary', type: 'button', onclick: () => previewNow().catch(() => {}) }, 'Update preview')),
    h('div', { class: 'pv-stage' }, frame, nav('prev', 'Previous slide', '\u2039', -1), nav('next', 'Next slide', '\u203A', 1)),
    h('div', { class: 'pv-bar' }, h('span', { class: 'pv-count', id: 'pv-count' }), h('span', { class: 'pv-title', id: 'pv-title' })),
    h('div', { class: 'pv-strip', id: 'pv-strip' }),
    h('div', { class: 'pv-notes', id: 'pv-notes', hidden: true }),
    h('div', { class: 'pv-todo', id: 'pv-todo', hidden: true }),
    h('div', { class: 'pv-actions' },
      h('label', { class: 'miss' }, h('span', {}, 'If a picture is missing:'), missing),
      h('span', { class: 'grow' }),
      h('button', { class: 'secondary save-action', type: 'button', onclick: () => saveCurrentWork(true) }, ico('save'), 'Save File'),
      h('button', { class: 'secondary', type: 'button', 'data-dl': 'pdf', onclick: () => downloadReport('pdf') }, ico('download'), 'Download PDF'),
      h('button', { class: 'primary', type: 'button', 'data-dl': 'pptx', onclick: () => downloadReport('pptx') }, ico('download'), 'Download PowerPoint')));
}

function renderPreview() {
  const card = $('#pv-card'); if (!card) return;
  const B = S.build, n = B.slides.length, has = !!(B.key && n);
  const MAP = { idle: ['busy', 'Preparing the preview ...'], building: ['busy', 'Updating the preview ...'], stale: ['busy', 'Updating the preview ...'],
                outdated: ['warn', 'Out of date: press Preview to update'], ok: ['ok', 'Preview is up to date'], error: ['bad', 'The preview could not be made'] };
  const [cls, text] = MAP[B.status] || MAP.idle;
  $('#pv-status').className = 'pv-status ' + cls; $('#pv-status-text').textContent = text;
  const frame = $('#pv-frame'), img = $('#pv-img'), wait = $('#pv-wait');
  frame.classList.toggle('stale', has && (B.status === 'building' || B.status === 'stale'));
  frame.classList.toggle('outdated', has && B.status === 'outdated');
  const od = $('#pv-outdated'); if (od) od.hidden = !(has && B.status === 'outdated');
  const pb = $('#btn-preview'); if (pb) pb.classList.toggle('attn', has && B.status === 'outdated');
  wait.hidden = has;
  if (!has) {
    frame.classList.remove('loading');
    if (B.status === 'error') wait.replaceChildren(h('b', {}, 'The report could not be built.'), h('span', {}, B.error),
      h('button', { class: 'secondary', type: 'button', onclick: () => buildNow().catch(() => {}) }, 'Try again'));
    else wait.replaceChildren(h('div', { class: 'spin' }), h('span', {}, 'Building the preview ...'));
  } else {
    const w = slideWidth(), url = slideUrl(B.cur, w);
    if (img.dataset.url !== url) {
      frame.classList.add('loading'); img.dataset.url = url;
      img.onload = img.onerror = () => frame.classList.remove('loading');
      img.src = url;
    }
    img.alt = `Slide ${B.cur + 1}: ${B.slides[B.cur].title}`;
    if (B.cur + 1 < n) { const pre = new Image(); pre.src = slideUrl(B.cur + 1, w); }
  }
  $('#pv-prev').disabled = !has || B.cur <= 0; $('#pv-next').disabled = !has || B.cur >= n - 1;
  $('#pv-count').textContent = has ? `Slide ${B.cur + 1} of ${n}` : '';
  $('#pv-title').textContent = has ? B.slides[B.cur].title : '';
  const strip = $('#pv-strip'), sig = `${B.key}|${n}`;
  if (has && strip.dataset.sig !== sig) {
    strip.dataset.sig = sig;
    strip.replaceChildren(...B.slides.map((sl, i) => h('button', { type: 'button', 'data-i': i, title: sl.title, onclick: () => gotoSlide(i) },
      h('img', { alt: `Slide ${i + 1}`, src: slideUrl(i, 240) }), h('span', {}, String(i + 1)))));
  }
  $$('#pv-strip button').forEach(btn => {
    const on = +btn.dataset.i === B.cur; btn.classList.toggle('on', on);
    if (on) { const r = btn.offsetLeft - strip.clientWidth / 2 + btn.clientWidth / 2; strip.scrollTo({ left: Math.max(0, r) }); }
  });
  const nb = $('#pv-notes'), items = [...B.notes];
  if (B.status === 'error' && has) {
    nb.hidden = false; nb.style.background = 'var(--bad-bg)'; nb.style.color = '#7a1f14';
    nb.replaceChildren(h('b', {}, 'The last change could not be put into the report: '), B.error, ' ',
      h('button', { class: 'link', type: 'button', onclick: () => buildNow().catch(() => {}) }, 'Try again'));
  } else {
    nb.style.background = ''; nb.style.color = ''; nb.hidden = !items.length;
    nb.replaceChildren(h('b', {}, 'Left out or simplified because something is missing:'), h('ul', {}, items.map(t => h('li', {}, t))));
  }
  renderTodo();
  if (!$('#slidebox').hidden) renderSlideBox();
}

function renderTodo() {
  const box = $('#pv-todo'); if (!box) return;
  const left = $$('#s-review .need').length;
  box.hidden = left === 0;
  if (left) box.replaceChildren(`${left} ${left === 1 ? 'item still needs' : 'items still need'} your input (yellow boxes below). You can download now: anything not filled in shows as [text in brackets] in the report. `,
    h('button', { class: 'link', type: 'button', onclick: gotoNeed }, 'Show me the first one'));
}

function gotoSlide(i) {
  const B = S.build; if (!B.slides.length) return;
  B.cur = Math.max(0, Math.min(B.slides.length - 1, i)); renderPreview();
}

function openSlideBox() { if (!S.build.key) return; $('#slidebox').hidden = false; renderSlideBox(); }
function closeSlideBox() { $('#slidebox').hidden = true; }
function renderSlideBox() {
  const B = S.build, box = $('#slidebox'); if (!B.key || !B.slides.length) return;
  const w = Math.min(2400, Math.max(1400, Math.ceil(window.innerWidth * (window.devicePixelRatio || 1) / 200) * 200)), img = $('img', box), url = slideUrl(B.cur, w);
  if (img.dataset.url !== url) { img.dataset.url = url; img.src = url; }
  $('figcaption', box).textContent = `Slide ${B.cur + 1} of ${B.slides.length}: ${B.slides[B.cur].title}`;
  $('.sb-nav.prev', box).disabled = B.cur <= 0; $('.sb-nav.next', box).disabled = B.cur >= B.slides.length - 1;
}
function bindSlideBox() {
  const box = $('#slidebox');
  $('.sb-nav.prev', box).addEventListener('click', () => gotoSlide(S.build.cur - 1));
  $('.sb-nav.next', box).addEventListener('click', () => gotoSlide(S.build.cur + 1));
  $('.sb-close', box).addEventListener('click', closeSlideBox);
  box.addEventListener('click', e => { if (e.target === box) closeSlideBox(); });
  document.addEventListener('keydown', e => {
    const open = !box.hidden, tag = (document.activeElement && document.activeElement.tagName) || '';
    if (e.key === 'Escape') closeSlideBox();
    else if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && (open || (!/INPUT|TEXTAREA|SELECT/.test(tag) && $('#pv-card') && !$('#s-review').hidden))) {
      if (!open) { const r = $('#pv-card').getBoundingClientRect(); if (r.bottom < 0 || r.top > innerHeight) return; }
      gotoSlide(S.build.cur + (e.key === 'ArrowRight' ? 1 : -1)); e.preventDefault();
    }
  });
}

// ───────────────────────────── building the report in the background ─────────────────────────────
let buildTimer = null;
// The Preview button: first bring the wording boxes up to date, then build.
async function previewNow() { await flushDerive(); return buildNow(); }
// Edits never rebuild the preview. They only mark it "out of date"; the Preview button (or the first automatic build) does the work.
function markOutdated() {
  if (!S.sid || $('#s-review').hidden) return;
  const B = S.build, sig = JSON.stringify(buildPayload());
  if (B.status === 'ok' || B.status === 'outdated') {
    const next = sig !== B.sig ? 'outdated' : 'ok';
    if (next !== B.status) { B.status = next; renderPreview(); }
  }
  if (B.downloaded && sig !== B.dlSig) { B.downloaded = false; setStep('review'); }
}

// One build at a time; if something changes while it runs, one more build follows (the latest state always wins).
async function buildNow() {
  clearTimeout(buildTimer);
  const B = S.build;
  if (!S.sid) return null;
  if (B.running) { B.again = true; return B.promise; }
  B.running = true;
  B.promise = (async () => {
    try {
      do {
        B.again = false;
        const body = buildPayload(), sig = JSON.stringify(body);
        if (sig === B.sig && B.status === 'ok' && B.key) continue;
        B.status = 'building'; renderPreview();
        try {
          const r = await post('/api/build', body);
          Object.assign(B, { sig, key: r.key, slides: r.slides, notes: r.notes || [], name: r.name || B.name, status: 'ok', error: '' });
          if (B.cur >= B.slides.length) B.cur = Math.max(0, B.slides.length - 1);
        } catch (e) { B.status = 'error'; B.error = e.message; B.again = false; }
        renderPreview();
      } while (B.again);
      return B;
    } finally { B.running = false; markOutdated(); }               // edits made while it was building: the preview says "out of date"
  })();
  return B.promise;
}

// ───────────────────────────── download: a normal browser download into the Downloads folder ─────────────────────────────
function setDlBusy(on) { S.dlBusy = on; $$('[data-dl]').forEach(b => { b.disabled = on; b.classList.toggle('working', on); }); }

function startDownload(url, file) {
  const a = document.createElement('a');
  a.href = url; a.download = file || ''; a.rel = 'noopener'; a.style.display = 'none';
  document.body.append(a); a.click(); setTimeout(() => a.remove(), 3000);
}

async function checkFile(url) {
  let r;
  try { r = await fetch(url, { method: 'HEAD', cache: 'no-store' }); }
  catch (e) { throw new Error('Cannot reach the program. Is the black program window still open?'); }
  if (!r.ok) {
    S.build.sig = '';                                             // forces a fresh build the next time
    throw new Error('The report file is not on the program any more (was it restarted?). Press the download button again - it will be built again.');
  }
}

const inFrame = (() => { try { return window.self !== window.top; } catch (e) { return true; } })();

async function openDownloads() {
  try {
    const r = await post('/api/open_downloads', {});
    if (!r.ok) toast(r.message || 'Could not open it. Open File Explorer > Downloads yourself.', 'info', 9000);
  } catch (e) { toast('Could not open it. Open File Explorer > Downloads yourself.', 'info', 9000); }
}

function downloadToast(url, file) {
  const st = S.status || {};
  const how = [];
  if (st.can_open_folder) how.push(h('button', { class: 'link', type: 'button', id: 'btn-open-dl', onclick: openDownloads }, 'Open the Downloads folder'), ' \u00b7 ');
  else how.push('Windows: open File Explorer > Downloads, or press Ctrl+J in the browser. ');
  how.push(h('a', { href: url, download: file }, 'Nothing happened? Click here.'));
  const kids = [h('b', {}, 'Download started'), h('br'), `${file} is being saved in your Downloads folder.`, h('small', {}, how)];
  if (inFrame) {                                                  // e.g. the preview window of a website: it may block downloads
    kids.push(h('small', { class: 'frame-note' }, 'This page is shown inside another window. If that window blocks downloads, no file arrives - ',
      'a copy of the report is also kept in the program\'s folder: ', h('b', {}, `${st.outputs || 'outputs'}`), '.'));
  }
  $$('#toasts .toast.dl').forEach(t => t.remove());               // one download message at a time
  toast(h('div', {}, kids), 'ok dl', inFrame ? 30000 : 16000);
}

async function downloadReport(kind) {
  if (!S.sid || S.dlBusy) return;
  setDlBusy(true);
  try {
    await flushDerive();
    const body = buildPayload(), sig = JSON.stringify(body), B = S.build;
    let key = B.key, name = B.name;
    if (!(B.key && B.sig === sig && B.status !== 'error')) {          // the preview shows an older state: build the file for what is on the screen NOW (the preview is left as it is)
      busy('Building the report ...');
      let r; try { r = await post('/api/build', body); } finally { busy(false); }
      key = r.key; name = r.name || name;
      if ((r.notes || []).length) toast(h('div', {}, h('b', {}, 'Left out or simplified in the file because something is missing:'), h('br'), r.notes.join(' ')), 'info', 16000);
    }
    if (!key) throw new Error('The report could not be built.');
    if (kind === 'pdf') {
      busy('Making the PDF ...');
      let r; try { r = await post('/api/pdf', { sid: S.sid, key }); } finally { busy(false); }
      B.pdfMethod = r.method;
      if (r.method === 'images' && r.message) toast(r.message, 'info', 16000);
    }
    const url = `/download/${S.sid}/${key}/${kind}`, file = `${name}.${kind}`;
    await checkFile(url);                                         // the file really is there (a clear message instead of the browser's "Failed - No file")
    startDownload(url, file);
    saveSaved();
    pushHist({ client: S.cover.client, short: S.short, bc: S.cases.flatMap(c => c.bc_items), prepared_by: S.cover.prepared_by, checked_by: S.cover.checked_by });
    B.downloaded = true; B.dlSig = sig; setStep('done'); hideAlert();
    $$('#toasts .toast.dl').forEach(t => t.remove());                 // one download message at a time
    downloadToast(url, file);
  } catch (e) { busy(false); showAlert(e.message); }
  finally { setDlBusy(false); }
}

boot();
