/**
 * urlHelpers.selfServer.test.js
 *
 * T12: cuando el mando se sirve desde el PROPIO desktop server
 * (http://IP:3434/app/), el same-origin deja de ser un error ('dev_server')
 * y pasa a ser 'self_server' (tratado como ok). El falso positivo de Vite
 * :5173 debe conservar su comportamiento EXACTO.
 */
import { detectPortIssue, isServedFromDesktop } from '../src/services/urlHelpers.js'

describe('detectPortIssue — self_server vs dev_server', () => {
  test('devuelve self_server (no dev_server) cuando el origen es :3434 y target = origen', () => {
    const r = detectPortIssue('http://192.168.1.10:3434', 'http://192.168.1.10:3434')
    expect(r.kind).toBe('self_server')
    expect(r.port).toBe('3434')
  })

  test('conserva dev_server para origen :5173 apuntando a sí mismo (regresión Vite)', () => {
    const r = detectPortIssue('http://192.168.1.10:5173', 'http://192.168.1.10:5173')
    expect(r.kind).toBe('dev_server')
    expect(r.port).toBe('5173')
  })

  test('target distinto al origen :3434 sigue siendo ok/wrong_port (sin cambios)', () => {
    expect(
      detectPortIssue('http://192.168.1.20:3434', 'http://192.168.1.10:3434').kind,
    ).toBe('ok')
    expect(
      detectPortIssue('http://192.168.1.20:8080', 'http://192.168.1.10:3434').kind,
    ).toBe('wrong_port')
  })
})

describe('isServedFromDesktop', () => {
  test('true en /app servido por el puerto canónico :3434', () => {
    expect(isServedFromDesktop({ port: '3434', pathname: '/app/' })).toBe(true)
  })

  test('true con solo el puerto canónico (cualquier pathname)', () => {
    expect(isServedFromDesktop({ port: '3434', pathname: '/' })).toBe(true)
  })

  test('true con pathname /app aunque el puerto no sea visible (embed http)', () => {
    expect(isServedFromDesktop({ port: '', pathname: '/app/service', protocol: 'http:' })).toBe(true)
  })

  test('false en cloud https con pathname /app (el embed del desktop siempre es http)', () => {
    expect(isServedFromDesktop({ port: '', pathname: '/app', protocol: 'https:' })).toBe(false)
    expect(isServedFromDesktop({ port: '', pathname: '/app/service', protocol: 'https:' })).toBe(false)
  })

  test('false en Vite dev :5173', () => {
    expect(isServedFromDesktop({ port: '5173', pathname: '/', protocol: 'http:' })).toBe(false)
  })

  test('false en Vercel https (sin puerto, pathname raíz)', () => {
    expect(isServedFromDesktop({ port: '', pathname: '/', protocol: 'https:' })).toBe(false)
  })

  test('false con location null/ausente (SSR/tests)', () => {
    expect(isServedFromDesktop(null)).toBe(false)
  })
})
