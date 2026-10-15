'use strict';
/* FEA Report Maker - the upload page: how many load cases, bulk or case by case, a name and a type for every picture.
   (Loaded before app.js; it uses h(), $(), api(), busy(), showAlert() and startReview() from app.js when it RUNS, never when it loads.) */

const RESULT_OPTIONS = [['', 'Not sure'], ['vm', 'Von-Mises (equivalent) stress'], ['max_shear', 'Maximum shear stress'], ['shear', 'Shear stress'],
  ['max_principal', 'Maximum principal stress'], ['min_principal', 'Minimum principal stress'], ['mid_principal', 'Middle principal stress'],
  ['intensity', 'Stress intensity'], ['normal', 'Normal stress'], ['dir_def', 'Directional deformation'], ['strain', 'Elastic strain'], ['safety', 'Safety factor']];
const VIEW_OPTIONS = [['', 'Not sure'], ['zoom', 'Zoomed view'], ['section', 'Cut section']];
const DUP_OPTIONS = [
  ['', 'Choose: same or separate slide ...'],
  ['same', 'Same slide'],
  ['same_section', 'Same slide \u2014 as Cut section'],
  ['same_zoom', 'Same slide \u2014 as Zoomed section'],
  ['separate', 'Separate slides'],
  ['sep_section', 'Separate slides \u2014 as Cut section'],
  ['sep_zoom', 'Separate slides \u2014 as Zoomed section'],
];
const UP_TYPES = [['auto', 'Let the app decide'], ['geometry', 'Geometry (the model)'], ['mesh', 'Mesh'], ['bc', 'Setup: loads & supports'],
  ['deformation', 'Total deformation'], ['stress', 'Von-Mises (equivalent) stress'], ['x_other', 'Another result: shear, principal, one part ...'],
  ['view', 'Zoomed or cut-section picture'], ['unused', 'Do not use']];
const NCASE_HELP = {
  '': 'Not sure? That is fine: I find out from the pictures (every ANSYS system letter A, B, ... is one load case).',
  '1': 'Every setup, deformation and stress picture will go into Case 1.',
  many: n => `I will look for ${n} load cases. If the pictures make a different number, I tell you.`,
};

const U = { sid: null, mode: 'bulk', ncases: '', zones: 2, items: [], seq: 0 };
const ncasesValue = () => (/^\d+$/.test(U.ncases) ? parseInt(U.ncases, 10) : null);
const caseChoices = () => { const n = ncasesValue(); return Math.max(n || 0, n ? n : U.mode === 'cases' ? U.zones : 6, 2); };
const fmtSize = b => (b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB');

function initUpload() {
  const sel = $('#up-ncases');
  sel.replaceChildren(h('option', { value: '' }, 'Not sure - find out from the pictures'),
    ...Array.from({ length: 8 }, (_, i) => h('option', { value: String(i + 1) }, i === 0 ? '1 load case' : `${i + 1} load cases`)));
  sel.addEventListener('change', () => { U.ncases = sel.value; syncSetup(); renderZones(); renderList(); });
  $$('#up-mode button').forEach(b => b.addEventListener('click', () => { U.mode = b.dataset.mode; syncSetup(); renderZones(); renderList(); }));
  $('#up-read').addEventListener('click', readPictures);
  if ($('#up-save')) $('#up-save').addEventListener('click', saveUploadDraft);
  $('#up-clear').addEventListener('click', () => { U.items.forEach(it => URL.revokeObjectURL(it.url)); U.items = []; U.sid = null; renderZones(); renderList(); });
  window.addEventListener('dragover', e => e.preventDefault());
  window.addEventListener('drop', e => e.preventDefault());
  syncSetup(); renderZones(); renderList();
}

function syncSetup() {
  $$('#up-mode button').forEach(b => { const on = b.dataset.mode === U.mode; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); });
  const n = ncasesValue();
  $('#up-ncases-help').textContent = n === null ? NCASE_HELP[''] : n === 1 ? NCASE_HELP['1'] : NCASE_HELP.many(n);
  $('#up-mode-help').textContent = U.mode === 'bulk'
    ? 'Drop every picture of the job into one box, in any order. You can still name each picture below.'
    : 'Drop the pictures of each load case into its own box. The geometry and mesh pictures go into the first box.';
}

