// Pure DSP + axis math — a faithful TypeScript port of the original `js/dsp.js`
// (Apache-2.0, (c) DMS / eqbyear.com). No React, no DOM. The numbers match the
// website 1:1 so PEQ text and session files stay interchangeable.

export const FMIN = 20;
export const FMAX = 20000;
export const FS = 48000;

const LOG_RANGE = Math.log(FMAX / FMIN);

export function clampFreq(f: number): number {
  if (!Number.isFinite(f)) return 1000;
  return Math.min(FMAX, Math.max(FMIN, f));
}

export function freqToX(f: number, width: number): number {
  return (width * Math.log(clampFreq(f) / FMIN)) / LOG_RANGE;
}

export function xToFreq(x: number, width: number): number {
  const t = Math.min(1, Math.max(0, width === 0 ? 0 : x / width));
  return FMIN * Math.exp(t * LOG_RANGE);
}

// Slider position (0..1) <-> log frequency, for touch sliders.
export function freqToT(f: number): number {
  return Math.log(clampFreq(f) / FMIN) / LOG_RANGE;
}

export function tToFreq(t: number): number {
  return FMIN * Math.exp(Math.min(1, Math.max(0, t)) * LOG_RANGE);
}

export interface FilterBand {
  type: "PK" | "LSC" | "HSC";
  fc: number;
  gain: number;
  q: number;
  enabled?: boolean;
}

export interface Coeffs {
  b0: number;
  b1: number;
  b2: number;
  a0: number;
  a1: number;
  a2: number;
}

// RBJ Audio EQ Cookbook, Q form. Returns unnormalised coefficients.
export function coeffs(band: FilterBand): Coeffs {
  const A = Math.pow(10, band.gain / 40);
  const w0 = (2 * Math.PI * band.fc) / FS;
  const c = Math.cos(w0);
  const s = Math.sin(w0);
  const al = s / (2 * band.q);
  if (band.type === "PK") {
    return {
      b0: 1 + al * A,
      b1: -2 * c,
      b2: 1 - al * A,
      a0: 1 + al / A,
      a1: -2 * c,
      a2: 1 - al / A,
    };
  }
  const sa = 2 * Math.sqrt(A) * al;
  if (band.type === "LSC") {
    return {
      b0: A * ((A + 1) - (A - 1) * c + sa),
      b1: 2 * A * ((A - 1) - (A + 1) * c),
      b2: A * ((A + 1) - (A - 1) * c - sa),
      a0: (A + 1) + (A - 1) * c + sa,
      a1: -2 * ((A - 1) + (A + 1) * c),
      a2: (A + 1) + (A - 1) * c - sa,
    };
  }
  // HSC
  return {
    b0: A * ((A + 1) + (A - 1) * c + sa),
    b1: -2 * A * ((A - 1) + (A + 1) * c),
    b2: A * ((A + 1) + (A - 1) * c - sa),
    a0: (A + 1) - (A - 1) * c + sa,
    a1: 2 * ((A - 1) - (A + 1) * c),
    a2: (A + 1) - (A - 1) * c - sa,
  };
}

export function magnitudeDb(band: FilterBand, f: number): number {
  const { b0, b1, b2, a0, a1, a2 } = coeffs(band);
  const w = (2 * Math.PI * f) / FS;
  const cw = Math.cos(w);
  const sw = Math.sin(w);
  const c2w = Math.cos(2 * w);
  const s2w = Math.sin(2 * w);
  const nr = b0 + b1 * cw + b2 * c2w;
  const ni = -b1 * sw - b2 * s2w;
  const dr = a0 + a1 * cw + a2 * c2w;
  const di = -a1 * sw - a2 * s2w;
  const num = nr * nr + ni * ni;
  const den = dr * dr + di * di;
  return 10 * Math.log10(num / den);
}

export function responseDb(bands: FilterBand[], f: number): number {
  let sum = 0;
  for (const b of bands) if (b.enabled !== false) sum += magnitudeDb(b, f);
  return sum;
}

// Log-spaced sample frequencies for drawing curves.
export function sampleFreqs(n = 320): number[] {
  const out: number[] = new Array(n);
  for (let i = 0; i < n; i++) out[i] = FMIN * Math.pow(FMAX / FMIN, i / (n - 1));
  return out;
}

export interface DraftSpec {
  kind: "peak" | "dip";
  start: number | null;
  top: number | null;
  end: number | null;
}

export interface BandSpec {
  type: "PK";
  fc: number;
  gain: number;
  q: number;
}

// Three marks -> one peaking band. fc = top, or the geometric mean of the
// edges; Q = fc / |end - start| clamped; dips get a +3 dB boost to counter a
// valley, peaks a -3 dB cut.
export function bandFromMarks(draft: DraftSpec): BandSpec | null {
  const { start, top, end, kind } = draft;
  let fc: number;
  if (top != null) fc = top;
  else if (start != null && end != null) fc = Math.sqrt(start * end);
  else return null;
  let q = 2.0;
  if (start != null && end != null && Math.abs(end - start) > 0) {
    q = fc / Math.abs(end - start);
  }
  q = Math.min(10, Math.max(0.3, q));
  q = Math.round(q * 20) / 20;
  return { type: "PK", fc: Math.round(fc), gain: kind === "dip" ? 3 : -3, q };
}

export function autoPreamp(bands: FilterBand[]): number {
  let maxBoost = 0;
  for (const b of bands) {
    if (b.enabled !== false && b.gain > maxBoost) maxBoost = b.gain;
  }
  return -Math.round(maxBoost * 10) / 10;
}

// "3 100" with a normal space as thousands separator, integer Hz. (The site
// uses U+2009; Roboto on Android has no thin-space glyph, so we use a plain
// space here.)
export function fmtHz(f: number): string {
  const n = Math.round(f);
  const s = String(Math.abs(n));
  const parts: string[] = [];
  for (let i = s.length; i > 0; i -= 3) parts.unshift(s.slice(Math.max(0, i - 3), i));
  return (n < 0 ? "-" : "") + parts.join(" ");
}

// Tick labels: 105 -> "105", 2500 -> "2.5k", 20000 -> "20k".
export function fmtK(f: number): string {
  if (f >= 1000) {
    const v = f / 1000;
    return `${Number.isInteger(v) ? v : Number(v.toFixed(2))}k`;
  }
  return String(Math.round(f));
}

// -18 -> "−18 dB" (true minus sign for display).
export function fmtDb(db: number): string {
  const n = Math.round(db * 10) / 10;
  const s = Math.abs(n) % 1 === 0 ? String(Math.abs(n)) : Math.abs(n).toFixed(1);
  return `${n < 0 ? "\u2212" : ""}${s} dB`;
}

export const MAJOR_TICKS = [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000];
export const MINOR_TICKS = [30, 40, 60, 70, 80, 90, 300, 400, 600, 700, 800, 900, 3000, 4000, 6000, 7000, 8000, 9000];
