// Tests E2E de la página de descarga.

import { test, expect } from '@playwright/test'

test.describe('Download page', () => {
  test('muestra v0.2.x y los 2 CTAs (instalador + portable)', async ({ page }) => {
    await page.goto('/download')

    // Título
    await expect(page.getByRole('heading', { name: /Descarga/i })).toBeVisible()

    // Versión visible en el header de la página (ej. "v 0.2.1 — Beta").
    // Matchemos por el sufijo "Beta" para distinguir del navbar pill
    // (que es display:none en mobile) y del footer.
    await expect(page.getByText(/v\s*0\.\d+.*Beta/i)).toBeVisible()

    // Las 2 cards
    await expect(page.getByRole('heading', { name: 'Instalador' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Portable' })).toBeVisible()

    // Badge "Recomendado" en la card del instalador
    await expect(page.getByText('Recomendado').first()).toBeVisible()

    // CTAs con texto descriptivo
    await expect(page.getByRole('link', { name: /Descargar instalador/i })).toBeVisible()
    await expect(page.getByRole('link', { name: /Descargar portable/i })).toBeVisible()
  })

  test('menciona SignPath Foundation en el bloque de SmartScreen', async ({ page }) => {
    await page.goto('/download')
    // Bloqueo requerido por SignPath Foundation OSS — debe aparecer
    await expect(page.getByText(/SignPath Foundation/i).first()).toBeVisible()
  })

  test('los CTAs apuntan a /download/installer y /download/portable', async ({ page }) => {
    await page.goto('/download')
    const installer = page.getByRole('link', { name: /Descargar instalador/i })
    const portable  = page.getByRole('link', { name: /Descargar portable/i })
    await expect(installer).toHaveAttribute('href', /download\/installer/)
    await expect(portable).toHaveAttribute('href', /download\/portable/)
  })
})
