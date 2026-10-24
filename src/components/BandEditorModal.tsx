// BandEditorModal — edit one band in a bottom sheet: type, frequency (log
// slider + fine nudge), gain, Q, enable, delete. Every change is committed
// live to the store so the response curve and the tone track while editing.

import { useMemo } from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  Switch,
  View,
  type ViewStyle,
} from "react-native";
import {
  Button,
  IconButton,
  SegmentedButtons,
  Surface,
  Text,
  useTheme,
} from "react-native-paper";
import { usePalette } from "../theme/theme.ts";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import Slider from "@react-native-community/slider";
import { HoldButton } from "./HoldButton.tsx";
import { clampFreq, fmtHz, freqToT, tToFreq } from "../lib/dsp.ts";
import { hapticSelect } from "../lib/haptic.ts";
import { store, type Band, type BandType } from "../lib/store.ts";

const Q_MIN = 0.1;
const Q_MAX = 20;
const Q_LOG = Math.log(Q_MAX / Q_MIN);

const TYPE_LABEL: Record<BandType, string> = {
  PK: "Peak",
  LSC: "Low shelf",
  HSC: "High shelf",
};

interface Props {
  band: Band | null;
  index: number;
  onClose: () => void;
  onDelete: () => void;
  style?: ViewStyle;
}

function qToT(q: number): number {
  return Math.log(Math.max(Q_MIN, Math.min(Q_MAX, q)) / Q_MIN) / Q_LOG;
}

function tToQ(t: number): number {
  return Q_MIN * Math.exp(Math.min(1, Math.max(0, t)) * Q_LOG);
}

const snapQ = (q: number) => Math.round(q * 20) / 20;
const snapGain = (g: number) => Math.round(g * 2) / 2;
const snapFc = (f: number) => Math.round(f);

