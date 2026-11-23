import { describe, expect, it } from 'vitest'
import { BAJADA, TITULO, clasificarEstado, estadoVisual, glifo } from './transbank'

describe('clasificarEstado', () => {
  it('reconoce el estado autorizado del SDK de Transbank', () => {
    expect(clasificarEstado('AUTHORIZED')).toBe('aprobado')
  })

  it('reconoce los estados que escribe ms-pago en español', () => {
    expect(clasificarEstado('ANULADO')).toBe('anulado')
    expect(clasificarEstado('RECHAZADO')).toBe('rechazado')
    expect(clasificarEstado('ERROR')).toBe('error')
  })

  it('trata FAILED y REJECTED como el mismo rechazo', () => {
    expect(clasificarEstado('FAILED')).toBe('rechazado')
    expect(clasificarEstado('REJECTED')).toBe('rechazado')
  })

  /* El query string llega tal cual lo armó el backend; no hay garantía de caja
     ni de que no venga con espacios al pegarlo a mano. */
  it('ignora la caja y los espacios', () => {
    expect(clasificarEstado('authorized')).toBe('aprobado')
    expect(clasificarEstado('  Anulado ')).toBe('anulado')
  })

  /* Sin estado la pantalla NO debe decir "pago rechazado": significa que se
     abrió a mano o que el returnUrl no apunta al commit. */
  it('distingue la ausencia de estado de un rechazo', () => {
    expect(clasificarEstado(null)).toBe('desconocido')
    expect(clasificarEstado(undefined)).toBe('desconocido')
    expect(clasificarEstado('')).toBe('desconocido')
    expect(clasificarEstado('   ')).toBe('desconocido')
  })

  it('no inventa un resultado para un estado que no conoce', () => {
    expect(clasificarEstado('INITIALIZED')).toBe('desconocido')
  })
})

describe('presentación del resultado', () => {
  it('pinta en verde sólo el pago aprobado', () => {
    expect(estadoVisual('aprobado')).toBe('ok')
    expect(estadoVisual('anulado')).toBe('warn')
    expect(estadoVisual('rechazado')).toBe('bad')
    expect(estadoVisual('error')).toBe('bad')
    expect(estadoVisual('desconocido')).toBe('bad')
  })

  it('usa el visto sólo cuando el pago se autorizó', () => {
    expect(glifo('aprobado')).toBe('✓')
    expect(glifo('anulado')).toBe('!')
    expect(glifo('rechazado')).toBe('×')
  })

  it('tiene copia para todos los resultados posibles', () => {
    for (const r of ['aprobado', 'rechazado', 'anulado', 'error', 'desconocido'] as const) {
      expect(TITULO[r]).toBeTruthy()
      expect(BAJADA[r]).toBeTruthy()
    }
  })
})
