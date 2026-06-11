// Genera los iconos PWA del mando móvil a partir de build/icon.png (512x512).
//
// Uso:   npm run icon:mobile   (desde el ROOT del repo)
//
// Vive en build/ (junto a generate-icons.js) y se ejecuta desde el root
// porque `sharp` es devDependency del root — NO existe en mobile/ y no
// existirá en el build de Vercel (Root Directory = mobile). Por eso los
// PNGs resultantes se COMMITEAN al repo en mobile/public/icons/.
//
// Salidas (mobile/public/icons/):
//   icon-192.png              → manifest icon purpose 'any'
//   icon-512.png              → manifest icon purpose 'any'
//   icon-512-maskable.png     → manifest icon purpose 'maskable'
//                               (fondo sólido #14100d + icono al 80% para
//                                respetar la safe zone de ~20% de Android)
//   apple-touch-icon-180.png  → iOS home screen (sin transparencia: iOS
//                               rellena el alpha con negro feo; aplanamos
//                               sobre #14100d nosotros)

const fs = require('fs')
const path = require('path')

const THEME_BG = '#14100d'

async function main() {
  const sharp = require('sharp')

  const srcPng = path.join(__dirname, 'icon.png')
  if (!fs.existsSync(srcPng)) {
    console.error('No existe build/icon.png')
    process.exit(1)
  }

  const outDir = path.join(__dirname, '..', 'mobile', 'public', 'icons')
  fs.mkdirSync(outDir, { recursive: true })

  // 1. icon-192.png — resize directo
  await sharp(srcPng).resize(192, 192).png().toFile(path.join(outDir, 'icon-192.png'))
  console.log('  ✓ icon-192.png')

  // 2. icon-512.png — re-encode 512 (normaliza metadata/compresión)
  await sharp(srcPng).resize(512, 512).png().toFile(path.join(outDir, 'icon-512.png'))
  console.log('  ✓ icon-512.png')

  // 3. icon-512-maskable.png — canvas 512 con fondo sólido y el icono al 80%
  //    (los launchers Android recortan hasta ~20% del borde en iconos maskable)
  const inner = Math.round(512 * 0.8) // 410
  const innerBuf = await sharp(srcPng).resize(inner, inner).png().toBuffer()
  const offset = Math.round((512 - inner) / 2)
  await sharp({
    create: { width: 512, height: 512, channels: 4, background: THEME_BG },
  })
    .composite([{ input: innerBuf, left: offset, top: offset }])
    .png()
    .toFile(path.join(outDir, 'icon-512-maskable.png'))
  console.log('  ✓ icon-512-maskable.png')

  // 4. apple-touch-icon-180.png — 180x180 aplanado sobre el theme color
  await sharp(srcPng)
    .resize(180, 180)
    .flatten({ background: THEME_BG })
    .png()
    .toFile(path.join(outDir, 'apple-touch-icon-180.png'))
  console.log('  ✓ apple-touch-icon-180.png')

  console.log('Iconos PWA del mobile generados en mobile/public/icons/')
}

main().catch((e) => {
  console.error('generate-mobile-icons falló:', e)
  process.exit(1)
})
