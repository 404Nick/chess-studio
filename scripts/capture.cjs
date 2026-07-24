'use strict';

/**
 * Generates the README media (animated GIFs + poster PNGs) by driving the running
 * dev server inside a real Chromium window (the already-installed Electron) and
 * grabbing frames with webContents.capturePage(). Frames are encoded to GIF with the
 * pure-JS `gifenc`. Windows always has a compositor, so capture works off-screen.
 *
 * Run the dev server first (npm run dev -- -p 3300), then:
 *   node_modules/electron/dist/electron.exe scripts/capture.cjs
 *
 * Output goes to ./assets. No CLI args (Electron's launcher swallows URL-like args).
 */

const { app, BrowserWindow } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const BASE = process.env.CAPTURE_URL || 'http://localhost:3300';
const OUT = path.join(process.cwd(), 'assets');
const WIDTH = 1440;
const HEIGHT = 900;
const GIF_WIDTH = 800; // downscaled to keep README GIFs light
const GIF_COLORS = 128;

fs.mkdirSync(OUT, { recursive: true });
const LOG = path.join(OUT, 'capture.log');
const log = (m) => fs.appendFileSync(LOG, `${new Date().toISOString()} ${m}\n`);
fs.writeFileSync(LOG, `capture start base=${BASE}\n`);

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const js = (win, code) => win.webContents.executeJavaScript(code, true).catch(() => null);

async function boardReady(win) {
  for (let i = 0; i < 80; i += 1) {
    const n = await js(win, `document.querySelectorAll('[data-square]').length`);
    if (n >= 64) return true;
    await wait(400);
  }
  return false;
}

function bgraToRgba(buf) {
  const out = Buffer.allocUnsafe(buf.length);
  for (let i = 0; i < buf.length; i += 4) {
    out[i] = buf[i + 2];
    out[i + 1] = buf[i + 1];
    out[i + 2] = buf[i];
    out[i + 3] = buf[i + 3];
  }
  return out;
}

async function grab(win, scale) {
  const image = await win.webContents.capturePage();
  const resized = scale && scale !== 1 ? image.resize({ width: Math.round(WIDTH * scale) }) : image;
  const size = resized.getSize();
  return { data: resized.toBitmap(), width: size.width, height: size.height };
}

async function snap(win, name) {
  const image = await win.webContents.capturePage();
  fs.writeFileSync(path.join(OUT, name), image.toPNG());
  log(`poster ${name}`);
}

/**
 * Records frames at ~`fps` while `driver` runs, then encodes them to an animated GIF.
 */
async function recordGif(win, name, driver, { fps = 7, scale = GIF_WIDTH / WIDTH } = {}) {
  const frames = [];
  let recording = true;
  const interval = 1000 / fps;

  const loop = (async () => {
    while (recording) {
      const t0 = Date.now();
      try {
        frames.push(await grab(win, scale));
      } catch {
        /* skip a dropped frame */
      }
      await wait(Math.max(0, interval - (Date.now() - t0)));
    }
  })();

  await driver();
  recording = false;
  await loop;

  const { GIFEncoder, quantize, applyPalette } = require('gifenc');
  const enc = GIFEncoder();
  for (const f of frames) {
    const rgba = bgraToRgba(f.data);
    const palette = quantize(rgba, GIF_COLORS);
    const indexed = applyPalette(rgba, palette);
    enc.writeFrame(indexed, f.width, f.height, { palette, delay: Math.round(interval) });
  }
  enc.finish();
  fs.writeFileSync(path.join(OUT, name), Buffer.from(enc.bytes()));
  log(`gif ${name} frames=${frames.length} ${frames[0]?.width}x${frames[0]?.height}`);
}

/* ------------------------------------------------------------------ */
/* Drivers                                                             */
/* ------------------------------------------------------------------ */

const clickByText = (win, text, nth = 0) =>
  js(
    win,
    `(()=>{const b=[...document.querySelectorAll('button')].filter(x=>x.textContent.trim()===${JSON.stringify(
      text,
    )});if(b[${nth}]){b[${nth}].click();return true}return false})()`,
  );

// Plays the engine's top candidate move by clicking the first score button.
const playTopCandidate = (win) =>
  js(
    win,
    `(()=>{const b=[...document.querySelectorAll('button')].find(x=>/^[+\\u2212]\\d\\.\\d\\d$/.test(x.textContent.trim()));if(b){b.click();return b.textContent.trim()}return null})()`,
  );

async function driveAnalysis(win) {
  await wait(700);
  for (let i = 0; i < 6; i += 1) {
    await playTopCandidate(win);
    await wait(780);
  }
  await wait(600);
}

async function driveThemes(win) {
  await clickByText(win, 'Board'); // open the appearance tab
  await wait(750);
  for (const theme of ['Marble', 'Walnut', 'Emerald', 'Neon Dark']) {
    await clickByText(win, theme);
    await wait(700);
  }
  for (const style of ['Glyph', 'Neon', 'Classic']) {
    await clickByText(win, style);
    await wait(620);
  }
}

/* ------------------------------------------------------------------ */

app.disableHardwareAcceleration();

app.whenReady().then(async () => {
  try {
    const win = new BrowserWindow({
      width: WIDTH,
      height: HEIGHT,
      show: true,
      x: -3000,
      y: 0,
      frame: false,
      webPreferences: { backgroundThrottling: false },
    });
    win.webContents.setZoomFactor(1);

    // --- Analysis: play moves, watch eval + classification badges ---
    await win.loadURL(BASE);
    await boardReady(win);
    await wait(2500);
    await snap(win, 'analysis.png');
    await recordGif(win, 'analysis.gif', () => driveAnalysis(win));

    // --- Themes: live board re-skinning ---
    await win.loadURL(BASE);
    await boardReady(win);
    await wait(1500);
    await recordGif(win, 'themes.gif', () => driveThemes(win), { fps: 8 });

    // --- Studio poster ---
    await win.loadURL(`${BASE}/studio`);
    await boardReady(win);
    await wait(2200);
    await snap(win, 'studio.png');

    // --- Opening explorer poster ---
    await win.loadURL(BASE);
    await boardReady(win);
    await wait(1500);
    await playTopCandidate(win);
    await wait(700);
    await clickByText(win, 'Opening');
    await wait(2500);
    await snap(win, 'opening.png');

    log('all scenes done');
  } catch (err) {
    log(`ERROR ${err && err.stack ? err.stack : String(err)}`);
  } finally {
    app.quit();
  }
});

app.on('window-all-closed', () => app.quit());
