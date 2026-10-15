'use strict';
/* ═══════════════════════════════════════════════════════════════════════════
   FEA Report Maker — Swiss / Braun Precision CAD Drafting & Telemetry Engine
   - Precision architectural registration crosshairs on #fea-mesh-canvas
   - Live cursor XY blueprint coordinate readout (#coord-readout)
   - Dual-Theme Switcher: Swiss Drafting Paper (Light) & Carbon Darkroom (Dark)
   - Zero 3D-tilt transform interference on <label class="drop zone"> or <select>
   ═══════════════════════════════════════════════════════════════════════════ */

(function () {
  const THEME_KEY = 'fea_studio_theme_v4';
  const html = document.documentElement;

  // 1. Theme Persistence & Switcher (Default: Swiss Drafting Paper 'light')
  function applyTheme(theme) {
    const t = theme === 'dark' ? 'dark' : 'light';
    html.setAttribute('data-theme', t);
    try { localStorage.setItem(THEME_KEY, t); } catch (e) {}
    const btn = document.getElementById('btn-theme-toggle');
    if (btn) {
      const lbl = btn.querySelector('.theme-lbl');
      if (lbl) lbl.textContent = t === 'dark' ? 'Paper Light' : 'Carbon Dark';
    }
  }

  let savedTheme = 'light';
  try { savedTheme = localStorage.getItem(THEME_KEY) || 'light'; } catch (e) {}
  applyTheme(savedTheme);

  window.addEventListener('DOMContentLoaded', () => {
    applyTheme(html.getAttribute('data-theme') || 'light');
    const btn = document.getElementById('btn-theme-toggle');
    if (btn) {
      btn.addEventListener('click', () => {
        const next = html.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
        applyTheme(next);
      });
    }
  });

  // 2. Precision Architectural Registration Crosshair Canvas & XY Readout
  const canvas = document.getElementById('fea-mesh-canvas');
  const coordEl = document.getElementById('coord-readout');
  const pointer = { x: -9999, y: -9999, active: false };

  window.addEventListener('pointermove', e => {
    pointer.x = e.clientX;
    pointer.y = e.clientY;
    pointer.active = true;
    if (coordEl) {
      const xStr = String(Math.max(0, Math.round(e.clientX))).padStart(4, '0');
      const yStr = String(Math.max(0, Math.round(e.clientY))).padStart(4, '0');
      coordEl.textContent = `XY // ${xStr} : ${yStr}`;
    }
  }, { passive: true });

  if (canvas && canvas.getContext) {
    const ctx = canvas.getContext('2d');
    let width = 0, height = 0, dpr = 1;

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = width + 'px';
      canvas.style.height = height + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function drawCrosshair(x, y, size, alpha, isDark, highlight) {
      if (highlight > 0.05) {
        ctx.strokeStyle = isDark
          ? `rgba(255, 90, 31, ${0.22 + highlight * 0.55})`
          : `rgba(224, 79, 22, ${0.22 + highlight * 0.55})`;
      } else {
        ctx.strokeStyle = isDark
          ? `rgba(255, 255, 255, ${alpha})`
          : `rgba(20, 20, 19, ${alpha})`;
      }
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x - size, y + 0.5);
      ctx.lineTo(x + size, y + 0.5);
      ctx.moveTo(x + 0.5, y - size);
      ctx.lineTo(x + 0.5, y + size);
      ctx.stroke();
    }

    function renderFrame() {
      ctx.clearRect(0, 0, width, height);
      const isDark = html.getAttribute('data-theme') === 'dark';
      const step = 96;
      const baseAlpha = isDark ? 0.09 : 0.11;

      for (let x = 48; x < width; x += step) {
        for (let y = 48; y < height; y += step) {
          let highlight = 0;
          if (pointer.active) {
            const dx = x - pointer.x;
            const dy = y - pointer.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < 180) {
              highlight = 1 - dist / 180;
            }
          }
          const sz = highlight > 0.1 ? 4 + highlight * 2.5 : 3.5;
          drawCrosshair(x, y, sz, baseAlpha, isDark, highlight);
        }
      }
      requestAnimationFrame(renderFrame);
    }

    window.addEventListener('resize', resize, { passive: true });
    resize();
    requestAnimationFrame(renderFrame);
  }

  // 3. Staggered Entry Indexing for Dynamic Rows (No 3D Transform Interference)
  function tagStaggerChildren(root) {
    if (!root || !root.querySelectorAll) return;
    const groups = [
      root.querySelectorAll('.up-zones > *'),
      root.querySelectorAll('table.pics tbody tr'),
      root.querySelectorAll('.recent-list > .rf-item'),
    ];
    for (const list of groups) {
      list.forEach((el, idx) => {
        el.style.setProperty('--stagger-i', String(Math.min(idx, 12)));
      });
    }
  }

  const observer = new MutationObserver(mutations => {
    for (const m of mutations) {
      if (m.addedNodes && m.addedNodes.length) {
        tagStaggerChildren(document);
        break;
      }
    }
  });

  window.addEventListener('DOMContentLoaded', () => {
    tagStaggerChildren(document);
    observer.observe(document.body, { childList: true, subtree: true });
  });

  // 4. Crisp Slide Transition Hook on #pv-img
  document.addEventListener('load', e => {
    const t = e.target;
    if (t && t.id === 'pv-img') {
      t.classList.remove('slide-morph-in');
      void t.offsetWidth;
      t.classList.add('slide-morph-in');
    }
  }, true);
})();
