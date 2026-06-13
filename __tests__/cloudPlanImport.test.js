// Tests para src/renderer/services/cloudPlanImport.js
//
// Por qué importa: este módulo cierra el círculo C3b (planifico en el móvil →
// importo en el desktop). Si el mapeo pierde el orden o no avisa de canciones
// que faltan, el proyectista carga una lista incompleta sin enterarse en mitad
// del culto. Es el punto donde el contrato jsonb de la nube se convierte en
// items proyectables.

import { mapPlanItems } from '../src/renderer/services/cloudPlanImport.js'

// Dobles inyectables
const songDb = {
  'cloud-abc': { id: 11, title: 'Cuán grande es Él', author: 'Carl Boberg', sections: [{ text: 'Señor mi Dios' }] },
  'cloud-xyz': { id: 22, title: 'Sublime gracia', author: 'John Newton', sections: [{ text: 'Sublime gracia del Señor' }] },
}
const findSongByCloudId = (id) => songDb[id] || null

const resolveBibleRef = (reference) => {
  if (reference === 'Juan 3:16') {
    return { text: 'Porque de tal manera amó Dios al mundo...', reference: 'Juan 3:16', meta: { bookIndex: 42, chapterNum: 3, verseNums: [16] } }
  }
  return null
}

describe('mapPlanItems — tipos básicos', () => {
  test('item song existente → schedule item con campos para proyectar', () => {
    const { scheduleItems, warnings } = mapPlanItems(
      [{ key: 'k1', type: 'song', cloudSongId: 'cloud-abc', title: 'Cuán grande es Él' }],
      { findSongByCloudId, resolveBibleRef }
    )
    expect(warnings).toHaveLength(0)
    expect(scheduleItems).toHaveLength(1)
    expect(scheduleItems[0]).toMatchObject({
      type: 'song',
      title: 'Cuán grande es Él',
      text: 'Señor mi Dios',
      reference: 'Carl Boberg',
      meta: { songId: 11 },
    })
    expect(scheduleItems[0].meta.sections).toEqual([{ text: 'Señor mi Dios' }])
  })

  test('item bible resuelto → schedule item con texto+referencia', () => {
    const { scheduleItems, warnings } = mapPlanItems(
      [{ key: 'k1', type: 'bible', reference: 'Juan 3:16', version: 'rvr1960' }],
      { findSongByCloudId, resolveBibleRef }
    )
    expect(warnings).toHaveLength(0)
    expect(scheduleItems[0]).toMatchObject({
      type: 'bible',
      title: 'Juan 3:16',
      reference: 'Juan 3:16',
      text: 'Porque de tal manera amó Dios al mundo...',
    })
    expect(scheduleItems[0].meta).toEqual({ bookIndex: 42, chapterNum: 3, verseNums: [16] })
  })

  test('item note → schedule item con title+text', () => {
    const { scheduleItems, warnings } = mapPlanItems(
      [{ key: 'k1', type: 'note', title: 'Bienvenida', text: 'Saludo inicial' }],
      { findSongByCloudId, resolveBibleRef }
    )
    expect(warnings).toHaveLength(0)
    expect(scheduleItems[0]).toEqual({ type: 'note', title: 'Bienvenida', text: 'Saludo inicial' })
  })

  test('note sin title deriva title del text', () => {
    const { scheduleItems } = mapPlanItems(
      [{ key: 'k1', type: 'note', text: 'Anuncio importante de la semana' }],
      {}
    )
    expect(scheduleItems[0].title).toBe('Anuncio importante de la semana')
    expect(scheduleItems[0].type).toBe('note')
  })
})

describe('mapPlanItems — warnings y skips', () => {
  test('canción huérfana (no está en este PC) → warning y no se añade', () => {
    const { scheduleItems, warnings } = mapPlanItems(
      [{ key: 'k1', type: 'song', cloudSongId: 'no-existe', title: 'Himno X' }],
      { findSongByCloudId, resolveBibleRef }
    )
    expect(scheduleItems).toHaveLength(0)
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('Himno X')
    expect(warnings[0]).toContain('sincroniza')
  })

  test('referencia bíblica no resuelta → warning y skip', () => {
    const { scheduleItems, warnings } = mapPlanItems(
      [{ key: 'k1', type: 'bible', reference: 'Habacuc 99:99', version: 'rvr1960' }],
      { findSongByCloudId, resolveBibleRef }
    )
    expect(scheduleItems).toHaveLength(0)
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('Habacuc 99:99')
  })

  test('tipo desconocido → warning y skip', () => {
    const { scheduleItems, warnings } = mapPlanItems(
      [{ key: 'k1', type: 'video', title: 'clip' }],
      { findSongByCloudId, resolveBibleRef }
    )
    expect(scheduleItems).toHaveLength(0)
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('desconocido')
  })

  test('item null/no-objeto → warning y skip', () => {
    const { scheduleItems, warnings } = mapPlanItems([null, 'foo', 42], {})
    expect(scheduleItems).toHaveLength(0)
    expect(warnings).toHaveLength(3)
  })

  test('bible sin reference → warning', () => {
    const { scheduleItems, warnings } = mapPlanItems(
      [{ key: 'k1', type: 'bible', version: 'rvr1960' }],
      { resolveBibleRef }
    )
    expect(scheduleItems).toHaveLength(0)
    expect(warnings).toHaveLength(1)
  })
})

describe('mapPlanItems — orden y robustez', () => {
  test('preserva el orden litúrgico de la lista, saltando los no resolubles', () => {
    const items = [
      { key: 'a', type: 'note', title: 'Bienvenida', text: 'Hola' },
      { key: 'b', type: 'song', cloudSongId: 'cloud-abc', title: 'Cuán grande es Él' },
      { key: 'c', type: 'song', cloudSongId: 'no-existe', title: 'Falta' },      // skip
      { key: 'd', type: 'bible', reference: 'Juan 3:16', version: 'rvr1960' },
      { key: 'e', type: 'song', cloudSongId: 'cloud-xyz', title: 'Sublime gracia' },
    ]
    const { scheduleItems, warnings } = mapPlanItems(items, { findSongByCloudId, resolveBibleRef })
    expect(warnings).toHaveLength(1)
    expect(scheduleItems.map(i => i.title)).toEqual([
      'Bienvenida', 'Cuán grande es Él', 'Juan 3:16', 'Sublime gracia',
    ])
    expect(scheduleItems.map(i => i.type)).toEqual(['note', 'song', 'bible', 'song'])
  })

  test('input no-array → resultado vacío sin reventar', () => {
    expect(mapPlanItems(null, {})).toEqual({ scheduleItems: [], warnings: [] })
    expect(mapPlanItems(undefined, {})).toEqual({ scheduleItems: [], warnings: [] })
    expect(mapPlanItems({}, {})).toEqual({ scheduleItems: [], warnings: [] })
  })

  test('resolvers ausentes: songs y biblias no se resuelven pero notes sí', () => {
    const items = [
      { key: 'a', type: 'song', cloudSongId: 'cloud-abc', title: 'X' },
      { key: 'b', type: 'bible', reference: 'Juan 3:16' },
      { key: 'c', type: 'note', title: 'N', text: 't' },
    ]
    const { scheduleItems, warnings } = mapPlanItems(items, {})
    expect(scheduleItems).toHaveLength(1)
    expect(scheduleItems[0].type).toBe('note')
    expect(warnings).toHaveLength(2)
  })
})
