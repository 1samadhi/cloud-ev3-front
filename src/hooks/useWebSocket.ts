import { useCallback, useEffect, useRef, useState } from 'react'
import { FALLOS_PARA_RENDIRSE, siguienteEspera } from '../lib/backoff'

export type EstadoWs = 'cerrado' | 'conectando' | 'conectado' | 'reconectando' | 'rendido'

type Opciones = {
  /** Se llama con cada mensaje ya parseado como JSON. */
  onMensaje: (payload: unknown) => void
  onAviso?: (mensaje: string, nivel: 'info' | 'ok' | 'error') => void
  base?: number
  max?: number
  maxIntentos?: number
}

/* ---------------------------------------------------------------------------
   Conexión WebSocket con reconexión automática.

   API Gateway cierra la conexión a los 10 minutos de inactividad. Sin
   reconexión, un tablero que se deja abierto durante la presentación deja de
   recibir datos en silencio: el cierre no es un error, así que nada lo delata
   hasta que alguien nota que los números no se mueven.

   La espera entre reintentos reutiliza la progresión de lib/backoff, la misma
   de la lectura directa: si el endpoint ya no existe (la infraestructura se
   recreó y cambió la URL), insistir cada segundo no lo va a resucitar.
   ------------------------------------------------------------------------- */
export function useWebSocket({
  onMensaje,
  onAviso,
  base = 2000,
  max = 30000,
  maxIntentos = FALLOS_PARA_RENDIRSE,
}: Opciones) {
  const [estado, setEstado] = useState<EstadoWs>('cerrado')
  const [intentos, setIntentos] = useState(0)

  const socket = useRef<WebSocket | null>(null)
  const timer = useRef<number | null>(null)
  const url = useRef<string>('')

  /* Distingue un cierre pedido por el usuario de una caída: sin esta marca,
     pulsar "Desconectar" dispararía la reconexión automática. */
  const cierreIntencional = useRef(false)
  const reintentos = useRef(0)

  const onMensajeRef = useRef(onMensaje)
  const avisoRef = useRef(onAviso)
  useEffect(() => {
    onMensajeRef.current = onMensaje
    avisoRef.current = onAviso
  })

  /* El ciclo de reconexión se llama a sí mismo a través de este ref, que se
     asigna en un efecto para no escribir refs durante el render. El timeout que
     lo usa nunca corre antes del primer efecto. */
  const abrirRef = useRef<(destino: string) => void>(() => {})

  const limpiarTimer = () => {
    if (timer.current !== null) {
      clearTimeout(timer.current)
      timer.current = null
    }
  }

  const cerrarSocket = useCallback(() => {
    const s = socket.current
    if (s) {
      /* Se desarman los handlers antes de cerrar: onclose dispararía la
         reconexión del socket que acabamos de descartar. */
      s.onopen = null
      s.onmessage = null
      s.onclose = null
      s.onerror = null
      s.close()
      socket.current = null
    }
  }, [])

  const desconectar = useCallback(() => {
    cierreIntencional.current = true
    limpiarTimer()
    cerrarSocket()
    reintentos.current = 0
    setIntentos(0)
    setEstado('cerrado')
  }, [cerrarSocket])

  const programarReconexion = useCallback(() => {
    reintentos.current += 1
    setIntentos(reintentos.current)

    if (reintentos.current > maxIntentos) {
      avisoRef.current?.(
        `${maxIntentos} reintentos sin éxito: se deja de reconectar`,
        'error',
      )
      setEstado('rendido')
      return
    }

    const espera = siguienteEspera(reintentos.current, base, max)
    avisoRef.current?.(
      `conexión perdida; reintento ${reintentos.current}/${maxIntentos} en ${Math.round(espera / 1000)} s`,
      'error',
    )
    setEstado('reconectando')

    limpiarTimer()
    timer.current = window.setTimeout(() => abrirRef.current(url.current), espera)
  }, [base, max, maxIntentos])

  const abrir = useCallback(
    (destino: string) => {
      limpiarTimer()
      cerrarSocket()
      cierreIntencional.current = false
      url.current = destino
      setEstado(reintentos.current > 0 ? 'reconectando' : 'conectando')

      /* El clientId se renueva en cada intento: API Gateway entrega un
         connectionId nuevo, y reusar el anterior haría que los registros de la
         tabla de conexiones no se correspondan con la conexión viva. */
      const clientId = `operaciones_${Date.now()}`

      let s: WebSocket
      try {
        s = new WebSocket(`${destino}?clientId=${encodeURIComponent(clientId)}`)
      } catch (e) {
        /* Una URL mal formada lanza de forma sincrónica, sin pasar por onerror. */
        avisoRef.current?.(`no se pudo abrir el socket: ${(e as Error).message}`, 'error')
        programarReconexion()
        return
      }

      socket.current = s

      s.onopen = () => {
        if (reintentos.current > 0) {
          avisoRef.current?.('conexión recuperada', 'ok')
        } else {
          avisoRef.current?.(`conexión establecida con clientId=${clientId}`, 'ok')
        }
        reintentos.current = 0
        setIntentos(0)
        setEstado('conectado')
      }

      s.onmessage = (ev) => {
        try {
          onMensajeRef.current(JSON.parse(String(ev.data)))
        } catch (e) {
          avisoRef.current?.(`JSON inválido: ${(e as Error).message}`, 'error')
        }
      }

      s.onclose = () => {
        socket.current = null
        if (cierreIntencional.current) {
          setEstado('cerrado')
          return
        }
        /* Un cierre que no pidió el usuario es el caso de los 10 minutos de
           inactividad de API Gateway, o la red cortándose. */
        programarReconexion()
      }

      s.onerror = () => {
        /* onerror siempre viene seguido de onclose, que es donde se decide la
           reconexión: acá sólo se deja rastro para el registro. */
        avisoRef.current?.('error de WebSocket', 'error')
      }
    },
    [cerrarSocket, programarReconexion],
  )

  const conectar = useCallback(
    (destino: string) => {
      reintentos.current = 0
      setIntentos(0)
      abrir(destino)
    },
    [abrir],
  )

  useEffect(() => {
    abrirRef.current = abrir
  }, [abrir])

  useEffect(() => desconectar, [desconectar])

  return { estado, intentos, conectar, desconectar }
}
