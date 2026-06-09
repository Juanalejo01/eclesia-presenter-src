// Mapa de alias de libros bíblicos en español → nombre canónico.
// Cubre: nombres completos (con/sin acentos), abreviaciones cortas comunes
// ('sal', 'gn', '1co') y variantes ortográficas.
//
// El nombre canónico debe coincidir con el `name` que aparece en los JSON
// (rvr1960.json etc. ya vienen en español: "Génesis", "Salmos", "Apocalipsis").

function normalizeText(s) {
  if (!s) return ''
  return String(s)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[¿¡?!.,;:"'`´]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

// Cada entrada: [canonical, ...aliases]. El normalizador se aplica a todos.
const RAW = [
  ['Génesis',          'genesis', 'gen', 'gn', 'gé'],
  ['Éxodo',            'exodo', 'ex', 'éx', 'éxo'],
  ['Levítico',         'levitico', 'lev', 'lv'],
  ['Números',          'numeros', 'num', 'nm', 'nu'],
  ['Deuteronomio',     'deuteronomio', 'deut', 'dt'],
  ['Josué',            'josue', 'jos', 'js'],
  ['Jueces',           'jueces', 'jue', 'jc'],
  ['Rut',              'rut', 'rt'],
  ['1 Samuel',         '1 samuel', '1sam', '1sm', '1s', '1 sm'],
  ['2 Samuel',         '2 samuel', '2sam', '2sm', '2s', '2 sm'],
  ['1 Reyes',          '1 reyes', '1re', '1rey', '1r'],
  ['2 Reyes',          '2 reyes', '2re', '2rey', '2r'],
  ['1 Crónicas',       '1 cronicas', '1cr', '1cro', '1 cron'],
  ['2 Crónicas',       '2 cronicas', '2cr', '2cro', '2 cron'],
  ['Esdras',           'esdras', 'esd'],
  ['Nehemías',         'nehemias', 'neh', 'ne'],
  ['Ester',            'ester', 'est'],
  ['Job',              'job', 'jb'],
  ['Salmos',           'salmos', 'sal', 'sl', 'salmo', 'salm'],
  ['Proverbios',       'proverbios', 'prov', 'pr', 'pro'],
  ['Eclesiastés',      'eclesiastes', 'ecl', 'ec'],
  ['Cantares',         'cantares', 'cant', 'cnt', 'cantar', 'cantar de los cantares'],
  ['Isaías',           'isaias', 'isa', 'is'],
  ['Jeremías',         'jeremias', 'jer', 'jr'],
  ['Lamentaciones',    'lamentaciones', 'lam', 'lm'],
  ['Ezequiel',         'ezequiel', 'ez', 'eze'],
  ['Daniel',           'daniel', 'dan', 'dn'],
  ['Oseas',            'oseas', 'os'],
  ['Joel',             'joel', 'jl'],
  ['Amós',             'amos', 'am'],
  ['Abdías',           'abdias', 'abd', 'ab'],
  ['Jonás',            'jonas', 'jon'],
  ['Miqueas',          'miqueas', 'miq', 'mi'],
  ['Nahúm',            'nahum', 'nah', 'na'],
  ['Habacuc',          'habacuc', 'hab', 'ha'],
  ['Sofonías',         'sofonias', 'sof', 'so'],
  ['Hageo',            'hageo', 'hag', 'hg'],
  ['Zacarías',         'zacarias', 'zac', 'zc'],
  ['Malaquías',        'malaquias', 'mal', 'ml'],
  ['Mateo',            'mateo', 'mt', 'mat'],
  ['Marcos',           'marcos', 'mc', 'mr', 'mar'],
  ['Lucas',            'lucas', 'lc', 'luc', 'lu'],
  ['Juan',             'juan', 'jn', 'ju'],
  ['Hechos',           'hechos', 'hch', 'hec', 'he'],
  ['Romanos',          'romanos', 'ro', 'rom', 'rm'],
  ['1 Corintios',      '1 corintios', '1co', '1cor', '1corintios', '1 cor'],
  ['2 Corintios',      '2 corintios', '2co', '2cor', '2corintios', '2 cor'],
  ['Gálatas',          'galatas', 'gal', 'ga', 'gl'],
  ['Efesios',          'efesios', 'ef', 'efe'],
  ['Filipenses',       'filipenses', 'flp', 'fil', 'filp'],
  ['Colosenses',       'colosenses', 'col', 'cl'],
  ['1 Tesalonicenses', '1 tesalonicenses', '1ts', '1tes', '1 tes'],
  ['2 Tesalonicenses', '2 tesalonicenses', '2ts', '2tes', '2 tes'],
  ['1 Timoteo',        '1 timoteo', '1ti', '1tim', '1 tim'],
  ['2 Timoteo',        '2 timoteo', '2ti', '2tim', '2 tim'],
  ['Tito',             'tito', 'tit', 'ti'],
  ['Filemón',          'filemon', 'flm', 'film'],
  ['Hebreos',          'hebreos', 'heb', 'hb'],
  ['Santiago',         'santiago', 'sant', 'stg'],
  ['1 Pedro',          '1 pedro', '1p', '1pe', '1ped'],
  ['2 Pedro',          '2 pedro', '2p', '2pe', '2ped'],
  ['1 Juan',           '1 juan', '1jn', '1ju'],
  ['2 Juan',           '2 juan', '2jn', '2ju'],
  ['3 Juan',           '3 juan', '3jn', '3ju'],
  ['Judas',            'judas', 'jud'],
  ['Apocalipsis',      'apocalipsis', 'ap', 'apoc', 'apc'],
]

const BOOK_ALIASES = Object.create(null)
for (const row of RAW) {
  const canonical = row[0]
  // El canonical es siempre alias de sí mismo (normalizado).
  BOOK_ALIASES[normalizeText(canonical)] = canonical
  for (let i = 1; i < row.length; i++) {
    BOOK_ALIASES[normalizeText(row[i])] = canonical
  }
}

module.exports = { BOOK_ALIASES, normalizeText }
