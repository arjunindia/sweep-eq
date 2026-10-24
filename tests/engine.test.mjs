// WebView audio engine tests — run: node tests/engine.test.mjs
// Loads ENGINE_JS inside a stubbed Web Audio environment and exercises the
// command protocol: build, play/stop fades, frequency glide, EQ application,
// and the hard clipper curve.

import assert from "node:assert/strict";
import { ENGINE_JS } from "../src/audio/engineSource.ts";

// ---- Web Audio stubs -------------------------------------------------------

class AudioParam {
  constructor() {
    this.value = 0;
    this.events = [];
  }
  setValueAtTime(v) {
    this.events.push({ type: "set", v });
    this.value = v;
  }
  linearRampToValueAtTime(v, t) {
    this.events.push({ type: "linRamp", v, t });
    this.value = v;
  }
  exponentialRampToValueAtTime(v, t) {
    this.events.push({ type: "expRamp", v, t });
    this.value = v;
  }
  setTargetAtTime(v, t, tc) {
    this.events.push({ type: "target", v, t, tc });
    this.value = v;
  }
  cancelScheduledValues() {
    this.events.push({ type: "cancel" });
  }
}

class Node {
  constructor(ctx) {
    this.ctx = ctx;
    this.inputs = [];
    this.outputs = [];
  }
  connect(target) {
    this.outputs.push(target);
    target.inputs.push(this);
    return target;
  }
}

class AudioContext {
  constructor() {
    this.destination = new Node(this);
    this.currentTime = 0;
    this.state = "running";
  }
  createOscillator() {
    const o = new Node(this);
    o.type = "";
    o.frequency = new AudioParam();
    o.start = () => {
      o.started = true;
    };
    return o;
  }
  createGain() {
    const g = new Node(this);
    g.gain = new AudioParam();
    return g;
  }
  createBiquadFilter() {
    const b = new Node(this);
    b.type = "";
    b.frequency = new AudioParam();
    b.Q = new AudioParam();
    b.gain = new AudioParam();
    return b;
  }
  createWaveShaper() {
    const w = new Node(this);
    w.curve = null;
    w.oversample = "";
    return w;
  }
  resume() {
    this.state = "running";
    return Promise.resolve();
  }
}

function boot(Ctor = AudioContext) {
  const events = [];
  const win = {
    AudioContext: Ctor,
    ReactNativeWebView: {
      postMessage: (s) => events.push(JSON.parse(s)),
    },
  };
  Function("window", `"use strict";\n${ENGINE_JS}`)(win);
  return { win, events, engine: win.__engine };
}

function findNode(ctx, predicate) {
  const seen = new Set();
  const stack = [ctx.destination];
  while (stack.length) {
    const n = stack.pop();
    if (!n || seen.has(n)) continue;
    seen.add(n);
    if (predicate(n) && n !== ctx.destination) return n;
    for (const i of n.inputs) stack.push(i);
  }
  return null;
}

// ---- protocol --------------------------------------------------------------

{
  const { events, engine } = boot();
  assert.ok(engine, "window.__engine exists");
  assert.equal(events[0].ev, "ready");

  // commands with no context built are safe no-ops (desired state kept)
  engine.handle({ cmd: "play" });
  engine.handle({ cmd: "freq", hz: 440 });
  engine.handle({ cmd: "level", db: -20 });
  engine.handle({ cmd: "eq", bands: [{ t: "PK", f: 1000, g: -3, q: 2.5, e: true }], eqOn: true, preampDb: 0 });
  engine.handle({ cmd: "probe" });
  assert.equal(events[events.length - 1].ev, "pong");

  engine.handle({ cmd: "start" });
  // the ctx event arrives on the resume() microtask, so yield once
  await new Promise((r) => setImmediate(r));
  assert.ok(events.some((e) => e.ev === "ctx" && e.state === "running"));
}

// ---- graph build -----------------------------------------------------------

{
  const ctxs = [];
  class AC extends AudioContext {
    constructor() {
      super();
      ctxs.push(this);
    }
  }
  const { engine: E } = boot(AC);
  E.handle({ cmd: "start" });
  assert.equal(ctxs.length, 1);
  const ctx = ctxs[0];

  const osc = findNode(ctx, (n) => n.frequency && n.started);
  assert.ok(osc, "oscillator built and started");
  assert.equal(osc.type, "sine");
  assert.equal(osc.frequency.events[0].type, "set");
  assert.equal(osc.frequency.events[0].v, 1000);

  // hard clipper curve: identity near zero, clamped at ±0.5, 4097 points
  const shaper = findNode(ctx, (n) => n.curve);
  assert.ok(shaper, "waveshaper in the chain");
  assert.equal(shaper.curve.length, 4097);
  assert.equal(shaper.curve[0], -0.5);
  assert.equal(shaper.curve[shaper.curve.length - 1], 0.5);
  assert.ok(Math.abs(shaper.curve[shaper.curve.length >> 1]) < 0.01);
}

// ---- envelopes -------------------------------------------------------------

