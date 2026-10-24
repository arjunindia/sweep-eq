// Apple iTunes Search API — song preview discovery.
//
// The app asks for `entity=song`, which returns 30-second preview clips and
// 100 px artwork. Native fetch has no CORS restriction; the hidden WebView's
// <audio> element uses crossOrigin="anonymous" because the preview CDN sends
// Access-Control-Allow-Origin: *. Results are normalized here so the screen
// never has to defend against missing/odd fields.

export interface PreviewTrack {
  id: number;
  title: string;
  artist: string;
  album: string;
  artworkUrl: string;
  previewUrl: string;
  durationMs: number;
  genre: string;
}

const SEARCH_ENDPOINT = "https://itunes.apple.com/search";
export const PREVIEW_RESULT_LIMIT = 12;

export function buildSearchUrl(term: string, limit = PREVIEW_RESULT_LIMIT): string {
  return (
    `${SEARCH_ENDPOINT}?term=${encodeURIComponent(term.trim())}` +
    `&entity=song&limit=${limit}&country=us`
  );
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

// Validate/normalize one iTunes search response. Never throws; malformed rows
// are simply dropped.
export function parseSearchResponse(raw: unknown): PreviewTrack[] {
  if (!raw || typeof raw !== "object") return [];
  const results = (raw as { results?: unknown }).results;
  if (!Array.isArray(results)) return [];

  const out: PreviewTrack[] = [];
  for (const item of results) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    if (row.wrapperType !== "track" || row.kind !== "song") continue;

    const previewUrl = text(row.previewUrl);
    const title = text(row.trackName);
    const artist = text(row.artistName);
    const id = Number(row.trackId);
    if (!previewUrl.startsWith("https://") || !title || !artist || !Number.isFinite(id)) {
      continue;
    }

    out.push({
      id,
      title,
      artist,
      album: text(row.collectionName),
      artworkUrl: text(row.artworkUrl100),
      previewUrl,
      durationMs: Number(row.trackTimeMillis) || 0,
      genre: text(row.primaryGenreName),
    });
  }
  return out;
}

export async function searchPreviewTracks(
  term: string,
  signal?: AbortSignal
): Promise<PreviewTrack[]> {
  const query = term.trim();
  if (query.length < 2) return [];

  const response = await fetch(buildSearchUrl(query), {
    signal,
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`Apple Music search failed (${response.status})`);
  }
  return parseSearchResponse((await response.json()) as unknown);
}
