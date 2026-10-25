# ChemSim Roadmap

This is the plan for growing ChemSim from one molecule editor into a multi-mode chemistry app. Each phase ends with something you can use and test. You pick which phase to start on.

**Rough size:** about 8 phases. Phase 0 is small. Phases 1, 2 and 4 are large. The element wiki alone is ~118 pages of fact-checked writing.

---

## Ground rules (apply to every phase)

- **Still no build tools.** Plain HTML/CSS/JS. Each mode becomes its own file loaded with a normal `<script>` tag, so you can still just run `python -m http.server 8000`.
- **Honest science.** Anything that is an estimate or a simplified model gets labelled as such in the app, like the 3D view does today.
- **Every phase is tested** with an automated browser script (kept in `tests/`) before I hand it to you.
- **Everything gets committed and pushed** at the end of each phase so you can `git pull` it.

---

## Phase 0: Foundation ✅ done

The app is currently one 2,600-line `app.js`. Before adding four more modes it needs splitting up.

1. **Tabs across the top:** Molecule Studio · Beaker Lab · Element Wiki · Guided Labs · Challenge Arena. Only the open tab's code runs. The URL remembers the tab (`#wiki`, `#beaker`…), so refresh and the back button work.
2. **New file layout:**
   ```
   index.html, style.css
   js/core/       shared helpers: logging, tooltips, toasts, library loading, saving
   js/studio/     today's editor, split by section (editor, chemistry engine, RDKit, render, 3D, export)
   js/wiki/  js/beaker/  js/labs/  js/arena/
   data/          element data, compound database, reactions, quiz questions
   tests/         automated browser tests
   ```
3. **Saved work:** molecules, lab results and quiz scores are saved in the browser (IndexedDB), with export/import as a file so nothing is lost if you clear the browser.
4. **Shared chemistry data:** one element table used by every mode, replacing the small table in today's `app.js`.

**Done when:** the Molecule Studio works exactly as today, inside the new tab layout, and its existing tests still pass.

---

## Phase 1: Element Wiki (Mode 3) ✅ done

### Periodic table
- All 118 elements in standard layout with the lanthanide and actinide rows. Colours by category (alkali metal, halogen, noble gas…).
- **Trend heatmaps:** switch the colours to electronegativity, atomic radius, first ionization energy, electron affinity, density, or melting point. A legend shows the scale, and arrows show the direction of each trend across periods and down groups. A slider animates "walk along period 3" to show the trend.
- Search box and filters (state at room temperature, block s/p/d/f, natural vs synthetic).

### Element pages (all 118, full depth, as you chose)
A full-screen page per element with these sections:

| Section | Contents |
|---|---|
| Overview | Name origin, category, appearance photo-style illustration, key uses |
| Discovery & history | Who, when, where, how; historical context |
| Abundance & extraction | Crust/ocean/universe abundance, main minerals, industrial production route (e.g. Hall–Héroult for Al, Haber feedstock for N) |
| Atomic properties | Electron configuration (full and noble-gas form, orbital-box diagram), successive ionization energies (bar chart showing the jumps), atomic/ionic/covalent radii, electronegativity, electron affinity, oxidation states |
| Physical properties | Melting/boiling points, density, crystal structure with a rotating 3D unit cell (bcc, fcc, hcp, diamond, etc.) |
| Spectra | Emission line spectrum drawn from real wavelengths, plus flame-test colour where one exists (Na yellow, Cu green, Sr crimson, K lilac…) |
| Common reactions | Animated reaction cards (e.g. Li/Na/K + water, with violence scaling down the group) |
| Isotopes | Stable isotopes with abundance; half-lives for radioactive ones |
| Safety | Hazards and handling |

For superheavy elements (roughly Rf onward) the honest answer is often "only a few atoms ever made". Those pages will cover the discovery story, how they were made, and *predicted* properties clearly labelled as predictions.

### Data sources and fact-checking
- Numbers come from mendeleev (MIT) and Periodic-Table-JSON (CC BY-SA), merged by `tools/build_elements.py` and spot-checked against CRC/NIST values in `tests/wiki.test.js`. Details are in `data/SOURCES.md`.
- Emission lines come from the NIST Atomic Spectra Database (94 elements have visible lines).
- The history, production, chemistry and safety articles for all 118 elements (~27 000 words, 350 reactions) were written for ChemSim. They are drafts: please report anything that looks wrong.