// ───── the drop zones
function zoneCount(key) {
  return U.items.filter(it => (key === 'all') || (key === 'general' ? !it.case : String(it.case) === String(key))).length;
}

function dropZone(key, title, sub, onClose) {
  const file = h('input', { type: 'file', multiple: true, accept: 'image/*,.png,.jpg,.jpeg,.bmp,.tif,.tiff,.webp', hidden: true, id: key === 'all' ? 'file' : `file-${key}` });
  const cnt = h('em', { class: 'zc', 'data-zc': key }, '');
  const closeBtn = onClose ? h('button', {
    class: 'zone-close', type: 'button', title: `Close Load case ${key}`, 'aria-label': `Close Load case ${key}`,
    onclick: e => { e.preventDefault(); e.stopPropagation(); onClose(); }
  }, '\u2715') : null;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 48 48'); svg.setAttribute('width', key === 'all' ? '50' : '34'); svg.setAttribute('height', key === 'all' ? '50' : '34'); svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = '<path d="M24 33V12m0 0l-9 9m9-9l9 9" fill="none" stroke="#2a6fa6" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><path d="M8 33v5a3 3 0 003 3h26a3 3 0 003-3v-5" fill="none" stroke="#2a6fa6" stroke-width="3" stroke-linecap="round"/>';
  const box = h('label', { class: 'drop zone' + (key === 'all' ? ' wide' : ''), 'data-zone': key }, closeBtn, svg, h('b', {}, title), h('span', {}, sub), cnt, file);
  file.addEventListener('change', () => { const fl = Array.from(file.files); file.value = ''; if (fl.length) addFiles(fl, key); });
  ['dragenter', 'dragover'].forEach(ev => box.addEventListener(ev, e => { e.preventDefault(); box.classList.add('over'); }));
  ['dragleave', 'drop'].forEach(ev => box.addEventListener(ev, e => { e.preventDefault(); box.classList.remove('over'); }));
  box.addEventListener('drop', e => { const fl = Array.from(e.dataTransfer.files); if (fl.length) addFiles(fl, key); });
  return box;
}

function closeZone(k) {
  const cur = ncasesValue() || U.zones;
  U.items = U.items.filter(it => {
    if (Number(it.case) === k) { URL.revokeObjectURL(it.url); return false; }
    if (Number(it.case) > k) it.case = String(Number(it.case) - 1);
    return true;
  });
  if (cur > 1) {
    const next = cur - 1;
    U.zones = next;
    if (ncasesValue()) { U.ncases = String(next); $('#up-ncases').value = U.ncases; syncSetup(); }
  }
  renderZones(); renderList();
}

function zoneCountText() {
  $$('[data-zc]').forEach(el => { const n = zoneCount(el.dataset.zc); el.textContent = n ? `${n} picture${n > 1 ? 's' : ''} added` : ''; });
}

function renderZones() {
  const host = $('#up-zones'), n = ncasesValue();
  if (U.mode === 'bulk') {
    host.className = 'up-zones one';
    host.replaceChildren(dropZone('all', 'Drag the pictures here', 'or click to choose them \u00b7 PNG or JPG \u00b7 put all pictures of the job in together (geometry, mesh, and the setup / deformation / stress pictures of every load case)'));
  } else {
    const count = n || U.zones;
    host.className = 'up-zones multi';
    const zs = [dropZone('general', 'General pictures', 'Geometry (the model) and mesh')];
    for (let k = 1; k <= count; k++) {
      const canClose = count > 1 || zoneCount(k) > 0;
      zs.push(dropZone(k, `Load case ${k}`, 'Setup (loads & supports), deformation, stress and any other result of this case', canClose ? () => closeZone(k) : null));
    }
    if (count < 8) zs.push(h('button', { class: 'zone-add', type: 'button', onclick: () => {
      const next = count + 1; U.zones = next;
      if (ncasesValue()) { U.ncases = String(next); $('#up-ncases').value = U.ncases; syncSetup(); }
      renderZones(); renderList();
    } }, '+ Add another load case'));
    host.replaceChildren(...zs);
  }
  zoneCountText();
}

