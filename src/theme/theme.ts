// Material 3 theme for the app. Two color sources:
//  - "brand": the hand-picked deep-teal primary / amber tertiary scheme.
//  - "dynamic": the device's Material You palette (wallpaper-derived on
//    Android 12+) read synchronously from @expo/ui. Falls back to brand on
//    other platforms and older Android versions.
// Both sources expose the same Paper MD3 theme + Palette contract used by the
// SVG tape and response graph.

import { useMemo, useSyncExternalStore } from "react";
import { Platform, useColorScheme } from "react-native";
import { MD3DarkTheme, MD3LightTheme, type MD3Theme } from "react-native-paper";
import { DarkTheme, DefaultTheme, type Theme as NavTheme } from "@react-navigation/native";
import type { MaterialColors } from "@expo/ui/jetpack-compose";
import { store, type AppState, type ColorSource } from "../lib/store.ts";

type Mode = "light" | "dark";

export const paperLightTheme: MD3Theme = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    primary: "#0E6C6F",
    onPrimary: "#FFFFFF",
    primaryContainer: "#9EF1F3",
    onPrimaryContainer: "#002021",
    secondary: "#C94B8C",
    onSecondary: "#FFFFFF",
    secondaryContainer: "#FFD9E6",
    onSecondaryContainer: "#52073A",
    tertiary: "#7A5900",
    onTertiary: "#FFFFFF",
    tertiaryContainer: "#FFDF99",
    onTertiaryContainer: "#251A00",
    error: "#B3261E",
    onError: "#FFFFFF",
    errorContainer: "#F9DEDC",
    onErrorContainer: "#410E0B",
    background: "#F8FAFA",
    onBackground: "#191C1C",
    surface: "#F8FAFA",
    onSurface: "#191C1C",
    surfaceVariant: "#DAE4E5",
    onSurfaceVariant: "#3F4949",
    onSurfaceDisabled: "#191C1C61",
    surfaceDisabled: "#191C1C0D",
    outline: "#6F7979",
    outlineVariant: "#BFC8C9",
    inverseSurface: "#2E3131",
    inverseOnSurface: "#EFF1F1",
    inversePrimary: "#9EF1F3",
    scrim: "#000000",
    backdrop: "#191C1CB2",
  },
};

export const paperDarkTheme: MD3Theme = {
  ...MD3DarkTheme,
  colors: {
    ...MD3DarkTheme.colors,
    primary: "#6CD9DD",
    onPrimary: "#003739",
    primaryContainer: "#004F53",
    onPrimaryContainer: "#9EF1F3",
    secondary: "#E9B8CE",
    onSecondary: "#43293A",
    secondaryContainer: "#5B3F50",
    onSecondaryContainer: "#FFD9E6",
    tertiary: "#FFB951",
    onTertiary: "#4A2F00",
    tertiaryContainer: "#674500",
    onTertiaryContainer: "#FFDF99",
    error: "#F2B8B5",
    onError: "#601410",
    errorContainer: "#8C1D18",
    onErrorContainer: "#F9DEDC",
    background: "#0E1415",
    onBackground: "#DDE3E3",
    surface: "#0E1415",
    onSurface: "#DDE3E3",
    surfaceVariant: "#3F4949",
    onSurfaceVariant: "#BFC8C9",
    onSurfaceDisabled: "#DDE3E337",
    surfaceDisabled: "#DDE3E30F",
    outline: "#899393",
    outlineVariant: "#3F4949",
    inverseSurface: "#DDE3E3",
    inverseOnSurface: "#2B3232",
    inversePrimary: "#0E6C6F",
    scrim: "#000000",
    backdrop: "#000000AA",
  },
};

export function resolveMode(pref: AppState["themePref"], system: "light" | "dark" | null): Mode {
  if (pref === "light" || pref === "dark") return pref;
  return system ?? "light";
}

// Raw color roles used by custom SVG/auxiliary views.
// Custom MD3.5 surface-container roles. Paper 5.15's MD3Colors predates the
// container tint set, so the paper theme does not carry them; the palette
// exists to hand them to our own components with the mode resolved.
const containerRoles = {
  light: { lowest: "#F2FDFD", low: "#F1F4F4", mid: "#ECF0F0", high: "#E6EAEA", highest: "#E0E5E5" },
  dark: { lowest: "#080D0E", low: "#161C1C", mid: "#1A2021", high: "#242A2B", highest: "#2F3535" },
};

