/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      // Paleta cobre brand replicada del desktop
      colors: {
        bg: {
          0: '#0a0706',
          1: '#14100d',
          2: '#1a1410',
          3: '#251c16'
        },
        ink: {
          1: '#f4e6d7',  // texto principal
          2: '#c9b29c',
          3: '#8a7866',
          4: '#5d4e40'
        },
        copper: {
          50:  '#fbe9d7',
          100: '#f4d2af',
          200: '#e8b591',  // primario
          300: '#c8794a',  // primario fuerte
          400: '#80401c'
        },
        line: {
          1: 'rgba(232, 181, 145, 0.10)',
          2: 'rgba(232, 181, 145, 0.18)'
        },
        ready: '#5fb371',
        live:  '#d04848'
      },
      fontFamily: {
        display: ['"Cormorant Garamond"', 'Georgia', 'serif'],
        ui:      ['system-ui', '-apple-system', 'Inter', 'Roboto', 'sans-serif'],
        mono:    ['"JetBrains Mono"', '"Fira Code"', 'monospace']
      },
      // Safe-area-inset utilities para notch iPhone
      padding: {
        'safe-t': 'env(safe-area-inset-top)',
        'safe-b': 'env(safe-area-inset-bottom)'
      }
    }
  },
  plugins: []
}
