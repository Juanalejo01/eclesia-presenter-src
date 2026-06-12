/**
 * i18n.js (T13) — Internacionalizacion ES/EN/PT del mando movil.
 *
 * Port del patron zero-dependency del desktop
 * (src/renderer/services/i18n.js) con tres adaptaciones:
 *
 *   1. Persistencia async via @capacitor/preferences ('eclesia.locale'),
 *      hidratada en useBootstrap ANTES de que `ready` flippee (el splash
 *      "Cargando..." ya gatea el primer paint → cero flash de idioma
 *      equivocado). Espejo sincrono en window.localStorage para que la
 *      web/PWA hidrate al instante en el siguiente arranque.
 *   2. El hook useT() (en hooks/useT.js) usa useSyncExternalStore —
 *      consistente con useTransport.js — con el string del locale como
 *      snapshot: cada componente suscrito se re-renderiza al setLocale
 *      sin remount ni reload.
 *   3. Interpolacion {var} que reemplaza TODAS las ocurrencias del
 *      placeholder (el String.replace del desktop solo toca la primera).
 *
 * Reglas de contenido:
 *   - DICT.es es el canon, byte-identico a los strings que la UI tenia
 *     hardcodeados (INCLUIDOS los deliberadamente sin tilde: 'Mas',
 *     'Anuncio rapido', 'Sin conexion con el PC'...) → cero regresion
 *     visual al hacer el switch a t().
 *   - Fallback chain: DICT[locale][key] ?? DICT.es[key] ?? key. Nunca
 *     lanza; una key inexistente se renderiza tal cual (greppeable).
 *   - Plurales por par de keys ('x.count' / 'x.countPlural'), el caller
 *     elige por n === 1. Sin motor de plural-rules — simplicidad
 *     deliberada, igual que el desktop.
 *
 * Limites documentados (NO son bugs de T13):
 *   - Los textos de BibleQuickChips ('Juan 3:16', ...) y los ejemplos de
 *     referencias en hints/errores se quedan en espanol literal en los 3
 *     idiomas: son QUERIES que resuelve el indice RVR1960 en espanol del
 *     server ('John 3:16' devolveria cero resultados).
 *   - Los errores originados en el server/desktop (bodies HTTP, nombres
 *     de dispositivos, PairingError.message para logs) siguen en ES —
 *     tarea separada del lado desktop. La UI los sombrea con lookups
 *     traducidos (_humanError → errors.pair.*).
 *
 * Deteccion: SOLO dentro de initLocale() (llamado por useBootstrap),
 * NUNCA en import-time. jsdom reporta navigator.language='en-US'; como
 * el default del modulo es 'es' y la deteccion no corre sola, los tests
 * existentes con asserts en espanol siguen verdes sin tocar.
 */
import { loadLocale, saveLocale } from './localeStorage.js'

const MIRROR_KEY = 'eclesia.locale'