function makeBrandPalette(mode: Mode) {
  const t = containerRoles[mode];
  const c = mode === "dark" ? paperDarkTheme.colors : paperLightTheme.colors;
  return {
    primary: c.primary,
    onPrimary: c.onPrimary,
    primaryContainer: c.primaryContainer,
    onPrimaryContainer: c.onPrimaryContainer,
    tertiary: c.tertiary,
    onTertiary: c.onTertiary,
    tertiaryContainer: c.tertiaryContainer,
    onTertiaryContainer: c.onTertiaryContainer,
    surface: c.surface,
    onSurface: c.onSurface,
    surfaceContainerLowest: t.lowest,
    surfaceContainerLow: t.low,
    surfaceContainer: t.mid,
    surfaceContainerHigh: t.high,
    surfaceContainerHighest: t.highest,
    onSurfaceVariant: c.onSurfaceVariant,
    outline: c.outline,
    outlineVariant: c.outlineVariant,
    error: c.error,
    onBackground: c.onBackground,
    background: c.background,
    scrim: c.scrim,
  };
}

export type Palette = ReturnType<typeof makeBrandPalette>;

type MaterialColorsModule = {
  getMaterialColors: (options?: { scheme?: Mode }) => MaterialColors;
  isDynamicColorAvailable: boolean;
};

// Load the Compose color API only on Android. Importing the jetpack-compose
// entry on iOS would pull in Android-only native views for no benefit.
let materialModule: MaterialColorsModule | null | undefined;

function loadMaterialModule(): MaterialColorsModule | null {
  if (materialModule !== undefined) return materialModule;
  if (Platform.OS !== "android") {
    materialModule = null;
    return null;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    materialModule = require("@expo/ui/jetpack-compose") as MaterialColorsModule;
  } catch {
    materialModule = null;
  }
  return materialModule;
}

// Android 12+ only; on iOS (and in web previews) the Compose palette API is
// not available, so the app keeps the brand scheme.
export const dynamicColorSupported =
  loadMaterialModule()?.isDynamicColorAvailable === true;

if (__DEV__) {
  console.log(`[eqdebug] theme: wallpaper colors ${dynamicColorSupported ? "available" : "unavailable"}`);
}

// Material You roles come back as #RRGGBBAA. Paper and our SVG props expect
// opaque #RRGGBB (and two components append an alpha suffix to a role), so
// normalize to six digits and build translucent roles explicitly.
const opaque = (v: string): string => v.slice(0, 7).toUpperCase();
const withAlpha = (v: string, alpha: string): string => opaque(v) + alpha;

function paperFromMaterial(c: MaterialColors, mode: Mode): MD3Theme {
  const base = mode === "dark" ? MD3DarkTheme : MD3LightTheme;
  return {
    ...base,
    colors: {
      ...base.colors,
      primary: opaque(c.primary),
      onPrimary: opaque(c.onPrimary),
      primaryContainer: opaque(c.primaryContainer),
      onPrimaryContainer: opaque(c.onPrimaryContainer),
      secondary: opaque(c.secondary),
      onSecondary: opaque(c.onSecondary),
      secondaryContainer: opaque(c.secondaryContainer),
      onSecondaryContainer: opaque(c.onSecondaryContainer),
      tertiary: opaque(c.tertiary),
      onTertiary: opaque(c.onTertiary),
      tertiaryContainer: opaque(c.tertiaryContainer),
      onTertiaryContainer: opaque(c.onTertiaryContainer),
      background: opaque(c.background),
      onBackground: opaque(c.onBackground),
      surface: opaque(c.surface),
      onSurface: opaque(c.onSurface),
      surfaceVariant: opaque(c.surfaceVariant),
      onSurfaceVariant: opaque(c.onSurfaceVariant),
      error: opaque(c.error),
      onError: opaque(c.onError),
      errorContainer: opaque(c.errorContainer),
      onErrorContainer: opaque(c.onErrorContainer),
      outline: opaque(c.outline),
      outlineVariant: opaque(c.outlineVariant),
      inverseSurface: opaque(c.inverseSurface),
      inverseOnSurface: opaque(c.inverseOnSurface),
      inversePrimary: opaque(c.inversePrimary),
      scrim: opaque(c.scrim),
      surfaceDisabled: withAlpha(c.onSurface, mode === "dark" ? "0F" : "0D"),
      onSurfaceDisabled: withAlpha(c.onSurface, mode === "dark" ? "37" : "61"),
      backdrop: withAlpha(c.scrim, mode === "dark" ? "AA" : "B2"),
      elevation: {
        level0: opaque(c.surface),
        level1: opaque(c.surfaceContainerLow),
        level2: opaque(c.surfaceContainer),
        level3: opaque(c.surfaceContainer),
        level4: opaque(c.surfaceContainerHigh),
        level5: opaque(c.surfaceContainerHighest),
      },
    },
  };
}

