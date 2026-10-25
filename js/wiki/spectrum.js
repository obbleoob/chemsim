/* ============================================================================
   ChemSim · wiki/spectrum.js
   ----------------------------------------------------------------------------
   Draws emission (bright lines on black) and absorption (dark lines on a
   rainbow) spectra from NIST line lists, and estimates the colour an element
   glows in a discharge tube.

   Colour science:
     • The eye's response is described by the CIE 1931 colour-matching
       functions x̄, ȳ, z̄. We use the analytic fit by Wyman, Sloan & Shirley
       (2013, J. Computer Graphics Techniques 2(2)), accurate to a few %.
     • A spectrum's colour = Σ intensity × (x̄, ȳ, z̄) → XYZ → sRGB.
   ============================================================================ */
'use strict';

const Spectrum = (() => {
  const g = (x, mu, s1, s2) => { const t = (x - mu) / (x < mu ? s1 : s2); return Math.exp(-0.5 * t * t); };
  function cmf(nm) {
    return [
      1.056 * g(nm, 599.8, 37.9, 31.0) + 0.362 * g(nm, 442.0, 16.0, 26.7) - 0.065 * g(nm, 501.1, 20.4, 26.2),
      0.821 * g(nm, 568.8, 46.9, 40.5) + 0.286 * g(nm, 530.9, 16.3, 31.1),
      1.217 * g(nm, 437.0, 11.8, 36.0) + 0.681 * g(nm, 459.0, 26.0, 13.8),
    ];
  }

  /** CIE XYZ → displayable sRGB (0-255). Out-of-gamut colours are desaturated
      toward white, then the brightest channel is scaled to `peak`. */
  function xyzToRgb([X, Y, Z], peak = 1) {
    let r = 3.2406 * X - 1.5372 * Y - 0.4986 * Z;
    let gg = -0.9689 * X + 1.8758 * Y + 0.0415 * Z;
    let b = 0.0557 * X - 0.2040 * Y + 1.0570 * Z;
    const m = Math.min(r, gg, b);
    if (m < 0) { r -= m; gg -= m; b -= m; }               // add white to get inside the gamut
    const mx = Math.max(r, gg, b) || 1;
    const gamma = (v) => (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055);
    return [r, gg, b].map((v) => Math.round(255 * Math.max(0, Math.min(1, gamma((v / mx) * peak)))));
  }

  /** The colour of a single wavelength (for drawing one spectral line). */
  const lineRGB = (nm) => xyzToRgb(cmf(nm));
  const css = (rgb, a = 1) => `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${a})`;

  /** Estimated discharge-glow colour of a line list ([[nm, relI], …]). */
  function glowColor(lines) {
    if (!lines || !lines.length) return null;
    const xyz = [0, 0, 0];
    lines.forEach(([nm, I]) => { const c = cmf(nm); xyz[0] += I * c[0]; xyz[1] += I * c[1]; xyz[2] += I * c[2]; });
    return xyzToRgb(xyz);
  }

  /**
   * Draw a spectrum on a canvas.
   * opts.mode: 'emission' (default) or 'absorption'; opts.highlight: nm to mark
   * Returns a function (x → nm) so callers can show hover info.
   */
  function draw(canvas, lines, opts = {}) {
    const dpr = window.devicePixelRatio || 1;
    const W = canvas.clientWidth || 600, H = canvas.clientHeight || 120;
    canvas.width = W * dpr; canvas.height = H * dpr;
    const c = canvas.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    const lo = 380, hi = 750, axisH = 22, top = 4;
    const bandH = H - axisH - top;
    const x = (nm) => ((nm - lo) / (hi - lo)) * W;
    c.clearRect(0, 0, W, H);

    if (opts.mode === 'absorption') {
      for (let px = 0; px < W; px++) {
        c.fillStyle = css(lineRGB(lo + (px / W) * (hi - lo)), 0.95);
        c.fillRect(px, top, 1, bandH);
      }
      (lines || []).forEach(([nm, I]) => {
        c.fillStyle = `rgba(0,0,0,${Math.min(1, 0.35 + I * 1.5)})`;
        c.fillRect(x(nm) - 0.8, top, 1.6, bandH);
      });
    } else {
      c.fillStyle = '#000';
      c.fillRect(0, top, W, bandH);
      // faint rainbow underlay so you can read the colours
      for (let px = 0; px < W; px += 2) {
        c.fillStyle = css(lineRGB(lo + (px / W) * (hi - lo)), 0.06);
        c.fillRect(px, top, 2, bandH);
      }
      c.globalCompositeOperation = 'lighter';
      (lines || []).forEach(([nm, I]) => {
        const rgb = lineRGB(nm);
        // brightness: sqrt so that weak lines are still visible
        const a = Math.min(1, 0.15 + Math.sqrt(I) * 0.95);
        const w = 1.2 + Math.sqrt(I) * 2.2;
        const grd = c.createLinearGradient(x(nm) - w * 2, 0, x(nm) + w * 2, 0);
        grd.addColorStop(0, css(rgb, 0));
        grd.addColorStop(0.5, css(rgb, a));
        grd.addColorStop(1, css(rgb, 0));
        c.fillStyle = grd;
        c.fillRect(x(nm) - w * 2, top, w * 4, bandH);
      });
      c.globalCompositeOperation = 'source-over';
    }
    if (opts.highlight) {
      c.strokeStyle = '#fff'; c.setLineDash([3, 3]);
      c.beginPath(); c.moveTo(x(opts.highlight), top); c.lineTo(x(opts.highlight), top + bandH); c.stroke();
      c.setLineDash([]);
    }
    // axis
    c.fillStyle = '#94a3b8';
    c.font = '10px Inter, sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'top';
    for (let nm = 400; nm <= 750; nm += 50) {
      c.fillRect(x(nm), top + bandH, 1, 4);
      c.fillText(nm + ' nm', Math.min(W - 18, x(nm)), top + bandH + 6);
    }
    return (px) => lo + (px / W) * (hi - lo);
  }

  /** The line nearest to wavelength nm, within tol nm. */
  function nearest(lines, nm, tol = 2) {
    let best = null, bd = tol;
    (lines || []).forEach((l) => { const d = Math.abs(l[0] - nm); if (d < bd) { bd = d; best = l; } });
    return best;
  }

  return { draw, glowColor, lineRGB, css, nearest, cmf };
})();
