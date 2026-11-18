import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useHealth } from './useHealth'

/* Lo que se fija acá es la lectura de /actuator/health: un servicio vivo con una
   dependencia caída NO es lo mismo que un servicio que no está, y la barra
   lateral tiene que mostrarlos distinto. */

function respuesta(status: number, cuerpo: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(JSON.stringify(cuerpo)),
    json: () => Promise.resolve(cuerpo),
  } as unknown as Response
}

const UP = { status: 'UP', components: { db: { status: 'UP' } } }
const DOWN = {
  status: 'DOWN',
  components: { kafkaCluster: { status: 'DOWN', details: { brokers: 1, brokersMinimos: 2 } } },
}

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useHealth', () => {
  it('pide /actuator/health a cada servicio y no un endpoint de negocio', async () => {
    fetchMock.mockResolvedValue(respuesta(200, UP))
    renderHook(() => useHealth())

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3))

    const urls = fetchMock.mock.calls.map((c) => String(c[0])).sort()
    expect(urls).toEqual([
      'http://localhost:8083/actuator/health',
      'http://localhost:8084/actuator/health',
      'http://localhost:8085/actuator/health',
    ])
    /* Ningún sondeo debe tocar /api: eso era lo que ensuciaba los logs. */
    expect(urls.some((u) => u.includes('/api/'))).toBe(false)
  })

  it('marca "arriba" cuando el status es UP', async () => {
    fetchMock.mockResolvedValue(respuesta(200, UP))
    const { result } = renderHook(() => useHealth())

    await waitFor(() => expect(result.current.salud.pagos).toBe('arriba'))
    expect(result.current.salud).toEqual({ pagos: 'arriba', recomendaciones: 'arriba', admin: 'arriba' })
  })

  /* Actuator responde 503 cuando un componente está DOWN. El proceso atiende:
     tratarlo como caído mandaría a revisar el servicio equivocado. */
  it('marca "degradado" ante un 503 y conserva el detalle por componente', async () => {
    fetchMock.mockResolvedValue(respuesta(503, DOWN))
    const { result } = renderHook(() => useHealth())

    await waitFor(() => expect(result.current.salud.admin).toBe('degradado'))
    expect(result.current.detalle.admin?.components?.kafkaCluster.status).toBe('DOWN')
  })

  it('marca "degradado" ante un 200 cuyo status no es UP', async () => {
    fetchMock.mockResolvedValue(respuesta(200, { status: 'OUT_OF_SERVICE' }))
    const { result } = renderHook(() => useHealth())

    await waitFor(() => expect(result.current.salud.pagos).toBe('degradado'))
  })

  it('marca "caido" sólo cuando falla la red', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    const { result } = renderHook(() => useHealth())

    await waitFor(() => expect(result.current.salud.pagos).toBe('caido'))
    expect(result.current.detalle.pagos).toBeNull()
  })

  /* Un 404 significa que el servicio está arriba pero sin Actuator expuesto;
     no es una caída. */
  it('no reporta caído ante un 404 del endpoint de salud', async () => {
    fetchMock.mockResolvedValue(respuesta(404, { error: 'Not Found' }))
    const { result } = renderHook(() => useHealth())

    await waitFor(() => expect(result.current.salud.pagos).toBe('degradado'))
  })

  it('distingue el estado de cada servicio por separado', async () => {
    fetchMock.mockImplementation((url: string) => {
      if (String(url).includes('8083')) return Promise.resolve(respuesta(200, UP))
      if (String(url).includes('8084')) return Promise.resolve(respuesta(503, DOWN))
      return Promise.reject(new TypeError('Failed to fetch'))
    })
    const { result } = renderHook(() => useHealth())

    await waitFor(() => expect(result.current.salud.admin).toBe('caido'))
    expect(result.current.salud).toEqual({
      pagos: 'arriba',
      recomendaciones: 'degradado',
      admin: 'caido',
    })
  })
})
