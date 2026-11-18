import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { usePolling } from './usePolling'

/* Los tests del ciclo usan timers falsos: la progresión real tarda 75 segundos
   en llegar al quinto fallo y no se puede esperar eso en una suite. */
beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

/** Avanza el reloj y deja que se resuelvan las promesas que eso dispara. */
async function avanzar(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

describe('usePolling', () => {
  it('no corre hasta que se lo inicia', () => {
    const tarea = vi.fn().mockResolvedValue(undefined)
    const { result } = renderHook(() => usePolling({ tarea }))

    expect(result.current.activo).toBe(false)
    expect(tarea).not.toHaveBeenCalled()
  })

  it('lee de inmediato al iniciar y después cada intervalo base', async () => {
    const tarea = vi.fn().mockResolvedValue(undefined)
    const { result } = renderHook(() => usePolling({ tarea, base: 5000 }))

    await act(async () => {
      result.current.iniciar()
    })
    expect(tarea).toHaveBeenCalledTimes(1)
    expect(result.current.activo).toBe(true)

    await avanzar(5000)
    expect(tarea).toHaveBeenCalledTimes(2)

    await avanzar(5000)
    expect(tarea).toHaveBeenCalledTimes(3)
    expect(result.current.fallos).toBe(0)
  })

  /* El motivo de todo el hook: un servicio caído no debe recibir una petición
     cada 5 s para siempre. */
  it('duplica la espera con cada fallo consecutivo', async () => {
    const tarea = vi.fn().mockRejectedValue(new Error('ningún servicio respondió'))
    const { result } = renderHook(() => usePolling({ tarea, base: 5000, max: 60000 }))

    await act(async () => {
      result.current.iniciar()
    })
    expect(tarea).toHaveBeenCalledTimes(1)
    expect(result.current.fallos).toBe(1)
    expect(result.current.esperaMs).toBe(5000)

    await avanzar(5000)
    expect(tarea).toHaveBeenCalledTimes(2)
    expect(result.current.esperaMs).toBe(10000)

    /* A los 5 s del segundo fallo todavía NO debe haber reintentado: la espera
       ahora es de 10 s. Esta es la aserción que falla si se vuelve al
       setInterval fijo. */
    await avanzar(5000)
    expect(tarea).toHaveBeenCalledTimes(2)

    await avanzar(5000)
    expect(tarea).toHaveBeenCalledTimes(3)
    expect(result.current.esperaMs).toBe(20000)
  })

  it('se rinde tras el máximo de fallos y deja de pedir', async () => {
    const tarea = vi.fn().mockRejectedValue(new Error('caído'))
    const { result } = renderHook(() => usePolling({ tarea, base: 1000, max: 60000, maxFallos: 3 }))

    await act(async () => {
      result.current.iniciar()
    })
    await avanzar(1000) // segundo intento
    await avanzar(2000) // tercer intento -> se rinde

    expect(tarea).toHaveBeenCalledTimes(3)
    expect(result.current.rendido).toBe(true)
    expect(result.current.activo).toBe(false)

    /* Pasa mucho tiempo y no vuelve a intentar por su cuenta. */
    await avanzar(600000)
    expect(tarea).toHaveBeenCalledTimes(3)
  })

  it('vuelve al intervalo base cuando el servicio se recupera', async () => {
    const tarea = vi
      .fn()
      .mockRejectedValueOnce(new Error('caído'))
      .mockRejectedValueOnce(new Error('caído'))
      .mockResolvedValue(undefined)
    const { result } = renderHook(() => usePolling({ tarea, base: 5000 }))

    await act(async () => {
      result.current.iniciar()
    })
    await avanzar(5000) // segundo fallo -> espera 10 s
    expect(result.current.fallos).toBe(2)

    await avanzar(10000) // éxito
    expect(result.current.fallos).toBe(0)
    expect(result.current.esperaMs).toBe(5000)
    expect(result.current.rendido).toBe(false)

    await avanzar(5000)
    expect(tarea).toHaveBeenCalledTimes(4)
  })

  it('avisa del reintento y de la recuperación, sin repetir el error cada vuelta', async () => {
    const onAviso = vi.fn()
    const tarea = vi.fn().mockRejectedValueOnce(new Error('caído')).mockResolvedValue(undefined)
    const { result } = renderHook(() => usePolling({ tarea, base: 5000, onAviso }))

    await act(async () => {
      result.current.iniciar()
    })
    expect(onAviso).toHaveBeenCalledWith(expect.stringContaining('fallo 1/5'), 'error')

    await avanzar(5000)
    expect(onAviso).toHaveBeenCalledWith(expect.stringContaining('responden de nuevo'), 'ok')

    /* Ya recuperado, las vueltas exitosas no escriben nada más. */
    const llamadas = onAviso.mock.calls.length
    await avanzar(5000)
    await avanzar(5000)
    expect(onAviso.mock.calls.length).toBe(llamadas)
  })

  it('detener corta el ciclo y resetea el contador', async () => {
    const tarea = vi.fn().mockRejectedValue(new Error('caído'))
    const { result } = renderHook(() => usePolling({ tarea, base: 5000 }))

    await act(async () => {
      result.current.iniciar()
    })
    await act(async () => {
      result.current.detener()
    })

    expect(result.current.activo).toBe(false)
    expect(result.current.fallos).toBe(0)

    await avanzar(60000)
    expect(tarea).toHaveBeenCalledTimes(1)
  })

  it('iniciar dos veces no duplica el ciclo', async () => {
    const tarea = vi.fn().mockResolvedValue(undefined)
    const { result } = renderHook(() => usePolling({ tarea, base: 5000 }))

    await act(async () => {
      result.current.iniciar()
      result.current.iniciar()
    })
    expect(tarea).toHaveBeenCalledTimes(1)

    await avanzar(5000)
    expect(tarea).toHaveBeenCalledTimes(2)
  })

  /* Un timer vivo después de desmontar llamaría a setState sobre un componente
     que ya no existe, y además seguiría pegándole al backend al cambiar de
     pantalla. */
  it('corta el ciclo al desmontar', async () => {
    const tarea = vi.fn().mockResolvedValue(undefined)
    const { result, unmount } = renderHook(() => usePolling({ tarea, base: 5000 }))

    await act(async () => {
      result.current.iniciar()
    })
    expect(tarea).toHaveBeenCalledTimes(1)

    unmount()
    await avanzar(60000)
    expect(tarea).toHaveBeenCalledTimes(1)
  })

  /* Con setInterval, una lectura lenta se solapaba con la siguiente y se
     encolaban peticiones contra un servicio que ya no daba abasto. */
  it('no lanza una lectura mientras la anterior sigue en vuelo', async () => {
    let resolver: (() => void) | null = null
    const tarea = vi.fn().mockImplementation(
      () =>
        new Promise<void>((res) => {
          resolver = () => res()
        }),
    )
    const { result } = renderHook(() => usePolling({ tarea, base: 5000 }))

    await act(async () => {
      result.current.iniciar()
    })
    expect(tarea).toHaveBeenCalledTimes(1)

    /* La tarea sigue pendiente: por mucho que avance el reloj, no hay segunda. */
    await avanzar(30000)
    expect(tarea).toHaveBeenCalledTimes(1)

    await act(async () => {
      resolver?.()
    })
    await avanzar(5000)
    expect(tarea).toHaveBeenCalledTimes(2)
  })
})
