/* ============================================================================
   ChemSim · studio/tools/tools.js
   ----------------------------------------------------------------------------
   The 🧰 Tools drawer of the Molecule Studio. It opens on the right (in place
   of the properties panel) so the drawing stays visible, and holds one tab
   per tool: spectra, orbitals, drug-likeness, projections, conformers,
   synthesis, calculator, library, files, safety.

   Each tool registers itself:
     StudioTools.add({
       id, icon, title,
       render(el)          build the tab's content (called when the tab opens
                           and again whenever the molecule changes)
       hide()              optional: the tab is closing
       keepOnChange: true  optional: don't re-render on molecule changes
     })

   Shared helpers for tools:
     StudioTools.withMol(fn)    run fn(rdkitMol) on the current drawing; the
                                RDKit atom index i is state.atoms[i]
     StudioTools.embed()        cached 3D coordinates (embed3D) of the drawing
     StudioTools.highlight({atoms, bonds, color})  outline atoms/bonds on the canvas
     StudioTools.requestPick(kind, callback, hint) the next click on the
                                drawing picks an atom or a bond for the tool
   ============================================================================ */
'use strict';

const StudioTools = (() => {
  const tools = [];
  let open = false, current = null, timer = null, pick = null;
  let embedCache = { key: null, data: null };

  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const drawer = () => document.getElementById('tools-drawer');
  const body = () => document.getElementById('tools-body');

  function add(def) { tools.push(def); }

  function build() {
    const d = drawer();
    d.querySelector('#tools-tabs').innerHTML = tools.map((t) => `<button class="ttab" data-tool-tab="${t.id}" data-tip="${esc(t.title)}"><span>${t.icon}</span><small>${t.short || t.title}</small></button>`).join('');
    d.querySelectorAll('[data-tool-tab]').forEach((b) => b.addEventListener('click', () => select(b.dataset.toolTab)));
    d.querySelector('#tools-close').addEventListener('click', () => toggle(false));
  }

  function toggle(on = !open) {
    open = on;
    document.querySelector('#view-studio .layout').classList.toggle('tools-open', open);
    drawer().classList.toggle('hidden', !open);
    $('btn-tools').classList.toggle('active', open);
    if (open && !current && tools.length) select(tools[0].id);
    else if (open) refresh();
    if (!open) { clearHighlight(); cancelPick(); if (current && current.hide) current.hide(); }
    requestAnimationFrame(resizeCanvas);
    log('tools', open ? 'Tools drawer opened' : 'Tools drawer closed');
  }

  function select(id) {
    const t = tools.find((x) => x.id === id);
    if (!t) return;
    if (current && current !== t && current.hide) current.hide();
    clearHighlight(); cancelPick();
    current = t;
    drawer().querySelectorAll('[data-tool-tab]').forEach((b) => b.classList.toggle('active', b.dataset.toolTab === id));
    drawer().querySelector('#tools-title').textContent = `${t.icon} ${t.title}`;
    refresh();
    log('tools', `Tool tab → ${id}`);
  }

  function refresh() {
    if (!open || !current) return;
    const el = body();
    try { current.render(el); } catch (e) {
      logError('tools', `Tool ${current.id} failed`, e);
      el.innerHTML = `<div class="issue error">This tool hit an error: ${esc(e.message)}. See the console.</div>`;
    }
  }

  /** Called by onMoleculeChanged(): re-render the open tab (debounced). */
  function moleculeChanged() {
    if (!open || !current || current.keepOnChange) return;
    clearTimeout(timer);
    timer = setTimeout(refresh, 180);
  }

  /* ---------------- helpers for tools ---------------- */
  function withMol(fn) {
    if (!RDKit || !state.atoms.length) return null;
    let mol = null;
    try {
      mol = RDKit.get_mol(toMolblock(), JSON.stringify({ removeHs: false }));
      if (!mol || !mol.is_valid()) return null;
      return fn(mol);
    } finally { if (mol) mol.delete(); }
  }
  /** Substructure matches of a SMARTS pattern → arrays of atom ids. */
  function matches(mol, smarts) {
    let q = null;
    try {
      q = RDKit.get_qmol(smarts);
      if (!q || !q.is_valid()) { warn('tools', 'Bad SMARTS', smarts); return []; }
      const res = JSON.parse(mol.get_substruct_matches(q));
      return res.map((m) => m.atoms.map((i) => state.atoms[i] && state.atoms[i].id));
    } catch (e) { warn('tools', 'SMARTS failed', smarts, e); return []; } finally { if (q) q.delete(); }
  }
  function embed() {
    const key = snapshot();
    if (embedCache.key !== key) embedCache = { key, data: state.analysis ? embed3D(state.analysis) : null };
    return embedCache.data;
  }

  /**
   * The molecule as a graph of heavy atoms, with H counts and aromaticity
   * (aromaticity and rings from RDKit). Drawn H atoms are folded into their
   * parent's H count. Cached until the drawing changes.
   *   { atoms: Map id → { id, el, charge, h, arom, nbrs: [{ id, order, arom }] }, rings: [[ids]], ok }
   */
  let graphCache = { key: null, g: null };
  function graph() {
    const key = snapshot();
    if (graphCache.key === key) return graphCache.g;
    const an = state.analysis;
    const g = { atoms: new Map(), rings: [], ok: false };
    if (!an) return g;
    const info = withMol((m) => {
      const j = JSON.parse(m.get_json()).molecules[0];
      const ext = (j.extensions || []).find((x) => x.name === 'rdkitRepresentation') || {};
      return { aa: ext.aromaticAtoms || [], ab: ext.aromaticBonds || [], rings: ext.atomRings || [], cip: ext.cipRanks || [] };
    }) || { aa: [], ab: [], rings: [], cip: [] };
    const aromAtom = new Set(info.aa.map((i) => state.atoms[i] && state.atoms[i].id));
    const aromBond = new Set(info.ab.map((i) => state.bonds[i] && state.bonds[i].id));
    state.atoms.forEach((a, i) => {
      if (a.el === 'H' && neighborIds(a.id).length === 1 && getAtom(neighborIds(a.id)[0]).el !== 'H') return;
      const r = an.atoms[a.id];
      g.atoms.set(a.id, { id: a.id, el: a.el, charge: a.charge, h: r ? r.implicitH : 0, arom: aromAtom.has(a.id), nbrs: [], cipRank: info.cip[i] });
    });
    state.bonds.forEach((b) => {
      const A = g.atoms.get(b.a1), B = g.atoms.get(b.a2);
      if (A && B) {
        const arom = aromBond.has(b.id);
        A.nbrs.push({ id: B.id, order: arom ? 1.5 : b.order, arom, bondId: b.id });
        B.nbrs.push({ id: A.id, order: arom ? 1.5 : b.order, arom, bondId: b.id });
      } else if (A && !B) A.h++;          // a drawn H atom
      else if (B && !A) B.h++;
    });
    g.rings = info.rings.map((r) => r.map((i) => state.atoms[i].id));
    g.ok = !!RDKit;
    graphCache = { key, g };
    return g;
  }

  /**
   * A condensed text label for the branch that starts at atom `to` when you
   * look along the bond from atom `from`: OH, NH₂, CH₃, CH₂OH, CHO, COOH,
   * CO₂CH₃, C₂H₅, Ph, Br … (falls back to the branch's formula).
   */
  const SUBS = '₀₁₂₃₄₅₆₇₈₉';
  const subNum = (n) => (n === 1 ? '' : String(n).split('').map((d) => SUBS[d]).join(''));
  function groupLabel(from, to) {
    const g = graph();
    const X = g.atoms.get(to);
    if (!X) return 'H';
    // the branch: everything reachable from `to` without going back through `from`
    const seen = new Set([from]), branch = [];
    const stack = [to];
    while (stack.length) { const x = stack.pop(); if (seen.has(x)) continue; seen.add(x); branch.push(x); g.atoms.get(x).nbrs.forEach((n) => { if (!seen.has(n.id)) stack.push(n.id); }); }
    if (branch.includes(from)) return X.el;           // a ring: just the atom
    const H = (A) => (A.h ? `H${subNum(A.h)}` : '');
    const charge = X.charge ? (X.charge > 0 ? '⁺' : '⁻') : '';
    if (branch.length === 1) return X.el === 'C' ? `C${H(X)}` : `${X.el}${H(X)}${charge}`;
    const nb = X.nbrs.filter((n) => n.id !== from).map((n) => ({ ...n, at: g.atoms.get(n.id) }));
    if (X.arom && branch.length === 6 && branch.every((id) => g.atoms.get(id).el === 'C')) return 'Ph';
    if (X.el === 'C' && branch.length === 2 && nb.length === 1) {
      const Y = nb[0].at;
      if (nb[0].order === 2 && Y.el === 'O') return `CHO`;
      if (nb[0].order === 3 && Y.el === 'N') return 'CN';
      if (Y.el === 'O' && Y.h) return `C${H(X)}OH`;
      if (Y.el === 'N') return `C${H(X)}N${H(Y)}`;
      if (Y.el === 'C' && Y.h === 3 && X.h === 2) return 'CH₂CH₃';
      if (!Y.h && 'F Cl Br I'.includes(Y.el)) return `C${H(X)}${Y.el}`;
    }
    if (X.el === 'C' && nb.length === 2) {
      const dO = nb.find((n) => n.order === 2 && n.at.el === 'O');
      const other = nb.find((n) => n !== dO);
      if (dO && other) {
        if (other.at.el === 'O' && other.at.h) return 'COOH';
        if (other.at.el === 'O' && other.at.charge < 0) return 'COO⁻';
        if (other.at.el === 'O' && branch.length === 4) return 'CO₂CH₃';
        if (other.at.el === 'N') return `CON${H(other.at)}`;
        if (other.at.el === 'C' && other.at.h === 3 && branch.length === 3) return 'COCH₃';
      }
    }
    if (X.el === 'O' && nb.length === 1 && nb[0].at.el === 'C' && nb[0].at.h === 3 && branch.length === 2) return 'OCH₃';
    if (X.el === 'O' && nb.length === 1 && branch.length === 4 && nb[0].at.nbrs.some((m) => m.order === 2)) return 'OCOCH₃';
    if (X.el === 'C' && nb.length === 2 && branch.length === 3 && nb.every((n) => n.at.el === 'C' && n.at.h === 3)) return 'CH(CH₃)₂';
    if (X.el === 'C' && nb.length === 3 && branch.length === 4 && nb.every((n) => n.at.el === 'C' && n.at.h === 3)) return 'C(CH₃)₃';
    // fallback: the formula of the branch (C first, then H, then alphabetical)
    const cnt = {};
    branch.forEach((id) => { const A = g.atoms.get(id); cnt[A.el] = (cnt[A.el] || 0) + 1; cnt.H = (cnt.H || 0) + A.h; });
    const order = Object.keys(cnt).filter((e) => cnt[e]).sort((a, b) => (a === 'C' ? -1 : b === 'C' ? 1 : a === 'H' ? -1 : b === 'H' ? 1 : a.localeCompare(b)));
    return order.map((e) => e + subNum(cnt[e])).join('');
  }

  function highlight(h) { state.toolHighlight = h; render(); }
  function clearHighlight() { if (state.toolHighlight) { state.toolHighlight = null; render(); } }

  function requestPick(kind, cb, hint) {
    pick = { kind, cb };
    $('hint-bar').textContent = '🎯 ' + (hint || `Click ${kind === 'bond' ? 'a bond' : 'an atom'} on the drawing`);
    canvas.classList.add('pick-cursor');
  }
  function cancelPick() { if (pick) { pick = null; canvas.classList.remove('pick-cursor'); setTool(state.tool); } }
  /** input.js asks this first on every click: true = the click was used for picking. */
  function consumePick(hit) {
    if (!pick || !hit) return false;
    if (hit.type !== pick.kind) return false;
    const p = pick;
    cancelPick();
    p.cb(hit.id);
    return true;
  }

  return {
    esc, add, build, toggle, select, refresh, moleculeChanged, withMol, matches, embed, graph, groupLabel, highlight, clearHighlight, requestPick, cancelPick, consumePick,
    get isOpen() { return open; }, get current() { return current; }, get tools() { return tools; },
  };
})();
