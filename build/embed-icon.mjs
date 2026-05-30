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

  console.log('[embed-icon] ✓ Icono embebido.')

  // ════════════════════════════════════════════════════════════
  // app-update.yml para electron-updater.
  //
  // Este archivo le dice a electron-updater dónde buscar 'latest.yml'.
  // Cuando build hace --prepackaged, NO se genera automáticamente
  // (porque salta el step de packaging que normalmente lo crea).
  // Lo escribimos manualmente apuntando al feed de GitHub Releases.
  // Sin esto, la app instalada falla con:
  //   "ENOENT: no such file or directory, open '...resources\app-update.yml'"
  // ════════════════════════════════════════════════════════════
  const RESOURCES_DIR = path.join(ROOT, 'dist-electron', 'win-unpacked', 'resources')
  const APP_UPDATE_YML = path.join(RESOURCES_DIR, 'app-update.yml')
  if (!exists(RESOURCES_DIR)) fs.mkdirSync(RESOURCES_DIR, { recursive: true })

  const ymlContent = [
    'provider: github',
    'owner: Juanalejo01',
    'repo: eclesia-presenter',
    'updaterCacheDirName: eclesia-presenter-updater',
    'releaseType: release',
    'publishAutoUpdate: true',
    '',
  ].join('\n')
  fs.writeFileSync(APP_UPDATE_YML, ymlContent, 'utf8')
  console.log('[embed-icon] ✓ app-update.yml generado en', APP_UPDATE_YML)

  console.log('[embed-icon] ✓ Listo. Portable + setup ahora pueden auto-actualizarse.')
}

main().catch(err => {
  console.error('[embed-icon] Error:', err?.message || err)
  process.exit(1)
})
