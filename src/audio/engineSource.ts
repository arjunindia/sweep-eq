// The Web Audio engine that runs inside a hidden WebView.
//
// Why a WebView: the original site's audio is Web Audio API (oscillator +
// gain envelopes + up to 16 biquads + a waveshaper clipper, with
// setTargetAtTime glides). Running the same API inside a 1x1 WebView keeps
// the DSP behaviour byte-for-byte equivalent to the website while letting the
// whole app stay installable from Expo Go (no dev build). The UI around it is
// fully native.
//
// If the project later moves to a development build, `@react-native-audio-api`
// implements the same spec natively; only `engine.ts` would need to change.
//
// The engine source must avoid template literals so it can live inside a
// normal TS template string without escaping.

export const ENGINE_JS = `
(function () {
  'use strict';

  // The graph always has 16 slots; the app's band-limit setting decides how
  // many receive a band. Unused slots stay flat and cost almost nothing.
  var BANDS = 16;
  var RAMP = 0.015;      // play/stop fade (s)
  var GLIDE_MIN = 0.012; // shortest frequency glide time constant (s)
  var GLIDE_MAX = 0.05;  // longest glide, for sparse/jittery bridge updates (s)
  var SNAP = 0.005;      // settle time constant when a drag ends (s)
  var SMOOTH = 0.01;     // level / filter parameter smoothing (s)
  var CEILING = 0.5;     // fixed -6 dBFS output ceiling

  var TYPE_MAP = { PK: 'peaking', LSC: 'lowshelf', HSC: 'highshelf' };
  var dbToGain = function (db) { return Math.pow(10, db / 20); };

  var ctx = null;
  var osc = null, toneGain = null, preampGain = null, levelGain = null;
  var ceiling = null, clipper = null;
  var biquads = [];

  var freq = 1000;
  var levelDb = -18;
  var playing = false;
  var lastFreqAt = 0;   // ctx time of the previous glide target (s)
  var held = [];        // bands while idle: [{t,f,g,q,e}]
  var eqOn = true;
  var preampDb = 0;

  function post(msg) {
    var payload;
    try { payload = JSON.stringify(msg); } catch (e) { return; }
    if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
      window.ReactNativeWebView.postMessage(payload);
    }
  }

  function build() {
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { post({ ev: 'err', message: 'AudioContext unavailable' }); return false; }
    try { ctx = new AC(); } catch (e) { post({ ev: 'err', message: 'AudioContext failed: ' + e }); return false; }
    try {
      var now = ctx.currentTime;

      osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now);

      toneGain = ctx.createGain();
      toneGain.gain.setValueAtTime(0, now);

      preampGain = ctx.createGain();
      preampGain.gain.setValueAtTime(1, now);

      biquads = [];
      for (var i = 0; i < BANDS; i++) {
        var bq = ctx.createBiquadFilter();
        bq.type = 'peaking';
        bq.frequency.setValueAtTime(1000, now);
        bq.Q.setValueAtTime(1, now);
        bq.gain.setValueAtTime(0, now);
        biquads.push(bq);
      }

      levelGain = ctx.createGain();
      levelGain.gain.setValueAtTime(dbToGain(levelDb), now);

      ceiling = ctx.createGain();
      ceiling.gain.setValueAtTime(CEILING, now);

      // Hard clipper: identity up to +/- CEILING, flat beyond. A WaveShaper
      // clamps inputs outside [-1, 1] to the curve's end points, so no boost
      // stacking or manual preamp can push the output past the ceiling.
      clipper = ctx.createWaveShaper();
      var N = 4097;
      var curve = new Float32Array(N);
      for (var k = 0; k < N; k++) {
        var x = (k / (N - 1)) * 2 - 1;
        curve[k] = Math.max(-CEILING, Math.min(CEILING, x));
      }
      clipper.curve = curve;
      clipper.oversample = 'none';

      osc.connect(toneGain);
      toneGain.connect(preampGain);
      var node = preampGain;
      for (var j = 0; j < biquads.length; j++) {
        node.connect(biquads[j]);
        node = biquads[j];
      }
      node.connect(levelGain);
      levelGain.connect(ceiling);
      ceiling.connect(clipper);
      clipper.connect(ctx.destination);

      osc.start();
    } catch (e) {
      post({ ev: 'err', message: 'Graph build failed: ' + e });
      return false;
    }
    return true;
  }

  function started() {
    if (!ctx) return false;
    post({ ev: 'ctx', state: ctx.state });
    return ctx.state !== 'suspended';
  }

  function resumeCtx() {
    if (!ctx) return;
    try {
      ctx.resume().then(function () {
        post({ ev: 'ctx', state: ctx.state });
      }).catch(function (e) {
        post({ ev: 'err', message: 'resume: ' + e });
      });
    } catch (e) {
      post({ ev: 'err', message: 'resume: ' + e });
    }
  }

  // Ensure the graph exists, then apply whatever was set while idle.
  function ensure() {
    if (ctx) { resumeCtx(); return; }
    if (!build()) return;
    applyFrequency();
    applyLevel();
    applyEq();
    if (playing) fade(1); else fade(0);
    resumeCtx();
  }

  function applyFrequency(snap) {
    if (!osc || !ctx) return;
    try {
      var now = ctx.currentTime;
      // Frequency targets arrive over an async bridge, so glide toward each
      // one with an exponential approach instead of snapping. A new target
      // continues from the current (already moving) frequency, which turns
      // consecutive updates into one continuous sweep. The time constant
      // adapts to how often updates actually arrive: a steady 50 Hz stream
      // stays snappy, a jittery bridge stretches the glide so the tone never
      // steps between sparse targets.
      var tc = SNAP;
      if (!snap) {
        tc = GLIDE_MIN;
        if (lastFreqAt > 0) {
          var dt = now - lastFreqAt;
          // > 200 ms of silence is a new gesture, not a stalled sweep.
          if (dt > 0 && dt <= 0.2) {
            tc = Math.min(GLIDE_MAX, Math.max(GLIDE_MIN, dt * 0.4));
          }
        }
      }
      lastFreqAt = now;
      osc.frequency.setTargetAtTime(freq, now, tc);
    } catch (e) {}
  }

  function applyLevel() {
    if (!levelGain) return;
    try {
      levelGain.gain.setTargetAtTime(dbToGain(levelDb), ctx.currentTime, SMOOTH);
    } catch (e) {}
  }

  function applyEq() {
    if (!preampGain) return;
    try {
      var now = ctx.currentTime;
      var on = !!eqOn;
      preampGain.gain.setTargetAtTime(on ? dbToGain(preampDb) : 1, now, SMOOTH);
      for (var i = 0; i < BANDS; i++) {
        var bq = biquads[i];
        if (!bq) continue;
        var b = on ? held[i] : null;
        if (b && b.e !== false) {
          bq.type = TYPE_MAP[b.t] || 'peaking';
          bq.frequency.setTargetAtTime(b.f, now, SMOOTH);
          bq.Q.setTargetAtTime(b.q, now, SMOOTH);
          bq.gain.setTargetAtTime(b.g, now, SMOOTH);
        } else {
          bq.type = 'peaking';
          bq.frequency.setTargetAtTime(1000, now, SMOOTH);
          bq.Q.setTargetAtTime(1, now, SMOOTH);
          bq.gain.setTargetAtTime(0, now, SMOOTH);
        }
      }
    } catch (e) {}
  }

  // Linear fade of the tone gain, cancelling anything already scheduled so
  // repeated play/stop calls never step the value and click.
  function fade(target) {
    if (!toneGain) return;
    try {
      var g = toneGain.gain;
      var now = ctx.currentTime;
      g.cancelScheduledValues(now);
      g.setValueAtTime(g.value != null ? g.value : 0, now);
      g.linearRampToValueAtTime(target, now + RAMP);
    } catch (e) {}
  }

  window.__engine = {
    handle: function (msg) {
      if (!msg || typeof msg !== 'object') return;
      switch (msg.cmd) {
        case 'start':
          ensure();
          break;
        case 'play':
          playing = true;
          if (ctx) { resumeCtx(); fade(1); }
          break;
        case 'stop':
          playing = false;
          fade(0);
          break;
        case 'freq':
          if (typeof msg.hz === 'number' && msg.hz > 0) {
            freq = msg.hz;
            if (ctx) applyFrequency(!!msg.snap);
          }
          break;
        case 'level':
          if (typeof msg.db === 'number') {
            levelDb = msg.db;
            if (ctx) applyLevel();
          }
          break;
        case 'eq':
          held = Array.isArray(msg.bands) ? msg.bands : [];
          eqOn = !!msg.eqOn;
          preampDb = Number(msg.preampDb) || 0;
          if (ctx) applyEq();
          break;
        case 'probe':
          post({ ev: 'pong' });
          break;
        default:
          break;
      }
    },
    boot: function () {
      post({ ev: 'ready' });
    }
  };

  window.__engine.boot();
})();
`;

export const ENGINE_HTML_PREFIX =
  "<!doctype html><html><head><meta charset=\"utf-8\">" +
  '<meta name="viewport" content="width=device-width,initial-scale=1">' +
  "<style>html,body{margin:0;padding:0;background:transparent;overflow:hidden}</style>" +
  "</head><body><script>";

export const ENGINE_HTML_SUFFIX = "</script></body></html>";

export const ENGINE_HTML = ENGINE_HTML_PREFIX + ENGINE_JS + ENGINE_HTML_SUFFIX;

// --- protocol types ---------------------------------------------------------

export type WebViewEngineEvent =
  | { ev: "ready" }
  | { ev: "ctx"; state: "running" | "suspended" | "closed" | "interrupted" | "unknown" }
  | { ev: "err"; message: string }
  | { ev: "pong" };
