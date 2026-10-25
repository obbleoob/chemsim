/* ============================================================================
   ChemSim · wiki/main.js
   ----------------------------------------------------------------------------
   Registers the Element Wiki mode. Its data is only downloaded the first
   time you open the tab. Links like #wiki/Na open an element page directly.
   ============================================================================ */
'use strict';

(function () {
  const view = () => document.getElementById('view-wiki');

  function elementFromHash() {
    const m = location.hash.match(/^#wiki\/([A-Z][a-z]?)$/);
    return m ? m[1] : null;
  }

  async function initWiki() {
    view().innerHTML = '<div class="wiki-loading">⏳ Loading 118 elements…</div>';
    try {
      await WikiData.load();
    } catch (e) {
      logError('wiki', e);
      view().innerHTML = `<div class="coming-soon"><h2>Could not load the element data</h2><p>${e.message}</p><p class="dim">Is the page served by the local web server?</p></div>`;
      return;
    }
    const wrap = document.createElement('div');
    wrap.className = 'wiki-wrap';
    view().innerHTML = '';
    view().appendChild(wrap);
    WikiTable.build(wrap);
    const sym = elementFromHash();
    if (sym) WikiPage.open(sym);
  }

  ChemRouter.register('wiki', {
    title: 'Element Wiki',
    init: initWiki,
    show: () => {
      const sym = elementFromHash();
      if (!WikiData.elements) return;
      if (sym && (!WikiPage.current || WikiPage.current.sym !== sym)) WikiPage.open(sym);
      else if (!sym && WikiPage.current) WikiPage.close();   // Back button from a page
    },
    hide: () => { if (WikiPage.current) WikiPage.close(); },
  });

  // Let other modes link to an element page: ChemWiki.open('Na')
  window.ChemWiki = {
    open: (sym) => { history.pushState(null, '', '#wiki/' + sym); ChemRouter.show('wiki'); if (WikiData.elements) WikiPage.open(sym); },
  };
})();
