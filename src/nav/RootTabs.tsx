// Bottom navigation — four destinations matching the natural flow:
// sweep+mark audio ("Tune"), inspect bands ("Curve"), take it away ("Export"),
// and app-level preferences ("Settings").

import { StyleSheet } from "react-native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { TuneScreen } from "../screens/TuneScreen.tsx";
import { CurveScreen } from "../screens/CurveScreen.tsx";
import { ExportScreen } from "../screens/ExportScreen.tsx";
import { SettingsScreen } from "../screens/SettingsScreen.tsx";
import { usePalette } from "../theme/theme.ts";
import type { RootTabParamList } from "./types.ts";

const Tab = createBottomTabNavigator<RootTabParamList>();

const ICONS = {
  Tune: "equalizer",
  Curve: "chart-line",
  Export: "share-variant",
  Settings: "cog-outline",
} as const;

export function RootTabs() {
  const pal = usePalette();

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        // Inactive tabs keep their state but stop re-rendering: a sweep on the
        // Curve tab must not repaint the Tune needle in the background (and
        // vice versa).
        freezeOnBlur: true,
        tabBarActiveTintColor: pal.primary,
        tabBarInactiveTintColor: pal.onSurfaceVariant,
        tabBarStyle: {
          backgroundColor: pal.surface,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: pal.outlineVariant,
          elevation: 0,
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: "500",
        },
        tabBarIcon: ({ color, size }) => (
          <MaterialCommunityIcons
            name={ICONS[route.name as keyof typeof ICONS]}
            color={color}
            size={size}
          />
        ),
      })}
    >
      <Tab.Screen name="Tune" component={TuneScreen} options={{ title: "Tune" }} />
      <Tab.Screen name="Curve" component={CurveScreen} options={{ title: "Curve" }} />
      <Tab.Screen name="Export" component={ExportScreen} options={{ title: "Export" }} />
      <Tab.Screen name="Settings" component={SettingsScreen} options={{ title: "Settings" }} />
    </Tab.Navigator>
  );
}
