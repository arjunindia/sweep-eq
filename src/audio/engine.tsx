// AudioEngine — React Native wrapper around the hidden WebView that runs the
// Web Audio graph (see engineSource.ts). The API mirrors the original site's
// AudioEngine: start(), play(), stop(), setFrequency(), setLevel(),
// setBands(). Commands are coalesced so dragging the sweep at ~120 Hz does
// not flood the bridge; the latest value always wins.

import { useEffect, useRef } from "react";
import { WebView as WebViewExport } from "react-native-webview";
import type { StyleProp, ViewStyle } from "react-native";
import { ENGINE_HTML, type WebViewEngineEvent } from "./engineSource.ts";
import type { FilterBand } from "../lib/dsp.ts";

// Minimal contract of the WebView the bridge actually relies on. RNW 14's
// generated typings predate RN 0.88's element refs, so instead of fighting
// the resolver we re-type the component ourselves — the runtime API is
// unchanged: injectJavaScript in, postMessage out.
type WebViewBridge = { injectJavaScript(code: string): void };

type WebViewMessage = { nativeEvent: { data: string } };

// Set true to print the sweep's actual command rate to the Metro log — the
// fastest way to tell a starved JS thread from a WebView processing problem.
const SWEEP_DEBUG = true;

type WebViewProps = {
  ref?: (bridge: WebViewBridge | null) => void;
  source: { html: string };
  style?: StyleProp<ViewStyle>;
  pointerEvents?: string;
  originWhitelist?: string[];
  javaScriptEnabled?: boolean;
  allowFileAccess?: boolean;
  domStorageEnabled?: boolean;
  cacheEnabled?: boolean;
  mediaPlaybackRequiresUserAction?: boolean;
  allowsInlineMediaPlayback?: boolean;
  setSupportMultipleWindows?: boolean;
  onMessage?: (event: WebViewMessage) => void;
};

// Loose cast: the typed surface above is all we exercise.
const WebView = WebViewExport as unknown as import("react").ComponentType<WebViewProps>;

export interface CompactBand {
  t: "PK" | "LSC" | "HSC";
  f: number;
  g: number;
  q: number;
  e: boolean;
}

type StatusListener = () => void;

type Desired = {
  freq: number;
  levelDb: number;
  playing: boolean;
  eq: { bands: CompactBand[]; eqOn: boolean; preampDb: number };
};

class WebViewAudioEngine {
  private ref: WebViewBridge | null = null;
  private ready = false;
  private readyListeners = new Set<() => void>();
  private startSent = false;

  // Desired state; pushed whenever the WebView (re)arms or the user changes it.
  private wanted: Desired = {
    freq: 1000,
    levelDb: -18,
    playing: false,
    eq: { bands: [], eqOn: true, preampDb: 0 },
  };

  // Whether the volume gate has accepted audio for this app run.
  started = false;
  ctxState: "suspended" | "running" | "closed" | "unknown" | null = null;
  private statusListeners = new Set<StatusListener>();

  private throttle = new Map<string, Record<string, unknown>>();
  private throttleTimer: ReturnType<typeof setInterval> | null = null;
  private lastFreqPostAt = 0;
  private freqWindowStart = 0;
  private prevFreqAt = 0;
  private freqSent = 0;
  private maxFreqGap = 0;
  private maxInjectMs = 0;

  onStatus(fn: StatusListener): () => void {
    this.statusListeners.add(fn);
    return () => {
      this.statusListeners.delete(fn);
    };
  }

  private emit() {
    for (const fn of this.statusListeners) fn();
  }

  // Ready-subscribers (used by the gate to know the engine can receive).
  waitForReady(): Promise<void> {
    if (this.ready) return Promise.resolve();
    return new Promise((resolve) => {
      this.readyListeners.add(() => resolve());
    });
  }

  attach(webView: WebViewBridge | null) {
    this.ref = webView;
  }

  private post(msg: Record<string, unknown>) {
    if (!this.ref || !this.ready) return;
    if (SWEEP_DEBUG && msg.cmd === "freq") {
      // Measure the live drag only: a new gesture (or any 0.5 s pause) resets
      // the window so idle time can't dilute the reported rate.
      const now = Date.now();
      if (this.freqWindowStart === 0 || now - this.prevFreqAt > 500) {
        this.freqWindowStart = now;
        this.freqSent = 0;
        this.maxFreqGap = 0;
        this.maxInjectMs = 0;
      } else {
        const gap = now - this.prevFreqAt;
        if (gap > this.maxFreqGap) this.maxFreqGap = gap;
      }
      this.prevFreqAt = now;
      this.freqSent += 1;
      const span = now - this.freqWindowStart;
      if (span >= 1000) {
        console.log(
          `[eqdebug] sweep n=${this.freqSent} span=${span}ms maxGap=${this.maxFreqGap}ms injectMax=${this.maxInjectMs}ms`
        );
        this.freqWindowStart = 0;
      }
    }
    const json = JSON.stringify(msg).replace(/[\u2028\u2029]/g, "");
    const t0 = Date.now();
    this.ref.injectJavaScript(`window.__engine.handle(${json});true;`);
    const cost = Date.now() - t0;
    if (SWEEP_DEBUG && msg.cmd === "freq" && cost > this.maxInjectMs) {
      this.maxInjectMs = cost;
    }
  }