{
  const ctxs = [];
  class AC extends AudioContext {
    constructor() {
      super();
      ctxs.push(this);
    }
  }
  const { engine: E } = boot(AC);
  E.handle({ cmd: "start" });
  const ctx = ctxs[0];
  const osc = findNode(ctx, (n) => n.frequency && n.started);
  assert.ok(osc, "oscillator built");
  const chain = [];
  let n = osc;
  for (let i = 0; i < 16 && n.outputs.length; i++) {
    n = n.outputs[0];
    chain.push(n);
  }
  // chain = toneGain, preamp, bq0..bq7, levelGain, ceiling, clipper, destination
  const toneGain = chain[0];
  assert.ok(toneGain && toneGain.gain, "toneGain wired first after osc");
  const biquads = []; // chain.slice(2, 10)
  for (let i = 2; i < 10; i++) assert.ok(chain[i].Q, `biquad at slot ${i}`);
  biquads.push(...chain.slice(2, 10));
  const levelGain = chain[10];
  assert.ok(levelGain && levelGain.gain, "levelGain after biquads");
  const preamp = chain[1];
  assert.ok(preamp.gain, "preamp before biquads");

  E.handle({ cmd: "play" });
  const last = toneGain.gain.events[toneGain.gain.events.length - 1];
  assert.equal(last.type, "linRamp");
  assert.equal(last.v, 1);
  assert.equal(last.t, 0.015);

  E.handle({ cmd: "freq", hz: 440 });
  // continuous glide: an exponential approach on the oscillator frequency
  // (consecutive targets continue from the current moving value).
  const fe = osc.frequency.events.at(-1);
  assert.equal(fe.type, "target");
  assert.equal(fe.v, 440);
  assert.equal(fe.tc, 0.012); // first target of a session: minimum glide

  // release settles quickly onto the final value
  E.handle({ cmd: "freq", hz: 8000, snap: true });
  const snap = osc.frequency.events.at(-1);
  assert.equal(snap.type, "target");
  assert.equal(snap.v, 8000);
  assert.equal(snap.tc, 0.005);

  // adaptive glide: sparse updates stretch the time constant (40% of the gap,
  // capped) so a jittery bridge still sounds like a sweep, not a staircase.
  const near = (a, b) => Math.abs(a - b) < 1e-9;
  ctx.currentTime = 0.25;
  E.handle({ cmd: "freq", hz: 500 });
  assert.ok(near(osc.frequency.events.at(-1).tc, 0.012));
  ctx.currentTime = 0.3; // 50 ms gap
  E.handle({ cmd: "freq", hz: 600 });
  assert.ok(near(osc.frequency.events.at(-1).tc, 0.02));
  ctx.currentTime = 0.6; // > 200 ms pause: a new gesture, snappy again
  E.handle({ cmd: "freq", hz: 650 });
  assert.ok(near(osc.frequency.events.at(-1).tc, 0.012));
  ctx.currentTime = 0.7; // 100 ms gap
  E.handle({ cmd: "freq", hz: 700 });
  assert.ok(near(osc.frequency.events.at(-1).tc, 0.04));

  E.handle({ cmd: "stop" });
  const stop = toneGain.gain.events[toneGain.gain.events.length - 1];
  assert.equal(stop.type, "linRamp");
  assert.equal(stop.v, 0);

  E.handle({ cmd: "level", db: -12 });
  const lev = levelGain.gain.events[levelGain.gain.events.length - 1];
  assert.equal(lev.type, "target");
  assert.ok(Math.abs(lev.v - Math.pow(10, -12 / 20)) < 1e-9);

  // ---- eq application ----
  E.handle({
    cmd: "eq",
    bands: [
      { t: "PK", f: 3100, g: -3, q: 2.5, e: true },
      { t: "HSC", f: 6000, g: 2, q: 0.7, e: true },
    ],
    eqOn: true,
    preampDb: -2,
  });
  assert.equal(biquads[0].type, "peaking");
  assert.equal(biquads[0].frequency.events.at(-1).v, 3100);
  assert.equal(biquads[0].gain.events.at(-1).v, -3);
  assert.equal(biquads[1].type, "highshelf");
  assert.equal(biquads[1].frequency.events.at(-1).v, 6000);
  for (let i = 2; i < 8; i++) {
    assert.equal(biquads[i].type, "peaking", `slot ${i} flat`);
    assert.equal(biquads[i].gain.events.at(-1).v, 0);
  }
  assert.ok(Math.abs(preamp.gain.events.at(-1).v - Math.pow(10, -2 / 20)) < 1e-9);

  // eqOn=false flattens everything and drops the preamp to unity
  E.handle({ cmd: "eq", bands: [], eqOn: false, preampDb: 0 });
  for (const bq of biquads) assert.equal(bq.gain.events.at(-1).v, 0);
  assert.ok(Math.abs(preamp.gain.events.at(-1).v - 1) < 1e-9);
}

{
  // the old block-4 checks stay: 8 biquads exist behind levelGain path
  const ctxs = [];
  class AC extends AudioContext {
    constructor() {
      super();
      ctxs.push(this);
    }
  }
  const { engine: E } = boot(AC);
  E.handle({ cmd: "start" });
  const ctx = ctxs[0];
  const osc = findNode(ctx, (n) => n.frequency && n.started);
  const chain = [];
  let n = osc;
  for (let i = 0; i < 16 && n.outputs.length; i++) {
    n = n.outputs[0];
    chain.push(n);
  }
  const biquads = chain.filter((x) => x.Q);
  assert.equal(biquads.length, 8, `8 biquads, got ${biquads.length}`);
}

console.log("engine.test.mjs — all passed");
process.exit(0);