**Done when:** every element opens a page, the heatmaps match the reference data, and every flame colour and spectrum matches its reference.

---

## Phase 2: Beaker Lab (Mode 2)

A sandbox where you drag chemicals into a beaker and watch what happens. The visuals sit on top of a real (simplified) chemistry engine, so the results are actual predictions rather than canned animations.

### Chemistry engine (shared with Phase 3)
- **Compound database** (~150 common lab chemicals): formula, state, colour, solubility vs temperature, Ksp, pKa/pKb, ΔH of solution, hazards.
- **Solution solver:** tracks moles of each ion, computes pH by solving the acid–base equilibria, and checks each Ksp to decide what precipitates.
- **Reaction rules:** neutralization, precipitation, metal + acid → H₂, carbonate + acid → CO₂, single displacement by the activity series, decomposition of H₂O₂ with catalyst → O₂.
- **Heat:** ΔH of each reaction raises or lowers the temperature, using the solution's heat capacity.

### What you see
- Particles dissolve into the liquid. Precipitates form as a cloudy suspension that settles. Coloured ions tint the solution (Cu²⁺ blue, MnO₄⁻ purple…).
- **Burner / ice bath slider** with a live thermometer. Heating changes solubility (watch KNO₃ crystals dissolve and come back on cooling).
- **Gas evolution:** bubbles rise and gas collects in the headspace. **Spark tool:** H₂ pops, O₂ relights a glowing splint, CO₂ puts the flame out.
- **Indicators:** litmus paper, phenolphthalein, methyl orange, universal indicator, each showing the colour for the computed pH.
- **Flame test station:** dip a wire into a salt and see its flame colour (reuses Phase 1 data).
- **Safety warnings** when you mix incompatible things (e.g. bleach + acid → Cl₂), explained, not just blocked.

**Done when:** a set of reference experiments (e.g. 0.1 M HCl + 0.1 M NaOH reaches the right pH and temperature rise; AgNO₃ + NaCl gives a white precipitate) all give the textbook result.

---

## Phase 3: Guided Labs (Mode 4 labs)

Step-by-step experiments with a lab-report summary at the end. All of them use the Phase 2 engine.

1. **Titration:** burette with a stopcock you can open slowly or drip one drop at a time, swirling flask, indicator colour change, and a live pH curve. Covers strong/weak acid and base combinations, equivalence and half-equivalence points, and pKa from the curve.
2. **Qualitative salt analysis:** an "unknown" salt is given. Add reagents (AgNO₃, BaCl₂, NaOH, NH₃, flame test…), observe precipitates and colours, and identify the cation and anion. Scored as a game.
3. **Galvanic cells:** choose two metals and solutions, connect the salt bridge and voltmeter, and watch electrons flow. The voltage comes from standard reduction potentials and the Nernst equation, so changing concentration changes the reading. Daniell cell preset. Electrolysis mode as an extra.
4. **Calorimetry:** coffee-cup calorimeter, temperature–time graph, and calculation of ΔH for dissolution (NH₄NO₃, NaOH) and neutralization, with the error analysis a lab report needs.

**Done when:** each lab's numbers match hand calculations in the tests.

---

## Phase 4: Molecular Studio upgrades (Mode 1)

Two things listed as "what you already have" actually aren't in the app yet: **NMR/IR prediction** and **electron-pushing arrows**. They're included here.

### 4a. Drawing and views
- **Curved electron-pushing arrows** (full and half arrows) on the canvas.
- **Projections:** Newman (pick a bond, rotate it), Fischer (from stereocentres, with R/S checking), chair conformations (axial/equatorial, ring flip), Haworth for sugars.
- **Conformational energy scan:** rotate a bond 360° and plot energy. Uses a simple torsion model, labelled as approximate.