  // Coalescing channel: keep only the newest message per kind. 20 ms gives
  // the sweep ~50 updates/s — enough for a continuous glide without
  // drowning the WebView bridge.
  private schedule(kind: string, msg: Record<string, unknown>) {
    if (!this.ready) return;
    this.throttle.set(kind, msg);
    if (this.throttleTimer === null) {
      this.throttleTimer = setInterval(() => this.flushThrottled(), 20);
    }
  }

  private flushThrottled() {
    if (this.throttleTimer) {
      clearInterval(this.throttleTimer);
      this.throttleTimer = null;
    }
    const scheduled = Array.from(this.throttle.values());
    this.throttle.clear();
    for (const msg of scheduled) this.post(msg);
  }

  // Re-assert the full desired state after the WebView (re)loads.
  private repush() {
    if (!this.ready) return;
    if (this.startSent) this.post({ cmd: "start" });
    this.post({ cmd: "freq", hz: this.wanted.freq });
    this.post({ cmd: "level", db: this.wanted.levelDb });
    this.post({ cmd: "eq", ...this.wanted.eq });
    if (this.wanted.playing) this.post({ cmd: "play" });
  }

  async start(): Promise<void> {
    // Resolve even if the WebView is slow to report; the web engine applies
    // whatever was set whenever it (re)builds.
    await Promise.race([
      this.waitForReady(),
      new Promise<void>((resolve) => setTimeout(resolve, 3000)),
    ]);
    if (!this.startSent) {
      this.startSent = true;
      this.started = true;
      this.emit();
      this.repush();
    }
  }

  play() {
    this.wanted.playing = true;
    this.post({ cmd: "play" });
  }

  stop() {
    this.wanted.playing = false;
    this.post({ cmd: "stop" });
  }

  isStarted(): boolean {
    return this.started;
  }

  setFrequency(hz: number) {
    const f = Math.max(20, Math.min(20000, hz));
    if (f === this.wanted.freq) return; // App push + direct drag call can double up
    this.wanted.freq = f;
    // Leading edge: while sweeping, post the first update (and any update
    // arriving after a gap) straight away instead of waiting for the 20 ms
    // flush timer. Updates that land inside the window are still coalesced.
    const now = Date.now();
    if (this.ready && now - this.lastFreqPostAt >= 25) {
      this.lastFreqPostAt = now;
      this.throttle.delete("freq");
      this.post({ cmd: "freq", hz: f });
      return;
    }
    this.schedule("freq", { cmd: "freq", hz: f });
  }

  // Final value after a gesture: skip the coalescer and land exactly.
  snapFrequency(hz: number) {
    const f = Math.max(20, Math.min(20000, hz));
    this.wanted.freq = f;
    this.lastFreqPostAt = Date.now();
    this.throttle.delete("freq");
    this.post({ cmd: "freq", hz: f, snap: true });
  }

  setLevel(db: number) {
    this.wanted.levelDb = db;
    this.schedule("level", { cmd: "level", db });
  }

  setBands(bands: FilterBand[], eqOn: boolean, preampDb: number) {
    const compact: CompactBand[] = bands.map((b) => ({
      t: b.type,
      f: Math.round(b.fc),
      g: b.gain,
      q: b.q,
      e: b.enabled !== false,
    }));
    this.wanted.eq = { bands: compact, eqOn, preampDb };
    this.schedule("eq", { cmd: "eq", ...this.wanted.eq });
  }

  handleMessage(event?: WebViewMessage | string) {
    const raw = typeof event === "string" ? event : event?.nativeEvent?.data;
    if (!raw) return;
    let ev: WebViewEngineEvent;
    try {
      ev = JSON.parse(raw) as WebViewEngineEvent;
    } catch {
      return;
    }
    if (!ev || typeof ev !== "object") return;
    if (ev.ev === "ready") {
      const first = !this.ready;
      this.ready = true;
      const listeners = this.readyListeners;
      this.readyListeners = new Set();
      listeners.forEach((fn) => fn());
      if (first) this.repush(); // WebView reloads also re-arm here
    } else if (ev.ev === "ctx") {
      if (ev.state === "suspended" || ev.state === "running" || ev.state === "closed") {
        this.ctxState = ev.state;
      } else {
        this.ctxState = "unknown";
      }
      this.emit();
    } else if (ev.ev === "err") {
      console.warn("[audio]", ev.message);
    }
  }
}

export const engine = new WebViewAudioEngine();

export function AudioWebView() {
  const ref = useRef<WebViewBridge | null>(null);

  useEffect(() => {
    engine.attach(ref.current);
    return () => {
      engine.attach(null);
    };
  }, []);

  return (
    <WebView
      ref={(w) => {
        ref.current = w;
      }}
      source={{ html: ENGINE_HTML }}
      style={{ flex: 1, backgroundColor: "transparent" }}
      pointerEvents="none"
      originWhitelist={["*"]}
      javaScriptEnabled
      allowFileAccess={false}
      domStorageEnabled={false}
      cacheEnabled={false}
      mediaPlaybackRequiresUserAction={false}
      allowsInlineMediaPlayback
      setSupportMultipleWindows={false}
      onMessage={(e) => engine.handleMessage(e)}
    />
  );
}
