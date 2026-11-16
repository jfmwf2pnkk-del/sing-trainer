import * as T from './theory.js';
import { PianoAudio } from './audio.js';
import { renderPiano, setSounding } from './piano.js';
import { PitchMeter } from './meter.js';

const $ = (id) => document.getElementById(id);
const STORE_KEY = 'interval-trainer:v1';
const SPEED = { slow: 0.85, normal: 0.6, fast: 0.42 };
const RANGE_MIN = 33; // A1
const RANGE_MAX = 84; // C6

const DEFAULTS = {
  kind: 'intervals',
  mode: 'guided',
  gi: { note: 'C', oct: 4, dir: 'up', index: 0 },
  gc: { note: 'C', oct: 4, type: 'maj', inv: 0, given: 'root' },
  ri: { dir: 'both' },
  rc: { given: 'mixed' },
  lo: 45, // A2
  hi: 72, // C5
  speed: 'normal',
  autoplay: true,
};

// ---------- State ----------

function loadState() {
  let saved = {};
  try {
    saved = JSON.parse(localStorage.getItem(STORE_KEY)) || {};
  } catch {}
  const s = structuredClone(DEFAULTS);
  for (const k of Object.keys(s)) {
    if (!(k in saved)) continue;
    if (typeof s[k] === 'object') Object.assign(s[k], saved[k]);
    else s[k] = saved[k];
  }
  return s;
}

function save() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(S));
  } catch {}
}

const S = loadState();
const randomQ = { intervals: null, chords: null };
const audio = new PianoAudio();
const svg = $('piano');
let Q = null;

audio.onSound = (midi, on) => setSounding(svg, midi, on);

// Notes the pitch bar compares against: the interval's target, or every chord note
// (it follows whichever one you're closest to as you sing the arpeggio).
const meterTargets = () =>
  Q ? (Q.type === 'interval' ? [Q.sing[0]] : Q.sing).map((n) => ({ midi: n.midi, name: T.noteName(n) })) : [];

function trackKey(midi) {
  svg.querySelectorAll('.is-tracking').forEach((k) => {
    if (Number(k.dataset.midi) !== midi) k.classList.remove('is-tracking');
  });
  if (midi != null) svg.querySelector(`.key[data-midi="${midi}"]`)?.classList.add('is-tracking');
}

const meter = new PitchMeter(
  audio,
  {
    stage: $('stage'),
    meter: $('meter'),
    fill: $('meterFill'),
    target: $('meterTarget'),
    read: $('meterRead'),
    sung: $('meterSung'),
    button: $('micBtn'),
    status: $('status'),
  },
  meterTargets,
  trackKey
);
audio.onContextChange = () => meter.attach();

const chordById = (id) => T.CHORDS.find((c) => c.id === id) || T.CHORDS[0];
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// ---------- Questions ----------

function newRandom(kind) {
  return kind === 'intervals'
    ? T.randomIntervalQuestion(S.lo, S.hi, S.ri.dir)
    : T.randomChordQuestion(S.lo, S.hi, S.rc.given);
}

function nextRandom(kind) {
  let q;
  for (let i = 0; i < 8; i++) {
    q = newRandom(kind);
    if (!T.sameQuestion(q, randomQ[kind])) break;
  }
  randomQ[kind] = q;
}

function buildQuestion() {
  let q;
  if (S.mode === 'random') {
    if (!randomQ[S.kind]) nextRandom(S.kind);
    q = randomQ[S.kind];
    const midis = [q.given.midi, ...q.sing.map((n) => n.midi)];
    q.frame = [Math.min(...midis), Math.max(...midis)];
    q.kicker = q.type === 'interval' ? 'Random interval' : 'Random chord · ' + T.INVERSION_NAMES[q.inv];
    return q;
  }
  if (S.kind === 'intervals') {
    const start = T.noteFromSpelling(S.gi.note, S.gi.oct);
    const dir = S.gi.dir === 'up' ? 1 : -1;
    q = T.makeIntervalQuestion(start, T.INTERVALS[S.gi.index], dir);
    // Keep the keyboard still while stepping through intervals from one start note.
    q.frame = dir > 0 ? [start.midi, start.midi + 12] : [start.midi - 12, start.midi];
    q.kicker = `Interval ${S.gi.index + 1} of ${T.INTERVALS.length}`;
    return q;
  }
  const root = T.noteFromSpelling(S.gc.note, S.gc.oct);
  const chord = chordById(S.gc.type);
  S.gc.inv = Math.min(S.gc.inv, chord.tones.length - 1);
  q = T.makeChordQuestion(root, chord, S.gc.inv, S.gc.given);
  const all = chord.tones.flatMap((_, i) => T.chordVoicing(root, chord, i).map((n) => n.midi));
  q.frame = [Math.min(...all), Math.max(...all)];
  q.kicker = T.INVERSION_NAMES[S.gc.inv];
  return q;
}

