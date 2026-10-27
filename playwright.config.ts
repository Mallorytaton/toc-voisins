import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  timeout: 90_000,
  use: { baseURL: 'http://localhost:4173/toc-voisins/', trace: 'off' },
  webServer: { command: 'npx vite preview --port 4173 --strictPort', url: 'http://localhost:4173/toc-voisins/', reuseExistingServer: true },
  projects: [
    { name: 'iphone', use: { ...devices['iPhone 13'], browserName: 'chromium' } },
    { name: 'android', use: { ...devices['Pixel 7'] } },
    { name: 'petit-ecran', use: { ...devices['iPhone SE'], browserName: 'chromium' } },
  ],
});
