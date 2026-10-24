// ClearBandsButton — the standalone destructive action that replaced the
// old overflow menu. Kept in each working screen's app bar because it acts on
// the shared band list; app-level preferences now live in Settings.

import { useState } from "react";
import { Button, Dialog, IconButton, Portal, Text, useTheme } from "react-native-paper";
import { store } from "../lib/store.ts";
import { useStoreSelector } from "../hooks/useStore.ts";

interface Props {
  onCleared?: () => void;
}

export function ClearBandsButton({ onCleared }: Props) {
  const theme = useTheme();
  const bandCount = useStoreSelector((st) => st.bands.length);
  const [open, setOpen] = useState(false);

  return (
    <>
      <IconButton
        icon="delete-sweep-outline"
        onPress={() => setOpen(true)}
        disabled={bandCount === 0}
        accessibilityLabel="Remove all bands"
        accessibilityHint="Opens a confirmation dialog"
      />
      <Portal>
        <Dialog visible={open} onDismiss={() => setOpen(false)}>
          <Dialog.Title>Remove all bands?</Dialog.Title>
          <Dialog.Content>
            <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
              All {bandCount} bands will be deleted. Your volume and theme stay as they are.
            </Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setOpen(false)}>Cancel</Button>
            <Button
              textColor={theme.colors.error}
              onPress={() => {
                store.removeAllBands();
                setOpen(false);
                onCleared?.();
              }}
            >
              Remove
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </>
  );
}
