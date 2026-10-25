/* ============================================================================
   ChemSim · studio/geometry.js
   ----------------------------------------------------------------------------
   Small maths and lookup helpers for the 2D drawing.
   ============================================================================ */
'use strict';

/* ============================================================================
   5. GEOMETRY HELPERS
   ============================================================================ */
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const angleOf = (from, to) => Math.atan2(to.y - from.y, to.x - from.x);
/** Normalise an angle into the range [0, 2π). */
const norm = (a) => ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
/** Smallest difference between two angles (0..π). */
const angDiff = (a, b) => { const d = Math.abs(norm(a) - norm(b)); return Math.min(d, 2 * Math.PI - d); };

function pointSegmentDistance(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len2 = dx * dx + dy * dy || 1;
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

const getAtom = (id) => state.atoms.find((a) => a.id === id);
const atomIndex = (id) => state.atoms.findIndex((a) => a.id === id);
const atomLabelName = (id) => { const a = getAtom(id); return a ? `${a.el}${atomIndex(id) + 1}` : '?'; };
const findBond = (id1, id2) => state.bonds.find((b) => (b.a1 === id1 && b.a2 === id2) || (b.a1 === id2 && b.a2 === id1));
const bondsOf = (id) => state.bonds.filter((b) => b.a1 === id || b.a2 === id);
const neighborIds = (id) => bondsOf(id).map((b) => (b.a1 === id ? b.a2 : b.a1));

/** Pretty charge text: +1 → "+", -2 → "2−". */
function chargeText(c) {
  if (c === 0) return '';
  const sign = c > 0 ? '+' : '−';
  return Math.abs(c) === 1 ? sign : `${Math.abs(c)}${sign}`;
}
/** Signed number text with a real minus sign: -1 → "−1", 2 → "+2". */
function signed(n, digits = 0) {
  const v = digits ? Number(n).toFixed(digits) : String(n);
  if (Number(v) === 0) return digits ? (0).toFixed(digits) : '0';
  return Number(n) > 0 ? `+${v}` : v.replace('-', '−');
}
