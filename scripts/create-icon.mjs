// Generates icon.png (128x128) using only Node.js built-ins (no dependencies).
import { deflateSync } from 'zlib';
import { writeFileSync } from 'fs';

const W = 128, H = 128;
const pixels = new Uint8Array(W * H * 3);

function setPixel(x, y, r, g, b) {
  if (x < 0 || x >= W || y < 0 || y >= H) return;
  const i = (y * W + x) * 3;
  pixels[i] = r; pixels[i + 1] = g; pixels[i + 2] = b;
}

function fillRect(x0, y0, x1, y1, r, g, b) {
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++)
      setPixel(x, y, r, g, b);
}

function fillTriangle(ax, ay, bx, by, cx, cy, r, g, b) {
  const minX = Math.max(0, Math.min(ax, bx, cx));
  const maxX = Math.min(W - 1, Math.max(ax, bx, cx));
  const minY = Math.max(0, Math.min(ay, by, cy));
  const maxY = Math.min(H - 1, Math.max(ay, by, cy));
  function sign(p1x, p1y, p2x, p2y, p3x, p3y) {
    return (p1x - p3x) * (p2y - p3y) - (p2x - p3x) * (p1y - p3y);
  }
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const d1 = sign(x, y, ax, ay, bx, by);
      const d2 = sign(x, y, bx, by, cx, cy);
      const d3 = sign(x, y, cx, cy, ax, ay);
      const hasNeg = (d1 < 0) || (d2 < 0) || (d3 < 0);
      const hasPos = (d1 > 0) || (d2 > 0) || (d3 > 0);
      if (!(hasNeg && hasPos)) setPixel(x, y, r, g, b);
    }
  }
}

// Background
fillRect(0, 0, W, H, 30, 30, 30);

// --- Building: front face (grey wall) ---
fillRect(18, 56, 110, 100, 110, 110, 110);

// --- Roof: triangle ---
fillTriangle(10, 56, 64, 18, 118, 56, 190, 45, 45);

// --- Windows (left pair) ---
fillRect(26, 64, 42, 78, 45, 45, 45);
fillRect(26, 64, 42, 78, 45, 45, 45);

// --- Windows (right pair) ---
fillRect(86, 64, 102, 78, 45, 45, 45);

// --- Door ---
fillRect(52, 78, 76, 100, 45, 45, 45);

// --- Roof ridge highlight (lighter red line) ---
for (let x = 58; x <= 70; x++) setPixel(x, 18, 230, 90, 90);
for (let x = 55; x <= 73; x++) setPixel(x, 19, 220, 75, 75);

// --- Wall top edge highlight ---
for (let x = 18; x < 110; x++) setPixel(x, 56, 150, 150, 150);

// ---- PNG encoding ----

function crc32(buf) {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    table[i] = c;
  }
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xFF];
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4); lenBuf.writeUInt32BE(data.length);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8; ihdr[9] = 2; // bit depth=8, colorType=RGB

const raw = Buffer.alloc(H * (1 + W * 3));
for (let y = 0; y < H; y++) {
  raw[y * (1 + W * 3)] = 0;
  for (let x = 0; x < W; x++) {
    const src = (y * W + x) * 3;
    const dst = y * (1 + W * 3) + 1 + x * 3;
    raw[dst] = pixels[src]; raw[dst + 1] = pixels[src + 1]; raw[dst + 2] = pixels[src + 2];
  }
}

const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw)),
  chunk('IEND', Buffer.alloc(0)),
]);

writeFileSync('icon.png', png);
console.log('icon.png written (128x128)');
