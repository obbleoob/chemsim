/* ============================================================================
   ChemSim · labs/hub.js
   ----------------------------------------------------------------------------
   The Guided Labs mode: a home page listing the labs, sub-routes for each lab
   (#labs/titration, #labs/qual, #labs/galvanic, #labs/calorimetry) and the
   lab-report window shared by all of them.

   Each lab file registers itself:
     LabsHub.add({
       id, icon, title, blurb, topics: [...],
       mount(el)    build the lab inside el (runs every time it is opened)
       unmount()    stop timers / animation
       report()     return a report object, or null if there is not enough data yet
     })

   A report object:
     { title, subtitle, sections: [ { h: 'Results', html: '…' } ], score: 0–100 (optional) }
   Reports are saved in the browser (My data ▸ Export includes them) and can
   be downloaded as a stand-alone HTML file or printed.
   ============================================================================ */
'use strict';

const LabsHub = (() => {
  const labs = [];
  let root = null, current = null;

  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function add(def) { labs.push(def); log('labs', `Lab registered: ${def.id}`); }

  /* ---------------- layout ---------------- */
  function build() {
    root = document.getElementById('view-labs');
    root.innerHTML = `
      <div class="labs-home" id="labs-home"></div>
      <div class="lab-stage hidden" id="lab-stage">
        <div class="lab-head">
          <button class="hbtn small" id="lab-back" data-tip="Back to the list of labs">← Labs</button>
          <h2 id="lab-title"></h2>
          <span class="lab-spacer"></span>
          <button class="hbtn small accent" id="lab-report-btn" data-tip="Write up your results: data, graphs, calculations and feedback">📝 Lab report</button>
        </div>
        <div class="lab-body" id="lab-body"></div>
      </div>
      <div class="report-overlay hidden" id="report-overlay" role="dialog" aria-label="Lab report">
        <div class="report-bar">
          <b>Lab report</b><span class="lab-spacer"></span>
          <button class="hbtn small" id="rep-download" data-tip="Save the report as a web page you can open, print or hand in">⬇ Download .html</button>
          <button class="hbtn small" id="rep-print">🖨 Print</button>
          <button class="hbtn small" id="rep-close">✕ Close</button>
        </div>
        <div class="report-scroll"><article class="report-doc" id="report-doc"></article></div>
      </div>`;
    root.querySelector('#lab-back').addEventListener('click', () => { location.hash = '#labs'; });
    root.querySelector('#lab-report-btn').addEventListener('click', makeReport);
    root.querySelector('#rep-close').addEventListener('click', closeReport);
    root.querySelector('#rep-print').addEventListener('click', () => window.print());
    root.querySelector('#rep-download').addEventListener('click', downloadReport);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !root.querySelector('#report-overlay').classList.contains('hidden')) closeReport(); });
    renderHome();
  }

  async function renderHome() {
    const home = root.querySelector('#labs-home');
    home.innerHTML = `
      <div class="labs-intro">
        <h1>🔬 Guided Labs</h1>
        <p class="dim">Step-by-step experiments built on the Beaker Lab’s chemistry engine. Collect your data, then press <b>📝 Lab report</b> for a write-up with graphs, calculations and feedback.</p>
      </div>
      <div class="lab-cards">${labs.map((l) => `
        <a class="lab-card" href="#labs/${l.id}">
          <div class="lc-icon">${l.icon}</div>
          <div><h3>${esc(l.title)}</h3><p>${esc(l.blurb)}</p>
          <div class="lc-topics">${l.topics.map((t) => `<span>${esc(t)}</span>`).join('')}</div></div>
        </a>`).join('')}
      </div>
      <div class="card saved-reports"><h2>Saved reports</h2><div id="saved-list" class="small dim">Loading…</div></div>`;
    let items = [];
    try { items = (await ChemStore.getAll('labs')).filter((x) => x.value && x.value.kind === 'report'); }
    catch (e) { warn('labs', 'Could not read saved reports', e); }
    const box = home.querySelector('#saved-list');
    if (!box) return;
    if (!items.length) { box.textContent = 'No reports yet. They are saved here automatically when you write one.'; return; }
    items.sort((a, b) => (b.value.createdAt || '').localeCompare(a.value.createdAt || ''));
    box.classList.remove('dim');
    box.innerHTML = items.map(({ key, value }) => `
      <div class="saved-row" data-key="${esc(key)}">
        <span>${labs.find((l) => l.id === value.lab)?.icon || '📄'} <b>${esc(value.title)}</b> <span class="dim">${esc(value.subtitle || '')}</span></span>
        <span class="dim">${new Date(value.createdAt).toLocaleString()}</span>
        ${value.score !== undefined ? `<span class="score-pill">${value.score}%</span>` : '<span></span>'}
        <button class="mini" data-open>Open</button><button class="mini" data-del data-tip="Delete this report">🗑</button>
      </div>`).join('');
    box.querySelectorAll('.saved-row').forEach((row) => {
      const it = items.find((x) => String(x.key) === row.dataset.key);
      row.querySelector('[data-open]').addEventListener('click', () => showReport(it.value));
      row.querySelector('[data-del]').addEventListener('click', async () => {
        await ChemStore.remove('labs', it.key);
        toast('Report deleted');
        renderHome();
      });
    });
  }

  /* ---------------- routing ---------------- */
  const labFromHash = () => { const m = location.hash.match(/^#labs\/([\w-]+)/); return m ? m[1] : null; };

  function show() {
    const id = labFromHash();
    const lab = labs.find((l) => l.id === id);
    if (current && current !== lab) { try { current.unmount && current.unmount(); } catch (e) { logError('labs', e); } current = null; }
    const home = root.querySelector('#labs-home'), stage = root.querySelector('#lab-stage');
    if (!lab) {
      home.classList.remove('hidden'); stage.classList.add('hidden');
      renderHome();
      document.title = 'ChemSim · Guided Labs';
      return;
    }
    if (current === lab) return;
    home.classList.add('hidden'); stage.classList.remove('hidden');
    root.querySelector('#lab-title').textContent = `${lab.icon} ${lab.title}`;
    const body = root.querySelector('#lab-body');
    body.innerHTML = '';
    body.className = 'lab-body lab-' + lab.id;
    current = lab;
    try { lab.mount(body); } catch (e) { logError('labs', `Lab ${lab.id} failed to start`, e); toast('This lab hit an error; see the console.', true); }
    document.title = `ChemSim · ${lab.title}`;
    log('labs', `Opened lab ${lab.id}`);
  }

  function hide() {
    if (current) { try { current.unmount && current.unmount(); } catch (e) { logError('labs', e); } current = null; }
  }

  /* ---------------- reports ---------------- */
  let shown = null;

  async function makeReport() {
    if (!current) return;
    let rep;
    try { rep = current.report(); } catch (e) { logError('labs', 'Report failed', e); toast('Could not build the report; see the console.', true); return; }
    if (!rep) return;           // the lab has already explained what is missing
    rep = { kind: 'report', lab: current.id, createdAt: new Date().toISOString(), ...rep };
    showReport(rep);
    try { await ChemStore.put('labs', `report-${current.id}-${Date.now()}`, rep); toast('Report saved in My data'); }
    catch (e) { warn('labs', 'Could not save the report', e); }
  }

  function reportHTML(rep) {
    return `
      <header><div class="rep-kicker">ChemSim lab report</div><h1>${esc(rep.title)}</h1>
        <div class="rep-meta">${esc(rep.subtitle || '')}${rep.subtitle ? ' · ' : ''}${new Date(rep.createdAt).toLocaleString()}
        ${rep.score !== undefined ? ` · <b>Score ${rep.score}%</b>` : ''}</div></header>
      ${rep.sections.map((s) => `<section><h2>${esc(s.h)}</h2>${s.html}</section>`).join('')}
      <footer>Simulated experiment. The chemistry model is described in the app’s documentation (ideal solutions, standard data at 25 °C).</footer>`;
  }

  function showReport(rep) {
    shown = rep;
    root.querySelector('#report-doc').innerHTML = reportHTML(rep);
    root.querySelector('#report-overlay').classList.remove('hidden');
    document.body.classList.add('printing-report');
  }
  function closeReport() {
    root.querySelector('#report-overlay').classList.add('hidden');
    document.body.classList.remove('printing-report');
  }

  function downloadReport() {
    if (!shown) return;
    const css = `body{font-family:Inter,system-ui,sans-serif;max-width:820px;margin:30px auto;padding:0 20px;color:#111827;line-height:1.5}
      h1{margin:4px 0}h2{border-bottom:2px solid #e5e7eb;padding-bottom:4px;margin-top:28px;font-size:18px}
      .rep-kicker{color:#0e7490;font-weight:700;text-transform:uppercase;letter-spacing:1px;font-size:12px}.rep-meta{color:#6b7280}
      table{border-collapse:collapse;margin:8px 0}td,th{border:1px solid #d1d5db;padding:4px 8px;text-align:left}th{background:#f3f4f6}
      img{max-width:100%;border:1px solid #e5e7eb}.ok{color:#047857}.bad{color:#b91c1c}.calc{font-family:ui-monospace,monospace;background:#f9fafb;padding:8px;border-radius:6px;white-space:pre-wrap}
      footer{margin-top:30px;color:#9ca3af;font-size:12px}`;
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(shown.title)}</title><style>${css}</style></head><body>${reportHTML(shown)}</body></html>`;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
    a.download = `${shown.lab}-report-${shown.createdAt.slice(0, 10)}.html`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  /* ---------------- helpers for the labs' report sections ---------------- */
  const table = (head, rows) => `<table><thead><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  const verdict = (ok, text) => `<div class="${ok ? 'ok' : 'bad'}">${ok ? '✔' : '✘'} ${text}</div>`;
  const calc = (lines) => `<div class="calc">${lines.map(esc).join('\n')}</div>`;
  const img = (src, alt) => `<img src="${src}" alt="${esc(alt)}" />`;
  /** Percent error and a short qualitative judgement. */
  const pctErr = (got, want) => (want ? (Math.abs(got - want) / Math.abs(want)) * 100 : 0);

  ChemRouter.register('labs', { title: 'Guided Labs', init: build, show, hide });

  return { add, esc, table, verdict, calc, img, pctErr, get labs() { return labs; }, get current() { return current; } };
})();