// ---------- Rendering ----------

function noteHtml(n) {
  const name = T.noteName(n);
  return T.isAwkward(n) ? `${name} <span class="hint">(= ${T.plainName(n.midi)})</span>` : name;
}

function renderPrompt() {
  $('pKicker').textContent = Q.kicker;
  const notes = $('pNotes');
  if (Q.type === 'interval') {
    $('pTitle').textContent = Q.title;
    $('pBadge').textContent = Q.dir > 0 ? '↑ up' : '↓ down';
    notes.innerHTML =
      `<span class="pill given"><small>Start</small>${noteHtml(Q.given)}</span>` +
      `<span class="arrow">→</span>` +
      `<span class="pill target"><small>Sing</small>${noteHtml(Q.sing[0])}</span>`;
  } else {
    $('pTitle').textContent = Q.title;
    $('pBadge').textContent = Q.symbol;
    const seq = Q.sing
      .map((n) => {
        const role = n.midi === Q.given.midi ? 'given' : 'target';
        return `<span class="pill ${role}">${noteHtml(n)}</span>`;
      })
      .join('');
    notes.innerHTML =
      `<span class="pill given"><small>Given ${Q.givenRole}</small>${noteHtml(Q.given)}</span>` +
      `<span class="arrow">sing</span>${seq}`;
  }
}

function pianoMarks() {
  if (Q.type === 'interval') {
    return [
      { midi: Q.given.midi, role: 'given', label: T.noteName(Q.given) },
      { midi: Q.sing[0].midi, role: 'target', label: T.noteName(Q.sing[0]) },
    ];
  }
  return Q.sing.map((n, i) => ({
    midi: n.midi,
    role: n.midi === Q.given.midi ? 'given' : 'target',
    label: T.noteName(n),
    order: i + 1,
  }));
}

function drawPiano() {
  renderPiano(svg, {
    frame: Q.frame,
    marks: pianoMarks(),
    onKey: (midi) => audio.play([{ midi, at: 0, dur: 1.2 }]),
  });
}

const segRenderers = [];
function bindSeg(id, get, set) {
  const el = $(id);
  el.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || b.disabled) return;
    set(b.dataset.value);
  });
  segRenderers.push(() =>
    el.querySelectorAll('button').forEach((b) =>
      b.setAttribute('aria-pressed', String(b.dataset.value === String(get())))
    )
  );
}

function render() {
  Q = buildQuestion();

  for (const kind of ['intervals', 'chords']) {
    for (const mode of ['guided', 'random']) {
      $(`ctl-${kind}-${mode}`).hidden = !(S.kind === kind && S.mode === mode);
    }
  }
  segRenderers.forEach((f) => f());

  // Guided interval controls
  $('giNote').value = S.gi.note;
  $('giOct').value = S.gi.oct;
  $('giChips').querySelectorAll('.chip').forEach((c, i) => {
    c.setAttribute('aria-current', String(i === S.gi.index));
  });

  // Guided chord controls
  $('gcNote').value = S.gc.note;
  $('gcOct').value = S.gc.oct;
  $('gcType').value = S.gc.type;
  const tones = chordById(S.gc.type).tones.length;
  $('gcInv').querySelector('[data-value="3"]').disabled = tones < 4;

  const range = `${T.plainName(S.lo)} – ${T.plainName(S.hi)}`;
  document.querySelectorAll('.range-pill').forEach((b) => (b.textContent = range));

  renderPrompt();
  drawPiano();

  // Buttons
  const isChord = Q.type === 'chord';
  $('playGivenLbl').textContent = isChord ? 'Given' : 'Start';
  $('playGivenSub').textContent = T.noteName(Q.given);
  $('revealSub').textContent = isChord ? 'arpeggio' : T.noteName(Q.sing[0]);
  $('playBothSub').textContent = isChord ? 'given → arp' : `${T.noteName(Q.given)} → ${T.noteName(Q.sing[0])}`;
  const random = S.mode === 'random';
  $('prevBtn').hidden = random;
  $('nextBtn').parentElement.classList.toggle('single', random);
  meter.refresh();
}

