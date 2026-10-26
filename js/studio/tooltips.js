/* ============================================================================
   ChemSim · studio/tooltips.js
   ----------------------------------------------------------------------------
   Hover explanations for atoms and bonds on the canvas.
   ============================================================================ */
'use strict';

/* ============================================================================
   13. TOOLTIPS
   ----------------------------------------------------------------------------
   (a) Canvas tooltips explain an atom or bond you hover over.
   (b) UI tooltips: any HTML element with a data-tip="…" attribute.
   ============================================================================ */
const canvasTip = document.getElementById('canvas-tooltip');

function showCanvasTooltip(hit, e) {
  const an = state.analysis;
  if (!an) return;
  let html = '';
  if (hit.type === 'atom') html = atomTooltip(getAtom(hit.id), an.atoms[hit.id]);
  else if (hit.type === 'bond') html = bondTooltip(state.bonds.find((b) => b.id === hit.id));
  else if (hit.type === 'vh') html = implicitHTooltip(hit);
  else if (hit.type === 'arrow') html = arrowTooltip(hit.id);
  if (!html) return hideCanvasTooltip();
  canvasTip.innerHTML = html;
  canvasTip.classList.remove('hidden');
  const wrap = canvas.parentElement.getBoundingClientRect();
  let x = e.clientX - wrap.left + 18, y = e.clientY - wrap.top + 18;
  const tw = canvasTip.offsetWidth, th = canvasTip.offsetHeight;
  if (x + tw > wrap.width - 8) x = e.clientX - wrap.left - tw - 18;
  if (y + th > wrap.height - 8) y = Math.max(8, wrap.height - th - 8);
  canvasTip.style.left = Math.max(8, x) + 'px';
  canvasTip.style.top = y + 'px';
}
function hideCanvasTooltip() { canvasTip.classList.add('hidden'); }

function atomTooltip(a, r) {
  if (!a || !r) return '';
  const E = ELEMENTS[a.el];
  const N = r.nonBondingElectrons, B = 2 * r.valence;
  const fc = r.fcComputed;
  const nbHtml = r.implicitH ? ` (including ${r.implicitH} implicit H)` : '';
  let html = `<h4 style="color:${E.color}">${E.name} <span class="dim">· ${r.label}</span></h4>`;

  // Formal charge with a worked example
  html += `<div class="tt-row"><span>Formal charge</span><b>${signed(fc)}</b></div>`;
  html += `<div class="tt-explain"><span class="formula-box">FC = V − N − B/2 = ${E.ve} − ${N} − ${B}/2 = ${signed(fc)}</span><br/>
    V = ${E.ve} valence electrons (group ${E.group}) · N = ${N} non-bonding e⁻ (${r.lonePairs} lone pair${r.lonePairs === 1 ? '' : 's'}${r.radical ? ' + 1 unpaired' : ''}) · B = ${B} bonding e⁻ (${r.valence} bond${r.valence === 1 ? '' : 's'}${nbHtml})${r.over ? '<br/>⚠ This number is not meaningful: the atom has more bonds than it physically can.' : ''}</div>`;

  // Oxidation number explanation
  const parts = Object.entries(r.oxParts || {}).map(([el, p]) => {
    const bits = [];
    if (p.more) bits.push(`+${p.more} from ${p.more} bond${p.more > 1 ? 's' : ''} to ${el} (more electronegative)`);
    if (p.less) bits.push(`−${p.less} from ${p.less} bond${p.less > 1 ? 's' : ''} to ${el} (less electronegative)`);
    if (p.same) bits.push(`0 from bonds to ${el} (same element, split evenly)`);
    return bits.join(', ');
  }).filter(Boolean);
  if (a.charge) parts.push(`${signed(a.charge)} from the formal charge`);
  html += `<div class="tt-row"><span>Oxidation number</span><b>${signed(r.ox)}</b></div>`;
  html += `<div class="tt-explain">${parts.length ? parts.join('; ') : 'No bonds, so the oxidation number equals the charge.'}</div>`;

  // Partial charge
  const q = r.partial;
  html += `<div class="tt-row"><span>Partial charge (Gasteiger)</span><b class="${q < 0 ? 'q-neg' : 'q-pos'}">${signed(q, 3)}</b></div>`;
  html += `<div class="tt-explain">${Math.abs(q) < 0.05 ? 'Nearly neutral: electrons are shared about evenly.' : q < 0 ? 'Electron-rich (δ−): it pulls electron density toward itself (EN ' + E.en + ').' : 'Electron-poor (δ+): neighbours pull electron density away from it (EN ' + E.en + ').'}${r.implicitH ? ` With its H atoms the group is ${signed(r.partialGroup, 3)}.` : ''}</div>`;

  // Hybridisation / VSEPR
  if (r.sn >= 2) {
    html += `<div class="tt-row"><span>Hybridisation</span><b>${r.hyb}</b></div>`;
    html += `<div class="tt-explain">Steric number ${r.sn} = ${r.sn - r.lonePairs} σ-bonded atoms + ${r.lonePairs} lone pair${r.lonePairs === 1 ? '' : 's'} → ${r.electronGeometry || '?'} electron geometry${r.shape ? `, molecular shape <b>${r.shape}</b>` : ''}.</div>`;
  }
  const octet = a.el === 'H' ? 2 : 8;
  html += `<div class="tt-row"><span>Electrons around atom</span><b>${r.electrons} ${r.electrons === octet ? '✔' : r.electrons > octet ? '⚠' : '•'}</b></div>`;
  if (r.implicitH && state.notation === 'skeletal') html += `<div class="tt-explain">Bonded to ${r.implicitH} hidden H atom${r.implicitH > 1 ? 's' : ''} (switch to Lewis view to see them).</div>`;
  if (state.rd && state.rd.cipAtoms && state.rd.cipAtoms[a.id]) html += `<div class="tt-row"><span>Stereocentre</span><b>(${state.rd.cipAtoms[a.id]})</b></div>`;
  r.msgs.forEach((m) => { html += `<div class="${m.level === 'error' ? 'tt-err' : 'tt-warn'}">${m.text}</div>`; });
  return html;
}

