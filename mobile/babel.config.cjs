/**
 * babel.config.js
 *
 * Solo se carga por Jest (babel-jest). Vite usa su propio pipeline
 * (esbuild + @vitejs/plugin-react) y NO lee este archivo en build.
 * Mantenemos el preset mínimo necesario para que Jest pueda parsear
 * `import`/`export` y JSX en tests.
 */
module.exports = {
  presets: [
    ['@babel/preset-env', { targets: { node: 'current' } }],
  ],
}
