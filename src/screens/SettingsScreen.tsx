// SettingsScreen — app-level preferences and information. The old ⋮ overflow
// menu lived here, except "Remove all bands", which stays a direct button in
// each working screen's app bar.

import { useCallback, useState } from "react";
import { Linking, Platform, ScrollView, StyleSheet, View } from "react-native";
import {
  Button,
  Dialog,
  Divider,
  List,
  Portal,
  SegmentedButtons,
  Surface,
  Text,
  useTheme,
} from "react-native-paper";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { hapticSelect } from "../lib/haptic.ts";
import { BAND_LIMIT_OPTIONS, store, type ColorSource, type ThemePref } from "../lib/store.ts";
import { useStoreSelector } from "../hooks/useStore.ts";
import { dynamicColorSupported, usePalette } from "../theme/theme.ts";
import type { TabScreenProps } from "../nav/types.ts";

const REPO_URL = "https://github.com/DMS3tv/eqbyear";
const SITE_URL = "https://eqbyear.com";

type DialogKind = "none" | "about" | "help";

export function SettingsScreen(_props: TabScreenProps<"Settings">) {
  const theme = useTheme();
  const pal = usePalette();
  const insets = useSafeAreaInsets();
  const themePref = useStoreSelector((st) => st.themePref);
  const colorSource = useStoreSelector((st) => st.colorSource);
  const bandLimit = useStoreSelector((st) => st.bandLimit);
  const bandCount = useStoreSelector((st) => st.bands.length);
  const [dialog, setDialog] = useState<DialogKind>("none");

  const setThemePref = useCallback((pref: ThemePref) => {
    store.setThemePref(pref);
    hapticSelect();
  }, []);

  const setColorSource = useCallback((source: ColorSource) => {
    store.setColorSource(source);
    hapticSelect();
  }, []);

  const changeBandLimit = useCallback((limit: number) => {
    store.setBandLimit(limit);
    hapticSelect();
  }, []);

  // What the theme actually resolves to right now (dynamic needs Android 12+).
  const effectiveSource =
    colorSource === "dynamic" && dynamicColorSupported ? "dynamic" : "brand";

  return (
    <View style={[styles.screen, { backgroundColor: theme.colors.background }]}>
      <View style={[styles.topBar, { paddingTop: insets.top }]}>
        <Text variant="titleLarge" style={{ color: theme.colors.onSurface, fontWeight: "500" }}>
          Settings
        </Text>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content}>
        <Text variant="labelLarge" style={[styles.sectionLabel, { color: theme.colors.onSurfaceVariant }]}>
          Appearance
        </Text>
        <Surface mode="flat" style={[styles.card, { backgroundColor: pal.surfaceContainer }]}>
          <Text variant="titleMedium" style={{ color: theme.colors.onSurface }}>
            Theme
          </Text>
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 2, marginBottom: 12 }}>
            Follow the system or pin Sweep EQ to light or dark.
          </Text>
          <SegmentedButtons
            value={themePref}
            onValueChange={(v) => setThemePref(v as ThemePref)}
            buttons={[
              { value: "system", label: "System" },
              { value: "light", label: "Light" },
              { value: "dark", label: "Dark" },
            ]}
          />

          {Platform.OS === "android" && (
            <>
              <Divider style={{ marginVertical: 16 }} />
              <Text variant="titleMedium" style={{ color: theme.colors.onSurface }}>
                Colors
              </Text>
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 2, marginBottom: 12 }}>
                {dynamicColorSupported
                  ? "Use the device wallpaper palette or the brand teal."
                  : "Wallpaper colors need Android 12 or newer. Brand teal is active."}
              </Text>
              <SegmentedButtons
                value={effectiveSource}
                onValueChange={(v) => setColorSource(v as ColorSource)}
                buttons={[
                  {
                    value: "dynamic",
                    label: "Wallpaper",
                    disabled: !dynamicColorSupported,
                  },
                  { value: "brand", label: "Brand teal" },
                ]}
              />
            </>
          )}
        </Surface>

        <Text variant="labelLarge" style={[styles.sectionLabel, { color: theme.colors.onSurfaceVariant }]}>
          Bands
        </Text>
        <Surface mode="flat" style={[styles.card, { backgroundColor: pal.surfaceContainer }]}>
          <Text variant="titleMedium" style={{ color: theme.colors.onSurface }}>
            Maximum bands
          </Text>
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 2, marginBottom: 12 }}>
            The original 8-band limit is the default. Raise it to 12 or 16 to fit more corrections; some players cap how many filters they import.
          </Text>
          <SegmentedButtons
            value={String(bandLimit)}
            onValueChange={(v) => changeBandLimit(Number(v))}
            buttons={BAND_LIMIT_OPTIONS.map((n) => ({
              value: String(n),
              label: String(n),
              disabled: n < bandCount,
            }))}
          />
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 8 }}>
            {bandCount} band{bandCount === 1 ? "" : "s"} in this session. The limit can’t go below that.
          </Text>
        </Surface>

        <Text variant="labelLarge" style={[styles.sectionLabel, { color: theme.colors.onSurfaceVariant }]}>
          Help & about
        </Text>
        <Surface mode="flat" style={[styles.listCard, { backgroundColor: pal.surfaceContainer }]}>
          <List.Item
            title="How it works"
            description="The sweep, marks, and bands in four steps"
            left={(props) => <List.Icon {...props} icon="help-circle-outline" />}
            right={(props) => <List.Icon {...props} icon="chevron-right" />}
            onPress={() => setDialog("help")}
          />
          <Divider />
          <List.Item
            title="About Sweep EQ"
            description="Credits, source, and the original tool"
            left={(props) => <List.Icon {...props} icon="information-outline" />}
            right={(props) => <List.Icon {...props} icon="chevron-right" />}
            onPress={() => setDialog("about")}
          />
        </Surface>
      </ScrollView>

      <Portal>
        {/* How it works */}
        <Dialog visible={dialog === "help"} onDismiss={() => setDialog("none")}>
          <Dialog.Title>How it works</Dialog.Title>
          <Dialog.Content style={{ gap: 10 }}>
            <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
              1. Put your headphones on, set the level, play the tone.
            </Text>
            <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
              2. Drag the tape slowly and listen for a colouration — a whine (peak) or a thin, faint spot (dip).
            </Text>
            <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
              3. Mark the shape: Start at the left edge, Top at the middle, End at the right edge. The band is added automatically.
            </Text>
            <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
              4. Repeat up to {bandLimit} bands, check the response on Curve, then paste the PEQ into your player.
            </Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setDialog("none")}>Got it</Button>
          </Dialog.Actions>
        </Dialog>

        {/* About */}
        <Dialog visible={dialog === "about"} onDismiss={() => setDialog("none")}>
          <Dialog.Title>About</Dialog.Title>
          <Dialog.Content style={{ gap: 10 }}>
            <Text variant="bodyMedium" style={{ color: theme.colors.onSurface }}>
              Sweep EQ is a mobile companion that finds parametric-EQ corrections for headphones by ear: a sine sweep you scrub across, three marks per problem you hear, and an exportable {bandLimit}-band PEQ.
            </Text>
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
              A task-specific port of “EQ by ear” by DMS (eqbyear.com), Apache-2.0. Unofficial; not affiliated. It uses the same DSP math and file format as the original site.
            </Text>
            <List.Item
              title="eqbyear.com"
              description="The original web tool"
              left={(props) => <List.Icon {...props} icon="link" />}
              onPress={() =>
                Linking.openURL(SITE_URL).catch(() => {
                  /* no browser */
                })
              }
              style={{ marginLeft: -8 }}
            />
            <List.Item
              title="Source repository"
              description="Original project and licensing"
              left={(props) => <List.Icon {...props} icon="github" />}
              onPress={() =>
                Linking.openURL(REPO_URL).catch(() => {
                  /* no browser */
                })
              }
              style={{ marginLeft: -8 }}
            />
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setDialog("none")}>Close</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 10,
    gap: 2,
  },
  content: {
    paddingTop: 4,
    paddingBottom: 24,
  },
  sectionLabel: {
    paddingHorizontal: 22,
    marginTop: 8,
    marginBottom: 6,
  },
  card: {
    marginHorizontal: 12,
    marginBottom: 18,
    borderRadius: 20,
    padding: 14,
  },
  listCard: {
    marginHorizontal: 12,
    marginBottom: 18,
    borderRadius: 20,
    overflow: "hidden",
  },
});
