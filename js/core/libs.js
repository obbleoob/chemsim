/* ============================================================================
   ChemSim · core/libs.js
   ----------------------------------------------------------------------------
   Loads RDKit.js (WebAssembly) and 3Dmol.js from CDNs, with fallbacks.
   ============================================================================ */
'use strict';

/* ============================================================================
   4. LIBRARY LOADING (RDKit.js + 3Dmol.js)
   ----------------------------------------------------------------------------
   How we avoid WebAssembly / CORS problems with RDKit:
     • RDKit ships as two files: RDKit_minimal.js (a small loader) and
       RDKit_minimal.wasm (the compiled C++ chemistry engine, ~6 MB).
     • We load the .js with a normal <script> tag from a CDN.
     • We then call initRDKitModule({ locateFile }) and tell it to fetch the
       .wasm from the SAME CDN folder. unpkg/jsDelivr send the header
       "Access-Control-Allow-Origin: *" and the MIME type "application/wasm",
       so the browser allows the download and can compile it while streaming.
     • If the page itself was opened as file://, browsers refuse to fetch()
       anything, so we detect that and show a banner asking you to use the
       local web server.
     • If the first CDN fails we try a second one.
     • Versions are pinned exactly so an update can never break the app.
   ============================================================================ */
const RDKIT_VERSION = '2025.3.4-1.0.0';
const RDKIT_CDNS = [
  `https://unpkg.com/@rdkit/rdkit@${RDKIT_VERSION}/dist/`,
  `https://cdn.jsdelivr.net/npm/@rdkit/rdkit@${RDKIT_VERSION}/dist/`,
];
const THREEDMOL_VERSION = '2.5.3';
const THREEDMOL_CDNS = [
  `https://cdn.jsdelivr.net/npm/3dmol@${THREEDMOL_VERSION}/build/3Dmol-min.js`,
  `https://unpkg.com/3dmol@${THREEDMOL_VERSION}/build/3Dmol-min.js`,
];

let RDKit = null;            // the RDKit module once it is ready
let rdkitPromise = null;     // so we only load RDKit once
let threeDmolPromise = null; // so we only load 3Dmol once

/** Add a <script> tag and wait for it to load (or fail). */
function loadScript(url) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = url;
    s.async = true;
    s.crossOrigin = 'anonymous';
    s.onload = () => resolve(url);
    s.onerror = () => reject(new Error('Could not load script ' + url));
    document.head.appendChild(s);
  });
}

/**
 * Load RDKit once. Any mode can call this; it returns the same promise every
 * time. When it finishes, a "chemsim:rdkit-ready" (or "chemsim:rdkit-failed")
 * event is sent on window so modes can react.
 */
function loadRDKit() {
  if (!rdkitPromise) rdkitPromise = loadRDKitOnce();
  return rdkitPromise;
}

async function loadRDKitOnce() {
  const status = document.getElementById('lib-status');
  if (location.protocol === 'file:') {
    warn('rdkit', 'Page opened via file:// — WebAssembly cannot be fetched. Use a local server!');
    document.getElementById('file-warning').classList.remove('hidden');
  }
  for (const base of RDKIT_CDNS) {
    try {
      log('rdkit', 'Trying to load RDKit loader script from', base + 'RDKit_minimal.js');
      const t0 = performance.now();
      if (typeof window.initRDKitModule !== 'function') await loadScript(base + 'RDKit_minimal.js');
      log('rdkit', 'Loader script ready. Now downloading & compiling the WASM binary…');
      const mod = await window.initRDKitModule({
        // Tell Emscripten where the .wasm file lives (same CDN folder).
        locateFile: (file) => {
          log('rdkit', 'locateFile asked for', file, '→', base + file);
          return base + file;
        },
      });
      RDKit = mod;
      const ms = Math.round(performance.now() - t0);
      log('rdkit', `✅ RDKit ${RDKit.version()} ready in ${ms} ms`);
      status.textContent = `✅ RDKit ${RDKit.version()}`;
      status.className = 'lib-status ready';
      window.dispatchEvent(new CustomEvent('chemsim:rdkit-ready', { detail: RDKit }));
      return RDKit;
    } catch (e) {
      logError('rdkit', 'Loading from', base, 'failed:', e);
    }
  }
  status.textContent = '⚠️ RDKit failed to load';
  status.className = 'lib-status failed';
  status.dataset.tip = 'RDKit could not be loaded (are you offline, or did you open the page as a file?). Drawing and the built-in calculations still work, but SMILES, InChI, R/S labels, examples and Clean up need RDKit.';
  toast('RDKit could not be loaded. Basic features still work; see the console for details.', true);
  window.dispatchEvent(new CustomEvent('chemsim:rdkit-failed'));
  return null;
}

function load3Dmol() {
  if (window.$3Dmol) return Promise.resolve(window.$3Dmol);
  if (threeDmolPromise) return threeDmolPromise;
  threeDmolPromise = (async () => {
    for (const url of THREEDMOL_CDNS) {
      try {
        log('3dmol', 'Loading 3Dmol.js from', url);
        await loadScript(url);
        if (window.$3Dmol) {
          log('3dmol', '✅ 3Dmol.js ready');
          return window.$3Dmol;
        }
      } catch (e) {
        logError('3dmol', 'Failed from', url, e);
      }
    }
    threeDmolPromise = null;
    throw new Error('3Dmol.js could not be loaded');
  })();
  return threeDmolPromise;
}
