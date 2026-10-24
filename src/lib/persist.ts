// Autosave/restore on AsyncStorage — port of the original `js/storage.js`
// (Apache-2.0, (c) DMS / eqbyear.com). Debounced 250 ms, failures silent in
// release. The write is also force-fired after MAX_WAIT so a continuous
// frequency sweep (dozens of store updates per second) can never starve the
// autosave and lose the graph on an app close.

import AsyncStorage from "@react-native-async-storage/async-storage";
import type { AppState } from "./store.ts";

export const KEY = "sweep-eq:v1";
const DELAY = 250;
const MAX_WAIT = 1000;

let timer: ReturnType<typeof setTimeout> | null = null;
let pending: AppState | null = null;
let pendingSince = 0;
let lastLogged = "";
let verified = false;

function summary(state: AppState): string {
  return `bands=${state.bands.length} limit=${state.bandLimit} level=${state.levelDb} eq=${state.eqOn} preamp=${state.preampDb} theme=${state.themePref}`;
}

async function persist(state: AppState): Promise<void> {
  try {
    const { playing, ...rest } = state;
    const json = JSON.stringify(rest);
    await AsyncStorage.setItem(KEY, json);
    if (!__DEV__) return;
    // Read back the first/structurally-different write to prove the native
    // store really accepted it (import succeeds even if the module is a stub).
    const line = summary(state);
    if (!verified || line !== lastLogged) {
      lastLogged = line;
      const back = await AsyncStorage.getItem(KEY);
      verified = true;
      if (back !== json) {
        console.log(
          `[eqdebug] persist FAILED readback: ${back?.length ?? 0} != ${json.length} bytes`
        );
      } else {
        console.log(
          `[eqdebug] persist saved ${line} freq=${Math.round(state.freq)} bytes=${json.length}`
        );
      }
    }
  } catch (e) {
    // quota or storage disabled — ignore in release, matching the site
    if (__DEV__) console.log(`[eqdebug] persist save FAILED: ${String(e)}`);
  }
}

function writeNow(): void {
  if (timer !== null) {
    clearTimeout(timer);
    timer = null;
  }
  const s = pending;
  pending = null;
  pendingSince = 0;
  if (s) void persist(s);
}

export function save(state: AppState): void {
  pending = state;
  if (pendingSince === 0) pendingSince = Date.now();
  if (timer !== null) clearTimeout(timer);
  // Trailing debounce, capped so continuous changes still hit the disk.
  const wait = Math.max(0, Math.min(DELAY, MAX_WAIT - (Date.now() - pendingSince)));
  timer = setTimeout(() => {
    timer = null;
    writeNow();
  }, wait);
}

// Write immediately (app backgrounds, dev reload, root unmount).
export function flush(): void {
  writeNow();
}

export async function load(): Promise<unknown | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) {
      if (__DEV__) console.log("[eqdebug] persist load: none");
      return null;
    }
    const data = JSON.parse(raw);
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      if (__DEV__) console.log("[eqdebug] persist load: invalid payload");
      return null;
    }
    if (__DEV__) {
      const bands = Array.isArray((data as { bands?: unknown }).bands)
        ? (data as { bands: unknown[] }).bands.length
        : 0;
      console.log(`[eqdebug] persist load: bands=${bands} bytes=${raw.length}`);
    }
    return data;
  } catch (e) {
    if (__DEV__) console.log(`[eqdebug] persist load FAILED: ${String(e)}`);
    return null;
  }
}
