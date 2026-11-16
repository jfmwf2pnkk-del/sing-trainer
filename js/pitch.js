// Monophonic pitch detection (YIN, de Cheveigné & Kawahara 2002).
// Returns { freq, clarity, rms } for a voiced frame, or null for silence/noise.

let scratch = new Float32Array(0);

export function detectPitch(buf, sampleRate, { minFreq = 60, maxFreq = 1200, threshold = 0.15, minRms = 0.006 } = {}) {
  const n = buf.length;
  let sum = 0;
  for (let i = 0; i < n; i++) sum += buf[i] * buf[i];
  const rms = Math.sqrt(sum / n);
  if (rms < minRms) return null;

  const tauMin = Math.max(2, Math.floor(sampleRate / maxFreq));
  const tauMax = Math.min(Math.floor(sampleRate / minFreq), Math.floor(n / 2));
  const w = n - tauMax;
  if (scratch.length < tauMax + 2) scratch = new Float32Array(tauMax + 2);
  const d = scratch;

  // Difference function
  d[0] = 0;
  for (let tau = 1; tau <= tauMax + 1 && tau < n - w + 1; tau++) {
    let s = 0;
    for (let j = 0; j < w; j++) {
      const diff = buf[j] - buf[j + tau];
      s += diff * diff;
    }
    d[tau] = s;
  }

  // Cumulative mean normalised difference
  d[0] = 1;
  let running = 0;
  for (let tau = 1; tau <= tauMax; tau++) {
    running += d[tau];
    d[tau] = running > 0 ? (d[tau] * tau) / running : 1;
  }

  // First dip under the threshold, then walk to its bottom
  let tau = -1;
  for (let t = tauMin; t <= tauMax; t++) {
    if (d[t] < threshold) {
      while (t + 1 <= tauMax && d[t + 1] < d[t]) t++;
      tau = t;
      break;
    }
  }
  if (tau < 0) return null;

  // Parabolic interpolation for sub-sample accuracy
  let better = tau;
  if (tau > 1 && tau < tauMax) {
    const a = d[tau - 1];
    const b = d[tau];
    const c = d[tau + 1];
    const denom = a - 2 * b + c;
    if (denom !== 0) better = tau + (a - c) / (2 * denom);
  }
  return { freq: sampleRate / better, clarity: 1 - d[tau], rms };
}

export const freqToMidi = (f) => 69 + 12 * Math.log2(f / 440);
