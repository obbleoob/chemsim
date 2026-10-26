# ChemSim Molecule Lab

An interactive chemistry learning simulator that runs in your browser. It is plain HTML, CSS and JavaScript with no build step.

## How to run it

The page has to be served by a small web server. Browsers block WebAssembly (RDKit) on pages opened by double-clicking `index.html`.

```bash
cd path/to/this/folder
python3 -m http.server 8000
```

Then open <http://localhost:8000>. Press `Ctrl+C` in the terminal to stop the server.

An internet connection is needed the first time, because RDKit.js and 3Dmol.js come from a CDN. IUPAC names and "Find by name" use PubChem.

## Files

| Path | What it contains |
|------|------------------|
| `index.html` | Page layout: mode tabs, and each mode's view |
| `style.css`  | Dark theme and layout |
| `js/core/`   | Shared helpers: logging, tooltips/toasts, library loading, saving (IndexedDB), tab switching |
| `js/studio/` | Molecule Studio: editor, chemistry engine, RDKit bridge, drawing, 3D, export |
| `js/wiki/`   | Element Wiki: periodic table & heatmaps, element pages, spectra, crystal cells, reaction animations |
| `js/beaker/` | Beaker Lab: reagent data, equilibrium solver (pH, complexes, Ksp), reaction/heat simulation, canvas renderer |
| `js/labs/`   | Guided Labs: hub and lab reports, plotting, titration, qualitative analysis, electrochemistry, calorimetry |
| `css/`       | Extra stylesheets per mode |
| `data/`      | Element data (`elements.json`, built by `tools/build_elements.py`), wiki articles (`data/wiki/`), and `SOURCES.md` |
| `tools/`     | Scripts that rebuild the data files |
| `tests/`     | Automated browser tests (`node tests/run.js`) |
| `ROADMAP.md` | The plan for the other modes |

Your current drawing is saved automatically in the browser. Use **My data ▾** in the header to download or restore everything as a `.json` file.

## Modes

| Tab | Status |
|---|---|
| 🧪 Molecule Studio | ✅ drawing, valence checker, charges, 3D |
| 📖 Element Wiki | ✅ all 118 elements, trend heatmaps, spectra, crystals, reactions |
| ⚗️ Beaker Lab | ✅ ~70 reagents, pH/equilibrium engine, precipitates, heat, gases, tests, indicators |
| 🔬 Guided Labs | ✅ titration, qualitative analysis game, galvanic cells & electrolysis, calorimetry, with lab reports |
| 🏆 Challenge Arena | Phase 6 |

Links like `http://localhost:8000/#wiki/Na` open an element page directly.

## Debugging

Open the browser console (F12). Every message starts with `[ChemSim:area]`. Type `ChemSim.state` to inspect the current molecule or `ChemSim.toMolblock()` to see what is sent to RDKit.

## Where the numbers come from

* **Formula, mass, implicit H, lone pairs, formal charge, octet check, oxidation numbers, hybridisation/VSEPR**: computed in `js/studio/engine.js` with textbook rules.
* **Partial charges**: Gasteiger–Marsili method (electronegativity equalisation).
* **SMILES, InChI, exact mass, R/S and E/Z labels, logP, TPSA, and other descriptors**: RDKit.js.
* **IUPAC name**: looked up on PubChem. RDKit cannot generate IUPAC names.
* **3D geometry**: a small built-in force field (RDKit.js has no 3D embedding). It keeps bond lengths, VSEPR angles and wedge/dash stereochemistry.
* **ESP surface**: a van der Waals or molecular surface coloured by Gasteiger charges. It is an approximation, not a quantum-chemical electron density.

## Running the tests

```bash
npm install -g playwright && npx playwright install chromium   # once
python3 -m http.server 8000 &                                  # serve the app
node tests/run.js                                              # all tests
node tests/run.js studio                                       # just one file
```