export const DICT = {
  // ========== ESPAÑOL (canon — byte-identico a la UI previa) ==========
  es: {
    // ----- App shell -----
    'app.loading': 'Cargando...',

    // ----- Common -----
    'common.cancel':      'Cancelar',
    'common.close':       'Cerrar',
    'common.retry':       'Reintentar',
    'common.clearSearch': 'Limpiar búsqueda',

    // ----- BottomNav -----
    'nav.service': 'Servicio',
    'nav.bible':   'Biblia',
    'nav.songs':   'Canciones',
    'nav.more':    'Más',

    // ----- PairScreen -----
    'pair.title':              'Emparejar',
    'pair.subtitle':           'Conecta con el PC donde corre EclesiaPresenter',
    'pair.web.aria':           'Aviso de versión web',
    'pair.web.title':          'Estás en la versión web',
    'pair.web.body':           'Para conectar con el PC de tu red local, abre el mando desde el QR del panel Transmisión del PC (http). Desde https el navegador bloquea conexiones a la red local.',
    'pair.web.soon':           'Conexión cloud próximamente (T15).',
    'pair.banner.aria':        'Instrucciones de emparejamiento',
    'pair.banner.title':       'Cómo emparejar',
    'pair.banner.dismiss':     'Entendido ✕',
    'pair.banner.dismissAria': 'Cerrar instrucciones',
    'pair.banner.step1':       'Abre EclesiaPresenter en el PC',
    'pair.banner.step2':       'Ve a Ajustes → Transmisión',
    'pair.banner.step3':       'Copia la dirección y el PIN',
    'pair.mode.qr':            'Escanear QR',
    'pair.mode.manual':        'Manual',
    'pair.qrHint':             'En el PC: Ajustes → Transmisión → escanea el QR',
    'pair.pairing':            'Emparejando…',
    'pair.sameOrigin.label':   'Conectado a este PC: ',
    'pair.sameOrigin.note':    'Solo necesitas el PIN del panel Transmisión.',
    'pair.detected':           'Detectado: ',
    'pair.use':                'Usar →',
    'pair.urlLabel':           'Dirección del PC',
    'pair.urlPlaceholder':     'http://<IP>:3434',
    'pair.urlHint':            'Aparece en el panel Transmisión del PC',
    'pair.urlHintDevServer':   'Ese puerto es del mando (navegador). El PC normalmente está en :3434.',
    'pair.probing':            'Comprobando…',
    'pair.probeLegacy':        '✓ Servidor encontrado (versión antigua)',
    'pair.probeFound':         '✓ EclesiaPresenter v{version} encontrado',
    'pair.versionUnknown':     'desconocida',
    'pair.pinLabel':           'PIN de 6 dígitos',
    'pair.pinPlaceholder':     '123456',
    'pair.pinHint':            'Cambia cada vez que reinicias el PC',
    'pair.submit':             'Emparejar',
    'pair.qrInvalid':          'QR no válido. Usa el modo manual o vuelve a intentar.',
    'pair.cameraError':        'No se pudo abrir la cámara: {msg}',
    'pair.unexpected':         'Error inesperado. Intenta de nuevo.',
    'pair.netError':           'Error de red',

    // ----- QrScanner -----
    'qr.requesting': 'Pidiendo permiso de cámara...',
    'qr.error':      'No se pudo acceder a la cámara. Usa el modo manual.',

    // ----- PairingError → mensaje humano (los 12 codigos de T3.5) -----
    'errors.pair.pin_incorrecto':          'PIN incorrecto. Revisa que coincida con el PC.',
    'errors.pair.demasiados_intentos':     'Demasiados intentos fallidos. Vuelve a intentar en {sec}s.',
    'errors.pair.puerto_incorrecto':       'Esa dirección responde pero no es EclesiaPresenter. Comprueba el puerto (normalmente :3434).',
    'errors.pair.puerto_dev_server':       'Esa es la URL del navegador (el mando), no la del PC.',
    'errors.pair.no_es_eclesia':           'Esa dirección responde, pero no es EclesiaPresenter. ¿Has puesto el puerto correcto?',
    'errors.pair.firewall_o_red':          'El PC no responde a tiempo. Verifica que el firewall permita EclesiaPresenter y que estáis en la misma WiFi.',
    'errors.pair.servidor_caido':          'Nada responde en esa dirección. Asegúrate de que EclesiaPresenter está abierto en el PC.',
    'errors.pair.mixed_content_o_shields': 'El navegador está bloqueando la conexión (Brave Shields o contenido mixto). Baja el escudo o abre la app desde http://.',
    'errors.pair.no_alcanzable':           'El servidor dejó de responder durante el emparejamiento. Inténtalo de nuevo.',
    'errors.pair.respuesta_invalida':      'El servidor respondió con un formato inesperado. ¿Versión incompatible?',
    'errors.pair.servidor_legacy':         'Versión antigua del servidor detectada.',
    'errors.pair.unknown':                 'Error desconocido',

    // ----- ServiceScreen -----
    'service.title':            'Servicio',
    'service.connected':        'Mando conectado',
    'service.connectedVersion': 'Mando conectado · EclesiaPresenter v{version}',
    'service.reconnecting':     'Reconectando con el PC...',
    'service.offline':          'Sin conexión con el PC',
    'service.offlineWifi':      'Sin conexión con el PC. Comprueba la WiFi.',
    'service.prev':             '◀ Prev',
    'service.next':             'Next ▶',
    'service.prevAria':         'Slide anterior',
    'service.nextAria':         'Slide siguiente',
    'service.blank':            'Blank',
    'service.blankHint':        'Slide en blanco',
    'service.blankAria':        'Proyectar slide en blanco',
    'service.black':            'Black',
    'service.blackHint':        'Pantalla negra',
    'service.blackAria':        'Proyectar pantalla negra',
    'service.clear':            'Clear',
    'service.clearHint':        'Quitar live',
    'service.clearAria':        'Quitar proyección en vivo',

    // ----- BibleScreen -----
    'bible.title':              'Biblia',
    'bible.subtitleIdle':       'Buscar y proyectar versículos',
    'bible.searching':          'Buscando…',
    'bible.noResults':          'Sin resultados',
    'bible.resultsCount':       '{n} resultado',
    'bible.resultsCountPlural': '{n} resultados',
    'bible.reconnecting':       'Reconectando con el PC…',
    'bible.offline':            'Sin conexión con el PC',
    'bible.offlineWifi':        'Sin conexión con el PC. Comprueba la WiFi.',
    'bible.idleMessage':        'Escribe una referencia o palabras clave',
    'bible.idleHint':           'Ej: Juan 3:16, salmos 23, amor de Dios',
    'bible.emptyMessage':       'No encontramos versículos para tu búsqueda',
    'bible.emptyHint':          'Prueba con otra referencia o palabra clave',
    'bible.toastProjected':     'Proyectado: {ref}',
    'bible.searchPlaceholder':  'Buscar versículo o texto…',
    'bible.searchAria':         'Buscar versículo',
    'bible.chipsAria':          'Versículos frecuentes',
    'bible.verseAria':          'Versículo {ref}: {preview}',
    'bible.resultsAria':        '{n} resultados',
    'bible.project':            'Proyectar',
    'bible.sheetOffline':       'Sin conexión con el PC',
    'bible.err.auth_error':          'Sesión expirada',
    'bible.err.rate_limited':        'Demasiadas búsquedas',
    'bible.err.offline':             'Sin respuesta del PC',
    'bible.err.q_too_short':         'Escribe al menos 3 letras',
    'bible.err.book_not_found':      'Libro no reconocido',
    'bible.err.reference_not_found': 'Referencia fuera de rango',
    'bible.err.unknown':             'Error en la búsqueda',
    'bible.errMsg.auth_error':          'Sesión expirada. Vuelve a parear este mando.',
    'bible.errMsg.rate_limited':        'Demasiadas búsquedas. Espera {sec}s e inténtalo de nuevo.',
    'bible.errMsg.offline':             'Sin respuesta del PC. Comprueba la WiFi.',
    'bible.errMsg.q_too_short':         'Escribe al menos 3 letras o una referencia (Juan 3:16).',
    'bible.errMsg.book_not_found':      'No reconocemos ese libro. Prueba con el nombre completo.',
    'bible.errMsg.reference_not_found': 'Esa referencia no existe en esta versión.',
    'bible.errMsg.no_credentials':      'No hay credenciales guardadas. Vuelve a parear.',
    'bible.errMsg.unknown':             'No pudimos completar la búsqueda.',

    // ----- SongsScreen -----
    'songs.title':               'Canciones',
    'songs.subtitleIdle':        'Repertorio · Buscar y proyectar',
    'songs.searching':           'Buscando…',
    'songs.noResults':           'Sin resultados',
    'songs.emptyCatalog':        'Repertorio vacío',
    'songs.totalCount':          '{n} canción',
    'songs.totalCountPlural':    '{n} canciones',
    'songs.reconnecting':        'Reconectando con el PC…',
    'songs.offline':             'Sin conexión con el PC',
    'songs.offlineCache':        'Sin conexión con el PC. Mostrando caché si la hay.',
    'songs.emptyMessage':        'No encontramos coincidencias',
    'songs.emptyHint':           'Prueba con otro título, autor o palabra de la letra',
    'songs.emptyCatalogMessage': 'No hay canciones en el repertorio',
    'songs.emptyCatalogHint':    'Añade canciones desde el PC para verlas aquí',
    'songs.toastProjected':      'Proyectado: {title} · {section}',
    'songs.toastCleared':        'Live limpiado',
    'songs.searchPlaceholder':   'Buscar canción, autor o letra…',
    'songs.searchAria':          'Buscar canción',
    'songs.rowAria':             'Canción {title}',
    'songs.favorite':            'Favorita',
    'songs.lyricBadge':          'Letra',
    'songs.listAria':            '{n} canciones',
    'songs.sheetLoading':        'Cargando…',
    'songs.sheetFallbackTitle':  'Canción',
    'songs.noSections':          'Esta canción no tiene secciones.',
    'songs.sheetOffline':        'Sin conexión con el PC',
    'songs.sectionAria':         'Proyectar sección {label}',
    'songs.liveBadge':           'EN VIVO',
    'songs.noText':              '(sin texto)',
    'songs.clearLive':           'Quitar live',
    'songs.err.auth_error':   'Sesión expirada',
    'songs.err.rate_limited': 'Demasiadas búsquedas',
    'songs.err.offline':      'Sin respuesta del PC',
    'songs.err.not_found':    'No encontrada',
    'songs.err.unknown':      'Error al buscar',
    'songs.errMsg.auth_error':     'Sesión expirada. Vuelve a parear este mando.',
    'songs.errMsg.rate_limited':   'Demasiadas búsquedas. Espera {sec}s e inténtalo de nuevo.',
    'songs.errMsg.offline':        'Sin respuesta del PC. Comprueba la WiFi.',
    'songs.errMsg.no_credentials': 'No hay credenciales guardadas. Vuelve a parear.',
    'songs.errMsg.unknown':        'No pudimos cargar el repertorio.',

    // ----- MoreScreen (titulos sin tilde deliberados — T11) -----
    'more.title':             'Mas',
    'more.subtitle':          'Anuncios, ajustes y cuenta',
    'more.sectionAnnounce':   'Anuncio rapido',
    'more.sectionDanger':     'Zona peligrosa',
    'more.sectionConnection': 'Conexion',
    'more.sectionSettings':   'Ajustes',
    'more.sectionAccount':    'Cuenta',
    'more.connectionState':   'Estado de la conexion',
    'more.pcLabel':           'PC',
    'more.remoteLabel':       'Mando',
    'more.versionUnknown':    'desconocido',
    'more.versionHint':       'La version del PC aparecera al reconectar.',
    'more.language':          'Idioma',
    'more.languageAria':      'Seleccionar idioma',
    'more.unpair':            'Desemparejar este mando',
    'more.unpairAria':        'Desemparejar este mando del PC',
    'more.unpairCaption':     'Borrara el token y volveras al QR de emparejamiento.',
    'more.unpairConfirmTitle': '¿Desemparejar este mando?',
    'more.unpairConfirm':     'Borrara el token y volveras al QR de emparejamiento. Tendras que volver a escanear el PIN del PC.',
    'more.unpairConfirmCta':  'Desemparejar',

    // ----- AnnouncementForm -----
    'announce.titleLabel':       'Titulo',
    'announce.titleAria':        'Titulo del anuncio',
    'announce.titlePlaceholder': 'AVISO',
    'announce.bodyLabel':        'Cuerpo',
    'announce.bodyAria':         'Cuerpo del anuncio',
    'announce.bodyPlaceholder':  'Escribe el mensaje que aparecera en pantalla',
    'announce.offline':          'Sin conexion con el PC',
    'announce.submit':           'Proyectar anuncio',
    'announce.submitAria':       'Proyectar anuncio en el PC',
    'announce.sent':             'Anuncio enviado',

    // ----- PanicButton / PanicModal -----
    'panic.trigger':      '⛔ Cerrar proyección (emergencia)',
    'panic.closed':       'Cerrado',
    'panic.triggerAria':  'Cerrar de emergencia todas las ventanas de proyección del PC. Requiere confirmación.',
    'panic.offline':      'Sin conexion con el PC',
    'panic.confirmTitle': '¿Cerrar todas las ventanas de proyección?',
    'panic.confirmBody':  'El operador del PC tendrá que reabrirlas manualmente desde Ajustes > Proyección.',
    'panic.confirmScope': 'Esto NO cierra la app del PC.',
    'panic.confirmCta':   'Cerrar proyección',

    // ----- ScheduleList / ScheduleItemRow -----
    'schedule.listAria':           'Lista del día',
    'schedule.loading':            'Cargando lista del día...',
    'schedule.emptyLine1':         'Sin items en la lista del día.',
    'schedule.emptyLine2':         'Añade canciones desde el PC.',
    'schedule.headerCount':        'Lista del día ({n})',
    'schedule.reorderAria':        'Reordenar',
    'schedule.projectAria':        'Proyectar {type}: {title}',
    'schedule.type.song':          'Canción',
    'schedule.type.bible':         'Biblia',
    'schedule.type.image':         'Imagen',
    'schedule.type.video':         'Video',
    'schedule.type.announcement':  'Anuncio',
    'schedule.type.item':          'Item',

    // ----- StatusPill -----
    'status.reconnecting':        'Reconectando',
    'status.offline':             'Sin conexión',
    'status.ariaConnected':       'Conexión {signal}',
    'status.ariaConnectedLatency': 'Conexión {signal}, {ms} ms',
    'status.ariaReconnecting':    'Reconectando con el PC',
    'status.ariaOffline':         'Sin conexión con el PC',
    'status.signal.excellent':    'excelente',
    'status.signal.good':         'buena',
    'status.signal.poor':         'débil',
    'status.queued':              '{n} en cola',
    'status.queuedPlural':        '{n} en cola',
    'status.queuedAria':          '{n} comando en cola',
    'status.queuedAriaPlural':    '{n} comandos en cola',

    // ----- PgmPreview -----
    'pgm.noContent':         'Sin contenido proyectado',
    'pgm.blackout':          'Blackout',
    'pgm.blackoutAria':      'Proyección en blackout',
    'pgm.blank':             'Slide en blanco',
    'pgm.blankAria':         'Slide en blanco proyectado',
    'pgm.projectingAria':    'Proyectando: {text}',
    'pgm.projectingAriaRef': 'Proyectando: {text} ({ref})',
    'pgm.liveRegion':        'Diapositiva nueva en proyección · {n}',
  },

  // ========== ENGLISH ==========
  en: {
    'app.loading': 'Loading...',

    'common.cancel':      'Cancel',
    'common.close':       'Close',
    'common.retry':       'Retry',
    'common.clearSearch': 'Clear search',

    'nav.service': 'Service',
    'nav.bible':   'Bible',
    'nav.songs':   'Songs',
    'nav.more':    'More',

    'pair.title':              'Pair',
    'pair.subtitle':           'Connect to the PC running EclesiaPresenter',
    'pair.web.aria':           'Web version notice',
    'pair.web.title':          'You are on the web version',
    'pair.web.body':           'To connect to a PC on your local network, open the remote from the QR code in the Broadcast panel on the PC (http). On https the browser blocks connections to the local network.',
    'pair.web.soon':           'Cloud connection coming soon (T15).',
    'pair.banner.aria':        'Pairing instructions',
    'pair.banner.title':       'How to pair',
    'pair.banner.dismiss':     'Got it ✕',
    'pair.banner.dismissAria': 'Dismiss instructions',
    'pair.banner.step1':       'Open EclesiaPresenter on the PC',
    'pair.banner.step2':       'Go to Settings → Broadcast',
    'pair.banner.step3':       'Copy the address and the PIN',
    'pair.mode.qr':            'Scan QR',
    'pair.mode.manual':        'Manual',
    'pair.qrHint':             'On the PC: Settings → Broadcast → scan the QR code',
    'pair.pairing':            'Pairing…',
    'pair.sameOrigin.label':   'Connected to this PC: ',
    'pair.sameOrigin.note':    'You only need the PIN from the Broadcast panel.',
    'pair.detected':           'Detected: ',
    'pair.use':                'Use →',
    'pair.urlLabel':           'PC address',
    'pair.urlPlaceholder':     'http://<IP>:3434',
    'pair.urlHint':            'Shown in the Broadcast panel on the PC',
    'pair.urlHintDevServer':   'That port belongs to the remote (browser). The PC is usually on :3434.',
    'pair.probing':            'Checking…',
    'pair.probeLegacy':        '✓ Server found (old version)',
    'pair.probeFound':         '✓ EclesiaPresenter v{version} found',
    'pair.versionUnknown':     'unknown',
    'pair.pinLabel':           '6-digit PIN',
    'pair.pinPlaceholder':     '123456',
    'pair.pinHint':            'Changes every time the PC restarts',
    'pair.submit':             'Pair',
    'pair.qrInvalid':          'Invalid QR code. Use manual mode or try again.',
    'pair.cameraError':        'Could not open the camera: {msg}',
    'pair.unexpected':         'Unexpected error. Try again.',
    'pair.netError':           'Network error',

    'qr.requesting': 'Requesting camera permission...',
    'qr.error':      'Could not access the camera. Use manual mode.',

    'errors.pair.pin_incorrecto':          'Incorrect PIN. Check that it matches the PC.',
    'errors.pair.demasiados_intentos':     'Too many failed attempts. Try again in {sec}s.',
    'errors.pair.puerto_incorrecto':       'That address responds but it is not EclesiaPresenter. Check the port (usually :3434).',
    'errors.pair.puerto_dev_server':       'That is the browser URL (the remote), not the PC address.',
    'errors.pair.no_es_eclesia':           'That address responds, but it is not EclesiaPresenter. Did you enter the right port?',
    'errors.pair.firewall_o_red':          'The PC is not responding in time. Check that the firewall allows EclesiaPresenter and that you are on the same WiFi.',
    'errors.pair.servidor_caido':          'Nothing responds at that address. Make sure EclesiaPresenter is open on the PC.',
    'errors.pair.mixed_content_o_shields': 'The browser is blocking the connection (Brave Shields or mixed content). Lower the shield or open the app from http://.',
    'errors.pair.no_alcanzable':           'The server stopped responding during pairing. Try again.',
    'errors.pair.respuesta_invalida':      'The server responded with an unexpected format. Incompatible version?',
    'errors.pair.servidor_legacy':         'Old server version detected.',
    'errors.pair.unknown':                 'Unknown error',

    'service.title':            'Service',
    'service.connected':        'Remote connected',
    'service.connectedVersion': 'Remote connected · EclesiaPresenter v{version}',
    'service.reconnecting':     'Reconnecting to the PC...',
    'service.offline':          'No connection to the PC',
    'service.offlineWifi':      'No connection to the PC. Check the WiFi.',
    'service.prev':             '◀ Prev',
    'service.next':             'Next ▶',
    'service.prevAria':         'Previous slide',
    'service.nextAria':         'Next slide',
    'service.blank':            'Blank',
    'service.blankHint':        'Blank slide',
    'service.blankAria':        'Project blank slide',
    'service.black':            'Black',
    'service.blackHint':        'Black screen',
    'service.blackAria':        'Project black screen',
    'service.clear':            'Clear',
    'service.clearHint':        'Clear live',
    'service.clearAria':        'Clear live projection',

    'bible.title':              'Bible',
    'bible.subtitleIdle':       'Search and project verses',
    'bible.searching':          'Searching…',
    'bible.noResults':          'No results',
    'bible.resultsCount':       '{n} result',
    'bible.resultsCountPlural': '{n} results',
    'bible.reconnecting':       'Reconnecting to the PC…',
    'bible.offline':            'No connection to the PC',
    'bible.offlineWifi':        'No connection to the PC. Check the WiFi.',
    'bible.idleMessage':        'Type a reference or keywords',
    'bible.idleHint':           'E.g. Juan 3:16, salmos 23, amor de Dios',
    'bible.emptyMessage':       'We found no verses for your search',
    'bible.emptyHint':          'Try another reference or keyword',
    'bible.toastProjected':     'Projected: {ref}',
    'bible.searchPlaceholder':  'Search verse or text…',
    'bible.searchAria':         'Search verse',
    'bible.chipsAria':          'Frequent verses',
    'bible.verseAria':          'Verse {ref}: {preview}',
    'bible.resultsAria':        '{n} results',
    'bible.project':            'Project',
    'bible.sheetOffline':       'No connection to the PC',
    'bible.err.auth_error':          'Session expired',
    'bible.err.rate_limited':        'Too many searches',
    'bible.err.offline':             'No response from the PC',
    'bible.err.q_too_short':         'Type at least 3 letters',
    'bible.err.book_not_found':      'Book not recognized',
    'bible.err.reference_not_found': 'Reference out of range',
    'bible.err.unknown':             'Search error',
    'bible.errMsg.auth_error':          'Session expired. Pair this remote again.',
    'bible.errMsg.rate_limited':        'Too many searches. Wait {sec}s and try again.',
    'bible.errMsg.offline':             'No response from the PC. Check the WiFi.',
    'bible.errMsg.q_too_short':         'Type at least 3 letters or a reference (Juan 3:16).',
    'bible.errMsg.book_not_found':      'We do not recognize that book. Try the full name.',
    'bible.errMsg.reference_not_found': 'That reference does not exist in this version.',
    'bible.errMsg.no_credentials':      'No saved credentials. Pair again.',
    'bible.errMsg.unknown':             'We could not complete the search.',

    'songs.title':               'Songs',
    'songs.subtitleIdle':        'Songbook · Search and project',
    'songs.searching':           'Searching…',
    'songs.noResults':           'No results',
    'songs.emptyCatalog':        'Empty songbook',
    'songs.totalCount':          '{n} song',
    'songs.totalCountPlural':    '{n} songs',
    'songs.reconnecting':        'Reconnecting to the PC…',
    'songs.offline':             'No connection to the PC',
    'songs.offlineCache':        'No connection to the PC. Showing cache if available.',
    'songs.emptyMessage':        'No matches found',
    'songs.emptyHint':           'Try another title, author or lyric word',
    'songs.emptyCatalogMessage': 'There are no songs in the songbook',
    'songs.emptyCatalogHint':    'Add songs from the PC to see them here',
    'songs.toastProjected':      'Projected: {title} · {section}',
    'songs.toastCleared':        'Live cleared',
    'songs.searchPlaceholder':   'Search song, author or lyrics…',
    'songs.searchAria':          'Search song',
    'songs.rowAria':             'Song {title}',
    'songs.favorite':            'Favorite',
    'songs.lyricBadge':          'Lyrics',
    'songs.listAria':            '{n} songs',
    'songs.sheetLoading':        'Loading…',
    'songs.sheetFallbackTitle':  'Song',
    'songs.noSections':          'This song has no sections.',
    'songs.sheetOffline':        'No connection to the PC',
    'songs.sectionAria':         'Project section {label}',
    'songs.liveBadge':           'LIVE',
    'songs.noText':              '(no text)',
    'songs.clearLive':           'Clear live',
    'songs.err.auth_error':   'Session expired',
    'songs.err.rate_limited': 'Too many searches',
    'songs.err.offline':      'No response from the PC',
    'songs.err.not_found':    'Not found',
    'songs.err.unknown':      'Search error',
    'songs.errMsg.auth_error':     'Session expired. Pair this remote again.',
    'songs.errMsg.rate_limited':   'Too many searches. Wait {sec}s and try again.',
    'songs.errMsg.offline':        'No response from the PC. Check the WiFi.',
    'songs.errMsg.no_credentials': 'No saved credentials. Pair again.',
    'songs.errMsg.unknown':        'We could not load the songbook.',

    'more.title':             'More',
    'more.subtitle':          'Announcements, settings and account',
    'more.sectionAnnounce':   'Quick announcement',
    'more.sectionDanger':     'Danger zone',
    'more.sectionConnection': 'Connection',
    'more.sectionSettings':   'Settings',
    'more.sectionAccount':    'Account',
    'more.connectionState':   'Connection status',
    'more.pcLabel':           'PC',
    'more.remoteLabel':       'Remote',
    'more.versionUnknown':    'unknown',
    'more.versionHint':       'The PC version will appear after reconnecting.',
    'more.language':          'Idioma',
    'more.languageAria':      'Select language',
    'more.unpair':            'Unpair this remote',
    'more.unpairAria':        'Unpair this remote from the PC',
    'more.unpairCaption':     'This will delete the token and take you back to the pairing QR.',
    'more.unpairConfirmTitle': 'Unpair this remote?',
    'more.unpairConfirm':     'This will delete the token and take you back to the pairing QR. You will need to scan the PC PIN again.',
    'more.unpairConfirmCta':  'Unpair',

    'announce.titleLabel':       'Title',
    'announce.titleAria':        'Announcement title',
    'announce.titlePlaceholder': 'NOTICE',
    'announce.bodyLabel':        'Body',
    'announce.bodyAria':         'Announcement body',
    'announce.bodyPlaceholder':  'Type the message that will appear on screen',
    'announce.offline':          'No connection to the PC',
    'announce.submit':           'Project announcement',
    'announce.submitAria':       'Project announcement on the PC',
    'announce.sent':             'Announcement sent',

    'panic.trigger':      '⛔ Close projection (emergency)',
    'panic.closed':       'Closed',
    'panic.triggerAria':  'Emergency-close all projection windows on the PC. Requires confirmation.',
    'panic.offline':      'No connection to the PC',
    'panic.confirmTitle': 'Close all projection windows?',
    'panic.confirmBody':  'The PC operator will have to reopen them manually from Settings > Projection.',
    'panic.confirmScope': 'This does NOT close the PC app.',
    'panic.confirmCta':   'Close projection',

    'schedule.listAria':          'Service list',
    'schedule.loading':           'Loading service list...',
    'schedule.emptyLine1':        'No items in the service list.',
    'schedule.emptyLine2':        'Add songs from the PC.',
    'schedule.headerCount':       'Service list ({n})',
    'schedule.reorderAria':       'Reorder',
    'schedule.projectAria':       'Project {type}: {title}',
    'schedule.type.song':         'Song',
    'schedule.type.bible':        'Bible',
    'schedule.type.image':        'Image',
    'schedule.type.video':        'Video',
    'schedule.type.announcement': 'Announcement',
    'schedule.type.item':         'Item',

    'status.reconnecting':         'Reconnecting',
    'status.offline':              'Offline',
    'status.ariaConnected':        'Connection {signal}',
    'status.ariaConnectedLatency': 'Connection {signal}, {ms} ms',
    'status.ariaReconnecting':     'Reconnecting to the PC',
    'status.ariaOffline':          'No connection to the PC',
    'status.signal.excellent':     'excellent',
    'status.signal.good':          'good',
    'status.signal.poor':          'poor',
    'status.queued':               '{n} queued',
    'status.queuedPlural':         '{n} queued',
    'status.queuedAria':           '{n} command queued',
    'status.queuedAriaPlural':     '{n} commands queued',

    'pgm.noContent':         'No content projected',
    'pgm.blackout':          'Blackout',
    'pgm.blackoutAria':      'Projection in blackout',
    'pgm.blank':             'Blank slide',
    'pgm.blankAria':         'Blank slide projected',
    'pgm.projectingAria':    'Projecting: {text}',
    'pgm.projectingAriaRef': 'Projecting: {text} ({ref})',
    'pgm.liveRegion':        'New slide in projection · {n}',
  },

  // ========== PORTUGUÊS ==========
  pt: {
    'app.loading': 'Carregando...',

    'common.cancel':      'Cancelar',
    'common.close':       'Fechar',
    'common.retry':       'Tentar de novo',
    'common.clearSearch': 'Limpar busca',

    'nav.service': 'Culto',
    'nav.bible':   'Bíblia',
    'nav.songs':   'Cânticos',
    'nav.more':    'Mais',

    'pair.title':              'Parear',
    'pair.subtitle':           'Conecte com o PC onde roda o EclesiaPresenter',
    'pair.web.aria':           'Aviso da versão web',
    'pair.web.title':          'Você está na versão web',
    'pair.web.body':           'Para conectar com o PC da sua rede local, abra o controle pelo QR do painel Transmissão do PC (http). Em https o navegador bloqueia conexões à rede local.',
    'pair.web.soon':           'Conexão na nuvem em breve (T15).',
    'pair.banner.aria':        'Instruções de pareamento',
    'pair.banner.title':       'Como parear',
    'pair.banner.dismiss':     'Entendi ✕',
    'pair.banner.dismissAria': 'Fechar instruções',
    'pair.banner.step1':       'Abra o EclesiaPresenter no PC',
    'pair.banner.step2':       'Vá em Configurações → Transmissão',
    'pair.banner.step3':       'Copie o endereço e o PIN',
    'pair.mode.qr':            'Escanear QR',
    'pair.mode.manual':        'Manual',
    'pair.qrHint':             'No PC: Configurações → Transmissão → escaneie o QR',
    'pair.pairing':            'Pareando…',
    'pair.sameOrigin.label':   'Conectado a este PC: ',
    'pair.sameOrigin.note':    'Você só precisa do PIN do painel Transmissão.',
    'pair.detected':           'Detectado: ',
    'pair.use':                'Usar →',
    'pair.urlLabel':           'Endereço do PC',
    'pair.urlPlaceholder':     'http://<IP>:3434',
    'pair.urlHint':            'Aparece no painel Transmissão do PC',
    'pair.urlHintDevServer':   'Essa porta é do controle (navegador). O PC normalmente está na :3434.',
    'pair.probing':            'Verificando…',
    'pair.probeLegacy':        '✓ Servidor encontrado (versão antiga)',
    'pair.probeFound':         '✓ EclesiaPresenter v{version} encontrado',
    'pair.versionUnknown':     'desconhecida',
    'pair.pinLabel':           'PIN de 6 dígitos',
    'pair.pinPlaceholder':     '123456',
    'pair.pinHint':            'Muda toda vez que o PC reinicia',
    'pair.submit':             'Parear',
    'pair.qrInvalid':          'QR inválido. Use o modo manual ou tente de novo.',
    'pair.cameraError':        'Não foi possível abrir a câmera: {msg}',
    'pair.unexpected':         'Erro inesperado. Tente de novo.',
    'pair.netError':           'Erro de rede',

    'qr.requesting': 'Pedindo permissão da câmera...',
    'qr.error':      'Não foi possível acessar a câmera. Use o modo manual.',

    'errors.pair.pin_incorrecto':          'PIN incorreto. Verifique se confere com o PC.',
    'errors.pair.demasiados_intentos':     'Muitas tentativas falhas. Tente de novo em {sec}s.',
    'errors.pair.puerto_incorrecto':       'Esse endereço responde mas não é o EclesiaPresenter. Verifique a porta (normalmente :3434).',
    'errors.pair.puerto_dev_server':       'Essa é a URL do navegador (o controle), não a do PC.',
    'errors.pair.no_es_eclesia':           'Esse endereço responde, mas não é o EclesiaPresenter. A porta está correta?',
    'errors.pair.firewall_o_red':          'O PC não responde a tempo. Verifique se o firewall permite o EclesiaPresenter e se vocês estão no mesmo WiFi.',
    'errors.pair.servidor_caido':          'Nada responde nesse endereço. Verifique se o EclesiaPresenter está aberto no PC.',
    'errors.pair.mixed_content_o_shields': 'O navegador está bloqueando a conexão (Brave Shields ou conteúdo misto). Desative o escudo ou abra o app por http://.',
    'errors.pair.no_alcanzable':           'O servidor parou de responder durante o pareamento. Tente de novo.',
    'errors.pair.respuesta_invalida':      'O servidor respondeu em um formato inesperado. Versão incompatível?',
    'errors.pair.servidor_legacy':         'Versão antiga do servidor detectada.',
    'errors.pair.unknown':                 'Erro desconhecido',

    'service.title':            'Culto',
    'service.connected':        'Controle conectado',
    'service.connectedVersion': 'Controle conectado · EclesiaPresenter v{version}',
    'service.reconnecting':     'Reconectando com o PC...',
    'service.offline':          'Sem conexão com o PC',
    'service.offlineWifi':      'Sem conexão com o PC. Verifique o WiFi.',
    'service.prev':             '◀ Ant',
    'service.next':             'Próx ▶',
    'service.prevAria':         'Slide anterior',
    'service.nextAria':         'Próximo slide',
    'service.blank':            'Blank',
    'service.blankHint':        'Slide em branco',
    'service.blankAria':        'Projetar slide em branco',
    'service.black':            'Black',
    'service.blackHint':        'Tela preta',
    'service.blackAria':        'Projetar tela preta',
    'service.clear':            'Clear',
    'service.clearHint':        'Tirar do ar',
    'service.clearAria':        'Tirar projeção ao vivo',

    'bible.title':              'Bíblia',
    'bible.subtitleIdle':       'Buscar e projetar versículos',
    'bible.searching':          'Buscando…',
    'bible.noResults':          'Sem resultados',
    'bible.resultsCount':       '{n} resultado',
    'bible.resultsCountPlural': '{n} resultados',
    'bible.reconnecting':       'Reconectando com o PC…',
    'bible.offline':            'Sem conexão com o PC',
    'bible.offlineWifi':        'Sem conexão com o PC. Verifique o WiFi.',
    'bible.idleMessage':        'Digite uma referência ou palavras-chave',
    'bible.idleHint':           'Ex: Juan 3:16, salmos 23, amor de Dios',
    'bible.emptyMessage':       'Não encontramos versículos para a sua busca',
    'bible.emptyHint':          'Tente outra referência ou palavra-chave',
    'bible.toastProjected':     'Projetado: {ref}',
    'bible.searchPlaceholder':  'Buscar versículo ou texto…',
    'bible.searchAria':         'Buscar versículo',
    'bible.chipsAria':          'Versículos frequentes',
    'bible.verseAria':          'Versículo {ref}: {preview}',
    'bible.resultsAria':        '{n} resultados',
    'bible.project':            'Projetar',
    'bible.sheetOffline':       'Sem conexão com o PC',
    'bible.err.auth_error':          'Sessão expirada',
    'bible.err.rate_limited':        'Muitas buscas',
    'bible.err.offline':             'Sem resposta do PC',
    'bible.err.q_too_short':         'Digite pelo menos 3 letras',
    'bible.err.book_not_found':      'Livro não reconhecido',
    'bible.err.reference_not_found': 'Referência fora do intervalo',
    'bible.err.unknown':             'Erro na busca',
    'bible.errMsg.auth_error':          'Sessão expirada. Pareie este controle de novo.',
    'bible.errMsg.rate_limited':        'Muitas buscas. Aguarde {sec}s e tente de novo.',
    'bible.errMsg.offline':             'Sem resposta do PC. Verifique o WiFi.',
    'bible.errMsg.q_too_short':         'Digite pelo menos 3 letras ou uma referência (Juan 3:16).',
    'bible.errMsg.book_not_found':      'Não reconhecemos esse livro. Tente o nome completo.',
    'bible.errMsg.reference_not_found': 'Essa referência não existe nesta versão.',
    'bible.errMsg.no_credentials':      'Não há credenciais salvas. Pareie de novo.',
    'bible.errMsg.unknown':             'Não foi possível completar a busca.',

    'songs.title':               'Cânticos',
    'songs.subtitleIdle':        'Repertório · Buscar e projetar',
    'songs.searching':           'Buscando…',
    'songs.noResults':           'Sem resultados',
    'songs.emptyCatalog':        'Repertório vazio',
    'songs.totalCount':          '{n} cântico',
    'songs.totalCountPlural':    '{n} cânticos',
    'songs.reconnecting':        'Reconectando com o PC…',
    'songs.offline':             'Sem conexão com o PC',
    'songs.offlineCache':        'Sem conexão com o PC. Mostrando cache se houver.',
    'songs.emptyMessage':        'Não encontramos correspondências',
    'songs.emptyHint':           'Tente outro título, autor ou palavra da letra',
    'songs.emptyCatalogMessage': 'Não há cânticos no repertório',
    'songs.emptyCatalogHint':    'Adicione cânticos no PC para vê-los aqui',
    'songs.toastProjected':      'Projetado: {title} · {section}',
    'songs.toastCleared':        'Ao vivo limpo',
    'songs.searchPlaceholder':   'Buscar cântico, autor ou letra…',
    'songs.searchAria':          'Buscar cântico',
    'songs.rowAria':             'Cântico {title}',
    'songs.favorite':            'Favorito',
    'songs.lyricBadge':          'Letra',
    'songs.listAria':            '{n} cânticos',
    'songs.sheetLoading':        'Carregando…',
    'songs.sheetFallbackTitle':  'Cântico',
    'songs.noSections':          'Este cântico não tem seções.',
    'songs.sheetOffline':        'Sem conexão com o PC',
    'songs.sectionAria':         'Projetar seção {label}',
    'songs.liveBadge':           'AO VIVO',
    'songs.noText':              '(sem texto)',
    'songs.clearLive':           'Tirar do ar',
    'songs.err.auth_error':   'Sessão expirada',
    'songs.err.rate_limited': 'Muitas buscas',
    'songs.err.offline':      'Sem resposta do PC',
    'songs.err.not_found':    'Não encontrado',
    'songs.err.unknown':      'Erro ao buscar',
    'songs.errMsg.auth_error':     'Sessão expirada. Pareie este controle de novo.',
    'songs.errMsg.rate_limited':   'Muitas buscas. Aguarde {sec}s e tente de novo.',
    'songs.errMsg.offline':        'Sem resposta do PC. Verifique o WiFi.',
    'songs.errMsg.no_credentials': 'Não há credenciais salvas. Pareie de novo.',
    'songs.errMsg.unknown':        'Não foi possível carregar o repertório.',

    'more.title':             'Mais',
    'more.subtitle':          'Anúncios, configurações e conta',
    'more.sectionAnnounce':   'Anúncio rápido',
    'more.sectionDanger':     'Zona de perigo',
    'more.sectionConnection': 'Conexão',
    'more.sectionSettings':   'Configurações',
    'more.sectionAccount':    'Conta',
    'more.connectionState':   'Estado da conexão',
    'more.pcLabel':           'PC',
    'more.remoteLabel':       'Controle',
    'more.versionUnknown':    'desconhecida',
    'more.versionHint':       'A versão do PC aparecerá ao reconectar.',
    'more.language':          'Idioma',
    'more.languageAria':      'Selecionar idioma',
    'more.unpair':            'Desparear este controle',
    'more.unpairAria':        'Desparear este controle do PC',
    'more.unpairCaption':     'Apagará o token e você voltará ao QR de pareamento.',
    'more.unpairConfirmTitle': 'Desparear este controle?',
    'more.unpairConfirm':     'Apagará o token e você voltará ao QR de pareamento. Você terá que escanear o PIN do PC de novo.',
    'more.unpairConfirmCta':  'Desparear',

    'announce.titleLabel':       'Título',
    'announce.titleAria':        'Título do anúncio',
    'announce.titlePlaceholder': 'AVISO',
    'announce.bodyLabel':        'Corpo',
    'announce.bodyAria':         'Corpo do anúncio',
    'announce.bodyPlaceholder':  'Escreva a mensagem que aparecerá na tela',
    'announce.offline':          'Sem conexão com o PC',
    'announce.submit':           'Projetar anúncio',
    'announce.submitAria':       'Projetar anúncio no PC',
    'announce.sent':             'Anúncio enviado',

    'panic.trigger':      '⛔ Fechar projeção (emergência)',
    'panic.closed':       'Fechado',
    'panic.triggerAria':  'Fechar de emergência todas as janelas de projeção do PC. Requer confirmação.',
    'panic.offline':      'Sem conexão com o PC',
    'panic.confirmTitle': 'Fechar todas as janelas de projeção?',
    'panic.confirmBody':  'O operador do PC terá que reabri-las manualmente em Configurações > Projeção.',
    'panic.confirmScope': 'Isto NÃO fecha o app do PC.',
    'panic.confirmCta':   'Fechar projeção',

    'schedule.listAria':          'Lista do culto',
    'schedule.loading':           'Carregando lista do culto...',
    'schedule.emptyLine1':        'Sem itens na lista do culto.',
    'schedule.emptyLine2':        'Adicione cânticos no PC.',
    'schedule.headerCount':       'Lista do culto ({n})',
    'schedule.reorderAria':       'Reordenar',
    'schedule.projectAria':       'Projetar {type}: {title}',
    'schedule.type.song':         'Cântico',
    'schedule.type.bible':        'Bíblia',
    'schedule.type.image':        'Imagem',
    'schedule.type.video':        'Vídeo',
    'schedule.type.announcement': 'Anúncio',
    'schedule.type.item':         'Item',

    'status.reconnecting':         'Reconectando',
    'status.offline':              'Sem conexão',
    'status.ariaConnected':        'Conexão {signal}',
    'status.ariaConnectedLatency': 'Conexão {signal}, {ms} ms',
    'status.ariaReconnecting':     'Reconectando com o PC',
    'status.ariaOffline':          'Sem conexão com o PC',
    'status.signal.excellent':     'excelente',
    'status.signal.good':          'boa',
    'status.signal.poor':          'fraca',
    'status.queued':               '{n} na fila',
    'status.queuedPlural':         '{n} na fila',
    'status.queuedAria':           '{n} comando na fila',
    'status.queuedAriaPlural':     '{n} comandos na fila',

    'pgm.noContent':         'Sem conteúdo projetado',
    'pgm.blackout':          'Blackout',
    'pgm.blackoutAria':      'Projeção em blackout',
    'pgm.blank':             'Slide em branco',
    'pgm.blankAria':         'Slide em branco projetado',
    'pgm.projectingAria':    'Projetando: {text}',
    'pgm.projectingAriaRef': 'Projetando: {text} ({ref})',
    'pgm.liveRegion':        'Novo slide em projeção · {n}',
  },
}

