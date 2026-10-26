/* ============================================================================
   ChemSim · core/router.js
   ----------------------------------------------------------------------------
   Switches between the modes (tabs) along the top of the page.

   Each mode registers itself:
       ChemRouter.register('wiki', { title, init, show, hide })
     init() runs the FIRST time the tab is opened (so modes you never open
     never load anything), show()/hide() run every time you switch.

   The open tab is kept in the address bar (#studio, #wiki, …) so refreshing
   the page or pressing Back keeps you where you were. A mode that has not
   been built yet shows a "coming soon" page describing what it will contain.
   ============================================================================ */
'use strict';

const ChemRouter = (() => {
  const modes = {};          // id → { title, init, show, hide, started }
  let active = null;

  // What each unbuilt mode will contain (shown until that phase is done).
  const COMING_SOON = {
    beaker: {
      icon: '⚗️', title: 'Beaker Lab', phase: 'Phase 2',
      items: ['Drag salts, acids, bases and metals into a beaker of solvent', 'Dissolving, precipitates that settle, coloured ions',
        'Bunsen burner / ice bath with a live thermometer', 'Gas bubbles and a spark test (H₂ pops, O₂ relights a splint)',
        'Litmus, phenolphthalein, methyl orange and universal indicator', 'Flame test station and safety warnings'],
    },
    wiki: {
      icon: '📖', title: 'Element Wiki', phase: 'Phase 1',
      items: ['Interactive periodic table of all 118 elements', 'Trend heatmaps: electronegativity, radius, ionization energy…',
        'Full element pages: history, extraction, properties', 'Crystal structures, emission spectra and flame colours', 'Common reactions'],
    },
    labs: {
      icon: '🔬', title: 'Guided Labs', phase: 'Phase 3',
      items: ['Titration with a burette and live pH curve', 'Qualitative salt analysis game', 'Galvanic cells with the Nernst equation', 'Calorimetry and ΔH'],
    },
  };

  function register(id, def) {
    modes[id] = { ...def, started: false };
    log('router', `Mode registered: ${id}`);
  }

  function renderComingSoon(id) {
    const view = document.getElementById('view-' + id);
    const info = COMING_SOON[id];
    if (!view || !info || view.dataset.placeholder) return;
    view.dataset.placeholder = '1';
    view.innerHTML = `
      <div class="coming-soon">
        <div class="cs-icon">${info.icon}</div>
        <h2>${info.title}</h2>
        <p class="cs-phase">Coming in ${info.phase} · see ROADMAP.md</p>
        <ul>${info.items.map((t) => `<li>${t}</li>`).join('')}</ul>
      </div>`;
  }

  /** "#wiki/Na" → "wiki" (the part after the slash is for the mode itself). */
  const modeFromHash = () => location.hash.slice(1).split('/')[0] || 'studio';

  function show(id) {
    if (!document.getElementById('view-' + id)) id = 'studio';
    if (id === active) {
      // same tab, but the sub-path may have changed (e.g. #wiki/Na → #wiki/Cu)
      const m = modes[id];
      if (m && m.started && m.show) m.show();
      return;
    }
    log('router', `Switching to mode "${id}"`);
    if (active && modes[active] && modes[active].hide) {
      try { modes[active].hide(); } catch (e) { logError('router', `hide() of ${active} failed`, e); }
    }
    document.querySelectorAll('.view').forEach((v) => v.classList.toggle('hidden', v.dataset.mode !== id));
    document.querySelectorAll('.mode-tab').forEach((t) => t.classList.toggle('active', t.dataset.mode === id));
    active = id;
    const m = modes[id];
    if (!m) { renderComingSoon(id); }
    else {
      try {
        if (!m.started) { m.started = true; if (m.init) m.init(); }
        if (m.show) m.show();
      } catch (e) {
        logError('router', `Mode "${id}" failed to start`, e);
        toast(`The ${m.title || id} mode hit an error; see the console.`, true);
      }
    }
    document.title = `ChemSim · ${(m && m.title) || (COMING_SOON[id] && COMING_SOON[id].title) || id}`;
    if (modeFromHash() !== id) history.replaceState(null, '', '#' + id);
  }

  function start() {
    document.querySelectorAll('.mode-tab').forEach((t) => t.addEventListener('click', () => {
      history.pushState(null, '', '#' + t.dataset.mode);
      show(t.dataset.mode);
    }));
    window.addEventListener('popstate', () => show(modeFromHash()));
    window.addEventListener('hashchange', () => show(modeFromHash()));
    show(modeFromHash());
  }

  return { register, show, start, isActive: (id) => active === id, get active() { return active; } };
})();
