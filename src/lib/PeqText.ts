// Pure PEQ text + session JSON math — port of the original `js/export.js`
// (Apache-2.0, (c) DMS / eqbyear.com). No React Native imports: runs in Node
// for tests, byte-for-byte compatible with the website's text and session
// files so sessions move freely between the phone and a desktop browser.

import type { AppState, Band } from "./store.ts";
import { responseDb } from "./dsp.ts";

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

// Wavelet only accepts its own fixed 127-point frequency grid (the AutoEq
// layout — the importer rejects adding, changing or removing points), so the
// gains are sampled at exactly those frequencies. Reference:
// https://pittvandewitt.github.io/Wavelet/Import/
export const WAVELET_FREQS: number[] = [
  20, 21, 22, 23, 24, 26, 27, 29, 30, 32, 34, 36, 38, 40, 43, 45, 48, 50, 53,
  56, 59, 63, 66, 70, 74, 78, 83, 87, 92, 97, 103, 109, 115, 121, 128, 136,
  143, 151, 160, 169, 178, 188, 199, 210, 222, 235, 248, 262, 277, 292, 309,
  326, 345, 364, 385, 406, 429, 453, 479, 506, 534, 565, 596, 630, 665, 703,
  743, 784, 829, 875, 924, 977, 1032, 1090, 1151, 1216, 1284, 1357, 1433,
  1514, 1599, 1689, 1784, 1885, 1991, 2103, 2221, 2347, 2479, 2618, 2766,
  2921, 3086, 3260, 3443, 3637, 3842, 4058, 4287, 4528, 4783, 5052, 5337,
  5637, 5955, 6290, 6644, 7018, 7414, 7831, 8272, 8738, 9230, 9749, 10298,
  10878, 11490, 12137, 12821, 13543, 14305, 15110, 15961, 16860, 17809,
  18812, 19871,
];

// Wavelet GraphicEQ text: gains come from the full response at each fixed
// frequency, one decimal truncated toward zero (AutoEq's convention), joined
// with "; ". The auto preamp is baked into every gain so Wavelet's curve
// (no extra preamp control) reproduces the full response.
export function toWaveletText(state: AppState): string {
  const bands: Band[] = Array.isArray(state?.bands) ? state.bands : [];
  const preamp = Number(state?.preampDb) || 0;
  const parts: string[] = [];
  for (const f of WAVELET_FREQS) {
    const g = responseDb(bands, f) + preamp;
    const v = Math.trunc(g * 10) / 10;
    const s = Math.abs(v).toFixed(1);
    parts.push(`${f} ${g < 0 ? "-" : ""}${s}`);
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
