/* ============================================================================
   ChemSim · studio/pubchem.js
   ----------------------------------------------------------------------------
   IUPAC name lookup and search-by-name through PubChem.
   ============================================================================ */
'use strict';

/* ============================================================================
   9. PUBCHEM LOOKUP (IUPAC names)
   ----------------------------------------------------------------------------
   RDKit cannot write IUPAC names (no free library does this reliably), so we
   ask PubChem, the big public chemistry database run by the US NIH. This
   needs an internet connection and only works for molecules PubChem knows.
   ============================================================================ */
const nameCache = new Map();
let nameTimer = null;
let nameRequestId = 0;

function scheduleNameLookup(smiles) {
  clearTimeout(nameTimer);
  const iupac = document.getElementById('p-iupac');
  const common = document.getElementById('p-common');
  if (!smiles) { iupac.textContent = '—'; common.textContent = '—'; return; }
  if (nameCache.has(smiles)) { showName(nameCache.get(smiles)); return; }
  iupac.innerHTML = '<span class="pending">looking up on PubChem…</span>';
  common.innerHTML = '<span class="pending">…</span>';
  nameTimer = setTimeout(() => lookupName(smiles), 700);   // wait until you stop editing
}

async function lookupName(smiles) {
  const myId = ++nameRequestId;
  log('pubchem', 'Looking up name for', smiles);
  let result;
  try {
    const resp = await fetch('https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/smiles/property/IUPACName,Title/JSON', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'smiles=' + encodeURIComponent(smiles),
    });
    if (resp.status === 404) {
      result = { notFound: true };
    } else if (!resp.ok) {
      throw new Error('HTTP ' + resp.status);
    } else {
      const data = await resp.json();
      const p = data.PropertyTable && data.PropertyTable.Properties && data.PropertyTable.Properties[0];
      result = p && p.CID ? { iupac: p.IUPACName, title: p.Title, cid: p.CID } : { notFound: true };
    }
    nameCache.set(smiles, result);
    log('pubchem', 'Result', result);
  } catch (e) {
    warn('pubchem', 'Name lookup failed (offline?)', e);
    result = { offline: true };
  }
  if (myId === nameRequestId && state.rd && state.rd.smiles === smiles) showName(result);
}

function showName(r) {
  const iupac = document.getElementById('p-iupac');
  const common = document.getElementById('p-common');
  if (r.offline) {
    iupac.innerHTML = '<span class="pending">PubChem not reachable (offline?)</span>';
    common.textContent = '—';
  } else if (r.notFound) {
    iupac.innerHTML = '<span class="pending">Not in PubChem: maybe a brand-new molecule!</span>';
    common.textContent = '—';
  } else {
    iupac.textContent = r.iupac || '(no IUPAC name listed)';
    common.innerHTML = r.title ? `${escapeHtml(r.title)} <a class="dim" href="https://pubchem.ncbi.nlm.nih.gov/compound/${r.cid}" target="_blank" rel="noopener">CID ${r.cid} ↗</a>` : '—';
  }
}

async function loadByName(name) {
  name = name.trim();
  if (!name) return;
  log('pubchem', 'Searching PubChem for name', name);
  toast(`Searching PubChem for “${name}”…`);
  try {
    const resp = await fetch(`https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/${encodeURIComponent(name)}/property/IsomericSMILES/JSON`);
    if (!resp.ok) { toast(`PubChem does not know “${name}”.`, true); return; }
    const data = await resp.json();
    const p = data.PropertyTable.Properties[0];
    const smi = p.SMILES || p.IsomericSMILES || p.CanonicalSMILES || p.ConnectivitySMILES;
    log('pubchem', 'Found SMILES', smi, p);
    if (smi) loadSmiles(smi);
  } catch (e) {
    warn('pubchem', e);
    toast('Could not reach PubChem (are you online?)', true);
  }
}

const escapeHtml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
