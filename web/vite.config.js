import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';

// One JS file and one CSS file, with every font, image and icon inlined. The Worker serves them inside the HTML
// (its CSP allows inline scripts but not same-origin files), so there must be nothing else to fetch.
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    assetsInlineLimit: 100000000,
    cssCodeSplit: false,
    chunkSizeWarningLimit: 4000,
    rollupOptions: {output: {entryFileNames: 'app.js', assetFileNames: 'app[extname]', codeSplitting: false}},
  },
  server: {proxy: {'/api': 'http://localhost:8787'}},
});