function bondTooltip(b) {
  if (!b) return '';
  const an = state.analysis;
  const A = getAtom(b.a1), B = getAtom(b.a2);
  const e = an.bonds[b.id];
  const names = { 1: 'Single bond (1 σ)', 2: 'Double bond (1 σ + 1 π)', 3: 'Triple bond (1 σ + 2 π)' };
  let html = `<h4>${A.el}${atomIndex(A.id) + 1}–${B.el}${atomIndex(B.id) + 1} · ${names[b.order]}</h4>`;
  html += `<div class="tt-row"><span>ΔEN (Pauling)</span><b>|${ELEMENTS[A.el].en} − ${ELEMENTS[B.el].en}| = ${e.dEN.toFixed(2)}</b></div>`;
  const negEl = an.nodes[e.negEnd].el;
  html += `<div class="tt-explain">${e.dEN < 0.4 ? 'Electrons are shared about equally: a <b>non-polar</b> covalent bond.' : `<b>${e.kind}</b>: the shared electrons are pulled toward <b>${negEl}</b>, which becomes δ−.`}</div>`;
  if (b.stereo === 1) html += `<div class="tt-explain">🔺 <b>Wedge</b>: the bond comes toward you, out of the page. The narrow end is at ${A.el}${atomIndex(A.id) + 1}.</div>`;
  if (b.stereo === 6) html += `<div class="tt-explain">┅ <b>Dash</b>: the bond points away from you, behind the page. The narrow end is at ${A.el}${atomIndex(A.id) + 1}.</div>`;
  if (e.ringSize) html += `<div class="tt-explain">Part of a ${e.ringSize}-membered ring.</div>`;
  if (state.rd && state.rd.cipBonds && state.rd.cipBonds[b.id]) {
    const lab = state.rd.cipBonds[b.id];
    html += `<div class="tt-row"><span>Geometry</span><b>(${lab})</b></div><div class="tt-explain">${lab === 'E' ? 'E (entgegen) = the higher-priority groups are on opposite sides.' : 'Z (zusammen) = the higher-priority groups are on the same side.'}</div>`;
  }
  html += `<div class="tt-explain dim">Keys: 1/2/3 set the order, w = wedge, d = dash, Del = delete.</div>`;
  return html;
}

function implicitHTooltip(hit) {
  const nd = state.analysis.nodes[hit.node];
  return `<h4 style="color:${ELEMENTS.H.color}">Hydrogen <span class="dim">· on ${atomLabelName(hit.parentId)}</span></h4>
    <div class="tt-explain">An implicit H: skeletal drawings leave it out, and the Lewis view adds it back.</div>
    <div class="tt-row"><span>Oxidation number</span><b>${signed(nd.ox)}</b></div>
    <div class="tt-row"><span>Partial charge</span><b class="${nd.q < 0 ? 'q-neg' : 'q-pos'}">${signed(nd.q, 3)}</b></div>`;
}
