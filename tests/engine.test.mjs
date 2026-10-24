// WebView audio engine tests — run: node tests/engine.test.mjs
// Loads ENGINE_JS inside a stubbed Web Audio environment and exercises the
// command protocol: build, play/stop fades, frequency glide, EQ application,
// and the hard clipper curve.

import assert from "node:assert/strict";
import { ENGINE_JS } from "../src/audio/engineSource.ts";

const BAND_COUNT = 16;

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
  createMediaElementSource(el) {
    const n = new Node(this);
    n.mediaElement = el;
    return n;
  }
  resume() {
    this.state = "running";
    return Promise.resolve();
  }
}

class FakeAudioElement {
  constructor() {
    this.listeners = new Map();
    this.src = "";
    this.currentTime = 0;
    this.duration = 0;
    this.paused = true;
    this.ended = false;
    this.error = null;
    this.preload = "";
    this.crossOrigin = "";
    this.style = {};
    this.playCalls = 0;
  }
  addEventListener(type, fn) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(fn);
  }
  dispatch(type) {
    for (const fn of this.listeners.get(type) || []) fn({ type });
  }
  setAttribute() {}
  play() {
    this.playCalls += 1;
    this.paused = false;
    this.ended = false;
    this.dispatch("play");
    return Promise.resolve();
  }
  pause() {
    this.paused = true;
    this.dispatch("pause");
  }
  load() {
    this.currentTime = 0;
    this.duration = 0;
    this.paused = true;
    this.ended = false;
    this.dispatch("emptied");
  }
  finishLoad(duration = 30) {
    this.duration = duration;
    this.dispatch("loadedmetadata");
    this.dispatch("canplay");
  }
}

function boot(Ctor = AudioContext) {
  const events = [];
  const audioElements = [];
  const document = {
    createElement(tag) {
      assert.equal(tag, "audio");
      const el = new FakeAudioElement();
      audioElements.push(el);
      return el;
    },
    body: { appendChild() {} },
    documentElement: { appendChild() {} },
  };
  const win = {
    AudioContext: Ctor,
    ReactNativeWebView: {
      postMessage: (s) => events.push(JSON.parse(s)),
    },
    document,
  };
  Function("window", "document", `"use strict";\n${ENGINE_JS}`)(win, document);
  return { win, events, audioElements, engine: win.__engine, document };
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
  for (let i = 0; i < 24 && n.outputs.length; i++) {
    n = n.outputs[0];
    chain.push(n);
  }
  // chain = toneGain, preamp, bq0..bq15, bqOut, levelGain, ceiling, clipper, destination
  const toneGain = chain[0];
  assert.ok(toneGain && toneGain.gain, "toneGain wired first after osc");
  const biquads = []; // chain.slice(2, 18)
  for (let i = 2; i < 2 + BAND_COUNT; i++) assert.ok(chain[i].Q, `biquad at slot ${i}`);
  biquads.push(...chain.slice(2, 2 + BAND_COUNT));
  const bqOut = chain[2 + BAND_COUNT];
  const levelGain = chain[3 + BAND_COUNT];
  assert.ok(bqOut && bqOut.gain, "bqOut after biquads");
  assert.ok(levelGain && levelGain.gain, "levelGain after bqOut");
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
  for (let i = 2; i < BAND_COUNT; i++) {
    assert.equal(biquads[i].type, "peaking", `slot ${i} flat`);
    assert.equal(biquads[i].gain.events.at(-1).v, 0);
  }
  assert.ok(Math.abs(preamp.gain.events.at(-1).v - Math.pow(10, -2 / 20)) < 1e-9);

  // eqOn=false flattens everything and drops the preamp to unity
  E.handle({ cmd: "eq", bands: [], eqOn: false, preampDb: 0 });
  for (const bq of biquads) assert.equal(bq.gain.events.at(-1).v, 0);
  assert.ok(Math.abs(preamp.gain.events.at(-1).v - 1) < 1e-9);
}

// ---- song preview ----------------------------------------------------------

