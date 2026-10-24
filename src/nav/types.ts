import type { BottomTabScreenProps, BottomTabNavigationProp } from "@react-navigation/bottom-tabs";

export type RootTabParamList = {
  Tune: undefined;
  Curve: undefined;
  Export: undefined;
};

export type TabNav<Name extends keyof RootTabParamList = keyof RootTabParamList> =
  BottomTabNavigationProp<RootTabParamList, Name>;

export type TabScreenProps<Name extends keyof RootTabParamList> =
  BottomTabScreenProps<RootTabParamList, Name>;
