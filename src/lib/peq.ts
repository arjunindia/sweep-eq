// Share/copy helpers wrapping the pure PEQ/session core in `PeqText.ts`.
// Users hand the PEQ text to their player, or carry sessions between this
// app and the original eqbyear.com website (identical file format).

import * as Clipboard from "expo-clipboard";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { store, type AppState } from "./store.ts";
import {
  PEQ_FILENAME,
  SESSION_FILENAME,
  sessionFromJson,
  sessionToJson,
  toPeqText,
} from "./PeqText.ts";

export {
  PEQ_FILENAME,
  SESSION_FILENAME,
  toPeqText,
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

export async function shareSession(state: AppState): Promise<boolean> {
  return shareFile(SESSION_FILENAME, "application/json", sessionToJson(state));
}

// Load a picked/edited session into the live store (used by ExportScreen and
// hand tests). Popup-free wrapper around store.load.
export function applySession(jsonText: string): "ok" | "invalid" {
  try {
    store.load(sessionFromJson(jsonText));
    return "ok";
  } catch {
    return "invalid";
  }
}
