/* ============================================================================
   ChemSim · core/boot.js
   ----------------------------------------------------------------------------
   Loaded last. Wires up the header's "My data" menu and opens the first tab.
   ============================================================================ */
'use strict';

(function boot() {
  const menu = $('data-menu');
  $('btn-data-menu').addEventListener('click', (e) => { e.stopPropagation(); menu.classList.toggle('hidden'); });
  document.addEventListener('click', (e) => { if (!e.target.closest('.data-menu')) menu.classList.add('hidden'); });

  $('btn-data-export').addEventListener('click', async () => {
    menu.classList.add('hidden');
    try {
      const data = await ChemStore.exportAll();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `chemsim-data-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      toast('Your ChemSim data was downloaded ⬇');
    } catch (e) {
      logError('storage', 'Export failed', e);
      toast('Export failed: ' + e.message, true);
    }
  });

  $('btn-data-import').addEventListener('click', () => { menu.classList.add('hidden'); $('data-import-file').click(); });
  $('data-import-file').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const n = await ChemStore.importAll(JSON.parse(await file.text()));
      toast(`Imported ${n} saved items. Reloading…`);
      setTimeout(() => location.reload(), 900);
    } catch (err) {
      logError('storage', 'Import failed', err);
      toast('Import failed: ' + err.message, true);
    }
  });

  ChemRouter.start();
  log('boot', 'ChemSim started.');
})();
