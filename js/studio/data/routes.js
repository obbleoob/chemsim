/* ============================================================================
   ChemSim · studio/data/routes.js
   ----------------------------------------------------------------------------
   "How it's made": standard laboratory preparations of functional groups.
   Each group has a SMARTS pattern (to find it in the drawn molecule) and a
   list of routes:
     from       what you start with
     reagents   reagents and catalyst
     cond       temperature / conditions
     solvent    solvent and WHY that solvent (protic vs polar aprotic …)
     mech       mechanism type
     notes      regio-/stereochemistry, pitfalls, uses
     retro      id of the retrosynthesis rule (synthesis.js) that builds the
                actual starting material for your molecule, if there is one
   Sources: standard undergraduate textbooks (Clayden; McMurry; Vollhardt).
   ============================================================================ */
'use strict';

const ROUTES = [
  { id: 'alkane', name: 'Alkane (C–C single bonds)', smarts: '[CX4]-[CX4]', routes: [
    { name: 'Catalytic hydrogenation', from: 'alkene or alkyne', reagents: 'H₂, Pd/C (or Pt, Ni)', cond: 'room temperature, 1–4 bar', solvent: 'ethanol or ethyl acetate: dissolve H₂ well and do not react', mech: 'surface catalysis, syn addition', notes: 'Both H atoms add to the same face (syn). Alkynes go all the way to alkanes unless a poisoned catalyst is used.', retro: 'hydrogenate' },
    { name: 'Wolff–Kishner reduction', from: 'aldehyde or ketone', reagents: 'H₂NNH₂ (hydrazine), KOH', cond: '≈ 200 °C', solvent: 'ethylene glycol: very high boiling point', mech: 'hydrazone formation, then base-promoted loss of N₂', notes: 'Removes a C=O completely (C=O → CH₂). Use under basic conditions; Clemmensen (Zn(Hg), conc. HCl) is the acidic alternative.' },
    { name: 'Corey–House coupling', from: 'alkyl halide + lithium dialkylcuprate', reagents: 'R₂CuLi', cond: '−78 °C → rt', solvent: 'diethyl ether or THF (dry): organometallics are destroyed by water and alcohols', mech: 'organocuprate coupling', notes: 'Joins two carbon fragments; works best with primary halides.' },
  ] },
  { id: 'alkene', name: 'Alkene (C=C)', smarts: '[CX3;!a]=[CX3;!a]', routes: [
    { name: 'E2 elimination of an alkyl halide', from: 'alkyl halide', reagents: 'NaOEt (gives the more substituted, Zaitsev alkene) or KOtBu (bulky: less substituted, Hofmann alkene)', cond: 'heat', solvent: 'ethanol for NaOEt; tert-butanol for KOtBu (each base in its own alcohol)', mech: 'E2: one step, needs H and leaving group anti-periplanar', notes: 'Strong, hindered bases and heat favour elimination over substitution.', retro: 'eliminate_hx' },
    { name: 'Acid-catalysed dehydration', from: 'alcohol', reagents: 'conc. H₂SO₄ or H₃PO₄ (catalyst)', cond: '140–180 °C, distil the alkene off', solvent: 'none (neat); removing the alkene by distillation drives the equilibrium', mech: 'E1 via a carbocation (secondary/tertiary alcohols)', notes: 'Zaitsev product; the carbocation can rearrange. Tertiary alcohols react most easily.', retro: 'dehydrate' },
    { name: 'Wittig reaction', from: 'aldehyde or ketone + phosphonium ylide', reagents: 'Ph₃P=CHR (from Ph₃P + RCH₂Br, then BuLi)', cond: '−78 °C → rt', solvent: 'THF (dry, polar aprotic): the ylide is a strong base', mech: 'nucleophilic addition, oxaphosphetane, elimination of Ph₃P=O', notes: 'The C=C forms exactly where the C=O was. Unstabilised ylides give mainly Z alkenes.', retro: 'wittig' },
    { name: 'Lindlar hydrogenation', from: 'alkyne', reagents: 'H₂, Lindlar catalyst (Pd/CaCO₃ poisoned with Pb and quinoline)', cond: 'rt, 1 bar', solvent: 'hexane or ethanol', mech: 'syn addition on a poisoned catalyst', notes: 'Stops at the alkene and gives the cis (Z) isomer.', retro: 'lindlar' },
    { name: 'Dissolving-metal reduction', from: 'alkyne', reagents: 'Na or Li', cond: '−33 °C', solvent: 'liquid ammonia: dissolves the metal to give solvated electrons', mech: 'radical anion → vinyl radical → vinyl anion', notes: 'Gives the trans (E) alkene.' },
    { name: 'Heck reaction', from: 'aryl/vinyl halide + alkene', reagents: 'Pd(OAc)₂, PPh₃, Et₃N', cond: '80–120 °C', solvent: 'DMF or acetonitrile (polar aprotic, high boiling)', mech: 'Pd(0)/Pd(II) cycle: oxidative addition, insertion, β-hydride elimination', notes: 'Nobel Prize 2010. Usually gives the E alkene.' },
  ] },
  { id: 'alkyne', name: 'Alkyne (C≡C)', smarts: '[CX2]#[CX2]', routes: [
    { name: 'Double elimination', from: 'vicinal or geminal dihalide', reagents: 'NaNH₂ (3 equiv. for terminal alkynes)', cond: '−33 °C', solvent: 'liquid ammonia', mech: 'two E2 eliminations', notes: 'Make the dihalide from an alkene + Br₂ first.' },
    { name: 'Alkylation of a terminal alkyne', from: 'terminal alkyne + primary alkyl halide', reagents: 'NaNH₂ (or n-BuLi), then R–X', cond: '−78 °C → rt', solvent: 'liquid NH₃ or THF', mech: 'acetylide anion attacks by SN2', notes: 'Makes a new C–C bond. Secondary/tertiary halides eliminate instead (the acetylide is a strong base).', retro: 'alkyne_alkylation' },
    { name: 'Sonogashira coupling', from: 'aryl iodide/bromide + terminal alkyne', reagents: 'Pd(PPh₃)₂Cl₂, CuI, Et₃N', cond: 'rt–60 °C', solvent: 'THF or Et₃N', mech: 'Pd/Cu catalytic cycles', notes: 'Joins an sp carbon to an sp² carbon.' },
  ] },
  { id: 'alcohol', name: 'Alcohol (C–OH)', smarts: '[CX4][OX2H]', routes: [
    { name: 'Reduction of an aldehyde or ketone', from: 'aldehyde (→ primary) or ketone (→ secondary alcohol)', reagents: 'NaBH₄ (mild) or LiAlH₄ (strong)', cond: '0 °C → rt; then aqueous work-up', solvent: 'NaBH₄: methanol or ethanol (protic is fine, it reacts only slowly). LiAlH₄: dry ether/THF (it reacts violently with any O–H)', mech: 'nucleophilic addition of hydride (H⁻) to C=O', notes: 'A new stereocentre is formed as a racemate unless a chiral reagent is used.', retro: 'reduce_carbonyl' },
    { name: 'Grignard addition', from: 'aldehyde/ketone + alkyl halide (via RMgBr)', reagents: 'Mg, then R–MgBr; then H₃O⁺', cond: 'reflux to make RMgBr; 0 °C for the addition', solvent: 'dry diethyl ether or THF: the ether O stabilises Mg; water destroys Grignards', mech: 'nucleophilic addition of a carbanion equivalent to C=O', notes: 'Makes a C–C bond. Formaldehyde → 1°, other aldehydes → 2°, ketones → 3° alcohols.', retro: 'grignard' },
    { name: 'Acid-catalysed hydration', from: 'alkene', reagents: 'H₂O, H₂SO₄ (or H₃PO₄, industrially)', cond: 'heat (industry: 300 °C, 60 atm for ethanol)', solvent: 'water', mech: 'electrophilic addition via a carbocation', notes: 'Markovnikov: OH ends up on the more substituted carbon. Rearrangements possible.', retro: 'hydrate' },
    { name: 'Hydroboration–oxidation', from: 'alkene', reagents: '1. BH₃·THF  2. H₂O₂, NaOH', cond: '0 °C → rt', solvent: 'THF: complexes and stabilises BH₃', mech: 'concerted syn addition of H–B, then oxidation with retention', notes: 'Anti-Markovnikov: OH on the LESS substituted carbon; H and OH add to the same face (syn).', retro: 'hydroborate' },
    { name: 'Oxymercuration–demercuration', from: 'alkene', reagents: '1. Hg(OAc)₂, H₂O  2. NaBH₄', cond: 'rt', solvent: 'THF/water', mech: 'mercurinium ion (no free carbocation)', notes: 'Markovnikov without rearrangements.' },
    { name: 'Reduction of an ester or acid', from: 'ester or carboxylic acid', reagents: 'LiAlH₄, then H₃O⁺', cond: '0 °C → reflux', solvent: 'dry THF or ether (LiAlH₄ + water → H₂ and fire)', mech: 'nucleophilic acyl substitution then addition (two hydrides)', notes: 'Gives a primary alcohol. NaBH₄ is too weak for esters.', retro: 'reduce_ester' },
    { name: 'Hydrolysis of an alkyl halide', from: 'primary alkyl halide', reagents: 'NaOH(aq)', cond: 'reflux', solvent: 'water/ethanol mixture (dissolves both the halide and the hydroxide)', mech: 'SN2 (primary) or SN1 (tertiary)', notes: 'Competes with elimination at higher temperatures and with hindered halides.', retro: 'hydrolyse_halide' },
    { name: 'Fermentation (ethanol)', from: 'glucose', reagents: 'yeast (zymase enzymes)', cond: '30–40 °C, no air', solvent: 'water', mech: 'enzymatic', notes: 'C₆H₁₂O₆ → 2C₂H₅OH + 2CO₂. Stops at about 15 % ethanol; distil to concentrate.' },
  ] },
  { id: 'diol', name: '1,2-Diol', smarts: '[CX4]([OX2H])[CX4][OX2H]', routes: [
    { name: 'Dihydroxylation with OsO₄', from: 'alkene', reagents: 'OsO₄ (catalytic), NMO', cond: 'rt', solvent: 'acetone/water', mech: 'concerted [3+2] cyclic osmate ester', notes: 'Syn: both OH on the same face. Cold, dilute, basic KMnO₄ does the same, more cheaply but less cleanly.', retro: 'dihydroxylate' },
    { name: 'Epoxide opening', from: 'epoxide', reagents: 'H₃O⁺ (or OH⁻)', cond: 'rt', solvent: 'water', mech: 'SN2-like backside attack on the epoxide', notes: 'Anti: the two OH groups end up trans.' },
  ] },
  { id: 'ether', name: 'Ether (C–O–C)', smarts: '[OD2]([#6;!$(C=O)])[#6;!$(C=O)]', routes: [
    { name: 'Williamson ether synthesis', from: 'alcohol (as alkoxide) + primary alkyl halide', reagents: 'NaH (to make RO⁻), then R′–X', cond: '0 °C → 60 °C', solvent: 'DMF or THF: polar aprotic solvents do not hydrogen-bond to the alkoxide, so it stays a strong nucleophile for SN2', mech: 'SN2', notes: 'Put the bulky part on the alkoxide and use a primary halide, or E2 wins.', retro: 'williamson' },
    { name: 'Acid-catalysed condensation', from: 'two primary alcohols', reagents: 'conc. H₂SO₄', cond: '140 °C (at 180 °C you get the alkene instead)', solvent: 'none', mech: 'SN2 on a protonated alcohol', notes: 'Only for symmetrical ethers such as diethyl ether.' },
  ] },
  { id: 'epoxide', name: 'Epoxide (oxirane)', smarts: 'C1OC1', routes: [
    { name: 'Epoxidation with a peroxy acid', from: 'alkene', reagents: 'mCPBA (meta-chloroperbenzoic acid)', cond: '0 °C → rt', solvent: 'CH₂Cl₂ (aprotic, so the epoxide is not opened)', mech: 'concerted "butterfly" O transfer', notes: 'Stereospecific: a cis alkene gives a cis epoxide.', retro: 'epoxidise' },
    { name: 'From a halohydrin', from: 'halohydrin (from alkene + Br₂/H₂O)', reagents: 'NaOH', cond: 'rt', solvent: 'water/ethanol', mech: 'intramolecular SN2', notes: 'The O⁻ must be anti to the Br.' },
  ] },
  { id: 'aldehyde', name: 'Aldehyde (CHO)', smarts: '[CX3H1](=O)[#6]', routes: [
    { name: 'PCC oxidation', from: 'primary alcohol', reagents: 'PCC (pyridinium chlorochromate)', cond: 'rt', solvent: 'dry CH₂Cl₂: without water the aldehyde cannot form a hydrate, so it is not oxidised further', mech: 'chromate ester, then E2-like elimination', notes: 'Swern (DMSO, (COCl)₂, Et₃N, −78 °C) and Dess–Martin are chromium-free alternatives.', retro: 'oxidise_to_aldehyde' },
    { name: 'Oxidation with distillation (school lab)', from: 'primary alcohol', reagents: 'K₂Cr₂O₇ / dilute H₂SO₄ (orange → green)', cond: 'warm; distil the aldehyde off as it forms', solvent: 'water', mech: 'chromate ester oxidation', notes: 'If you reflux instead of distilling, you get the carboxylic acid.' },
    { name: 'DIBAL-H reduction of an ester', from: 'ester', reagents: 'DIBAL-H (1 equiv.)', cond: '−78 °C', solvent: 'toluene or CH₂Cl₂', mech: 'hydride addition; the tetrahedral intermediate is stable at −78 °C', notes: 'Stops at the aldehyde only when kept cold.' },
    { name: 'Ozonolysis', from: 'alkene', reagents: '1. O₃  2. Me₂S (or Zn/acetic acid)', cond: '−78 °C', solvent: 'CH₂Cl₂ or methanol', mech: '[3+2] cycloadditions via an ozonide', notes: 'Cuts the C=C: each alkene carbon becomes C=O.' },
  ] },
  { id: 'ketone', name: 'Ketone (C–CO–C)', smarts: '[#6][CX3](=O)[#6]', routes: [
    { name: 'Oxidation of a secondary alcohol', from: 'secondary alcohol', reagents: 'Na₂Cr₂O₇/H₂SO₄ (Jones), PCC, or Swern', cond: 'rt (Jones: acetone, 0 °C)', solvent: 'acetone (Jones) or CH₂Cl₂ (PCC)', mech: 'chromate ester oxidation', notes: 'Ketones cannot be oxidised further without breaking C–C bonds.', retro: 'oxidise_2alcohol' },
    { name: 'Friedel–Crafts acylation', from: 'arene + acyl chloride', reagents: 'RCOCl, AlCl₃ (> 1 equiv.)', cond: '0 °C → rt', solvent: 'CH₂Cl₂ or CS₂ (do not react with AlCl₃)', mech: 'electrophilic aromatic substitution by an acylium ion', notes: 'No rearrangement and no poly-acylation (the product is deactivated). Fails on strongly deactivated rings.', retro: 'friedel_acyl' },
    { name: 'Hydration of an alkyne', from: 'alkyne', reagents: 'H₂O, H₂SO₄, HgSO₄', cond: 'warm', solvent: 'water', mech: 'Markovnikov addition → enol → keto tautomer', notes: 'A terminal alkyne gives a methyl ketone.' },
    { name: 'Grignard + nitrile', from: 'nitrile + Grignard', reagents: 'R–MgBr, then H₃O⁺', cond: 'reflux, then hydrolysis', solvent: 'dry ether', mech: 'nucleophilic addition to C≡N → imine → ketone', notes: 'Only one R adds (the imine anion does not react again).' },
  ] },
  { id: 'acid', name: 'Carboxylic acid (COOH)', smarts: '[CX3](=O)[OX2H1]', routes: [
    { name: 'Oxidation of a primary alcohol', from: 'primary alcohol or aldehyde', reagents: 'K₂Cr₂O₇ / H₂SO₄ or KMnO₄ (excess)', cond: 'reflux', solvent: 'water (the aldehyde forms a hydrate that is oxidised again)', mech: 'chromate/manganate oxidation', notes: 'Reflux keeps the volatile aldehyde in the flask until it is fully oxidised.', retro: 'oxidise_to_acid' },
    { name: 'Hydrolysis of a nitrile', from: 'nitrile', reagents: 'H₃O⁺ (or NaOH, then acid)', cond: 'reflux', solvent: 'water', mech: 'nucleophilic addition to C≡N → amide → acid', notes: 'With R–X + CN⁻ first, this adds one carbon to the chain.', retro: 'nitrile_hydrolysis' },
    { name: 'Carboxylation of a Grignard', from: 'alkyl/aryl halide', reagents: '1. Mg  2. CO₂ (dry ice)  3. H₃O⁺', cond: '−78 °C (dry ice)', solvent: 'dry ether', mech: 'nucleophilic addition to CO₂', notes: 'Also adds one carbon.', retro: 'grignard_co2' },
    { name: 'Saponification of an ester', from: 'ester', reagents: 'NaOH(aq), then HCl', cond: 'reflux', solvent: 'water/ethanol', mech: 'nucleophilic acyl substitution (irreversible because the carboxylate forms)', notes: 'How soap is made from fats.' },
    { name: 'Side-chain oxidation', from: 'alkylbenzene', reagents: 'KMnO₄, heat', cond: 'reflux', solvent: 'water', mech: 'benzylic radical oxidation', notes: 'Any alkyl chain with a benzylic H becomes –COOH (toluene → benzoic acid).' },
  ] },
  { id: 'ester', name: 'Ester (COOR)', smarts: '[#6][CX3](=O)[OX2][#6]', routes: [
    { name: 'Fischer esterification', from: 'carboxylic acid + alcohol', reagents: 'conc. H₂SO₄ (catalyst)', cond: 'reflux', solvent: 'excess of the alcohol (cheap reagent as solvent pushes the equilibrium)', mech: 'acid-catalysed nucleophilic acyl substitution (addition–elimination)', notes: 'An equilibrium (K ≈ 4): remove water (Dean–Stark trap) or use excess alcohol.', retro: 'ester_fischer' },
    { name: 'Acyl chloride + alcohol', from: 'acyl chloride + alcohol', reagents: 'pyridine or Et₃N (scavenges HCl)', cond: '0 °C → rt', solvent: 'CH₂Cl₂ (aprotic; water would hydrolyse the acyl chloride)', mech: 'nucleophilic acyl substitution', notes: 'Fast and irreversible.', retro: 'ester_acyl' },
    { name: 'Acid anhydride + alcohol', from: 'anhydride + alcohol/phenol', reagents: 'H₂SO₄ or H₃PO₄ (catalyst)', cond: 'warm', solvent: 'none', mech: 'nucleophilic acyl substitution', notes: 'Aspirin: salicylic acid + ethanoic anhydride. Safer than acyl chlorides.', retro: 'ester_anhydride' },
    { name: 'Baeyer–Villiger oxidation', from: 'ketone', reagents: 'mCPBA', cond: 'rt', solvent: 'CH₂Cl₂', mech: 'Criegee intermediate, migration with retention', notes: 'The more substituted group migrates to O.' },
  ] },
  { id: 'amide', name: 'Amide (CONR₂)', smarts: '[CX3](=O)[NX3]', routes: [
    { name: 'Acyl chloride + amine', from: 'acyl chloride + amine (or NH₃)', reagents: '2 equiv. amine (or 1 equiv. + Et₃N)', cond: '0 °C', solvent: 'CH₂Cl₂ or water (Schotten–Baumann, with NaOH)', mech: 'nucleophilic acyl substitution', notes: 'The second equivalent of amine neutralises the HCl formed.', retro: 'amide_acyl' },
    { name: 'Coupling reagents (peptide synthesis)', from: 'carboxylic acid + amine', reagents: 'DCC or EDC (+ HOBt)', cond: 'rt', solvent: 'DMF or CH₂Cl₂', mech: 'activated O-acylisourea ester, then aminolysis', notes: 'Avoids harsh conditions; how peptides are made in the lab.' },
    { name: 'Beckmann rearrangement', from: 'ketoxime', reagents: 'H₂SO₄ or PCl₅', cond: 'heat', solvent: 'none', mech: 'migration anti to the leaving group', notes: 'Industrially: cyclohexanone oxime → caprolactam → nylon-6.' },
  ] },
  { id: 'acylchloride', name: 'Acyl chloride (COCl)', smarts: '[CX3](=O)Cl', routes: [
    { name: 'Thionyl chloride', from: 'carboxylic acid', reagents: 'SOCl₂ (+ a drop of DMF)', cond: 'reflux', solvent: 'none, or toluene', mech: 'chlorosulfite intermediate, nucleophilic acyl substitution', notes: 'The by-products SO₂ and HCl are gases and leave, which makes purification easy.', retro: 'acyl_chloride' },
    { name: 'Oxalyl chloride or PCl₅', from: 'carboxylic acid', reagents: '(COCl)₂ / cat. DMF, or PCl₅', cond: 'rt', solvent: 'CH₂Cl₂', mech: 'Vilsmeier-type activation', notes: 'Milder than SOCl₂.' },
  ] },
  { id: 'anhydride', name: 'Acid anhydride', smarts: '[CX3](=O)O[CX3](=O)', routes: [
    { name: 'Acyl chloride + carboxylate', from: 'acyl chloride + sodium carboxylate', reagents: 'RCOO⁻Na⁺', cond: 'rt', solvent: 'ether or CH₂Cl₂', mech: 'nucleophilic acyl substitution', notes: 'Can make mixed anhydrides.' },
    { name: 'Dehydration', from: 'two carboxylic acids', reagents: 'P₄O₁₀ or heat (cyclic anhydrides)', cond: 'heat', solvent: 'none', mech: 'condensation', notes: 'Phthalic and maleic anhydrides form on heating.' },
  ] },
  { id: 'nitrile', name: 'Nitrile (C≡N)', smarts: '[CX2]#[NX1]', routes: [
    { name: 'SN2 with cyanide', from: 'primary/secondary alkyl halide', reagents: 'NaCN or KCN', cond: 'reflux', solvent: 'DMSO (polar aprotic: CN⁻ is not solvated, so SN2 is fast) or ethanol (school lab)', mech: 'SN2 (inversion of configuration)', notes: 'Adds one carbon to the chain. Cyanide is highly toxic.', retro: 'cyanide' },
    { name: 'Dehydration of a primary amide', from: 'primary amide', reagents: 'P₄O₁₀ or SOCl₂', cond: 'heat', solvent: 'none', mech: 'dehydration', notes: '' },
    { name: 'Cyanohydrin formation', from: 'aldehyde or ketone', reagents: 'HCN with KCN (catalyst)', cond: '10–20 °C, pH ≈ 9', solvent: 'water', mech: 'nucleophilic addition of CN⁻ to C=O', notes: 'Gives a racemic product from an aldehyde.' },
    { name: 'Sandmeyer reaction (aryl nitriles)', from: 'aryl diazonium salt', reagents: 'CuCN', cond: '0–5 °C then warm', solvent: 'water', mech: 'radical, copper-mediated', notes: '' },
  ] },
  { id: 'amine', name: 'Amine (C–N)', smarts: '[NX3;!$(NC=O);!$(N=*);!$([N+])][#6]', routes: [
    { name: 'Reduction of a nitrile', from: 'nitrile', reagents: 'LiAlH₄ then H₂O, or H₂/Ni', cond: 'reflux (LiAlH₄); high pressure (H₂/Ni)', solvent: 'dry ether (LiAlH₄)', mech: 'two hydride additions', notes: 'R–C≡N → R–CH₂NH₂ (a primary amine with one extra carbon).', retro: 'reduce_nitrile' },
    { name: 'Reductive amination', from: 'aldehyde/ketone + amine', reagents: 'NaBH₃CN (or NaBH(OAc)₃)', cond: 'rt, pH ≈ 6', solvent: 'methanol', mech: 'imine/iminium formation, then hydride reduction', notes: 'The best way to make secondary and tertiary amines cleanly (no over-alkylation).', retro: 'reductive_amination' },
    { name: 'Reduction of a nitroarene', from: 'nitrobenzene derivative', reagents: 'Sn or Fe with conc. HCl, then NaOH; or H₂, Pd/C', cond: 'reflux', solvent: 'water/ethanol', mech: 'stepwise electron transfer reduction', notes: 'How aniline is made: benzene → nitrobenzene → aniline.', retro: 'reduce_nitro' },
    { name: 'Gabriel synthesis', from: 'primary alkyl halide', reagents: 'potassium phthalimide; then N₂H₄', cond: 'heat', solvent: 'DMF (polar aprotic, SN2)', mech: 'SN2, then hydrazinolysis', notes: 'Gives only primary amines.' },
    { name: 'Ammonia + haloalkane', from: 'alkyl halide', reagents: 'excess NH₃', cond: 'heat in a sealed tube', solvent: 'ethanol', mech: 'SN2', notes: 'Gives mixtures (1°, 2°, 3° amines and quaternary salts) because the product is a better nucleophile.' },
    { name: 'Reduction of an amide', from: 'amide', reagents: 'LiAlH₄, then H₂O', cond: 'reflux', solvent: 'dry THF', mech: 'hydride addition, loss of O as aluminate', notes: 'C=O → CH₂; keeps the N substituents.' },
  ] },
  { id: 'halide', name: 'Alkyl halide (C–X)', smarts: '[CX4][Cl,Br,I]', routes: [
    { name: 'From an alcohol with PBr₃ or SOCl₂', from: 'primary or secondary alcohol', reagents: 'PBr₃ (→ R–Br) or SOCl₂/pyridine (→ R–Cl)', cond: '0 °C → reflux', solvent: 'ether or CH₂Cl₂, or neat', mech: 'activation of OH as a good leaving group, then SN2 (inversion)', notes: 'No carbocation, so no rearrangement.', retro: 'alcohol_to_halide' },
    { name: 'From an alcohol with HX', from: 'alcohol', reagents: 'conc. HBr or HCl/ZnCl₂ (Lucas reagent)', cond: 'reflux (1°), rt (3°)', solvent: 'water', mech: 'SN1 for tertiary, SN2 for primary', notes: 'Tertiary alcohols react fastest (Lucas test).' },
    { name: 'Hydrohalogenation of an alkene', from: 'alkene', reagents: 'HBr or HCl', cond: 'rt', solvent: 'CH₂Cl₂ or acetic acid', mech: 'electrophilic addition via the more stable carbocation', notes: 'Markovnikov. With HBr and peroxides the radical mechanism gives the anti-Markovnikov bromide.', retro: 'hydrohalogenate' },
    { name: 'Free-radical halogenation', from: 'alkane', reagents: 'Br₂ or Cl₂, UV light (or NBS for allylic/benzylic C–H)', cond: 'rt, light', solvent: 'CCl₄ or none', mech: 'radical chain: initiation, propagation, termination', notes: 'Bromination is selective for the most substituted C–H; chlorination gives mixtures.' },
  ] },
  { id: 'dihalide', name: 'Vicinal dihalide', smarts: '[CX4]([Cl,Br,I])[CX4][Cl,Br,I]', routes: [
    { name: 'Halogen addition', from: 'alkene', reagents: 'Br₂ (or Cl₂)', cond: 'rt, dark', solvent: 'CH₂Cl₂ (inert; in water you get the halohydrin instead)', mech: 'electrophilic addition via a cyclic bromonium ion', notes: 'Anti addition. The test for C=C: bromine water is decolourised.', retro: 'halogenate' },
  ] },
  { id: 'arylhalide', name: 'Aryl halide (Ar–X)', smarts: 'c[F,Cl,Br,I]', routes: [
    { name: 'Electrophilic halogenation', from: 'arene', reagents: 'Br₂ with FeBr₃ (or Cl₂/AlCl₃)', cond: 'rt', solvent: 'none or CH₂Cl₂', mech: 'electrophilic aromatic substitution', notes: 'Activating groups (OH, NH₂) react without a catalyst and can poly-brominate.', retro: 'aryl_halogenation' },
    { name: 'Sandmeyer reaction', from: 'aniline (via diazonium)', reagents: '1. NaNO₂, HCl, 0–5 °C  2. CuCl or CuBr (KI for iodides)', cond: '0–5 °C, then warm', solvent: 'water', mech: 'diazotisation, then radical substitution', notes: 'Puts a halogen where the NH₂ was, regardless of directing effects.' },
  ] },
  { id: 'nitro', name: 'Nitroarene (Ar–NO₂)', smarts: 'c[N+](=O)[O-]', routes: [
    { name: 'Nitration', from: 'arene', reagents: 'conc. HNO₃ + conc. H₂SO₄ ("nitrating mixture")', cond: '< 55 °C (higher temperatures give dinitration)', solvent: 'the acid mixture itself', mech: 'electrophilic aromatic substitution by NO₂⁺ (nitronium ion)', notes: 'H₂SO₄ protonates HNO₃ to make NO₂⁺. Methyl groups direct ortho/para; NO₂ directs meta.', retro: 'nitration' },
  ] },
  { id: 'arene', name: 'Substituted benzene', smarts: 'c[CX4]', routes: [
    { name: 'Friedel–Crafts alkylation', from: 'arene + alkyl halide', reagents: 'R–Cl, AlCl₃', cond: 'rt', solvent: 'excess arene or CS₂', mech: 'electrophilic aromatic substitution by a carbocation', notes: 'Problems: carbocations rearrange, and the product is more reactive than the start (polyalkylation). Acylation then reduction avoids both.', retro: 'friedel_alkyl' },
  ] },
  { id: 'biaryl', name: 'Biaryl (Ar–Ar)', smarts: 'c-c', routes: [
    { name: 'Suzuki coupling', from: 'aryl halide + arylboronic acid', reagents: 'Pd(PPh₃)₄, K₂CO₃ (base)', cond: '80 °C', solvent: 'toluene/water or dioxane/water (the base and boronate need water)', mech: 'Pd(0): oxidative addition, transmetallation, reductive elimination', notes: 'Nobel Prize 2010; one of the most used C–C bond-forming reactions in drug synthesis.', retro: 'suzuki' },
  ] },
  { id: 'phenol', name: 'Phenol (Ar–OH)', smarts: 'c[OX2H]', routes: [
    { name: 'From a diazonium salt', from: 'aniline', reagents: '1. NaNO₂, H₂SO₄, 0–5 °C  2. warm H₂O', cond: '0–5 °C then 50 °C', solvent: 'water', mech: 'SN1 via an aryl cation (loss of N₂)', notes: '' },
    { name: 'Cumene process (industry)', from: 'benzene + propene', reagents: 'H₃PO₄ catalyst; O₂; H₂SO₄', cond: '250 °C, then air oxidation', solvent: 'none', mech: 'Friedel–Crafts, radical hydroperoxide, Hock rearrangement', notes: 'Makes phenol and acetone together.' },
  ] },
  { id: 'imine', name: 'Imine (C=N)', smarts: '[CX3]=[NX2][#6,#1]', routes: [
    { name: 'Condensation with a primary amine', from: 'aldehyde/ketone + primary amine', reagents: 'a little acid (pH ≈ 4–5)', cond: 'rt, remove water (molecular sieves or Dean–Stark)', solvent: 'toluene or methanol', mech: 'nucleophilic addition, then dehydration of the carbinolamine', notes: 'Too much acid protonates the amine and stops the reaction.' },
  ] },
  { id: 'acetal', name: 'Acetal (C(OR)₂)', smarts: '[CX4]([OX2][#6])[OX2][#6]', routes: [
    { name: 'Acetal formation', from: 'aldehyde/ketone + 2 ROH (or a diol)', reagents: 'acid catalyst (TsOH)', cond: 'reflux with a Dean–Stark trap', solvent: 'toluene (forms an azeotrope with water)', mech: 'acid-catalysed addition, oxocarbenium ion, second addition', notes: 'A protecting group for C=O: stable to bases, Grignards and hydrides; removed by aqueous acid.' },
  ] },
  { id: 'azo', name: 'Azo compound (Ar–N=N–Ar)', smarts: 'cN=Nc', routes: [
    { name: 'Azo coupling', from: 'diazonium salt + phenol or aniline', reagents: 'ArN₂⁺ Cl⁻; NaOH (for phenols)', cond: '0–5 °C (diazonium salts decompose when warm)', solvent: 'water', mech: 'electrophilic aromatic substitution by the diazonium ion', notes: 'Makes azo dyes (orange, red, yellow), including methyl orange.' },
  ] },
  { id: 'sulfonic', name: 'Sulfonic acid (Ar–SO₃H)', smarts: 'c[SX4](=O)(=O)[OX2H]', routes: [
    { name: 'Sulfonation', from: 'arene', reagents: 'fuming H₂SO₄ (SO₃)', cond: 'warm', solvent: 'the acid', mech: 'EAS by SO₃', notes: 'Reversible: heating in dilute acid removes the SO₃H (useful as a blocking group).' },
  ] },
];
