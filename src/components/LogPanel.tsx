import { useEffect, useRef } from 'react'
import type { LineaLog } from '../hooks/useLog'
import './LogPanel.css'

export function LogPanel({ lineas, onLimpiar }: { lineas: LineaLog[]; onLimpiar?: () => void }) {
  const caja = useRef<HTMLDivElement>(null)

  /* Auto-scroll solo si el usuario ya estaba al final: si subió a leer algo,
     una línea nueva no debe arrastrarlo de vuelta. */
  useEffect(() => {
    const el = caja.current
    if (!el) return
    const alFinal = el.scrollHeight - el.scrollTop - el.clientHeight < 40
    if (alFinal) el.scrollTop = el.scrollHeight
  }, [lineas])

  return (
    <div className="log">
      <div className="log__head">
        <span className="log__title">Registro</span>
        <span className="log__count">{lineas.length}</span>
        {onLimpiar && lineas.length > 0 && (
          <button className="log__clear" onClick={onLimpiar}>
            limpiar
          </button>
        )}
      </div>
      <div className="log__body" ref={caja} role="log" aria-live="polite">
        {lineas.length === 0 ? (
          <div className="log__vacio">sin actividad todavía</div>
        ) : (
          lineas.map((l) => (
            <div key={l.id} className={`log__line log__line--${l.nivel}`}>
              <span className="log__hora">{l.hora}</span>
              <span className="log__texto">{l.texto}</span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
