/* ==========================================================================
   MW STUDIO // CAE & FEA VERIFICATION WORKBENCH CONTROLLER (v3.0.1)
   Designed by the 4-Council Engineering & Motion Architecture Team:
   - Live ANSYS Mechanical Project Outline Tree (#cae-tree-body)
   - Live 4-Channel Upload Ingestion Telemetry (#up-telemetry-bar)
   - Table <-> Contact-Sheet Grid View Switcher (#up-view-switch)
   - Collapsible Right Recent Sessions Vault (#btn-vault-toggle)
   - Dual-Theme Switcher (Anodized Carbon Darkroom <-> Swiss Paper Light)
   - Interactive CAD Blueprint Crosshair Canvas (#fea-mesh-canvas)
   ========================================================================== */
(() => {
  'use strict';

  const STORAGE_THEME_KEY = 'mw_fea_studio_theme_v4';
  const STORAGE_VIEW_KEY  = 'mw_fea_up_view_v4';

  // ── 1. Theme Controller (Default: Anodized Carbon Darkroom, Optional: Swiss Paper Light)
  function initTheme() {
    const saved = localStorage.getItem(STORAGE_THEME_KEY) || 'dark';
    applyTheme(saved);
    const btn = document.getElementById('btn-theme-toggle');
    if (btn) {
      btn.addEventListener('click', () => {
        const cur = document.documentElement.getAttribute('data-theme') || 'dark';
        const next = cur === 'dark' ? 'light' : 'dark';
        applyTheme(next);
        localStorage.setItem(STORAGE_THEME_KEY, next);
      });
    }
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    const btn = document.getElementById('btn-theme-toggle');
    const lbl = btn ? btn.querySelector('.theme-lbl') : null;
    if (lbl) {
      lbl.textContent = theme === 'dark' ? 'Paper Light' : 'Carbon Dark';
    }
  }

  // ── 2. Right Session Vault Drawer Toggle
  function initVaultDrawer() {
    const btn = document.getElementById('btn-vault-toggle');
    const wrap = document.getElementById('page-wrap');
    const aside = document.getElementById('recent-aside');
    if (!btn || !wrap || !aside) return;
    btn.addEventListener('click', () => {
      const collapsed = wrap.classList.toggle('vault-collapsed');
      btn.classList.toggle('off', collapsed);
    });
  }

  // ── 3. Upload Table <-> Contact-Sheet Grid View Switcher
  function initUploadViewSwitcher() {
    const sw = document.getElementById('up-view-switch');
    const listWrap = document.getElementById('up-list');
    if (!sw || !listWrap) return;
    const saved = localStorage.getItem(STORAGE_VIEW_KEY) || 'table';
    setUpView(saved);
    sw.querySelectorAll('button[data-vmode]').forEach(btn => {
      btn.addEventListener('click', () => {
        const mode = btn.getAttribute('data-vmode') || 'table';
        setUpView(mode);
        localStorage.setItem(STORAGE_VIEW_KEY, mode);
      });
    });

    function setUpView(mode) {
      listWrap.classList.toggle('view-grid', mode === 'grid');
      sw.querySelectorAll('button[data-vmode]').forEach(b => {
        b.classList.toggle('on', b.getAttribute('data-vmode') === mode);
      });
    }
  }

  // ── 4. Live 4-Channel Upload Ingestion Telemetry Observer
  function syncUploadTelemetry() {
    const upList = document.getElementById('up-list');
    const chTotal = document.getElementById('ch-val-total');
    const chMode  = document.getElementById('ch-val-mode');
    const chCases = document.getElementById('ch-val-cases');
    const chDups  = document.getElementById('ch-val-dups');
    if (!chTotal || !chMode || !chCases || !chDups) return;

    const rows = upList ? Array.from(upList.querySelectorAll('tbody tr')) : [];
    const total = rows.length;
    const dupPrompts = upList ? upList.querySelectorAll('.dup-ask').length : 0;

    const modeBtn = document.querySelector('#up-mode button.on');
    const modeVal = modeBtn ? modeBtn.getAttribute('data-mode') : 'bulk';
    const ncasesSel = document.getElementById('up-ncases');
    const ncasesVal = ncasesSel ? ncasesSel.value : '0';

    chTotal.textContent = `${total} FILE${total === 1 ? '' : 'S'}`;
    chMode.textContent  = modeVal === 'cases' ? 'CASE-BY-CASE' : 'BULK AUTO';
    chCases.textContent = ncasesVal === '0' ? 'AUTO-DETECT' : `${ncasesVal} CASE${ncasesVal === '1' ? '' : 'S'}`;
    chDups.textContent  = dupPrompts > 0 ? `${dupPrompts} PAIR${dupPrompts === 1 ? '' : 'S'} FOUND` : (total > 0 ? 'VERIFIED' : 'READY');
  }

  // ── 5. Live ANSYS Mechanical-Style Project Outline Tree (#cae-tree-body)
  function syncCaeTree() {
    const body = document.getElementById('cae-tree-body');
    const jobTitle = document.getElementById('tree-job-title');
    if (!body) return;

    const sReview = document.getElementById('s-review');
    const isReview = sReview && !sReview.hidden;

    if (!isReview) {
      const rows = document.querySelectorAll('#up-list tbody tr').length;
      if (jobTitle) jobTitle.textContent = `STAGE 01 // ${rows} SCREENSHOT${rows === 1 ? '' : 'S'}`;
      body.innerHTML = `
        <div class="tree-group">
          <div class="tree-root-node">
            <span class="tr-caret">\u25be</span>
            <span class="tr-icon">\u25a3</span>
            <strong>ANSYS INGESTION TREE</strong>
          </div>
          <button type="button" class="tree-leaf on" data-tree-scroll="#up-setup">
            <span class="tl-dot ok"></span>
            <span class="tl-label">01 \u00b7 Job &amp; Upload Mode</span>
            <span class="tl-badge">SETUP</span>
          </button>
          <button type="button" class="tree-leaf" data-tree-scroll="#up-zones">
            <span class="tl-dot ${rows > 0 ? 'ok' : 'wait'}"></span>
            <span class="tl-label">02 \u00b7 CAD Drop Viewport</span>
            <span class="tl-badge">${rows} IMG</span>
          </button>
          <button type="button" class="tree-leaf" data-tree-scroll="#up-listcard">
            <span class="tl-dot ${rows > 0 ? 'ok' : 'wait'}"></span>
            <span class="tl-label">03 \u00b7 Queued Screenshots</span>
            <span class="tl-badge">${rows > 0 ? 'READY' : 'EMPTY'}</span>
          </button>
          <button type="button" class="tree-leaf" data-tree-scroll=".how">
            <span class="tl-dot info"></span>
            <span class="tl-label">04 \u00b7 Verification Gates</span>
            <span class="tl-badge">QA</span>
          </button>
        </div>
      `;
      bindTreeClicks(body);
      return;
    }

    // Review / FEA Verification Studio Mode
    const needCount = document.querySelectorAll('#s-review .need').length;
    const caseCards = Array.from(document.querySelectorAll('#s-review [data-casecard]'));
    const slideThumbs = document.querySelectorAll('#pv-strip .pv-thumb').length;
    if (jobTitle) {
      jobTitle.textContent = needCount === 0
        ? `ALL GATES GREEN (${slideThumbs || 0} SL)`
        : `${needCount} OPEN // ${caseCards.length} CASES`;
    }

    const caseButtonsHtml = caseCards.map(card => {
      const cNum = card.getAttribute('data-casecard');
      const vEl  = card.querySelector('[data-verdict]');
      const vCls = vEl ? (vEl.classList.contains('bad') ? 'bad' : vEl.classList.contains('ok') ? 'ok' : 'warn') : 'info';
      const nameInput = card.querySelector('input[data-need="casename"]');
      const cName = (nameInput && nameInput.value) ? nameInput.value : `Load Case ${cNum}`;
      return `
        <button type="button" class="tree-leaf sub-leaf" data-tree-cat="cases" data-tree-scroll="[data-casecard='${cNum}']">
          <span class="tl-dot ${vCls}"></span>
          <span class="tl-label">Case ${cNum}: ${escapeHtml(cName)}</span>
          <span class="tl-badge">${vCls === 'ok' ? 'PASS' : vCls === 'bad' ? 'PEAK' : 'EDIT'}</span>
        </button>
      `;
    }).join('');

    body.innerHTML = `
      <div class="tree-group">
        <div class="tree-root-node">
          <span class="tr-caret">\u25be</span>
          <span class="tr-icon">\u25c8</span>
          <strong>MECHANICAL FEA MODEL TREE</strong>
        </div>
        <button type="button" class="tree-leaf" data-tree-scroll="#fea-criticality-hud">
          <span class="tl-dot ${needCount === 0 ? 'ok' : 'warn'}"></span>
          <span class="tl-label">00 \u00b7 Chief Engineer HUD</span>
          <span class="tl-badge">HUD</span>
        </button>
        <button type="button" class="tree-leaf" data-tree-scroll="#pv-card">
          <span class="tl-dot info"></span>
          <span class="tl-label">16:9 PowerPoint Stage</span>
          <span class="tl-badge">${slideThumbs || '\u2013'} SL</span>
        </button>
        <button type="button" class="tree-leaf" data-tree-cat="pics" data-tree-scroll="[data-studio-cat='pics']">
          <span class="tl-dot ok"></span>
          <span class="tl-label">01 \u00b7 Pictures &amp; Slide Layout</span>
          <span class="tl-badge">PICS</span>
        </button>
        <button type="button" class="tree-leaf" data-tree-cat="meta" data-tree-scroll="[data-studio-cat='meta']">
          <span class="tl-dot ok"></span>
          <span class="tl-label">02 \u00b7 Cover, Material &amp; Scope</span>
          <span class="tl-badge">MAT</span>
        </button>
        <button type="button" class="tree-leaf" data-tree-cat="geo" data-tree-scroll="[data-studio-cat='geo']">
          <span class="tl-dot ok"></span>
          <span class="tl-label">03 \u00b7 Geometry &amp; Mesh Gate</span>
          <span class="tl-badge">MESH</span>
        </button>
        <button type="button" class="tree-leaf" data-tree-cat="cases" data-tree-scroll="[data-studio-cat='cases']">
          <span class="tl-dot ok"></span>
          <span class="tl-label">04 \u00b7 Structural Load Cases</span>
          <span class="tl-badge">${caseCards.length}</span>
        </button>
        ${caseButtonsHtml}
      </div>
    `;
    bindTreeClicks(body);
  }

  function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, ch => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[ch]));
  }

  function bindTreeClicks(container) {
    container.querySelectorAll('button[data-tree-scroll]').forEach(btn => {
      btn.addEventListener('click', () => {
        const cat = btn.getAttribute('data-tree-cat');
        if (cat) {
          const catBtn = document.querySelector(`#s-review [data-cat-btn="${cat}"]`);
          const allBtn = document.querySelector(`#s-review [data-cat-btn="all"]`);
          if (catBtn && !catBtn.classList.contains('on') && allBtn && !allBtn.classList.contains('on')) {
            catBtn.click();
          }
        }
        const sel = btn.getAttribute('data-tree-scroll');
        const target = sel ? document.querySelector(sel) : null;
        if (target && !target.hidden) {
          target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      });
    });
  }

  window.syncCaeTree = syncCaeTree;

  // ── 6. Interactive CAD Blueprint Crosshair & Node Canvas (#fea-mesh-canvas)
  function initBlueprintCanvas() {
    const canvas = document.getElementById('fea-mesh-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let width = 0, height = 0, dpr = 1;
    const pointer = { x: -9999, y: -9999, active: false };
    const coordEl = document.getElementById('coord-readout');

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = width + 'px';
      canvas.style.height = height + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      draw();
    }

    function draw() {
      ctx.clearRect(0, 0, width, height);
      if (!pointer.active) return;

      const isDark = (document.documentElement.getAttribute('data-theme') || 'dark') === 'dark';
      const strokeColor = isDark ? 'rgba(14, 165, 233, 0.14)' : 'rgba(224, 79, 22, 0.12)';
      const ringColor   = isDark ? 'rgba(224, 79, 22, 0.35)' : 'rgba(224, 79, 22, 0.28)';

      ctx.save();
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 6]);

      ctx.beginPath();
      ctx.moveTo(pointer.x, 0);
      ctx.lineTo(pointer.x, height);
      ctx.moveTo(0, pointer.y);
      ctx.lineTo(width, pointer.y);
      ctx.stroke();

      ctx.setLineDash([]);
      ctx.strokeStyle = ringColor;
      ctx.beginPath();
      ctx.arc(pointer.x, pointer.y, 10, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    window.addEventListener('resize', resize, { passive: true });
    window.addEventListener('pointermove', e => {
      pointer.x = e.clientX;
      pointer.y = e.clientY;
      pointer.active = true;
      if (coordEl) {
        const xStr = String(Math.round(e.clientX)).padStart(4, '0');
        const yStr = String(Math.round(e.clientY)).padStart(4, '0');
        coordEl.textContent = `CAD // ${xStr} : ${yStr}`;
      }
      requestAnimationFrame(draw);
    }, { passive: true });

    document.addEventListener('mouseleave', () => {
      pointer.active = false;
      requestAnimationFrame(draw);
    });

    resize();
  }

  // ── 7. Observe DOM Mutations to Keep Telemetry & ANSYS Outline Tree in Sync
  function initDomObservers() {
    let rafId = 0;
    const scheduleSync = () => {
      if (rafId) return;
      rafId = requestAnimationFrame(() => {
        rafId = 0;
        syncUploadTelemetry();
        syncCaeTree();
      });
    };

    const mainEl = document.getElementById('main');
    if (mainEl) {
      const obs = new MutationObserver(scheduleSync);
      obs.observe(mainEl, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'class'] });
    }
    document.addEventListener('change', scheduleSync, true);
    document.addEventListener('input', scheduleSync, true);
    document.addEventListener('click', scheduleSync, true);
    scheduleSync();
  }

  function boot() {
    initTheme();
    initVaultDrawer();
    initUploadViewSwitcher();
    initBlueprintCanvas();
    initDomObservers();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
