#!/usr/bin/env node
// Regenerates PWA icons from a 1024x1024 source art file.
// Usage: node scripts/make-icons.mjs ../vibe_images/guruji-icon.png
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync, inflateSync } from 'node:zlib';

const here = dirname(fileURLToPath(import.meta.url));
const source = resolve(here, process.argv[2] ?? '../vibe_images/guruji-icon.png');
const outputDir = resolve(here, '../public/icons');

const TEAL = [11, 93, 95];
const WHITE_CUTOFF = 235;
const CORNER_RADIUS = 0.195;

const crcTable = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let crc = -1;
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ -1) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function decodePng(buffer) {
  if (buffer.readUInt32BE(0) !== 0x89504e47) throw new Error('Not a PNG file');
  let offset = 8;
  let width = 0;
  let height = 0;
  let depth = 0;
  let colorType = 0;
  let interlace = 0;
  const parts = [];
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      depth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === 'IDAT') {
      parts.push(data);
    }
    offset += 12 + length;
  }
  if (depth !== 8 || interlace !== 0 || ![2, 6].includes(colorType)) {
    throw new Error(`Unsupported PNG: depth=${depth} colorType=${colorType} interlace=${interlace}`);
  }
  const channels = colorType === 6 ? 4 : 3;
  const stride = width * channels;
  const raw = inflateSync(Buffer.concat(parts));
  const pixels = Buffer.alloc(height * stride);
  let position = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[position++];
    for (let x = 0; x < stride; x++) {
      const value = raw[position++];
      const left = x >= channels ? pixels[y * stride + x - channels] : 0;
      const up = y > 0 ? pixels[(y - 1) * stride + x] : 0;
      const upperLeft = y > 0 && x >= channels ? pixels[(y - 1) * stride + x - channels] : 0;
      let result;
      if (filter === 0) result = value;
      else if (filter === 1) result = value + left;
      else if (filter === 2) result = value + up;
      else if (filter === 3) result = value + ((left + up) >> 1);
      else if (filter === 4) {
        const p = left + up - upperLeft;
        const pa = Math.abs(p - left);
        const pb = Math.abs(p - up);
        const pc = Math.abs(p - upperLeft);
        const predictor = pa <= pb && pa <= pc ? left : pb <= pc ? up : upperLeft;
        result = value + predictor;
      } else throw new Error(`Unsupported filter ${filter}`);
      pixels[y * stride + x] = result & 255;
    }
  }
  return { width, height, channels, pixels };
}

function roundedMask(size, x, y) {
  const radius = CORNER_RADIUS * size;
  const cx = Math.max(Math.abs(x + 0.5 - size / 2) - (size / 2 - radius), 0);
  const cy = Math.max(Math.abs(y + 0.5 - size / 2) - (size / 2 - radius), 0);
  const distance = Math.hypot(cx, cy);
  return Math.max(0, Math.min(1, radius - distance + 0.5));
}

function toRgba(image, { maskable }) {
  const { width, height, channels, pixels } = image;
  const out = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const src = (y * width + x) * channels;
      const dst = (y * width + x) * 4;
      let r = pixels[src];
      let g = pixels[src + 1];
      let b = pixels[src + 2];
      if (maskable && r >= WHITE_CUTOFF && g >= WHITE_CUTOFF && b >= WHITE_CUTOFF) {
        [r, g, b] = TEAL;
      }
      out[dst] = r;
      out[dst + 1] = g;
      out[dst + 2] = b;
      out[dst + 3] = maskable ? 255 : Math.round(255 * roundedMask(width, x, y));
    }
  }
  return { width, height, data: out };
}

function resize(image, size) {
  const { width, height, data } = image;
  const out = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) {
    const y0 = (y * height) / size;
    const y1 = ((y + 1) * height) / size;
    for (let x = 0; x < size; x++) {
      const x0 = (x * width) / size;
      const x1 = ((x + 1) * width) / size;
      let alpha = 0;
      let red = 0;
      let green = 0;
      let blue = 0;
      let total = 0;
      for (let sy = Math.floor(y0); sy < Math.ceil(y1); sy++) {
        const wy = Math.min(sy + 1, y1) - Math.max(sy, y0);
        for (let sx = Math.floor(x0); sx < Math.ceil(x1); sx++) {
          const wx = Math.min(sx + 1, x1) - Math.max(sx, x0);
          const weight = wx * wy;
          const index = (sy * width + sx) * 4;
          const a = data[index + 3] / 255;
          alpha += a * weight;
          red += data[index] * a * weight;
          green += data[index + 1] * a * weight;
          blue += data[index + 2] * a * weight;
          total += weight;
        }
      }
      const dst = (y * size + x) * 4;
      const a = total ? alpha / total : 0;
      out[dst + 3] = Math.round(a * 255);
      if (alpha > 0) {
        out[dst] = Math.round(red / alpha);
        out[dst + 1] = Math.round(green / alpha);
        out[dst + 2] = Math.round(blue / alpha);
      }
    }
  }
  return { width: size, height: size, data: out };
}

function encodePng(image) {
  const { width, height, data } = image;
  const stride = width * 4;
  const raw = Buffer.alloc(height * (stride + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    Buffer.from(data.buffer, y * stride, stride).copy(raw, y * (stride + 1) + 1);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const image = decodePng(readFileSync(source));
if (image.width !== image.height) throw new Error('Source icon must be square');
mkdirSync(outputDir, { recursive: true });

const rounded = toRgba(image, { maskable: false });
const maskable = toRgba(image, { maskable: true });

for (const size of [192, 512]) {
  writeFileSync(resolve(outputDir, `icon-${size}.png`), encodePng(resize(rounded, size)));
  console.log(`icon-${size}.png`);
}
writeFileSync(resolve(outputDir, 'icon-maskable-512.png'), encodePng(resize(maskable, 512)));
console.log('icon-maskable-512.png');
