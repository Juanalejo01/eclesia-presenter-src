const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electron', {
  // Enviar slide al sistema de proyección
  // (alias conservado para slideStore.syncToMain)
  sendSlide: (slideData) => ipcRenderer.send('slide:send', slideData),

  // Biblioteca de medios (imágenes/videos)
  media: {
    pick:     (kind)  => ipcRenderer.invoke('media:pick',     kind),
    list:     (opts)  => ipcRenderer.invoke('media:list',     opts),
    delete:   (id)    => ipcRenderer.invoke('media:delete',   id),
    addFiles: (paths) => ipcRenderer.invoke('media:addFiles', paths),
  },

  // Proyección externa (overlay / background — capturable por OBS, sin red)
  projection: {
    open:  (opts)  => ipcRenderer.invoke('projection:open', opts),
    close: (mode)  => ipcRenderer.invoke('projection:close', mode),
    // T11: cerrar TODAS las ventanas de proyeccion (panico desde mobile).
    closeAll: ()   => ipcRenderer.invoke('projection:closeAll'),
    theme: (patch) => ipcRenderer.invoke('projection:theme', patch),
    resetTheme: () => ipcRenderer.invoke('projection:resetTheme'),
    state: ()      => ipcRenderer.invoke('projection:state'),
    toggleOverlayVisible: (visible) => ipcRenderer.invoke('projection:toggleOverlayVisible', visible),
    setNotes:     (text)  => ipcRenderer.invoke('projection:setNotes', text),
    setCountdown: (state) => ipcRenderer.invoke('projection:setCountdown', state),
    onInit:      (cb) => { ipcRenderer.on('projection:init',      (_e, d) => cb(d));  return () => ipcRenderer.removeAllListeners('projection:init') },
    onSlide:     (cb) => { ipcRenderer.on('projection:slide',     (_e, d) => cb(d));  return () => ipcRenderer.removeAllListeners('projection:slide') },
    onTheme:     (cb) => { ipcRenderer.on('projection:theme',     (_e, d) => cb(d));  return () => ipcRenderer.removeAllListeners('projection:theme') },
    onNotes:     (cb) => { ipcRenderer.on('projection:notes',     (_e, d) => cb(d));  return () => ipcRenderer.removeAllListeners('projection:notes') },
    onCountdown: (cb) => { ipcRenderer.on('projection:countdown', (_e, d) => cb(d));  return () => ipcRenderer.removeAllListeners('projection:countdown') },
  },

  // Songs CRUD (SQLite vía main process)
  songs: {
    list:     (opts)       => ipcRenderer.invoke('songs:list', opts),
    get:      (id)         => ipcRenderer.invoke('songs:get', id),
    getByCloudId: (cloudId) => ipcRenderer.invoke('songs:getByCloudId', cloudId),
    create:   (data)       => ipcRenderer.invoke('songs:create', data),
    update:   (id, data)   => ipcRenderer.invoke('songs:update', id, data),
    delete:   (id)         => ipcRenderer.invoke('songs:delete', id),
    favorite: (id)         => ipcRenderer.invoke('songs:favorite', id),
    export:   ()           => ipcRenderer.invoke('songs:export'),
    import:   (opts)       => ipcRenderer.invoke('songs:import', opts),
    importHolyrics: ()     => ipcRenderer.invoke('songs:importHolyrics'),
  },

  // Utilidades de la app (settings + ciclo de vida)
  app: {
    pickDirectory: (title) => ipcRenderer.invoke('app:pickDirectory', title),
    info:          ()      => ipcRenderer.invoke('app:info'),
    // Confirmación de cierre: el main pide al renderer que muestre el
    // AppDialog custom (en lugar del nativo Win11), y el renderer responde
    // con true/false para que el main decida cerrar o cancelar.
    // El ack inmediato cancela el timer del fallback nativo en el main;
    // sin él, si el usuario tarda >2s en decidir, salía el nativo en
    // paralelo (bug de v0.2.14-v0.2.16).
    ackQuitConfirm: () => ipcRenderer.send('app:ack-quit-confirm'),
    respondQuitConfirm: (ok) => ipcRenderer.invoke('app:respond-quit-confirm', ok),
    onRequestQuitConfirm: (cb) => {
      const h = () => cb()
      ipcRenderer.on('app:request-quit-confirm', h)
      return () => ipcRenderer.removeListener('app:request-quit-confirm', h)
    },
  },

  // Servidor local embebido (mobile remote + OBS overlay)
  server: {
    info:    ()    => ipcRenderer.invoke('server:info'),
    onRemoteEvent: (cb) => {
      const handler = (_e, name, payload) => cb(name, payload)
      ipcRenderer.on('remote:event', handler)
      return () => ipcRenderer.removeListener('remote:event', handler)
    },
  },

  // Importación de biblias
  bibles: {
    import:         ()    => ipcRenderer.invoke('bibles:import'),
    listImported:   ()    => ipcRenderer.invoke('bibles:listImported'),
    readImported:   (id)  => ipcRenderer.invoke('bibles:readImported', id),
    deleteImported: (id)  => ipcRenderer.invoke('bibles:deleteImported', id),
  },

  // Licencia (Free / Pro). El renderer lee el plan para feature gates,
  // y la pantalla de Ajustes → Licencia llama a activate/deactivate.
  license: {
    state:      ()    => ipcRenderer.invoke('license:state'),
    activate:   (key) => ipcRenderer.invoke('license:activate', key),
    deactivate: ()    => ipcRenderer.invoke('license:deactivate'),
    validate:   ()    => ipcRenderer.invoke('license:validate'),
  },

  // Cloud sync (Pro). Sincroniza canciones entre PCs vía Supabase.
  cloudSync: {
    state:      ()    => ipcRenderer.invoke('cloud-sync:state'),
    setEnabled: (on)  => ipcRenderer.invoke('cloud-sync:setEnabled', on),
    syncNow:    ()    => ipcRenderer.invoke('cloud-sync:syncNow'),
    onStart: (cb) => { const h = (_e, d) => cb(d); ipcRenderer.on('cloud-sync:start', h); return () => ipcRenderer.removeListener('cloud-sync:start', h) },
    onOk:    (cb) => { const h = (_e, d) => cb(d); ipcRenderer.on('cloud-sync:ok',    h); return () => ipcRenderer.removeListener('cloud-sync:ok', h) },
    onError: (cb) => { const h = (_e, d) => cb(d); ipcRenderer.on('cloud-sync:error', h); return () => ipcRenderer.removeListener('cloud-sync:error', h) },
  },

  // Importar listas del día planificadas en el móvil (C3b)
  cloudSchedules: {
    list: ()   => ipcRenderer.invoke('schedules:cloud-list'),
    get:  (id) => ipcRenderer.invoke('schedules:cloud-get', id),
  },

  // Auto-updater (electron-updater + GitHub Releases)
  updater: {
    state:    ()  => ipcRenderer.invoke('updater:state'),
    check:    ()  => ipcRenderer.invoke('updater:check'),
    download: ()  => ipcRenderer.invoke('updater:download'),
    install:  ()  => ipcRenderer.invoke('updater:install'),
    onChecking:        (cb) => { const h = (_e, d) => cb(d); ipcRenderer.on('updater:checking',        h); return () => ipcRenderer.removeListener('updater:checking', h) },
    onAvailable:       (cb) => { const h = (_e, d) => cb(d); ipcRenderer.on('updater:available',       h); return () => ipcRenderer.removeListener('updater:available', h) },
    onNotAvailable:    (cb) => { const h = (_e, d) => cb(d); ipcRenderer.on('updater:not-available',   h); return () => ipcRenderer.removeListener('updater:not-available', h) },
    onDownloadProgress:(cb) => { const h = (_e, d) => cb(d); ipcRenderer.on('updater:download-progress', h); return () => ipcRenderer.removeListener('updater:download-progress', h) },
    onDownloaded:      (cb) => { const h = (_e, d) => cb(d); ipcRenderer.on('updater:downloaded',      h); return () => ipcRenderer.removeListener('updater:downloaded', h) },
    onError:           (cb) => { const h = (_e, d) => cb(d); ipcRenderer.on('updater:error',           h); return () => ipcRenderer.removeListener('updater:error', h) },
  },

  // (v0.2.14) bglib eliminado — la biblioteca de fondos preset vive ahora
  // en el apartado /recursos de la web. El usuario descarga lo que quiere
  // como archivos normales y los usa vía MediaPicker.
})
