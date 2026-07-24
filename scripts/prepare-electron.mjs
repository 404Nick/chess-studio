#!/usr/bin/env node
/**
 * Prepares the Next.js standalone output for packaging.
 *
 * `next build` with `output: 'standalone'` emits `.next/standalone/server.js` plus a
 * trimmed `node_modules`, but it does NOT copy the static assets or the `public`
 * folder — those must sit next to the server for it to serve them. This script places
 * them where the standalone server expects, so electron-builder can ship one folder.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const standalone = path.join(root, '.next', 'standalone');

function log(message) {
  process.stdout.write(`[prepare-electron] ${message}\n`);
}

if (!fs.existsSync(path.join(standalone, 'server.js'))) {
  process.stderr.write(
    '[prepare-electron] .next/standalone/server.js not found. Run `next build` first (needs output: "standalone").\n',
  );
  process.exit(1);
}

function copyDir(from, to) {
  if (!fs.existsSync(from)) return false;
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.cpSync(from, to, { recursive: true });
  return true;
}

// 1) Server chunks reference ../static; standalone expects them at .next/static.
const staticCopied = copyDir(
  path.join(root, '.next', 'static'),
  path.join(standalone, '.next', 'static'),
);
log(staticCopied ? 'copied .next/static' : 'no .next/static to copy (unexpected)');

// 2) The public folder (includes the Stockfish engine under public/stockfish).
const publicCopied = copyDir(path.join(root, 'public'), path.join(standalone, 'public'));
log(publicCopied ? 'copied public/ (incl. stockfish engine)' : 'no public/ folder found');

// Sanity check: the engine manifest must be present or the desktop app ships without
// Stockfish. The specific build filenames vary by engine version, so check the manifest.
const manifestPath = path.join(standalone, 'public', 'stockfish', 'manifest.json');
if (!fs.existsSync(manifestPath)) {
  log('WARNING: public/stockfish/manifest.json missing — run `node scripts/setup-engine.mjs` before building.');
} else {
  const { single, threaded } = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  log(`verified bundled Stockfish engine (single: ${single}, threaded: ${threaded ?? 'none'})`);
}

log('standalone output is ready for electron-builder');
