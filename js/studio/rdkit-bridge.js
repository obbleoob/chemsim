/* ============================================================================
   ChemSim · studio/rdkit-bridge.js
   ----------------------------------------------------------------------------
   Talking to RDKit: MOL blocks, SMILES, InChI, descriptors, R/S, import.
   ============================================================================ */
'use strict';

/* ============================================================================
   8. RDKIT BRIDGE
   ----------------------------------------------------------------------------
   We write our molecule as a V2000 MOL block (a standard text format), hand
   it to RDKit, and ask RDKit for SMILES, InChI, descriptors and CIP (R/S, E/Z)
   labels. Because the MOL block contains the 2D coordinates AND the wedge /
   dash flags, RDKit can work out the 3D stereochemistry from your drawing.
   ============================================================================ */
const MOL_SCALE = 1.5 / BOND_LEN;   // world units → Ångström-ish MOL coordinates

function toMolblock() {
  const f = (v) => v.toFixed(4).padStart(10);
  const p3 = (v) => String(v).padStart(3);
  const lines = ['', '  ChemSim', ''];
  lines.push(`${p3(state.atoms.length)}${p3(state.bonds.length)}  0  0  0  0  0  0  0  0999 V2000`);
  state.atoms.forEach((a) => {
    // NOTE: y is flipped because screens count y downwards, chemists upwards.
    lines.push(`${f(a.x * MOL_SCALE)}${f(-a.y * MOL_SCALE)}${f(0)} ${a.el.padEnd(3)} 0  0  0  0  0  0  0  0  0  0  0  0`);
  });
  state.bonds.forEach((b) => {
    lines.push(`${p3(atomIndex(b.a1) + 1)}${p3(atomIndex(b.a2) + 1)}${p3(b.order)}${p3(b.stereo)}`);
  });
  const charged = state.atoms.map((a, i) => [i + 1, a.charge]).filter(([, c]) => c !== 0);
  for (let k = 0; k < charged.length; k += 8) {
    const chunk = charged.slice(k, k + 8);
    lines.push(`M  CHG${p3(chunk.length)}` + chunk.map(([i, c]) => ` ${p3(i)} ${p3(c)}`).join(''));
  }
  lines.push('M  END');
  return lines.join('\n');
}

/** Parse a V2000 MOL block (e.g. from RDKit) into atoms/bonds arrays. */
function parseMolblock(mb) {
  const lines = mb.split(/\r?\n/);
  const countsIdx = lines.findIndex((l) => /V2000/.test(l));
  if (countsIdx < 0) throw new Error('Not a V2000 MOL block');
  const nA = parseInt(lines[countsIdx].slice(0, 3), 10);
  const nB = parseInt(lines[countsIdx].slice(3, 6), 10);
  const atoms = [], bonds = [];
  const oldCharge = { 1: 3, 2: 2, 3: 1, 5: -1, 6: -2, 7: -3 };
  for (let i = 0; i < nA; i++) {
    const l = lines[countsIdx + 1 + i];
    const x = parseFloat(l.slice(0, 10)), y = parseFloat(l.slice(10, 20));
    const el = l.slice(31, 34).trim();
    const cc = parseInt(l.slice(36, 39), 10) || 0;
    atoms.push({ el, x, y, charge: oldCharge[cc] || 0 });
  }
  for (let i = 0; i < nB; i++) {
    const l = lines[countsIdx + 1 + nA + i];
    bonds.push({
      a1: parseInt(l.slice(0, 3), 10) - 1,
      a2: parseInt(l.slice(3, 6), 10) - 1,
      order: parseInt(l.slice(6, 9), 10),
      stereo: parseInt(l.slice(9, 12), 10) || 0,
    });
  }
  lines.slice(countsIdx + 1 + nA + nB).forEach((l) => {
    if (l.startsWith('M  CHG')) {
      const n = parseInt(l.slice(6, 9), 10);
      for (let k = 0; k < n; k++) {
        const idx = parseInt(l.slice(10 + 8 * k, 13 + 8 * k), 10) - 1;
        const c = parseInt(l.slice(14 + 8 * k, 17 + 8 * k), 10);
        if (atoms[idx]) atoms[idx].charge = c;
      }
    }
  });
  return { atoms, bonds };
}