function scrollChipIntoView() {
  const c = $('giChips').querySelector('[aria-current="true"]');
  if (!c) return;
  const box = $('giChips');
  const left = c.offsetLeft - box.clientWidth / 2 + c.offsetWidth / 2;
  box.scrollTo({ left, behavior: 'smooth' });
}

// ---------- Playback ----------

function singEvents(offset = 0) {
  if (Q.type === 'interval') return [{ midi: Q.sing[0].midi, at: offset, dur: 1.6 }];
  const step = SPEED[S.speed];
  return Q.sing.map((n, i) => ({
    midi: n.midi,
    at: offset + i * step,
    dur: i === Q.sing.length - 1 ? 1.6 : step * 1.3,
  }));
}

const playGiven = () => audio.play([{ midi: Q.given.midi, at: 0, dur: 1.6 }]);
const reveal = () => audio.play(singEvents());
function playBoth() {
  const gap = SPEED[S.speed] * (Q.type === 'interval' ? 1.7 : 2);
  audio.play([{ midi: Q.given.midi, at: 0, dur: gap * 0.9 }, ...singEvents(gap)]);
}

// ---------- Navigation ----------

function step(delta) {
  audio.unlock();
  if (S.mode === 'random') {
    nextRandom(S.kind);
  } else if (S.kind === 'intervals') {
    S.gi.index = T.mod(S.gi.index + delta, T.INTERVALS.length);
  } else {
    let ti = T.CHORDS.findIndex((c) => c.id === S.gc.type);
    let inv = S.gc.inv + delta;
    if (inv >= T.CHORDS[ti].tones.length) {
      ti = T.mod(ti + 1, T.CHORDS.length);
      inv = 0;
    } else if (inv < 0) {
      ti = T.mod(ti - 1, T.CHORDS.length);
      inv = T.CHORDS[ti].tones.length - 1;
    }
    S.gc.type = T.CHORDS[ti].id;
    S.gc.inv = inv;
  }
  changed(true);
  scrollChipIntoView();
}

// Re-render after a change; optionally play the new start note.
function changed(play) {
  save();
  render();
  if (play && S.autoplay) playGiven();
  else audio.stop();
}

// ---------- Setup ----------

function fillSelect(sel, options) {
  sel.replaceChildren(
    ...options.map(([value, label]) => {
      const o = document.createElement('option');
      o.value = value;
      o.textContent = label;
      return o;
    })
  );
}

