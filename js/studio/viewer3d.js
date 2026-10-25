/* ============================================================================
   ChemSim · studio/viewer3d.js
   ----------------------------------------------------------------------------
   The 3Dmol.js 3D viewer window.
   ============================================================================ */
'use strict';

/* ============================================================================
   16. 3D VIEWER (3Dmol.js)
   ============================================================================ */
const v3 = { viewer: null, model: null, data: null, style: 'ballstick', surf: 'none', color: 'esp', opacity: 0.75, surfaceId: null, labels: false, chargeLabels: false };

async function open3D() {
  if (!state.atoms.length) { toast('Draw a molecule first!'); return; }
  const an = state.analysis;
  if (an.issues.some((i) => i.level === 'error')) toast('Heads-up: there are valence errors, so the 3D shape may look strange.', true);
  $('modal-3d').classList.remove('hidden');
  $('m3d-formula').innerHTML = hillFormula(an.counts, an.netCharge).html;
  try {
    const $3D = await load3Dmol();
    if (!v3.viewer) {
      v3.viewer = $3D.createViewer($('viewer3d'), { backgroundColor: '#070a10', antialias: true });
      log('3d', 'Created 3Dmol viewer');
    }
    v3.data = embed3D(an);
    v3.viewer.clear();
    v3.surfaceId = null;
    v3.model = v3.viewer.addModel(v3.data.molblock, 'sdf', { keepH: true });
    // give each 3D atom its Gasteiger charge so surfaces can be coloured by it
    v3.model.selectedAtoms({}).forEach((atom, i) => {
      atom.properties = atom.properties || {};
      atom.properties.partialCharge = v3.data.charges[i];
    });
    apply3DStyle();
    v3.viewer.resize();
    v3.viewer.zoomTo();
    v3.viewer.render();
    await apply3DSurface();
  } catch (e) {
    logError('3d', e);
    toast('3D viewer failed: ' + e.message, true);
  }
}

function closeModal3D() {
  $('modal-3d').classList.add('hidden');
  if (v3.viewer) v3.viewer.spin(false);
  $('v3-spin').checked = false;
}

function apply3DStyle() {
  if (!v3.viewer) return;
  const styles = {
    ballstick: { stick: { radius: 0.13, colorscheme: 'Jmol' }, sphere: { scale: 0.27, colorscheme: 'Jmol' } },
    stick: { stick: { radius: 0.2, colorscheme: 'Jmol' } },
    sphere: { sphere: { colorscheme: 'Jmol' } },
    line: { line: { colorscheme: 'Jmol', linewidth: 2 } },
  };
  v3.viewer.setStyle({}, styles[v3.style]);
  v3.viewer.removeAllLabels();
  if (v3.labels || v3.chargeLabels) {
    v3.model.selectedAtoms({}).forEach((atom, i) => {
      if (atom.elem === 'H' && !v3.chargeLabels) return;
      let text = v3.labels ? atom.elem : '';
      if (v3.chargeLabels) text += (text ? ' ' : '') + signed(v3.data.charges[i], 2);
      v3.viewer.addLabel(text, { position: { x: atom.x, y: atom.y, z: atom.z }, fontSize: 11, fontColor: 'white', backgroundColor: '#000000', backgroundOpacity: 0.55, inFront: true, alignment: 'center' });
    });
  }
  v3.viewer.render();
}

async function apply3DSurface() {
  if (!v3.viewer) return;
  v3.viewer.removeAllSurfaces();
  $('esp-legend').classList.toggle('hidden', !(v3.surf !== 'none' && v3.color === 'esp'));
  if (v3.surf === 'none') { v3.viewer.render(); return; }
  const $3D = window.$3Dmol;
  const style = v3.color === 'esp'
    ? { opacity: v3.opacity, colorscheme: { prop: 'partialCharge', gradient: 'rwb', min: -0.35, max: 0.35 } }
    : { opacity: v3.opacity, colorscheme: 'Jmol' };
  log('3d', `Computing ${v3.surf} surface coloured by ${v3.color}…`);
  const t0 = performance.now();
  try {
    await v3.viewer.addSurface($3D.SurfaceType[v3.surf], style, {});
    log('3d', `Surface ready in ${(performance.now() - t0).toFixed(0)} ms`);
  } catch (e) {
    logError('3d', 'Surface failed', e);
  }
  v3.viewer.render();
}

function bind3DControls() {
  document.querySelectorAll('.v3-style').forEach((b) => b.addEventListener('click', () => {
    document.querySelectorAll('.v3-style').forEach((x) => x.classList.toggle('active', x === b));
    v3.style = b.dataset.style;
    apply3DStyle();
  }));
  document.querySelectorAll('.v3-surf').forEach((b) => b.addEventListener('click', () => {
    document.querySelectorAll('.v3-surf').forEach((x) => x.classList.toggle('active', x === b));
    v3.surf = b.dataset.surf;
    apply3DSurface();
  }));
  document.querySelectorAll('.v3-color').forEach((b) => b.addEventListener('click', () => {
    document.querySelectorAll('.v3-color').forEach((x) => x.classList.toggle('active', x === b));
    v3.color = b.dataset.color;
    apply3DSurface();
  }));
  $('v3-opacity').addEventListener('change', (e) => { v3.opacity = Number(e.target.value); apply3DSurface(); });
  $('v3-labels').addEventListener('change', (e) => { v3.labels = e.target.checked; apply3DStyle(); });
  $('v3-charges').addEventListener('change', (e) => { v3.chargeLabels = e.target.checked; apply3DStyle(); });
  $('v3-spin').addEventListener('change', (e) => { if (v3.viewer) v3.viewer.spin(e.target.checked ? 'y' : false, 0.6); });
  $('v3-reset').addEventListener('click', () => { if (v3.viewer) { v3.viewer.zoomTo(); v3.viewer.render(); } });
  $('v3-png').addEventListener('click', () => {
    if (!v3.viewer) return;
    downloadDataUrl(v3.viewer.pngURI(), fileBaseName() + '-3d.png');
  });
  $('btn-close-3d').addEventListener('click', closeModal3D);
  $('modal-3d').addEventListener('click', (e) => { if (e.target.id === 'modal-3d') closeModal3D(); });
  window.addEventListener('resize', () => { if (v3.viewer && !$('modal-3d').classList.contains('hidden')) { v3.viewer.resize(); v3.viewer.render(); } });
}
