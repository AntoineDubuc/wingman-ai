import { defineConfig } from 'vite';
import { crx } from '@crxjs/vite-plugin';
import { resolve } from 'path';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import manifest from './manifest.json';

export default defineConfig({
  plugins: [
    crx({ manifest }),
    viteStaticCopy({
      targets: [
        { src: 'src/tutorials/kb-upload-search.html', dest: 'src/tutorials' },
        { src: 'src/tutorials/kb-upload-search', dest: 'src/tutorials' },
        { src: 'src/tutorials/summary-settings.html', dest: 'src/tutorials' },
        { src: 'src/tutorials/summary-settings', dest: 'src/tutorials' },
        { src: 'src/tutorials/summary-overlay.html', dest: 'src/tutorials' },
        { src: 'src/tutorials/summary-overlay', dest: 'src/tutorials' },
        { src: 'src/offscreen/audio-processor.js', dest: 'src/offscreen' },
      ],
    }),
  ],
  base: './',
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@shared': resolve(__dirname, 'src/shared'),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: process.env.NODE_ENV === 'development',
    rollupOptions: {
      input: {
        background: resolve(__dirname, 'src/background/service-worker.ts'),
        content: resolve(__dirname, 'src/content/content-script.ts'),
        popup: resolve(__dirname, 'src/popup/popup.ts'),
        offscreen: resolve(__dirname, 'src/offscreen/offscreen.ts'),
        validation: resolve(__dirname, 'src/validation/validation.html'),
        tutorials: resolve(__dirname, 'src/tutorials/index.html'),
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name]-[hash].js',
      },
    },
  },
});
