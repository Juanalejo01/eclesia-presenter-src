// Configuración de Capacitor. appId sigue el patrón inverso de dominio
// (debe coincidir con el bundle id de Android/iOS futuro).
const config = {
  appId: 'com.eclesiapresenter.mobile',
  appName: 'EclesiaPresenter',
  webDir: 'dist',
  server: {
    // En producción la app sirve `dist` localmente. Durante desarrollo
    // podemos apuntar a la red WiFi para HMR en el móvil real:
    //   url: 'http://192.168.1.X:5173',
    //   cleartext: true
    androidScheme: 'https'
  },
  // Permite que la status bar (notch) no tape la UI.
  // El plugin StatusBar manejará overlay en runtime.
  android: {
    backgroundColor: '#14100d'  // --bg-1 del desktop
  }
}
export default config
