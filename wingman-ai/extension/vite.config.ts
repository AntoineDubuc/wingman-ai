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
        { src: 'src/tutorials/getting-started.html', dest: 'src/tutorials' },
        { src: 'src/tutorials/personas.html', dest: 'src/tutorials' },
        { src: 'src/tutorials/hydra.html', dest: 'src/tutorials' },
        { src: 'src/tutorials/conclave.html', dest: 'src/tutorials' },
        { src: 'src/tutorials/call-settings.html', dest: 'src/tutorials' },
        { src: 'src/tutorials/screenshots-new', dest: 'src/tutorials' },
        { src: 'src/offscreen/audio-processor.js', dest: 'src/offscreen' },
        { src: 'src/mic-permission.html', dest: 'src' },
        { src: 'src/mic-permission.js', dest: 'src' },
        { src: 'src/assets', dest: 'src' },
        { src: 'src/assets/icons', dest: 'src/assets' },
        { src: 'src/content/overlay', dest: 'src/content' },
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
