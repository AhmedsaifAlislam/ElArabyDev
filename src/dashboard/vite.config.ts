import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import path from 'path';

// Builds a browser extension dashboard page
// Output: dist/dashboard.js (ESM, ready for manifest web_accessible_resources)
export default defineConfig({
  plugins: [preact()],
  base: './',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@shared': path.resolve(__dirname, '../shared'),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    minify: true,
    sourcemap: true,
    rollupOptions: {
      input: 'index.html',
      output: {
        entryFileNames: 'dashboard.js',
        assetFileNames: (assetInfo) =>
          assetInfo.name === 'style.css' ? 'dashboard.css' : 'assets/[name]-[hash][extname]',
        chunkFileNames: 'assets/[name]-[hash].js',
      },
    },
  },
});
