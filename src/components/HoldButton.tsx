// Press-and-hold repeats the step callback (like holding Android's volume
// keys). Used for the +/- frequency nudges around the big readout.

import { useEffect, useRef } from "react";
import { Pressable, type StyleProp, type ViewStyle } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useTheme } from "react-native-paper";
import { usePalette } from "../theme/theme.ts";

interface Props {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  onPress: () => void;
  repeat?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}

const REPEAT_DELAY = 350;
const REPEAT_MS = 90;

export function HoldButton({ icon, onPress, repeat = true, style, accessibilityLabel }: Props) {
  const theme = useTheme();
  const pal = usePalette();
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const delayed = useRef<ReturnType<typeof setTimeout> | null>(null);
  const press = useRef(onPress);
  useEffect(() => {
    press.current = onPress;
  }, [onPress]);

  const startRepeat = () => {
    press.current();
    if (!repeat) return;
    delayed.current = setTimeout(() => {
      timer.current = setInterval(() => press.current(), REPEAT_MS);
    }, REPEAT_DELAY);
  };

  const stopRepeat = () => {
    if (delayed.current) {
      clearTimeout(delayed.current);
      delayed.current = null;
    }
    if (timer.current) {
      clearInterval(timer.current);
      timer.current = null;
    }
  };

  return (
    <Pressable
      onPress={onPress}
      onPressIn={startRepeat}
      onPressOut={stopRepeat}
      accessibilityLabel={accessibilityLabel}
      android_ripple={{ color: theme.colors.onSurface + "22", borderless: false, radius: 32 }}
      style={({ pressed }) => [
        {
          width: 44,
          height: 44,
          borderRadius: 22,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: pressed
            ? theme.colors.onSurface + "0D"
            : pal.surfaceContainerHigh,
          opacity: pressed ? 0.92 : 1,
        },
        style,
      ]}
    >
      <MaterialCommunityIcons
        name={icon}
        size={20}
        color={theme.colors.onSurfaceVariant}
      />
    </Pressable>
  );
}
