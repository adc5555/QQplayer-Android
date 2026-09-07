import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const outFile = path.join(root, "build", "icon.png");
const icoFile = path.join(root, "build", "icon.ico");
const size = 256;
const supersample = 4;
const pixels = Buffer.alloc(size * size * 4);

for (let y = 0; y < size; y += 1) {
  for (let x = 0; x < size; x += 1) {
    let r = 0;
    let g = 0;
    let b = 0;
    let a = 0;
    for (let sy = 0; sy < supersample; sy += 1) {
      for (let sx = 0; sx < supersample; sx += 1) {
        const px = x + (sx + 0.5) / supersample;
        const py = y + (sy + 0.5) / supersample;
        const [cr, cg, cb, ca] = sample(px, py);
        r += cr * ca;
        g += cg * ca;
        b += cb * ca;
        a += ca;
      }
    }
    const samples = supersample * supersample;
    if (a > 0) {
      r /= a;
      g /= a;
      b /= a;
    }
    const alpha = a / samples;
    const offset = (y * size + x) * 4;
    pixels[offset] = Math.round(r);
    pixels[offset + 1] = Math.round(g);
    pixels[offset + 2] = Math.round(b);
    pixels[offset + 3] = Math.round(alpha * 255);
  }
}

const scanlines = Buffer.alloc((size * 4 + 1) * size);
for (let y = 0; y < size; y += 1) {
  const rowStart = y * (size * 4 + 1);
  scanlines[rowStart] = 0;
  pixels.copy(scanlines, rowStart + 1, y * size * 4, (y + 1) * size * 4);
}

const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  pngChunk("IHDR", ihdr(size, size)),
  pngChunk("IDAT", zlib.deflateSync(scanlines, { level: 9 })),
  pngChunk("IEND", Buffer.alloc(0))
]);

fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, png);
fs.writeFileSync(icoFile, createIco(png));
console.log(`generated ${outFile}`);
console.log(`generated ${icoFile}`);

function sample(x, y) {
  if (insideEllipse(x, y, 91, 179, 35, 27)) return [255, 255, 255, 1];
  if (insideRect(x, y, 117, 61, 14, 119)) return [255, 255, 255, 1];
  if (pointInPolygon(x, y, [[117, 61], [197, 74], [190, 109], [120, 96]])) return [255, 255, 255, 1];
  if (insideRoundedRect(x, y, 18, 18, 220, 220, 52)) {
    const t = (x - 18) / 220;
    return [49 + (31 - 49) * t, 194 + (156 - 194) * t, 124 + (98 - 124) * t, 1];
  }
  return [0, 0, 0, 0];
}

function insideRoundedRect(x, y, left, top, width, height, radius) {
  const right = left + width;
  const bottom = top + height;
  const cx = clamp(x, left + radius, right - radius);
  const cy = clamp(y, top + radius, bottom - radius);
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= radius * radius && x >= left && x <= right && y >= top && y <= bottom;
}

function insideEllipse(x, y, cx, cy, rx, ry) {
  const dx = (x - cx) / rx;
  const dy = (y - cy) / ry;
  return dx * dx + dy * dy <= 1;
}

function insideRect(x, y, left, top, width, height) {
  return x >= left && x <= left + width && y >= top && y <= top + height;
}

function pointInPolygon(x, y, points) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
    const xi = points[i][0];
    const yi = points[i][1];
    const xj = points[j][0];
    const yj = points[j][1];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function ihdr(width, height) {
  const buf = Buffer.alloc(13);
  buf.writeUInt32BE(width, 0);
  buf.writeUInt32BE(height, 4);
  buf[8] = 8;
  buf[9] = 6;
  buf[10] = 0;
  buf[11] = 0;
  buf[12] = 0;
  return buf;
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type, "ascii");
  const chunk = Buffer.concat([typeBuffer, data]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(zlib.crc32(chunk) >>> 0, 0);
  return Buffer.concat([length, chunk, crc]);
}

function createIco(png) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(1, 4);
  const entry = Buffer.alloc(16);
  entry[0] = 0;
  entry[1] = 0;
  entry[2] = 0;
  entry[3] = 0;
  entry.writeUInt16LE(1, 4);
  entry.writeUInt16LE(32, 6);
  entry.writeUInt32LE(png.length, 8);
  entry.writeUInt32LE(22, 12);
  return Buffer.concat([header, entry, png]);
}
