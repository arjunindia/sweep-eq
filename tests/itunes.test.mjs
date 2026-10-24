// iTunes Search API normalization — run: node tests/itunes.test.mjs
// No network: exercises URL construction and the defensive response parser.

import assert from "node:assert/strict";
import {
  PREVIEW_RESULT_LIMIT,
  buildSearchUrl,
  parseSearchResponse,
} from "../src/lib/itunes.ts";

assert.equal(
  buildSearchUrl("daft punk"),
  `https://itunes.apple.com/search?term=daft%20punk&entity=song&limit=${PREVIEW_RESULT_LIMIT}&country=us`
);
assert.equal(
  buildSearchUrl("  Beyoncé  "),
  `https://itunes.apple.com/search?term=Beyonc%C3%A9&entity=song&limit=${PREVIEW_RESULT_LIMIT}&country=us`
);

const parsed = parseSearchResponse({
  resultCount: 4,
  results: [
    {
      wrapperType: "track",
      kind: "song",
      trackId: 1440857781,
      trackName: "Get Lucky (feat. Pharrell Williams)",
      artistName: "Daft Punk",
      collectionName: "Random Access Memories",
      artworkUrl100: "https://is1-ssl.mzstatic.com/image/thumb/100x100bb.jpg",
      previewUrl: "https://audio-ssl.itunes.apple.com/preview.m4a",
      trackTimeMillis: 369000,
      primaryGenreName: "Electronic",
    },
    // missing preview -> dropped
    {
      wrapperType: "track",
      kind: "song",
      trackId: 2,
      trackName: "No preview",
      artistName: "Nobody",
    },
    // wrong kind -> dropped
    {
      wrapperType: "track",
      kind: "music-video",
      trackId: 3,
      trackName: "Video",
      artistName: "Someone",
      previewUrl: "https://example.test/video.m4a",
    },
    // non-https preview -> dropped
    {
      wrapperType: "track",
      kind: "song",
      trackId: 4,
      trackName: "Insecure",
      artistName: "Someone",
      previewUrl: "http://example.test/song.m4a",
    },
  ],
});

assert.equal(parsed.length, 1);
assert.deepEqual(parsed[0], {
  id: 1440857781,
  title: "Get Lucky (feat. Pharrell Williams)",
  artist: "Daft Punk",
  album: "Random Access Memories",
  artworkUrl: "https://is1-ssl.mzstatic.com/image/thumb/100x100bb.jpg",
  previewUrl: "https://audio-ssl.itunes.apple.com/preview.m4a",
  durationMs: 369000,
  genre: "Electronic",
});

assert.deepEqual(parseSearchResponse(null), []);
assert.deepEqual(parseSearchResponse({ results: "nope" }), []);

console.log("itunes.test.mjs — all passed");
