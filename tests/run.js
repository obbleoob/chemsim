/* Runs every *.test.js file in this folder:   node tests/run.js
   Each test file exports  async (h) => {}  where h is the harness. */
'use strict';

const fs = require('fs');
const path = require('path');
const h = require('./harness');

(async () => {
  const only = process.argv[2];
  const files = fs.readdirSync(__dirname).filter((f) => f.endsWith('.test.js') && (!only || f.includes(only))).sort();
  for (const f of files) {
    console.log(`\n=== ${f} ===`);
    try {
      await require(path.join(__dirname, f))(h);
    } catch (e) {
      h.check(false, `${f} crashed`, e.stack);
    }
  }
  process.exit(h.summary() ? 1 : 0);
})();
