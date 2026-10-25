/* ============================================================================
   ChemSim · core/storage.js
   ----------------------------------------------------------------------------
   Saves your work in the browser with IndexedDB (a small database every
   browser has built in). Each mode keeps its data in its own "store":

     autosave  – the drawing you were working on, restored after a refresh
     molecules – saved molecule library            (Phase 4)
     labs      – lab results and reports           (Phase 3)
     quiz      – Challenge Arena scores            (Phase 6)
     settings  – small preferences

   Browser storage can be wiped (private windows, "clear site data"), so
   "My data ▸ Export" downloads everything as one .json file you can import
   again later or on another computer.

   Usage:  await ChemStore.put('molecules', id, value)
           await ChemStore.get('molecules', id)
           await ChemStore.getAll('molecules')      → [{key, value}, …]
           await ChemStore.remove('molecules', id)
   ============================================================================ */
'use strict';

const ChemStore = (() => {
  const DB_NAME = 'chemsim';
  const DB_VERSION = 1;
  const STORES = ['autosave', 'molecules', 'labs', 'quiz', 'settings'];
  let dbPromise = null;

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      if (!window.indexedDB) { reject(new Error('IndexedDB is not available in this browser')); return; }
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        STORES.forEach((name) => { if (!db.objectStoreNames.contains(name)) db.createObjectStore(name); });
        log('storage', 'Created/updated database stores', STORES);
      };
      req.onsuccess = () => { log('storage', 'Database ready'); resolve(req.result); };
      req.onerror = () => reject(req.error);
      req.onblocked = () => warn('storage', 'Database upgrade blocked: close other ChemSim tabs');
    });
    dbPromise.catch((e) => { warn('storage', 'Storage unavailable; work will not be saved', e); dbPromise = null; });
    return dbPromise;
  }

  /** Run one request inside a transaction and resolve with its result. */
  async function run(store, mode, fn) {
    if (!STORES.includes(store)) throw new Error('Unknown store ' + store);
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, mode);
      const req = fn(tx.objectStore(store));
      tx.oncomplete = () => resolve(req && req.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }

  const put = (store, key, value) => run(store, 'readwrite', (s) => s.put(value, key));
  const get = (store, key) => run(store, 'readonly', (s) => s.get(key));
  const remove = (store, key) => run(store, 'readwrite', (s) => s.delete(key));

  async function getAll(store) {
    const [keys, values] = await Promise.all([
      run(store, 'readonly', (s) => s.getAllKeys()),
      run(store, 'readonly', (s) => s.getAll()),
    ]);
    return keys.map((key, i) => ({ key, value: values[i] }));
  }

  /** Everything in every store, as one plain object (for the export file). */
  async function exportAll() {
    const out = { app: 'ChemSim', format: 1, exportedAt: new Date().toISOString(), stores: {} };
    for (const name of STORES) out.stores[name] = await getAll(name);
    return out;
  }

  /** Load an export file back in. Existing items with the same key are replaced. */
  async function importAll(data) {
    if (!data || data.app !== 'ChemSim' || !data.stores) throw new Error('This is not a ChemSim data file');
    let n = 0;
    for (const [name, items] of Object.entries(data.stores)) {
      if (!STORES.includes(name) || !Array.isArray(items)) continue;
      for (const { key, value } of items) { await put(name, key, value); n++; }
    }
    log('storage', `Imported ${n} items`);
    return n;
  }

  return { put, get, remove, getAll, exportAll, importAll, STORES };
})();
