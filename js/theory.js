// Music theory: spelled notes, intervals, chords, and question generators.
// A spelled note is { letter: 0-6 (C..B), acc: -2..2, midi }.

export const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
export const LETTER_PC = [0, 2, 4, 5, 7, 9, 11];
const ACC_SYMBOL = { '-2': '♭♭', '-1': '♭', '0': '', '1': '♯', '2': '♯♯' };
const PLAIN_PC = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];

export const mod = (n, m) => ((n % m) + m) % m;

export function makeNote(letter, acc, octave) {
  return { letter, acc, midi: 12 * (octave + 1) + LETTER_PC[letter] + acc };
}

export function octaveOf(n) {
  return Math.floor((n.midi - n.acc - LETTER_PC[n.letter]) / 12) - 1;
}

export function pcName(n) {
  return LETTERS[n.letter] + ACC_SYMBOL[n.acc];
}

export function noteName(n) {
  return pcName(n) + octaveOf(n);
}

// Plain (one sharp/flat, no E♯/B♯/F♭/C♭) name for a MIDI number.
export function plainName(midi) {
  return PLAIN_PC[mod(midi, 12)] + (Math.floor(midi / 12) - 1);
}

// True when a spelling is correct theory but unusual to read (B♭♭, E♯, C♭ ...).
export function isAwkward(n) {
  if (Math.abs(n.acc) >= 2) return true;
  if (n.acc === 1 && (n.letter === 2 || n.letter === 6)) return true; // E♯, B♯
  if (n.acc === -1 && (n.letter === 3 || n.letter === 0)) return true; // F♭, C♭
  return false;
}

// Move a spelled note by a number of letter steps and semitones (both signed).
export function transpose(n, steps, semis) {
  const dia = octaveOf(n) * 7 + n.letter + steps;
  const letter = mod(dia, 7);
  const octave = Math.floor(dia / 7);
  const midi = n.midi + semis;
  return { letter, acc: midi - (12 * (octave + 1) + LETTER_PC[letter]), midi };
}

// Note choices offered in pickers: [id, label, letter, acc]
export const SPELLINGS = [
  ['C', 'C', 0, 0], ['Cs', 'C♯', 0, 1], ['Db', 'D♭', 1, -1], ['D', 'D', 1, 0],
  ['Ds', 'D♯', 1, 1], ['Eb', 'E♭', 2, -1], ['E', 'E', 2, 0], ['F', 'F', 3, 0],
  ['Fs', 'F♯', 3, 1], ['Gb', 'G♭', 4, -1], ['G', 'G', 4, 0], ['Gs', 'G♯', 4, 1],
  ['Ab', 'A♭', 5, -1], ['A', 'A', 5, 0], ['As', 'A♯', 5, 1], ['Bb', 'B♭', 6, -1],
  ['B', 'B', 6, 0],
];

export function noteFromSpelling(id, octave) {
  const s = SPELLINGS.find((x) => x[0] === id) || SPELLINGS[0];
  return makeNote(s[2], s[3], octave);
}

function spellingsForMidi(midi) {
  const pc = mod(midi, 12);
  return SPELLINGS.filter((s) => mod(LETTER_PC[s[2]] + s[3], 12) === pc).map((s) => ({
    letter: s[2],
    acc: s[3],
    midi,
  }));
}

// How hard a set of spellings is to read: fewer accidentals is better.
function spellingCost(notes) {
  return notes.reduce((c, n) => c + Math.abs(n.acc) + (isAwkward(n) ? 1.5 : 0), 0);
}

// ---------- Intervals ----------

