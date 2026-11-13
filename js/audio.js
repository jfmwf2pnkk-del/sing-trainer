// Piano playback with the Web Audio API.
// Uses Salamander Grand Piano samples (CC-BY 3.0, Alexander Holm) hosted by Tone.js,
// pitch-shifting the nearest sample. Falls back to a simple synth until samples load.

const SAMPLE_BASE = 'https://tonejs.github.io/audio/salamander/';
const SAMPLE_NAMES = [
  'A0', 'C1', 'Ds1', 'Fs1', 'A1', 'C2', 'Ds2', 'Fs2', 'A2', 'C3', 'Ds3', 'Fs3',
  'A3', 'C4', 'Ds4', 'Fs4', 'A4', 'C5', 'Ds5', 'Fs5', 'A5', 'C6', 'Ds6', 'Fs6',
  'A6', 'C7', 'Ds7', 'Fs7', 'A7', 'C8',
];

function sampleMidi(name) {
  const m = name.match(/^([A-G])(s?)(\d)$/);
  const pc = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1]] + (m[2] ? 1 : 0);
  return 12 * (Number(m[3]) + 1) + pc;
}

export class PianoAudio {
  constructor() {
    this.ctx = null;
    this.samples = []; // { midi, buffer }
    this.voices = new Set();
    this.timers = [];
    this.onSound = () => {};
  }

  init() {
    if (this.ctx) return;
    // Lets sound play with the iPhone ringer switch on silent (iOS 17+).
    try {
      if (navigator.audioSession) navigator.audioSession.type = 'playback';
    } catch {}
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AC({ latencyHint: 'interactive' });
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.85;
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    this.master.connect(comp).connect(this.ctx.destination);
  }

  // Call from inside a tap/click handler: iOS only starts audio on a user gesture.
  unlock() {
    this.init();
    if (this.ctx.state !== 'running') this.ctx.resume().catch(() => {});
  }

  async load(onProgress = () => {}) {
    this.init();
    // Load the singing range first so the piano is usable quickly.
    const order = [...SAMPLE_NAMES].sort(
      (a, b) => Math.abs(sampleMidi(a) - 57) - Math.abs(sampleMidi(b) - 57)
    );
    let done = 0;
    let failed = 0;
    await Promise.all(
      order.map(async (name) => {
        try {
          const res = await fetch(SAMPLE_BASE + name + '.mp3', { mode: 'cors' });
          if (!res.ok) throw new Error(res.status);
          const data = await res.arrayBuffer();
          const buffer = await this.ctx.decodeAudioData(data);
          this.samples.push({ midi: sampleMidi(name), buffer });
        } catch {
          failed++;
        }
        done++;
        onProgress(done, order.length, failed);
      })
    );
    return { loaded: this.samples.length, failed };
  }

  nearest(midi) {
    let best = null;
    for (const s of this.samples) {
      if (!best || Math.abs(s.midi - midi) < Math.abs(best.midi - midi)) best = s;
    }
    return best && Math.abs(best.midi - midi) <= 6 ? best : null;
  }

  voice(midi, t, dur, vel = 0.9) {
    const ctx = this.ctx;
    const gain = ctx.createGain();
    gain.connect(this.master);
    const sample = this.nearest(midi);
    const sources = [];
    if (sample) {
      const src = ctx.createBufferSource();
      src.buffer = sample.buffer;
      src.playbackRate.value = Math.pow(2, (midi - sample.midi) / 12);
      src.connect(gain);
      gain.gain.setValueAtTime(vel, t);
      gain.gain.setValueAtTime(vel, t + dur);
      gain.gain.setTargetAtTime(0, t + dur, 0.12);
      sources.push(src);
    } else {
      // Fallback: a few decaying harmonics, roughly piano-like.
      const f = 440 * Math.pow(2, (midi - 69) / 12);
      [[1, 0.6], [2, 0.22], [3, 0.1], [4, 0.05]].forEach(([h, a]) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.frequency.value = f * h;
        g.gain.value = a;
        o.connect(g).connect(gain);
        sources.push(o);
      });
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(vel * 0.5, t + 0.008);
      gain.gain.setTargetAtTime(vel * 0.12, t + 0.01, 0.5);
      gain.gain.setTargetAtTime(0, t + dur, 0.1);
    }
    const end = t + dur + 0.9;
    const v = { gain, sources };
    sources.forEach((s) => {
      s.start(t);
      s.stop(end);
    });
    sources[0].onended = () => {
      gain.disconnect();
      this.voices.delete(v);
    };
    this.voices.add(v);
  }

  stop() {
    this.timers.forEach(clearTimeout);
    this.timers = [];
    this.onSound(null, false);
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    for (const v of this.voices) {
      const g = v.gain.gain;
      if (g.cancelAndHoldAtTime) g.cancelAndHoldAtTime(now);
      else g.cancelScheduledValues(now);
      g.setTargetAtTime(0, now, 0.02);
      v.sources.forEach((s) => {
        try {
          s.stop(now + 0.15);
        } catch {}
      });
    }
    this.voices.clear();
  }

  // events: [{ midi, at (seconds from now), dur (seconds) }]
  play(events) {
    this.unlock();
    this.stop();
    const t0 = this.ctx.currentTime + 0.05;
    for (const e of events) {
      this.voice(e.midi, t0 + e.at, e.dur);
      this.timers.push(setTimeout(() => this.onSound(e.midi, true), (e.at + 0.05) * 1000));
      this.timers.push(
        setTimeout(() => this.onSound(e.midi, false), (e.at + 0.05 + Math.min(e.dur, 0.9)) * 1000)
      );
    }
  }
}
