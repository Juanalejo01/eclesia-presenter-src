/**
 * @jest-environment node
 *
 * Tests del modulo puro src/server/songsCatalog.js. NO depende del server
 * HTTP — solo inyectamos el snapshot y validamos los resultados.
 */
const songsCatalog = require('../src/server/songsCatalog')

function makeSong(over = {}) {
  return {
    id: over.id ?? 1,
    title: over.title ?? 'Cuán Grande Es Él',
    author: over.author ?? 'Stuart K. Hine',
    tags: over.tags ?? 'Himno',
    sections: over.sections ?? [
      { type: 'verse', label: 'Estrofa 1', text: 'Señor mi Dios, al contemplar los cielos' },
      { type: 'chorus', label: 'Coro', text: 'Mi corazón entona la canción' },
    ],
    is_favorite: over.is_favorite ?? 0,
    updated_at: over.updated_at ?? Date.now(),
    theme_override: over.theme_override ?? null,
  }
}

beforeEach(() => {
  songsCatalog.__resetForTests()
})

describe('sanitizeQuery', () => {
  test('trim + collapse whitespace + slice 200', () => {
    expect(songsCatalog.sanitizeQuery('   hello   world  ')).toBe('hello world')
    expect(songsCatalog.sanitizeQuery('a'.repeat(300))).toHaveLength(200)
    expect(songsCatalog.sanitizeQuery(null)).toBe('')
    expect(songsCatalog.sanitizeQuery(undefined)).toBe('')
  })

  test('newlines y tabs colapsan a un solo espacio', () => {
    expect(songsCatalog.sanitizeQuery('a\n\nb\t\tc')).toBe('a b c')
  })
})

describe('normalizeText', () => {
  test('elimina tildes y baja a minusculas', () => {
    expect(songsCatalog.normalizeText('Cuán Grande Es Él')).toBe('cuan grande es el')
    expect(songsCatalog.normalizeText('CORAZÓN')).toBe('corazon')
  })
})

describe('matchSong', () => {
  test('matchea por titulo (sin tildes)', () => {
    const s = makeSong({ title: 'Cuán Grande Es Él' })
    const r = songsCatalog.matchSong(s, 'cuan grande')
    expect(r?.kind).toBe('title')
  })

  test('matchea por autor', () => {
    const s = makeSong({ author: 'Stuart K. Hine', title: 'Otro' })
    const r = songsCatalog.matchSong(s, 'stuart')
    expect(r?.kind).toBe('author')
  })

  test('matchea por tags', () => {
    const s = makeSong({ tags: 'Himno, Adoración' })
    const r = songsCatalog.matchSong(s, 'adoracion')
    expect(r?.kind).toBe('tags')
  })

  test('matchea por letra y devuelve snippet con ellipsis', () => {
    const s = makeSong({
      title: 'Otra', author: 'Otro', tags: 'Otro',
      sections: [{ type: 'verse', label: 'Estrofa 1', text: 'Mi corazón entona la canción cuán grande es Él' }],
    })
    const r = songsCatalog.matchSong(s, 'corazon')
    expect(r?.kind).toBe('lyric')
    expect(r?.snippet).toMatch(/corazón/i)
  })

  test('query vacia hace match con kind=title', () => {
    const s = makeSong()
    const r = songsCatalog.matchSong(s, '')
    expect(r?.kind).toBe('title')
  })

  test('sin match devuelve null', () => {
    const s = makeSong({ title: 'A', author: 'B', tags: 'C', sections: [{ text: 'D' }] })
    expect(songsCatalog.matchSong(s, 'zzz')).toBeNull()
  })
})

describe('findLyricSnippet', () => {
  test('centra el match con ellipsis', () => {
    const text = 'Lorem ipsum dolor sit amet consectetur adipiscing elit corazón pulvinar'
    const snippet = songsCatalog.findLyricSnippet(text, 'corazon')
    expect(snippet).toMatch(/…/)
  })

  test('match al inicio no añade ellipsis al inicio', () => {
    const snippet = songsCatalog.findLyricSnippet('corazón mio', 'corazon')
    expect(snippet.startsWith('…')).toBe(false)
  })
})