function paletteFromMaterial(c: MaterialColors): Palette {
  return {
    primary: opaque(c.primary),
    onPrimary: opaque(c.onPrimary),
    primaryContainer: opaque(c.primaryContainer),
    onPrimaryContainer: opaque(c.onPrimaryContainer),
    tertiary: opaque(c.tertiary),
    onTertiary: opaque(c.onTertiary),
    tertiaryContainer: opaque(c.tertiaryContainer),
    onTertiaryContainer: opaque(c.onTertiaryContainer),
    surface: opaque(c.surface),
    onSurface: opaque(c.onSurface),
    surfaceContainerLowest: opaque(c.surfaceContainerLowest),
    surfaceContainerLow: opaque(c.surfaceContainerLow),
    surfaceContainer: opaque(c.surfaceContainer),
    surfaceContainerHigh: opaque(c.surfaceContainerHigh),
    surfaceContainerHighest: opaque(c.surfaceContainerHighest),
    onSurfaceVariant: opaque(c.onSurfaceVariant),
    outline: opaque(c.outline),
    outlineVariant: opaque(c.outlineVariant),
    error: opaque(c.error),
    onBackground: opaque(c.onBackground),
    background: opaque(c.background),
    scrim: opaque(c.scrim),
  };
}

function makeNav(paper: MD3Theme, mode: Mode): NavTheme {
  const base = mode === "dark" ? DarkTheme : DefaultTheme;
  return {
    ...base,
    colors: {
      ...base.colors,
      primary: paper.colors.primary,
      background: paper.colors.background,
      card: paper.colors.surface,
      text: paper.colors.onSurface,
      border: paper.colors.outlineVariant,
      notification: paper.colors.primary,
    },
  };
}

export interface ThemeBundle {
  source: ColorSource;
  mode: Mode;
  paper: MD3Theme;
  palette: Palette;
  nav: NavTheme;
}

// Stable identities: memoized views compare palette props by reference.
const brandBundles: Record<Mode, ThemeBundle> = {
  light: {
    source: "brand",
    mode: "light",
    paper: paperLightTheme,
    palette: makeBrandPalette("light"),
    nav: makeNav(paperLightTheme, "light"),
  },
  dark: {
    source: "brand",
    mode: "dark",
    paper: paperDarkTheme,
    palette: makeBrandPalette("dark"),
    nav: makeNav(paperDarkTheme, "dark"),
  },
};

// One native read per mode, then cached. The @expo/ui helper itself only
// caches seeded palettes; the wallpaper palette is resolved here.
const materialCache: { light?: MaterialColors | null; dark?: MaterialColors | null } = {};

function readMaterialColors(mode: Mode): MaterialColors | null {
  if (!dynamicColorSupported) return null;
  const cached = materialCache[mode];
  if (cached !== undefined) return cached;
  const mod = loadMaterialModule();
  if (!mod) {
    materialCache[mode] = null;
    return null;
  }
  try {
    const colors = mod.getMaterialColors({ scheme: mode });
    materialCache[mode] = colors;
    if (__DEV__) {
      console.log(
        `[eqdebug] theme: wallpaper ${mode} primary=${colors.primary} surface=${colors.surface}`
      );
    }
    return colors;
  } catch (e) {
    materialCache[mode] = null;
    if (__DEV__) console.log(`[eqdebug] theme: wallpaper read FAILED: ${String(e)}`);
    return null;
  }
}

const dynamicBundles = new Map<Mode, ThemeBundle>();

function bundleFor(source: ColorSource, mode: Mode): ThemeBundle {
  if (source !== "dynamic" || !dynamicColorSupported) return brandBundles[mode];
  const cached = dynamicBundles.get(mode);
  if (cached) return cached;
  const colors = readMaterialColors(mode);
  const bundle: ThemeBundle = colors
    ? (() => {
        const paper = paperFromMaterial(colors, mode);
        return {
          source: "dynamic",
          mode,
          paper,
          palette: paletteFromMaterial(colors),
          nav: makeNav(paper, mode),
        };
      })()
    : brandBundles[mode];
  dynamicBundles.set(mode, bundle);
  return bundle;
}

export function resolveColorSource(pref: ColorSource | undefined): ColorSource {
  return pref === "dynamic" && dynamicColorSupported ? "dynamic" : "brand";
}

// The snapshot is the resolved theme key, not the whole store: dragging the
// sweep must not re-render every component that asks for colours.
function useThemeKey(): string {
  const systemScheme = useColorScheme();
  const subscribe = useMemo(() => (cb: () => void) => store.subscribe(cb), []);
  const getKey = () => {
    const s = store.get();
    return `${resolveColorSource(s.colorSource)}:${resolveMode(s.themePref, systemScheme)}`;
  };
  return useSyncExternalStore(subscribe, getKey, getKey);
}

function splitKey(key: string): [ColorSource, Mode] {
  const [source, mode] = key.split(":") as [ColorSource, Mode];
  return [source, mode];
}

// Palette + active theme without components needing to know the mode/source.
export function usePalette(): Palette {
  const [source, mode] = splitKey(useThemeKey());
  return bundleFor(source, mode).palette;
}

// Subscribe the tree to the active theme only.
export function useAppStateAndTheme() {
  const [source, mode] = splitKey(useThemeKey());
  const bundle = bundleFor(source, mode);
  return {
    mode,
    source,
    paper: bundle.paper,
    palette: bundle.palette,
    nav: bundle.nav,
  };
}
