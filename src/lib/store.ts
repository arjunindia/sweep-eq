// Store: state, actions, subscribe — a TypeScript port of the original
// `js/store.js` (Apache-2.0, (c) DMS / eqbyear.com). Every change produces a
// new state object. Mobile adaptations: `theme` becomes `themePref`
// ("system" follows the OS) and a `removeAllBands()` action backs the
// standalone clear-all button in the app bars.

import * as dsp from "./dsp.ts";

export const MAX_BANDS = 16;
export const DEFAULT_BAND_LIMIT = 8;
export const BAND_LIMIT_OPTIONS = [8, 12, 16] as const;
export type BandLimit = (typeof BAND_LIMIT_OPTIONS)[number];
export const TYPES: BandType[] = ["PK", "LSC", "HSC"];

export type BandType = "PK" | "LSC" | "HSC";
export type DraftKind = "peak" | "dip";
export type ThemePref = "system" | "light" | "dark";
export type ColorSource = "brand" | "dynamic";

const LEVEL_MIN = -60;
const LEVEL_MAX = -6;
const GAIN_LIMIT = 24;
const Q_MIN = 0.1;
const Q_MAX = 20;
const PREAMP_LIMIT = 24;

export interface Band {
  id: string;
  type: BandType;
  fc: number;
  gain: number;
  q: number;
  enabled: boolean;
}

export interface Draft {
  kind: DraftKind;
  start: number | null;
  top: number | null;
  end: number | null;
}

export interface AppState {
  version: number;
  freq: number;
  playing: boolean;
  levelDb: number;
  eqOn: boolean;
  preampDb: number;
  preampAuto: boolean;
  bands: Band[];
  selectedId: string | null;
  draft: Draft;
  themePref: ThemePref;
  colorSource: ColorSource;
  bandLimit: BandLimit;
}

let seq = 0;
function nextId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  seq += 1;
  return `b${seq}-${Date.now().toString(36)}`;
}

function num(v: unknown, min: number, max: number, fallback: number): number {
  const n = typeof v === "string" ? Number(v) : v;
  if (typeof n !== "number" || !Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function round(v: number, step: number): number {
  return Math.round(v / step) * step;
}

function markHz(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === "string" ? Number(v) : v;
  if (typeof n !== "number" || !Number.isFinite(n)) return null;
  return Math.min(dsp.FMAX, Math.max(dsp.FMIN, n));
}

export function emptyDraft(kind: DraftKind | string = "peak"): Draft {
  return {
    kind: kind === "dip" ? "dip" : "peak",
    start: null,
    top: null,
    end: null,
  };
}

export function defaultState(): AppState {
  return {
    version: 1,
    freq: 1000,
    playing: false,
    levelDb: -18,
    eqOn: true,
    preampDb: 0,
    preampAuto: true,
    bands: [],
    selectedId: null,
    draft: emptyDraft("peak"),
    themePref: "system",
    colorSource: "dynamic",
    bandLimit: DEFAULT_BAND_LIMIT,
  };
}

function normalizeBandLimit(raw: unknown, bandCount: number): BandLimit {
  const n = Number(raw);
  const requested = (BAND_LIMIT_OPTIONS as readonly number[]).includes(n)
    ? (n as BandLimit)
    : DEFAULT_BAND_LIMIT;
  const needed = Math.max(requested, bandCount);
  return (BAND_LIMIT_OPTIONS.find((v) => v >= needed) ?? MAX_BANDS) as BandLimit;
}

function cleanBand(raw: unknown): Band | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const type: BandType = TYPES.includes(r.type as BandType) ? (r.type as BandType) : "PK";
  const fcRaw = r.fc;
  if (
    fcRaw == null ||
    (typeof fcRaw !== "number" && typeof fcRaw !== "string") ||
    !Number.isFinite(Number(fcRaw))
  ) {
    return null;
  }
  const fc = num(fcRaw, dsp.FMIN, dsp.FMAX, 1000);
  const id = typeof r.id === "string" && r.id ? r.id : nextId();
  return {
    id,
    type,
    fc: Math.round(fc),
    gain: round(num(r.gain, -GAIN_LIMIT, GAIN_LIMIT, 0), 0.1),
    q: round(num(r.q, Q_MIN, Q_MAX, 1), 0.01),
    enabled: r.enabled !== false,
  };
}

// Validate an arbitrary object into a full, in-range state. Never throws.
export function validate(raw: unknown): AppState {
  const d = defaultState();
  const s = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};

  const bands: Band[] = [];
  if (Array.isArray(s.bands)) {
    for (const b of s.bands) {
      const cb = cleanBand(b);
      if (cb) bands.push(cb);
      if (bands.length >= MAX_BANDS) break;
    }
  }

  const rawDraft = (s.draft && typeof s.draft === "object" ? s.draft : {}) as Record<string, unknown>;
  const draft: Draft = {
    kind: rawDraft.kind === "dip" ? "dip" : "peak",
    start: markHz(rawDraft.start),
    top: markHz(rawDraft.top),
    end: markHz(rawDraft.end),
  };

  const selectedId =
    typeof s.selectedId === "string" && bands.some((b) => b.id === s.selectedId)
      ? s.selectedId
      : (null as string | null);

  const bandLimit = normalizeBandLimit(s.bandLimit, bands.length);

  return normalize({
    version: 1,
    freq: num(s.freq, dsp.FMIN, dsp.FMAX, d.freq),
    playing: false,
    levelDb: num(s.levelDb, LEVEL_MIN, LEVEL_MAX, d.levelDb),
    eqOn: s.eqOn !== false,
    preampDb: num(s.preampDb, -PREAMP_LIMIT, PREAMP_LIMIT, 0),
    preampAuto: s.preampAuto !== false,
    bands,
    selectedId,
    draft,
    themePref: s.themePref === "light" || s.themePref === "dark" ? s.themePref : "system",
    colorSource: s.colorSource === "brand" ? "brand" : "dynamic",
    bandLimit,
  });
}

