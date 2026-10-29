import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: '/toc-voisins/',
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'TOC',
        short_name: 'TOC',
        description: 'Le jeu de TOC en équipes, sur ton téléphone.',
        lang: 'fr',
        start_url: '/toc-voisins/',
        scope: '/toc-voisins/',
        display: 'standalone',
        // Un lien de partage touché alors que l'app tourne déjà la réutilise au lieu d'en ouvrir une autre.
        launch_handler: { client_mode: ['navigate-existing', 'auto'] },
        orientation: 'portrait',
        background_color: '#fbf6ef',
        theme_color: '#fbf6ef',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: { globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'], navigateFallback: 'index.html', importScripts: ['push-sw.js'] },
    }),
  ],
  test: { include: ['tests/**/*.test.ts'] },
});
