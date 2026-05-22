// Tests E2E de la página de precios.

import { test, expect } from '@playwright/test'

test.describe('Pricing page', () => {
  test('muestra los 4 planes con sus precios', async ({ page }) => {
    await page.goto('/pricing')

    // Headings de cada plan (el del Free puede ser h2 o h3 según el diseño)
    await expect(page.getByText(/^Free$/).first()).toBeVisible()
    await expect(page.getByText(/Pro Mensual/i).first()).toBeVisible()
    await expect(page.getByText(/Pro Anual/i).first()).toBeVisible()
    await expect(page.getByText(/Lifetime/i).first()).toBeVisible()
  })

  test('muestra los precios correctos en cada plan', async ({ page }) => {
    await page.goto('/pricing')
    await expect(page.getByText('0€').first()).toBeVisible()
    await expect(page.getByText('9€').first()).toBeVisible()
    await expect(page.getByText('79€').first()).toBeVisible()
    await expect(page.getByText('249€').first()).toBeVisible()
  })
})
