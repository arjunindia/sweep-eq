// VolumeGate — the hearing-safety gate, shown before audio can start.
// Port of the site's first-run dialog ("Turn your volume down first."),
// with a Material 3 presentation and the same level slider contract
// (-60..-6 dB, starting at -20 dB on a fresh session).

import { Modal, StyleSheet, View } from "react-native";
import {
  Button,
  Icon,
  IconButton,
  Surface,
  Text,
  useTheme,
} from "react-native-paper";
import { usePalette } from "../theme/theme.ts";
import Slider from "@react-native-community/slider";
import { fmtDb } from "../lib/dsp.ts";

interface Props {
  visible: boolean;
  levelDb: number;
  onLevel: (db: number) => void;
  onClose: () => void;
  onStart: () => void;
  busy?: boolean;
}

export function VolumeGate({ visible, levelDb, onLevel, onClose, onStart, busy }: Props) {
  const theme = useTheme();
  const pal = usePalette();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
      accessible
    >
      <View style={[styles.scrim, { backgroundColor: theme.colors.scrim + "B3" }]}>
        <Surface
          mode="elevated"
          elevation={3}
          style={[styles.card, { backgroundColor: pal.surfaceContainerHigh, borderRadius: 28 }]}
        >
          <View
            style={[
              styles.iconWrap,
              { backgroundColor: theme.colors.tertiaryContainer, borderRadius: 20, padding: 7 },
            ]}
          >
            <Icon size={26} source="alert" color={theme.colors.onTertiaryContainer} />
          </View>
          <Text variant="headlineSmall" style={{ color: theme.colors.onSurface, textAlign: "center" }}>
            Turn your volume down first
          </Text>
          <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, textAlign: "center", marginTop: 8 }}>
            Sine tones at high level can damage hearing and equipment. Start quiet, then raise the level to where you normally listen to music.
          </Text>

          <View style={styles.levelRow}>
            <IconButton icon="volume-low" size={20} disabled />
            <Slider
              style={{ flex: 1 }}
              minimumValue={-60}
              maximumValue={-6}
              step={1}
              value={levelDb}
              onValueChange={(v) => onLevel(Math.round(v))}
              minimumTrackTintColor={theme.colors.primary}
              maximumTrackTintColor={theme.colors.surfaceVariant}
              thumbTintColor={theme.colors.primary}
              accessibilityLabel="Level in decibels"
            />
            <IconButton icon="volume-high" size={20} disabled />
          </View>
          <Text
            variant="titleMedium"
            style={{
              color: theme.colors.tertiary,
              fontVariant: ["tabular-nums"],
              alignSelf: "center",
              marginBottom: 14,
            }}
          >
            {fmtDb(levelDb)}
          </Text>

          <Button
            mode="contained"
            loading={busy}
            disabled={busy}
            onPress={onStart}
            contentStyle={{ height: 48 }}
          >
            I understand, start
          </Button>

          <Button mode="text" onPress={onClose} textColor={theme.colors.onSurfaceVariant}>
            Not now
          </Button>
        </Surface>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  card: {
    width: "100%",
    maxWidth: 420,
    padding: 24,
    gap: 12,
  },
  iconWrap: {
    alignItems: "center",
  },
  levelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 6,
  },
});