export const AVAILABLE_LOCALES = [
  { id: 'es', label: 'Español' },
  { id: 'en', label: 'English' },
  { id: 'pt', label: 'Português' },
]

// ---------------------------------------------------------------------------
// Estado del modulo. Default 'es' SIEMPRE — la deteccion corre solo en
// initLocale() (bootstrap), nunca en import-time (test-safety: jsdom
// reporta navigator.language='en-US').
// ---------------------------------------------------------------------------
let currentLocale = 'es'
const listeners = new Set()

/** Locale activo ('es' | 'en' | 'pt'). Snapshot para useSyncExternalStore. */
export function getLocale() {
  return currentLocale
}

/**
 * Suscripcion al cambio de locale (para useSyncExternalStore).
 * @returns {() => void} unsubscribe
 */
export function subscribeLocale(cb) {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

function _notify() {
  for (const fn of listeners) {
    try { fn(currentLocale) } catch { /* listener roto no rompe el resto */ }
  }
}

function _setDocumentLang(locale) {
  try {
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('lang', locale)
    }
  } catch { /* ignore */ }
}

/**
 * Cambia el idioma activo. Valida contra DICT (locale invalido = no-op).
 * persist=true (eleccion explicita del usuario): escribe Preferences
 * (fire-and-forget) + espejo sincrono en localStorage. initLocale pasa
 * persist=false para locales detectados (no elegidos) — asi quien nunca
 * eligio sigue beneficiandose de la deteccion en proximos arranques.
 */
