// Hermetic tests for the ported DSP core — run: node tests/dsp.test.mjs
// Expectations mirror the original repo's tests/dsp.test.mjs.

import assert from "node:assert/strict";
import {
  bandFromMarks,
  clampFreq,
  fmtHz,
  fmtK,
  freqToX,
  xToFreq,
  magnitudeDb,
  responseDb,
  autoPreamp,
  coeffs,
  MAJOR_TICKS,
} from "../src/lib/dsp.ts";

// --- bandFromMarks (same case as the site's SPEC acceptance #4) -------------
{
  const spec = bandFromMarks({ kind: "peak", start: 2500, top: 3100, end: 3750 });
  assert.equal(spec.type, "PK");
  assert.equal(spec.fc, 3100);
  assert.equal(spec.gain, -3);
  assert.equal(spec.q, 2.5); // 3100 / 1250 clamped to 0.05 steps
}
{
  const spec = bandFromMarks({ kind: "dip", start: null, top: 500, end: null });
  assert.equal(spec.fc, 500);
  assert.equal(spec.gain, 3); // dip -> +3 dB boost to counter a valley
  assert.equal(spec.q, 2.0); // no edges -> default Q
}
{
  const spec = bandFromMarks({ kind: "peak", start: 2000, top: null, end: 18000 });
  assert.equal(spec.fc, 6000); // sqrt(2000*18000)
  assert.ok(spec.q >= 0.3 && spec.q <= 10);
}
assert.equal(bandFromMarks({ kind: "peak", start: 100, top: null, end: null }), null);

// --- axis mapping -----------------------------------------------------------
assert.equal(freqToX(20, 1000), 0);
assert.equal(freqToX(20000, 1000), 1000);
assert.ok(Math.abs(freqToX(1000, 1000) - 566.3233) < 0.5); // ln(50)/ln(1000) = 56.63%
assert.ok(Math.abs(xToFreq(freqToX(1000, 1000), 1000) - 1000) < 1e-9); // roundtrip
assert.ok(Math.abs((xToFreq(freqToX(3100, 1000), 1000) - 3100) / 3100) < 1e-9);
assert.equal(clampFreq(5), 20);
assert.equal(clampFreq(Infinity), 1000); // non-finite falls back, like the site

// --- RBJ coefficients vs the reference (peaking at 1 kHz, gain -3, Q 2.5) ---
{
  const c = coeffs({ type: "PK", fc: 1000, gain: -3, q: 2.5 });
  const b0r = 1 + (Math.sin((2 * Math.PI * 1000) / 48000) / (2 * 2.5)) * Math.pow(10, -3 / 40);
  assert.ok(Math.abs(c.b0 - b0r) < 1e-9);
}
{
  // A -3 dB peaking at fc should actually give -3 dB there.
  const db = magnitudeDb({ type: "PK", fc: 1000, gain: -3, q: 2.5 }, 1000);
  assert.ok(Math.abs(db + 3) < 0.02, `got ${db}`);
}
{
  // Sum of a boost and a cut at the same point is not additive; just sanity.
  const b = [
    { type: "PK", fc: 100, gain: 6, q: 1, enabled: true },
    { type: "PK", fc: 100, gain: -6, q: 1, enabled: true },
  ];
  const at = responseDb(b, 100);
  assert.ok(Math.abs(at) < 0.5);
}

// --- helpers ----------------------------------------------------------------
assert.equal(fmtHz(3100), "3 100");
assert.equal(fmtHz(100), "100");
assert.equal(fmtK(2500), "2.5k");
assert.equal(fmtK(20000), "20k");
assert.equal(fmtK(105), "105");
assert.deepEqual([...MAJOR_TICKS], [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000]);

// --- autoPreamp -------------------------------------------------------------
assert.equal(autoPreamp([{ type: "PK", fc: 100, gain: 6.5, q: 1, enabled: true }]), -6.5);
assert.equal(
  autoPreamp([
    { type: "PK", fc: 100, gain: 2, q: 1, enabled: true },
    { type: "PK", fc: 100, gain: 5.2, q: 1, enabled: false },
  ]),
  -2
);
assert.equal(autoPreamp([]), -0);

console.log("dsp.test.mjs — all passed");
process.exit(0);
