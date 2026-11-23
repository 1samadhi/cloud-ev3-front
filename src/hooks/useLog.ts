import { useCallback, useRef, useState } from 'react'

export type NivelLog = 'info' | 'ok' | 'error'
export type LineaLog = { id: number; hora: string; texto: string; nivel: NivelLog }

const MAX_LINEAS = 150

/* El registro es la evidencia de la demo: hay que poder leer qué se pidió y qué
   respondió cada servicio. Se poda a 150 líneas para no inflar el DOM. */
export function useLog() {
  const [lineas, setLineas] = useState<LineaLog[]>([])
  const siguienteId = useRef(0)

  const log = useCallback((texto: string, nivel: NivelLog = 'info') => {
    setLineas((prev) => {
      const linea: LineaLog = {
        id: siguienteId.current++,
        hora: new Date().toLocaleTimeString('es-CL', { hour12: false }),
        texto,
        nivel,
      }
      const siguiente = [...prev, linea]
      return siguiente.length > MAX_LINEAS ? siguiente.slice(-MAX_LINEAS) : siguiente
    })
  }, [])

  const limpiar = useCallback(() => setLineas([]), [])

  return { lineas, log, limpiar }
}
