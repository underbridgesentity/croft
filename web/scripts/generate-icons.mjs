// Generate Hearth PWA icons (blue tile + white house) as PNGs with zero deps.
import zlib from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(__dirname, '../public/icons');
mkdirSync(outDir, { recursive: true });
mkdirSync(path.resolve(__dirname, '../public'), { recursive: true });

const BLUE = [0x3b, 0x5b, 0xff];
const WHITE = [0xff, 0xff, 0xff];

function tri(px, py, ax, ay, bx, by, cx, cy) {
  const d1 = (px - bx) * (ay - by) - (ax - bx) * (py - by);
  const d2 = (px - cx) * (by - cy) - (bx - cx) * (py - cy);
  const d3 = (px - ax) * (cy - ay) - (cx - ax) * (py - ay);
  const neg = d1 < 0 || d2 < 0 || d3 < 0;
  const pos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(neg && pos);
}

function render(N) {
  const buf = Buffer.alloc(N * N * 4);
  const s = N / 24; // map a 24-unit house coordinate system onto the tile
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const u = x / s, v = y / s; // in 24-unit space
      let c = BLUE;
      // roof triangle: apex (12,3.4) base (2.8,11.5)-(21.2,11.5)
      const roof = tri(u, v, 12, 3.2, 2.6, 11.6, 21.4, 11.6);
      // body rect 5..19 x, 11.5..20.4 y
      const body = u >= 5 && u <= 19 && v >= 11.2 && v <= 20.4;
      // door cut-out (blue) 10..14 x, 14.6..20.4 y
      const door = u >= 10 && u <= 14 && v >= 14.6 && v <= 20.6;
      if ((roof || body) && !door) c = WHITE;
      const i = (y * N + x) * 4;
      buf[i] = c[0]; buf[i + 1] = c[1]; buf[i + 2] = c[2]; buf[i + 3] = 255;
    }
  }
  return buf;
}

// ---- minimal PNG encoder ----
const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return (b) => {
    let c = 0xffffffff;
    for (let i = 0; i < b.length; i++) c = t[(c ^ b[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
})();

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(CRC(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}

function encodePng(N, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(N, 0);
  ihdr.writeUInt32BE(N, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const raw = Buffer.alloc((N * 4 + 1) * N);
  for (let y = 0; y < N; y++) {
    raw[y * (N * 4 + 1)] = 0;
    rgba.copy(raw, y * (N * 4 + 1) + 1, y * N * 4, (y + 1) * N * 4);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

for (const N of [192, 512, 180]) {
  const png = encodePng(N, render(N));
  const file = N === 180 ? path.resolve(__dirname, '../public/apple-touch-icon.png') : path.join(outDir, `icon-${N}.png`);
  writeFileSync(file, png);
  console.log('wrote', file);
}

const favicon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect width="24" height="24" rx="6" fill="#3B5BFF"/><path d="M3.5 11L12 4l8.5 7v8.2a1 1 0 0 1-1 1H4.5a1 1 0 0 1-1-1z" stroke="#fff" stroke-width="2" stroke-linejoin="round" fill="none"/><path d="M9.5 20.5v-6h5v6" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>`;
writeFileSync(path.resolve(__dirname, '../public/favicon.svg'), favicon);
console.log('wrote favicon.svg');
