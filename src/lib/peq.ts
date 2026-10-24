// Share/copy helpers wrapping the pure PEQ/session core in `PeqText.ts`.
// Users hand the PEQ text to their player, or carry sessions between this
// app and the original eqbyear.com website (identical file format).

import * as Clipboard from "expo-clipboard";
import * as FileSystem from "expo-file-system/legacy";
import { StorageAccessFramework } from "expo-file-system/legacy";
import { Platform } from "react-native";
import * as Sharing from "expo-sharing";
import { store, type AppState } from "./store.ts";
import {
  PEQ_FILENAME,
  SESSION_FILENAME,
  WAVELET_FILENAME,
  sessionFromJson,
  sessionToJson,
  toPeqText,
  toWaveletText,
} from "./PeqText.ts";

export {
  PEQ_FILENAME,
  SESSION_FILENAME,
  WAVELET_FILENAME,
  toPeqText,
  toWaveletText,
  sessionToJson,
  sessionFromJson,
} from "./PeqText.ts";

export async function copyText(text: string): Promise<boolean> {
  try {
    await Clipboard.setStringAsync(text);
    return true;
  } catch {
    return false;
  }
}

export async function shareFile(
  filename: string,
  mime: string,
  text: string
): Promise<boolean> {
  try {
    if (!(await Sharing.isAvailableAsync())) return false;
    const dir = FileSystem.cacheDirectory;
    if (!dir) return false;
    const uri = dir.endsWith("/") ? dir + filename : `${dir}/${filename}`;
    await FileSystem.writeAsStringAsync(uri, text, {
      encoding: FileSystem.EncodingType.UTF8,
    });
    await Sharing.shareAsync(uri, { mimeType: mime, dialogTitle: filename });
    return true;
  } catch {
    return false;
  }
}

export async function sharePeq(state: AppState): Promise<boolean> {
  return shareFile(PEQ_FILENAME, "text/plain", toPeqText(state));
}

export async function shareWavelet(state: AppState): Promise<boolean> {
  return shareFile(WAVELET_FILENAME, "text/plain", toWaveletText(state));
}

export async function shareSession(state: AppState): Promise<boolean> {
  return shareFile(SESSION_FILENAME, "application/json", sessionToJson(state));
}

// Save text to a user-picked location with a chosen filename. Android uses
// the Storage Access Framework (folder picker + nameable create); iOS has no
// SAF, so it falls back to the share sheet where "Save to Files" is offered.
// Android 11+ cannot grant the Downloads root through the folder picker, so on
// an IOException there we re-request permission pre-filled with the Download
// root (the documented Expo pattern); outside Downloads the plain flow works.
// Returns the created URI, "shared", or null on refusal/cancellation.
export type SaveResult = { uri: string } | { shared: true } | null;

export async function saveTextToPickedLocation(
  defaultName: string,
  mime: string,
  text: string
): Promise<SaveResult> {
  const cleanName = defaultName.trim().replace(/[\\/:*?"<>|]/g, "_") || defaultName;
  if (Platform.OS !== "android") {
    return (await shareFile(cleanName, mime, text)) ? { shared: true } : null;
  }
  const perms = await StorageAccessFramework.requestDirectoryPermissionsAsync();
  if (!perms.granted) return null;
  try {
    return { uri: await createSafFile(perms.directoryUri, cleanName, mime, text) };
  } catch (err) {
    // Downloads root (and a few other primaries) are not creatable even when
    // picked — retry against the Download root with a fresh grant request.
    if (perms.directoryUri.includes("com.android.externalstorage.documents")) {
      const downloadUri = StorageAccessFramework.getUriForDirectoryInRoot("Download");
      const dlPerms = await StorageAccessFramework.requestDirectoryPermissionsAsync(downloadUri);
      if (dlPerms.granted) {
        return { uri: await createSafFile(dlPerms.directoryUri, cleanName, mime, text) };
      }
    }
    throw new Error(String((err as Error)?.message ?? err));
  }
}

async function createSafFile(
  dirUri: string,
  name: string,
  mime: string,
  text: string
): Promise<string> {
  const uri = await StorageAccessFramework.createFileAsync(dirUri, name, mime);
  await FileSystem.writeAsStringAsync(uri, text, {
    encoding: FileSystem.EncodingType.UTF8,
  });
  return uri;
}
// hand tests). Popup-free wrapper around store.load.
export function applySession(jsonText: string): "ok" | "invalid" {
  try {
    store.load(sessionFromJson(jsonText));
    return "ok";
  } catch {
    return "invalid";
  }
}
