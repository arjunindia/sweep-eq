# Sweep EQ — headphone EQ by ear

<a href="https://altstore.io/source/github.com/arjunindia/sweep-eq/releases/latest/download/apps.json?app=com.sweepeq.app">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/arjunindia/sweep-eq/main/assets/altstore-badge-dark.png">
    <img src="https://raw.githubusercontent.com/arjunindia/sweep-eq/main/assets/altstore-badge-light.png" alt="Download on AltStore" width="245">
  </picture>
</a>
<a href="https://github.com/arjunindia/sweep-eq/releases/latest/download/SweepEQ.apk">
  <img src="https://raw.githubusercontent.com/arjunindia/sweep-eq/main/assets/download-android-apk-badge-seeklogo.svg" alt="Download Android APK" width="245">
</a>

A mobile port of [DMS3tv's `eqbyear`](https://github.com/DMS3tv/eqbyear) ("EQ by ear"),
rebuilt for Android with Expo and Material 3-style React Native UI. The same
codebase also builds an unsigned iOS IPA for AltStore Classic. You listen to a
sine sweep, place three marks on a log-frequency tape (where the problem starts,
where it peaks, where it ends), and the app grows an 8-band parametric EQ that you
can export as a PEQ text for your favourite player.

**Trademark note:** the original project's Apache-2.0 license reserves the names
"DMS" and "EQ by ear" plus its logo for derived works, so this port ships as
"Sweep EQ". The DSP math, the workflow, and the file formats are faithful ports;
crediting the original project is preserved here and inside the app's About dialog.

## Run it (Expo Go)

1. Install **Expo Go** on your Android phone (Play Store).
2. Start the dev server from this folder on the same phone (Termux):

   ```bash
   cd ~/eqbyear/sweep-eq
   npx expo start
   ```

3. Open the printed URL in Expo Go. Since the server runs **on the same phone**,
   `exp://127.0.0.1:8081` works directly; on a second device use the LAN URL that
   `expo start` prints.

Everything in this tree runs inside Expo Go: the UI stack (Paper, React
Navigation, SVG, WebView) is pure JS/native modules bundled with Expo Go.

## What you do in the app

- **Tune tab** — sweep the tone by dragging the tape (or hold the stepping
  buttons); adjust the level (−60…−6 dB, safety-gated at start) and enable EQ.
- Mark **Start / Top / End** with the hold buttons; when all three exist, a band
  commits automatically (fc at the top mark or geometric mean of the edges,
  Q = fc/|end−start| clamped 0.3–10, ±3 dB for peak/dip).
- **Curve tab** — see the summed magnitude response; tap a band to edit its
  centre, gain (±24 dB), Q (0.1–20), or delete it; preamp is auto-set to
  −max(positive gain) (or you can override it).
- **Export tab** — the classic PEQ text (`Preamp:` + `Filter n: ON PK Fc … Hz
  Gain … dB Q …`), byte-compatible with the website, so files load both ways.
  Sessions autosave to AsyncStorage (`sweep-eq:v1`) and can be shared as JSON.

Up to 8 bands, exactly like the original; `Undo` revises marks, then removes
the newest band once the draft is empty.

Colors follow Material You on Android 12+ by default (wallpaper-derived via
`@expo/ui`), with a brand teal/amber palette available from the ⋮ menu
(**Colors**). Light/dark can follow the system or be pinned in the same menu.

## How it works

```
src/
  audio/engineSource.ts   the original Web Audio graph inside a page template
  audio/engine.tsx        hidden WebView bridge: injectJavaScript → window.__engine
  lib/dsp.ts              marks→band math, RBJ coeffs, log axis, formatting
  lib/store.ts            observable single store (fixture-compatible with site)
  lib/PeqText.ts          PEQ text + session JSON serialisation (parity layer)
  lib/peq.ts              clipboard / share-sheet helpers for PEQ + sessions
  lib/files.ts            file pick/share plumbing
  components/             SweepTape, ResponseGraph, HoldButton, BandEditorModal,
                          VolumeGate (safety gate), AppMenu
  screens/                Tune, Curve, Export
  nav/RootTabs.tsx        bottom tab navigation
  theme/theme.ts          MD3 palettes: brand teal/amber or Material You (Android 12+)
scripts/gen-assets.mjs    generates the icon set (pure Node, zlib PNG writer)
tests/                    node:test-free assert suites for dsp/store/PEQ/engine
```

Audio lives in a one-pixel hidden `WebView` running a template page with the
**exact** graph of the original engine: osc → tone gain (15 ms fades; 8 ms
frequency glide) → preamp → 8 fixed biquads → level gain → ×0.5 ceiling →
waveshaper clipper → destination. Commands (`start/play/stop/freq/level/eq`)
are coalesced to the newest value every 40 ms. The tone always stops when the
app leaves the foreground, and the gate dialog must be accepted once per
session before any audio starts.

*Escalation path:* for a native build later, swap the WebView bridge for
`react-native-audio-api` (same graph, same node names) — the engine API
(`start/play/stop/setFrequency/setLevel/setBands`) is isolated precisely so
that the UI never learns about the transport underneath.

## Development

```bash
npm run test        # dsp / store / PEQ text / engine protocol suites
npm run typecheck   # tsc --noEmit
npm run lint        # eslint (expo config)
npx expo start      # dev server
```

Regenerate assets after touching the palette: `node scripts/gen-assets.mjs`.

## Releases (tag → APK + IPA)

Pushing a `v*` tag runs `.github/workflows/release.yml`. It builds both
artifacts on GitHub-hosted runners — no EAS, Expo token, or Apple account:

- **Android** (`ubuntu-latest`): `expo prebuild` → `./gradlew assembleRelease`
  → `SweepEQ.apk`.
- **iOS** (`macos-latest`): `expo prebuild` → `xcodebuild` with code signing
  disabled → `Payload/SweepEQ.app` zipped into an unsigned `SweepEQ.ipa`.

The release job attaches `SweepEQ.apk`, `SweepEQ.ipa`, `apps.json`, and
`icon.png` to the [GitHub Release](https://github.com/arjunindia/sweep-eq/releases).

### Install via AltStore Classic

AltStore Classic re-signs the unsigned IPA with your Apple ID, so no paid
developer account is required. Add this source URL in AltStore Classic:

```
https://github.com/arjunindia/sweep-eq/releases/latest/download/apps.json
```

The source URL always points at the newest release; the JSON inside points at
that release's IPA and icon, so updates keep working across releases. A free
Apple ID gives 7-day expiry and a 3-app limit; installing/refreshing needs
AltServer on a Mac or Windows PC. The repo and releases must be public for
AltStore to fetch them.

The APK is in the same release, or:

```
https://github.com/arjunindia/sweep-eq/releases/latest/download/SweepEQ.apk
```

### Versioning and signing

Bump `expo.version` before tagging; the workflow refuses to build if the tag
(without `v`) doesn't match. Also bump `android.versionCode` and
`ios.buildNumber` so AltStore sees a new build. The app identity is
`com.sweepeq.app` in `app.json`; change it before the first release if you
need a different one.

The APK is signed with Expo's generated debug keystore, which is fine for
sideloading. For Play Store distribution, configure a release keystore.

The IPA is unsigned and intended for AltStore/Sideloadly; it is not a
TestFlight/App Store build. The generated iOS project targets iOS 16.4, so
AltStore hides it on older devices. The iOS job uses a macOS runner, which
consumes macOS Actions minutes (10× the Linux rate on private repositories).

To release:

```bash
git tag v1.0.0
git push origin v1.0.0
```

## License

Ported and adapted code: Apache-2.0, matching the original
[copyright DMS3tv](https://github.com/DMS3tv/eqbyear) and its notice. The hidden
WebView page embeds the original `audio.js` engine logic translated to a
template string — attribution preserved above and in the app.
