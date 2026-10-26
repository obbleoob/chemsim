/* ============================================================================
   ChemSim · beaker/solver.js
   ----------------------------------------------------------------------------
   Chemical equilibrium solver: given the total amount of every component in
   solution (Na⁺, Cl⁻, CO₃²⁻, NH₃, Cu²⁺, …), it finds
     • the pH,
     • the concentration of every species (HCO₃⁻, NH₄⁺, [Cu(NH₃)₄]²⁺, …),
     • which solids precipitate, and how much.

   Method (the "tableau" method used by water-chemistry programs such as
   MINEQL and PHREEQC):
     unknowns  x = log₁₀[free H⁺], log₁₀[free component], amount of each solid
     equations
       mass balance   Σ (stoichiometry × species concentration) = total
       charge balance Σ (charge × concentration) = 0     ← fixes the pH
       each solid present: ion activity product = Ksp
   solved with Newton's method in log space (with an analytic Jacobian and a
   simple line search). Solids are switched on when a solution becomes
   supersaturated and off when their amount would go negative ("active set").
   ============================================================================ */
'use strict';

const BeakerSolver = (() => {
  const LN10 = Math.LN10;
  const D = BeakerData;

  /** Set up species and solids for the components that are present. */
  function build(totals, Tc) {
    const comps = Object.keys(totals).filter((c) => totals[c] > 1e-14 && D.COMPONENTS[c]);
    const idx = { H: 0 };
    comps.forEach((c, i) => { idx[c] = i + 1; });
    const n = comps.length + 1;
    const species = [];
    const add = (name, nu, logK, z, extra) => species.push({ name, nu, logK, z, ...extra });
    add('H+', [[0, 1]], 0, 1, { label: 'H⁺' });
    add('OH-', [[0, -1]], -D.pKw(Tc), -1, { label: 'OH⁻' });
    comps.forEach((c) => add(c, [[idx[c], 1]], 0, D.COMPONENTS[c].z, { label: D.COMPONENTS[c].label, basis: true }));
    Object.entries(D.SPECIES).forEach(([name, s]) => {
      if (name === 'OH-') return;
      if (!Object.keys(s.a).every((c) => idx[c] !== undefined)) return;
      const nu = Object.entries(s.a).map(([c, k]) => [idx[c], k]);
      if (s.h) nu.push([0, s.h]);
      // Hydroxo species (h < 0) are tabulated in the H⁺ basis at 25 °C; keep
      // their formation constants in terms of OH⁻ the same at any temperature.
      const logK = s.h < 0 ? s.logK + s.h * (D.pKw(Tc) - D.pKw(25)) : s.logK;
      add(name, nu, logK, s.z, { label: s.label });
    });
    const solids = [];
    Object.entries(D.SOLIDS).forEach(([name, s]) => {
      if (!Object.keys(s.a).every((c) => idx[c] !== undefined)) return;
      const nu = Object.entries(s.a).map(([c, k]) => [idx[c], k]);
      if (s.h) nu.push([0, s.h]);
      // Hydroxides/oxides are tabulated in the H⁺ basis, which hides a factor
      // of Kwⁿ: correct it so Ksp in terms of OH⁻ stays the same at any T.
      const logKsp = s.h < 0 ? s.logKsp + -s.h * (D.pKw(Tc) - D.pKw(25)) : s.logKsp;
      solids.push({ name, nu, logKsp });
    });
    const T = [0, ...comps.map((c) => totals[c])];
    return { comps, idx, n, species, solids, T };
  }

  /** Concentrations of all species for log-free-concentrations x. */
  function concs(sys, x) {
    return sys.species.map((s) => {
      let e = s.logK;
      for (const [j, k] of s.nu) e += k * x[j];
      return Math.pow(10, Math.min(e, 100));   // guard against overflow while iterating
    });
  }

  /** Residuals F and Jacobian J for unknowns u = [x..., p...]. */
  function evaluate(sys, active, u, wantJ) {
    const n = sys.n, m = active.length, N = n + m;
    const x = u.slice(0, n);
    const C = concs(sys, x);
    const F = new Array(N).fill(0);
    const J = wantJ ? Array.from({ length: N }, () => new Array(N).fill(0)) : null;
    // mass balances (rows 1..n-1)
    for (let i = 1; i < n; i++) {
      let s = -sys.T[i];
      sys.species.forEach((sp, k) => { for (const [j, a] of sp.nu) if (j === i) s += a * C[k]; });
      active.forEach((sol, q) => { for (const [j, a] of sol.nu) if (j === i) s += a * u[n + q]; });
      F[i] = s / sys.T[i];
      if (wantJ) {
        sys.species.forEach((sp, k) => {
          let ai = 0;
          for (const [j, a] of sp.nu) if (j === i) ai = a;
          if (!ai) return;
          for (const [j, a] of sp.nu) J[i][j] += (ai * a * LN10 * C[k]) / sys.T[i];
        });
        active.forEach((sol, q) => { for (const [j, a] of sol.nu) if (j === i) J[i][n + q] += a / sys.T[i]; });
      }
    }
    // charge balance (row 0)
    let qsum = 0, ssum = 1e-30;
    sys.species.forEach((sp, k) => { qsum += sp.z * C[k]; ssum += Math.abs(sp.z) * C[k]; });
    F[0] = qsum / ssum;
    if (wantJ) {
      for (let j = 0; j < n; j++) {
        let dq = 0, ds = 0;
        sys.species.forEach((sp, k) => {
          for (const [jj, a] of sp.nu) if (jj === j) { dq += sp.z * a * LN10 * C[k]; ds += Math.abs(sp.z) * a * LN10 * C[k]; }
        });
        J[0][j] = (dq * ssum - qsum * ds) / (ssum * ssum);
      }
    }
    // solids: log IAP − log Ksp = 0
    active.forEach((sol, q) => {
      let e = -sol.logKsp;
      for (const [j, a] of sol.nu) { e += a * x[j]; if (wantJ) J[n + q][j] += a; }
      F[n + q] = e;
    });
    return { F, J, C };
  }

  /** Solve A·d = b (Gaussian elimination with partial pivoting). */
  function linsolve(A, b) {
    const N = b.length;
    const M = A.map((row, i) => [...row, b[i]]);
    for (let c = 0; c < N; c++) {
      let p = c;
      for (let r = c + 1; r < N; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
      if (Math.abs(M[p][c]) < 1e-14) return null;
      [M[c], M[p]] = [M[p], M[c]];
      for (let r = c + 1; r < N; r++) {
        const f = M[r][c] / M[c][c];
        if (f) for (let k = c; k <= N; k++) M[r][k] -= f * M[c][k];
      }
    }
    const d = new Array(N).fill(0);
    for (let r = N - 1; r >= 0; r--) {
      let s = M[r][N];
      for (let k = r + 1; k < N; k++) s -= M[r][k] * d[k];
      d[r] = s / M[r][r];
    }
    return d;
  }

  const norm = (F) => Math.max(...F.map(Math.abs));

  /**
   * Robust first guess (no solids): bisection on pH. At each trial pH, every
   * mass balance is solved in turn by a 1-D Newton step (Gauss–Seidel). The
   * charge balance only moves in one direction as pH changes, so bisection
   * always converges even when Newton's method would wander off.
   */
  function presolve(sys, x) {
    const n = sys.n;
    const rowsFor = sys.species.map((sp) => sp.nu);
    function speciesConc(k) {
      let e = sys.species[k].logK;
      for (const [j, a] of rowsFor[k]) e += a * x[j];
      return Math.pow(10, Math.min(e, 100));
    }
    function inner() {
      for (let sweep = 0; sweep < 60; sweep++) {
        let change = 0;
        for (let i = 1; i < n; i++) {
          const hi = Math.log10(sys.T[i]);
          let lo = hi - 40;
          let xi = Math.min(x[i], hi);
          for (let it = 0; it < 60; it++) {
            x[i] = xi;
            let f = -sys.T[i], df = 0;
            sys.species.forEach((sp, k) => {
              let a = 0;
              for (const [j, v] of sp.nu) if (j === i) a = v;
              if (!a) return;
              const c = speciesConc(k);
              f += a * c;
              df += a * a * LN10 * c;
            });
            if (Math.abs(f) <= 1e-13 * sys.T[i]) break;
            let xn;
            if (f > 0) { xn = xi - f / df; if (!(xn > lo)) xn = (lo + xi) / 2; }
            else { lo = xi; xn = xi - f / df; if (!(xn < hi)) xn = (xi + hi) / 2; }
            if (f > 0) { /* root is below xi */ }
            if (Math.abs(xn - xi) < 1e-13) { xi = xn; break; }
            xi = xn;
          }
          change = Math.max(change, Math.abs(xi - x[i]));
          x[i] = xi;
        }
        if (change < 1e-12) break;
      }
    }
    const charge = (xH) => {
      x[0] = xH;
      inner();
      let q = 0;
      sys.species.forEach((sp, k) => { q += sp.z * speciesConc(k); });
      return q;
    };
    let a = -16, b = 1.5;
    for (let it = 0; it < 70; it++) {
      const m = (a + b) / 2;
      if (charge(m) > 0) b = m; else a = m;
      if (b - a < 1e-11) break;
    }
    charge((a + b) / 2);
    return x;
  }

  /** Newton iteration for a fixed set of active solids. */
  function newton(sys, active, u0) {
    let u = u0.slice();
    let { F } = evaluate(sys, active, u, false);
    let f0 = norm(F);
    for (let it = 0; it < 150; it++) {
      if (f0 < 1e-10) return { u, ok: true, it };
      const { J } = evaluate(sys, active, u, true);
      const d = linsolve(J, F.map((v) => -v));
      if (!d) return { u, ok: false, singular: true };
      // limit steps in log units to 1.5 decades
      let big = 0;
      for (let j = 0; j < sys.n; j++) big = Math.max(big, Math.abs(d[j]));
      const scale = big > 1.5 ? 1.5 / big : 1;
      let lam = scale, accepted = false;
      for (let k = 0; k < 12; k++) {
        const trial = u.map((v, j) => v + lam * d[j]);
        const f1 = norm(evaluate(sys, active, trial, false).F);
        if (f1 < f0 || k === 11) { u = trial; f0 = f1; F = evaluate(sys, active, u, false).F; accepted = true; break; }
        lam /= 2;
      }
      if (!accepted) break;
    }
    return { u, ok: f0 < 1e-7, residual: f0 };
  }

  /**
   * Main entry point.
   * @param totals   { component: mol/L }
   * @param Tc       temperature (°C)
   * @param warm     previous result, for a fast warm start
   * @param exclude  solids not allowed to form (e.g. kinetic lumps)
   */
  function solve(totals, Tc = 25, warm = null, exclude = []) {
    const sys = build(totals, Tc);
    const x0 = new Array(sys.n).fill(0);
    x0[0] = warm && warm.logH !== undefined ? warm.logH : -7;
    sys.comps.forEach((c, i) => {
      const w = warm && warm.logFree && warm.logFree[c];
      x0[i + 1] = w !== undefined && isFinite(w) ? Math.min(w, Math.log10(sys.T[i + 1])) : Math.log10(sys.T[i + 1]);
    });
    const allowed = sys.solids.filter((s) => !exclude.includes(s.name));
    let active = allowed.filter((s) => warm && warm.solids && warm.solids[s.name] > 0);
    let pGuess = active.map((s) => warm.solids[s.name]);
    if (!warm) { presolve(sys, x0); }
    let res = null, presolved = !warm;
    for (let outer = 0; outer < 30; outer++) {
      res = newton(sys, active, [...x0, ...pGuess]);
      if (!res.ok) {
        if (!presolved) {
          // warm start failed: fall back to the robust pH-bisection guess
          presolve(sys, x0);
          presolved = true;
          active = []; pGuess = [];
          continue;
        }
        if (active.length) { active.pop(); pGuess.pop(); continue; }
      }
      const u = res.u;
      for (let j = 0; j < sys.n; j++) x0[j] = u[j];
      pGuess = active.map((_, q) => u[sys.n + q]);
      // drop a solid whose amount went negative (it should dissolve)
      let worst = -1, wv = -1e-15;
      pGuess.forEach((p, q) => { if (p < wv) { wv = p; worst = q; } });
      if (worst >= 0) { active.splice(worst, 1); pGuess.splice(worst, 1); continue; }
      // add the most supersaturated solid
      let best = null, bestSI = 1e-9;
      allowed.forEach((s) => {
        if (active.includes(s)) return;
        let si = -s.logKsp;
        for (const [j, a] of s.nu) si += a * u[j];
        if (si > bestSI) { bestSI = si; best = s; }
      });
      if (!best) break;
      active.push(best);
      const lim = Math.min(...best.nu.filter(([j]) => j > 0).map(([j, a]) => sys.T[j] / a));
      pGuess.push(lim * 0.5);
    }
    const u = res.u;
    const C = concs(sys, u.slice(0, sys.n));
    const species = {};
    sys.species.forEach((s, k) => { species[s.name] = C[k]; });
    const solids = {};
    active.forEach((s, q) => { solids[s.name] = Math.max(0, u[sys.n + q]); });
    // saturation index of every possible solid (also kinetic lumps)
    const SI = {};
    sys.solids.forEach((s) => {
      let si = -s.logKsp;
      for (const [j, a] of s.nu) si += a * u[j];
      SI[s.name] = si;
    });
    const logFree = {};
    sys.comps.forEach((c, i) => { logFree[c] = u[i + 1]; });
    let I = 0;
    sys.species.forEach((s, k) => { I += 0.5 * s.z * s.z * C[k]; });
    return { ok: res.ok, pH: -u[0], logH: u[0], logFree, species, solids, SI, ionicStrength: I };
  }

  return { solve };
})();
