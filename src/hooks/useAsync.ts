import { useCallback, useState } from 'react'
import { ApiError } from '../lib/api'

type Estado<T> = {
  datos: T | null
  cargando: boolean
  error: string | null
  esDeRed: boolean
}

/* Envuelve una llamada a la API y expone los tres estados que toda pantalla
   necesita pintar: cargando, error y datos. Evita repetir try/catch/setState. */
export function useAsync<T, A extends unknown[] = []>(fn: (...args: A) => Promise<T>) {
  const [estado, setEstado] = useState<Estado<T>>({ datos: null, cargando: false, error: null, esDeRed: false })

  const ejecutar = useCallback(
    async (...args: A): Promise<T | null> => {
      setEstado((s) => ({ ...s, cargando: true, error: null }))
      try {
        const datos = await fn(...args)
        setEstado({ datos, cargando: false, error: null, esDeRed: false })
        return datos
      } catch (e) {
        const err = e instanceof ApiError ? e : new ApiError(0, e instanceof Error ? e.message : 'error desconocido')
        setEstado((s) => ({ ...s, cargando: false, error: err.message, esDeRed: err.esDeRed }))
        return null
      }
    },
    [fn],
  )

  const limpiarError = useCallback(() => setEstado((s) => ({ ...s, error: null })), [])

  return { ...estado, ejecutar, limpiarError }
}
