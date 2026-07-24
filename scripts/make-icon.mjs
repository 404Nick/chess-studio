#!/usr/bin/env node
/**
 * Generates build-assets/icon.ico from scratch — a dark rounded tile with a light
 * knight glyph — so the packaged app has a real icon instead of the default Electron
 * logo. Writes uncompressed 32-bit BGRA BMP frames at several sizes into a single .ico.
 *
 * No image libraries are used: everything is drawn into raw pixel buffers here.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const SIZES = [16, 24, 32, 48, 64, 128, 256];

/** A tiny 8x8 bitmap of a knight silhouette (1 = ink), upscaled per icon size. */
const KNIGHT = [
  '00011000',
  '00111100',
  '01111110',
  '01011110',
  '00011110',
  '00111110',
  '01111111',
  '01111111',
];

const BG_TOP = [0x5f, 0x9b, 0xfa]; // accent blue (RGB)
const BG_BOT = [0x1a, 0x20, 0x32]; // deep ink
const INK = [0xf2, 0xf5, 0xfb]; // near-white knight

function lerp(a, b, t) {
  return Math.round(a + (b - a) * t);
}

function drawRGBA(size) {
  const px = Buffer.alloc(size * size * 4);
  const r = size * 0.22; // corner radius
  const cell = size / 8;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const i = (y * size + x) * 4;

      // Rounded-rectangle mask.
      const dx = Math.min(x, size - 1 - x);
      const dy = Math.min(y, size - 1 - y);
      let inside = true;
      if (dx < r && dy < r) {
        const ddx = r - dx;
        const ddy = r - dy;
        inside = ddx * ddx + ddy * ddy <= r * r;
      }

      if (!inside) {
        px[i] = 0;
        px[i + 1] = 0;
        px[i + 2] = 0;
        px[i + 3] = 0;
        continue;
      }

      // Vertical gradient background.
      const t = y / (size - 1);
      let cr = lerp(BG_TOP[0], BG_BOT[0], t);
      let cg = lerp(BG_TOP[1], BG_BOT[1], t);
      let cb = lerp(BG_TOP[2], BG_BOT[2], t);

      // Knight glyph, centred in an inset 8x8 grid.
      const gx = Math.floor((x - cell * 0.6) / (cell * 0.975));
      const gy = Math.floor((y - cell * 0.6) / (cell * 0.975));
      if (gy >= 0 && gy < 8 && gx >= 0 && gx < 8 && KNIGHT[gy][gx] === '1') {
        cr = INK[0];
        cg = INK[1];
        cb = INK[2];
      }

      // BGRA order for the BMP frame.
      px[i] = cb;
      px[i + 1] = cg;
      px[i + 2] = cr;
      px[i + 3] = 255;
    }
  }
  return px;
}

/** Wrap a 32-bit BGRA buffer in a BITMAPINFOHEADER DIB (bottom-up) for ICO embedding. */
function dibForIco(size, bgra) {
  const header = Buffer.alloc(40);
  header.writeUInt32LE(40, 0);
  header.writeInt32LE(size, 4);
  header.writeInt32LE(size * 2, 8); // height doubled: colour + AND mask
  header.writeUInt16LE(1, 12);
  header.writeUInt16LE(32, 14);
  header.writeUInt32LE(0, 16); // BI_RGB
  header.writeUInt32LE(size * size * 4, 20);

  const pixels = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    const src = y * size * 4;
    const dst = (size - 1 - y) * size * 4; // flip to bottom-up
    bgra.copy(pixels, dst, src, src + size * 4);
  }

  // AND mask: 1 bit per pixel, row-padded to 32 bits. Transparent where alpha==0.
  const rowBytes = Math.ceil(size / 32) * 4;
  const mask = Buffer.alloc(rowBytes * size, 0);
  for (let y = 0; y < size; y += 1) {
    const outRow = (size - 1 - y) * rowBytes;
    for (let x = 0; x < size; x += 1) {
      const a = bgra[(y * size + x) * 4 + 3];
      if (a === 0) mask[outRow + (x >> 3)] |= 0x80 >> (x & 7);
    }
  }

  return Buffer.concat([header, pixels, mask]);
}

function buildIco() {
  const images = SIZES.map((size) => ({ size, dib: dibForIco(size, drawRGBA(size)) }));

  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(images.length, 4);

  const dirEntrySize = 16;
  let offset = 6 + images.length * dirEntrySize;
  const entries = [];

  for (const { size, dib } of images) {
    const entry = Buffer.alloc(dirEntrySize);
    entry.writeUInt8(size >= 256 ? 0 : size, 0);
    entry.writeUInt8(size >= 256 ? 0 : size, 1);
    entry.writeUInt8(0, 2); // colours
    entry.writeUInt8(0, 3);
    entry.writeUInt16LE(1, 4); // planes
    entry.writeUInt16LE(32, 6); // bpp
    entry.writeUInt32LE(dib.length, 8);
    entry.writeUInt32LE(offset, 12);
    entries.push(entry);
    offset += dib.length;
  }

  return Buffer.concat([header, ...entries, ...images.map((i) => i.dib)]);
}

const outDir = path.join(process.cwd(), 'build-assets');
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, 'icon.ico');
fs.writeFileSync(outFile, buildIco());
process.stdout.write(`[make-icon] wrote ${outFile} (${SIZES.join(', ')} px)\n`);
