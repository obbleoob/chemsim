/* ============================================================================
   ChemSim · studio/present.js
   ----------------------------------------------------------------------------
   🖼 Presentation mode: a clean, full-screen figure of the drawing for
   reports, posters and slides, exported as SVG (sharp at any size) or PNG.

   SVG export re-uses the normal drawing code (drawMolecule): it is given an
   object that behaves like a canvas 2D context (beginPath, lineTo, arc,
   fillText, gradients…) but writes SVG elements instead of pixels. So the
   figure looks exactly like the screen, arrows and annotations included.
   ============================================================================ */
'use strict';

/** A minimal CanvasRenderingContext2D look-alike that records SVG. */
class SvgContext {
  constructor() {
    this.parts = []; this.defs = []; this.d = ''; this.gid = 0; this.stack = [];
    this.strokeStyle = '#000'; this.fillStyle = '#000'; this.lineWidth = 1; this.lineCap = 'butt'; this.lineJoin = 'miter';
    this.font = '10px sans-serif'; this.textAlign = 'start'; this.textBaseline = 'alphabetic'; this.dash = []; this.globalAlpha = 1;
    this.m = document.createElement('canvas').getContext('2d');    // for measureText
  }
  static f(v) { return Math.round(v * 100) / 100; }
  beginPath() { this.d = ''; }
  moveTo(x, y) { this.d += `M${SvgContext.f(x)} ${SvgContext.f(y)}`; this.cx = x; this.cy = y; }
  lineTo(x, y) { this.d += `${this.d ? 'L' : 'M'}${SvgContext.f(x)} ${SvgContext.f(y)}`; this.cx = x; this.cy = y; }
  closePath() { this.d += 'Z'; }
  rect(x, y, w, h) { this.moveTo(x, y); this.lineTo(x + w, y); this.lineTo(x + w, y + h); this.lineTo(x, y + h); this.closePath(); }
  quadraticCurveTo(cx, cy, x, y) { const f = SvgContext.f; this.d += `Q${f(cx)} ${f(cy)} ${f(x)} ${f(y)}`; this.cx = x; this.cy = y; }
  bezierCurveTo(a, b, c, d, x, y) { const f = SvgContext.f; this.d += `C${f(a)} ${f(b)} ${f(c)} ${f(d)} ${f(x)} ${f(y)}`; }
  arcTo(x1, y1) { this.lineTo(x1, y1); }      // rounded corners become square (only used for tiny boxes)
  arc(x, y, r, a0, a1, ccw = false) {
    const f = SvgContext.f;
    if (Math.abs(a1 - a0) >= 2 * Math.PI - 1e-6) {
      this.d += `${this.d ? 'M' : 'M'}${f(x + r)} ${f(y)}A${f(r)} ${f(r)} 0 1 1 ${f(x - r)} ${f(y)}A${f(r)} ${f(r)} 0 1 1 ${f(x + r)} ${f(y)}`;
      return;
    }
    const x0 = x + r * Math.cos(a0), y0 = y + r * Math.sin(a0), x1 = x + r * Math.cos(a1), y1 = y + r * Math.sin(a1);
    let sweep = a1 - a0; if (ccw) sweep = -sweep; sweep = ((sweep % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    this.d += `${this.d ? 'L' : 'M'}${f(x0)} ${f(y0)}A${f(r)} ${f(r)} 0 ${sweep > Math.PI ? 1 : 0} ${ccw ? 0 : 1} ${f(x1)} ${f(y1)}`;
  }
  ellipse(x, y, rx, ry, rot, a0, a1) { const f = SvgContext.f; this.d += `M${f(x + rx)} ${f(y)}A${f(rx)} ${f(ry)} 0 1 1 ${f(x - rx)} ${f(y)}A${f(rx)} ${f(ry)} 0 1 1 ${f(x + rx)} ${f(y)}`; }
  setLineDash(a) { this.dash = a || []; }
  setTransform() {} translate() {} scale() {} rotate() {} clearRect() {}
  save() { this.stack.push({ s: this.strokeStyle, f: this.fillStyle, w: this.lineWidth, font: this.font, a: this.textAlign, b: this.textBaseline, dash: this.dash }); }
  restore() { const s = this.stack.pop(); if (s) { this.strokeStyle = s.s; this.fillStyle = s.f; this.lineWidth = s.w; this.font = s.font; this.textAlign = s.a; this.textBaseline = s.b; this.dash = s.dash; } }
  paint(p) { return p && p.id ? `url(#${p.id})` : p; }
  stroke() {
    if (!this.d) return;
    this.parts.push(`<path d="${this.d}" fill="none" stroke="${this.paint(this.strokeStyle)}" stroke-width="${SvgContext.f(this.lineWidth)}" stroke-linecap="${this.lineCap}" stroke-linejoin="${this.lineJoin}"${this.dash.length ? ` stroke-dasharray="${this.dash.join(' ')}"` : ''}/>`);
  }
  fill() { if (this.d) this.parts.push(`<path d="${this.d}" fill="${this.paint(this.fillStyle)}"/>`); }
  fillRect(x, y, w, h) { this.parts.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${this.paint(this.fillStyle)}"/>`); }
  strokeRect(x, y, w, h) { this.parts.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="${this.paint(this.strokeStyle)}" stroke-width="${this.lineWidth}"/>`); }
  createRadialGradient(x0, y0, r0, x1, y1, r1) {
    const g = { id: `rg${++this.gid}`, stops: [], addColorStop(o, c) { this.stops.push([o, c]); } };
    this.defs.push(() => `<radialGradient id="${g.id}" gradientUnits="userSpaceOnUse" cx="${x1}" cy="${y1}" r="${r1}">${g.stops.map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`).join('')}</radialGradient>`);
    return g;
  }
  measureText(t) { this.m.font = this.font; return this.m.measureText(t); }
  fillText(t, x, y) {
    const mt = /^(italic )?(\d+) ([\d.]+)px (.*)$/.exec(this.font) || [null, '', '400', '10', 'sans-serif'];
    const anchor = { center: 'middle', right: 'end', end: 'end', left: 'start', start: 'start' }[this.textAlign] || 'start';
    const base = { middle: 'central', top: 'hanging', bottom: 'text-after-edge', alphabetic: 'alphabetic' }[this.textBaseline] || 'alphabetic';
    const esc = String(t).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
    this.parts.push(`<text x="${SvgContext.f(x)}" y="${SvgContext.f(y)}" font-family="Inter, Arial, sans-serif" font-size="${mt[3]}" font-weight="${mt[2]}"${mt[1] ? ' font-style="italic"' : ''} text-anchor="${anchor}" dominant-baseline="${base}" fill="${this.paint(this.fillStyle)}">${esc}</text>`);
  }
  svg(viewBox, w, h, bg) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="${w}" height="${h}">${this.defs.length ? `<defs>${this.defs.map((f) => f()).join('')}</defs>` : ''}${bg ? `<rect x="${viewBox.split(' ')[0]}" y="${viewBox.split(' ')[1]}" width="100%" height="100%" fill="${bg}"/>` : ''}${this.parts.join('')}</svg>`;
  }
}

const Present = (() => {
  const opts = { bg: 'white', caption: '', capSize: 18, show: { formal: true, cip: true, lp: false, ox: false, partial: false } };
  let el = null;

  /** Build the figure as an SVG string. */
  function figureSVG(scale = 1) {
    const saved = { ...state.overlays };
    Object.assign(state.overlays, opts.show);
    try {
      const L = computeLayout(state.analysis);
      const pts = [...state.atoms, ...L.virtualH];
      (state.arrows || []).forEach((ar) => { const q = arrowCurve(ar, L); if (q) pts.push(q.p0, q.p1, bez(q, 0.5)); });
      const pad = 30;
      const minX = Math.min(...pts.map((p) => p.x)) - pad, maxX = Math.max(...pts.map((p) => p.x)) + pad;
      const minY = Math.min(...pts.map((p) => p.y)) - pad;
      let maxY = Math.max(...pts.map((p) => p.y)) + pad;
      const capH = opts.caption ? opts.capSize * 2 : 0;
      maxY += capH;
      const ink = opts.bg === 'dark' ? THEMES.light : THEMES.dark;
      const c = new SvgContext();
      drawMolecule(c, L, ink, false);
      if (opts.caption) {
        c.font = `600 ${opts.capSize}px Inter`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = opts.bg === 'dark' ? '#ffffff' : '#111111';
        c.fillText(opts.caption, (minX + maxX) / 2, maxY - capH / 2 - 4);
      }
      const w = maxX - minX, h = maxY - minY;
      return c.svg(`${minX} ${minY} ${w} ${h}`, Math.round(w * scale), Math.round(h * scale), opts.bg === 'white' ? '#ffffff' : opts.bg === 'dark' ? '#0b0f17' : null);
    } finally { Object.assign(state.overlays, saved); }
  }

  function download(name, blob) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  function exportSVG() { download(`${fileBaseName()}.svg`, new Blob([figureSVG(1)], { type: 'image/svg+xml' })); toast('SVG saved: scales to any size ⬇'); }
  function exportPNG() {
    const svg = figureSVG(4);
    const img = new Image();
    img.onload = () => {
      const cv = document.createElement('canvas');
      cv.width = img.width; cv.height = img.height;
      cv.getContext('2d').drawImage(img, 0, 0);
      cv.toBlob((b) => { download(`${fileBaseName()}-figure.png`, b); toast('PNG saved (4× resolution) ⬇'); });
    };
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }

  function open() {
    if (!state.atoms.length) { toast('Draw a molecule first'); return; }
    if (!el) build();
    const common = document.getElementById('p-common');
    if (!opts.caption) opts.caption = common && !['—', '…', ''].includes(common.textContent.trim()) ? common.textContent.trim() : '';
    el.querySelector('#pr-cap').value = opts.caption;
    el.classList.remove('hidden');
    refresh();
    log('present', 'Presentation mode opened');
  }
  function close() { if (el) el.classList.add('hidden'); }

  function refresh() { el.querySelector('#pr-fig').innerHTML = figureSVG(1).replace(/width="\d+" height="\d+"/, 'width="100%" height="100%"'); el.querySelector('#pr-fig').className = `pr-fig ${opts.bg}`; }

  function build() {
    el = document.createElement('div');
    el.className = 'present-overlay hidden';
    el.setAttribute('role', 'dialog');
    el.innerHTML = `
      <div class="pr-bar"><b>🖼 Presentation</b>
        <label class="ctl">Background <select id="pr-bg"><option value="white">White (print)</option><option value="dark">Dark (slides)</option><option value="none">Transparent</option></select></label>
        ${Object.entries({ formal: 'Formal charges', cip: 'R/S, E/Z', lp: 'Lone pairs', ox: 'Oxidation numbers', partial: 'Partial charges' }).map(([k, t]) => `<label class="chip"><input type="checkbox" data-ov="${k}"${opts.show[k] ? ' checked' : ''}/> ${t}</label>`).join('')}
        <input type="text" id="pr-cap" placeholder="Caption (name, figure number…)" style="width:220px"/>
        <span class="lab-spacer"></span>
        <button class="hbtn small accent" id="pr-svg">⬇ SVG</button><button class="hbtn small" id="pr-png">⬇ PNG</button><button class="hbtn small" id="pr-close">✕ Close</button></div>
      <div class="pr-stage"><div class="pr-fig" id="pr-fig"></div></div>`;
    document.body.appendChild(el);
    el.querySelector('#pr-bg').addEventListener('change', (e) => { opts.bg = e.target.value; refresh(); });
    el.querySelectorAll('[data-ov]').forEach((c) => c.addEventListener('change', () => { opts.show[c.dataset.ov] = c.checked; refresh(); }));
    el.querySelector('#pr-cap').addEventListener('input', (e) => { opts.caption = e.target.value; refresh(); });
    el.querySelector('#pr-svg').addEventListener('click', exportSVG);
    el.querySelector('#pr-png').addEventListener('click', exportPNG);
    el.querySelector('#pr-close').addEventListener('click', close);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !el.classList.contains('hidden')) close(); });
  }

  return { open, close, figureSVG, opts };
})();
