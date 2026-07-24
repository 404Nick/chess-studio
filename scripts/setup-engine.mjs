#!/usr/bin/env node
/**
 * Copies a Stockfish WebAssembly build out of node_modules into ./public/stockfish
 * so it can be spawned as a classic Web Worker at runtime (`new Worker('/stockfish/...')`).
 *
 * It supports several upstream packages because they all ship slightly different layouts:
 *   - stockfish.js   (v10, "stockfish.js" dispatcher + stockfish.wasm/.asm.js)  <-- default dep
 *   - stockfish      (v16/17, "stockfish-nnue-*.js" + split .wasm parts)
 *
 * The script is intentionally forgiving: if no engine package is installed it prints a
 * warning and exits 0, so `npm install` never fails because of it. The app detects the
 * missing engine at runtime and degrades gracefully.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const ROOT = process.cwd();
const DEST = path.join(ROOT, 'public', 'stockfish');

/** Packages we know how to harvest, in order of preference. */
const PACKAGES = ['stockfish.js', 'stockfish'];

/** Sub-directories inside a package that may contain the build output. */
const SEARCH_DIRS = ['', 'src', 'dist', 'lib'];

/**
 * Entry scripts we prefer, most-preferred first. Single-threaded builds come first:
 * they do not need SharedArrayBuffer, so the app works without COOP/COEP headers
 * (which would otherwise break the Lichess / Chess.com fetches).
 */
const ENTRY_PREFERENCE = [
  'stockfish.js',
  'stockfish-nnue-16-single.js',
  'stockfish-16.1-lite-single.js',
  'stockfish-nnue-16-no-simd.js',
  'stockfish-nnue-16.js',
  'stockfish-16.1-lite.js',
  'stockfish-17-lite-single.js',
  'stockfish-17-single.js',
];

/** Files that are loaded *by* an entry script and must never be treated as one. */
const NON_ENTRY = /(\.wasm\.js|\.asm\.js|\.worker\.js|worker\.js)$/i;

const COPYABLE = /\.(js|wasm|nnue|data|mem)$/i;

function log(msg) {
  process.stdout.write(`[setup-engine] ${msg}\n`);
}

function resolvePackageDir(pkg) {
  // Walk up from cwd looking for node_modules/<pkg>; handles workspaces & hoisting.
  let dir = ROOT;
  for (let i = 0; i < 6; i += 1) {
    const candidate = path.join(dir, 'node_modules', pkg);
    if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

function collectFiles(pkgDir) {
  /** @type {Map<string, string>} basename -> absolute path */
  const found = new Map();
  for (const sub of SEARCH_DIRS) {
    const dir = sub ? path.join(pkgDir, sub) : pkgDir;
    if (!fs.existsSync(dir)) continue;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      if (!COPYABLE.test(entry.name)) continue;
      // Earlier SEARCH_DIRS win so a package root file is not clobbered by a dist copy.
      if (!found.has(entry.name)) found.set(entry.name, path.join(dir, entry.name));
    }
  }
  return found;
}

function pickEntry(names) {
  for (const preferred of ENTRY_PREFERENCE) {
    if (names.includes(preferred)) return preferred;
  }
  const fallback = names
    .filter((n) => n.endsWith('.js') && !NON_ENTRY.test(n))
    .sort((a, b) => a.length - b.length)[0];
  return fallback ?? null;
}

function main() {
  let pkgDir = null;
  let pkgName = null;
  for (const pkg of PACKAGES) {
    const dir = resolvePackageDir(pkg);
    if (dir) {
      pkgDir = dir;
      pkgName = pkg;
      break;
    }
  }

  if (!pkgDir) {
    log(`no engine package found (looked for: ${PACKAGES.join(', ')}).`);
    log('Run `npm install` first. The app will show an "engine unavailable" banner until then.');
    return;
  }

  const files = collectFiles(pkgDir);
  if (files.size === 0) {
    log(`package "${pkgName}" contained no .js/.wasm build output — nothing to copy.`);
    return;
  }

  fs.mkdirSync(DEST, { recursive: true });

  let copied = 0;
  for (const [name, src] of files) {
    const dest = path.join(DEST, name);
    const srcStat = fs.statSync(src);
    if (fs.existsSync(dest)) {
      const destStat = fs.statSync(dest);
      if (destStat.size === srcStat.size && destStat.mtimeMs >= srcStat.mtimeMs) continue;
    }
    fs.copyFileSync(src, dest);
    copied += 1;
  }

  const names = [...files.keys()];
  const entry = pickEntry(names);
  if (!entry) {
    log(`could not determine an entry script among: ${names.join(', ')}`);
    return;
  }

  const manifest = {
    package: pkgName,
    entry,
    files: names.sort(),
    generatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(path.join(DEST, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

  log(`${pkgName}: copied ${copied} new file(s), ${names.length} total -> public/stockfish`);
  log(`entry script: ${entry}`);
}

try {
  main();
} catch (err) {
  // Never break `npm install` over the engine copy.
  log(`skipped (${err instanceof Error ? err.message : String(err)})`);
}
