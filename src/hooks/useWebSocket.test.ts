import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useWebSocket } from './useWebSocket'

/* ---------------------------------------------------------------------------
   WebSocket simulado.

   jsdom no implementa WebSocket, y aunque lo hiciera haría falta un servidor.
   Esta clase registra cada instancia y expone los disparadores de los eventos,
   que es lo único que el hook consume.
   ------------------------------------------------------------------------- */
class WebSocketFalso {
  static instancias: WebSocketFalso[] = []
  static ultima() {
    return WebSocketFalso.instancias[WebSocketFalso.instancias.length - 1]
  }

  url: string
  cerrado = false
  onopen: (() => void) | null = null
  onmessage: ((ev: { data: string }) => void) | null = null
  onclose: (() => void) | null = null
  onerror: (() => void) | null = null

  constructor(url: string) {
    this.url = url
    WebSocketFalso.instancias.push(this)
  }

  close() {
    this.cerrado = true
  }

  /* --- disparadores para los tests --- */
  abrir() {
    this.onopen?.()
  }
  mensaje(data: unknown) {
    this.onmessage?.({ data: typeof data === 'string' ? data : JSON.stringify(data) })
  }
  /** Cierre que NO pidió el usuario: el de los 10 min de API Gateway. */
  caer() {
    this.onclose?.()
  }
}