// Keeps derived fields consistent (auto preamp follows the enabled bands).
function normalize(s: AppState): AppState {
  if (s.preampAuto) {
    const auto = dsp.autoPreamp(s.bands);
    if (auto !== s.preampDb) return { ...s, preampDb: auto };
  }
  return s;
}

export interface SweepStore {
  get(): AppState;
  subscribe(fn: (s: AppState) => void): () => void;
  setFreq(hz: unknown): AppState;
  setPlaying(on: boolean): AppState;
  setLevel(db: unknown): AppState;
  toggleEq(): AppState;
  setPreamp(db: unknown): AppState;
  setPreampAuto(): AppState;
  setThemePref(t: ThemePref): AppState;
  setColorSource(source: ColorSource): AppState;
  setBandLimit(limit: number): AppState;
  setDraftKind(kind: string): AppState;
  mark(which: string): AppState;
  commitDraft(): AppState;
  clearDraft(): AppState;
  undo(): AppState;
  updateBand(id: string, patch: Partial<Band> | null): AppState;
  removeBand(id: string): AppState;
  removeAllBands(): AppState;
  selectBand(id: string | null): AppState;
  load(next: unknown): AppState;
}

// App-wide singleton, created like the site's `new createStore(...)` in app.js.
export const store: SweepStore = createStore(defaultState());

