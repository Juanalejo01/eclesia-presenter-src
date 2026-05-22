// Jest config para EclesiaPresenter.
//
// Estrategia: tests unitarios de módulos PUROS del renderer
// (sin dependencias de electron / better-sqlite3). Para módulos del main
// process se necesitarían mocks de electron, fuera del scope actual.
//
// Ejecutar:
//   npm test           # corre los tests una vez
//   npm run test:watch # modo watch durante desarrollo
//   npm run test:cov   # con coverage report

module.exports = {
  // jsdom para módulos que usan document/window (i18n, themeStore).
  testEnvironment: 'jsdom',

  // Carpeta donde viven los tests.
  testMatch: [
    '<rootDir>/__tests__/**/*.test.{js,jsx}',
  ],

  // Babel para transformar JSX + ESM modules.
  transform: {
    '^.+\\.(js|jsx)$': 'babel-jest',
  },

  // Ignora el main process (necesita mocks) y node_modules.
  testPathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    '/dist-electron/',
    '/web/',
  ],

  // Cobertura solo sobre los módulos que SÍ testeamos.
  collectCoverageFrom: [
    'src/renderer/services/i18n.js',
    'src/renderer/services/textUtils.js',
    'src/renderer/services/songSplit.js',
  ],

  // Salida de coverage en formato CI-friendly.
  coverageReporters: ['text', 'lcov', 'html'],
  coverageDirectory: '<rootDir>/coverage',

  // Output más limpio.
  verbose: true,
  clearMocks: true,
}
