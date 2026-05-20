// Post-build: embebe build/icon.ico en los .exe generados por electron-builder.
//
// PROBLEMA QUE RESUELVE:
//   electron-builder usa "winCodeSign" (un .7z con tools de firma) para embeber
//   iconos via rcedit. Pero ese archivo contiene symlinks de macOS que Windows
//   no puede extraer sin permisos de admin/Developer Mode. Resultado: el .exe
//   se queda con el icono por defecto de Electron.
//
// SOLUCIÓN:
//   Usar app-builder.exe (que YA viene en node_modules como dep de
//   electron-builder) — tiene el subcomando `rcedit` que embebe iconos
//   sin necesidad de extraer winCodeSign.

const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')

const ROOT = path.join(__dirname, '..')
const DIST = path.join(ROOT, 'dist-electron')
const ICON = path.join(ROOT, 'build', 'icon.ico')
const APP_BUILDER = path.join(ROOT, 'node_modules', 'app-builder-bin', 'win', 'x64', 'app-builder.exe')

function exists(p) { try { return fs.existsSync(p) } catch { return false } }

if (!exists(ICON)) {
  console.error('[embed-icon] build/icon.ico no existe. Ejecuta `npm run icon` primero.')
  process.exit(0)  // exit 0: no rompemos la build, solo loggeamos
}
if (!exists(APP_BUILDER)) {
  console.error('[embed-icon] app-builder.exe no encontrado en node_modules. Skip.')
  process.exit(0)
}

// Lista de ejecutables Windows a procesar (portable + setup NSIS + el .exe
// principal dentro del paquete win-unpacked si existe)
const targets = []
for (const f of fs.readdirSync(DIST)) {
  if (f.endsWith('.exe') && !f.includes('Uninstall')) {
    targets.push(path.join(DIST, f))
  }
}
// El .exe interno empaquetado dentro de win-unpacked es el que Windows
// usará como icono al instalar via NSIS
const unpackedExe = path.join(DIST, 'win-unpacked', 'EclesiaPresenter.exe')
if (exists(unpackedExe)) targets.push(unpackedExe)

if (targets.length === 0) {
  console.log('[embed-icon] No hay .exe en dist-electron/. Skip.')
  process.exit(0)
}

console.log(`[embed-icon] Embebiendo build/icon.ico en ${targets.length} ejecutable(s)...`)

for (const exe of targets) {
  try {
    execFileSync(APP_BUILDER, [
      'rcedit',
      '--path', exe,
      '--set-icon', ICON,
    ], { stdio: ['ignore', 'pipe', 'pipe'] })
    console.log('  ✓', path.relative(ROOT, exe))
  } catch (err) {
    console.error('  ✗', path.relative(ROOT, exe), '—', err?.stderr?.toString() || err?.message || err)
  }
}

console.log('[embed-icon] Listo.')