// ───── the pictures that were added
function upDupKey(it) {
  if (!it || ['auto', 'unused', 'view'].includes(it.type)) return null;
  if (it.type === 'geometry' || it.type === 'mesh') return it.type;
  const c = it.case || (ncasesValue() === 1 ? '1' : '');
  if (!c) return null;
  if (it.type === 'x_other') return `x_other:${c}:${it.kind || ''}`;
  return `${it.type}:${c}`;
}

function addFiles(files, zone) {
  const pics = files.filter(f => /\.(png|jpe?g|bmp|tiff?|webp)$/i.test(f.name));
  const bad = files.length - pics.length;
  if (bad) showAlert(`${bad} file${bad > 1 ? 's were' : ' was'} left out: only picture files (PNG or JPG) can be used.`, 'warn'); else hideAlert();
  for (const f of pics) {
    U.items.push({ id: ++U.seq, file: f, url: URL.createObjectURL(f), name: '', type: 'auto', kind: '', view: '', dup_mode: '', case: typeof zone === 'number' ? zone : '' });
  }
  if (typeof zone === 'number' && zone > U.zones) U.zones = zone;
  renderZones(); renderList();
}

function removeItem(it) { URL.revokeObjectURL(it.url); U.items = U.items.filter(x => x !== it); renderZones(); renderList(); }

