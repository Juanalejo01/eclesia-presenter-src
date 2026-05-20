// Embebe build/icon.ico SOLO en win-unpacked/EclesiaPresenter.exe (el binario
// raw, antes de empaquetar). Luego electron-builder --prepackaged construye
// portable y setup desde esa carpeta, incluyendo el icono embebido.
//
// IMPORTANTE: NO ejecutar rcedit sobre los .exe portable/setup ya empaquetados
// porque tienen un payload self-extracting al final del archivo y rcedit
// corrompe el offset → archivos de 0.4 MB inservibles.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { rcedit } from 'rcedit'

const __filename = fileURLToPath(import.meta.url)
const __dirname  = path.dirname(__filename)

const ROOT = path.join(__dirname, '..')
const ICON = path.join(ROOT, 'build', 'icon.ico')
const TARGET = path.join(ROOT, 'dist-electron', 'win-unpacked', 'EclesiaPresenter.exe')

function exists(p) { try { return fs.existsSync(p) } catch { return false } }

async function main() {
  if (!exists(ICON)) {
    console.error('[embed-icon] build/icon.ico no existe. Ejecuta `npm run icon` primero.')
    process.exit(1)
  }
  if (!exists(TARGET)) {
    console.error('[embed-icon] dist-electron/win-unpacked/EclesiaPresenter.exe no existe.')
    console.error('               Ejecuta electron-builder --win --dir primero.')
    process.exit(1)
  }

  console.log('[embed-icon] Embebiendo build/icon.ico en win-unpacked/EclesiaPresenter.exe...')

  await rcedit(TARGET, {
    icon: ICON,
    'version-string': {
      ProductName: 'EclesiaPresenter',
      FileDescription: 'EclesiaPresenter — Software de presentación para iglesias',
      CompanyName: 'EclesiaPresenter',
      LegalCopyright: '© 2026 Juanalejo01',
    },
  })

  console.log('[embed-icon] ✓ Listo. El portable y setup que se construyan a continuación heredarán el icono.')
}

main().catch(err => {
  console.error('[embed-icon] Error:', err?.message || err)
  process.exit(1)
})
