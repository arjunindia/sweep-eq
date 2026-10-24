// Generates the app's icon set with zero dependencies: a dark tile with three
// teal EQ bars, each wearing an amber "handle" — parametric-EQ sliders.
// Outputs 1024px icons (iOS/main, adaptive foreground/background/monochrome),
// a small splash glyph, and a favicon, as PNGs via zlib.

import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "assets");
mkdirSync(outDir, { recursive: true });

// -- tiny PNG writer ---------------------------------------------------------

function crc32(buf) {
  let c, table = crc32.table;
  if (!table) {
    table = crc32.table = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c;
    }
  }
  let crc = -1;
  for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff];
  return (crc ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function writePng(path, width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  // no interlace
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
  writeFileSync(path, png);
}

// -- drawing ----------------------------------------------------------------

function buildScene(size, { background, scale = 1, offsetX = 0, offsetY = 0 }) {
  const buf = Buffer.alloc(size * size * 4);
  const put = (x, y, r, g, b, a) => {
    const i = (y * size + x) * 4;
    buf[i] = r;
    buf[i + 1] = g;
    buf[i + 2] = b;
    buf[i + 3] = a;
  };

  if (background) {
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) put(x, y, background[0], background[1], background[2], background[3] ?? 255);
  }

  const s = (v) => v * size * scale;
  const cx = (v) => Math.round(s(v) + offsetX * size);
  const cy = (v) => Math.round(s(v) + offsetY * size);

  // three bars + one amber handle each (a mini parametric EQ)
  const bars = [
    { x: 0.3, h: 0.52, handle: 0.62 },
    { x: 0.5, h: 0.34, handle: 0.5 },
    { x: 0.7, h: 0.44, handle: 0.36 },
  ];
  const teal = [150, 233, 240]; // #96E9F0 primaryContainer
  const amber = [255, 185, 81]; // #FFB951 tertiary (dark)
  const barW = 0.115;

  for (const bar of bars) {
    const bw = barW * size * scale;
    const x0 = cx(bar.x) - bw / 2;
    const x1 = x0 + bw;
    const y0 = cy(0.5 - bar.h / 2);
    const y1 = y0 + bar.h * size * scale;
    const r = bw / 2;
    for (let y = Math.floor(y0); y <= Math.ceil(y1); y++) {
      for (let x = Math.floor(x0); x <= Math.ceil(x1); x++) {
        if (x < 0 || y < 0 || x >= size || y >= size) continue;
        // rounded ends: circle caps
        const inTop = y >= y0 + r;
        const inBottom = y <= y1 - r;
        let inside = x >= x0 && x <= x1 && ((inTop && inBottom) || (y < y0 + r && y >= y0 && Math.hypot(x - (x0 + r), y - (y0 + r)) <= r) || (y > y1 - r && y <= y1 && Math.hypot(x - (x0 + r), y - (y1 - r)) <= r));
        if (inside) put(x, y, teal[0], teal[1], teal[2], 255);
      }
    }
    // handle dot
    const hy = cy(bar.handle);
    const hr = bw * 0.62;
    for (let y = Math.floor(hy - hr); y <= Math.ceil(hy + hr); y++) {
      for (let x = Math.floor(cx(bar.x) - hr); x <= Math.ceil(cx(bar.x) + hr); x++) {
        if (x < 0 || y < 0 || x >= size || y >= size) continue;
        if (Math.hypot(x - cx(bar.x), y - hy) <= hr) put(x, y, amber[0], amber[1], amber[2], 255);
      }
    }
  }
  return buf;
}

let dark = [14, 20, 21]; // #0E1415

// icon.png (opaque square)
writePng(join(outDir, "sweep-eq-icon.png"), 1024, 1024, buildScene(1024, { background: [dark[0], dark[1], dark[2]] }));
// adaptive background: plain color
writePng(join(outDir, "sweep-eq-android-background.png"), 256, 256, (() => {
  const b = Buffer.alloc(256 * 256 * 4);
  for (let i = 0; i < b.length; i += 4) {
    b[i] = dark[0];
    b[i + 1] = dark[1];
    b[i + 2] = dark[2];
    b[i + 3] = 255;
  }
  return b;
})());
// adaptive foreground: glyph only, centered in the 108dp safe zone of 432px
writePng(join(outDir, "sweep-eq-android-foreground.png"), 432, 432, buildScene(432, { scale: 0.62, offsetX: 0.19, offsetY: 0.19 }));
// monochrome: same glyph, all-white (mask derives alpha)
writePng(join(outDir, "sweep-eq-android-monochrome.png"), 432, 432, buildScene(432, { scale: 0.62, offsetX: 0.19, offsetY: 0.19 }).map((v, i) => (i % 4 === 3 ? (v ? 255 : 0) : 255)));
// splash glyph on transparent
writePng(join(outDir, "sweep-eq-splash.png"), 512, 512, buildScene(512, { scale: 0.8, offsetX: 0.1, offsetY: 0.1 }));
// favicon
writePng(join(outDir, "sweep-eq-favicon.png"), 48, 48, buildScene(48, { scale: 0.84, offsetX: 0.08, offsetY: 0.08 }));

console.log("assets written to", outDir);
