'use strict';

/**
 * Captures poster PNGs for the newer pages (variations, stats, repertoire, play,
 * library). Kept separate from capture.cjs and run in a *visible, on-screen* window so
 * Windows never suspends the render surface mid-run.
 *
 *   node_modules/electron/dist/electron.exe scripts/capture-extra.cjs
 */

const { app, BrowserWindow } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const BASE = process.env.CAPTURE_URL || 'http://localhost:3000';
const OUT = path.join(process.cwd(), 'assets');
const WIDTH = 1440;
const HEIGHT = 900;

fs.mkdirSync(OUT, { recursive: true });
const LOG = path.join(OUT, 'capture-extra.log');
const log = (m) => fs.appendFileSync(LOG, `${new Date().toISOString()} ${m}\n`);
fs.writeFileSync(LOG, `extra start base=${BASE}\n`);

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const js = (win, code) => win.webContents.executeJavaScript(code, true).catch(() => null);

async function snap(win, name) {
  for (let i = 0; i < 5; i += 1) {
    try {
      const image = await win.webContents.capturePage();
      const png = image.toPNG();
      if (png && png.length > 2000) {
        fs.writeFileSync(path.join(OUT, name), png);
        log(`poster ${name} ok (${png.length} bytes)`);
        return;
      }
    } catch (e) {
      log(`snap ${name} retry ${i}: ${e}`);
    }
    await wait(500);
  }
  log(`poster ${name} FAILED`);
}

const clickByText = (win, text, nth = 0) =>
  js(
    win,
    `(()=>{const b=[...document.querySelectorAll('button')].filter(x=>x.textContent.trim()===${JSON.stringify(
      text,
    )});if(b[${nth}]){b[${nth}].click();return true}return false})()`,
  );
const clickContains = (win, text) =>
  js(
    win,
    `(()=>{const re=new RegExp(${JSON.stringify(text)},'i');const b=[...document.querySelectorAll('button')].find(x=>re.test(x.textContent));if(b){b.click();return true}return false})()`,
  );
const setField = (win, selector, value) =>
  js(
    win,
    `(()=>{const el=document.querySelector(${JSON.stringify(selector)});if(!el)return false;const proto=el.tagName==='TEXTAREA'?HTMLTextAreaElement:HTMLInputElement;Object.getOwnPropertyDescriptor(proto.prototype,'value').set.call(el,${JSON.stringify(
      value,
    )});el.dispatchEvent(new Event('input',{bubbles:true}));return true})()`,
  );

app.disableHardwareAcceleration();

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: WIDTH,
    height: HEIGHT,
    show: true,
    x: 0,
    y: 0,
    frame: false,
    webPreferences: { backgroundThrottling: false },
  });
  win.webContents.setZoomFactor(1);

  const scene = async (name, fn) => {
    try {
      await fn();
      await snap(win, name);
    } catch (e) {
      log(`scene ${name} FAIL ${e}`);
    }
  };

  try {
    // Variations — load a PGN with a variation, show the branching move tree.
    await scene('variations.png', async () => {
      await win.loadURL(BASE);
      await wait(3500);
      await clickContains(win, 'Import');
      await wait(600);
      await setField(
        win,
        'textarea[placeholder*="Paste a PGN"]',
        '[Event "Ruy Lopez"]\n\n1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 (3... Nf6 4. O-O Nxe4 5. d4 Nd6) 4. Ba4 Nf6 5. O-O Be7 6. Re1 b5 7. Bb3 d6',
      );
      await wait(500);
      await clickByText(win, 'Load');
      await wait(2200);
    });

    // Stats — fetch a player's games online (nothing saved).
    await scene('stats.png', async () => {
      await win.loadURL(`${BASE}/stats`);
      await wait(2200);
      await setField(win, 'input[placeholder*="Focus"]', 'DrNykterstein');
      await wait(500);
      await clickByText(win, 'Lichess');
      await wait(8000);
    });

    // Repertoire builder.
    await scene('repertoire.png', async () => {
      await win.loadURL(`${BASE}/repertoire`);
      await wait(1800);
      await setField(win, 'input[placeholder*="Repertoire"]', 'Italian (White)');
      await wait(500);
      await clickByText(win, 'Create');
      await wait(3000);
      await clickContains(win, 'Import lines');
      await wait(600);
      await setField(win, 'textarea', '1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 (3... Nf6 4. d3) 4. c3 Nf6 5. d3 d6 6. O-O');
      await wait(500);
      await clickContains(win, 'Load lines');
      await wait(2000);
    });

    // Play vs Stockfish.
    await scene('play.png', async () => {
      await win.loadURL(`${BASE}/play`);
      await wait(3000);
      await clickContains(win, 'Start game');
      await wait(2500);
    });

    // Game library.
    await scene('library.png', async () => {
      await win.loadURL(`${BASE}/library`);
      await wait(1800);
      await setField(
        win,
        'textarea[placeholder*="Paste one or more"]',
        '[Event "Tata Steel"]\n[White "Carlsen, Magnus"]\n[Black "Nakamura, Hikaru"]\n[Result "1-0"]\n[ECO "C65"]\n\n1. e4 e5 2. Nf3 Nc6 3. Bb5 Nf6 4. O-O Nxe4 5. d4 Nd6 6. Bxc6 dxc6 7. dxe5 Nf5 8. Qxd8+ Kxd8 1-0\n\n[Event "Tata Steel"]\n[White "Nakamura, Hikaru"]\n[Black "Caruana, Fabiano"]\n[Result "1/2-1/2"]\n[ECO "D37"]\n\n1. d4 Nf6 2. c4 e6 3. Nf3 d5 4. Nc3 Be7 5. Bf4 O-O 1/2-1/2',
      );
      await wait(600);
      await clickContains(win, 'Add to library');
      await wait(2000);
    });

    log('all extra scenes done');
  } catch (err) {
    log(`FATAL ${err && err.stack ? err.stack : String(err)}`);
  } finally {
    app.quit();
  }
});

app.on('window-all-closed', () => app.quit());
