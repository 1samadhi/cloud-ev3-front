import { useCallback, useEffect, useRef, useState } from 'react'
import { debeRendirse, siguienteEspera, ESPERA_BASE_MS, FALLOS_PARA_RENDIRSE } from '../lib/backoff'

export type EstadoPolling = {
  /** true mientras el ciclo está programado, aunque ahora mismo esté esperando. */
  activo: boolean
  /** fallos consecutivos; vuelve a 0 después de una lectura exitosa. */
  fallos: number
  /** espera que se aplicará antes del próximo intento. */
  esperaMs: number
  /** el ciclo se detuvo solo, por fallos consecutivos. */
  rendido: boolean
}

type Opciones = {
  /** La tarea debe LANZAR para que el fallo cuente; resolver es éxito. */
  tarea: () => Promise<void>
  base?: number
  max?: number
  maxFallos?: number
  /** Mensajes para el registro de la pantalla. */
  onAviso?: (mensaje: string, nivel: 'info' | 'ok' | 'error') => void
}

/* ---------------------------------------------------------------------------
   Lectura periódica con espera creciente.

   Se reprograma un setTimeout en lugar de usar setInterval porque la espera
   cambia entre iteraciones: un setInterval habría que destruirlo y recrearlo
   igual, y además dispara la lectura siguiente aunque la anterior siga en
   vuelo, encolando peticiones contra un servicio que ya no responde.
   ------------------------------------------------------------------------- */
export function usePolling({
  tarea,
  base = ESPERA_BASE_MS,
  max,
  maxFallos = FALLOS_PARA_RENDIRSE,
  onAviso,
}: Opciones) {
  const [estado, setEstado] = useState<EstadoPolling>({
    activo: false,
    fallos: 0,
    esperaMs: base,
    rendido: false,
  })

  const timer = useRef<number | null>(null)
  const corriendo = useRef(false)
  const fallos = useRef(0)

  /* La tarea y el callback de avisos viven en refs: son clausuras sobre el
     estado de la pantalla y cambian en cada render, pero cambiar de identidad
     no debe reiniciar el ciclo.

     La asignación va en un efecto y no en el cuerpo del componente: escribir un
     ref durante el render es un efecto secundario en fase de render, que React
     puede descartar o repetir. */
  const tareaRef = useRef(tarea)
  const avisoRef = useRef(onAviso)
  useEffect(() => {
    tareaRef.current = tarea
    avisoRef.current = onAviso
  })

  /* El ciclo se referencia a sí mismo para reprogramarse. Guardarlo en un ref
     evita leer la constante mientras todavía se está inicializando. */
  const cicloRef = useRef<() => Promise<void>>(async () => {})

  const limpiarTimer = () => {
    if (timer.current !== null) {
      clearTimeout(timer.current)
      timer.current = null
    }
  }

  const detener = useCallback(() => {
    corriendo.current = false
    limpiarTimer()
    fallos.current = 0
    setEstado({ activo: false, fallos: 0, esperaMs: base, rendido: false })
  }, [base])

  const ciclo = useCallback(async () => {
    if (!corriendo.current) return

    let espera: number

    try {
      await tareaRef.current()
      if (!corriendo.current) return

      if (fallos.current > 0) {
        avisoRef.current?.('los servicios responden de nuevo, se vuelve al intervalo normal', 'ok')
      }
      fallos.current = 0
      espera = siguienteEspera(0, base, max)
      setEstado({ activo: true, fallos: 0, esperaMs: espera, rendido: false })
    } catch (e) {
      if (!corriendo.current) return

      fallos.current += 1
      espera = siguienteEspera(fallos.current, base, max)

      if (debeRendirse(fallos.current, maxFallos)) {
        corriendo.current = false
        limpiarTimer()
        avisoRef.current?.(`${fallos.current} fallos seguidos: se detiene la lectura automática`, 'error')
        setEstado({ activo: false, fallos: fallos.current, esperaMs: espera, rendido: true })
        return
      }

      /* Se registra el reintento, no el error completo en cada vuelta: el
         detalle ya lo escribió la tarea y repetirlo tapa el resto del registro. */
      avisoRef.current?.(
        `fallo ${fallos.current}/${maxFallos} (${(e as Error).message}); próximo intento en ${Math.round(espera / 1000)} s`,
        'error',
      )
      setEstado({ activo: true, fallos: fallos.current, esperaMs: espera, rendido: false })
    }

    if (!corriendo.current) return
    limpiarTimer()
    timer.current = window.setTimeout(() => void cicloRef.current(), espera)
  }, [base, max, maxFallos])

  useEffect(() => {
    cicloRef.current = ciclo
  }, [ciclo])

  const iniciar = useCallback(() => {
    if (corriendo.current) return
    corriendo.current = true
    fallos.current = 0
    setEstado({ activo: true, fallos: 0, esperaMs: base, rendido: false })
    void ciclo()
  }, [ciclo, base])

  /* Al desmontar la pantalla hay que cortar el ciclo: un setTimeout vivo
     seguiría llamando a setState sobre un componente que ya no existe. */
  useEffect(() => detener, [detener])

  return { ...estado, iniciar, detener }
}
