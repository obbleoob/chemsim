/* ============================================================================
   ChemSim · core/ui.js
   ----------------------------------------------------------------------------
   Shared UI helpers: $(), data-tip tooltips, toast messages.
   ============================================================================ */
'use strict';

const $ = (id) => document.getElementById(id);

// ---- (b) generic UI tooltips ----
const uiTip = document.getElementById('ui-tooltip');
document.addEventListener('mouseover', (e) => {
  const el = e.target.closest && e.target.closest('[data-tip]');
  if (!el) { uiTip.classList.add('hidden'); return; }
  uiTip.textContent = el.dataset.tip;
  uiTip.classList.remove('hidden');
  const r = el.getBoundingClientRect();
  const tw = uiTip.offsetWidth, th = uiTip.offsetHeight;
  let x = r.left + r.width / 2 - tw / 2;
  let y = r.bottom + 8;
  if (y + th > window.innerHeight - 6) y = r.top - th - 8;
  x = Math.max(6, Math.min(window.innerWidth - tw - 6, x));
  uiTip.style.left = x + 'px';
  uiTip.style.top = y + 'px';
});
document.addEventListener('mousedown', () => uiTip.classList.add('hidden'));

let toastTimer = null;
function toast(msg, isError = false) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast' + (isError ? ' error' : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), isError ? 5000 : 2600);
  (isError ? warn : log)('toast', msg);
}
