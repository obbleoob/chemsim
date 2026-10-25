#!/usr/bin/env python3
"""
ChemSim · tools/build_elements.py
---------------------------------
Builds data/elements.json (the Element Wiki's data) by merging three open sources:

  1. Periodic-Table-JSON by Bowserinator (CC BY-SA 3.0, text from Wikipedia)
       https://github.com/Bowserinator/Periodic-Table-JSON
       → table layout, appearance, phase, Wikipedia summary, radii, EN, molar heat
  2. mendeleev (MIT licence), its bundled SQLite database
       https://github.com/lmmentel/mendeleev   (pip install mendeleev)
       → lattice structure & constant, discovery year/people/place, name origin,
         crustal & sea abundance, uses, sources (production), oxidation states,
         isotopes, NIST ionization energies, melting/boiling points
  3. NIST Atomic Spectra Database line lists (neutral atoms, "X I"), as mirrored by
       https://github.com/astro-data/nist_atomic_lines_package  (nist_library/NIST_ELEMENTS)
       → emission lines (wavelength in Å, relative intensity)

Usage:
  python3 tools/build_elements.py PeriodicTableJSON.json path/to/mendeleev/elements.db path/to/NIST_ELEMENTS_dir

Every value in the output keeps a short "src" note in data/SOURCES.md, not per value,
to keep the file small. Run this again whenever a source is updated.
"""
import json
import os
import re
import sqlite3
import sys

EV_TO_KJ = 96.485332

# Our 10 display categories (plus "unknown" for superheavies whose chemistry is predicted)
CATEGORY_MAP = {
    'alkali metal': 'alkali metal',
    'alkaline earth metal': 'alkaline earth metal',
    'transition metal': 'transition metal',
    'post-transition metal': 'post-transition metal',
    'metalloid': 'metalloid',
    'diatomic nonmetal': 'nonmetal',
    'polyatomic nonmetal': 'nonmetal',
    'noble gas': 'noble gas',
    'lanthanide': 'lanthanide',
    'actinide': 'actinide',
}
HALOGENS = {'F', 'Cl', 'Br', 'I', 'At', 'Ts'}

LATTICE_NAMES = {
    'BCC': 'body-centred cubic (bcc)', 'FCC': 'face-centred cubic (fcc)', 'HEX': 'hexagonal (hcp)',
    'SC': 'simple cubic', 'DIA': 'diamond cubic', 'CUB': 'cubic (complex)', 'ORC': 'orthorhombic',
    'RHL': 'rhombohedral', 'TET': 'tetragonal', 'MCL': 'monoclinic',
}

# Hexagonal lattices that are not simple close packing (shown differently in the 3D viewer)
NOT_HCP = {'H', 'He', 'C', 'N', 'Se', 'Te'}   # graphite / molecular / helical-chain hexagonal


def category_for(e):
    raw = (e.get('category') or '').lower()
    if e['symbol'] in HALOGENS and e['number'] <= 85:
        return 'halogen'
    if raw.startswith('unknown'):
        return 'unknown'
    return CATEGORY_MAP.get(raw, 'unknown')


def round_or_none(x, nd=3):
    return None if x is None else round(float(x), nd)


def visible_lines(nist_dir, sym, max_lines=60):
    """Strongest neutral-atom lines between 380 and 750 nm (wavelengths in nm)."""
    path = os.path.join(nist_dir, sym, f'{sym}_I.dat')
    if not os.path.exists(path):
        return None
    out = []
    with open(path) as f:
        next(f)  # header
        for line in f:
            parts = line.rstrip('\n').split('\t')
            if len(parts) < 5:
                continue
            try:
                wl_a = float(parts[3])
                inten = float(parts[4])
            except ValueError:
                continue
            nm = wl_a / 10
            if 380 <= nm <= 750 and inten > 0:
                out.append((round(nm, 3), inten))
    if not out:
        return []
    out.sort(key=lambda t: -t[1])
    out = out[:max_lines]
    top = out[0][1]
    # relative intensity 0-1 (NIST relative intensities are only comparable within one element)
    return sorted([[nm, round(i / top, 4)] for nm, i in out])


