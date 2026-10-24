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
  var PREVIEW_LEVEL = 0.6; // fixed song-preview output level (pre-ceiling)

  var TYPE_MAP = { PK: 'peaking', LSC: 'lowshelf', HSC: 'highshelf' };
  var dbToGain = function (db) { return Math.pow(10, db / 20); };

  var ctx = null;
  var osc = null, toneGain = null, preampGain = null, levelGain = null;
  var ceiling = null, clipper = null;
  var bqOut = null, previewGain = null;
  var biquads = [];
  var previewEl = null, previewSource = null;
  var previewWantedPlay = false;
  var previewLoading = false;

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

      bqOut = ctx.createGain();
      bqOut.gain.setValueAtTime(1, now);

      levelGain = ctx.createGain();
      levelGain.gain.setValueAtTime(dbToGain(levelDb), now);

      // The song preview joins the same preamp/biquad chain, then returns to
      // the ceiling through its own gain. It must not pass through levelGain:
      // that is the sweep's -60..-6 dB tone control, not a media volume.
      // The preview branch is muted until a song is actually playing. If it
      // stayed at unity, the sweep would also travel bqOut → previewGain and
      // bypass levelGain, making the tone far louder (and clipping).
      previewGain = ctx.createGain();
      previewGain.gain.setValueAtTime(0, now);

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
      node.connect(bqOut);
      bqOut.connect(levelGain);
      bqOut.connect(previewGain);
      levelGain.connect(ceiling);
      previewGain.connect(ceiling);
      ceiling.connect(clipper);
      clipper.connect(ctx.destination);

      wirePreview();
      osc.start();
    } catch (e) {
      post({ ev: 'err', message: 'Graph build failed: ' + e });
      return false;
    }
    return true;
  }

  // ---- song preview --------------------------------------------------------
  // A single hidden <audio> element is created once and reused. Its media
  // element source feeds the common preamp/biquad chain, so the preview hears
  // exactly the curve the sweep hears. Apple's preview CDN sends
  // Access-Control-Allow-Origin: *, which keeps createMediaElementSource from
  // silencing the graph.

  function wirePreview() {
    if (previewEl || !ctx) return;
    try {
      previewEl = document.createElement('audio');
      previewEl.preload = 'auto';
      previewEl.crossOrigin = 'anonymous';
      previewEl.setAttribute('playsinline', '');
      previewEl.style.display = 'none';
      if (document.body) document.body.appendChild(previewEl);
      else document.documentElement.appendChild(previewEl);

      previewSource = ctx.createMediaElementSource(previewEl);
      previewSource.connect(preampGain);

      previewEl.addEventListener('loadedmetadata', finishPreviewLoad);
      previewEl.addEventListener('canplay', finishPreviewLoad);
      previewEl.addEventListener('durationchange', function () {
        if (!previewLoading) announcePreview();
      });
      previewEl.addEventListener('timeupdate', function () {
        if (!previewLoading) announcePreview();
      });
      previewEl.addEventListener('play', function () {
        if (!previewWantedPlay) return;
        setPreviewOutput(true);
        if (!previewLoading) announcePreview('playing');
      });
      previewEl.addEventListener('playing', function () {
        if (!previewWantedPlay) return;
        setPreviewOutput(true);
        if (!previewLoading) announcePreview('playing');
      });
      previewEl.addEventListener('pause', function () {
        setPreviewOutput(false);
        if (previewLoading) return;
        announcePreview(previewEl.ended ? 'ended' : 'paused');
      });
      previewEl.addEventListener('ended', function () {
        previewWantedPlay = false;
        setPreviewOutput(false);
        announcePreview('ended');
      });
      previewEl.addEventListener('waiting', function () {
        if (!previewLoading && previewWantedPlay) announcePreview('loading');
      });
      previewEl.addEventListener('error', function () {
        previewLoading = false;
        previewWantedPlay = false;
        setPreviewOutput(false);
        var code = previewEl.error && previewEl.error.code ? previewEl.error.code : 0;
        postPreview(
          'error',
          previewTime(),
          previewDuration(),
          'Preview failed to load' + (code ? ' (error ' + code + ')' : '')
        );
      });
    } catch (e) {
      previewEl = null;
      previewSource = null;
      post({ ev: 'err', message: 'Preview graph failed: ' + e });
    }
  }

  function setPreviewOutput(on) {
    if (!previewGain || !ctx) return;
    try {
      previewGain.gain.setTargetAtTime(on ? PREVIEW_LEVEL : 0, ctx.currentTime, 0.005);
    } catch (e) {}
  }

  function previewStatus() {
    if (!previewEl) return 'idle';
    if (previewEl.ended) return 'ended';
    return previewEl.paused ? 'paused' : 'playing';
  }

  function previewTime() {
    return previewEl && typeof previewEl.currentTime === 'number' ? previewEl.currentTime : 0;
  }

  function previewDuration() {
    return previewEl && typeof previewEl.duration === 'number' ? previewEl.duration : 0;
  }

  function postPreview(status, currentTime, duration, message) {
    var payload = { ev: 'preview', status: status };
    if (typeof currentTime === 'number' && isFinite(currentTime)) {
      payload.currentTime = Math.max(0, currentTime);
    }
    if (typeof duration === 'number' && isFinite(duration) && duration > 0) {
      payload.duration = duration;
    }
    if (message) payload.message = message;
    post(payload);
  }

  function announcePreview(status, message) {
    if (previewLoading && status !== 'error') return;
    postPreview(status || previewStatus(), previewTime(), previewDuration(), message);
  }

  // The first metadata/canplay event ends the "loading" phase. Play may
  // already have been requested while the network was fetching; if so, start
  // it now, otherwise report the paused position.
  function finishPreviewLoad() {
    if (!previewLoading) return;
    previewLoading = false;
    if (previewWantedPlay && previewEl.paused) startPreviewPlayback();
    else announcePreview();
  }

  function startPreviewPlayback() {
    if (!previewEl) {
      postPreview('error', 0, 0, 'Preview is not available');
      return;
    }
    if (!previewEl.src) {
      previewWantedPlay = false;
      postPreview('error', 0, 0, 'No preview loaded');
      return;
    }
    previewWantedPlay = true;
    setPreviewOutput(true);
    var p = null;
    try {
      p = previewEl.play();
    } catch (e) {
      previewWantedPlay = false;
      setPreviewOutput(false);
      postPreview(
        'error',
        previewTime(),
        previewDuration(),
        'Could not start playback: ' + (e && e.message ? e.message : e)
      );
      return;
    }
    if (p && typeof p.catch === 'function') {
      p.catch(function (e) {
        if (!previewWantedPlay) return;
        previewWantedPlay = false;
        setPreviewOutput(false);
        postPreview(
          'error',
          previewTime(),
          previewDuration(),
          'Could not start playback: ' + (e && e.message ? e.message : e)
        );
      });
    }
  }

  function loadPreview(url) {
    if (!previewEl) {
      postPreview('error', 0, 0, 'Preview is not available');
      return;
    }
    if (typeof url !== 'string' || !url) {
      postPreview('error', 0, 0, 'No preview URL');
      return;
    }
    previewWantedPlay = false;
    previewLoading = true;
    setPreviewOutput(false);
    // Assigning src aborts the previous resource and pauses it; calling
    // pause() here as well would queue a stale pause event for the new track.
    try {
      previewEl.src = url;
      previewEl.load();
    } catch (e) {
      previewLoading = false;
      postPreview('error', 0, 0, 'Could not load preview: ' + e);
      return;
    }
    postPreview('loading', 0, 0);
  }

  function playPreview() {
    if (!previewEl) {
      postPreview('error', 0, 0, 'Preview is not available');
      return;
    }
    if (ctx) resumeCtx();
    startPreviewPlayback();
  }

  function pausePreview() {
    if (!previewEl) return;
    previewWantedPlay = false;
    setPreviewOutput(false);
    try { previewEl.pause(); } catch (e) {}
    if (previewEl.ended) announcePreview('ended');
    else announcePreview('paused');
  }

  function stopPreview() {
    if (!previewEl) return;
    previewWantedPlay = false;
    setPreviewOutput(false);
    try { previewEl.pause(); } catch (e) {}
    try { previewEl.currentTime = 0; } catch (e) {}
    announcePreview('paused');
  }

  function seekPreview(seconds) {
    if (!previewEl) return;
    var t = Number(seconds);
    if (!isFinite(t)) return;
    var d = previewEl.duration;
    if (isFinite(d) && d > 0) t = Math.min(d, Math.max(0, t));
    else t = Math.max(0, t);
    try { previewEl.currentTime = t; } catch (e) {}
    announcePreview(previewEl.paused ? (previewEl.ended ? 'ended' : 'paused') : 'playing');
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
          previewWantedPlay = false;
          setPreviewOutput(false);
          if (previewEl && !previewEl.paused) {
            try { previewEl.pause(); } catch (e) {}
          }
          if (ctx) { resumeCtx(); fade(1); }
          break;
        case 'stop':
          playing = false;
          fade(0);
          break;
        case 'previewLoad':
          loadPreview(msg.url);
          break;
        case 'previewPlay':
          playPreview();
          break;
        case 'previewPause':
          pausePreview();
          break;
        case 'previewStop':
          stopPreview();
          break;
        case 'previewSeek':
          seekPreview(msg.seconds);
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

export type PreviewStatus = "idle" | "loading" | "playing" | "paused" | "ended" | "error";

export type WebViewEngineEvent =
  | { ev: "ready" }
  | { ev: "ctx"; state: "running" | "suspended" | "closed" | "interrupted" | "unknown" }
  | { ev: "err"; message: string }
  | { ev: "pong" }
  | {
      ev: "preview";
      status: PreviewStatus;
      currentTime?: number;
      duration?: number;
      message?: string;
    };