export const INTERVALS = [
  { id: 'm2', short: 'm2', name: 'Minor 2nd', semis: 1, steps: [1], weight: 7 },
  { id: 'M2', short: 'M2', name: 'Major 2nd', semis: 2, steps: [1], weight: 9 },
  { id: 'm3', short: 'm3', name: 'Minor 3rd', semis: 3, steps: [2], weight: 10 },
  { id: 'M3', short: 'M3', name: 'Major 3rd', semis: 4, steps: [2], weight: 10 },
  { id: 'P4', short: 'P4', name: 'Perfect 4th', semis: 5, steps: [3], weight: 10 },
  { id: 'TT', short: 'TT', name: 'Tritone', semis: 6, steps: [3, 4], weight: 4 },
  { id: 'P5', short: 'P5', name: 'Perfect 5th', semis: 7, steps: [4], weight: 10 },
  { id: 'm6', short: 'm6', name: 'Minor 6th', semis: 8, steps: [5], weight: 6 },
  { id: 'M6', short: 'M6', name: 'Major 6th', semis: 9, steps: [5], weight: 7 },
  { id: 'm7', short: 'm7', name: 'Minor 7th', semis: 10, steps: [6], weight: 6 },
  { id: 'M7', short: 'M7', name: 'Major 7th', semis: 11, steps: [6], weight: 4 },
  { id: 'P8', short: 'P8', name: 'Octave', semis: 12, steps: [7], weight: 8 },
];

// Spell the target of an interval. For the tritone, pick whichever of
// augmented 4th / diminished 5th reads more simply.
export function intervalTarget(start, iv, dir) {
  let best = null;
  for (const steps of iv.steps) {
    const t = transpose(start, dir * steps, dir * iv.semis);
    const cost = spellingCost([t]);
    if (!best || cost < best.cost) best = { note: t, steps, cost };
  }
  return best;
}

export function intervalLabel(iv, steps) {
  if (iv.id !== 'TT') return iv.name;
  return steps === 3 ? 'Tritone (aug 4th)' : 'Tritone (dim 5th)';
}

export function makeIntervalQuestion(start, iv, dir) {
  const t = intervalTarget(start, iv, dir);
  return {
    type: 'interval',
    interval: iv,
    dir,
    title: intervalLabel(iv, t.steps),
    given: start,
    sing: [t.note],
  };
}

// ---------- Chords ----------
// tones: [semitones above root, letter steps above root]

export const CHORDS = [
  { id: 'maj', name: 'major', symbol: '', tones: [[0, 0], [4, 2], [7, 4]], weight: 10 },
  { id: 'min', name: 'minor', symbol: 'm', tones: [[0, 0], [3, 2], [7, 4]], weight: 10 },
  { id: 'dim', name: 'diminished', symbol: '°', tones: [[0, 0], [3, 2], [6, 4]], weight: 3 },
  { id: 'aug', name: 'augmented', symbol: '+', tones: [[0, 0], [4, 2], [8, 4]], weight: 2 },
  { id: 'sus2', name: 'sus2', symbol: 'sus2', tones: [[0, 0], [2, 1], [7, 4]], weight: 3 },
  { id: 'sus4', name: 'sus4', symbol: 'sus4', tones: [[0, 0], [5, 3], [7, 4]], weight: 3 },
  { id: 'dom7', name: 'dominant 7th', symbol: '7', tones: [[0, 0], [4, 2], [7, 4], [10, 6]], weight: 6 },
  { id: 'maj7', name: 'major 7th', symbol: 'maj7', tones: [[0, 0], [4, 2], [7, 4], [11, 6]], weight: 4 },
  { id: 'min7', name: 'minor 7th', symbol: 'm7', tones: [[0, 0], [3, 2], [7, 4], [10, 6]], weight: 5 },
  { id: 'm7b5', name: 'half-diminished 7th', symbol: 'm7♭5', tones: [[0, 0], [3, 2], [6, 4], [10, 6]], weight: 2 },
  { id: 'dim7', name: 'diminished 7th', symbol: '°7', tones: [[0, 0], [3, 2], [6, 4], [9, 6]], weight: 2 },
];