def main(bowser_path, db_path, nist_dir):
    bowser = {e['number']: e for e in json.load(open(bowser_path))['elements'] if e['number'] <= 118}
    db = sqlite3.connect(db_path)
    db.row_factory = sqlite3.Row
    rows = {r['atomic_number']: r for r in db.execute('select * from elements')}

    def per_atom(sql):
        d = {}
        for r in db.execute(sql):
            d.setdefault(r[0], []).append(tuple(r)[1:])
        return d

    ox = per_atom('select atomic_number, oxidation_state, category from oxidationstates order by oxidation_state')
    ies = per_atom('select atomic_number, ion_charge, ionization_energy, is_theoretical from ionizationenergies order by ion_charge')
    isos = per_atom('select atomic_number, mass_number, abundance, is_radioactive, half_life, half_life_unit, mass from isotopes order by mass_number')
    phases = per_atom('select atomic_number, melting_point, boiling_point, allotrope, is_sublimation_point, triple_point_temperature, critical_temperature from phasetransitions')

    elements = []
    for z in range(1, 119):
        b, m = bowser[z], rows[z]
        sym = b['symbol']
        radii = b.get('atomic_radii') or {}
        first = lambda k: (radii.get(k) or [None])[0]

        # melting / boiling point: mendeleev phasetransitions (NIST/CRC); fall back to Bowserinator
        mp = bp = None
        sublimes = False
        for (mpv, bpv, allotrope, subl, tp, tc) in phases.get(z, []):
            if mp is None and mpv is not None:
                mp = mpv
            if bp is None and bpv is not None:
                bp = bpv
            if subl:
                sublimes = True
        mp = mp if mp is not None else b.get('melt')
        bp = bp if bp is not None else b.get('boil')

        # isotopes: all stable/natural ones, plus the 4 longest-lived radioactive ones
        unit_s = {'zsec': 1e-21, 'asec': 1e-18, 'fsec': 1e-15, 'psec': 1e-12, 'nsec': 1e-9, 'usec': 1e-6, 'msec': 1e-3,
                  'sec': 1, 's': 1, 'minute': 60, 'min': 60, 'hour': 3600, 'h': 3600, 'day': 86400, 'd': 86400,
                  'year': 3.156e7, 'y': 3.156e7, 'kyear': 3.156e10, 'Myear': 3.156e13, 'Gyear': 3.156e16,
                  'Tyear': 3.156e19, 'Pyear': 3.156e22, 'Eyear': 3.156e25, 'Zyear': 3.156e28, 'Yyear': 3.156e31}
        natural, radio = [], []
        for (A, ab, isr, hl, hlu, mass) in isos.get(z, []):
            item = {'A': A, 'mass': round_or_none(mass, 6)}
            if ab:
                item['abundance'] = round(ab, 4)
            if isr and hl:
                item['halfLife'] = hl
                item['unit'] = hlu
                item['seconds'] = hl * unit_s.get(hlu, 0) if hlu in unit_s else None
            if ab:
                natural.append(item)
            elif isr and hl and item.get('seconds'):
                radio.append(item)
        radio.sort(key=lambda i: -(i['seconds'] or 0))
        isotopes = natural + radio[:4]
        for i in isotopes:
            i.pop('seconds', None)

        # successive ionization energies: only the unbroken run starting at the
        # neutral atom (ion charge 0), otherwise "1st IE" would be wrong
        ie_list, ie_theory = [], None   # ie_theory = index of the first calculated (not measured) value
        for (charge, energy, theo) in ies.get(z, []):
            if charge != len(ie_list) or energy is None:
                break
            if theo and ie_theory is None:
                ie_theory = len(ie_list)
            ie_list.append(round(energy * EV_TO_KJ, 1))

        lattice = m['lattice_structure']
        crystal = None
        if lattice:
            kind = lattice
            if lattice == 'HEX' and sym in NOT_HCP:
                kind = 'HEXO'   # "other hexagonal"
            name = 'hexagonal' if kind == 'HEXO' else LATTICE_NAMES.get(lattice, lattice)
            crystal = {'code': kind, 'name': name, 'a': round_or_none(m['lattice_constant'], 3)}

        disc_year = m['discovery_year']
        discoverers = (m['discoverers'] or b.get('discovered_by') or '').strip().rstrip('.')
        ancient = 'ancient' in discoverers.lower()

        el = {
            'z': z,
            'sym': sym,
            'name': b['name'],
            'mass': round_or_none(m['atomic_weight'] or b['atomic_mass'], 6),
            'group': b.get('group') if b.get('group') and 1 <= b['group'] <= 18 and not (57 <= z <= 71 or 89 <= z <= 103) else None,
            'period': b['period'],
            'block': b.get('block'),
            'category': category_for(b),
            'x': b['xpos'], 'y': b['ypos'],
            'phase': (b.get('phase') or '').lower() or None,
            'appearance': b.get('appearance'),
            'config': b.get('electron_configuration'),
            'configShort': b.get('electron_configuration_semantic'),
            'shells': b.get('shells'),
            'en': b.get('electronegativity_pauling') if b.get('electronegativity_pauling') is not None else round_or_none(m['en_pauling'], 2),
            'radius': {
                'empirical': first('empirical'),
                'calculated': first('calculated'),
                'covalent': round_or_none(m['covalent_radius_pyykko'], 0) or first('covalent_single'),
                'vdw': first('van_der_waals') or round_or_none(m['vdw_radius'], 0),
                'metallic': first('metallic') or round_or_none(m['metallic_radius'], 0),
                'rahm': round_or_none(m['atomic_radius_rahm'], 0),
            },
            'ie': ie_list,
            'ieCalcFrom': ie_theory,
            'ea': round_or_none(m['electron_affinity'] * EV_TO_KJ, 1) if m['electron_affinity'] is not None else round_or_none(b.get('electron_affinity'), 1),
            'mp': round_or_none(mp, 2),
            'bp': round_or_none(bp, 2),
            'sublimes': sublimes or None,
            'density': round_or_none(m['density'] if m['density'] is not None else b.get('density'), 4),
            'molarHeat': round_or_none(b.get('molar_heat') or m['molar_heat_capacity'], 3),
            'thermalConductivity': round_or_none(m['thermal_conductivity'], 3),
            'crystal': crystal,
            'ox': {'main': [o for (o, c) in ox.get(z, []) if c == 'main'], 'other': [o for (o, c) in ox.get(z, []) if c != 'main']},
            'discovery': {'year': disc_year, 'by': discoverers or None, 'where': (m['discovery_location'] or None), 'ancient': ancient or None},
            'nameOrigin': m['name_origin'],
            'abundance': {'crust': m['abundance_crust'], 'sea': m['abundance_sea']},
            'radioactive': bool(m['is_radioactive']),
            # Bulk properties of these were never measured (too few atoms, or too radioactive):
            # melting point, boiling point, density, crystal structure are estimates/predictions.
            'predictedBulk': z >= 100 or sym in ('At', 'Fr') or None,
            'description': m['description'],
            'production': m['sources'],
            'uses': m['uses'],
            'summary': b.get('summary'),
            'wiki': b.get('source'),
            'cpk': m['cpk_color'] or ('#' + b['cpk-hex'] if b.get('cpk-hex') else None),
            'goldschmidt': m['goldschmidt_class'],
            'isotopes': isotopes,
            'lines': visible_lines(nist_dir, sym),
        }
        elements.append(el)

    out = os.path.join(os.path.dirname(__file__), '..', 'data', 'elements.json')
    with open(out, 'w') as f:
        json.dump({'generated_by': 'tools/build_elements.py', 'sources': 'see data/SOURCES.md', 'elements': elements},
                  f, ensure_ascii=False, separators=(',', ':'))
    print(f'Wrote {len(elements)} elements to {os.path.normpath(out)} ({os.path.getsize(out) // 1024} KB)')
    print('  with emission lines:', sum(1 for e in elements if e['lines']))
    print('  with crystal data:  ', sum(1 for e in elements if e['crystal']))


if __name__ == '__main__':
    if len(sys.argv) != 4:
        print(__doc__)
        sys.exit(1)
    main(*sys.argv[1:])
