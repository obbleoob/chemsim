/* ============================================================================
   ChemSim · studio/panel.js
   ----------------------------------------------------------------------------
   The right-hand live properties panel.
   ============================================================================ */
'use strict';

/* ============================================================================
   14. RIGHT-HAND PANEL (live properties)
   ============================================================================ */
function updatePanel() {
  const an = state.analysis, rd = state.rd;
  const empty = !state.atoms.length;

  // ---- identity ----
  if (empty) {
    ['p-formula', 'p-mw', 'p-exact', 'p-smiles', 'p-inchi', 'p-iupac', 'p-common'].forEach((id) => { $(id).textContent = '—'; });
  } else {
    const f = hillFormula(an.counts, an.netCharge);
    $('p-formula').innerHTML = f.html;
    const mw = rd && rd.desc && rd.desc.amw ? rd.desc.amw : an.mw;
    $('p-mw').textContent = `${mw.toFixed(3)} g/mol`;
    $('p-exact').textContent = rd && rd.desc && rd.desc.exactmw ? `${rd.desc.exactmw.toFixed(4)} Da` : '—';
    if (!RDKit) {
      $('p-smiles').textContent = '(waiting for RDKit…)';
      $('p-inchi').textContent = '—';
    } else if (rd && rd.ok) {
      $('p-smiles').textContent = rd.smiles;
      $('p-inchi').textContent = rd.inchi || '—';
    } else {
      $('p-smiles').textContent = rd && rd.error ? rd.error : '—';
      $('p-inchi').textContent = '—';
    }
  }
  scheduleNameLookup(rd && rd.ok ? rd.smiles : null);

  // ---- valence & octet issues ----
  const box = $('p-issues');
  if (empty) box.innerHTML = '<div class="issue ok">Draw something to begin.</div>';
  else if (!an.issues.length) box.innerHTML = '<div class="issue ok">✔ <b>All good!</b> Every atom has a valid valence and a full octet (or duet for H).</div>';
  else {
    const order = { error: 0, warn: 1, info: 2 };
    box.innerHTML = [...an.issues].sort((x, y) => order[x.level] - order[y.level]).map((iss) => `
      <div class="issue ${iss.level}" ${iss.atomId ? `data-atom="${iss.atomId}"` : ''}>
        ${iss.label ? `<b>${iss.label}:</b> ` : ''}${iss.text}
        ${iss.fix ? `<br/><span class="fix-btn" data-fix-atom="${iss.atomId}" data-fix-charge="${iss.fix.charge}">🔧 ${iss.fix.label}</span>` : ''}
      </div>`).join('');
  }

  // ---- atom table ----
  const tbody = $('p-atoms');
  tbody.innerHTML = empty ? '<tr><td colspan="6" class="dim">—</td></tr>' : state.atoms.map((a) => {
    const r = an.atoms[a.id];
    const q = r.partial;
    return `<tr data-atom="${a.id}" class="${r.status === 'error' ? 'err' : r.status === 'warn' ? 'warn' : ''}">
      <td style="color:${ELEMENTS[a.el].color}">${r.label}${r.implicitH ? `<span class="dim">H${r.implicitH > 1 ? r.implicitH : ''}</span>` : ''}</td>
      <td>${signed(r.fcComputed)}</td>
      <td>${signed(r.ox)}</td>
      <td class="${q < -0.02 ? 'q-neg' : q > 0.02 ? 'q-pos' : ''}">${signed(q, 2)}</td>
      <td>${r.hyb || '—'}</td>
      <td>${r.lonePairs}</td>
    </tr>`;
  }).join('');

  // ---- polar bonds (grouped by element pair) ----
  const polar = $('p-polar');
  if (empty || !an.edges.length) polar.innerHTML = '<span class="dim">No bonds yet.</span>';
  else {
    const groups = {};
    an.edges.forEach((e) => {
      const A = an.nodes[e.i].el, B = an.nodes[e.j].el;
      const [lo, hi] = ELEMENTS[A].en <= ELEMENTS[B].en ? [A, B] : [B, A];
      const key = `${lo}–${hi}`;
      groups[key] = groups[key] || { key, n: 0, dEN: e.dEN, hi };
      groups[key].n++;
    });
    polar.innerHTML = Object.values(groups).sort((x, y) => y.dEN - x.dEN).map((g) => {
      const col = g.dEN < 0.4 ? '#64748b' : g.dEN <= 1.7 ? '#fbbf24' : '#f87171';
      const w = Math.min(100, (g.dEN / 2.0) * 100);
      return `<div class="polar-item" data-tip="${g.dEN < 0.4 ? 'Non-polar: electrons shared about equally.' : `Polar: electrons pulled toward ${g.hi} (δ−).`}">
        <span class="bond-name">${g.key}${g.n > 1 ? ` ×${g.n}` : ''}</span>
        <div class="bar"><div style="width:${w}%;background:${col}"></div></div>
        <span class="den">${g.dEN.toFixed(2)}</span></div>`;
    }).join('');
  }

  // ---- stereochemistry ----
  const st = $('p-stereo');
  if (empty) st.innerHTML = '—';
  else if (!rd || !rd.ok) st.innerHTML = `<span class="dim">${RDKit ? 'Needs a valid structure (fix red atoms).' : 'Waiting for RDKit…'}</span>`;
  else {
    const atomsTxt = Object.entries(rd.cipAtoms || {}).map(([id, l]) => `<span class="stereo-tag">${atomLabelName(Number(id))} (${l})</span>`).join(' ');
    const bondsTxt = Object.entries(rd.cipBonds || {}).map(([id, l]) => {
      const b = state.bonds.find((x) => x.id === Number(id));
      return `<span class="stereo-tag">${atomLabelName(b.a1)}=${atomLabelName(b.a2)} (${l})</span>`;
    }).join(' ');
    const unspecified = rd.desc ? rd.desc.NumUnspecifiedAtomStereoCenters : 0;
    st.innerHTML = (atomsTxt || bondsTxt)
      ? `${atomsTxt ? `<div>Stereocentres: ${atomsTxt}</div>` : ''}${bondsTxt ? `<div>Double bonds: ${bondsTxt}</div>` : ''}`
      : '<span class="dim">No defined stereocentres or E/Z double bonds.</span>';
    if (unspecified) st.innerHTML += `<div class="issue warn" style="margin-top:6px">${unspecified} stereocentre${unspecified > 1 ? 's are' : ' is'} <b>undefined</b>. Use a wedge or dash on one of its bonds to choose R or S.</div>`;
  }

  // ---- RDKit descriptors ----
  const dg = $('p-desc');
  if (empty || !rd || !rd.ok || !rd.desc) dg.innerHTML = `<span class="dim">${empty ? '—' : RDKit ? 'Needs a valid structure.' : 'Waiting for RDKit…'}</span>`;
  else {
    const d = rd.desc;
    const items = [
      ['logP (Crippen)', d.CrippenClogP, 2, 'Estimated octanol/water partition coefficient. Positive = prefers fat (lipophilic), negative = prefers water (hydrophilic).'],
      ['TPSA (Å²)', d.tpsa, 1, 'Topological polar surface area: the surface belonging to N and O atoms (and their H). Larger = more polar.'],
      ['H-bond donors', d.NumHBD, 0, 'N–H and O–H groups that can donate a hydrogen bond.'],
      ['H-bond acceptors', d.NumHBA, 0, 'N and O atoms with lone pairs that can accept a hydrogen bond.'],
      ['Rotatable bonds', d.NumRotatableBonds, 0, 'Single, non-ring bonds between two non-terminal heavy atoms. A measure of flexibility.'],
      ['Rings', d.NumRings, 0, 'Number of rings (SSSR).'],
      ['Aromatic rings', d.NumAromaticRings, 0, 'Rings that RDKit recognises as aromatic (4n+2 π electrons, Hückel rule).'],
      ['Fraction sp³ C', d.FractionCSP3, 2, 'Fraction of carbon atoms that are sp³ hybridised.'],
      ['Heavy atoms', d.NumHeavyAtoms, 0, 'Atoms that are not hydrogen.'],
      ['Stereocentres', d.NumAtomStereoCenters, 0, 'Atoms with four different groups (potentially chiral).'],
    ];
    dg.innerHTML = items.filter(([, v]) => v !== undefined).map(([k, v, dp, tip]) =>
      `<div class="desc" data-tip="${tip}"><div class="k">${k}</div><div class="v">${Number(v).toFixed(dp)}</div></div>`).join('');
  }
}

