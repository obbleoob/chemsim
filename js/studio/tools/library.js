/* ============================================================================
   ChemSim · studio/tools/library.js
   ----------------------------------------------------------------------------
   📚 Molecule library and 📓 reaction notebook, saved in the browser
   (IndexedDB "molecules" store; My data ▸ Export includes them).

   Library   save the drawing with a name, folder and tags; search, open,
             move, rename, delete; export a folder as an .sdf file.
   Notebook  a timeline of reaction steps (reactants → product, reagents,
             conditions, yield, notes). A step can branch from any earlier
             step, so alternative routes sit side by side.
   ============================================================================ */
'use strict';

const Library = (() => {
  const esc = (s) => StudioTools.esc(s);
  let view = 'lib', filter = '', folderOpen = new Set(['Unsorted']);

  async function all(kind) {
    try { return (await ChemStore.getAll('molecules')).filter((x) => x.value && x.value.kind === kind); }
    catch (e) { warn('library', 'Could not read the library', e); return []; }
  }

  /** The current drawing as a library record. */
  function record(name, folder, tags) {
    const an = state.analysis;
    return {
      kind: 'molecule', name: name || 'Untitled', folder: folder || 'Unsorted', tags,
      smiles: (state.rd && state.rd.smiles) || '', formula: an ? hillFormula(an.counts, an.netCharge).text : '', mw: an ? an.mw : 0,
      snapshot: snapshot(), molblock: toMolblock(), createdAt: new Date().toISOString(),
    };
  }

  async function save(name, folder, tags) {
    if (!state.atoms.length) { toast('Draw something first'); return null; }
    const key = `mol-${Date.now()}`;
    await ChemStore.put('molecules', key, record(name, folder, tags));
    toast(`Saved “${name}” to the library`);
    log('library', 'Saved', key, name);
    return key;
  }

  function openRecord(v) {
    pushHistory();
    restore(v.snapshot);
    fitView();
    onMoleculeChanged();
    toast(`Opened “${v.name}”`);
  }

  function download(name, text, type = 'chemical/x-mdl-sdfile') {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type }));
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  /** SDF text for a list of library records (name and tags as data fields). */
  function toSDF(items) {
    return items.map(({ value: v }) => `${v.name}\n${v.molblock.split('\n').slice(1).join('\n')}\n>  <NAME>\n${v.name}\n\n>  <SMILES>\n${v.smiles}\n\n>  <TAGS>\n${(v.tags || []).join(', ')}\n\n$$$$`).join('\n') + '\n';
  }

  const thumb = (smi) => (smi && typeof Synthesis !== 'undefined' ? Synthesis.svgOf(smi, 110, 80) : '');

  /* ---------------- rendering ---------------- */
  async function render(el) {
    el.innerHTML = `<div class="seg"><button class="seg-b${view === 'lib' ? ' active' : ''}" data-lv="lib">📚 Library</button><button class="seg-b${view === 'nb' ? ' active' : ''}" data-lv="nb">📓 Reaction notebook</button></div><div id="lv-body"></div>`;
    el.querySelectorAll('[data-lv]').forEach((b) => b.addEventListener('click', () => { view = b.dataset.lv; render(el); }));
    const box = el.querySelector('#lv-body');
    if (view === 'lib') await renderLib(box, el); else await renderNB(box, el);
  }

  async function renderLib(box, el) {
    const items = await all('molecule');
    const folders = [...new Set(['Unsorted', ...items.map((x) => x.value.folder || 'Unsorted')])].sort();
    const common = document.getElementById('p-common') && document.getElementById('p-common').textContent;
    const defName = common && common !== '—' ? common : (state.analysis && state.atoms.length ? hillFormula(state.analysis.counts, state.analysis.netCharge).text : '');
    box.innerHTML = `
      <div class="card"><h2>Save the drawing</h2>
        <div class="row"><input type="text" id="lb-name" placeholder="Name" value="${esc(defName)}" style="flex:1"/>
        <input type="text" id="lb-folder" list="lb-folders" placeholder="Folder" value="Unsorted" style="width:120px"/>
        <datalist id="lb-folders">${folders.map((f) => `<option value="${esc(f)}">`).join('')}</datalist></div>
        <div class="row"><input type="text" id="lb-tags" placeholder="Tags, comma-separated (e.g. drug, chiral, exam)" style="flex:1"/><button class="hbtn small accent" id="lb-save">💾 Save</button></div></div>
      <div class="row"><input type="text" id="lb-filter" placeholder="Search name, formula, tag or SMILES…" value="${esc(filter)}" style="flex:1"/><span class="dim small">${items.length} saved</span></div>
      <div id="lb-list">${items.length ? '' : '<p class="muted-note">Nothing saved yet.</p>'}</div>`;
    const list = box.querySelector('#lb-list');
    const q = filter.toLowerCase();
    const show = items.filter(({ value: v }) => !q || `${v.name} ${v.formula} ${(v.tags || []).join(' ')} ${v.smiles} ${v.folder}`.toLowerCase().includes(q));
    folders.forEach((f) => {
      const inF = show.filter((x) => (x.value.folder || 'Unsorted') === f);
      if (!inF.length) return;
      const open = folderOpen.has(f) || !!q;
      const sec = document.createElement('div');
      sec.className = 'lib-folder';
      sec.innerHTML = `<div class="lib-fh"><button class="mini lib-toggle">${open ? '▾' : '▸'}</button> 📁 <b>${esc(f)}</b> <span class="dim small">${inF.length}</span><span class="lab-spacer"></span><button class="mini lib-sdf" data-tip="Download this folder as an .sdf file">⬇ SDF</button></div>
        <div class="lib-grid${open ? '' : ' hidden'}">${inF.map(({ key, value: v }) => `<div class="lib-item" data-key="${esc(key)}">${thumb(v.smiles)}
          <div class="lib-name">${esc(v.name)}</div><div class="dim small">${esc(v.formula)} · ${v.mw ? v.mw.toFixed(1) : ''}</div>
          <div>${(v.tags || []).map((t) => `<span class="pill">${esc(t)}</span>`).join('')}</div>
          <div class="row"><button class="mini" data-act="open">Open</button><button class="mini" data-act="rename">Rename</button><button class="mini" data-act="move">Move</button><button class="mini" data-act="del">🗑</button></div></div>`).join('')}</div>`;
      sec.querySelector('.lib-toggle').addEventListener('click', () => { if (folderOpen.has(f)) folderOpen.delete(f); else folderOpen.add(f); renderLib(box, el); });
      sec.querySelector('.lib-sdf').addEventListener('click', () => download(`${f.replace(/\W+/g, '_')}.sdf`, toSDF(inF)));
      list.appendChild(sec);
    });
    list.querySelectorAll('.lib-item').forEach((card) => {
      const it = items.find((x) => x.key === card.dataset.key);
      card.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', async () => {
        const act = b.dataset.act;
        if (act === 'open') openRecord(it.value);
        if (act === 'del') { if (!confirm(`Delete “${it.value.name}”?`)) return; await ChemStore.remove('molecules', it.key); renderLib(box, el); }
        if (act === 'rename') { const n = prompt('New name', it.value.name); if (n) { it.value.name = n; await ChemStore.put('molecules', it.key, it.value); renderLib(box, el); } }
        if (act === 'move') { const f = prompt('Move to folder', it.value.folder || 'Unsorted'); if (f) { it.value.folder = f; folderOpen.add(f); await ChemStore.put('molecules', it.key, it.value); renderLib(box, el); } }
      }));
    });
    box.querySelector('#lb-save').addEventListener('click', async () => {
      const tags = box.querySelector('#lb-tags').value.split(',').map((t) => t.trim()).filter(Boolean);
      const folder = box.querySelector('#lb-folder').value.trim() || 'Unsorted';
      folderOpen.add(folder);
      if (await save(box.querySelector('#lb-name').value.trim() || 'Untitled', folder, tags)) renderLib(box, el);
    });
    box.querySelector('#lb-filter').addEventListener('input', (e) => { filter = e.target.value; const pos = e.target.selectionStart; renderLib(box, el).then(() => { const f = box.querySelector('#lb-filter'); if (f) { f.focus(); f.setSelectionRange(pos, pos); } }); });
  }

  /* ---------------- reaction notebook ---------------- */
  let branchFrom = null;
  async function renderNB(box, el) {
    const steps = (await all('step')).sort((a, b) => a.value.createdAt.localeCompare(b.value.createdAt));
    const byParent = new Map();
    steps.forEach((s) => { const p = s.value.parent || 'root'; byParent.set(p, [...(byParent.get(p) || []), s]); });
    const drawn = state.rd && state.rd.smiles;
    box.innerHTML = `
      <div class="card"><h2>Add a step ${branchFrom ? `<span class="h2-note">branching from “${esc((steps.find((s) => s.key === branchFrom) || { value: { title: '?' } }).value.title)}” <button class="mini" id="nb-unbranch">✕</button></span>` : ''}</h2>
        <div class="row"><input type="text" id="nb-title" placeholder="Step title, e.g. “Esterification”" style="flex:1"/></div>
        <div class="row"><input type="text" id="nb-react" placeholder="Reactants (SMILES, separated by .)" style="flex:1"/></div>
        <div class="row"><input type="text" id="nb-prod" placeholder="Product (SMILES)" value="${esc(drawn || '')}" style="flex:1"/><span class="dim small">← your drawing</span></div>
        <div class="row"><input type="text" id="nb-cond" placeholder="Reagents & conditions (e.g. conc. H₂SO₄, reflux 1 h)" style="flex:1"/><input type="number" id="nb-yield" placeholder="Yield %" style="width:80px" min="0" max="100" step="any"/></div>
        <textarea id="nb-notes" rows="2" placeholder="Observations, notes…"></textarea>
        <div class="row"><button class="hbtn small accent" id="nb-add">＋ Add step</button></div></div>
      <div id="nb-tree">${steps.length ? '' : '<p class="muted-note">No steps yet. Each step records a reaction; branch from a step to try an alternative route.</p>'}</div>`;
    const tree = box.querySelector('#nb-tree');
    const draw = (parent, depth) => (byParent.get(parent) || []).forEach((s) => {
      const v = s.value;
      const d = document.createElement('div');
      d.className = 'nb-step';
      d.style.marginLeft = `${depth * 18}px`;
      d.innerHTML = `<div class="nb-head"><b>${esc(v.title || 'Step')}</b> <span class="dim small">${new Date(v.createdAt).toLocaleDateString()}</span>${v.yield !== null && v.yield !== undefined && v.yield !== '' ? ` <span class="pill ok">${v.yield} %</span>` : ''}<span class="lab-spacer"></span>
        <button class="mini" data-a="branch" data-tip="Add the next step (or an alternative) after this one">⑂ Branch</button><button class="mini" data-a="draw">Draw product</button><button class="mini" data-a="calc">🧮</button><button class="mini" data-a="del">🗑</button></div>
        <div class="row">${(v.reactants || []).map((r) => `<figure class="mol-fig small-fig">${thumb(r)}</figure>`).join('<span class="plus">+</span>')}${v.reactants && v.reactants.length ? '<span class="plus">→</span>' : ''}${v.product ? `<figure class="mol-fig small-fig">${thumb(v.product)}</figure>` : ''}</div>
        ${v.conditions ? `<div class="small"><b>Conditions:</b> ${esc(v.conditions)}</div>` : ''}${v.notes ? `<div class="small dim">${esc(v.notes)}</div>` : ''}`;
      d.querySelectorAll('[data-a]').forEach((b) => b.addEventListener('click', async () => {
        if (b.dataset.a === 'branch') { branchFrom = s.key; renderNB(box, el); box.querySelector('#nb-react').value = v.product || ''; }
        if (b.dataset.a === 'draw' && v.product) loadSmiles(v.product);
        if (b.dataset.a === 'calc' && v.product) Calculator.load(v.reactants || [], [v.product]);
        if (b.dataset.a === 'del') {
          if (!confirm('Delete this step and everything that branches from it?')) return;
          const kill = [s.key];
          for (let i = 0; i < kill.length; i++) steps.filter((x) => x.value.parent === kill[i]).forEach((x) => kill.push(x.key));
          for (const k of kill) await ChemStore.remove('molecules', k);
          renderNB(box, el);
        }
      }));
      tree.appendChild(d);
      draw(s.key, depth + 1);
    });
    draw('root', 0);
    const ub = box.querySelector('#nb-unbranch');
    if (ub) ub.addEventListener('click', () => { branchFrom = null; renderNB(box, el); });
    box.querySelector('#nb-add').addEventListener('click', async () => {
      const g = (id) => box.querySelector(id).value.trim();
      const rec = { kind: 'step', title: g('#nb-title') || 'Step', reactants: g('#nb-react').split('.').map((x) => x.trim()).filter(Boolean), product: g('#nb-prod'), conditions: g('#nb-cond'), yield: g('#nb-yield') === '' ? null : Number(g('#nb-yield')), notes: box.querySelector('#nb-notes').value.trim(), parent: branchFrom, createdAt: new Date().toISOString() };
      await ChemStore.put('molecules', `nb-${Date.now()}`, rec);
      branchFrom = null;
      toast('Step added to the notebook');
      renderNB(box, el);
    });
  }

  StudioTools.add({ id: 'lib', icon: '📚', title: 'Molecule library & reaction notebook', short: 'Library', render, keepOnChange: true });
  return { save, all, toSDF, record, openRecord };
})();
