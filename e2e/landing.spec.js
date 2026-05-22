// Tests E2E de la landing principal (web/app/page.jsx)

import { test, expect } from '@playwright/test'

test.describe('Home page', () => {
  test('carga sin errores y muestra el hero', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveTitle(/EclesiaPresenter/i)
    // Logo + brand visible en la navbar
    await expect(page.locator('header').getByText('Eclesia')).toBeVisible()
  })

  test('CTA principal lleva a /download', async ({ page }) => {
    await page.goto('/')
    // El botón "Descargar gratis" del navbar (visible en desktop)
    // En mobile está en el MobileMenu, así que solo lo testeamos en chromium desktop.
    const isMobile = page.viewportSize().width < 1024
    if (isMobile) {
      test.skip()
      return
    }
    await page.getByRole('link', { name: /descargar gratis/i }).first().click()
    await expect(page).toHaveURL(/\/download/)
  })
})
