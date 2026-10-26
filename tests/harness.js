/* ============================================================================
   ChemSim test harness
   ----------------------------------------------------------------------------
   Small helpers shared by the test files: start a browser, open the app,
   collect console errors, and simple assertions.

   Needs Node.js and Playwright (npm i -g playwright && npx playwright install chromium).
   The app must be served at http://localhost:8000 (python -m http.server 8000).

   Offline CDNs: set CHEMSIM_LIBS to a folder containing
     rdkit/RDKit_minimal.js, rdkit/RDKit_minimal.wasm, 3dmol/3Dmol-min.js
   and CDN requests are answered from there instead of the internet.
   ============================================================================ */
'use strict';

const path = require('path');
const { chromium } = require('playwright');

const BASE = process.env.CHEMSIM_URL || 'http://localhost:8000/';
const LIBS = process.env.CHEMSIM_LIBS;

let failures = 0, passes = 0;
function check(cond, label, extra = '') {
  if (cond) { passes++; console.log('  ✔', label); }
  else { failures++; console.log('  ✘', label, extra); }
}
function eq(actual, expected, label) {
  // deep comparison, so arrays and objects can be checked too
  check(actual === expected || JSON.stringify(actual) === JSON.stringify(expected), label, `\n      expected: ${JSON.stringify(expected)}\n      actual:   ${JSON.stringify(actual)}`);
}
function near(actual, expected, tol, label) {
  check(Math.abs(actual - expected) <= tol, label, `(expected ${expected} ± ${tol}, got ${actual})`);
}

async function launch() {
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const context = await browser.newContext({ viewport: { width: 1500, height: 900 }, acceptDownloads: true });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text());
  });
  if (LIBS) {
    await page.route(/unpkg\.com|cdn\.jsdelivr\.net/, (route) => {
      const u = route.request().url();
      const file = u.includes('RDKit_minimal.wasm') ? 'rdkit/RDKit_minimal.wasm'
        : u.includes('RDKit_minimal.js') ? 'rdkit/RDKit_minimal.js'
        : u.includes('3Dmol') ? '3dmol/3Dmol-min.js' : null;
      if (!file) return route.abort();
      return route.fulfill({ path: path.join(LIBS, file), contentType: file.endsWith('.wasm') ? 'application/wasm' : 'application/javascript' });
    });
  }
  // Don't depend on PubChem or Google Fonts in tests.
  await page.route(/pubchem\.ncbi\.nlm\.nih\.gov|fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  return { browser, context, page, errors };
}

async function openApp(page, hash = '') {
  await page.goto(BASE + hash);
}

async function waitForRDKit(page) {
  await page.waitForFunction(() => document.getElementById('lib-status').classList.contains('ready'), null, { timeout: 90000 });
}

function summary() {
  console.log(`\n${passes} passed, ${failures} failed`);
  return failures;
}

module.exports = { launch, openApp, waitForRDKit, check, eq, near, summary, BASE };
