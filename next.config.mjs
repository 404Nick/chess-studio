/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Emit a self-contained server (`.next/standalone`) so the Electron build can ship
  // a minimal Node server without the full node_modules tree.
  output: 'standalone',
  eslint: {
    // Lint is run explicitly via `npm run lint`; don't fail production builds on style rules.
    ignoreDuringBuilds: true,
  },
  async headers() {
    return [
      {
        // Cross-origin isolation on every page enables SharedArrayBuffer, which the
        // multi-threaded NNUE Stockfish build needs. `credentialless` (rather than
        // `require-corp`) keeps cross-origin images like Chess.com avatars loading.
        source: '/:path*',
        headers: [
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          { key: 'Cross-Origin-Embedder-Policy', value: 'credentialless' },
        ],
      },
      {
        // The manifest is the mutable index — must revalidate so an engine upgrade
        // is picked up instead of a stale cached pointer.
        source: '/stockfish/manifest.json',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, must-revalidate' },
          { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
        ],
      },
      {
        // The Stockfish worker + wasm + NNUE net are served from /public/stockfish.
        // Long-lived cache: the files are content-stable for a given engine build.
        source: '/stockfish/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
          // Allows the wasm to be instantiated from the worker without extra fetch hops.
          { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
        ],
      },
    ];
  },
  webpack(config) {
    // Stockfish is loaded at runtime as a classic Worker from /public — make sure
    // webpack never tries to bundle/parse the emscripten output.
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      path: false,
      crypto: false,
    };
    return config;
  },
};

export default nextConfig;
