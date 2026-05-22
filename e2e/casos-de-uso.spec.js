// Tests E2E de la página de casos de uso.

import { test, expect } from '@playwright/test'

test.describe('Casos de uso page', () => {
  test('muestra empty state honesto cuando no hay testimonios', async ({ page }) => {
    await page.goto('/casos-de-uso')

    // Título principal
    await expect(page.getByRole('heading', { name: /Casos de uso/i }).first()).toBeVisible()

    // Empty state honesto
    await expect(page.getByText(/Tu historia podría ser/i)).toBeVisible()

    // CTAs para compartir historia
    await expect(page.getByRole('link', { name: /Compartir mi historia/i })).toBeVisible()
    await expect(page.getByRole('link', { name: /Otras formas de contactar/i })).toBeVisible()
  })

  test('muestra los 5 escenarios diseñados', async ({ page }) => {
    await page.goto('/casos-de-uso')

    // Los 5 perfiles de iglesia
    await expect(page.getByText(/Iglesia pequeña/i)).toBeVisible()
    await expect(page.getByText(/Iglesia mediana/i)).toBeVisible()
    await expect(page.getByText(/Iglesia grande/i)).toBeVisible()
    await expect(page.getByText(/multi-campus/i)).toBeVisible()
    await expect(page.getByText(/Iglesia online/i)).toBeVisible()
  })

  test('el mailto del empty state tiene template pre-rellenado', async ({ page }) => {
    await page.goto('/casos-de-uso')
    const cta = page.getByRole('link', { name: /Compartir mi historia/i })
    const href = await cta.getAttribute('href')
    expect(href).toMatch(/^mailto:juanlpz\.dev@gmail\.com/)
    expect(href).toContain('subject=')
    expect(href).toContain('body=')
  })
})
