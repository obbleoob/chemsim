/* ============================================================================
   ChemSim · studio/tools/files.js
   ----------------------------------------------------------------------------
   📁 Import and export.
     Export the drawing as   .mol (V2000 / V3000), .sdf, .smi, InChI / InChIKey,
                             3D .mol and .xyz (from the 3D model)
     Import                  .mol, .sdf (pick a record), .smi, InChI (looked up
                             on PubChem; RDKit.js cannot read InChI), and
                             .pdb, .cif (small-molecule crystals) or .xyz, which
                             open in the 3D viewer
   Files can be chosen, dropped onto the tab or the drawing canvas, or pasted.
   ============================================================================ */
'use strict';

const Files = (() => {
  const esc = (s) => StudioTools.esc(s);

  function download(name, text, type = 'text/plain') {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type }));
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  const base = () => (typeof fileBaseName === 'function' ? fileBaseName() : 'molecule');

  /* ---------------- export ---------------- */
  function exports() {
    if (!state.atoms.length) return null;
    const out = { mol: toMolblock() };
    StudioTools.withMol((m) => {
      out.smiles = m.get_smiles();
      out.v3000 = m.get_v3Kmolblock();
      try { out.inchi = m.get_inchi(); out.inchikey = out.inchi ? RDKit.get_inchikey_for_inchi(out.inchi) : ''; } catch (e) { out.inchi = ''; }
    });
    out.sdf = `${base()}\n${out.mol.split('\n').slice(1).join('\n')}\n>  <SMILES>\n${out.smiles || ''}\n\n$$$$\n`;
    return out;
  }
  function xyz() {
    const E = StudioTools.embed();
    if (!E) return null;
    const n = E.elements.length;
    return `${n}\n${base()} (ChemSim 3D model)\n` + E.elements.map((el, i) => `${el.padEnd(2)} ${E.coords[3 * i].toFixed(4).padStart(10)} ${E.coords[3 * i + 1].toFixed(4).padStart(10)} ${E.coords[3 * i + 2].toFixed(4).padStart(10)}`).join('\n') + '\n';
  }

  /* ---------------- import ---------------- */
  /** Work out what a piece of text is and load it. Returns a message. */
  async function importText(text, name = '') {
    const t = text.trim();
    const ext = (name.split('.').pop() || '').toLowerCase();
    if (!t) return 'The file is empty.';
    if (ext === 'pdb' || /^(ATOM|HETATM|HEADER|CRYST1)/m.test(t) && ext !== 'cif') { open3DFile(t, 'pdb', name); return 'Opened in the 3D viewer (PDB).'; }
    if (ext === 'cif' || /^data_/m.test(t) && /_atom_site/.test(t)) { open3DFile(t, 'cif', name); return 'Opened in the 3D viewer (CIF crystal structure).'; }
    if (ext === 'xyz' || /^\s*\d+\s*\n.*\n\s*[A-Z][a-z]?\s+-?\d/.test(t)) { open3DFile(t, 'xyz', name); return 'Opened in the 3D viewer (XYZ).'; }
    if (/^InChI=/.test(t)) return importInChI(t.split(/\s/)[0]);
    if (/M\s+END/.test(t)) {
      const recs = t.split(/\$\$\$\$\s*/).map((r) => r.replace(/^\s*\n/, '')).filter((r) => /M\s+END/.test(r));
      if (recs.length > 1) return { records: recs };
      return loadMol(recs[0]);
    }
    const first = t.split(/\r?\n/).find((l) => l.trim()) || '';
    const smi = first.trim().split(/\s+/)[0];
    return loadSmiles(smi) ? `Loaded SMILES ${smi}` : `Could not read “${smi.slice(0, 40)}” as SMILES.`;
  }

  /** Load a MOL block (V2000 or V3000); 3D or missing coordinates get a fresh 2D layout. */
  function loadMol(mb) {
    let mol = null;
    try {
      mol = RDKit.get_mol(mb, JSON.stringify({ removeHs: false }));
      if (!mol || !mol.is_valid()) return 'RDKit could not read this MOL block.';
      const v2 = mol.get_molblock();
      const lines = v2.split('\n');
      const ci = lines.findIndex((l) => /V2000/.test(l));
      const n = parseInt(lines[ci].slice(0, 3), 10);
      const zs = lines.slice(ci + 1, ci + 1 + n).map((l) => parseFloat(l.slice(20, 30)));
      const xs = lines.slice(ci + 1, ci + 1 + n).map((l) => parseFloat(l.slice(0, 10)));
      const flat = zs.every((z) => Math.abs(z) < 1e-3) && xs.some((x) => Math.abs(x) > 1e-3);
      if (!flat) { mol.set_new_coords(true); }
      importMolblock(flat ? v2 : mol.get_molblock());
      return flat ? 'Loaded the MOL file (with its 2D drawing and wedges).' : 'Loaded the MOL file; it had 3D or no coordinates, so a new 2D layout was made.';
    } catch (e) { return 'Import failed: ' + e.message; } finally { if (mol) mol.delete(); }
  }

  async function importInChI(inchi) {
    try {
      const r = await fetch('https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/inchi/property/IsomericSMILES,SMILES/JSON', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'inchi=' + encodeURIComponent(inchi) });
      if (!r.ok) throw new Error(`PubChem said ${r.status}`);
      const j = await r.json();
      const p = j.PropertyTable.Properties[0];
      const smi = p.IsomericSMILES || p.SMILES;
      return loadSmiles(smi) ? `InChI looked up on PubChem (CID ${p.CID}) and loaded.` : 'PubChem returned a structure RDKit could not read.';
    } catch (e) {
      return `RDKit.js cannot read InChI directly, and the PubChem lookup failed (${e.message}). Check your internet connection, or paste a SMILES instead.`;
    }
  }

  async function readFile(file) {
    const text = await file.text();
    return importText(text, file.name);
  }

  /* ---------------- the tab ---------------- */
  function render(el) {
    const ex = exports();
    el.innerHTML = `
      <div class="card"><h2>Export the drawing</h2>
        ${ex ? `<div class="file-grid">
          <button class="hbtn small" data-x="mol">.mol (V2000)</button><button class="hbtn small" data-x="v3000">.mol (V3000)</button>
          <button class="hbtn small" data-x="sdf">.sdf</button><button class="hbtn small" data-x="smi">.smi</button>
          <button class="hbtn small" data-x="inchi">InChI .txt</button><button class="hbtn small" data-x="mol3d">3D .mol</button><button class="hbtn small" data-x="xyz">3D .xyz</button></div>
          <table class="tt" style="margin-top:8px"><tbody>
            <tr><th>SMILES</th><td class="mono">${esc(ex.smiles || '—')}</td></tr>
            <tr><th>InChI</th><td class="mono small">${esc(ex.inchi || '—')}</td></tr>
            <tr><th>InChIKey</th><td class="mono">${esc(ex.inchikey || '—')}</td></tr></tbody></table>
          <p class="muted-note">The InChIKey is a fixed-length hash of the InChI: handy for searching the web and databases. The 3D files come from ChemSim's own force-field model.</p>` : '<p class="muted-note">Draw something to export it.</p>'}</div>
      <div class="card"><h2>Import</h2>
        <div class="drop-zone" id="fi-drop">Drop a file here, or <label class="linkish">choose one<input type="file" id="fi-file" accept=".mol,.sdf,.mdl,.smi,.smiles,.txt,.inchi,.pdb,.cif,.xyz" hidden/></label>
          <div class="dim small">.mol · .sdf · .smi · InChI · .pdb · .cif · .xyz</div></div>
        <textarea id="fi-paste" rows="3" placeholder="…or paste SMILES, an InChI or a MOL block here"></textarea>
        <div class="row"><button class="hbtn small accent" id="fi-go">Import pasted text</button></div>
        <div id="fi-msg" class="small"></div><div id="fi-recs"></div>
        <p class="muted-note">.pdb, .cif and .xyz files open in the 3D viewer (proteins, crystal structures, computed geometries). CIF support is for small-molecule crystals; the unit cell is drawn when the file defines one.</p></div>`;
    el.querySelectorAll('[data-x]').forEach((b) => b.addEventListener('click', () => {
      const x = exports();
      const k = b.dataset.x, nm = base();
      if (k === 'mol') download(`${nm}.mol`, x.mol, 'chemical/x-mdl-molfile');
      if (k === 'v3000') download(`${nm}-v3000.mol`, x.v3000, 'chemical/x-mdl-molfile');
      if (k === 'sdf') download(`${nm}.sdf`, x.sdf, 'chemical/x-mdl-sdfile');
      if (k === 'smi') download(`${nm}.smi`, `${x.smiles} ${nm}\n`);
      if (k === 'inchi') download(`${nm}-inchi.txt`, `${x.inchi}\n${x.inchikey}\n`);
      if (k === 'mol3d') { const E = StudioTools.embed(); if (E) download(`${nm}-3d.mol`, E.molblock, 'chemical/x-mdl-molfile'); }
      if (k === 'xyz') { const t = xyz(); if (t) download(`${nm}.xyz`, t, 'chemical/x-xyz'); }
    }));
    const msg = el.querySelector('#fi-msg');
    const handle = async (p) => {
      const r = await p;
      if (r && r.records) {
        msg.textContent = `${r.records.length} structures in this SDF file. Pick one:`;
        el.querySelector('#fi-recs').innerHTML = r.records.slice(0, 200).map((rec, i) => `<button class="mini" data-rec="${i}">${esc(rec.split('\n')[0].trim() || `#${i + 1}`)}</button>`).join(' ');
        el.querySelectorAll('[data-rec]').forEach((b) => b.addEventListener('click', () => { msg.textContent = loadMol(r.records[b.dataset.rec]); }));
      } else { msg.textContent = r || ''; el.querySelector('#fi-recs').innerHTML = ''; }
    };
    el.querySelector('#fi-file').addEventListener('change', (e) => { if (e.target.files[0]) handle(readFile(e.target.files[0])); });
    el.querySelector('#fi-go').addEventListener('click', () => handle(importText(el.querySelector('#fi-paste').value)));
    const dz = el.querySelector('#fi-drop');
    dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.classList.add('over'); });
    dz.addEventListener('dragleave', () => dz.classList.remove('over'));
    dz.addEventListener('drop', (e) => { e.preventDefault(); dz.classList.remove('over'); const f = e.dataTransfer.files[0]; if (f) handle(readFile(f)); });
  }

  // files dropped straight onto the drawing canvas are imported too
  const wrap = document.querySelector('#view-studio .canvas-wrap');
  if (wrap) {
    wrap.addEventListener('dragover', (e) => { if (e.dataTransfer && [...e.dataTransfer.types].includes('Files')) e.preventDefault(); });
    wrap.addEventListener('drop', async (e) => {
      const f = e.dataTransfer && e.dataTransfer.files[0];
      if (!f) return;
      e.preventDefault();
      const r = await readFile(f);
      if (r && r.records) { StudioTools.toggle(true); StudioTools.select('files'); toast(`${r.records.length} structures: pick one in the Files tab`); }
      else if (r) toast(r);
    });
  }

  StudioTools.add({ id: 'files', icon: '📁', title: 'Import & export files', short: 'Files', render });
  return { importText, loadMol, exports, xyz };
})();