### 4b. Prediction tools
- **IR:** predicted absorption bands from functional groups (C=O ~1715, O–H broad ~3300…), shown as a spectrum.
- **¹H NMR:** predicted shifts and splitting from additive tables, approximate and labelled.
- **Hückel molecular orbitals** for π systems (ethene, butadiene, benzene, allyl): energy diagram plus HOMO/LUMO drawn on the atoms. Full 3D MOs of any molecule need real quantum chemistry and won't run in a browser well, so I'm proposing Hückel as the honest version.
- **Drug-likeness:** Lipinski, Veber, Ghose, an estimate of blood–brain-barrier permeability, and PAINS alerts. Most of this uses RDKit descriptors the app already gets.

### 4c. Synthesis and preparation
- **"How it's made" tab:** recognise functional groups in the drawn molecule (RDKit substructure search) and show standard routes. Examples: alkene ← dehydration of an alcohol, Lindlar hydrogenation, E2 of alkyl halides; ester ← Fischer esterification or acid chloride + alcohol. Each route lists reagents, catalyst, temperature, solvent (with why: protic vs polar aprotic) and mechanism type. Starts with ~25 functional groups and ~80 routes.
- **Selectivity sandbox:** alkene + reagent shows Markovnikov vs anti-Markovnikov and syn vs anti products (HBr vs HBr/peroxide, hydroboration, bromination, OsO₄…).
- **Retrosynthesis explorer:** apply known disconnections backwards to the target to suggest simpler starting materials, as a tree you can expand. Rule-based, about 1–3 steps deep. It's a learning aid, not a research-grade planner.
- **Stoichiometry & yield calculator:** enter masses or moles. It finds the limiting reagent and gives theoretical and percent yield.
- **Green metrics:** atom economy, E-factor, reaction mass efficiency.

### 4d. Library, files and presentation
- **Molecule library:** save, tag and organise into folders.
- **Reaction notebook:** a timeline of reaction steps with branching.
- **File formats:** import/export .mol, .sdf, SMILES and InChI (RDKit handles these). .pdb and .cif import read into the 3D viewer; .cif only for small-molecule crystals.
- **Presentation mode:** a clean figure view for reports and posters, with SVG export (sharp at any size) alongside PNG.
- **Safety and storage tags:** GHS hazard pictograms and storage classes for compounds in the database.

**Done when:** each tool is checked against known textbook examples in the tests.

---

## Phase 5: Bulk & Phase Science (also in the Beaker Lab)

- **Phase diagrams:** interactive diagrams for water, CO₂ and others. Drag a point to see melting, boiling, sublimation, the triple point and the critical point, with a particle view that changes to match.
- **Particle box:** hundreds to thousands of particles with simple attractions, showing gas/liquid/solid and how concentration and molarity look at particle scale.
- **Diffusion and mixing:** dye spreading; oil/water layers vs ethanol/water mixing (miscibility).
- **Property trend dashboard:** charts of boiling point, density, viscosity and surface tension across a series (alkanes C1–C20, alcohols, carboxylic acids), showing how chain length and functional groups change them. Uses tabulated real data.
- **Polymer builder:** link monomers into chains, watch a chain coil in a simple bead-spring simulation, and see the radius of gyration and flexibility change.

---

## Phase 6: Challenge Arena (Mode 4)

- **Question types:** reaction prediction, mechanism arrows (using Phase 4's arrow tool), IUPAC naming both ways including R/S and E/Z, stoichiometry, equilibrium, electrochemistry, and element trivia from the wiki.
- **Exam mode:** USNCO-style timed sets with the 60-question local-exam format, no aids, and a review at the end.
- **Practice mode:** hints and explanations after each question, and tracking of weak topics so they come up more often.
- **Question bank:** I write original questions in the USNCO style. I won't copy real past exam questions (copyright). Many numeric questions are generated, so there's an endless supply.

---

## Suggested order

0 → 1 → 2 → 3 → 4 → 5 → 6

Phase 0 is required first. After that the order is flexible, except that **Phase 3 needs Phase 2's engine**, and the Arena's mechanism questions need Phase 4a's arrows. If you'd rather practise for USNCO sooner, Phase 6 can move earlier and launch with the question types that don't depend on later phases.

## Things to decide before starting

- Which phase to do after Phase 0.
- Whether the app needs to work **offline** (e.g. in class with no Wi-Fi). If so, I'll bundle the libraries and data into the folder instead of loading them from the internet.
