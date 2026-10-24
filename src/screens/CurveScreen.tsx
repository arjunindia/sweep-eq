// CurveScreen — see what the marks built: the summed response plot, the
// band list (up to the user-set limit) with quick toggles, and the preamp/EQ
// controls.

import { memo, useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import {
  Button,
  Chip,
  Divider,
  Icon,
  IconButton,
  Surface,
  Switch,
  Text,
  useTheme,
} from "react-native-paper";
import Slider from "@react-native-community/slider";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { fmtDb, fmtHz } from "../lib/dsp.ts";
import { hapticSelect } from "../lib/haptic.ts";
import { store, type Band } from "../lib/store.ts";
import { engine } from "../audio/engine.tsx";
import { useStoreSelector } from "../hooks/useStore.ts";
import { usePalette } from "../theme/theme.ts";
import { ResponseGraph } from "../components/ResponseGraph.tsx";
import { BandEditorModal } from "../components/BandEditorModal.tsx";
import { ClearBandsButton } from "../components/ClearBandsButton.tsx";
import type { TabScreenProps } from "../nav/types.ts";

const TYPE_LABEL: Record<Band["type"], string> = {
  PK: "Peak",
  LSC: "Low shelf",
  HSC: "High shelf",
};

function qLabel(q: number): string {
  return Number(q.toFixed(2)).toString();
}

// The plot follows the sweep playhead; keep that subscription inside the plot
// so the band list and EQ controls don't re-render on every frequency tick.
const CurveGraph = memo(function CurveGraph() {
  const freq = useStoreSelector((st) => st.freq);
  const bands = useStoreSelector((st) => st.bands);
  const selectedId = useStoreSelector((st) => st.selectedId);
  const draft = useStoreSelector((st) => st.draft);
  const pal = usePalette();
  const onFreq = useCallback((hz: number) => {
    // Audio first, exactly like the Tune tape: the graph never waits for a
    // React render before the oscillator glides.
    engine.setFrequency(hz);
    store.setFreq(hz);
  }, []);
  const onEngage = useCallback(() => {
    // Matching the tape: touching the graph starts the tone if it is paused.
    if (!engine.isStarted()) return;
    if (!store.get().playing) {
      engine.play();
      store.setPlaying(true);
    }
  }, []);
  const onRelease = useCallback(() => engine.snapFrequency(store.get().freq), []);
  return (
    <ResponseGraph
      freq={freq}
      bands={bands}
      selectedId={selectedId}
      draft={draft}
      pal={pal}
      onFreq={onFreq}
      onEngage={onEngage}
      onRelease={onRelease}
    />
  );
});

function CurveScreenInner({ navigation }: TabScreenProps<"Curve">) {
  const theme = useTheme();
  const pal = usePalette();
  const insets = useSafeAreaInsets();
  const bands = useStoreSelector((st) => st.bands);
  const bandLimit = useStoreSelector((st) => st.bandLimit);
  const selectedId = useStoreSelector((st) => st.selectedId);
  const eqOn = useStoreSelector((st) => st.eqOn);
  const preampDb = useStoreSelector((st) => st.preampDb);
  const preampAuto = useStoreSelector((st) => st.preampAuto);

  const [editingId, setEditingId] = useState<string | null>(null);
  const editing = bands.find((b) => b.id === editingId) || null;
  const editingIndex = bands.findIndex((b) => b.id === editingId);
  const full = bands.length >= bandLimit;

  return (
    <View style={[styles.screen, { backgroundColor: theme.colors.background }]}>
      <View style={[styles.topBar, { paddingTop: insets.top }]}>
        <Text variant="titleLarge" style={{ color: theme.colors.onSurface, fontWeight: "500" }}>
          Curve
        </Text>
        <View style={{ flex: 1 }} />
        <ClearBandsButton onCleared={() => setEditingId(null)} />
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 16 }}
      >

        {/* Response plot */}
        <Surface mode="flat" style={[styles.card, { backgroundColor: pal.surfaceContainer }]}>
          <CurveGraph />
          {bands.length > 0 && (
            <Pressable
              onPress={() => navigation.navigate("Tune")}
              style={styles.sweepHint}
              accessibilityRole="button"
              accessibilityLabel="Go to sweep"
            >
              <Icon source="swap-horizontal" size={16} color={theme.colors.onSurfaceVariant} />
              <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant }}>
                Drag or tap the curve to sweep the tone · fine-tune in Tune
              </Text>
            </Pressable>
          )}
        </Surface>

        {/* Global EQ controls */}
        <Surface mode="flat" style={[styles.card, { backgroundColor: pal.surfaceContainer }]}>
          <View style={settings.row}>
            <View style={{ flex: 1, marginRight: 12 }}>
              <Text variant="bodyLarge" style={{ color: theme.colors.onSurface }}>
                EQ engaged on tone
              </Text>
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                Applies your bands (and preamp) while the test tone plays, like the original site’s “EQ” status.
              </Text>
            </View>
            <Switch
              value={eqOn}
              onValueChange={() => {
                store.toggleEq();
                void hapticSelect();
              }}
            />
          </View>
          <Divider style={{ marginVertical: 10 }} />
          <View style={settings.row}>
            <View style={{ flex: 1, marginRight: 12 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Text variant="bodyLarge" style={{ color: theme.colors.onSurface }}>
                  Preamp
                </Text>
                <Text
                  variant="bodyLarge"
                  style={{ color: theme.colors.onSurface, fontVariant: ["tabular-nums"] }}
                >
                  {fmtDb(preampDb)}
                </Text>
                {preampAuto && (
                  <Chip compact mode="outlined" textStyle={{ fontSize: 11 }}>
                    auto
                  </Chip>
                )}
              </View>
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                {preampAuto
                  ? "Follows the biggest boost so the tone can never exceed the safe ceiling."
                  : "Manual."}
              </Text>
            </View>
            {!preampAuto && (
              <Button
                mode="text"
                compact
                onPress={() => {
                  store.setPreampAuto();
                  void hapticSelect();
                }}
              >
                Restore auto
              </Button>
            )}
          </View>
          <Slider
            style={{ width: "100%", height: 40 }}
            minimumValue={-24}
            maximumValue={0}
            step={0.5}
            value={preampDb}
            disabled={preampAuto}
            onValueChange={(v) => store.setPreamp(Math.round(v * 2) / 2)}
            minimumTrackTintColor={theme.colors.primary}
            maximumTrackTintColor={theme.colors.surfaceVariant}
            thumbTintColor={theme.colors.primary}
            accessibilityLabel="Preamp"
          />
        </Surface>

        {/* Bands */}
        <View style={styles.bandsHeader}>
          <Text variant="titleSmall" style={{ color: theme.colors.onSurface }}>
            Bands · {bands.length} of {bandLimit}{full ? " · remove one to add" : ""}
          </Text>
        </View>

        {bands.length === 0 ? (
          <Surface mode="flat" style={[styles.card, { backgroundColor: pal.surfaceContainer, minHeight: 200 }]}>
            <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 10, padding: 18 }}>
              <Icon source="waveform" size={40} color={theme.colors.outline} />
              <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, textAlign: "center" }}>
                No bands yet. Play the tone in Tune, find a spot that sounds wrong, and mark its edges — the band appears here automatically.
              </Text>
              <Button mode="contained-tonal" icon="swap-horizontal" onPress={() => navigation.navigate("Tune")}>
                Open sweep
              </Button>
            </View>
          </Surface>
        ) : (
          <View>
            {bands.map((b, i) => (
              <Pressable
                key={b.id}
                onPress={() => {
                  setEditingId(b.id);
                  store.selectBand(b.id);
                  void hapticSelect();
                }}
                android_ripple={{ color: theme.colors.onSurface + "1A", borderless: false }}
                accessible
                accessibilityLabel={`Band ${i + 1}, ${TYPE_LABEL[b.type]}, ${fmtHz(b.fc)} hertz`}
              >
                <Surface
                  mode="flat"
                  style={[
                    styles.bandRow,
                    {
                      backgroundColor:
                        b.id === selectedId ? pal.surfaceContainerHigh : pal.surfaceContainer,
                      opacity: b.enabled === false ? 0.55 : 1,
                    },
                  ]}
                >
                  <View style={styles.badge}>
                    <Text
                      variant="labelLarge"
                      style={{ color: b.id === selectedId ? theme.colors.primary : theme.colors.onSurfaceVariant }}
                    >
                      {i + 1}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text variant="bodyLarge" style={{ color: theme.colors.onSurface }} numberOfLines={1}>
                      {TYPE_LABEL[b.type]} · {fmtHz(b.fc)} Hz
                    </Text>
                    <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                      {(b.gain > 0 ? "+" : "") + b.gain.toFixed(1)} dB · Q {qLabel(b.q)}
                    </Text>
                  </View>
                  <Switch
                    value={b.enabled !== false}
                    onValueChange={(v) => {
                      store.updateBand(b.id, { enabled: v });
                      void hapticSelect();
                    }}
                    accessibilityLabel={`Band ${i + 1} on`}
                  />
                  <IconButton
                    icon="pencil"
                    size={20}
                    onPress={() => {
                      setEditingId(b.id);
                      store.selectBand(b.id);
                    }}
                    accessibilityLabel={`Edit band ${i + 1}`}
                  />
                  <IconButton
                    icon="delete-outline"
                    size={20}
                    onPress={() => store.removeBand(b.id)}
                    accessibilityLabel={`Delete band ${i + 1}`}
                  />
                </Surface>
              </Pressable>
            ))}
          </View>
        )}

      </ScrollView>

      <BandEditorModal
        band={editing}
        index={Math.max(0, editingIndex)}
        onClose={() => setEditingId(null)}
        onDelete={() => {
          if (editingId) store.removeBand(editingId);
          setEditingId(null);
          void hapticSelect();
        }}
      />
    </View>
  );
}

const settings = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
  },
});

export function CurveScreen(props: TabScreenProps<"Curve">) {
  return <CurveScreenInner {...props} />;
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
  card: {
    marginHorizontal: 12,
    marginBottom: 10,
    borderRadius: 20,
    padding: 10,
  },
  sweepHint: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 4,
  },
  bandsHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 22,
    paddingVertical: 6,
  },
  bandRow: {
    borderRadius: 16,
    marginHorizontal: 12,
    marginBottom: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  badge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
  },
});
