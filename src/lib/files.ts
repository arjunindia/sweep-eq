// Thin file-system wrapper used by ExportScreen (write temp files to share,
// read imported session JSON). Kept isolated so the expo-file-system API
// surface change (SDK 54+ new API vs legacy) lives in one place.

import * as FileSystem from "expo-file-system/legacy";

export async function cachePath(): Promise<string | null> {
  try {
    return FileSystem.cacheDirectory;
  } catch {
    return null;
  }
}

export async function writeCacheFile(name: string, text: string): Promise<string | null> {
  const dir = await cachePath();
  if (!dir) return null;
  const uri = dir.endsWith("/") ? dir + name : `${dir}/${name}`;
  try {
    await FileSystem.writeAsStringAsync(uri, text, { encoding: FileSystem.EncodingType.UTF8 });
    return uri;
  } catch {
    return null;
  }
}

export async function readTextFile(uri: string): Promise<string | null> {
  try {
    return await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.UTF8 });
  } catch {
    return null;
  }
}
