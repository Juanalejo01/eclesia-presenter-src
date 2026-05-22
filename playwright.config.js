// Playwright config para tests E2E de la web (Next.js).
//
// Estrategia: tests contra el servidor de desarrollo de Next.js que se
// arranca automáticamente con `webServer`. En CI también funciona porque
// Playwright espera a que responda antes de empezar.
//
// Ejecutar:
//   npm run e2e          # corre todos los tests headless
//   npm run e2e:ui       # interfaz visual de Playwright para debug

import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: { timeout: 5_000 },

  // Reintentos solo en CI para evitar flakes ocasionales.
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,

  // Reporte legible localmente, JUnit XML para CI.
  reporter: process.env.CI
    ? [['list'], ['junit', { outputFile: 'playwright-results.xml' }]]
    : 'list',

  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    // Mobile viewport para validar que el MobileMenu funciona.
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 5'] },
    },
  ],

  // Arranca el servidor Next.js automáticamente antes de los tests.
  // Skip si ya hay un servidor en el puerto 3000 (útil en dev).
  webServer: process.env.E2E_BASE_URL ? undefined : {
    command: 'cd web && npm run dev',
    url: 'http://localhost:3000',
    timeout: 120_000,
    reuseExistingServer: !process.env.CI,
  },
})
