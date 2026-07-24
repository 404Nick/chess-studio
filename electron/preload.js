'use strict';

/**
 * Preload script. The renderer is the ordinary web app loaded from our own localhost
 * origin, so it needs no privileged bridge — this file intentionally exposes nothing.
 * It exists so `contextIsolation` has a defined preload and to mark the desktop build.
 */

const { contextBridge } = require('electron');

try {
  contextBridge.exposeInMainWorld('chessStudioDesktop', {
    isDesktop: true,
    platform: process.platform,
  });
} catch {
  // contextBridge is unavailable only when contextIsolation is off; ignore.
}
