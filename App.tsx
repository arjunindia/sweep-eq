// App root: theme + system chrome, restored session, the audio bridge
// (hidden WebView), and the store→engine wiring. The gate dialog lives in
// TuneScreen so audio can only start from a deliberate user gesture.

import { useEffect } from "react";
import { AppState as RNAppState, StatusBar, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { PaperProvider } from "react-native-paper";
import { NavigationContainer } from "@react-navigation/native";
import * as SystemUI from "expo-system-ui";
import { useAppStateAndTheme, navThemeFor } from "./src/theme/theme";
import { AudioWebView, engine } from "./src/audio/engine";
import { store, type AppState } from "./src/lib/store";
import * as persist from "./src/lib/persist";
import { RootTabs } from "./src/nav/RootTabs";

export default function App() {
  const { mode, paper } = useAppStateAndTheme();

  // Restore the autosaved session once (never throws), then autosave every
  // change (debounced inside the module). Subscribing only after the restore
  // resolves keeps the initial default state from overwriting the saved one.
  useEffect(() => {
    let alive = true;
    let unsubscribe: (() => void) | null = null;
    persist
      .load()
      .then((data) => {
        if (!alive) return;
        if (data) {
          const restored = store.load(data);
          if (__DEV__) {
            console.log(
              `[eqdebug] session restored: bands=${restored.bands.length} freq=${Math.round(restored.freq)}`
            );
          }
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (!alive) return;
        unsubscribe = store.subscribe((s) => persist.save(s));
      });
    return () => {
      alive = false;
      unsubscribe?.();
      // A dev reload tears the JS context down without an AppState change;
      // write any pending state before the timers disappear with it.
      persist.flush();
    };
  }, []);

  // System nav / status bar colour follows the active surface.
  useEffect(() => {
    SystemUI.setBackgroundColorAsync(paper.colors.surface).catch(() => undefined);
  }, [paper.colors.surface]);

  // Mirror store state into the engine. Only push what actually changed: a
  // drag emits ~60 updates/s, and re-sending the whole EQ graph each tick
  // would flood the WebView bridge and stall the tone between steps.
  useEffect(() => {
    let prev: AppState | null = null;
    const push = (s: AppState) => {
      if (prev === null || s.freq !== prev.freq) engine.setFrequency(s.freq);
      if (prev === null || s.levelDb !== prev.levelDb) engine.setLevel(s.levelDb);
      if (
        prev === null ||
        s.bands !== prev.bands ||
        s.eqOn !== prev.eqOn ||
        s.preampDb !== prev.preampDb
      ) {
        engine.setBands(s.bands, s.eqOn, s.preampDb);
      }
      prev = s;
    };
    push(store.get());
    return store.subscribe(push);
  }, []);

  // Leaving the foreground stops the tone and flushes autosave.
  useEffect(() => {
    const sub = RNAppState.addEventListener("change", (st) => {
      if (st !== "active") {
        if (store.get().playing) {
          engine.stop();
          store.setPlaying(false);
        }
        persist.flush();
      }
    });
    return () => {
      sub.remove();
    };
  }, []);

  return (
    <SafeAreaProvider>
      <PaperProvider theme={paper}>
        <StatusBar barStyle={mode === "dark" ? "light-content" : "dark-content"} />
      {/* A hard flex:1 host around the navigator so the tab bar always docks
          to the window edge regardless of provider layout quirks. */}
      <View style={{ flex: 1 }}>
        <NavigationContainer theme={navThemeFor(mode)}>
          <RootTabs />
        </NavigationContainer>
        {/* Hidden Web Audio bridge — one instance for the whole app life.
            Hosted in a fixed 1×1 absolute box so it can never take part in
            layout: the WebView must not influence the navigator's height. */}
        <View
          pointerEvents="none"
          style={{ position: "absolute", width: 1, height: 1, bottom: 0, left: 0, opacity: 0 }}
        >
          <AudioWebView />
        </View>
      </View>
      </PaperProvider>
    </SafeAreaProvider>
  );
}
