import { useCallback, useEffect, useState } from 'react'
import { admin, pagos, recomendaciones } from '../lib/api'

export type Servicio = 'pagos' | 'recomendaciones' | 'admin'
export type EstadoSalud = Record<Servicio, boolean | null>

/* Se sondea con GET idempotentes y baratos. La consola anterior disparaba un
   POST /api/pagos/iniciar con cliente vacío cada 15 s para provocar un 400:
   funcionaba, pero escribía ruido en los logs del servicio y dependía de que la
   validación siguiera rechazando ese cuerpo. GET /api/alertas, /api/metricas y
   /api/cluster son lecturas puras y tienen CORS por el mapeo /api/**.
   Un 4xx también significa "vivo": solo un fallo de red cuenta como caído, y
   eso lo distingue ApiError.esDeRed. */
const SONDAS: Record<Servicio, () => Promise<unknown>> = {
  pagos: () => pagos.alertas(),
  recomendaciones: () => recomendaciones.metricas(),
  admin: () => admin.cluster(),
}

async function sondear(servicio: Servicio): Promise<boolean> {
  try {
    await SONDAS[servicio]()
    return true
  } catch (e) {
    const status = (e as { status?: number }).status
    return status != null && status !== 0
  }
}

export function useHealth(intervaloMs = 20000) {
  const [salud, setSalud] = useState<EstadoSalud>({ pagos: null, recomendaciones: null, admin: null })

  const revisar = useCallback(async () => {
    const [p, r, a] = await Promise.all([sondear('pagos'), sondear('recomendaciones'), sondear('admin')])
    setSalud({ pagos: p, recomendaciones: r, admin: a })
  }, [])

  useEffect(() => {
    void revisar()
    const t = setInterval(() => void revisar(), intervaloMs)
    return () => clearInterval(t)
  }, [revisar, intervaloMs])

  return { salud, revisar }
}
