import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

import type { Plugin } from 'vite';

function sanitizeUtf8Plugin(): Plugin {
  return {
    name: 'sanitize-utf8',
    generateBundle(_options, bundle) {
      for (const file of Object.values(bundle)) {
        if (file.type === 'chunk' && file.code) {
          file.code = file.code.replace(/[\uFDD0-\uFDEF\uFFFE\uFFFF]/g, (char) => {
            return '\\u' + char.charCodeAt(0).toString(16).padStart(4, '0');
          });
        }
      }
    },
  };
}

// Main build: newtab dashboard + background service worker
export default defineConfig({
  plugins: [react(), sanitizeUtf8Plugin()],
  build: {
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index:      resolve(__dirname, 'index.html'),
        newtab:     resolve(__dirname, 'newtab.html'),
        offscreen:  resolve(__dirname, 'offscreen.html'),
        background: resolve(__dirname, 'src/background/service-worker.ts'),
      },
      output: {
        format: 'es',
        entryFileNames: (chunk) => {
          if (chunk.name === 'newtab') return 'newtab.js';
          if (chunk.name === 'offscreen') return 'offscreen.js';
          return '[name].js';
        },
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: (info) => {
          if (info.name?.endsWith('.css')) {
            if (info.name === 'main.css') return 'newtab.css';
            return '[name].[ext]';
          }
          return 'assets/[name]-[hash].[ext]';
        },
      },
    },
  },
});