beforeEach(() => {
  WebSocketFalso.instancias = []
  vi.useFakeTimers()
  vi.stubGlobal('WebSocket', WebSocketFalso)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

async function avanzar(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

const URL_WS = 'wss://abc123.execute-api.us-east-1.amazonaws.com/produccion'

describe('useWebSocket', () => {
  it('conecta agregando el clientId al query string', async () => {
    const { result } = renderHook(() => useWebSocket({ onMensaje: vi.fn() }))

    await act(async () => {
      result.current.conectar(URL_WS)
    })

    expect(WebSocketFalso.instancias).toHaveLength(1)
    expect(WebSocketFalso.ultima().url).toMatch(/^wss:\/\/abc123[^?]*\?clientId=operaciones_\d+$/)
    expect(result.current.estado).toBe('conectando')

    await act(async () => {
      WebSocketFalso.ultima().abrir()
    })
    expect(result.current.estado).toBe('conectado')
  })

  it('entrega el mensaje ya parseado', async () => {
    const onMensaje = vi.fn()
    const { result } = renderHook(() => useWebSocket({ onMensaje }))

    await act(async () => {
      result.current.conectar(URL_WS)
    })
    await act(async () => {
      WebSocketFalso.ultima().abrir()
      WebSocketFalso.ultima().mensaje([{ tipo: 'metricas', interaccionesPorMinuto: 12 }])
    })

    expect(onMensaje).toHaveBeenCalledWith([{ tipo: 'metricas', interaccionesPorMinuto: 12 }])
  })

  it('avisa del JSON inválido sin tumbar la conexión', async () => {
    const onAviso = vi.fn()
    const { result } = renderHook(() => useWebSocket({ onMensaje: vi.fn(), onAviso }))

    await act(async () => {
      result.current.conectar(URL_WS)
    })
    await act(async () => {
      WebSocketFalso.ultima().abrir()
      WebSocketFalso.ultima().mensaje('{ esto no es json')
    })

    expect(onAviso).toHaveBeenCalledWith(expect.stringContaining('JSON inválido'), 'error')
    expect(result.current.estado).toBe('conectado')
  })

  /* El caso que motiva el hook: API Gateway cierra a los 10 minutos de
     inactividad y el cierre no llega como error. */
  it('reconecta solo cuando el cierre no lo pidió el usuario', async () => {
    const { result } = renderHook(() => useWebSocket({ onMensaje: vi.fn(), base: 2000 }))

    await act(async () => {
      result.current.conectar(URL_WS)
    })
    await act(async () => {
      WebSocketFalso.ultima().abrir()
    })

    await act(async () => {
      WebSocketFalso.ultima().caer()
    })
    expect(result.current.estado).toBe('reconectando')
    expect(WebSocketFalso.instancias).toHaveLength(1)

    await avanzar(2000)
    expect(WebSocketFalso.instancias).toHaveLength(2)

    await act(async () => {
      WebSocketFalso.ultima().abrir()
    })
    expect(result.current.estado).toBe('conectado')
    expect(result.current.intentos).toBe(0)
  })

  it('espacia los reintentos con la progresión creciente', async () => {
    const { result } = renderHook(() => useWebSocket({ onMensaje: vi.fn(), base: 2000, max: 30000 }))

    await act(async () => {
      result.current.conectar(URL_WS)
    })
    await act(async () => {
      WebSocketFalso.ultima().abrir()
      WebSocketFalso.ultima().caer()
    })

    await avanzar(2000)
    expect(WebSocketFalso.instancias).toHaveLength(2) // primer reintento: 2 s

    await act(async () => {
      WebSocketFalso.ultima().caer()
    })

    /* El segundo reintento espera 4 s: a los 2 s todavía no debe haber abierto
       otro socket. */
    await avanzar(2000)
    expect(WebSocketFalso.instancias).toHaveLength(2)

    await avanzar(2000)
    expect(WebSocketFalso.instancias).toHaveLength(3)
  })

  it('se rinde tras el máximo de reintentos', async () => {
    const onAviso = vi.fn()
    const { result } = renderHook(() =>
      useWebSocket({ onMensaje: vi.fn(), base: 1000, max: 8000, maxIntentos: 2, onAviso }),
    )

    await act(async () => {
      result.current.conectar(URL_WS)
    })
    await act(async () => {
      WebSocketFalso.ultima().caer()
    })
    await avanzar(1000) // reintento 1
    await act(async () => {
      WebSocketFalso.ultima().caer()
    })
    await avanzar(2000) // reintento 2
    await act(async () => {
      WebSocketFalso.ultima().caer()
    })

    expect(result.current.estado).toBe('rendido')
    expect(onAviso).toHaveBeenCalledWith(expect.stringContaining('se deja de reconectar'), 'error')

    const abiertos = WebSocketFalso.instancias.length
    await avanzar(600000)
    expect(WebSocketFalso.instancias).toHaveLength(abiertos)
  })

  /* Sin la marca de cierre intencional, pulsar "Desconectar" dispararía la
     reconexión automática del socket que se acaba de cerrar. */
  it('desconectar no reconecta', async () => {
    const { result } = renderHook(() => useWebSocket({ onMensaje: vi.fn(), base: 1000 }))

    await act(async () => {
      result.current.conectar(URL_WS)
    })
    await act(async () => {
      WebSocketFalso.ultima().abrir()
    })

    await act(async () => {
      result.current.desconectar()
    })
    expect(result.current.estado).toBe('cerrado')

    await avanzar(60000)
    expect(WebSocketFalso.instancias).toHaveLength(1)
  })

  it('cierra el socket al desmontar y no deja reintentos pendientes', async () => {
    const { result, unmount } = renderHook(() => useWebSocket({ onMensaje: vi.fn(), base: 1000 }))

    await act(async () => {
      result.current.conectar(URL_WS)
    })
    await act(async () => {
      WebSocketFalso.ultima().abrir()
    })

    const socket = WebSocketFalso.ultima()
    unmount()

    expect(socket.cerrado).toBe(true)
    await avanzar(60000)
    expect(WebSocketFalso.instancias).toHaveLength(1)
  })

  it('reconectar a mano reinicia el contador de intentos', async () => {
    const { result } = renderHook(() => useWebSocket({ onMensaje: vi.fn(), base: 1000 }))

    await act(async () => {
      result.current.conectar(URL_WS)
    })
    await act(async () => {
      WebSocketFalso.ultima().caer()
    })
    expect(result.current.intentos).toBe(1)

    await act(async () => {
      result.current.conectar(URL_WS)
    })
    expect(result.current.intentos).toBe(0)
    expect(result.current.estado).toBe('conectando')
  })
})