function setup() {
  const noteOpts = T.SPELLINGS.map((s) => [s[0], s[1]]);
  const octOpts = [1, 2, 3, 4, 5, 6].map((o) => [o, o]);
  fillSelect($('giNote'), noteOpts);
  fillSelect($('gcNote'), noteOpts);
  fillSelect($('giOct'), octOpts);
  fillSelect($('gcOct'), octOpts);
  fillSelect($('gcType'), T.CHORDS.map((c) => [c.id, cap(c.name)]));
  const rangeOpts = [];
  for (let m = RANGE_MIN; m <= RANGE_MAX; m++) rangeOpts.push([m, T.plainName(m)]);
  fillSelect($('rangeLo'), rangeOpts);
  fillSelect($('rangeHi'), rangeOpts);

  const chips = $('giChips');
  T.INTERVALS.forEach((iv, i) => {
    const b = document.createElement('button');
    b.className = 'chip';
    b.textContent = iv.short;
    b.title = iv.name;
    b.addEventListener('click', () => {
      audio.unlock();
      S.gi.index = i;
      changed(true);
      scrollChipIntoView();
    });
    chips.appendChild(b);
  });

  bindSeg('kindSeg', () => S.kind, (v) => { S.kind = v; changed(false); });
  bindSeg('modeSeg', () => S.mode, (v) => { S.mode = v; changed(false); });
  bindSeg('giDir', () => S.gi.dir, (v) => { S.gi.dir = v; changed(true); });
  bindSeg('gcInv', () => S.gc.inv, (v) => { S.gc.inv = Number(v); changed(true); });
  bindSeg('gcGiven', () => S.gc.given, (v) => { S.gc.given = v; changed(true); });
  bindSeg('riDir', () => S.ri.dir, (v) => { S.ri.dir = v; nextRandom('intervals'); changed(true); });
  bindSeg('rcGiven', () => S.rc.given, (v) => { S.rc.given = v; nextRandom('chords'); changed(true); });
  bindSeg('speedSeg', () => S.speed, (v) => { S.speed = v; save(); segRenderers.forEach((f) => f()); });

  const onSelect = (id, fn) => $(id).addEventListener('change', (e) => { fn(e.target.value); changed(true); });
  onSelect('giNote', (v) => (S.gi.note = v));
  onSelect('giOct', (v) => (S.gi.oct = Number(v)));
  onSelect('gcNote', (v) => (S.gc.note = v));
  onSelect('gcOct', (v) => (S.gc.oct = Number(v)));
  onSelect('gcType', (v) => { S.gc.type = v; S.gc.inv = 0; });

  $('playGiven').addEventListener('click', playGiven);
  $('reveal').addEventListener('click', reveal);
  $('playBoth').addEventListener('click', playBoth);
  $('nextBtn').addEventListener('click', () => step(1));
  $('prevBtn').addEventListener('click', () => step(-1));

  // Settings sheet
  const dlg = $('settings');
  let rangeBefore = '';
  const openSettings = () => {
    $('rangeLo').value = S.lo;
    $('rangeHi').value = S.hi;
    $('autoplay').checked = S.autoplay;
    rangeBefore = `${S.lo}-${S.hi}`;
    segRenderers.forEach((f) => f());
    dlg.showModal();
  };
  $('settingsBtn').addEventListener('click', openSettings);
  document.querySelectorAll('[data-open-settings]').forEach((b) => b.addEventListener('click', openSettings));
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
  $('rangeLo').addEventListener('change', (e) => {
    S.lo = Number(e.target.value);
    if (S.hi < S.lo + 12) S.hi = Math.min(RANGE_MAX, S.lo + 12);
    if (S.hi - S.lo < 12) S.lo = S.hi - 12;
    $('rangeLo').value = S.lo;
    $('rangeHi').value = S.hi;
    save();
  });
  $('rangeHi').addEventListener('change', (e) => {
    S.hi = Number(e.target.value);
    if (S.lo > S.hi - 12) S.lo = Math.max(RANGE_MIN, S.hi - 12);
    if (S.hi - S.lo < 12) S.hi = S.lo + 12;
    $('rangeLo').value = S.lo;
    $('rangeHi').value = S.hi;
    save();
  });
  $('autoplay').addEventListener('change', (e) => { S.autoplay = e.target.checked; save(); });
  dlg.addEventListener('close', () => {
    if (`${S.lo}-${S.hi}` !== rangeBefore) {
      randomQ.intervals = null;
      randomQ.chords = null;
    }
    render();
  });

  // Keyboard shortcuts (handy on a computer)
  document.addEventListener('keydown', (e) => {
    if (dlg.open || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.target.tagName === 'SELECT') return;
    const k = e.key.toLowerCase();
    if (k === ' ' || k === 'r') reveal();
    else if (k === 's' || k === 'g') playGiven();
    else if (k === 'b') playBoth();
    else if (k === 'arrowright' || k === 'n') step(1);
    else if (k === 'arrowleft' || k === 'p') { if (S.mode === 'guided') step(-1); }
    else return;
    e.preventDefault();
  });

  $('micBtn').addEventListener('click', () => meter.toggle());

  // Every tap makes sure audio is alive (iOS needs a user gesture to start or rebuild it),
  // and brings the mic back if the pitch bar was on before the app was left.
  document.addEventListener(
    'pointerdown',
    (e) => {
      audio.unlock();
      if (!e.target.closest('#micBtn')) meter.resumeIfNeeded();
    },
    true
  );
  const sleep = () => {
    audio.sleep();
    meter.pause();
  };
  document.addEventListener('visibilitychange', () => { if (document.hidden) sleep(); });
  window.addEventListener('pagehide', sleep);

  new ResizeObserver(() => Q && drawPiano()).observe(svg.parentElement);

  render();
  scrollChipIntoView();

  const status = $('status');
  status.textContent = 'Loading piano…';
  audio
    .load((done, total) => {
      status.textContent = done < total ? `Loading piano ${Math.round((done / total) * 100)}%` : '';
    })
    .then(({ loaded }) => {
      status.textContent = loaded ? '' : 'Offline · basic sound';
    });

  const secure = location.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(location.hostname);
  if ('serviceWorker' in navigator && secure) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

setup();
