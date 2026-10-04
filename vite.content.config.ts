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

// Content script build: outputs a self-contained IIFE — no ESM imports.
// Chrome loads content scripts as classic scripts, so they cannot use
// top-level `import` statements produced by the ES module format.
export default defineConfig({
  plugins: [react(), sanitizeUtf8Plugin()],
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
  build: {
    emptyOutDir: false,       // Don't wipe dist — main build runs first
    lib: {
      entry: resolve(__dirname, 'src/content/content.tsx'),
      name: 'eX1Content',
      formats: ['iife'],
      fileName: () => 'content.js',
    },
    outDir: 'dist',
    rollupOptions: {
      output: {
        assetFileNames: (info) => {
          if (info.name?.endsWith('.css')) return 'content.[ext]';
          return 'assets/[name]-[hash].[ext]';
        },
      },
    },
  },
});
