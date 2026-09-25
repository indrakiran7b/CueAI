#!/usr/bin/env node
/**
 * Writes a CueAI-branded 1024×1024 PNG for electron-builder (converts to .icns on macOS).
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const SIZE = 1024;
const out = path.resolve("apps/desktop/macos/build/icon.png");

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type);
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function writePng(pixels) {
  const raw = Buffer.alloc((SIZE * 4 + 1) * SIZE);
  for (let y = 0; y < SIZE; y++) {
    raw[y * (SIZE * 4 + 1)] = 0;
    pixels.copy(raw, y * (SIZE * 4 + 1) + 1, y * SIZE * 4, (y + 1) * SIZE * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(SIZE, 0);
  ihdr.writeUInt32BE(SIZE, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, png);
}

const pixels = Buffer.alloc(SIZE * SIZE * 4);
for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    const i = (y * SIZE + x) * 4;
    const nx = (x / (SIZE - 1)) * 2 - 1;
    const ny = (y / (SIZE - 1)) * 2 - 1;
    const r = Math.sqrt(nx * nx + ny * ny);
    const inside = r <= 0.92;
    const ring = r > 0.78 && r < 0.9;
    const core = r < 0.42;
    if (!inside) {
      pixels[i + 3] = 0;
      continue;
    }
    if (core) {
      pixels[i] = 0;
      pixels[i + 1] = 153;
      pixels[i + 2] = 255;
      pixels[i + 3] = 255;
    } else if (ring) {
      pixels[i] = 255;
      pixels[i + 1] = 255;
      pixels[i + 2] = 255;
      pixels[i + 3] = 255;
    } else {
      pixels[i] = 9;
      pixels[i + 1] = 9;
      pixels[i + 2] = 9;
      pixels[i + 3] = 255;
    }
  }
}

writePng(pixels);
console.log(`Wrote ${out}`);
