const { parseHolyrics, classify } = require('../src/main/holyricsImport')

describe('parseHolyrics — JSON de Holyrics', () => {
  test('cancion con slides (text + slide_description + order)', () => {
    const json = JSON.stringify({
      title: 'Sublime Gracia',
      artist: 'John Newton',
      author: 'Trad.',
      bpm: 70,
      groups: [{ name: 'Himnos' }],
      slides: [
        { order: 2, slide_description: 'Chorus', text: 'Cuán dulce el sonido' },
        { order: 1, slide_description: 'Verse 1', text: 'Sublime gracia\ndel Señor' },
      ],
    })
    const songs = parseHolyrics(json, 'export.json')
    expect(songs).toHaveLength(1)
    const s = songs[0]
    expect(s.title).toBe('Sublime Gracia')
    expect(s.author).toBe('Trad.')
    // order respetado: verse primero aunque venga segundo en el array
    expect(s.sections[0].type).toBe('verse')
    expect(s.sections[0].text).toBe('Sublime gracia\ndel Señor')
    expect(s.sections[1].type).toBe('chorus')
    expect(s.tags).toContain('holyrics')
    expect(s.tags).toContain('himnos')
    expect(s.maxLines).toBe(4)
  })

  test('array de canciones', () => {
    const json = JSON.stringify([
      { title: 'A', slides: [{ text: 'a' }] },
      { title: 'B', slides: [{ text: 'b' }] },
    ])
    expect(parseHolyrics(json)).toHaveLength(2)
  })

  test('envoltorio { songs: [...] }', () => {
    const json = JSON.stringify({ songs: [{ title: 'X', slides: [{ text: 'x' }] }] })
    expect(parseHolyrics(json)).toHaveLength(1)
  })

  test('styled_text con marcado se limpia a texto plano', () => {
    const json = JSON.stringify({ title: 'X', slides: [{ styled_text: 'Hola<br>mundo<br/>' }] })
    const s = parseHolyrics(json)
    expect(s[0].sections[0].text).toBe('Hola\nmundo')
  })

  test('author cae a artist si falta', () => {
    const json = JSON.stringify({ title: 'X', artist: 'Marcos Witt', slides: [{ text: 'a' }] })
    expect(parseHolyrics(json)[0].author).toBe('Marcos Witt')
  })

  test('cancion sin contenido se descarta', () => {
    const json = JSON.stringify([{ title: 'Vacia', slides: [] }, { title: 'Ok', slides: [{ text: 'hola' }] }])
    const songs = parseHolyrics(json)
    expect(songs).toHaveLength(1)
    expect(songs[0].title).toBe('Ok')
  })
})

describe('parseHolyrics — texto plano', () => {
  test('bloques separados por linea en blanco = secciones; titulo del archivo', () => {
    const txt = 'Verso uno\nlinea dos\n\nCoro aqui\notra linea'
    const songs = parseHolyrics(txt, 'Mi Canción.txt')
    expect(songs).toHaveLength(1)
    expect(songs[0].title).toBe('Mi Canción')
    expect(songs[0].sections).toHaveLength(2)
    expect(songs[0].sections[0].label).toBe('Estrofa 1')
  })

  test('sin nombre de archivo: primera linea como titulo', () => {
    const txt = 'Titulo de la cancion\n\nLetra linea 1\nLetra linea 2'
    const songs = parseHolyrics(txt, '')
    expect(songs[0].title).toBe('Titulo de la cancion')
    expect(songs[0].sections).toHaveLength(1)
  })
})

describe('parseHolyrics — bordes', () => {
  test('vacio -> []', () => {
    expect(parseHolyrics('')).toEqual([])
    expect(parseHolyrics('   ')).toEqual([])
    expect(parseHolyrics(null)).toEqual([])
  })

  test('JSON invalido cae a texto plano', () => {
    const songs = parseHolyrics('{ esto no es json valido', 'roto.txt')
    expect(songs).toHaveLength(1)
  })
})

describe('classify', () => {
  test('reconoce tipos multi-idioma', () => {
    expect(classify('Verse 1')).toBe('verse')
    expect(classify('Estrofa 2')).toBe('verse')
    expect(classify('Coro')).toBe('chorus')
    expect(classify('Refrão')).toBe('chorus')
    expect(classify('Bridge')).toBe('bridge')
    expect(classify('Puente')).toBe('bridge')
    expect(classify('Final')).toBe('outro')
    expect(classify('cualquier cosa')).toBe(null)
  })
})