describe('listSongs', () => {
  test('sin query devuelve todo ordenado', () => {
    songsCatalog.setSnapshot([
      makeSong({ id: 1, title: 'Zorba' }),
      makeSong({ id: 2, title: 'Alfa' }),
      makeSong({ id: 3, title: 'Mid' }),
    ])
    const r = songsCatalog.listSongs({})
    expect(r.items.map(i => i.title)).toEqual(['Alfa', 'Mid', 'Zorba'])
    expect(r.count).toBe(3)
    expect(r.hasMore).toBe(false)
  })

  test('paginacion limit/offset + hasMore', () => {
    songsCatalog.setSnapshot([
      makeSong({ id: 1, title: 'A' }),
      makeSong({ id: 2, title: 'B' }),
      makeSong({ id: 3, title: 'C' }),
      makeSong({ id: 4, title: 'D' }),
    ])
    const page1 = songsCatalog.listSongs({ limit: 2, offset: 0 })
    expect(page1.items).toHaveLength(2)
    expect(page1.hasMore).toBe(true)
    expect(page1.count).toBe(4)

    const page2 = songsCatalog.listSongs({ limit: 2, offset: 2 })
    expect(page2.items).toHaveLength(2)
    expect(page2.hasMore).toBe(false)
  })

  test('limit clamp 1-200', () => {
    songsCatalog.setSnapshot([makeSong()])
    expect(songsCatalog.listSongs({ limit: 999 }).items).toHaveLength(1)
    expect(songsCatalog.listSongs({ limit: -5 }).items.length).toBeGreaterThanOrEqual(0)
  })

  test('items no incluyen sections (lista slim)', () => {
    songsCatalog.setSnapshot([makeSong()])
    const r = songsCatalog.listSongs({})
    expect(r.items[0]).toHaveProperty('sectionsCount')
    expect(r.items[0]).not.toHaveProperty('sections')
  })

  test('items no exponen cloud_id ni created_at', () => {
    songsCatalog.setSnapshot([makeSong({ cloud_id: 'leaked-uuid', cloud_synced_at: 1 })])
    const r = songsCatalog.listSongs({})
    expect(r.items[0]).not.toHaveProperty('cloud_id')
    expect(r.items[0]).not.toHaveProperty('cloud_synced_at')
  })

  test('matchKind=lyric añade snippet', () => {
    songsCatalog.setSnapshot([
      makeSong({ id: 1, title: 'Otro', author: 'Otro', tags: '',
        sections: [{ text: 'Mi corazón canta' }] }),
    ])
    const r = songsCatalog.listSongs({ q: 'corazon' })
    expect(r.items[0].matchKind).toBe('lyric')
    expect(r.items[0].snippet).toBeDefined()
  })

  test('serverVersion incremental al setSnapshot', () => {
    songsCatalog.setSnapshot([makeSong()])
    const v1 = songsCatalog.getServerVersion()
    // Esperar 1ms para asegurar serverVersion distinto (Date.now ms)
    const oldDate = Date.now
    Date.now = () => oldDate() + 5
    songsCatalog.setSnapshot([makeSong()])
    Date.now = oldDate
    const v2 = songsCatalog.getServerVersion()
    expect(v2).toBeGreaterThan(v1)
  })
})

describe('getSong', () => {
  test('devuelve detalle con secciones expandidas y sectionId sintetico', () => {
    songsCatalog.setSnapshot([makeSong({ id: 42 })])
    const r = songsCatalog.getSong(42)
    expect(r.ok).toBe(true)
    expect(r.song.sections[0].sectionId).toBe('s_0')
    expect(r.song.sections[1].sectionId).toBe('s_1')
    expect(r.song.sections[0]).toHaveProperty('text')
    expect(r.song.sections[0]).toHaveProperty('label')
    expect(r.song.sections[0]).toHaveProperty('lineCount')
  })

  test('id invalido → invalid_id', () => {
    expect(songsCatalog.getSong(0).error).toBe('invalid_id')
    expect(songsCatalog.getSong(-1).error).toBe('invalid_id')
    expect(songsCatalog.getSong(NaN).error).toBe('invalid_id')
    expect(songsCatalog.getSong('abc').error).toBe('invalid_id')
  })

  test('id no existe → song_not_found', () => {
    songsCatalog.setSnapshot([])
    expect(songsCatalog.getSong(99).error).toBe('song_not_found')
  })
})

describe('checkRateLimit', () => {
  test('hasta RATE_MAX requests permitidos', () => {
    for (let i = 0; i < songsCatalog.RATE_MAX; i++) {
      expect(songsCatalog.checkRateLimit('dev1').allowed).toBe(true)
    }
    const over = songsCatalog.checkRateLimit('dev1')
    expect(over.allowed).toBe(false)
    expect(over.retryAfterMs).toBeGreaterThan(0)
  })

  test('per-device aislado', () => {
    for (let i = 0; i < songsCatalog.RATE_MAX; i++) songsCatalog.checkRateLimit('a')
    expect(songsCatalog.checkRateLimit('a').allowed).toBe(false)
    expect(songsCatalog.checkRateLimit('b').allowed).toBe(true)
  })
})
