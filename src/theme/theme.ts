// Material 3 theme for the app. Built on React Native Paper's MD3 themes with
// custom color roles: a deep teal primary and an amber tertiary that carries
// the "mark" accent (a nod to the original site's yellow marks, redesigned
// for Android). Everything else follows Material 3 baseline behaviour.

import { useMemo, useSyncExternalStore } from "react";
import { MD3DarkTheme, MD3LightTheme, type MD3Theme } from "react-native-paper";
import { DarkTheme, DefaultTheme, type Theme as NavTheme } from "@react-navigation/native";
import { useColorScheme } from "react-native";
import { store, type AppState } from "../lib/store.ts";

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

export function resolveMode(pref: AppState["themePref"], system: "light" | "dark" | null): "light" | "dark" {
  if (pref === "light" || pref === "dark") return pref;
  return system ?? "light";
}

const lightNav: NavTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: paperLightTheme.colors.primary,
    background: paperLightTheme.colors.background,
    card: paperLightTheme.colors.surface,
    text: paperLightTheme.colors.onSurface,
    border: paperLightTheme.colors.outlineVariant,
    notification: paperLightTheme.colors.primary,
  },
};

const darkNav: NavTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: paperDarkTheme.colors.primary,
    background: paperDarkTheme.colors.background,
    card: paperDarkTheme.colors.surface,
    text: paperDarkTheme.colors.onSurface,
    border: paperDarkTheme.colors.outlineVariant,
    notification: paperDarkTheme.colors.primary,
  },
};

export function navThemeFor(mode: "light" | "dark"): NavTheme {
  return mode === "dark" ? darkNav : lightNav;
}

// Raw color roles used by custom SVG/auxiliary views.
// Custom MD3.5 surface-container roles. Paper 5.15's MD3Colors predates the
// container tint set, so the paper theme does not carry them; the palette
// exists to hand them to our own components with the mode resolved.
const containerRoles = {
  light: { lowest: "#F2FDFD", low: "#F1F4F4", mid: "#ECF0F0", high: "#E6EAEA", highest: "#E0E5E5" },
  dark: { lowest: "#080D0E", low: "#161C1C", mid: "#1A2021", high: "#242A2B", highest: "#2F3535" },
};

function makePalette(mode: "light" | "dark") {
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

export type Palette = ReturnType<typeof makePalette>;

// Stable identities per mode: memoized views can compare palette props by
// reference instead of re-rendering on every store change.
const palettes = {
  light: makePalette("light"),
  dark: makePalette("dark"),
} as const;

export function palette(mode: "light" | "dark"): Palette {
  return palettes[mode];
}

// Palette + active theme without components needing to know the mode.
// The snapshot is the resolved mode, not the whole store: dragging the sweep
// must not re-render every component that asks for colours.
export function usePalette(): Palette {
  const systemScheme = useColorScheme();
  const subscribe = useMemo(() => (cb: () => void) => store.subscribe(cb), []);
  const getMode = () => resolveMode(store.get().themePref, systemScheme);
  const mode = useSyncExternalStore(subscribe, getMode, getMode);
  return palette(mode);
}

// Subscribe the tree to the active theme only.
export function useAppStateAndTheme() {
  const systemScheme = useColorScheme();
  const subscribe = useMemo(() => (cb: () => void) => store.subscribe(cb), []);
  const getMode = () => resolveMode(store.get().themePref, systemScheme);
  const mode = useSyncExternalStore(subscribe, getMode, getMode);
  return {
    mode,
    paper: mode === "dark" ? paperDarkTheme : paperLightTheme,
  };
}
