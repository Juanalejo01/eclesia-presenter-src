// Genera los iconos para la app (Windows .ico, macOS .icns y PNG) a partir
// de build/icon.svg.
//
// Uso:   npm run icon
//
// Deps:  sharp (rasterización SVG → PNG), png-to-ico (combinación PNG → ICO)
//        Para .icns en macOS usamos sharp + electron-icon-builder (opcional).
//
// El resultado queda en build/ y electron-builder lo recoge automáticamente
// vía build.win.icon y build.mac.icon en package.json.

const fs = require('fs')
const path = require('path')

async function main() {
  const sharp = require('sharp')
  const pngToIco = require('png-to-ico')

  const srcSvg = path.join(__dirname, 'icon.svg')
  if (!fs.existsSync(srcSvg)) {
    console.error('No existe build/icon.svg')
    process.exit(1)
  }

  const svgBuffer = fs.readFileSync(srcSvg)

  // 1. PNG a varias resoluciones (Windows ICO acepta múltiples)
  const sizes = [16, 24, 32, 48, 64, 128, 256, 512, 1024]
  const pngBuffers = {}
  for (const s of sizes) {
    const buf = await sharp(svgBuffer).resize(s, s).png().toBuffer()
    pngBuffers[s] = buf
    fs.writeFileSync(path.join(__dirname, `icon-${s}.png`), buf)
    console.log(`  ✓ icon-${s}.png`)
  }

  // 2. icon.png "canónico" (electron-builder lo usa como fallback)
  fs.writeFileSync(path.join(__dirname, 'icon.png'), pngBuffers[512])
  console.log('  ✓ icon.png (512x512)')

  // 3. ICO multi-resolución para Windows
  const icoBuffer = await pngToIco([
    pngBuffers[16], pngBuffers[32], pngBuffers[48], pngBuffers[64],
    pngBuffers[128], pngBuffers[256],
  ])
  fs.writeFileSync(path.join(__dirname, 'icon.ico'), icoBuffer)
  console.log('  ✓ icon.ico (multi-res)')

  // 4. (Opcional) Copia para el favicon web
  const webFavicon = path.join(__dirname, '..', 'web', 'app', 'icon.png')
  fs.writeFileSync(webFavicon, pngBuffers[512])
  console.log('  ✓ web/app/icon.png (favicon)')

  console.log('\n✅ Iconos generados correctamente.')
}

main().catch(err => {
  console.error('Error generando iconos:', err)
  process.exit(1)
})
