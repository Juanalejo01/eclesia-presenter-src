// Post-build: embebe build/icon.ico en los .exe generados por electron-builder.
//
// rcedit v5 es ESM-only, por eso este archivo es .mjs.
// Usa el binary rcedit standalone (no necesita winCodeSign).

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { rcedit } from 'rcedit'

const __filename = fileURLToPath(import.meta.url)
const __dirname  = path.dirname(__filename)

const ROOT = path.join(__dirname, '..')
const DIST = path.join(ROOT, 'dist-electron')
const ICON = path.join(ROOT, 'build', 'icon.ico')

function exists(p) { try { return fs.existsSync(p) } catch { return false } }

async function main() {
  if (!exists(ICON)) {
    console.error('[embed-icon] build/icon.ico no existe. Ejecuta `npm run icon` primero.')
    return
  }

  const targets = []
  if (exists(DIST)) {
    for (const f of fs.readdirSync(DIST)) {
      if (f.endsWith('.exe') && !f.toLowerCase().includes('uninstall')) {
        targets.push(path.join(DIST, f))
      }
    }
    const unpackedExe = path.join(DIST, 'win-unpacked', 'EclesiaPresenter.exe')
    if (exists(unpackedExe)) targets.push(unpackedExe)
  }

  if (targets.length === 0) {
    console.log('[embed-icon] No hay .exe en dist-electron/. Skip.')
    return
  }

  console.log(`[embed-icon] Embebiendo build/icon.ico en ${targets.length} ejecutable(s)...`)

  for (const exe of targets) {
    try {
      await rcedit(exe, {
        icon: ICON,
        'version-string': {
          ProductName: 'EclesiaPresenter',
          FileDescription: 'EclesiaPresenter — Software de presentación para iglesias',
          CompanyName: 'EclesiaPresenter',
          LegalCopyright: '© 2026 Juanalejo01',
        },
      })
      console.log('  ✓', path.relative(ROOT, exe))
    } catch (err) {
      console.error('  ✗', path.relative(ROOT, exe), '—', err?.message || err)
    }
  }

  console.log('[embed-icon] Listo.')
}

main().catch(err => {
  console.error('[embed-icon] Error fatal:', err)
  process.exit(1)
})
