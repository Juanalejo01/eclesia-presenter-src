import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

// Leemos la version del package.json en build-time para inyectarla como
// constante global (__MOBILE_VERSION__). Asi MoreScreen puede mostrar "Mando
// vX.Y.Z" sin acoplar el bundle al import.meta.env, y los upgrades del paquete
// se reflejan automaticamente en la UI sin tocar codigo.
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const pkg = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf8'))

export default defineConfig({
  plugins: [react()],
  define: {
    __MOBILE_VERSION__: JSON.stringify(pkg.version),
  },
  server: {
    host: true,        // Expone IP de red para preview en móvil mismo WiFi
    port: 5173,
    strictPort: false
  },
  build: {
    outDir: 'dist',
    sourcemap: true
  }
})
