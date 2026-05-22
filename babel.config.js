// Babel config — usado SOLO por Jest (no afecta a Vite, que tiene su propio
// pipeline con esbuild interno). Si en el futuro Vite empieza a tomar este
// archivo, hay que renombrarlo a babel.config.test.js y referenciarlo desde
// jest.config.js → "babel-jest" con config explícita.

module.exports = {
  presets: [
    ['@babel/preset-env', { targets: { node: 'current' } }],
    ['@babel/preset-react', { runtime: 'automatic' }],
  ],
}
