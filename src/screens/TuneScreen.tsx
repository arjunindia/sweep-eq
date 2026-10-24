// TuneScreen — the core work surface: play the sine tone, scrub the tape,
// and capture three marks per problem you hear. Mirrors the site's sweep +
// mark flow with native Material 3 ergonomics: big touch targets, haptic
// feedback, an inline level control, and instant auto-commit with Undo.
//
// Rendering is split so that moving the sweep only re-renders the readout and
// the tape, never the rest of the screen: each section subscribes to its own
// slice of the store (see useStoreSelector).

import { memo, useCallback, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import {
  Button,
  Chip,
  Icon,
  IconButton,
  Surface,
  Text,
  useTheme,
} from "react-native-paper";
import Slider from "@react-native-community/slider";
import { useKeepAwake } from "expo-keep-awake";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { fmtDb, fmtHz } from "../lib/dsp.ts";
import { type Draft } from "../lib/store.ts";
import { store } from "../lib/store.ts";
import { useStoreSelector } from "../hooks/useStore.ts";
import { usePalette } from "../theme/theme.ts";
import { engine } from "../audio/engine.tsx";
import { SweepTape } from "../components/SweepTape.tsx";
import { HoldButton } from "../components/HoldButton.tsx";
import { ClearBandsButton } from "../components/ClearBandsButton.tsx";
import { VolumeGate } from "../components/VolumeGate.tsx";
import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import type { RootTabParamList } from "../nav/types.ts";

const MARK_LABEL = { start: "Start", top: "Top", end: "End" } as const;
const MARK_ORDER = ["start", "top", "end"] as const;
type DraftMarkKey = (typeof MARK_ORDER)[number];

// HoldButton never depends on the sweep; keep it out of the per-frame render.
const StaticHoldButton = memo(HoldButton);

// Readout + tape: the only part of the screen that follows the frequency.
const FreqStage = memo(function FreqStage({ onEngage }: { onEngage: () => void }) {
  const freq = useStoreSelector((st) => st.freq);
  const bands = useStoreSelector((st) => st.bands);
  const selectedId = useStoreSelector((st) => st.selectedId);
  const draft = useStoreSelector((st) => st.draft);
  const playing = useStoreSelector((st) => st.playing);
  const pal = usePalette();
  const theme = useTheme();

  const step = useCallback((mult: number) => {
    store.setFreq(store.get().freq * mult);
  }, []);
  const lower = useCallback(() => step(0.97), [step]);
  const raise = useCallback(() => step(1.03), [step]);
  const onFreq = useCallback((hz: number) => {
    // Audio first (direct, no React round-trip), then the store for the UI.
    engine.setFrequency(hz);
    store.setFreq(hz);
  }, []);
  const onRelease = useCallback(() => engine.snapFrequency(store.get().freq), []);

  return (
    <>
      <View style={styles.readoutRow}>
        <StaticHoldButton icon="minus" onPress={lower} accessibilityLabel="Lower frequency" />
        <View style={styles.readout}>
          <Text
            variant="displaySmall"
            style={{
              color: theme.colors.onSurface,
              fontVariant: ["tabular-nums"],
              textAlign: "center",
              fontWeight: "500",
            }}
          >
            {fmtHz(freq)}
          </Text>
          <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
            Hz
          </Text>
        </View>
        <StaticHoldButton icon="plus" onPress={raise} accessibilityLabel="Raise frequency" />
      </View>

      <SweepTape
        freq={freq}
        bands={bands}
        selectedId={selectedId}
        draft={draft}
        playing={playing}
        pal={pal}
        onFreq={onFreq}
        onEngage={onEngage}
        onRelease={onRelease}
      />
    </>
  );
});

const ToneButton = memo(function ToneButton({ onToggle }: { onToggle: () => void }) {
  const playing = useStoreSelector((st) => st.playing);
  const theme = useTheme();
  return (
    <Button
      mode={playing ? "contained-tonal" : "contained"}
      contentStyle={{ height: 52 }}
      icon={playing ? "stop" : "play"}
      onPress={onToggle}
      buttonColor={playing ? theme.colors.primaryContainer : theme.colors.primary}
      textColor={playing ? theme.colors.onPrimaryContainer : theme.colors.onPrimary}
      accessible
      accessibilityLabel={playing ? "Stop tone" : "Play tone"}
    >
      {playing ? "Stop tone" : "Play tone"}
    </Button>
  );
});

const LevelRow = memo(function LevelRow() {
  const levelDb = useStoreSelector((st) => st.levelDb);
  const theme = useTheme();
  const onLevel = useCallback((v: number) => store.setLevel(Math.round(v)), []);
  return (
    <View style={styles.levelRow}>
      <Icon
        size={20}
        source={levelDb > -24 ? "volume-high" : levelDb > -40 ? "volume-medium" : "volume-low"}
        color={theme.colors.onSurfaceVariant}
      />
      <Slider
        style={{ flex: 1 }}
        minimumValue={-60}
        maximumValue={-6}
        step={1}
        value={levelDb}
        onValueChange={onLevel}
        minimumTrackTintColor={theme.colors.primary}
        maximumTrackTintColor={theme.colors.surfaceVariant}
        thumbTintColor={theme.colors.primary}
        accessibilityLabel="Level in decibels"
      />
      <Text
        variant="bodyMedium"
        style={{
          color: theme.colors.onSurfaceVariant,
          fontVariant: ["tabular-nums"],
          width: 66,
          textAlign: "right",
        }}
      >
        {fmtDb(levelDb)}
      </Text>
    </View>
  );
});

const MarksCard = memo(function MarksCard({ onFull }: { onFull: () => void }) {
  const bands = useStoreSelector((st) => st.bands);
  const draft = useStoreSelector((st) => st.draft);
  const bandLimit = useStoreSelector((st) => st.bandLimit);
  const pal = usePalette();
  const theme = useTheme();

  const full = bands.length >= bandLimit;
  const nextMark = MARK_ORDER.find((k) => draft[k] == null) || null;
  const topOnly = draft.top != null && draft.start == null && draft.end == null;
  const draftEmpty = draft.start == null && draft.top == null && draft.end == null;

  const mark = useCallback(
    (which: DraftMarkKey) => {
      if (store.get().bands.length >= bandLimit) {
        onFull();
        return;
      }
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
      store.mark(which);
    },
    [bandLimit, onFull]
  );

  const setKind = useCallback((kind: Draft["kind"]) => {
    store.setDraftKind(kind);
    void Haptics.selectionAsync().catch(() => undefined);
  }, []);

  const addBand = useCallback(() => {
    store.commitDraft();
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
  }, []);

  const undo = useCallback(() => {
    store.undo();
    void Haptics.selectionAsync().catch(() => undefined);
  }, []);

  const clearDraft = useCallback(() => {
    store.clearDraft();
    void Haptics.selectionAsync().catch(() => undefined);
  }, []);

  return (
    <Surface
      mode="flat"
      style={[styles.card, { backgroundColor: pal.surfaceContainer, marginBottom: 8 }]}
    >
      <View style={styles.markHeader}>
        <Text variant="titleSmall" style={{ color: theme.colors.onSurface, flex: 1 }} numberOfLines={1}>
          Mark the spot
        </Text>
        <Chip
          mode={draft.kind === "peak" ? "flat" : "outlined"}
          onPress={() => setKind("peak")}
          selected={draft.kind === "peak"}
          style={styles.kindChip}
          textStyle={{ color: theme.colors.onSurfaceVariant }}
        >
          Peak · cut
        </Chip>
        <Chip
          mode={draft.kind === "dip" ? "flat" : "outlined"}
          onPress={() => setKind("dip")}
          selected={draft.kind === "dip"}
          style={styles.kindChip}
          textStyle={{ color: theme.colors.onSurfaceVariant }}
        >
          Dip · boost
        </Chip>
      </View>

      <View style={styles.marks}>
        {MARK_ORDER.map((k) => {
          const value = draft[k];
          const isNext = k === nextMark;
          const taken = value != null;
          return (
            <Pressable
              key={k}
              onPress={() => mark(k)}
              accessibilityRole="button"
              accessibilityLabel={`${MARK_LABEL[k]} mark at current frequency`}
              android_ripple={{ color: theme.colors.onSurface + "22", radius: 40, borderless: false }}
              style={[
                styles.markTile,
                {
                  backgroundColor: taken
                    ? theme.colors.tertiaryContainer
                    : isNext
                      ? theme.colors.primaryContainer
                      : pal.surfaceContainerHigh,
                  borderWidth: isNext && !taken ? 1.5 : 0,
                  borderColor: theme.colors.primary,
                },
              ]}
            >
              <Text
                variant="labelMedium"
                style={{
                  color: taken
                    ? theme.colors.onTertiaryContainer
                    : isNext
                      ? theme.colors.onPrimaryContainer
                      : theme.colors.onSurfaceVariant,
                }}
              >
                {MARK_LABEL[k]}
              </Text>
              <Text
                variant="titleMedium"
                style={{
                  color: taken
                    ? theme.colors.onTertiaryContainer
                    : isNext
                      ? theme.colors.onPrimaryContainer
                      : theme.colors.onSurfaceVariant,
                  fontVariant: ["tabular-nums"],
                }}
              >
                {taken ? fmtHz(value as number) : "\u2014"}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.markFooter}>
        <Button mode="text" compact icon="plus" disabled={!topOnly || full} onPress={addBand}>
          Add band
        </Button>
        <View style={{ flex: 1 }} />
        <IconButton
          icon="undo-variant"
          disabled={draftEmpty && !bands.length}
          onPress={undo}
          accessibilityLabel="Undo"
        />
        <IconButton
          icon="restore"
          disabled={draftEmpty}
          onPress={clearDraft}
          accessibilityLabel="Clear draft marks"
        />
      </View>

      <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
        Drag the tape while the tone plays. Mark the left edge, the middle, then the right edge of
        the spot you hear.
      </Text>
    </Surface>
  );
});

function TuneScreenInner({ navigation }: BottomTabScreenProps<RootTabParamList, "Tune">) {
  const theme = useTheme();
  const pal = usePalette();
  const insets = useSafeAreaInsets();
  // Only the header count and the volume gate track state at screen level;
  // the sweep lives in FreqStage below.
  const bands = useStoreSelector((st) => st.bands);
  const bandLimit = useStoreSelector((st) => st.bandLimit);
  const levelDb = useStoreSelector((st) => st.levelDb);
  useKeepAwake();

  const [gateVisible, setGateVisible] = useState(true);
  const [gateBusy, setGateBusy] = useState(false);
  const [snack, setSnack] = useState<string | null>(null);
  const prevBands = useRef(bands);
  const snackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showSnack = useCallback((text: string, ms = 3500) => {
    setSnack(text);
    if (snackTimer.current) clearTimeout(snackTimer.current);
    snackTimer.current = setTimeout(() => setSnack(null), ms);
  }, []);

  // Ignore the very first bands change: that's the autosaved session being
  // restored, not a band the user just marked.
  const snacksArmed = useRef(false);
  useEffect(() => {
    const t = setTimeout(() => {
      snacksArmed.current = true;
    }, 1200);
    return () => clearTimeout(t);
  }, []);

  // Band added feedback — only for genuine single additions.
  useEffect(() => {
    const before = prevBands.current;
    prevBands.current = bands;
    if (!snacksArmed.current) return;
    if (bands.length !== before.length + 1) return;
    const known = new Set(before.map((b) => b.id));
    const newest = bands.find((b) => !known.has(b.id));
    if (!newest) return;
    showSnack(`Band ${bands.length} added at ${fmtHz(newest.fc)} Hz`);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
  }, [bands, showSnack]);

  const bandCountLabel = `${bands.length} of ${bandLimit}`;

  const startTone = useCallback(() => {
    if (!engine.isStarted()) {
      setGateVisible(true);
      return;
    }
    if (!store.get().playing) {
      engine.pausePreview();
      engine.play();
      store.setPlaying(true);
    }
  }, []);

  const togglePlay = useCallback(() => {
    if (!engine.isStarted()) {
      setGateVisible(true);
      return;
    }
    if (store.get().playing) {
      engine.stop();
      store.setPlaying(false);
    } else {
      engine.pausePreview();
      engine.play();
      store.setPlaying(true);
    }
  }, []);

  const confirmGate = useCallback(async () => {
    setGateBusy(true);
    try {
      await engine.start();
    } finally {
      setGateBusy(false);
      setGateVisible(false);
    }
  }, []);

  const fullNotice = useCallback(() => {
    showSnack(`${bandLimit} of ${bandLimit} · remove a band in Curve to add more`);
  }, [showSnack, bandLimit]);

  return (
    <View style={[styles.screen, { backgroundColor: theme.colors.background }]}>
      {/* Top bar */}
      <View style={[styles.topBar, { paddingTop: insets.top }]}>
        <Text variant="titleLarge" style={{ color: theme.colors.onSurface, fontWeight: "500" }}>
          Tune
        </Text>
        <View style={{ flex: 1 }} />
        <Chip
          icon="equalizer"
          onPress={() => navigation.navigate("Curve")}
          textStyle={{ color: theme.colors.onSurfaceVariant }}
          style={{ marginRight: 2 }}
        >
          {bandCountLabel}
        </Chip>
        <ClearBandsButton />
      </View>

      <View style={{ height: 10 }} />

      {/* Tone stage — the tape flexes to absorb every spare pixel of height. */}
      <Surface
        mode="flat"
        style={[styles.card, styles.stageCard, { backgroundColor: pal.surfaceContainer }]}
      >
        <FreqStage onEngage={startTone} />

        <View style={{ height: 10 }} />

        <ToneButton onToggle={togglePlay} />

        <LevelRow />
      </Surface>

      <MarksCard onFull={fullNotice} />

      {/* Snackbar zone (fixed height so the layout never jumps) */}
      {snack ? (
        <View style={[styles.snack, { backgroundColor: theme.colors.inverseSurface }]}>
          <Text style={{ color: theme.colors.inverseOnSurface, flex: 1 }} numberOfLines={2}>
            {snack}
          </Text>
          {snack.startsWith("Band") && (
            <Button
              compact
              mode="text"
              textColor={theme.colors.inversePrimary}
              onPress={() => {
                store.undo();
                setSnack(null);
              }}
            >
              Undo
            </Button>
          )}
        </View>
      ) : (
        <View style={styles.snackOutlet} />
      )}

      <VolumeGate
        visible={gateVisible && !gateBusy}
        levelDb={levelDb}
        onLevel={(db) => store.setLevel(db)}
        onClose={() => setGateVisible(false)}
        onStart={() => {
          void confirmGate();
        }}
        busy={gateBusy}
      />
    </View>
  );
}

export function TuneScreen(props: BottomTabScreenProps<RootTabParamList, "Tune">) {
  return <TuneScreenInner {...props} />;
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingBottom: 4,
    gap: 2,
  },
  card: {
    marginHorizontal: 12,
    borderRadius: 20,
    padding: 12,
  },
  stageCard: {
    flex: 1,
  },
  readoutRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  readout: {
    flex: 1,
    alignItems: "center",
  },
  levelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 6,
  },
  markHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
    gap: 6,
  },
  kindChip: {
    marginHorizontal: 1,
  },
  marks: {
    flexDirection: "row",
    gap: 8,
  },
  markTile: {
    flex: 1,
    height: 62,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  markFooter: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 2,
  },
  snack: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    marginHorizontal: 12,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  snackOutlet: {
    height: 46,
  },
});
