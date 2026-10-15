/* ═══════════════════════════════════════════════════════════════════════════
   FEA Report Maker v3.0.1 — Kinetic Studio Motion & Telemetry Engine
   Designed by the Creative Gen-Z UI & FEA Engineering Council
   Zero-interference visual & physics layer:
     1. 60fps Interactive Finite-Element Truss & Nodal Displacement Canvas
     2. Cursor-Tracking Specular Glass Spotlight & 3D Micro-Tilt
     3. Staggered Spring Choreography on Dynamic DOM Cards & Rows
     4. Cinema Slide Flip Morphing & Dual-Theme (Obsidian / Daylight) Switcher
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  const root = document.documentElement;

  /* ───────── 1. Dual-Theme Engine (Obsidian Dark Studio <-> Daylight Light Studio) ───────── */
  const savedTheme = localStorage.getItem('fea_studio_theme') || 'dark';
  setTheme(savedTheme);

  function setTheme(mode) {
    const t = mode === 'light' ? 'light' : 'dark';
    root.setAttribute('data-theme', t);
    try { localStorage.setItem('fea_studio_theme', t); } catch (_) {}
    const lbl = document.getElementById('theme-label');
    if (lbl) lbl.textContent = t === 'dark' ? 'Daylight' : 'Obsidian';
  }

  const themeBtn = document.getElementById('btn-theme-toggle');
  if (themeBtn) {
    themeBtn.addEventListener('click', () => {
      const cur = root.getAttribute('data-theme') || 'dark';
      setTheme(cur === 'dark' ? 'light' : 'dark');
    });
  }

  /* ───────── 2. 60fps Interactive Finite-Element Truss & Nodal Mesh Canvas ───────── */
  const canvas = document.getElementById('fea-mesh-canvas');
  if (canvas && canvas.getContext) {
    const ctx = canvas.getContext('2d');
    let W = 0, H = 0, dpr = 1;
    let nodes = [];
    const mouse = { x: -9999, y: -9999, vx: 0, vy: 0, active: false };

    function initMesh() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = window.innerWidth;
      H = window.innerHeight;
      canvas.width = Math.floor(W * dpr);
      canvas.height = Math.floor(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const count = Math.min(58, Math.max(26, Math.floor((W * H) / 28000)));
      nodes = [];
      for (let i = 0; i < count; i++) {
        const bx = Math.random() * W;
        const by = Math.random() * H;
        nodes.push({
          bx, by,
          x: bx, y: by,
          vx: (Math.random() - 0.5) * 0.38,
          vy: (Math.random() - 0.5) * 0.38,
          phase: Math.random() * Math.PI * 2,
          freq: 0.008 + Math.random() * 0.012,
          r: 1.6 + Math.random() * 1.4,
          stress: Math.random(),
        });
      }
    }

    window.addEventListener('resize', initMesh, { passive: true });
    window.addEventListener('pointermove', (e) => {
      mouse.x = e.clientX;
      mouse.y = e.clientY;
      mouse.active = true;
    }, { passive: true });
    window.addEventListener('pointerleave', () => {
      mouse.active = false;
    }, { passive: true });

    initMesh();

    function drawFrame() {
      ctx.clearRect(0, 0, W, H);
      const isDark = (root.getAttribute('data-theme') || 'dark') === 'dark';
      const maxDist = Math.min(220, Math.max(150, W * 0.13));
      const mouseRadius = 210;

      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        n.phase += n.freq;
        n.bx += n.vx;
        n.by += n.vy;

        if (n.bx < -20) n.bx = W + 20;
        if (n.bx > W + 20) n.bx = -20;
        if (n.by < -20) n.by = H + 20;
        if (n.by > H + 20) n.by = -20;

        let dx = 0, dy = 0, strain = 0;
        if (mouse.active) {
          const mx = n.bx - mouse.x;
          const my = n.by - mouse.y;
          const dist = Math.hypot(mx, my);
          if (dist < mouseRadius && dist > 1) {
            const f = (1 - dist / mouseRadius);
            const push = f * f * 22;
            dx = (mx / dist) * push;
            dy = (my / dist) * push;
            strain = f;
          }
        }
        n.x += (n.bx + Math.cos(n.phase) * 6 + dx - n.x) * 0.12;
        n.y += (n.by + Math.sin(n.phase) * 6 + dy - n.y) * 0.12;
        n.strain = strain;
      }

      /* Draw finite-element truss edges */
      ctx.lineWidth = 1;
      for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i];
        for (let j = i + 1; j < nodes.length; j++) {
          const b = nodes[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < maxDist * maxDist) {
            const d = Math.sqrt(d2);
            const alpha = (1 - d / maxDist);
            const s = Math.max(a.strain || 0, b.strain || 0);
            if (isDark) {
              if (s > 0.15) {
                ctx.strokeStyle = `rgba(56, 189, 248, ${(alpha * (0.22 + s * 0.45)).toFixed(3)})`;
              } else {
                ctx.strokeStyle = `rgba(96, 165, 250, ${(alpha * 0.14).toFixed(3)})`;
              }
            } else {
              if (s > 0.15) {
                ctx.strokeStyle = `rgba(37, 99, 235, ${(alpha * (0.18 + s * 0.32)).toFixed(3)})`;
              } else {
                ctx.strokeStyle = `rgba(30, 64, 175, ${(alpha * 0.09).toFixed(3)})`;
              }
            }
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
        }
      }

      /* Draw finite-element nodes */
      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        const s = n.strain || 0;
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r + s * 1.8, 0, Math.PI * 2);
        if (isDark) {
          ctx.fillStyle = s > 0.2
            ? `rgba(56, 189, 248, ${(0.55 + s * 0.4).toFixed(2)})`
            : 'rgba(148, 163, 184, 0.32)';
        } else {
          ctx.fillStyle = s > 0.2
            ? `rgba(37, 99, 235, ${(0.45 + s * 0.4).toFixed(2)})`
            : 'rgba(71, 85, 105, 0.24)';
        }
        ctx.fill();
      }

      requestAnimationFrame(drawFrame);
    }

    requestAnimationFrame(drawFrame);
  }

  /* ───────── 3. Cursor-Tracking Specular Glass Spotlight & 3D Micro-Tilt ───────── */
  const SPOTLIGHT_SEL = '.card, .zone, .recent-card, .how > div, .xitem, .rf-item';
  const TILT_SEL = '.zone, .how > div';

  document.addEventListener('pointermove', (e) => {
    const target = e.target && e.target.closest ? e.target.closest(SPOTLIGHT_SEL) : null;
    if (!target) return;
    const r = target.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    target.style.setProperty('--mx', `${x.toFixed(1)}px`);
    target.style.setProperty('--my', `${y.toFixed(1)}px`);

    const tiltEl = e.target.closest(TILT_SEL);
    if (tiltEl && r.width > 0 && r.height > 0) {
      const nx = (x / r.width) - 0.5;
      const ny = (y / r.height) - 0.5;
      tiltEl.style.setProperty('--rx', `${(-ny * 4.5).toFixed(2)}deg`);
      tiltEl.style.setProperty('--ry', `${(nx * 4.5).toFixed(2)}deg`);
    }
  }, { passive: true });

  document.addEventListener('pointerout', (e) => {
    const tiltEl = e.target && e.target.closest ? e.target.closest(TILT_SEL) : null;
    if (tiltEl && (!e.relatedTarget || !tiltEl.contains(e.relatedTarget))) {
      tiltEl.style.setProperty('--rx', '0deg');
      tiltEl.style.setProperty('--ry', '0deg');
    }
  }, { passive: true });

  /* ───────── 4. Staggered Spring Choreography on Dynamic Cards & Rows ───────── */
  function tagStaggerChildren(container, childSelector, maxStagger) {
    if (!container) return;
    const kids = container.querySelectorAll(childSelector);
    kids.forEach((el, idx) => {
      if (!el.hasAttribute('data-staggered')) {
        el.setAttribute('data-staggered', '1');
        el.style.setProperty('--stagger-i', String(Math.min(idx, maxStagger || 12)));
      }
    });
  }

  function refreshChoreography() {
    tagStaggerChildren(document.getElementById('up-zones'), '.zone, .zone-add', 10);
    tagStaggerChildren(document.getElementById('up-list'), 'tbody tr', 14);
    tagStaggerChildren(document.getElementById('s-review'), ':scope > .card', 12);
    tagStaggerChildren(document.getElementById('recent-list'), '.rf-item', 10);
  }

  refreshChoreography();

  const mo = new MutationObserver((mutations) => {
    let needsRefresh = false;
    for (const m of mutations) {
      if (m.addedNodes && m.addedNodes.length > 0) {
        needsRefresh = true;
        break;
      }
    }
    if (needsRefresh) refreshChoreography();
  });

  const mainEl = document.getElementById('main');
  const asideEl = document.getElementById('recent-aside');
  if (mainEl) mo.observe(mainEl, { childList: true, subtree: true });
  if (asideEl) mo.observe(asideEl, { childList: true, subtree: true });

  /* ───────── 5. Cinema Slide Flip Morphing in Report Preview ───────── */
  document.addEventListener('load', (e) => {
    const t = e.target;
    if (t && t.id === 'pv-img') {
      t.classList.remove('slide-morph-in');
      void t.offsetWidth;
      t.classList.add('slide-morph-in');
    }
  }, true);
})();
