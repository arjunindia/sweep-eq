// AppMenu — the ⋮ overflow menu shared by every screen's app bar, plus the
// About / How-it-works dialogs and the destructive reset confirmation.

import { useCallback, useState } from "react";
import { Linking, View } from "react-native";
import {
  Button,
  Dialog,
  Divider,
  Icon,
  IconButton,
  List,
  Menu,
  Portal,
  Text,
  useTheme,
} from "react-native-paper";
import { hapticSelect } from "../lib/haptic.ts";
import { store } from "../lib/store.ts";
import { useStoreSelector } from "../hooks/useStore.ts";

const REPO_URL = "https://github.com/DMS3tv/eqbyear";
const SITE_URL = "https://eqbyear.com";

interface Props {
  onReset: () => void;
}

type DialogKind = "none" | "about" | "help" | "reset";

export function AppMenuDropdown({ onReset }: Props) {
  const theme = useTheme();
  const themePref = useStoreSelector((st) => st.themePref);
  const bandCount = useStoreSelector((st) => st.bands.length);
  const [open, setOpen] = useState(false);
  const [dialog, setDialog] = useState<DialogKind>("none");

  const setThemePref = useCallback((pref: "system" | "light" | "dark") => {
    store.setThemePref(pref);
    hapticSelect();
  }, []);

  return (
    <View>
      <Menu
        visible={open}
        onDismiss={() => setOpen(false)}
        anchor={
          <IconButton icon="dots-vertical" onPress={() => setOpen(true)} accessibilityLabel="More options" />
        }
      >
        <Menu.Item
          leadingIcon="help-circle-outline"
          onPress={() => {
            setOpen(false);
            setDialog("help");
          }}
          title="How it works"
        />
        <Menu.Item
          leadingIcon="information-outline"
          onPress={() => {
            setOpen(false);
            setDialog("about");
          }}
          title="About"
        />
        <Divider style={{ marginVertical: 4 }} />
        <Menu.Item
          leadingIcon={themePref === "system" ? "check" : "cellphone"}
          onPress={() => setThemePref("system")}
          title="Theme: system"
        />
        <Menu.Item
          leadingIcon={themePref === "light" ? "check" : "weather-sunny"}
          onPress={() => setThemePref("light")}
          title="Theme: light"
        />
        <Menu.Item
          leadingIcon={themePref === "dark" ? "check" : "weather-night"}
          onPress={() => setThemePref("dark")}
          title="Theme: dark"
        />
        <Divider style={{ marginVertical: 4 }} />
        <Menu.Item
          leadingIcon="delete-sweep-outline"
          onPress={() => {
            setOpen(false);
            setDialog("reset");
          }}
          title="Remove all bands"
        />
      </Menu>

      <Portal>
        {/* How it works */}
        <Dialog visible={dialog === "help"} onDismiss={() => setDialog("none")}>
          <Dialog.Title>How it works</Dialog.Title>
          <Dialog.Content style={{ gap: 10 }}>
            <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
              1. Put your headphones on, set the level, play the tone.
            </Text>
            <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
              2. Drag the tape slowly and listen for a colouration — a whine (peak) or a thin, faint spot (dip).
            </Text>
            <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
              3. Mark the shape: Start at the left edge, Top at the middle, End at the right edge. The band is added automatically.
            </Text>
            <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
              4. Repeat up to 8 bands, check the response on Curve, then paste the PEQ into your player.
            </Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setDialog("none")}>Got it</Button>
          </Dialog.Actions>
        </Dialog>

        {/* About */}
        <Dialog visible={dialog === "about"} onDismiss={() => setDialog("none")}>
          <Dialog.Title>About</Dialog.Title>
          <Dialog.Content style={{ gap: 10 }}>
            <Text variant="bodyMedium" style={{ color: theme.colors.onSurface }}>
              Sweep EQ is a mobile companion that finds parametric-EQ corrections for headphones by ear: a sine sweep you scrub across, three marks per problem you hear, and an exportable 8-band PEQ.
            </Text>
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
              A task-specific port of “EQ by ear” by DMS (eqbyear.com), Apache-2.0. Unofficial; not affiliated. It uses the same DSP math and file format as the original site.
            </Text>
            <List.Item
              title="eqbyear.com"
              description="The original web tool"
              left={() => (
                <Icon source="link" size={20} color={theme.colors.onSurfaceVariant} />
              )}
              onPress={() =>
                Linking.openURL(SITE_URL).catch(() => {
                  /* no browser */
                })
              }
              style={{ marginLeft: -8 }}
            />
            <List.Item
              title="Source repository"
              description="Original project and licensing"
              left={() => (
                <Icon source="github" size={20} color={theme.colors.onSurfaceVariant} />
              )}
              onPress={() =>
                Linking.openURL(REPO_URL).catch(() => {
                  /* no browser */
                })
              }
              style={{ marginLeft: -8 }}
            />
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setDialog("none")}>Close</Button>
          </Dialog.Actions>
        </Dialog>

        {/* Reset confirm */}
        <Dialog visible={dialog === "reset"} onDismiss={() => setDialog("none")}>
          <Dialog.Title>Remove all bands?</Dialog.Title>
          <Dialog.Content>
            <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
              All {bandCount} bands will be deleted. Your volume and theme stay as they are.
            </Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setDialog("none")}>Cancel</Button>
            <Button
              textColor={theme.colors.error}
              onPress={() => {
                onReset();
                setDialog("none");
              }}
            >
              Remove
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </View>
  );
}
