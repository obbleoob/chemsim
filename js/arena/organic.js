/* ============================================================================
   ChemSim · arena/organic.js
   ----------------------------------------------------------------------------
   Organic chemistry questions, drawn with RDKit:
     • naming both ways: structure → IUPAC name, and name → structure
     • R/S at stereocentres and E/Z at double bonds. The right answer is not
       typed in by hand: RDKit's CIP labeller works it out from the SMILES,
       so a randomly flipped stereocentre is always marked correctly
     • reaction prediction: “what is the major product?” with drawn choices
     • conceptual questions (isomer counts, acidity, SN1/SN2, aromaticity…)
   ============================================================================ */
'use strict';

(() => {
  const U = ArenaUtil;
  const rdkitReady = () => typeof RDKit !== 'undefined' && !!RDKit;

  /* ---------------- naming families ----------------
     Within a family the structures are similar (isomers, same functional
     group), so the other names make good distractors. `wrong` adds names that
     break a rule (wrong numbering, longest chain missed…). */
  const FAMILIES = [
    { mols: [['CCCCC', 'pentane'], ['CC(C)CC', '2-methylbutane'], ['CC(C)(C)C', '2,2-dimethylpropane']],
      wrong: ['3-methylbutane', '2-ethylpropane', '1,1-dimethylpropane', '2-dimethylpropane'] },
    { mols: [['CCCCCC', 'hexane'], ['CC(C)CCC', '2-methylpentane'], ['CCC(C)CC', '3-methylpentane'], ['CC(C)C(C)C', '2,3-dimethylbutane'], ['CC(C)(C)CC', '2,2-dimethylbutane']],
      wrong: ['4-methylpentane', '2-ethylbutane', '3,3-dimethylbutane', '1,2-dimethylbutane'] },
    { mols: [['CCCCO', 'butan-1-ol'], ['CCC(C)O', 'butan-2-ol'], ['CC(C)CO', '2-methylpropan-1-ol'], ['CC(C)(C)O', '2-methylpropan-2-ol']],
      wrong: ['butan-3-ol', '2-methylpropan-3-ol', '1-methylpropan-1-ol', '1,1-dimethylethanol'] },
    { mols: [['C=CCCC', 'pent-1-ene'], ['C=C(C)CC', '2-methylbut-1-ene'], ['CC=C(C)C', '2-methylbut-2-ene'], ['C=CC(C)C', '3-methylbut-1-ene']],
      wrong: ['pent-4-ene', '3-methylbut-2-ene', '2-methylbut-3-ene', '2-ethylprop-1-ene'] },
    { mols: [['CCCC=O', 'butanal'], ['CCC(C)=O', 'butan-2-one'], ['CC(C)C=O', '2-methylpropanal'], ['CCCC(=O)O', 'butanoic acid'], ['CCOC(C)=O', 'ethyl ethanoate'], ['COC(=O)CC', 'methyl propanoate']],
      wrong: ['butan-1-one', 'butan-3-one', 'ethyl methanoate', 'propyl ethanoate'] },
    { mols: [['Cc1ccccc1', 'methylbenzene'], ['Cc1ccccc1C', '1,2-dimethylbenzene'], ['Cc1cccc(C)c1', '1,3-dimethylbenzene'], ['Cc1ccc(C)cc1', '1,4-dimethylbenzene'], ['CCc1ccccc1', 'ethylbenzene']],
      wrong: ['1,5-dimethylbenzene', '1,6-dimethylbenzene', '2,3-dimethylbenzene', 'dimethylbenzene'] },
    { mols: [['Oc1ccccc1', 'phenol'], ['Nc1ccccc1', 'phenylamine (aniline)'], ['OC(=O)c1ccccc1', 'benzoic acid'], ['O=Cc1ccccc1', 'benzaldehyde'], ['Clc1ccccc1', 'chlorobenzene']],
      wrong: ['cyclohexanol', 'benzylamine', 'phenylmethanoic ester', 'cyclohexanecarboxylic acid'] },
    { mols: [['CCCBr', '1-bromopropane'], ['CC(C)Br', '2-bromopropane'], ['BrCCBr', '1,2-dibromoethane'], ['CC(Br)Br', '1,1-dibromoethane'], ['CC(C)(Cl)Cl', '2,2-dichloropropane'], ['ClC(Cl)Cl', 'trichloromethane']],
      wrong: ['3-bromopropane', '2,2-dibromoethane', '1,1-bromoethane', '2-dichloropropane'] },
    { mols: [['CCN', 'ethanamine'], ['CC(N)=O', 'ethanamide'], ['CC#N', 'ethanenitrile'], ['CCC#N', 'propanenitrile'], ['CNC', 'N-methylmethanamine'], ['CCC(=O)N', 'propanamide']],
      wrong: ['methanenitrile', '1-aminoethanone', 'ethylamide', 'propan-1-nitrile'] },
    { mols: [['C1CCCCC1', 'cyclohexane'], ['CC1CCCCC1', 'methylcyclohexane'], ['C1=CCCCC1', 'cyclohexene'], ['CC1=CCCCC1', '1-methylcyclohexene'], ['CC1CCCC=C1', '3-methylcyclohexene'], ['O=C1CCCCC1', 'cyclohexanone']],
      wrong: ['2-methylcyclohexene', '6-methylcyclohexene', 'cyclohexen-1-one', '1-methylcyclohex-2-ene'] },
    { mols: [['OCCO', 'ethane-1,2-diol'], ['OC(=O)C(=O)O', 'ethanedioic acid'], ['OCC(O)CO', 'propane-1,2,3-triol'], ['CC(O)C(=O)O', '2-hydroxypropanoic acid'], ['OC(=O)CC(=O)O', 'propanedioic acid']],
      wrong: ['ethane-1,1-diol', 'propane-1,2,3-ol', '1-hydroxypropanoic acid', 'ethan-1,2-dioic acid'] },
  ];

  ArenaGen.add({
    id: 'name', topic: 'organic', label: 'IUPAC naming (both ways)', needs: rdkitReady,
    make(r) {
      const fam = r.pick(FAMILIES);
      const [smi, name] = r.pick(fam.mols);
      const others = fam.mols.filter((m) => m[1] !== name);
      if (r() < 0.55) {
        // structure → name
        const pool = [...r.sample(others, 2).map((m) => m[1]), ...fam.wrong];
        const wrong = r.sample(pool, 3);
        const sc = U.shuffleChoices([name, ...wrong], r);
        return {
          stem: 'What is the IUPAC name of this compound?', fig: smi,
          choices: sc.choices, answer: sc.answer,
          explain: `<b>${name}</b>. Find the longest chain (or ring) containing the main functional group, number it so the functional group and then the substituents get the lowest locants, and list substituents alphabetically.`,
          hint: 'Longest chain first, then the lowest locants for the principal group.',
        };
      }
      // name → structure
      if (others.length < 3) return this.make(r);
      const sc = U.shuffleChoices([smi, ...r.sample(others, 3).map((m) => m[0])].map((s) => ({ smi: s })), r);
      return {
        stem: `Which structure is <b>${name}</b>?`,
        choices: sc.choices, answer: sc.answer,
        explain: `The name says: ${name}. ${others.slice(0, 3).map((m) => `${m[1]}`).join(', ')} are the other structures in this family.`,
        hint: 'Draw the parent chain from the name’s stem (meth 1, eth 2, prop 3, but 4, pent 5, hex 6), then add the groups at their numbered positions.',
      };
    },
  });

  /* ---------------- R / S ----------------
     One stereocentre: [smiles, name without the descriptor].
     Two stereocentres: [smiles, name, {atomIndex: locant}]. */
  const ONE = [
    ['C[C@H](O)CC', 'butan-2-ol'], ['C[C@H](Cl)CC', '2-chlorobutane'], ['C[C@H](N)C(=O)O', 'alanine (2-aminopropanoic acid)'],
    ['C[C@@H](O)C(=O)O', 'lactic acid (2-hydroxypropanoic acid)'], ['C[C@H](Br)c1ccccc1', '(1-bromoethyl)benzene'], ['CC[C@H](C)C=O', '2-methylbutanal'],
    ['C[C@@H](O)C=C', 'but-3-en-2-ol'], ['F[C@H](Cl)Br', 'bromochlorofluoromethane'], ['C[C@H](O)C#N', '2-hydroxypropanenitrile'],
    ['CC(C)[C@H](N)C(=O)O', 'valine'], ['N[C@@H](CS)C(=O)O', 'cysteine'], ['C[C@@H]1CCCC1=O', '2-methylcyclopentan-1-one'],
    ['OC[C@@H](O)C=O', 'glyceraldehyde (2,3-dihydroxypropanal)'], ['CC[C@@H](C)Br', '2-bromobutane'], ['C[C@H](O)CCC=C', 'hex-5-en-2-ol'],
  ];
  const ACHIRAL = [['CC(C)O', 'propan-2-ol'], ['CCC(O)CC', 'pentan-3-ol'], ['CC(C)(Cl)CC', '2-chloro-2-methylbutane'], ['OC1CCCCC1', 'cyclohexanol'], ['CC(N)C', 'propan-2-amine']];
  const TWO = [
    ['C[C@@H](O)[C@H](C)Cl', '3-chlorobutan-2-ol', { 1: 2, 3: 3 }], ['C[C@@H](O)[C@H](N)C(=O)O', 'threonine (2-amino-3-hydroxybutanoic acid)', { 3: 2, 1: 3 }],
    ['C[C@H](Br)[C@@H](Br)CC', '2,3-dibromopentane', { 1: 2, 3: 3 }], ['C[C@H](Br)[C@H](C)Cl', '2-bromo-3-chlorobutane', { 1: 2, 3: 3 }],
    ['C[C@H](O)[C@@H](C)CC', '3-methylpentan-2-ol', { 1: 2, 3: 3 }],
  ];
  const flip = (smi, r) => smi.replace(/@@?/g, () => (r() < 0.5 ? '@' : '@@'));
  ArenaGen.add({
    id: 'rs', topic: 'organic', label: 'R/S configuration', needs: rdkitReady,
    make(r) {
      const v = r();
      if (v < 0.3) {
        const [s0, name, loc] = r.pick(TWO);
        const smi = flip(s0, r);
        const tags = U.stereoTags(smi).atoms;
        const idx = Object.keys(loc).map(Number).sort((a, b) => loc[a] - loc[b]);
        const lab = (labs) => '(' + idx.map((i, k) => loc[i] + labs[k]).join(',') + ')';
        const correct = lab(idx.map((i) => tags[i]));
        const all = ['RR', 'RS', 'SR', 'SS'].map((x) => lab(x.split('')));
        const vals = all.slice().sort();
        return {
          stem: `What is the configuration of this stereoisomer of ${name}?`, fig: smi,
          choices: vals, answer: vals.indexOf(correct),
          explain: `<b>${correct}-${name.replace(/ \(.*\)/, '')}</b>. At each stereocentre rank the four groups by CIP priority (higher atomic number first; at a tie, look at the next atoms out). With the lowest priority pointing away (dashed), 1→2→3 clockwise is R, anticlockwise is S. If the lowest group is on a wedge, reverse your answer.`,
          hint: 'Do one stereocentre at a time. If the lowest-priority group is on a wedge (towards you), the direction you see is reversed.',
        };
      }
      const chiral = v < 0.88;
      const [s0, name] = chiral ? r.pick(ONE) : r.pick(ACHIRAL);
      const smi = chiral ? flip(s0, r) : s0;
      const tags = U.stereoTags(smi).atoms;
      const lab = Object.values(tags)[0];
      const opts = ['R', 'S', 'It has no stereocentre', 'It is a meso compound'];
      const correct = chiral ? lab : 'It has no stereocentre';
      return {
        stem: `What is the configuration at the stereocentre of this molecule (${name})?`, fig: smi,
        choices: opts, answer: opts.indexOf(correct),
        explain: chiral ? `<b>${lab}</b>. Rank the four groups by atomic number (CIP rules), view with the lowest priority away from you, and trace 1 → 2 → 3: clockwise = R, anticlockwise = S.`
          : `<b>No stereocentre</b>: every carbon in ${name} has at least two identical groups, so its mirror image is the same molecule.`,
        hint: 'A stereocentre carries four different groups. Then use the CIP priority rules.',
      };
    },
  });

  /* ---------------- E / Z ---------------- */
  const ALKENES = [
    ['C/C=C/CC', 'pent-2-ene'], ['C/C(Cl)=C/C', '2-chlorobut-2-ene'], ['Br/C=C/Cl', '1-bromo-2-chloroethene'], ['C/C(Br)=C(\\C)Cl', '2-bromo-3-chlorobut-2-ene'],
    ['OC(=O)/C=C/C(=O)O', 'butenedioic acid'], ['C/C=C/C=O', 'but-2-enal'], ['CC/C(C)=C/C', '3-methylpent-2-ene'], ['F/C(Cl)=C(/Br)I', '1-bromo-2-chloro-2-fluoro-1-iodoethene'],
    ['OC(=O)/C=C/c1ccccc1', '3-phenylpropenoic acid (cinnamic acid)'], ['C/C=C(/C)CC', '3-methylpent-2-ene'], ['CC/C=C/CO', 'pent-2-en-1-ol'],
  ];
  const NO_EZ = [['C=CCC', 'but-1-ene'], ['CC=C(C)C', '2-methylbut-2-ene'], ['C=C(Cl)Cl', '1,1-dichloroethene'], ['CCC(CC)=CC', '3-ethylpent-2-ene']];
  const flipEZ = (smi, r) => (r() < 0.5 ? smi : smi.replace(/^([^/\\]*)([/\\])/, (_, a, s) => a + (s === '/' ? '\\' : '/')));
  ArenaGen.add({
    id: 'ez', topic: 'organic', label: 'E/Z isomerism', needs: rdkitReady,
    make(r) {
      const has = r() < 0.85;
      const [s0, name] = has ? r.pick(ALKENES) : r.pick(NO_EZ);
      const smi = has ? flipEZ(s0, r) : s0;
      const b = U.stereoTags(smi).bonds;
      const lab = b.length ? b[0][2] : null;
      const opts = ['E', 'Z', 'It has no E/Z isomers', 'E/Z does not apply; only cis/trans can be used'];
      const correct = has ? lab : opts[2];
      return {
        stem: `Is this isomer of ${name} E or Z?`, fig: smi,
        choices: opts, answer: opts.indexOf(correct),
        explain: has ? `<b>${lab}</b>. On each end of the C=C, pick the group with the higher CIP priority (higher atomic number at the first point of difference). Same side = Z (zusammen), opposite sides = E (entgegen). cis/trans only works when each carbon carries one H; E/Z always works.`
          : `<b>No E/Z isomers</b>: one carbon of the double bond carries two identical groups, so swapping them gives the same molecule.`,
        hint: 'Use priorities, not “where the H is”: highest-priority groups on the same side = Z.',
      };
    },
  });

  /* ---------------- reaction prediction (choices are structures) ----------------
     c: [correct, wrong, wrong, wrong] as SMILES (or plain text). */
  const RXN = [
    { id: 'o-rx1', q: 'What is the major product of propene + HBr (no peroxides)?', c: ['CC(C)Br', 'CCCBr', 'CC(Br)CBr', 'C=CCBr'],
      e: 'Markovnikov addition: H⁺ adds to the CH₂ end to give the more stable <b>secondary carbocation</b>, which Br⁻ then attacks: 2-bromopropane.' },
    { id: 'o-rx2', q: 'What is the major product of propene + HBr in the presence of a peroxide (ROOR)?', c: ['CCCBr', 'CC(C)Br', 'CC(Br)CBr', 'CC(C)O'],
      e: 'Peroxides start a <b>radical chain</b>: Br· adds to the CH₂ end to give the more stable secondary radical, so Br ends up on C1: anti-Markovnikov 1-bromopropane.' },
    { id: 'o-rx3', q: 'What forms when 2-methylpropan-2-ol is heated with concentrated H₂SO₄?', c: ['C=C(C)C', 'CC(C)COS(=O)(=O)O', 'CC(C)C', 'CC(C)(C)OC(C)(C)C'],
      e: 'Acid-catalysed <b>dehydration</b> (E1): protonated OH leaves as water, the tertiary carbocation loses H⁺: 2-methylpropene.' },
    { id: 'o-rx4', q: 'What is the major product of but-1-ene + H₂O with an acid catalyst?', c: ['CCC(C)O', 'CCCCO', 'CCC(=O)C', 'CC(O)C(C)O'],
      e: 'Acid-catalysed hydration follows Markovnikov: OH ends up on the more substituted carbon: <b>butan-2-ol</b>.' },
    { id: 'o-rx5', q: 'What is the product of cyclohexene + Br₂ (in CH₂Cl₂, dark)?', c: ['Br[C@@H]1CCCC[C@H]1Br', 'Br[C@@H]1CCCC[C@@H]1Br', 'BrC1CCCC=C1', 'BrC1CCCCC1'],
      e: 'Br₂ forms a bridged <b>bromonium ion</b>; Br⁻ attacks from the opposite face (anti addition), giving <b>trans</b>-1,2-dibromocyclohexane (as a racemate).' },
    { id: 'o-rx6', q: 'What is the organic product of benzene + Br₂ with an FeBr₃ catalyst?', c: ['Brc1ccccc1', 'BrC1C=CC=CC1Br', 'Brc1ccccc1Br', 'BrC1CCCCC1'],
      e: 'Electrophilic aromatic <b>substitution</b> (not addition): FeBr₃ makes Br⁺, the ring attacks it, and loss of H⁺ restores aromaticity. Bromobenzene + HBr.' },
    { id: 'o-rx7', q: 'Toluene is nitrated with HNO₃/H₂SO₄. Which is one of the major products?', c: ['Cc1ccc([N+](=O)[O-])cc1', 'Cc1cccc([N+](=O)[O-])c1', '[O-][N+](=O)Cc1ccccc1', 'OC(=O)c1ccccc1'],
      e: 'CH₃ is an activating <b>ortho/para director</b> (it stabilises the cation formed by attack at those positions): 2- and <b>4-nitrotoluene</b> form, very little 3-.' },
    { id: 'o-rx8', q: 'Ethanol is heated under reflux with excess acidified potassium dichromate. What is the organic product?', c: ['CC(=O)O', 'CC=O', 'C=C', 'CCOCC'],
      e: 'A primary alcohol is oxidised first to the aldehyde and, under reflux with excess oxidant, on to the <b>carboxylic acid</b> (ethanoic acid). Orange Cr₂O₇²⁻ turns green Cr³⁺.' },
    { id: 'o-rx9', q: 'Propan-2-ol is warmed with acidified potassium dichromate. What is the organic product?', c: ['CC(C)=O', 'CCC=O', 'CCC(=O)O', 'C=CC'],
      e: 'A secondary alcohol is oxidised to a <b>ketone</b> (propanone), which resists further oxidation.' },
    { id: 'o-rx10', q: 'What happens when 2-methylpropan-2-ol is warmed with acidified potassium dichromate?', c: ['No reaction (the solution stays orange)', { smi: 'CC(C)C=O' }, { smi: 'CC(=O)C' }, { smi: 'CC(C)C(=O)O' }],
      e: 'A tertiary alcohol has <b>no H on the carbinol carbon</b>, so it cannot be oxidised this way. This is the classic test that tells 1°/2° from 3° alcohols.', text: true },
    { id: 'o-rx11', q: 'Ethanoic acid is warmed with ethanol and a few drops of concentrated H₂SO₄. What is the organic product?', c: ['CCOC(C)=O', 'CC(=O)OC(C)=O', 'CCOCC', 'CCC(=O)O'],
      e: 'Fischer <b>esterification</b>: acid + alcohol ⇌ ester + water: ethyl ethanoate (fruity smell).' },
    { id: 'o-rx12', q: '2-Bromopropane is heated with concentrated KOH in ethanol. What is the main organic product?', c: ['C=CC', 'CC(C)O', 'CC(C)OCC', 'CCC'],
      e: 'A strong base in hot ethanol favours <b>elimination</b> (E2) over substitution: propene. (Aqueous, warm NaOH favours substitution to propan-2-ol.)' },
    { id: 'o-rx13', q: 'Butanal is reduced with NaBH₄, then the mixture is acidified. What is the product?', c: ['CCCCO', 'CCC(C)O', 'CCCC(=O)O', 'CCCC'],
      e: 'Hydride adds to the carbonyl carbon; an aldehyde gives a <b>primary alcohol</b>: butan-1-ol.' },
    { id: 'o-rx14', q: 'Propanone reacts with HCN (with a little KCN). What is the product?', c: ['CC(C)(O)C#N', 'CC(C#N)C=O', 'CC(=O)CC#N', 'CC(C)C#N'],
      e: 'Nucleophilic <b>addition</b>: CN⁻ attacks the carbonyl carbon, then the alkoxide is protonated: 2-hydroxy-2-methylpropanenitrile (a cyanohydrin).' },
    { id: 'o-rx15', q: 'CH₃MgBr is added to propanone, then dilute acid is added. What is the product?', c: ['CC(C)(C)O', 'CC(C)CO', 'CCC(C)=O', 'CC(C)OC'],
      e: 'The Grignard carbon is a nucleophile and adds to the C=O; acid work-up gives a <b>tertiary alcohol</b>: 2-methylpropan-2-ol.' },
    { id: 'o-rx16', q: 'Buta-1,3-diene is heated with ethene. What is the product?', c: ['C1=CCCCC1', 'C=CC=CC=C', 'C1=CC=CC=C1', 'C1CCC1'],
      e: 'A <b>Diels–Alder</b> [4+2] cycloaddition: three π bonds become two new σ bonds and one new π bond: cyclohexene.' },
    { id: 'o-rx17', q: 'But-2-yne is hydrogenated with H₂ over Lindlar’s catalyst. What is the product?', c: ['C/C=C\\C', 'C/C=C/C', 'CCCC', 'C=CCC'],
      e: 'The poisoned catalyst stops at the alkene, and both H atoms add from the metal surface on the same side (syn): <b>cis- or (Z)-but-2-ene</b>.' },
    { id: 'o-rx18', q: 'But-2-yne is reduced with sodium in liquid ammonia. What is the product?', c: ['C/C=C/C', 'C/C=C\\C', 'CCCC', 'CC#CC'],
      e: 'A dissolving-metal reduction goes through a radical anion that prefers the trans geometry: <b>trans- or (E)-but-2-ene</b>.' },
    { id: 'o-rx19', q: '2-Methylbut-2-ene is treated with O₃, then with Zn/H₂O. What are the products?', c: ['CC(C)=O.CC=O', 'CC(C)O.CCO', 'CC(=O)O.CC(=O)O', 'CC(C)(O)C(C)O'],
      e: 'Ozonolysis cuts the C=C and puts a C=O on each end: (CH₃)₂C= gives <b>propanone</b>, =CHCH₃ gives <b>ethanal</b>.' },
    { id: 'o-rx20', q: '1-Methylcyclohexene is treated with BH₃ in THF, then H₂O₂/NaOH. What is the product (ignore stereochemistry)?', c: ['CC1CCCCC1O', 'CC1(O)CCCCC1', 'CC1CCCC(O)C1', 'OCC1CCCCC1'],
      e: '<b>Hydroboration–oxidation</b> is anti-Markovnikov and syn: OH goes on the less substituted carbon, next to the CH₃: 2-methylcyclohexan-1-ol (trans).' },
    { id: 'o-rx21', q: 'Ethanal is treated with dilute NaOH. What is the product?', c: ['CC(O)CC=O', 'CC(=O)O', 'CCO', 'CC(O)O'],
      e: 'An <b>aldol addition</b>: the enolate of one ethanal attacks the carbonyl of another: 3-hydroxybutanal (which loses water on heating to give but-2-enal).' },
    { id: 'o-rx22', q: 'Methylamine reacts with ethanoyl chloride. What is the organic product?', c: ['CNC(C)=O', 'CC(=O)OC', 'CC(=O)N', 'CNCC'],
      e: 'Nucleophilic acyl substitution: the amine attacks the acyl chloride, Cl⁻ leaves: the amide <b>N-methylethanamide</b> (+ HCl).' },
    { id: 'o-rx23', q: 'Phenylamine (aniline) is shaken with bromine water. What precipitate forms?', c: ['Nc1c(Br)cc(Br)cc1Br', 'Nc1ccc(Br)cc1', 'Brc1ccccc1', 'NC1CCCCC1'],
      e: 'The NH₂ group strongly activates the ring, so all three ortho/para positions are brominated at once without a catalyst: white <b>2,4,6-tribromophenylamine</b>.' },
    { id: 'o-rx24', q: 'Ethyl ethanoate is heated under reflux with aqueous NaOH. What are the products?', c: ['CC(=O)[O-].[Na+].CCO', 'CC(=O)O.CCO', 'CC(=O)OC(C)=O.CC', 'CC=O.CC=O'],
      e: 'Base <b>hydrolysis (saponification)</b> is irreversible because the carboxylate is formed: sodium ethanoate + ethanol.' },
  ];
  ArenaBank.add(RXN.map((x) => ({ id: x.id, t: 'organic', q: x.q, c: x.c.map((s) => (typeof s === 'string' && !(x.text && s === x.c[0]) ? { smi: s } : s)), e: x.e, h: 'Identify the functional group and the type of reagent (electrophile, nucleophile, oxidant, reductant, base).', needsRDKit: true })));

  /* ---------------- conceptual organic ---------------- */
  ArenaBank.add([
    { id: 'o1', t: 'organic', q: 'How many structural isomers have the formula C₆H₁₄?', c: ['3', '4', '5', '6'], keep: true, a: 2,
      e: 'Hexane, 2-methylpentane, 3-methylpentane, 2,2-dimethylbutane and 2,3-dimethylbutane: <b>5</b>.', h: 'Shorten the main chain one carbon at a time and place the branches.' },
    { id: 'o2', t: 'organic', q: 'How many stereoisomers does 2,3-dibromobutane have?', c: ['2', '3', '4', '6'], keep: true, a: 1,
      e: 'Two stereocentres would allow 2² = 4, but (2R,3S) and (2S,3R) are the same <b>meso</b> compound (it has a mirror plane). (R,R) + (S,S) + meso = <b>3</b>.', h: 'Look for an internal mirror plane in one of the isomers.' },
    { id: 'o3', t: 'organic', q: 'How many alkenes have the formula C₄H₈, counting stereoisomers separately?', c: ['3', '4', '5', '6'], keep: true, a: 1,
      e: 'But-1-ene, (E)-but-2-ene, (Z)-but-2-ene and 2-methylpropene: <b>4</b>. (Cyclobutane and methylcyclopropane are C₄H₈ too, but not alkenes.)', h: 'Don’t forget E/Z.' },
    { id: 'o4', t: 'organic', q: 'Which compound is the strongest acid?', c: ['ethanoic acid', 'phenol', 'ethanol', 'water'],
      e: 'pK<sub>a</sub>: ethanoic acid 4.8, phenol 10, water 15.7, ethanol 16. The carboxylate ion spreads its charge over <b>two O atoms</b> by resonance.', h: 'Which conjugate base is most stabilised by resonance?' },
    { id: 'o5', t: 'organic', q: 'Which compound is the strongest base?', c: ['ethylamine', 'ammonia', 'phenylamine (aniline)', 'ethanamide'],
      e: 'The ethyl group pushes electron density onto N: <b>ethylamine</b> (pK<sub>aH</sub> 10.7) > NH₃ (9.25) > aniline (4.6, lone pair delocalised into the ring) > amide (lone pair delocalised onto C=O, about −0.5).', h: 'Is the N lone pair available or delocalised?' },
    { id: 'o6', t: 'organic', q: 'Which alkyl bromide reacts fastest with NaOH by the SN2 mechanism?', c: ['CH₃Br', 'CH₃CH₂Br', '(CH₃)₂CHBr', '(CH₃)₃CBr'],
      e: 'SN2 needs backside attack on the carbon; every extra alkyl group blocks it. <b>Methyl</b> > primary > secondary ≫ tertiary.', h: 'Steric hindrance at the carbon being attacked.' },
    { id: 'o7', t: 'organic', q: 'Which alkyl bromide reacts fastest by the SN1 mechanism in water?', c: ['(CH₃)₃CBr', '(CH₃)₂CHBr', 'CH₃CH₂Br', 'CH₃Br'],
      e: 'The slow step forms a carbocation; tertiary cations are the most stable (hyperconjugation): <b>2-bromo-2-methylpropane</b>.', h: 'Carbocation stability.' },
    { id: 'o8', t: 'organic', q: 'These compounds have similar molar masses. Which has the highest boiling point?', c: ['propan-1-ol', 'butane', 'propanal', 'methoxyethane'],
      e: 'Only <b>propan-1-ol</b> (97 °C) can hydrogen-bond to itself. Propanal (48 °C) is polar; methoxyethane (7 °C) and butane (−1 °C) are weakly attracted.', h: 'Which one can hydrogen-bond?' },
    { id: 'o9', t: 'organic', q: 'Which polymer is made by condensation polymerisation?', c: ['nylon-6,6', 'poly(ethene)', 'poly(chloroethene) (PVC)', 'poly(phenylethene) (polystyrene)'],
      e: '<b>Nylon-6,6</b> forms from hexane-1,6-diamine and hexanedioic acid with loss of water at each amide link. The others are addition polymers of alkenes.', h: 'Is a small molecule lost when each link forms?' },
    { id: 'o10', t: 'organic', q: 'Which species is aromatic?', c: [{ smi: 'c1cc[cH-]c1', label: 'cyclopentadienyl anion' }, { smi: '[CH+]1C=CC=C1', label: 'cyclopentadienyl cation' }, { smi: 'C1=CC=CC=CC=C1', label: 'cyclooctatetraene' }, { smi: 'C1=CC=CCC1', label: 'cyclohexa-1,3-diene' }],
      e: 'Hückel’s rule: planar, fully conjugated ring with 4n + 2 π electrons. The <b>cyclopentadienyl anion</b> has 6. The cation has 4 (antiaromatic), cyclooctatetraene 8 (it puckers into a tub), and cyclohexa-1,3-diene has an sp³ carbon.', h: 'Count π electrons; a carbanion lone pair in the ring counts as 2.', needsRDKit: true },
    { id: 'o11', t: 'organic', q: 'How do a pair of enantiomers differ?', c: ['They rotate plane-polarised light in opposite directions', 'They have different boiling points', 'They have different solubilities in water', 'They have different molecular formulas'],
      e: 'Enantiomers have identical physical properties in an achiral environment, except the <b>sign of optical rotation</b>. They can differ in reactions with other chiral molecules (enzymes, receptors).', h: 'Mirror-image molecules in a non-chiral world.' },
    { id: 'o12', t: 'organic', q: 'Which functional group is present in CH₃COOCH₃?', c: ['ester', 'ether', 'ketone', 'carboxylic acid'],
      e: 'R–C(=O)–O–R′ is an <b>ester</b> (methyl ethanoate).', h: 'A C=O with an O–C next to it.' },
    { id: 'o13', t: 'organic', q: 'Which reagent distinguishes an aldehyde from a ketone?', c: ['Tollens’ reagent (silver mirror)', '2,4-dinitrophenylhydrazine', 'bromine water', 'sodium carbonate'],
      e: 'Aldehydes are oxidised; ketones are not: <b>Tollens’</b> gives a silver mirror (Fehling’s/Benedict’s a red Cu₂O precipitate). 2,4-DNPH reacts with both.', h: 'What can an aldehyde do that a ketone can’t?' },
    { id: 'o14', t: 'organic', q: 'What is the hybridisation of the carbon atoms in benzene?', c: ['sp²', 'sp', 'sp³', 'sp³d'],
      e: 'Each C uses three <b>sp²</b> orbitals for σ bonds (120°, planar) and one p orbital for the delocalised π ring.', h: 'Bond angles of 120°.' },
  ]);
})();
