import { useCallback, useEffect, useState } from 'react'
import { API } from '../config'
import { salud as pedirSalud } from '../lib/api'
import type { EstadoActuator } from '../lib/types'

export type Servicio = 'pagos' | 'recomendaciones' | 'admin'

/** `null` = todavía no se sabe; `degradado` = responde pero una dependencia está caída. */
export type Estado = 'arriba' | 'degradado' | 'caido' | null

export type EstadoSalud = Record<Servicio, Estado>
export type DetalleSalud = Record<Servicio, EstadoActuator | null>

/* ---------------------------------------------------------------------------
   Estado de los servicios leído de /actuator/health.

   Antes se sondeaba un endpoint de negocio por servicio (y antes de eso, un
   POST /api/pagos/iniciar con cliente vacío para provocar un 400). Funcionaba,
   pero mezclaba el monitoreo con la operación: ensuciaba los logs, dependía de
   que la validación siguiera rechazando ese cuerpo y no distinguía "el servicio
   responde" de "el servicio puede trabajar".

   Actuator separa las dos cosas: un 200 con status UP es un servicio sano, y un
   503 con status DOWN es un servicio vivo pero con una dependencia caída (la
   base, o el clúster de Kafka en el caso del administrador). Eso se muestra
   como "degradado" y no como "caído", porque para diagnosticar no es lo mismo.
   ------------------------------------------------------------------------- */
const BASES: Record<Servicio, string> = {
  pagos: API.pagos,
  recomendaciones: API.recomendaciones,
  admin: API.admin,
}

async function sondear(servicio: Servicio): Promise<{ estado: Estado; detalle: EstadoActuator | null }> {
  try {
    const cuerpo = await pedirSalud(BASES[servicio])
    return { estado: cuerpo.status === 'UP' ? 'arriba' : 'degradado', detalle: cuerpo }
  } catch (e) {
    const err = e as { status?: number; body?: unknown }

    /* Un 503 de Actuator ES la respuesta de health cuando algún componente está
       DOWN, y trae el detalle en el cuerpo: el servicio está vivo. */
    if (err.status === 503 && err.body && typeof err.body === 'object') {
      return { estado: 'degradado', detalle: err.body as EstadoActuator }
    }

    /* Cualquier otra respuesta HTTP también prueba que el proceso atiende; sólo
       un fallo de red (status 0) significa que no está. */
    if (err.status != null && err.status !== 0) {
      return { estado: 'degradado', detalle: null }
    }

    return { estado: 'caido', detalle: null }
  }
}

export function useHealth(intervaloMs = 20000) {
  const [salud, setSalud] = useState<EstadoSalud>({ pagos: null, recomendaciones: null, admin: null })
  const [detalle, setDetalle] = useState<DetalleSalud>({ pagos: null, recomendaciones: null, admin: null })

  const revisar = useCallback(async () => {
    const [p, r, a] = await Promise.all([sondear('pagos'), sondear('recomendaciones'), sondear('admin')])
    setSalud({ pagos: p.estado, recomendaciones: r.estado, admin: a.estado })
    setDetalle({ pagos: p.detalle, recomendaciones: r.detalle, admin: a.detalle })
  }, [])

  useEffect(() => {
    void revisar()
    const t = setInterval(() => void revisar(), intervaloMs)
    return () => clearInterval(t)
  }, [revisar, intervaloMs])

  return { salud, detalle, revisar }
}
