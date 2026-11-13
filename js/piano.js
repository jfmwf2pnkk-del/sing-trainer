// SVG piano keyboard sized to its container, in CSS pixels.

const NS = 'http://www.w3.org/2000/svg';
const BLACK = new Set([1, 3, 6, 8, 10]);
const WHITE_PC = [0, 2, 4, 5, 7, 9, 11];
const PC_TO_WHITE = [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6];
const MIN_WHITES = 10;

const isBlack = (midi) => BLACK.has(((midi % 12) + 12) % 12);
const whiteIndex = (midi) => Math.floor(midi / 12) * 7 + PC_TO_WHITE[((midi % 12) + 12) % 12];
const whiteMidi = (w) => Math.floor(w / 7) * 12 + WHITE_PC[((w % 7) + 7) % 7];

function el(name, attrs, parent) {
  const e = document.createElementNS(NS, name);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(e);
  return e;
}

// Which white keys to draw: covers frame [lo, hi] with one key of padding each side,
// widened to at least MIN_WHITES keys.
function keyWindow(lo, hi) {
  let a = whiteIndex(lo) - 1;
  let b = whiteIndex(hi) + (isBlack(hi) ? 1 : 0) + 1;
  let grow = 0;
  while (b - a + 1 < MIN_WHITES) {
    if (grow++ % 2) a--;
    else b++;
  }
  return [a, b];
}

/**
 * opts: {
 *   frame: [loMidi, hiMidi]   keys that must be visible
 *   marks: [{ midi, role: 'given'|'target', label, order }]
 *   onKey: (midi) => void
 * }
 */
export function renderPiano(svg, opts) {
  const width = Math.max(240, Math.round(svg.parentElement.clientWidth));
  const [a, b] = keyWindow(opts.frame[0], opts.frame[1]);
  const n = b - a + 1;
  const ww = width / n;
  const wh = Math.round(Math.min(200, Math.max(130, width * 0.44), Math.max(108, window.innerHeight * 0.19)));
  const bw = ww * 0.6;
  const bh = wh * 0.62;
  const labelTop = wh + 8;
  const rowH = 20;

  const byMidi = new Map(opts.marks.map((m) => [m.midi, m]));
  const rows = [[]];
  const labels = [];
  // Stagger labels into rows so close notes don't overlap.
  [...opts.marks]
    .sort((x, y) => x.midi - y.midi)
    .forEach((m) => {
      const cx = keyCenter(m.midi, a, ww);
      const w = m.label.length * 8 + 10;
      let r = 0;
      while (rows[r] && rows[r].some((o) => Math.abs(o.cx - cx) < (o.w + w) / 2 + 2)) r++;
      if (!rows[r]) rows[r] = [];
      rows[r].push({ cx, w });
      labels.push({ ...m, cx, row: r });
    });
  const height = labelTop + rows.length * rowH + 2;

  svg.replaceChildren();
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('width', width);
  svg.setAttribute('height', height);

  const keys = el('g', { class: 'keys' }, svg);

  for (let w = a; w <= b; w++) {
    const midi = whiteMidi(w);
    const x = (w - a) * ww;
    const mark = byMidi.get(midi);
    const g = el('g', { class: 'key key-white' + (mark ? ' is-' + mark.role : ''), 'data-midi': midi }, keys);
    el('rect', { x: x + 0.5, y: 0.5, width: ww - 1, height: wh - 1, rx: Math.min(5, ww * 0.18) }, g);
    if (midi % 12 === 0) {
      el('text', { x: x + ww / 2, y: wh - 7, class: 'c-label' }, g).textContent = 'C' + (Math.floor(midi / 12) - 1);
    }
    if (mark && mark.order) orderDot(g, x + ww / 2, wh - 30, mark.order, Math.min(10, ww * 0.36));
  }

  for (let w = a; w < b; w++) {
    const midi = whiteMidi(w) + 1;
    if (!isBlack(midi)) continue;
    const x = (w - a + 1) * ww - bw / 2;
    const mark = byMidi.get(midi);
    const g = el('g', { class: 'key key-black' + (mark ? ' is-' + mark.role : ''), 'data-midi': midi }, keys);
    el('rect', { x, y: 0, width: bw, height: bh, rx: Math.min(3, bw * 0.15) }, g);
    if (mark && mark.order) orderDot(g, x + bw / 2, bh - 14, mark.order, Math.min(9, bw * 0.42));
  }

  for (const l of labels) {
    const y = labelTop + l.row * rowH;
    el('line', {
      x1: l.cx, x2: l.cx, y1: wh + 1, y2: y + 1,
      class: 'label-tick role-' + l.role,
    }, svg);
    el('text', { x: l.cx, y: y + 14, class: 'note-label role-' + l.role }, svg).textContent = l.label;
  }

  svg.onpointerdown = (e) => {
    const k = e.target.closest('.key');
    if (k && opts.onKey) {
      e.preventDefault();
      opts.onKey(Number(k.dataset.midi));
    }
  };
}

function keyCenter(midi, a, ww) {
  if (isBlack(midi)) return (whiteIndex(midi) - a + 1) * ww;
  return (whiteIndex(midi) - a + 0.5) * ww;
}

function orderDot(g, cx, cy, order, r) {
  el('circle', { cx, cy, r, class: 'order-dot' }, g);
  el('text', { x: cx, y: cy + r * 0.38, class: 'order-num', 'font-size': r * 1.15 }, g).textContent = order;
}

export function setSounding(svg, midi, on) {
  if (midi == null) {
    svg.querySelectorAll('.is-sounding').forEach((k) => k.classList.remove('is-sounding'));
    return;
  }
  const k = svg.querySelector(`.key[data-midi="${midi}"]`);
  if (k) k.classList.toggle('is-sounding', on);
}
