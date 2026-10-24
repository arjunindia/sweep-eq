// Pure PEQ text + session JSON math — port of the original `js/export.js`
// (Apache-2.0, (c) DMS / eqbyear.com). No React Native imports: runs in Node
// for tests, byte-for-byte compatible with the website's text and session
// files so sessions move freely between the phone and a desktop browser.

import type { AppState, Band } from "./store.ts";
import { FMAX, FMIN, responseDb } from "./dsp.ts";

export const PEQ_FILENAME = "sweep-eq-peq.txt";
export const WAVELET_FILENAME = "sweep-eq-graphiceq.txt";
export const SESSION_FILENAME = "sweep-eq-session.json";

// Generic parametric EQ text. Enabled bands only, sorted by fc, numbered from 1.
export function toPeqText(state: AppState): string {
  const preamp = Number(state?.preampDb) || 0;
  const lines = [`Preamp: ${preamp.toFixed(1)} dB`];
  const bands: Band[] = Array.isArray(state?.bands) ? state.bands : [];
  const on = bands.filter((b) => b && b.enabled !== false).sort((a, b) => a.fc - b.fc);
  on.forEach((b, i) => {
    lines.push(
      `Filter ${i + 1}: ON ${b.type} Fc ${Math.round(b.fc)} Hz ` +
        `Gain ${Number(b.gain).toFixed(1)} dB Q ${Number(b.q).toFixed(2)}`
    );
  });
  return lines.join("\n");
}

// Wavelet GraphicEQ text: log-spaced frequency/gain pairs, one decimal on dB,
// joined with "; ". The auto preamp is baked into every gain so Wavelet's
// own curve (no extra preamp control) reproduces the full response.
export function toWaveletText(state: AppState, points = 128): string {
  const bands: Band[] = Array.isArray(state?.bands) ? state.bands : [];
  const preamp = Number(state?.preampDb) || 0;
  const parts: string[] = [];
  let prevFreq = -1;
  for (let i = 0; i < points; i++) {
    const f = Math.round(FMIN * Math.pow(FMAX / FMIN, i / (points - 1)));
    if (f === prevFreq) continue; // log spacing rounds to duplicate Hz
    prevFreq = f;
    parts.push(`${f} ${(responseDb(bands, f) + preamp).toFixed(1)}`);
  }
  return `GraphicEQ: ${parts.join("; ")}`;
}

// Everything except the transient playing flag. Same shape the site stores.
export function sessionToJson(state: AppState): string {
  const s = state || ({} as AppState);
  return JSON.stringify(
    {
      version: 1,
      freq: s.freq,
      levelDb: s.levelDb,
      eqOn: s.eqOn,
      preampDb: s.preampDb,
      preampAuto: s.preampAuto,
      bands: (s.bands || []).map((b) => ({
        id: b.id,
        type: b.type,
        fc: b.fc,
        gain: b.gain,
        q: b.q,
        enabled: b.enabled !== false,
      })),
      selectedId: s.selectedId ?? null,
      draft: s.draft,
      themePref: s.themePref,
      bandLimit: s.bandLimit,
    },
    null,
    2
  );
}

export function sessionFromJson(text: string): unknown {
  const data = JSON.parse(text);
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("Not a Sweep EQ session.");
  }
  const bands = (data as { bands?: unknown }).bands;
  if (!Array.isArray(bands)) throw new Error("Session has no bands.");
  for (const b of bands) {
    const o = b as Record<string, unknown> | null;
    if (!o || typeof o !== "object" || !Number.isFinite(Number(o.fc))) {
      throw new Error("Session has a malformed band.");
    }
  }
  return data;
}
