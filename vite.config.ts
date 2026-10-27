import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: '/toc-voisins/',
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Toc entre voisins',
        short_name: 'Toc',
        description: 'Le jeu de Toc en ligne, entre voisins.',
        lang: 'fr',
        start_url: '/toc-voisins/',
        scope: '/toc-voisins/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#3b2414',
        theme_color: '#7a4a26',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: { globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'], navigateFallback: 'index.html' },
    }),
  ],
  test: { include: ['tests/**/*.test.ts'] },
});
