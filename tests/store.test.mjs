// Store behaviour tests — run: node tests/store.test.mjs

import assert from "node:assert/strict";
import { createStore } from "../src/lib/store.ts";

function fresh() {
  return createStore(null);
}

{
  const s = fresh();
  assert.equal(s.get().freq, 1000);
  assert.equal(s.get().levelDb, -18);
  assert.equal(s.get().eqOn, true);
  assert.deepEqual(s.get().bands, []);

  let seen = 0;
  s.subscribe(() => {
    seen++;
  });
  s.setFreq("500");
  assert.equal(s.get().freq, 500);
  s.setFreq(500); // no change -> no emit
  assert.equal(seen, 1);
}

// marks -> auto-commit -> undo semantics
{
  const s = fresh();
  s.setFreq(2500); s.mark("start");
  s.setFreq(3100); s.mark("top");
  assert.equal(s.get().bands.length, 0);
  s.setFreq(3750); s.mark("end"); // third mark commits automatically
  assert.equal(s.get().bands.length, 1);
  const b = s.get().bands[0];
  assert.equal(b.fc, 3100);
  assert.equal(b.gain, -3);
  assert.equal(b.q, 2.5);
  assert.equal(s.get().selectedId, b.id);
  assert.deepEqual(s.get().draft, { kind: "peak", start: null, top: null, end: null });

  s.undo(); // draft empty -> removes newest band
  assert.equal(s.get().bands.length, 0);
  assert.equal(s.get().selectedId, null);
}

// top-only draft commits via commitDraft (the "Add band" affordance)
{
  const s = fresh();
  s.setFreq(440);
  s.mark("top");
  s.commitDraft();
  assert.equal(s.get().bands.length, 1);
  assert.equal(s.get().bands[0].fc, 440);
}

// cap at 8 with refusal
{
  const s = fresh();
  for (let i = 0; i < 8; i++) {
    s.setFreq(100 * (i + 1));
    s.mark("top");
    s.commitDraft();
  }
  assert.equal(s.get().bands.length, 8);
  s.setFreq(1000);
  s.mark("start");
  s.mark("top");
  s.mark("end"); // auto-commit refused, draft dropped
  assert.equal(s.get().bands.length, 8);
  assert.deepEqual(s.get().draft, { kind: "peak", start: null, top: null, end: null });
}

// updateBand clamps + rounding
{
  const s = fresh();
  s.mark("top");
  s.commitDraft();
  const id = s.get().bands[0].id;
  s.updateBand(id, { fc: 99999, gain: 100, q: 0.001 });
  const b = s.get().bands[0];
  assert.equal(b.fc, 20000);
  assert.equal(b.gain, 24);
  assert.equal(b.q, 0.1);
  s.removeBand(id);
  assert.equal(s.get().bands.length, 0);
}

// preamp auto vs manual
{
  const s = fresh();
  s.setFreq(200);
  s.setDraftKind("dip");
  s.mark("top");
  s.commitDraft();
  assert.equal(s.get().preampDb, -3); // dip created +3 boost
  assert.equal(s.get().preampAuto, true);
  s.setPreamp(-1.5);
  assert.equal(s.get().preampAuto, false);
  assert.equal(s.get().preampDb, -1.5);
  s.setPreampAuto();
  assert.equal(s.get().preampDb, -3);
  assert.equal(s.get().preampAuto, true);
}

// load validation never throws and clamps
{
  const s = fresh();
  s.load({ version: 1, freq: "300", levelDb: 50, bands: [{ fc: "440", gain: 3, q: 0.7 }], nonsense: 1 });
  assert.equal(s.get().freq, 300);
  assert.equal(s.get().levelDb, -6); // clamped into [-60,-6]
  assert.equal(s.get().bands.length, 1);
  assert.equal(s.get().bands[0].fc, 440);
  s.load(null);
  assert.equal(s.get().bands.length, 0);
}

// theme pref round-trips
{
  const s = fresh();
  s.setThemePref("dark");
  assert.equal(s.get().themePref, "dark");
  s.setThemePref("weird");
  assert.equal(s.get().themePref, "system");
}

console.log("store.test.mjs — all passed");
process.exit(0);