/** Ask RDKit about the current molecule. Returns null if RDKit isn't ready. */
function runRDKit() {
  if (!RDKit || !state.atoms.length) return null;
  const out = { ok: false };
  let mol = null;
  const t0 = performance.now();
  try {
    const mb = toMolblock();
    // removeHs:false keeps any H atoms you drew, so atom numbers match ours.
    mol = RDKit.get_mol(mb, JSON.stringify({ removeHs: false }));
    if (!mol || !mol.is_valid()) {
      warn('rdkit', 'RDKit could not interpret the molecule (usually a valence problem). MOL block was:\n' + mb);
      out.error = 'RDKit cannot interpret this structure yet. Fix the red atoms first.';
      return out;
    }
    out.ok = true;
    out.smiles = mol.get_smiles();
    try { out.inchi = mol.get_inchi(); } catch (e) { warn('rdkit', 'InChI failed', e); }
    try { out.desc = JSON.parse(mol.get_descriptors()); } catch (e) { warn('rdkit', 'descriptors failed', e); }
    try {
      const tags = JSON.parse(mol.get_stereo_tags());
      out.cipAtoms = {};
      out.cipBonds = {};
      (tags.CIP_atoms || []).forEach(([idx, lab]) => {
        const a = state.atoms[idx];
        lab = lab.replace(/[()]/g, '');
        if (a && lab !== '?') out.cipAtoms[a.id] = lab;   // "?" = stereocentre not defined
      });
      (tags.CIP_bonds || []).forEach(([i, j, lab]) => {
        const a = state.atoms[i], b = state.atoms[j];
        const bond = a && b && findBond(a.id, b.id);
        lab = lab.replace(/[()]/g, '');
        if (bond && lab !== '?') out.cipBonds[bond.id] = lab;
      });
    } catch (e) { warn('rdkit', 'stereo tags failed', e); }
    log('rdkit', `SMILES ${out.smiles} (RDKit took ${(performance.now() - t0).toFixed(1)} ms)`, out);
  } catch (e) {
    logError('rdkit', 'Unexpected RDKit error', e);
    out.error = 'RDKit error: ' + e.message;
  } finally {
    if (mol) mol.delete();   // RDKit objects live in WASM memory; free them!
  }
  return out;
}

/**
 * Load a molecule from SMILES: RDKit makes 2D coordinates (CoordGen), gives
 * us a MOL block with wedges, and we convert that into our own atoms/bonds.
 */
function loadSmiles(smiles, { quiet = false } = {}) {
  if (!RDKit) { toast('RDKit is still loading, so SMILES import is not ready yet.', true); return false; }
  log('import', 'Loading SMILES', smiles);
  let mol = null;
  try {
    mol = RDKit.get_mol(smiles);
    if (!mol || !mol.is_valid()) { toast(`RDKit could not read the SMILES "${smiles}"`, true); return false; }
    mol.set_new_coords(true);
    const mb = mol.get_molblock();
    return importMolblock(mb, { quiet });
  } catch (e) {
    logError('import', e);
    toast('Import failed: ' + e.message, true);
    return false;
  } finally {
    if (mol) mol.delete();
  }
}

function importMolblock(mb, { keepIds = false, quiet = false } = {}) {
  const parsed = parseMolblock(mb);
  const bad = parsed.atoms.find((a) => !ELEMENTS[a.el]);
  if (bad) { toast(`Sorry, element "${bad.el}" is not supported yet.`, true); return false; }
  // scale so the median bond is BOND_LEN long, and centre on the screen
  const lens = parsed.bonds.map((b) => Math.hypot(parsed.atoms[b.a1].x - parsed.atoms[b.a2].x, parsed.atoms[b.a1].y - parsed.atoms[b.a2].y)).sort((x, y) => x - y);
  const med = lens.length ? lens[Math.floor(lens.length / 2)] : 1.5;
  const s = BOND_LEN / (med || 1.5);
  const cx = parsed.atoms.reduce((t, a) => t + a.x, 0) / (parsed.atoms.length || 1);
  const cy = parsed.atoms.reduce((t, a) => t + a.y, 0) / (parsed.atoms.length || 1);
  const centre = screenToWorld(canvas.clientWidth / 2, canvas.clientHeight / 2);
  pushHistory();
  const oldIds = state.atoms.map((a) => a.id);
  if (!keepIds) { state.atoms = []; state.bonds = []; state.arrows = []; }
  const ids = parsed.atoms.map((a, i) => {
    const id = keepIds && oldIds[i] !== undefined ? oldIds[i] : state.nextId++;
    return id;
  });
  state.atoms = parsed.atoms.map((a, i) => ({ id: ids[i], el: a.el, charge: a.charge, x: centre.x + (a.x - cx) * s, y: centre.y - (a.y - cy) * s }));
  state.bonds = parsed.bonds.map((b) => ({ id: state.nextId++, a1: ids[b.a1], a2: ids[b.a2], order: b.order === 4 ? 1 : b.order, stereo: b.stereo === 1 || b.stereo === 6 ? b.stereo : 0 }));
  log('import', `Imported ${state.atoms.length} atoms and ${state.bonds.length} bonds`);
  if (!keepIds) fitView();
  onMoleculeChanged();
  if (!quiet) toast('Molecule loaded ✔');
  return true;
}

/** "Clean up": let RDKit compute tidy 2D coordinates for the current drawing. */
function cleanUp() {
  if (!RDKit) { toast('Clean up needs RDKit, which is still loading.', true); return; }
  if (!state.atoms.length) return;
  let mol = null;
  try {
    mol = RDKit.get_mol(toMolblock(), JSON.stringify({ removeHs: false }));
    if (!mol || !mol.is_valid()) { toast('Fix the valence errors (red atoms) before cleaning up.', true); return; }
    mol.set_new_coords(true);
    importMolblock(mol.get_molblock(), { keepIds: true, quiet: true });
    toast('Layout cleaned up ✨');
  } catch (e) {
    logError('cleanup', e);
  } finally {
    if (mol) mol.delete();
  }
}