{
  const ctxs = [];
  class AC extends AudioContext {
    constructor() {
      super();
      ctxs.push(this);
    }
  }
  const { engine: E, events, audioElements } = boot(AC);
  E.handle({ cmd: "start" });
  const ctx = ctxs[0];
  const el = audioElements[0];
  assert.ok(el, "preview audio element created");
  assert.equal(el.crossOrigin, "anonymous");
  assert.equal(el.style.display, "none");

  const previewEvents = () => events.filter((e) => e.ev === "preview");
  const lastPreview = () => previewEvents().at(-1);

  // The media source joins the common preamp/biquad chain, then exits through
  // its own post-EQ gain (not the tone level control) into the shared ceiling.
  const osc = findNode(ctx, (n) => n.frequency && n.started);
  const preamp = osc.outputs[0].outputs[0];
  const source = findNode(ctx, (n) => n.mediaElement === el);
  assert.ok(source, "media element source exists");
  assert.equal(source.outputs[0], preamp, "preview enters the common preamp");

  const chain = [];
  let n = osc;
  for (let i = 0; i < 24 && n.outputs.length; i++) {
    n = n.outputs[0];
    chain.push(n);
  }
  const bqOut = chain[2 + BAND_COUNT];
  const levelGain = chain[3 + BAND_COUNT];
  const previewGain = bqOut.outputs.find((x) => x !== levelGain && x.gain);
  assert.ok(previewGain, "preview output gain after the biquads");
  assert.equal(previewGain.outputs[0], chain[4 + BAND_COUNT], "preview joins the ceiling");
  // The preview branch is post-biquad but must be muted unless a song is
  // playing; otherwise the tone bypasses levelGain through it.
  assert.equal(previewGain.gain.value, 0, "preview branch muted while idle");

  // A play request with no source is a friendly error, not a crash.
  E.handle({ cmd: "previewPlay" });
  assert.equal(lastPreview().status, "error");
  assert.match(lastPreview().message, /No preview loaded/);

  E.handle({ cmd: "previewLoad", url: "https://example.test/song.m4a" });
  assert.equal(el.src, "https://example.test/song.m4a");
  assert.equal(lastPreview().status, "loading");
  assert.equal(lastPreview().currentTime, 0);

  E.handle({ cmd: "previewPlay" });
  assert.equal(el.playCalls, 1);
  // Metadata resolves after the play request; the loading gate opens and the
  // element is already unpaused, so the engine reports playing.
  el.finishLoad(30);
  assert.equal(lastPreview().status, "playing");
  assert.equal(lastPreview().duration, 30);
  assert.ok(previewGain.gain.value > 0, "preview branch opens for playback");

  el.currentTime = 12.5;
  el.dispatch("timeupdate");
  assert.equal(lastPreview().status, "playing");
  assert.equal(lastPreview().currentTime, 12.5);

  E.handle({ cmd: "previewPause" });
  assert.equal(el.paused, true);
  assert.equal(lastPreview().status, "paused");
  assert.equal(previewGain.gain.value, 0, "preview branch closes on pause");

  E.handle({ cmd: "previewSeek", seconds: 7.5 });
  assert.equal(el.currentTime, 7.5);
  assert.equal(lastPreview().status, "paused");
  assert.equal(lastPreview().currentTime, 7.5);

  E.handle({ cmd: "previewStop" });
  assert.equal(el.currentTime, 0);
  assert.equal(lastPreview().status, "paused");
  assert.equal(lastPreview().currentTime, 0);

  // Starting the sweep tone pauses a running preview; the two sources never
  // intentionally play over each other.
  E.handle({ cmd: "previewPlay" });
  assert.equal(lastPreview().status, "playing");
  assert.ok(previewGain.gain.value > 0);
  E.handle({ cmd: "play" });
  assert.equal(el.paused, true);
  assert.equal(lastPreview().status, "paused");
  assert.equal(previewGain.gain.value, 0, "tone play closes the preview branch");

  // A media error is surfaced with the element's error code.
  E.handle({ cmd: "previewLoad", url: "https://example.test/bad.m4a" });
  el.error = { code: 4 };
  el.dispatch("error");
  assert.equal(lastPreview().status, "error");
  assert.match(lastPreview().message, /error 4/);
  assert.equal(previewGain.gain.value, 0, "preview branch closes on error");
}

{
  // the old block-4 checks stay: 16 biquads exist behind levelGain path
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
  for (let i = 0; i < 24 && n.outputs.length; i++) {
    n = n.outputs[0];
    chain.push(n);
  }
  const biquads = chain.filter((x) => x.Q);
  assert.equal(biquads.length, BAND_COUNT, `${BAND_COUNT} biquads, got ${biquads.length}`);
}

console.log("engine.test.mjs — all passed");
process.exit(0);