function renderList() {
  const card = $('#up-listcard'), n = U.items.length;
  card.hidden = n === 0;
  $('#up-read').disabled = n === 0;
  if ($('#up-save')) $('#up-save').disabled = n === 0;
  $('#up-count').textContent = n ? `${n} picture${n > 1 ? 's' : ''} ready` : '';
  $('#up-clear').hidden = n === 0;
  if (!n) { $('#up-list').replaceChildren(); return; }
  const dupWraps = new Map();
  const refreshUpDups = () => {
    const counts = new Map();
    for (const it of U.items) {
      const k = upDupKey(it);
      if (k) counts.set(k, (counts.get(k) || 0) + 1);
    }
    for (const it of U.items) {
      const w = dupWraps.get(it.id);
      if (!w) continue;
      const k = upDupKey(it);
      w.hidden = !(k && (counts.get(k) || 0) > 1);
    }
  };
  const rows = U.items.map(it => {
    const name = h('input', { type: 'text', value: it.name, 'aria-label': `Name of ${it.file.name}`, placeholder: 'optional, e.g. case 2 equivalent stress' });
    name.addEventListener('input', () => { it.name = name.value; });
    const type = h('select', { class: 'sel', 'aria-label': `What is ${it.file.name}` }, UP_TYPES.map(([v, t]) => h('option', { value: v, selected: v === it.type }, t)));
    const kind = h('select', { class: 'sub-sel', 'aria-label': `Which result is ${it.file.name}` }, RESULT_OPTIONS.map(([v, t]) => h('option', { value: v, selected: v === it.kind }, t)));
    const view = h('select', { class: 'sub-sel', 'aria-label': `Kind of picture ${it.file.name}` }, VIEW_OPTIONS.map(([v, t]) => h('option', { value: v, selected: v === it.view }, t)));
    const dupSel = h('select', { class: 'sub-sel dup-sel', 'aria-label': `Slide placement for duplicate category of ${it.file.name}` },
      DUP_OPTIONS.map(([v, t]) => h('option', { value: v, selected: v === (it.dup_mode || '') }, t)));
    const kindWrap = h('label', { class: 'sub' }, h('span', {}, 'Which result?'), kind), viewWrap = h('label', { class: 'sub' }, h('span', {}, 'Kind of picture'), view);
    const dupWrap = h('label', { class: 'sub dup-ask', hidden: true },
      h('span', {}, 'Same category selected \u2014 place on slide as:'), dupSel);
    dupWraps.set(it.id, dupWrap);
    const cs = h('select', { class: 'cs', 'aria-label': `Load case of ${it.file.name}` }, h('option', { value: '', selected: !it.case }, 'Auto'),
      Array.from({ length: caseChoices() }, (_, i) => h('option', { value: String(i + 1), selected: String(it.case) === String(i + 1) }, `Case ${i + 1}`)));
    const sync = () => {
      kindWrap.hidden = it.type !== 'x_other'; viewWrap.hidden = it.type !== 'view';
      const noCase = ['geometry', 'mesh', 'unused'].includes(it.type); cs.disabled = noCase;
      name.placeholder = it.type === 'view' ? 'what it shows, e.g. equivalent stress' : it.type === 'x_other' ? 'the part, e.g. shaft' : 'optional, e.g. case 2 equivalent stress';
      refreshUpDups();
    };
    type.addEventListener('change', () => { it.type = type.value; if (['geometry', 'mesh', 'unused'].includes(it.type)) { it.case = ''; cs.value = ''; } sync(); });
    kind.addEventListener('change', () => { it.kind = kind.value; refreshUpDups(); });
    view.addEventListener('change', () => { it.view = view.value; });
    dupSel.addEventListener('change', () => {
      it.dup_mode = dupSel.value;
      const k = upDupKey(it);
      if (k) {
        U.items.forEach(other => {
          if (other !== it && upDupKey(other) === k && !other.dup_mode) {
            other.dup_mode = dupSel.value;
            const ow = dupWraps.get(other.id);
            if (ow) { const os = ow.querySelector('select'); if (os) os.value = dupSel.value; }
          }
        });
      }
    });
    cs.addEventListener('change', () => { it.case = cs.value; zoneCountText(); refreshUpDups(); });
    sync();
    const im = h('img', { class: 'thumb', src: it.url, alt: '', title: 'Click to enlarge' });
    im.addEventListener('click', () => lightbox(it.url));
    return h('tr', {}, h('td', {}, im), h('td', { class: 'fn' }, it.file.name, h('small', {}, fmtSize(it.file.size))),
      h('td', {}, name), h('td', {}, type, kindWrap, viewWrap, dupWrap), h('td', {}, cs),
      h('td', {}, h('button', { class: 'icon', type: 'button', title: 'Remove this picture', onclick: () => removeItem(it) }, '\u2715')));
  });
  $('#up-list').replaceChildren(h('table', { class: 'pics up' },
    h('thead', {}, h('tr', {}, ['', 'File', 'Name (what it shows)', 'What is it?', 'Load case', ''].map(t => h('th', {}, t)))), h('tbody', {}, rows)));
  refreshUpDups();
}

// ───── send them to the program
function manifestOf(it, caseMap) {
  const m = {};
  const label = it.name.trim(); if (label) m.label = label;
  if (it.case) {
    const raw = parseInt(it.case, 10);
    m.case = (caseMap && caseMap.has(raw)) ? caseMap.get(raw) : raw;
  }
  if (it.type && it.type !== 'auto') m.role = it.type;
  if (it.type === 'x_other' && it.kind) m.kind = it.kind;
  if (it.type === 'view' && it.view) m.view = it.view;
  if (it.dup_mode) m.dup_mode = it.dup_mode;
  return m;
}

