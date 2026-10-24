// ExportScreen — the deliverable: the PEQ text any player accepts, plus
// copy / share / session save / session import. The text format matches the
// original site byte-for-byte.

import { useMemo, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import {
  Button,
  Card,
  Dialog,
  Icon,
  Portal,
  Text,
  TextInput,
  useTheme,
} from "react-native-paper";
import { usePalette } from "../theme/theme.ts";
import * as DocumentPicker from "expo-document-picker";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  copyText,
  saveTextToPickedLocation,
  sessionFromJson,
  sharePeq,
  shareSession,
  shareWavelet,
  toPeqText,
  toWaveletText,
  WAVELET_FILENAME,
} from "../lib/peq.ts";
import { readTextFile } from "../lib/files.ts";
import { store } from "../lib/store.ts";
import { hapticSelect } from "../lib/haptic.ts";
import { useStoreSelector } from "../hooks/useStore.ts";
import { ClearBandsButton } from "../components/ClearBandsButton.tsx";
import type { TabScreenProps } from "../nav/types.ts";

export function ExportScreen(_props: TabScreenProps<"Export">) {
  const theme = useTheme();
  const pal = usePalette();
  const insets = useSafeAreaInsets();
  // The exported text only depends on bands + preamp; subscribing to those
  // slices keeps this screen asleep while the sweep runs.
  const bands = useStoreSelector((st) => st.bands);
  const preampDb = useStoreSelector((st) => st.preampDb);

  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState(WAVELET_FILENAME);

  const peq = useMemo(() => toPeqText({ ...store.get(), bands, preampDb }), [bands, preampDb]);
  const wavelet = useMemo(() => toWaveletText({ ...store.get(), bands, preampDb }), [bands, preampDb]);

  const flash = (text: string, ms = 2600) => {
    setNote(text);
    setTimeout(() => setNote(null), ms);
  };

  const doCopy = async () => {
    void hapticSelect();
    const ok = await copyText(peq);
    flash(ok ? "PEQ copied — paste it into any player with a PEQ." : "Copy failed");
  };

  const doShare = async () => {
    setBusy("share");
    const ok = await sharePeq(store.get());
    setBusy(null);
    flash(ok ? "" : "Sharing is not available on this device");
    if (!ok) flash("Sharing is not available on this device");
  };

  const doCopyWavelet = async () => {
    void hapticSelect();
    const ok = await copyText(wavelet);
    flash(ok ? "GraphicEQ copied — import it in Wavelet → Presets → Manual." : "Copy failed");
  };

  const doShareWavelet = async () => {
    setBusy("waveletShare");
    const ok = await shareWavelet(store.get());
    setBusy(null);
    if (!ok) flash("Sharing is not available on this device");
  };

  const doSaveWavelet = async () => {
    setSaveOpen(false);
    setBusy("waveletSave");
    let name = saveName.trim();
    if (!/\.txt$/i.test(name)) name += ".txt";
    let result: Awaited<ReturnType<typeof saveTextToPickedLocation>>;
    try {
      result = await saveTextToPickedLocation(name, "text/plain", wavelet);
    } catch (err) {
      setBusy(null);
      flash(`Save failed: ${String((err as Error)?.message ?? err).slice(0, 140)}`);
      return;
    }
    setBusy(null);
    if (!result) {
      flash("Save cancelled or unavailable");
    } else if ("shared" in result) {
      flash("Share sheet opened — choose “Save to Files” or a destination");
    } else {
      void hapticSelect();
      flash("Saved to the chosen folder");
    }
  };

  const doSaveSession = async () => {
    setBusy("session");
    const ok = await shareSession(store.get());
    setBusy(null);
    if (!ok) flash("Sharing is not available on this device");
  };

  const doImport = async () => {
    setBusy("import");
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: "application/json",
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (res.canceled || !res.assets || !res.assets.length) {
        setBusy(null);
        return;
      }
      const uri = res.assets[0].uri;
      const text = await readTextFile(uri);
      if (text == null) {
        flash("Could not read the selected file");
        setBusy(null);
        return;
      }
      try {
        const data = sessionFromJson(text);
        store.load(data);
        void hapticSelect();
        flash("Session loaded");
      } catch {
        flash("Not a valid session file");
      }
    } catch {
      flash("Could not open the picker");
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={[styles.screen, { backgroundColor: theme.colors.background }]}>
      <View style={[styles.topBar, { paddingTop: insets.top }]}>
        <Text variant="titleLarge" style={{ color: theme.colors.onSurface, fontWeight: "500" }}>
          Export
        </Text>
        <View style={{ flex: 1 }} />
        <ClearBandsButton />
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ flexGrow: 1, justifyContent: "center", paddingBottom: 16 }}
      >

        {/* PEQ preview */}
        <Card mode="contained" style={[styles.card, { backgroundColor: pal.surfaceContainer }]}>
          <Card.Content>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
              <Text variant="titleSmall" style={{ color: theme.colors.onSurface }}>
                Parametric EQ
              </Text>
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                generic PEQ text
              </Text>
            </View>
            <View
              style={[
                styles.peqBox,
                { backgroundColor: pal.surfaceContainerLowest },
              ]}
            >
              <Text
                style={[
                  styles.mono,
                  { color: theme.colors.onSurface },
                ]}
                selectable
              >
                {peq}
              </Text>
            </View>
          </Card.Content>
        </Card>

        {/* Actions */}
        <View style={styles.actions}>
          <Button
            mode="contained"
            style={{ flex: 1 }}
            contentStyle={{ height: 52 }}
            icon="content-copy"
            onPress={() => void doCopy()}
            disabled={busy === "import"}
          >
            Copy
          </Button>
          <Button
            mode="contained-tonal"
            style={{ flex: 1 }}
            contentStyle={{ height: 52 }}
            icon="share-variant"
            loading={busy === "share"}
            onPress={() => void doShare()}
          >
            Share .txt
          </Button>
        </View>
        <View style={[styles.actions, { marginTop: 8 }]}>
          <Button
            mode="outlined"
            style={{ flex: 1 }}
            contentStyle={{ height: 48 }}
            icon="folder-download"
            loading={busy === "session"}
            onPress={() => void doSaveSession()}
          >
            Save session
          </Button>
          <Button
            mode="outlined"
            style={{ flex: 1 }}
            contentStyle={{ height: 48 }}
            icon="folder-upload"
            loading={busy === "import"}
            onPress={() => void doImport()}
          >
            Open session
          </Button>
        </View>

        {/* Wavelet preview */}
        <Card mode="contained" style={[styles.card, { backgroundColor: pal.surfaceContainer }]}>
          <Card.Content>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
              <Text variant="titleSmall" style={{ color: theme.colors.onSurface }}>
                Wavelet GraphicEQ
              </Text>
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                Wavelet app · manual import
              </Text>
            </View>
            <View style={[styles.peqBox, styles.waveletBox, { backgroundColor: pal.surfaceContainerLowest }]}>
              <ScrollView nestedScrollEnabled style={{ flex: 1 }}>
                <Text style={[styles.mono, { color: theme.colors.onSurface }]} selectable>
                  {wavelet}
                </Text>
              </ScrollView>
            </View>
          </Card.Content>
        </Card>

        {/* Wavelet actions */}
        <View style={styles.actions}>
          <Button
            mode="contained"
            style={{ flex: 1 }}
            contentStyle={{ height: 52 }}
            icon="equalizer"
            onPress={() => void doCopyWavelet()}
          >
            Copy
          </Button>
          <Button
            mode="contained-tonal"
            style={{ flex: 1 }}
            contentStyle={{ height: 52 }}
            icon="share-variant"
            loading={busy === "waveletShare"}
            onPress={() => void doShareWavelet()}
          >
            Share .txt
          </Button>
        </View>
        <View style={[styles.actions, { marginTop: 8, marginBottom: 0 }]}>
          <Button
            mode="outlined"
            style={{ flex: 1 }}
            contentStyle={{ height: 48 }}
            icon="content-save-cog"
            loading={busy === "waveletSave"}
            onPress={() => {
              setSaveName(WAVELET_FILENAME);
              setSaveOpen(true);
            }}
          >
            Save as…
          </Button>
        </View>

        {/* Guidance */}
        <Card mode="contained" style={[styles.card, { backgroundColor: pal.surfaceContainer, marginTop: 12 }]}>
          <Card.Content style={{ gap: 8 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Icon source="dock-window" size={18} color={theme.colors.onSurfaceVariant} />
              <Text variant="titleSmall" style={{ color: theme.colors.onSurface }}>
                Where to paste
              </Text>
            </View>
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
              The lines above work in most PEQ systems: Wavelet (Manual import), Neutron, UAPP, Poweramp EQ, USB Audio Player PRO, Qudelix 5K/APP and Qudelix Bluetooth DACs, or any app with preamp + per-filter Peak/Low shelf/High shelf bands. Enter preamp first, then each filter in order.
            </Text>
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
              The GraphicEQ line is Wavelet’s own format (Presets → Manual import); the preamp is already folded into its gains.
            </Text>
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
              Session files carry your marks and bands between this app and the original eqbyear.com website.
            </Text>
          </Card.Content>
        </Card>

      </ScrollView>

      <Portal>
        <Dialog visible={saveOpen} onDismiss={() => setSaveOpen(false)}>
          <Dialog.Title>Save GraphicEQ</Dialog.Title>
          <Dialog.Content>
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 10 }}>
              Choose a name, then pick the folder to save it in.
            </Text>
            <TextInput
              mode="outlined"
              label="File name"
              value={saveName}
              onChangeText={setSaveName}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setSaveOpen(false)}>Cancel</Button>
            <Button onPress={() => void doSaveWavelet()}>Save</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>

      {note ? (
        <View style={[styles.note, { backgroundColor: theme.colors.inverseSurface }]}>
          <Text style={{ color: theme.colors.inverseOnSurface }}>{note}</Text>
        </View>
      ) : null}
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
  card: {
    marginHorizontal: 12,
    marginBottom: 10,
    borderRadius: 20,
  },
  peqBox: {
    borderRadius: 12,
    padding: 12,
  },
  waveletBox: {
    height: 140,
  },
  mono: {
    fontFamily: "monospace",
    fontSize: 12.5,
    lineHeight: 19,
  },
  actions: {
    flexDirection: "row",
    gap: 8,
    marginHorizontal: 12,
  },
  note: {
    borderRadius: 12,
    marginHorizontal: 12,
    marginBottom: 10,
    padding: 14,
  },
});
