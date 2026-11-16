// Pitch bar: listens to the microphone and shows how far the sung note is from the target.
// The middle line of the bar is the target. The level rises as you sing higher, so it sits
// above the line when you're sharp and below it when you're flat.

import { detectPitch, freqToMidi } from './pitch.js';

const RANGE_CENTS = 100; // the bar shows ±1 semitone; beyond that the level pins to the end
const IN_TUNE_CENTS = 15;
const SILENCE_FRAMES = 8; // ~0.25 s without a voice → idle

const PLAIN_PC = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
const plainName = (m) => PLAIN_PC[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);

const median = (arr) => {
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

export class PitchMeter {
  /**
   * audio: PianoAudio
   * els: { stage, meter, fill, target, read, sung, button, status }
   * getTargets: () => [{ midi, name }]
   * onTrack: (midi | null) => void   highlights the key being compared
   */
  constructor(audio, els, getTargets, onTrack) {
    this.audio = audio;
    this.els = els;
    this.getTargets = getTargets;
    this.onTrack = onTrack;
    this.wanted = false;
    this.stream = null;
    this.nodes = [];
    this.analyser = null;
    this.raf = 0;
    this.frame = 0;
    this.history = [];
    this.shown = null;
    this.silent = SILENCE_FRAMES;
    this.loop = this.loop.bind(this);
  }

  get live() {
    return !!this.stream && this.stream.getAudioTracks().some((t) => t.readyState === 'live');
  }

  toggle() {
    if (this.wanted) this.stop();
    else this.start();
  }

  async start() {
    this.wanted = true;
    this.setState('starting');
    if (!navigator.mediaDevices?.getUserMedia) {
      this.fail('The pitch bar needs the https:// link');
      return;
    }
    this.audio.setSession('play-and-record');
    this.audio.unlock();
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
    } catch (e) {
      this.fail(e && e.name === 'NotAllowedError' ? 'Microphone access was blocked' : 'No microphone found');
      return;
    }
    if (!this.wanted) {
      stream.getTracks().forEach((t) => t.stop());
      return;
    }
    this.stream = stream;
    stream.getAudioTracks().forEach((t) => t.addEventListener('ended', () => this.pause()));
    this.attach();
    this.setState('idle');
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(this.loop);
  }

  // (Re)connect the mic to the current audio context; called again when iOS forces a new one.
  attach() {
    if (!this.stream) return;
    this.disconnect();
    const ctx = this.audio.ctx;
    const src = ctx.createMediaStreamSource(this.stream);
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 55;
    const lp = ctx.createBiquadFilter(); // cuts hiss above the voice; keeps detection steady
    lp.type = 'lowpass';
    lp.frequency.value = 1500;
    const an = ctx.createAnalyser();
    an.fftSize = 2048;
    const mute = ctx.createGain(); // keeps the graph running without playing the mic aloud
    mute.gain.value = 0;
    src.connect(hp).connect(lp).connect(an).connect(mute).connect(ctx.destination);
    this.nodes = [src, hp, lp, an, mute];
    this.analyser = an;
    this.sampleRate = ctx.sampleRate;
    this.buf = new Float32Array(an.fftSize);
  }

  disconnect() {
    this.nodes.forEach((n) => {
      try {
        n.disconnect();
      } catch {}
    });
    this.nodes = [];
    this.analyser = null;
  }

  release() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    if (this.stream) this.stream.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.disconnect();
    this.history = [];
    this.shown = null;
    this.onTrack(null);
  }

  stop() {
    this.wanted = false;
    this.release();
    this.audio.setSession('playback');
    this.setState('off');
  }

  // App went to the background (or iOS took the mic): let go of the mic, resume on next tap.
  pause() {
    if (!this.wanted || !this.stream) return;
    this.release();
    this.setState('paused');
  }

  resumeIfNeeded() {
    if (this.wanted && !this.live) this.start();
  }

  fail(message) {
    this.wanted = false;
    this.release();
    this.audio.setSession('playback');
    this.setState('off');
    this.els.status.textContent = message;
    setTimeout(() => {
      if (this.els.status.textContent === message) this.els.status.textContent = '';
    }, 4000);
  }

  loop() {
    this.raf = requestAnimationFrame(this.loop);
    if (!this.analyser || this.frame++ % 2) return; // ~30 readings a second

    if (this.audio.isBusy()) {
      // Ignore the piano coming back through the mic.
      this.history = [];
      this.shown = null;
      this.silent = SILENCE_FRAMES;
      this.setState('muted');
      this.onTrack(null);
      return;
    }

    this.analyser.getFloatTimeDomainData(this.buf);
    const p = detectPitch(this.buf, this.sampleRate);
    if (!p) {
      if (++this.silent >= SILENCE_FRAMES) {
        this.history = [];
        this.shown = null;
        this.setState('idle');
        this.onTrack(null);
      }
      return;
    }
    this.silent = 0;

    // Median of the last few readings rejects one-off glitches; easing keeps the level smooth.
    this.history.push(freqToMidi(p.freq));
    if (this.history.length > 5) this.history.shift();
    const m = median(this.history);
    this.shown = this.shown == null || Math.abs(m - this.shown) > 0.7 ? m : this.shown + (m - this.shown) * 0.45;
    this.show(this.shown);
  }

  show(sung) {
    const targets = this.getTargets();
    if (!targets.length) return;
    let target = targets[0];
    for (const t of targets) if (Math.abs(sung - t.midi) < Math.abs(sung - target.midi)) target = t;
    const cents = (sung - target.midi) * 100;
    const clamped = Math.max(-RANGE_CENTS, Math.min(RANGE_CENTS, cents));
    const { fill, target: targetEl, read, sung: sungEl, meter } = this.els;

    fill.style.height = `${50 + (clamped / RANGE_CENTS) * 50}%`;
    targetEl.textContent = target.name;
    const sign = cents > 0.5 ? '+' : cents < -0.5 ? '−' : '';
    const abs = Math.abs(cents);
    if (abs <= RANGE_CENTS) read.textContent = `${sign}${Math.round(abs)}¢`;
    else {
      const st = abs / 100;
      read.textContent = `${sign}${st < 2 ? st.toFixed(1) : Math.round(st)} st`;
    }
    sungEl.textContent = plainName(Math.round(sung));
    meter.dataset.pin = cents > RANGE_CENTS ? 'high' : cents < -RANGE_CENTS ? 'low' : '';
    this.setState(abs <= IN_TUNE_CENTS ? 'good' : 'live');
    this.onTrack(target.midi);
  }

  setState(state) {
    const { stage, meter, button, read, sung, fill, status } = this.els;
    const on = state !== 'off';
    stage.classList.toggle('with-meter', on);
    meter.hidden = !on;
    button.setAttribute('aria-pressed', String(on));
    if (meter.dataset.state === state) return;
    meter.dataset.state = state;
    if (state !== 'live' && state !== 'good') {
      meter.dataset.pin = '';
      sung.textContent = '';
      if (state !== 'idle') fill.style.height = '50%';
      read.textContent = { starting: '…', paused: '❚❚', muted: '♪', idle: '—' }[state] || '';
      const targets = this.getTargets();
      if (targets.length) this.els.target.textContent = targets[0].name;
    }
    if (state === 'paused') status.textContent = 'Tap anywhere to resume mic';
    else if (status.textContent === 'Tap anywhere to resume mic') status.textContent = '';
  }

  // The question changed: refresh the target label.
  refresh() {
    if (!this.wanted) return;
    const targets = this.getTargets();
    if (targets.length && this.shown == null) this.els.target.textContent = targets[0].name;
  }
}