export function BandEditorModal({ band, index, onClose, onDelete, style }: Props) {
  const theme = useTheme();
  const pal = usePalette();

  const update = (patch: Partial<Band>) => {
    if (!band) return;
    store.updateBand(band.id, patch);
  };

  const freqT = useMemo(() => (band ? freqToT(band.fc) : 0), [band]);
  const qT = useMemo(() => (band ? qToT(band.q) : 0), [band]);

  return (
    <Modal
      visible={!!band}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onClose}
      accessible
    >
      <View style={styles.scrim}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
        <Surface
          mode="elevated"
          elevation={2}
          style={[
            styles.sheet,
            {
              backgroundColor: pal.surfaceContainerHigh,
              borderTopLeftRadius: 28,
              borderTopRightRadius: 28,
            },
            style,
          ]}
        >
          <View style={[styles.handle, { backgroundColor: theme.colors.onSurfaceVariant + "55" }]} />

          <View style={styles.header}>
            <Text
              variant="titleLarge"
              style={{ color: theme.colors.onSurface, flex: 1 }}
              numberOfLines={1}
            >
              Band {index + 1}
              {band ? ` · ${TYPE_LABEL[band.type]}` : ""}
            </Text>
            <IconButton icon="close" onPress={onClose} accessibilityLabel="Close editor" />
          </View>

          <SegmentedButtons
            value={band?.type ?? "PK"}
            onValueChange={(v) => {
              update({ type: v as BandType });
              hapticSelect();
            }}
            buttons={[
              { value: "PK", label: "Peak" },
              { value: "LSC", label: "Low shelf" },
              { value: "HSC", label: "High shelf" },
            ]}
          />

          {/* Frequency */}
          <View style={styles.row}>
            <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, width: 44 }}>
              Freq
            </Text>
            <Text
              variant="titleMedium"
              style={{
                color: theme.colors.onSurface,
                width: 96,
                fontVariant: ["tabular-nums"],
                textAlign: "right",
              }}
            >
              {band ? fmtHz(band.fc) : ""}{" "}
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                Hz
              </Text>
            </Text>
            <View style={styles.nudges}>
              <HoldButton icon="minus" repeat onPress={() => band && update({ fc: snapFc(clampFreq(band.fc / 1.02)) })} accessibilityLabel="Lower frequency slightly" />
              <HoldButton icon="plus" repeat onPress={() => band && update({ fc: snapFc(clampFreq(band.fc * 1.02)) })} accessibilityLabel="Raise frequency slightly" />
            </View>
          </View>
          <Slider
            style={{ width: "100%", height: 40 }}
            minimumValue={0}
            maximumValue={1}
            value={freqT}
            onValueChange={(t) => update({ fc: snapFc(tToFreq(t)) })}
            minimumTrackTintColor={theme.colors.primary}
            maximumTrackTintColor={theme.colors.surfaceVariant}
            thumbTintColor={theme.colors.primary}
            accessibilityLabel="Center frequency"
          />

          {/* Gain */}
          <View style={styles.row}>
            <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, width: 44 }}>
              Gain
            </Text>
            <Text
              variant="titleMedium"
              style={{
                color: theme.colors.onSurface,
                width: 96,
                fontVariant: ["tabular-nums"],
                textAlign: "right",
              }}
            >
              {band ? (band.gain > 0 ? "+" : "") + band.gain.toFixed(1) : ""}{" "}
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                dB
              </Text>
            </Text>
            <View style={styles.nudges}>
              <HoldButton icon="minus" repeat onPress={() => band && update({ gain: snapGain(band.gain - 0.5) })} accessibilityLabel="Lower gain" />
              <HoldButton icon="plus" repeat onPress={() => band && update({ gain: snapGain(band.gain + 0.5) })} accessibilityLabel="Raise gain" />
            </View>
          </View>
          <Slider
            style={{ width: "100%", height: 40 }}
            minimumValue={-24}
            maximumValue={24}
            step={0.5}
            value={band?.gain ?? 0}
            onValueChange={(g) => update({ gain: snapGain(g) })}
            minimumTrackTintColor={theme.colors.primary}
            maximumTrackTintColor={theme.colors.surfaceVariant}
            thumbTintColor={theme.colors.primary}
            accessibilityLabel="Gain"
          />

          {/* Q */}
          <View style={styles.row}>
            <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, width: 44 }}>
              Q
            </Text>
            <Text
              variant="titleMedium"
              style={{
                color: theme.colors.onSurface,
                width: 96,
                fontVariant: ["tabular-nums"],
                textAlign: "right",
              }}
            >
              {band ? band.q.toFixed(2) : ""}
            </Text>
            <View style={styles.nudges}>
              <HoldButton icon="minus" repeat onPress={() => band && update({ q: snapQ(Math.max(Q_MIN, band.q / 1.15)) })} accessibilityLabel="Lower Q (wider)" />
              <HoldButton icon="plus" repeat onPress={() => band && update({ q: snapQ(Math.min(Q_MAX, band.q * 1.15)) })} accessibilityLabel="Raise Q (narrower)" />
            </View>
          </View>
          <Slider
            style={{ width: "100%", height: 40 }}
            minimumValue={0}
            maximumValue={1}
            value={qT}
            onValueChange={(t) => update({ q: snapQ(tToQ(t)) })}
            minimumTrackTintColor={theme.colors.primary}
            maximumTrackTintColor={theme.colors.surfaceVariant}
            thumbTintColor={theme.colors.primary}
            accessibilityLabel="Q factor"
          />

          <View style={[styles.footer, { borderTopColor: theme.colors.outlineVariant }]}>
            <Button
              mode="text"
              icon="delete-outline"
              onPress={onDelete}
              textColor={theme.colors.error}
            >
              Delete
            </Button>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <MaterialCommunityIcons
                name="power"
                size={18}
                color={theme.colors.onSurfaceVariant}
              />
              <Text variant="bodyMedium" style={{ color: theme.colors.onSurface }}>
                On
              </Text>
              <Switch
                value={band?.enabled !== false}
                onValueChange={(v) => {
                  update({ enabled: v });
                  hapticSelect();
                }}
              />
            </View>
            <Button mode="contained" onPress={onClose}>
              Done
            </Button>
          </View>
        </Surface>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "#00000066",
  },
  sheet: {
    paddingBottom: 16,
    paddingHorizontal: 20,
    gap: 10,
  },
  handle: {
    alignSelf: "center",
    width: 34,
    height: 4,
    borderRadius: 2,
    marginTop: 8,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 4,
  },
  nudges: {
    flexDirection: "row",
    gap: 6,
    marginLeft: "auto",
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: 8,
    paddingTop: 4,
    gap: 4,
  },
});
