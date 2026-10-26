/* ============================================================================
   ChemSim · labs/plot.js
   ----------------------------------------------------------------------------
   A small line/scatter chart on a <canvas>, used by every guided lab
   (pH curves, temperature–time graphs, Nernst plots). No library needed.

     LabPlot.draw(canvas, {
       x: { label: 'Volume of NaOH / mL', min: 0, max: 50 },
       y: { label: 'pH', min: 0, max: 14 },
       series: [ { pts: [[x, y], …], color: '#22d3ee', width: 2, dots: false, dash: [] } ],
       vlines: [ { x: 25, color: '#fbbf24', label: 'equivalence' } ],
       hlines: [ … ], notes: [ { x, y, text, color } ],
       light: true   // print-friendly colours (for lab reports)
     })
   Axis limits that are left out are worked out from the data.
   ============================================================================ */
'use strict';

const LabPlot = (() => {
  /** "Nice" tick spacing for a range: 1, 2 or 5 × 10ⁿ. */
  function niceStep(range, target = 6) {
    const raw = range / target;
    const p = Math.pow(10, Math.floor(Math.log10(raw)));
    const m = raw / p;
    return (m < 1.5 ? 1 : m < 3 ? 2 : m < 7 ? 5 : 10) * p;
  }
  const fmt = (v, step) => {
    const d = Math.max(0, -Math.floor(Math.log10(step) + 1e-9));
    return v.toFixed(Math.min(4, d));
  };

  function extent(series, k) {
    let lo = Infinity, hi = -Infinity;
    series.forEach((s) => s.pts.forEach((p) => { if (isFinite(p[k])) { lo = Math.min(lo, p[k]); hi = Math.max(hi, p[k]); } }));
    if (!isFinite(lo)) { lo = 0; hi = 1; }
    if (hi - lo < 1e-9) { lo -= 0.5; hi += 0.5; }
    return [lo, hi];
  }

  function draw(canvas, opt) {
    const dpr = window.devicePixelRatio || 1;
    const W = opt.width || canvas.clientWidth || 400, H = opt.height || canvas.clientHeight || 260;
    if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    }
    const c = canvas.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    const col = opt.light
      ? { bg: '#ffffff', grid: '#e5e7eb', axis: '#374151', text: '#111827', dim: '#6b7280' }
      : { bg: '#0f1520', grid: '#1f2a3d', axis: '#64748b', text: '#e6edf3', dim: '#9aa7b8' };
    c.fillStyle = col.bg; c.fillRect(0, 0, W, H);

    const series = opt.series || [];
    const [dx0, dx1] = extent(series, 0), [dy0, dy1] = extent(series, 1);
    let x0 = opt.x && opt.x.min !== undefined ? opt.x.min : dx0;
    let x1 = opt.x && opt.x.max !== undefined ? opt.x.max : dx1;
    let y0 = opt.y && opt.y.min !== undefined ? opt.y.min : dy0;
    let y1 = opt.y && opt.y.max !== undefined ? opt.y.max : dy1;
    if (!(opt.y && opt.y.min !== undefined)) {
      const pad = (y1 - y0) * 0.08;
      y0 -= pad; y1 += pad;
      if (series.some((s) => s.label)) y1 += (y1 - y0) * 0.06 * series.filter((s) => s.label).length;   // room for the legend
    }
    const L = 52, R = 14, T = 14, B = 40;
    const pw = W - L - R, ph = H - T - B;
    const X = (v) => L + ((v - x0) / (x1 - x0)) * pw;
    const Y = (v) => T + ph - ((v - y0) / (y1 - y0)) * ph;

    // grid + ticks
    c.font = '11px Inter, system-ui, sans-serif';
    c.lineWidth = 1;
    const sx = niceStep(x1 - x0), sy = niceStep(y1 - y0, 5);
    c.textAlign = 'center'; c.textBaseline = 'top';
    for (let v = Math.ceil(x0 / sx) * sx; v <= x1 + 1e-9; v += sx) {
      c.strokeStyle = col.grid; c.beginPath(); c.moveTo(X(v), T); c.lineTo(X(v), T + ph); c.stroke();
      c.fillStyle = col.dim; c.fillText(fmt(v, sx), X(v), T + ph + 5);
    }
    c.textAlign = 'right'; c.textBaseline = 'middle';
    for (let v = Math.ceil(y0 / sy) * sy; v <= y1 + 1e-9; v += sy) {
      c.strokeStyle = col.grid; c.beginPath(); c.moveTo(L, Y(v)); c.lineTo(L + pw, Y(v)); c.stroke();
      c.fillStyle = col.dim; c.fillText(fmt(v, sy), L - 6, Y(v));
    }
    c.strokeStyle = col.axis;
    c.beginPath(); c.moveTo(L, T); c.lineTo(L, T + ph); c.lineTo(L + pw, T + ph); c.stroke();
    // axis labels
    c.fillStyle = col.text; c.textAlign = 'center'; c.textBaseline = 'bottom';
    if (opt.x && opt.x.label) c.fillText(opt.x.label, L + pw / 2, H - 4);
    if (opt.y && opt.y.label) {
      c.save(); c.translate(13, T + ph / 2); c.rotate(-Math.PI / 2); c.textBaseline = 'middle'; c.fillText(opt.y.label, 0, 0); c.restore();
    }

    c.save();
    c.beginPath(); c.rect(L, T, pw, ph); c.clip();
    // reference lines
    (opt.vlines || []).forEach((v) => {
      c.strokeStyle = v.color || '#fbbf24'; c.setLineDash(v.dash || [5, 4]); c.lineWidth = 1.2;
      c.beginPath(); c.moveTo(X(v.x), T); c.lineTo(X(v.x), T + ph); c.stroke(); c.setLineDash([]);
      if (v.label) { c.fillStyle = v.color || '#fbbf24'; c.textAlign = 'left'; c.textBaseline = 'top'; c.fillText(v.label, X(v.x) + 4, T + 4 + (v.row || 0) * 13); }
    });
    (opt.hlines || []).forEach((v) => {
      c.strokeStyle = v.color || '#fbbf24'; c.setLineDash(v.dash || [5, 4]); c.lineWidth = 1.2;
      c.beginPath(); c.moveTo(L, Y(v.y)); c.lineTo(L + pw, Y(v.y)); c.stroke(); c.setLineDash([]);
      if (v.label) { c.fillStyle = v.color || '#fbbf24'; c.textAlign = 'right'; c.textBaseline = 'bottom'; c.fillText(v.label, L + pw - 4, Y(v.y) - 2); }
    });
    // shaded bands (e.g. indicator colour-change range)
    (opt.bands || []).forEach((b) => {
      c.fillStyle = b.color; c.fillRect(L, Y(b.y1), pw, Y(b.y0) - Y(b.y1));
    });
    // data
    series.forEach((s) => {
      c.strokeStyle = s.color || '#22d3ee'; c.fillStyle = s.color || '#22d3ee';
      c.lineWidth = s.width || 2; c.setLineDash(s.dash || []);
      if (!s.dots || s.line) {
        c.beginPath();
        let pen = false;
        s.pts.forEach(([a, b]) => {
          if (!isFinite(a) || !isFinite(b)) { pen = false; return; }
          if (!pen) { c.moveTo(X(a), Y(b)); pen = true; } else c.lineTo(X(a), Y(b));
        });
        c.stroke();
      }
      c.setLineDash([]);
      if (s.dots) s.pts.forEach(([a, b]) => { if (isFinite(a) && isFinite(b)) { c.beginPath(); c.arc(X(a), Y(b), s.r || 3, 0, Math.PI * 2); c.fill(); } });
    });
    c.restore();
    (opt.notes || []).forEach((n) => {
      c.fillStyle = n.color || col.text; c.textAlign = n.align || 'left'; c.textBaseline = 'middle';
      c.fillText(n.text, X(n.x) + (n.dx || 6), Y(n.y) + (n.dy || 0));
    });
    // legend
    const named = series.filter((s) => s.label);
    if (named.length) {
      c.textAlign = 'left'; c.textBaseline = 'middle';
      let ly = T + 10;
      const lx = opt.legendLeft ? L + 10 : L + pw - 150;
      named.forEach((s) => {
        c.fillStyle = s.color || '#22d3ee'; c.fillRect(lx, ly - 2, 14, 3);
        c.fillStyle = col.text; c.fillText(s.label, lx + 20, ly);
        ly += 15;
      });
    }
    return { X, Y, x0, x1, y0, y1, L, T, pw, ph };
  }

  /** Least-squares straight line through points → { m, b, r2 }. */
  function linfit(pts) {
    const n = pts.length;
    if (n < 2) return null;
    let sx = 0, sy = 0, sxx = 0, sxy = 0, syy = 0;
    pts.forEach(([x, y]) => { sx += x; sy += y; sxx += x * x; sxy += x * y; syy += y * y; });
    const d = n * sxx - sx * sx;
    if (Math.abs(d) < 1e-12) return null;
    const m = (n * sxy - sx * sy) / d, b = (sy - m * sx) / n;
    const ssTot = syy - (sy * sy) / n;
    let ssRes = 0;
    pts.forEach(([x, y]) => { ssRes += (y - (m * x + b)) ** 2; });
    return { m, b, r2: ssTot > 0 ? 1 - ssRes / ssTot : 1 };
  }

  /** Draw the chart on an off-screen canvas and return a PNG data URL (for reports). */
  function toImage(opt, w = 640, h = 340) {
    const cv = document.createElement('canvas');
    const saved = window.devicePixelRatio;
    draw(cv, { ...opt, width: w, height: h, light: true });
    return cv.toDataURL('image/png');
  }

  return { draw, linfit, toImage, niceStep };
})();
