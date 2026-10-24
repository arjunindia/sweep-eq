// PreviewScreen — A/B the current EQ curve against a real song.
//
// Apple's iTunes Search API supplies 30-second previews and artwork. The
// hidden WebView owns a single <audio> element whose media source feeds the
// same preamp → 16 biquads → clipper graph as the sweep, so "EQ on" and
// "Bypass" are the same filters the user hears everywhere else in the app.

import { memo, useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Keyboard,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import {
  Button,
  Chip,
  Icon,
  Searchbar,
  SegmentedButtons,
  Surface,
  Text,
  useTheme,
} from "react-native-paper";
import Slider from "@react-native-community/slider";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { fmtDb } from "../lib/dsp.ts";
import { hapticSelect } from "../lib/haptic.ts";
import {
  PREVIEW_RESULT_LIMIT,
  searchPreviewTracks,
  type PreviewTrack,
} from "../lib/itunes.ts";
import { store } from "../lib/store.ts";
import { useStoreSelector } from "../hooks/useStore.ts";
import { usePalette } from "../theme/theme.ts";
import { engine, usePreviewState } from "../audio/engine.tsx";
import { VolumeGate } from "../components/VolumeGate.tsx";
import type { TabScreenProps } from "../nav/types.ts";

function fmtTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const whole = Math.floor(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

function Artwork({ uri, size }: { uri: string; size: number }) {
  const theme = useTheme();
  if (!uri) {
    return (
      <View
        style={[
          styles.artwork,
          {
            width: size,
            height: size,
            borderRadius: size >= 64 ? 14 : 10,
            backgroundColor: theme.colors.surfaceVariant,
            alignItems: "center",
            justifyContent: "center",
          },
        ]}
      >
        <Icon source="music-note" size={size * 0.42} color={theme.colors.onSurfaceVariant} />
      </View>
    );
  }
  return (
    <Image
      source={{ uri }}
      style={[
        styles.artwork,
        { width: size, height: size, borderRadius: size >= 64 ? 14 : 10 },
      ]}
      resizeMode="cover"
    />
  );
}

interface NowPlayingProps {
  track: PreviewTrack;
  onPlayPause: () => void;
  onSeek: (seconds: number) => void;
}

function NowPlayingCard({ track, onPlayPause, onSeek }: NowPlayingProps) {
  const theme = useTheme();
  const pal = usePalette();
  const preview = usePreviewState();
  const eqOn = useStoreSelector((st) => st.eqOn);
  const bands = useStoreSelector((st) => st.bands);
  const preampDb = useStoreSelector((st) => st.preampDb);
  const [seekValue, setSeekValue] = useState<number | null>(null);

  const duration = preview.duration > 0 ? preview.duration : 0;
  const position = seekValue ?? Math.min(preview.currentTime, duration || preview.currentTime);
  const loading = preview.status === "loading";
  const playing = preview.status === "playing";
  const activeBands = bands.filter((b) => b.enabled !== false).length;

  const toggleEq = (value: string) => {
    const wantOn = value === "on";
    if (wantOn === eqOn) return;
    store.toggleEq();
    hapticSelect();
  };

  return (
    <Surface
      mode="flat"
      style={[styles.nowCard, { backgroundColor: pal.surfaceContainer, borderRadius: 20 }]}
    >
      <View style={styles.nowRow}>
        <Artwork uri={track.artworkUrl} size={68} />
        <View style={styles.nowMeta}>
          <Text
            variant="titleMedium"
            numberOfLines={1}
            style={{ color: theme.colors.onSurface }}
          >
            {track.title}
          </Text>
          <Text
            variant="bodyMedium"
            numberOfLines={1}
            style={{ color: theme.colors.onSurfaceVariant }}
          >
            {track.artist}
          </Text>
          <Text
            variant="bodySmall"
            numberOfLines={1}
            style={{ color: theme.colors.onSurfaceVariant, opacity: 0.85 }}
          >
            {track.album || "Apple Music preview"}
          </Text>
        </View>
        <Pressable
          onPress={onPlayPause}
          accessibilityRole="button"
          accessibilityLabel={playing || loading ? "Pause preview" : "Play preview"}
          style={({ pressed }) => [
            styles.playButton,
            {
              backgroundColor: theme.colors.primary,
              opacity: pressed ? 0.78 : 1,
            },
          ]}
        >
          {loading ? (
            <ActivityIndicator color={theme.colors.onPrimary} />
          ) : (
            <Icon
              source={playing ? "pause" : "play"}
              size={30}
              color={theme.colors.onPrimary}
            />
          )}
        </Pressable>
      </View>

      <View style={styles.progressBlock}>
        <Slider
          style={styles.progress}
          minimumValue={0}
          maximumValue={Math.max(duration, 1)}
          value={position}
          step={0.1}
          disabled={duration <= 0}
          onSlidingStart={(v) => setSeekValue(v)}
          onValueChange={(v) => setSeekValue(v)}
          onSlidingComplete={(v) => {
            setSeekValue(null);
            onSeek(v);
          }}
          minimumTrackTintColor={theme.colors.primary}
          maximumTrackTintColor={theme.colors.surfaceVariant}
          thumbTintColor={theme.colors.primary}
          accessibilityLabel="Preview position"
        />
        <View style={styles.timeRow}>
          <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
            {fmtTime(position)}
          </Text>
          <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
            {duration > 0 ? fmtTime(duration) : "--:--"}
          </Text>
        </View>
      </View>

      <View style={styles.abHeader}>
        <View style={{ flex: 1 }}>
          <Text variant="titleSmall" style={{ color: theme.colors.onSurface }}>
            A/B the curve
          </Text>
          <Text
            variant="bodySmall"
            style={{ color: theme.colors.onSurfaceVariant, marginTop: 1 }}
          >
            {eqOn
              ? `${activeBands} active band${activeBands === 1 ? "" : "s"} · preamp ${fmtDb(preampDb)}`
              : "Bypass — the preview is flat"}
          </Text>
        </View>
        <Text variant="labelSmall" style={{ color: theme.colors.primary }}>
          30 sec preview
        </Text>
      </View>
      <SegmentedButtons
        value={eqOn ? "on" : "off"}
        onValueChange={toggleEq}
        density="small"
        buttons={[
          { value: "off", label: "Bypass", icon: "equalizer-outline" },
          { value: "on", label: "EQ on", icon: "equalizer" },
        ]}
      />

      {preview.status === "error" ? (
        <Text variant="bodySmall" style={{ color: theme.colors.error, marginTop: 10 }}>
          {preview.error || "The preview could not play. Tap play to retry."}
        </Text>
      ) : null}
      <Text
        variant="bodySmall"
        style={{ color: theme.colors.onSurfaceVariant, marginTop: 10 }}
      >
        Tap Bypass or EQ on while the song plays — the filters glide between states.
      </Text>
    </Surface>
  );
}

interface TrackRowProps {
  track: PreviewTrack;
  active: boolean;
  onPress: (track: PreviewTrack) => void;
}

const TrackRow = memo(function TrackRow({ track, active, onPress }: TrackRowProps) {
  const theme = useTheme();
  const pal = usePalette();
  return (
    <Pressable
      onPress={() => onPress(track)}
      accessibilityRole="button"
      accessibilityLabel={`Play preview of ${track.title} by ${track.artist}`}
      style={({ pressed }) => [
        styles.trackRow,
        {
          backgroundColor: active
            ? pal.primaryContainer
            : pressed
              ? pal.surfaceContainerHigh
              : "transparent",
          borderRadius: 16,
        },
      ]}
    >
      <Artwork uri={track.artworkUrl} size={52} />
      <View style={styles.trackMeta}>
        <Text
          variant="titleSmall"
          numberOfLines={1}
          style={{ color: active ? pal.onPrimaryContainer : theme.colors.onSurface }}
        >
          {track.title}
        </Text>
        <Text
          variant="bodySmall"
          numberOfLines={1}
          style={{ color: active ? pal.onPrimaryContainer : theme.colors.onSurfaceVariant }}
        >
          {track.artist}
        </Text>
        {track.album ? (
          <Text
            variant="bodySmall"
            numberOfLines={1}
            style={{
              color: active ? pal.onPrimaryContainer : theme.colors.onSurfaceVariant,
              opacity: 0.8,
            }}
          >
            {track.album}
          </Text>
        ) : null}
      </View>
      <Icon
        source={active ? "volume-high" : "play-circle-outline"}
        size={24}
        color={active ? pal.onPrimaryContainer : theme.colors.primary}
      />
    </Pressable>
  );
});

function SearchHint() {
  const theme = useTheme();
  const pal = usePalette();
  return (
    <Surface
      mode="flat"
      style={[styles.hintCard, { backgroundColor: pal.surfaceContainer, borderRadius: 20 }]}
    >
      <View
        style={[
          styles.hintIcon,
          { backgroundColor: theme.colors.primaryContainer, borderRadius: 20 },
        ]}
      >
        <Icon source="headphones" size={34} color={theme.colors.onPrimaryContainer} />
      </View>
      <Text variant="titleMedium" style={{ color: theme.colors.onSurface, textAlign: "center" }}>
        Hear your curve on a real song
      </Text>
      <Text
        variant="bodyMedium"
        style={{
          color: theme.colors.onSurfaceVariant,
          textAlign: "center",
          marginTop: 6,
          maxWidth: 310,
        }}
      >
        Search Apple Music for a track. Each result plays a 30-second preview through your
        current EQ — then A/B it against bypass.
      </Text>
    </Surface>
  );
}

function SearchEmpty({ query }: { query: string }) {
  const theme = useTheme();
  return (
    <View style={styles.empty}>
      <Icon source="music-off" size={34} color={theme.colors.onSurfaceVariant} />
      <Text
        variant="bodyMedium"
        style={{ color: theme.colors.onSurfaceVariant, textAlign: "center", marginTop: 8 }}
      >
        No songs found for “{query.trim()}”. Try another title or artist.
      </Text>
    </View>
  );
}

function SearchError({ onRetry }: { onRetry: () => void }) {
  const theme = useTheme();
  const pal = usePalette();
  return (
    <Surface
      mode="flat"
      style={[styles.errorCard, { backgroundColor: pal.surfaceContainer, borderRadius: 16 }]}
    >
      <Icon source="cloud-off-outline" size={26} color={theme.colors.error} />
      <View style={{ flex: 1 }}>
        <Text variant="titleSmall" style={{ color: theme.colors.onSurface }}>
          Couldn’t reach Apple Music
        </Text>
        <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
          Check your connection and try again.
        </Text>
      </View>
      <Button compact mode="text" onPress={onRetry}>
        Retry
      </Button>
    </Surface>
  );
}

export function PreviewScreen({ navigation }: TabScreenProps<"Preview">) {
  const theme = useTheme();
  const pal = usePalette();
  const insets = useSafeAreaInsets();
  const bands = useStoreSelector((st) => st.bands);
  const levelDb = useStoreSelector((st) => st.levelDb);

  const [query, setQuery] = useState("");
  const [tracks, setTracks] = useState<PreviewTrack[]>([]);
  const [selected, setSelected] = useState<PreviewTrack | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(false);
  const [gateVisible, setGateVisible] = useState(false);
  const [gateBusy, setGateBusy] = useState(false);
  const [pending, setPending] = useState<PreviewTrack | null>(null);

  const requestRef = useRef<AbortController | null>(null);
  const searchSeq = useRef(0);

  const runSearch = useCallback(async (term: string) => {
    const q = term.trim();
    if (q.length < 2) {
      setTracks([]);
      setSearching(false);
      setSearchError(false);
      return;
    }

    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    const seq = ++searchSeq.current;
    setSearching(true);
    setSearchError(false);
    try {
      const next = await searchPreviewTracks(q, controller.signal);
      if (seq !== searchSeq.current) return;
      setTracks(next.slice(0, PREVIEW_RESULT_LIMIT));
    } catch (err) {
      if (controller.signal.aborted || seq !== searchSeq.current) return;
      if (__DEV__) console.log("[preview] search failed", err);
      setTracks([]);
      setSearchError(true);
    } finally {
      if (seq === searchSeq.current) setSearching(false);
    }
  }, []);

  const changeQuery = useCallback((text: string) => {
    setQuery(text);
    const term = text.trim();
    requestRef.current?.abort();
    searchSeq.current += 1;
    setSearchError(false);
    if (term.length < 2) {
      setTracks([]);
      setSearching(false);
      return;
    }
    // Show the spinner during the debounce too, so a fresh query never
    // flashes "no songs found" before the request has even started.
    setSearching(true);
  }, []);

  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) return;
    const timer = setTimeout(() => {
      void runSearch(term);
    }, 450);
    return () => clearTimeout(timer);
  }, [query, runSearch]);

  useEffect(() => {
    return () => {
      requestRef.current?.abort();
    };
  }, []);

  const startPreview = useCallback((track: PreviewTrack) => {
    if (!engine.isStarted()) {
      setPending(track);
      setGateVisible(true);
      return;
    }
    if (store.get().playing) {
      engine.stop();
      store.setPlaying(false);
    }
    engine.playPreview(track.previewUrl);
    hapticSelect();
  }, []);

  const selectTrack = useCallback(
    (track: PreviewTrack) => {
      Keyboard.dismiss();
      setSelected(track);
      startPreview(track);
    },
    [startPreview]
  );

  const confirmGate = useCallback(async () => {
    setGateBusy(true);
    try {
      await engine.start();
      const track = pending;
      setPending(null);
      if (track) {
        if (store.get().playing) {
          engine.stop();
          store.setPlaying(false);
        }
        engine.playPreview(track.previewUrl);
        hapticSelect();
      }
    } finally {
      setGateBusy(false);
      setGateVisible(false);
    }
  }, [pending]);

  const closeGate = useCallback(() => {
    setGateVisible(false);
    setPending(null);
  }, []);

  const handlePlayPause = useCallback(() => {
    if (!selected) return;
    const preview = engine.getPreview();
    if (preview.status === "playing" || preview.status === "loading") {
      engine.pausePreview();
      return;
    }
    startPreview(selected);
  }, [selected, startPreview]);

  const handleSeek = useCallback((seconds: number) => {
    engine.seekPreview(seconds);
  }, []);

  const showHint = !selected && query.trim().length < 2 && !searching && !searchError;
  const showNoResults =
    query.trim().length >= 2 && !searching && !searchError && tracks.length === 0;

  return (
    <View style={[styles.screen, { backgroundColor: theme.colors.background }]}>
      <View style={[styles.topBar, { paddingTop: insets.top }]}>
        <Text variant="titleLarge" style={{ color: theme.colors.onSurface, fontWeight: "500" }}>
          Preview
        </Text>
        <View style={{ flex: 1 }} />
        <Chip
          icon="equalizer"
          onPress={() => navigation.navigate("Curve")}
          textStyle={{ color: theme.colors.onSurfaceVariant }}
          style={{ marginRight: 2 }}
        >
          {bands.length} {bands.length === 1 ? "band" : "bands"}
        </Chip>
      </View>

      <View style={styles.searchWrap}>
        <Searchbar
          placeholder="Search songs or artists"
          value={query}
          onChangeText={changeQuery}
          onSubmitEditing={() => Keyboard.dismiss()}
          style={{ backgroundColor: pal.surfaceContainerHigh }}
          inputStyle={{ fontSize: 15 }}
          elevation={0}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          accessibilityLabel="Search Apple Music previews"
        />
      </View>

      <FlatList
        data={tracks}
        keyExtractor={(item, index) => `${item.id}-${index}`}
        renderItem={({ item }) => (
          <TrackRow
            track={item}
            active={selected?.id === item.id}
            onPress={selectTrack}
          />
        )}
        ItemSeparatorComponent={() => <View style={{ height: 2 }} />}
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: Math.max(insets.bottom, 10) + 20 },
        ]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        ListHeaderComponent={
          <View>
            {selected ? (
              <NowPlayingCard
                key={selected.id}
                track={selected}
                onPlayPause={handlePlayPause}
                onSeek={handleSeek}
              />
            ) : showHint ? (
              <SearchHint />
            ) : null}

            {searching && tracks.length > 0 ? (
              <View style={styles.searchingRow}>
                <ActivityIndicator size="small" color={theme.colors.primary} />
                <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                  Searching Apple Music…
                </Text>
              </View>
            ) : null}

            {searchError ? (
              <SearchError onRetry={() => void runSearch(query)} />
            ) : null}

            {tracks.length > 0 ? (
              <Text
                variant="labelLarge"
                style={[styles.sectionLabel, { color: theme.colors.onSurfaceVariant }]}
              >
                Songs
              </Text>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          searching ? (
            <View style={styles.empty}>
              <ActivityIndicator color={theme.colors.primary} />
              <Text
                variant="bodySmall"
                style={{ color: theme.colors.onSurfaceVariant, marginTop: 10 }}
              >
                Searching Apple Music…
              </Text>
            </View>
          ) : showNoResults ? (
            <SearchEmpty query={query} />
          ) : undefined
        }
        ListFooterComponent={
          <Text
            variant="labelSmall"
            style={[styles.attribution, { color: theme.colors.onSurfaceVariant }]}
          >
            30-second previews and artwork from Apple Music. Previews require a network
            connection.
          </Text>
        }
      />

      <VolumeGate
        visible={gateVisible}
        levelDb={levelDb}
        onLevel={(db) => store.setLevel(db)}
        onClose={closeGate}
        onStart={() => {
          void confirmGate();
        }}
        busy={gateBusy}
        showLevel={false}
        title="Turn your volume down first"
        body="Song previews can be loud. Start with your device volume low, then raise it to a comfortable level."
        startLabel="I understand, play"
      />
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
    paddingBottom: 4,
    gap: 2,
  },
  searchWrap: {
    paddingHorizontal: 12,
    paddingTop: 4,
    paddingBottom: 8,
  },
  listContent: {
    paddingHorizontal: 12,
    flexGrow: 1,
  },
  nowCard: {
    padding: 14,
    marginTop: 4,
  },
  nowRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  nowMeta: {
    flex: 1,
    minWidth: 0,
  },
  artwork: {
    backgroundColor: "transparent",
  },
  playButton: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: "center",
    justifyContent: "center",
  },
  progressBlock: {
    marginTop: 8,
  },
  progress: {
    width: "100%",
    height: 36,
  },
  timeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: -8,
    paddingHorizontal: 4,
  },
  abHeader: {
    flexDirection: "row",
    alignItems: "flex-end",
    marginTop: 12,
    marginBottom: 8,
    gap: 8,
  },
  trackRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 7,
    paddingHorizontal: 8,
    marginHorizontal: -4,
  },
  trackMeta: {
    flex: 1,
    minWidth: 0,
  },
  searchingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 4,
  },
  sectionLabel: {
    marginTop: 16,
    marginBottom: 4,
    paddingHorizontal: 4,
  },
  hintCard: {
    padding: 24,
    marginTop: 4,
    alignItems: "center",
    gap: 10,
  },
  hintIcon: {
    width: 64,
    height: 64,
    alignItems: "center",
    justifyContent: "center",
  },
  empty: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 36,
    paddingHorizontal: 24,
  },
  errorCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    marginTop: 12,
  },
  attribution: {
    textAlign: "center",
    marginTop: 24,
    paddingHorizontal: 16,
    opacity: 0.8,
  },
});