export function createStore(initial: unknown): SweepStore {
  let state = validate(initial || defaultState());
  const subs = new Set<(s: AppState) => void>();

  function emit() {
    for (const fn of subs) fn(state);
  }

  function set(next: AppState): AppState {
    state = normalize(next);
    emit();
    return state;
  }

  function commitWith(draft: Draft): AppState {
    const spec = dsp.bandFromMarks(draft);
    if (!spec) {
      return set({ ...state, draft });
    }
    if (state.bands.length >= state.bandLimit) {
      // refused: drop the draft so the panel does not stay half-marked
      return set({ ...state, draft: emptyDraft(draft.kind) });
    }
    const band: Band = {
      id: nextId(),
      type: spec.type,
      fc: spec.fc,
      gain: spec.gain,
      q: spec.q,
      enabled: true,
    };
    return set({
      ...state,
      bands: [...state.bands, band],
      selectedId: band.id,
      draft: emptyDraft(draft.kind),
    });
  }

  return {
    get: () => state,

    subscribe(fn) {
      subs.add(fn);
      return () => {
        subs.delete(fn);
      };
    },

    setFreq(hz) {
      const f = dsp.clampFreq(typeof hz === "string" ? Number(hz) : Number(hz));
      if (f === state.freq) return state;
      return set({ ...state, freq: f });
    },

    setPlaying(on) {
      const v = !!on;
      if (v === state.playing) return state;
      return set({ ...state, playing: v });
    },

    setLevel(db) {
      const v = Math.round(num(db, LEVEL_MIN, LEVEL_MAX, state.levelDb));
      if (v === state.levelDb) return state;
      return set({ ...state, levelDb: v });
    },

    toggleEq() {
      return set({ ...state, eqOn: !state.eqOn });
    },

    setPreamp(db) {
      const v = round(num(db, -PREAMP_LIMIT, PREAMP_LIMIT, state.preampDb), 0.1);
      return set({ ...state, preampDb: v, preampAuto: false });
    },

    setPreampAuto() {
      return set({ ...state, preampAuto: true });
    },

    setThemePref(t) {
      const v = t === "dark" || t === "light" ? t : "system";
      if (v === state.themePref) return state;
      return set({ ...state, themePref: v });
    },

    setColorSource(source) {
      const v: ColorSource = source === "brand" ? "brand" : "dynamic";
      if (v === state.colorSource) return state;
      return set({ ...state, colorSource: v });
    },

    setBandLimit(limit) {
      const requested = (BAND_LIMIT_OPTIONS as readonly number[]).includes(limit)
        ? (limit as BandLimit)
        : DEFAULT_BAND_LIMIT;
      const needed = Math.max(requested, state.bands.length);
      const v = (BAND_LIMIT_OPTIONS.find((n) => n >= needed) ?? MAX_BANDS) as BandLimit;
      if (v === state.bandLimit) return state;
      return set({ ...state, bandLimit: v });
    },

    setDraftKind(kind) {
      const v: DraftKind = kind === "dip" ? "dip" : "peak";
      if (v === state.draft.kind) return state;
      return set({ ...state, draft: { ...state.draft, kind: v } });
    },

    // Records the current frequency into the draft. Commits automatically
    // once all three marks exist.
    mark(which) {
      if (which !== "start" && which !== "top" && which !== "end") return state;
      const draft: Draft = { ...state.draft, [which]: state.freq };
      if (draft.start != null && draft.top != null && draft.end != null) {
        commitWith(draft);
        return state;
      }
      return set({ ...state, draft });
    },

    commitDraft() {
      return commitWith(state.draft);
    },

    clearDraft() {
      const d = state.draft;
      if (d.start == null && d.top == null && d.end == null) return state;
      return set({ ...state, draft: emptyDraft(d.kind) });
    },

    // Removes the last draft mark; with an empty draft, the newest band.
    undo() {
      const d = state.draft;
      for (const key of ["end", "top", "start"] as const) {
        const k = key as keyof Draft;
        if (d[k] != null) {
          return set({ ...state, draft: { ...d, [k]: null } });
        }
      }
      if (!state.bands.length) return state;
      const bands = state.bands.slice(0, -1);
      const gone = state.bands[state.bands.length - 1];
      return set({
        ...state,
        bands,
        selectedId: state.selectedId === gone.id ? null : state.selectedId,
      });
    },

    updateBand(id, patch) {
      const i = state.bands.findIndex((b) => b.id === id);
      if (i < 0 || !patch || typeof patch !== "object") return state;
      const prev = state.bands[i];
      const next: Band = { ...prev };
      if ("type" in patch && patch.type && TYPES.includes(patch.type)) next.type = patch.type;
      if ("fc" in patch && patch.fc != null) next.fc = Math.round(num(patch.fc, dsp.FMIN, dsp.FMAX, prev.fc));
      if ("gain" in patch && patch.gain != null) next.gain = round(num(patch.gain, -GAIN_LIMIT, GAIN_LIMIT, prev.gain), 0.1);
      if ("q" in patch && patch.q != null) next.q = round(num(patch.q, Q_MIN, Q_MAX, prev.q), 0.01);
      if ("enabled" in patch && patch.enabled != null) next.enabled = !!patch.enabled;
      const bands = state.bands.slice();
      bands[i] = next;
      return set({ ...state, bands });
    },

    removeBand(id) {
      if (!state.bands.some((b) => b.id === id)) return state;
      return set({
        ...state,
        bands: state.bands.filter((b) => b.id !== id),
        selectedId: state.selectedId === id ? null : state.selectedId,
      });
    },

    removeAllBands() {
      if (!state.bands.length) return state;
      return set({ ...state, bands: [], selectedId: null });
    },

    selectBand(id) {
      const v = id != null && state.bands.some((b) => b.id === id) ? id : null;
      if (v === state.selectedId) return state;
      return set({ ...state, selectedId: v });
    },

    // Replace the whole state, validating shape and clamping ranges.
    load(next) {
      state = validate(next);
      emit();
      return state;
    },
  };
}