export const INVERSION_NAMES = ['Root position', '1st inversion', '2nd inversion', '3rd inversion'];
export const INVERSION_SHORT = ['Root', '1st', '2nd', '3rd'];

// Ascending voicing that always contains the root at its given pitch.
// Inversion k moves the tones below the root down an octave.
export function chordVoicing(root, chord, inv) {
  const tones = chord.tones.map(([semis, steps]) => transpose(root, steps, semis));
  if (!inv) return tones;
  return [...tones.slice(inv).map((t) => transpose(t, -7, -12)), ...tones.slice(0, inv)];
}

export function makeChordQuestion(root, chord, inv, givenMode) {
  const voicing = chordVoicing(root, chord, inv);
  const givenIsRoot = givenMode === 'root' || inv === 0;
  const tones = chord.tones.map(([semis, steps]) => transpose(root, steps, semis));
  const bass = tones[inv];
  return {
    type: 'chord',
    chord,
    inv,
    root,
    title: `${pcName(root)} ${chord.name}`,
    symbol: pcName(root) + chord.symbol + (inv ? '/' + pcName(bass) : ''),
    givenRole: givenIsRoot ? 'root' : 'lowest',
    given: givenIsRoot ? root : voicing[0],
    sing: voicing,
  };
}

// ---------- Random generators ----------

export function weightedPick(items, weightOf = (x) => x.weight) {
  const total = items.reduce((s, x) => s + weightOf(x), 0);
  let r = Math.random() * total;
  for (const x of items) {
    r -= weightOf(x);
    if (r < 0) return x;
  }
  return items[items.length - 1];
}

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

function cheapest(options) {
  const min = Math.min(...options.map((o) => o.cost));
  return pick(options.filter((o) => o.cost === min));
}

export function randomIntervalQuestion(lo, hi, dirMode) {
  for (let attempt = 0; attempt < 50; attempt++) {
    const iv = weightedPick(INTERVALS);
    const dir = dirMode === 'up' ? 1 : dirMode === 'down' ? -1 : Math.random() < 0.5 ? 1 : -1;
    const starts = [];
    for (let m = lo; m <= hi; m++) {
      const t = m + dir * iv.semis;
      if (t >= lo && t <= hi) starts.push(m);
    }
    if (!starts.length) continue;
    const midi = pick(starts);
    const options = spellingsForMidi(midi).map((start) => {
      const t = intervalTarget(start, iv, dir);
      return { start, cost: spellingCost([start, t.note]) };
    });
    return makeIntervalQuestion(cheapest(options).start, iv, dir);
  }
  return null;
}

const INVERSION_WEIGHTS = [2, 1.4, 1.2, 1];

export function randomChordQuestion(lo, hi, givenMode) {
  for (let attempt = 0; attempt < 50; attempt++) {
    const chord = weightedPick(CHORDS);
    const invs = chord.tones.map((_, i) => i);
    const inv = weightedPick(invs, (i) => INVERSION_WEIGHTS[i]);
    const roots = [];
    for (let m = lo - 12; m <= hi + 12; m++) {
      const options = spellingsForMidi(m)
        .map((root) => {
          const v = chordVoicing(root, chord, inv);
          return { root, v, cost: spellingCost(v) };
        })
        .filter((o) => o.v.every((n) => n.midi >= lo && n.midi <= hi));
      if (options.length) roots.push(cheapest(options).root);
    }
    if (!roots.length) continue;
    const mode = givenMode === 'mixed' ? (Math.random() < 0.5 ? 'root' : 'lowest') : givenMode;
    return makeChordQuestion(pick(roots), chord, inv, mode);
  }
  return null;
}

export function sameQuestion(a, b) {
  if (!a || !b || a.type !== b.type) return false;
  if (a.given.midi !== b.given.midi) return false;
  if (a.sing.length !== b.sing.length) return false;
  return a.sing.every((n, i) => n.midi === b.sing[i].midi);
}