export function setLocale(locale, { persist = true } = {}) {
  if (!DICT[locale]) return
  currentLocale = locale
  _setDocumentLang(locale)
  _notify()
  if (persist) {
    saveLocale(locale) // async fire-and-forget; nunca lanza
    try {
      if (typeof window !== 'undefined') {
        window.localStorage?.setItem(MIRROR_KEY, locale)
      }
    } catch { /* private mode */ }
  }
}

/**
 * Traduce una key. Fallback chain: locale activo → es → la key misma.
 * Interpolacion {var}: reemplaza TODAS las ocurrencias de cada placeholder
 * (split/join — sin regex, sin problemas de escaping).
 *
 *   t('bible.errMsg.rate_limited', { sec: 30 })
 *   → 'Demasiadas búsquedas. Espera 30s e inténtalo de nuevo.'
 */
export function t(key, params) {
  let str = (DICT[currentLocale] ? DICT[currentLocale][key] : undefined)
    ?? DICT.es[key]
    ?? key
  if (params) {
    str = String(str)
    for (const k in params) {
      str = str.split('{' + k + '}').join(String(params[k]))
    }
  }
  return str
}

function _detectFromNavigator() {
  try {
    const lang = typeof navigator !== 'undefined' ? String(navigator.language || '') : ''
    const prefix = lang.toLowerCase().slice(0, 2)
    if (DICT[prefix]) return prefix
  } catch { /* ignore */ }
  return 'es'
}

/**
 * Hidratacion del locale en bootstrap (useBootstrap, antes de `ready`).
 * Orden: Preferences → espejo localStorage → navigator.language → 'es'.
 * Solo (1) y (2) son elecciones persistidas; (3)/(4) se aplican con
 * persist=false. Nunca lanza.
 *
 * @returns {Promise<string>} el locale aplicado
 */
export async function initLocale() {
  // 1. Eleccion explicita persistida en Capacitor Preferences.
  try {
    const stored = await loadLocale()
    if (stored && DICT[stored]) {
      setLocale(stored, { persist: false })
      return currentLocale
    }
  } catch { /* loadLocale nunca lanza; defensa extra */ }

  // 2. Espejo sincrono (web/PWA) — escrito por setLocale en una eleccion previa.
  try {
    if (typeof window !== 'undefined') {
      const mirrored = window.localStorage?.getItem(MIRROR_KEY)
      if (mirrored && DICT[mirrored]) {
        setLocale(mirrored, { persist: false })
        return currentLocale
      }
    }
  } catch { /* private mode */ }

  // 3/4. Deteccion por navigator.language con fallback 'es'. NO se persiste.
  setLocale(_detectFromNavigator(), { persist: false })
  return currentLocale
}