async function saveUploadDraft() {
  const items = U.items;
  if (!items.length) { showAlert('Please add pictures first before saving.', 'warn'); return; }
  busy(`Saving ${items.length} picture${items.length > 1 ? 's' : ''} to Recent Files ...`);
  const fd = new FormData();
  items.forEach(it => fd.append('files', it.file, it.file.name));
  fd.append('items', JSON.stringify(items.map(it => ({ name: it.name, type: it.type, kind: it.kind, view: it.view, dup_mode: it.dup_mode || '', case: it.case }))));
  fd.append('mode', U.mode);
  fd.append('ncases', U.ncases || '');
  fd.append('zones', String(U.zones));
  if (U.sid) fd.append('sid', U.sid);
  try {
    const r = await api('/api/save_upload', { method: 'POST', body: fd });
    U.sid = r.sid;
    if (typeof loadRecentFiles === 'function') await loadRecentFiles();
    if (typeof showSaveConfirmation === 'function') showSaveConfirmation(r.entry || { title: `Upload Draft (${items.length} pictures)`, status_label: 'Partially Saved', saved_dt: r.saved_dt });
  } catch (e) { showAlert(e.message); }
  finally { busy(false); }
}

async function restoreUploadDraft(r) {
  const up = r.upload || {};
  const items = up.items || [];
  busy(`Opening saved draft (${items.length} picture${items.length !== 1 ? 's' : ''}) ...`);
  try {
    U.items.forEach(it => URL.revokeObjectURL(it.url));
    U.items = [];
    U.sid = r.sid;
    U.mode = up.mode || 'bulk';
    U.ncases = up.ncases || '';
    U.zones = up.zones || 2;
    const sel = $('#up-ncases');
    if (sel) sel.value = U.ncases;
    for (const meta of items) {
      const resp = await fetch(`/api/upload_img/${r.sid}/${meta.idx}`);
      if (!resp.ok) continue;
      const blob = await resp.blob();
      const file = new File([blob], meta.filename, { type: blob.type || 'image/png' });
      U.items.push({
        id: ++U.seq,
        file,
        url: URL.createObjectURL(file),
        name: meta.name || '',
        type: meta.type || 'auto',
        kind: meta.kind || '',
        view: meta.view || '',
        dup_mode: meta.dup_mode || '',
        case: meta.case !== undefined && meta.case !== null ? meta.case : '',
      });
    }
    show('upload');
    syncSetup(); renderZones(); renderList();
    if (typeof loadRecentFiles === 'function') loadRecentFiles();
    toast(h('div', {}, h('b', {}, 'Opened saved draft'), h('br'), `${items.length} picture${items.length !== 1 ? 's' : ''} restored (${r.saved_dt || ''})`), 'ok', 6000);
  } catch (e) { showAlert(e.message); }
  finally { busy(false); }
}

async function readPictures() {
  const items = U.items;
  if (!items.length) { showAlert('Please add the pictures first (drag them into the box).'); return; }
  const usedCases = [...new Set(items
    .filter(it => !['geometry', 'mesh', 'unused'].includes(it.type) && it.case)
    .map(it => parseInt(it.case, 10)).filter(Boolean))].sort((a, b) => a - b);
  const caseMap = new Map(usedCases.map((c, idx) => [c, idx + 1]));
  const ac = new AbortController();
  busy(`Reading ${items.length} picture${items.length > 1 ? 's' : ''} ... a few seconds`, () => ac.abort());
  const fd = new FormData();
  items.forEach(it => fd.append('files', it.file, it.file.name));
  fd.append('manifest', JSON.stringify(items.map(it => manifestOf(it, caseMap))));
  const nc = ncasesValue();
  const effectiveNc = usedCases.length ? (nc ? Math.min(nc, usedCases.length) : (U.mode === 'cases' ? usedCases.length : null)) : nc;
  if (effectiveNc) fd.append('ncases', String(effectiveNc));
  if (U.sid) fd.append('sid', U.sid);
  try {
    startReview(await api('/api/analyze', { method: 'POST', body: fd, signal: ac.signal }));
    U.items.forEach(it => URL.revokeObjectURL(it.url)); U.items = []; U.sid = null; renderZones(); renderList();      // the next report starts with an empty list
  }
  catch (e) { if (ac.signal.aborted) showAlert('Cancelled. Press "Read the pictures" when you are ready.', 'warn'); else showAlert(e.message); }
  finally { busy(false); }
}
