/* ============================================================================
   ChemSim · bulk/hub.js
   ----------------------------------------------------------------------------
   Bulk & phase science: extra pages inside the Beaker Lab tab, reached from
   the strip at the top of the tab (#beaker/phase, #beaker/particles,
   #beaker/mixing, #beaker/trends, #beaker/polymer). The plain #beaker
   address is the original beaker sandbox.

   Each page registers itself:
     BulkHub.add({ id, icon, title, mount(el), unmount() })
   ============================================================================ */
'use strict';

const BulkHub = (() => {
  const pages = [];
  let current = null, stage = null;

  function add(def) { pages.push(def); }

  /** The navigation strip shown above every Beaker Lab page. */
  function navHTML() {
    return `<nav class="bulk-nav" aria-label="Beaker Lab pages">
      <a href="#beaker" data-bulk="">⚗️ Beaker sandbox</a>
      ${pages.map((p) => `<a href="#beaker/${p.id}" data-bulk="${p.id}">${p.icon} ${p.title}</a>`).join('')}
    </nav>`;
  }

  const fromHash = () => { const m = location.hash.match(/^#beaker\/([\w-]+)/); return m ? m[1] : ''; };

  /** Show the page for the current address; returns true if a bulk page is showing. */
  function show(root) {
    const id = fromHash();
    root.querySelectorAll('[data-bulk]').forEach((a) => a.classList.toggle('active', a.dataset.bulk === id));
    stage = root.querySelector('#bulk-stage');
    const page = pages.find((p) => p.id === id);
    if (current && current !== page) { try { current.unmount && current.unmount(); } catch (e) { logError('bulk', e); } current = null; }
    root.querySelector('#beaker-sandbox').classList.toggle('hidden', !!page);
    stage.classList.toggle('hidden', !page);
    if (!page) return false;
    if (current !== page) {
      stage.innerHTML = '';
      stage.className = 'bulk-stage bulk-' + page.id;
      current = page;
      try { page.mount(stage); } catch (e) { logError('bulk', `${page.id} failed`, e); toast('This page hit an error; see the console.', true); }
      document.title = `ChemSim · ${page.title}`;
      log('bulk', `Opened ${page.id}`);
    }
    return true;
  }

  function hide() { if (current) { try { current.unmount && current.unmount(); } catch (e) { logError('bulk', e); } current = null; } }

  return { add, navHTML, show, hide, get pages() { return pages; }, get current() { return current; } };
})();
