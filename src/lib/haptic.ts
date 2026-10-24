// Android-native haptics with a silent fallback (no haptics hardware, mocks).

import * as Haptics from "expo-haptics";

function fire(fn: () => Promise<void>) {
  try {
    void fn();
  } catch {
    // no haptics support or not on device — ignore
  }
}

export const hapticLight = () => fire(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
export const hapticMedium = () =>
  fire(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));
export const hapticSelect = () => fire(() => Haptics.selectionAsync());
