// PEQ text + session JSON tests — run: node tests/peqText.test.mjs
// Format parity with the original site is a hard requirement.

import assert from "node:assert/strict";
import { toPeqText, sessionToJson, sessionFromJson } from "../src/lib/PeqText.ts";
import { defaultState } from "../src/lib/store.ts";

{
  const s = defaultState();
  assert.equal(toPeqText(s), "Preamp: 0.0 dB");
}

{
  // disabled bands are omitted, sorted by fc, two decimals on Q
  const s = defaultState();
  s.preampDb = -2;
  s.preampAuto = false;
  s.bands = [
    { id: "a", type: "PK", fc: 3100, gain: -3, q: 2.5, enabled: true },
    { id: "b", type: "LSC", fc: 40, gain: 1.5, q: 0.71, enabled: false },
    { id: "c", type: "PK", fc: 60, gain: 2.04, q: 0.6, enabled: true },
  ];
  const want = [
    "Preamp: -2.0 dB",
    "Filter 1: ON PK Fc 60 Hz Gain 2.0 dB Q 0.60",
    "Filter 2: ON PK Fc 3100 Hz Gain -3.0 dB Q 2.50",
  ].join("\n");
  assert.equal(toPeqText(s), want);
}

{
  // session round trip
  const s = defaultState();
  s.bands = [{ id: "a", type: "PK", fc: 3100, gain: -3, q: 2.5, enabled: true }];
  s.selectedId = "a";
  s.bandLimit = 12;
  const json = sessionToJson(s);
  assert.equal(JSON.parse(json).bandLimit, 12);
  const text = sessionFromJson(json);
  const s2 = sessionToJson({ ...JSON.parse(json), playing: false });
  assert.equal(JSON.parse(s2).bands.length, 1);
  assert.ok(text.bands);
}

{
  // rejects garbage without throwing deeply
  assert.throws(() => sessionFromJson("{}"), /bands/);
  assert.throws(() => sessionFromJson("[]"), /session|band|Bands/i);
  assert.throws(() => sessionFromJson("not json"), SyntaxError);
  // the website's own session shape (no themePref) loads fine
  const web = {
    version: 1,
    freq: 1000,
    levelDb: -18,
    eqOn: true,
    preampDb: 0,
    preampAuto: true,
    bands: [{ id: "x", type: "PK", fc: 100, gain: 0, q: 1, enabled: true }],
    selectedId: null,
    draft: { kind: "peak", start: null, top: null, end: null },
    theme: "light",
  };
  assert.ok(sessionFromJson(JSON.stringify(web)));
}

console.log("peqText.test.mjs — all passed");
process.exit(0);