// Clicking a "fix" button in the issue list
$('p-issues').addEventListener('click', (e) => {
  const btn = e.target.closest('.fix-btn');
  if (!btn) return;
  const a = getAtom(Number(btn.dataset.fixAtom));
  if (!a) return;
  pushHistory();
  a.charge = Number(btn.dataset.fixCharge);
  log('fix', `Applied fix: ${a.el} charge → ${a.charge}`);
  onMoleculeChanged();
});

// Hovering a table row or an issue highlights the atom on the canvas
['p-atoms', 'p-issues'].forEach((id) => {
  $(id).addEventListener('mouseover', (e) => {
    const row = e.target.closest('[data-atom]');
    const h = row ? { type: 'atom', id: Number(row.dataset.atom) } : null;
    if (JSON.stringify(h) !== JSON.stringify(state.hover)) { state.hover = h; render(); }
  });
  $(id).addEventListener('mouseleave', () => { state.hover = null; render(); });
});

$('btn-copy-smiles').addEventListener('click', () => {
  const s = state.rd && state.rd.smiles;
  if (!s) return toast('No SMILES yet');
  navigator.clipboard.writeText(s).then(() => toast('SMILES copied: ' + s), () => toast('Copy failed', true));
});

/** Central "something changed" handler: recompute everything and redraw. */
function onMoleculeChanged() {
  state.analysis = analyze();
  state.rd = runRDKit();
  render();
  updatePanel();
  scheduleAutosave();
  if (typeof StudioTools !== 'undefined') StudioTools.moleculeChanged();
  // refresh the tooltip if it is showing
  if (state.hover && !canvasTip.classList.contains('hidden')) hideCanvasTooltip();
}
