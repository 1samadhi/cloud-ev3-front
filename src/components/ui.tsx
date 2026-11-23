import type { ReactNode } from 'react'
import './ui.css'

/* ---------------------------------------------------------------------------
   Primitivas de UI. Viven juntas a propósito: son pocas, cortas y se usan en
   todas las pantallas, así que un archivo evita quince imports por pantalla.
   ------------------------------------------------------------------------- */

export type Estado = 'ok' | 'bad' | 'warn' | 'neutral'

export function Badge({ estado = 'neutral', children }: { estado?: Estado; children: ReactNode }) {
  return <span className={`badge badge--${estado}`}>{children}</span>
}

export function Dot({ estado = 'neutral' }: { estado?: Estado }) {
  return <span className={`dot dot--${estado}`} aria-hidden="true" />
}

export function Button({
  children,
  variante = 'ghost',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variante?: 'primario' | 'ghost' | 'peligro' }) {
  return (
    <button className={`btn btn--${variante}`} {...props}>
      {children}
    </button>
  )
}

export function Field({
  etiqueta,
  hint,
  children,
  ancho,
}: {
  etiqueta: string
  hint?: string
  children: ReactNode
  ancho?: number | string
}) {
  return (
    <label className="field" style={ancho ? { width: ancho, flex: 'none' } : undefined}>
      <span className="field__label">{etiqueta}</span>
      {children}
      {hint && <span className="field__hint">{hint}</span>}
    </label>
  )
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className="input" {...props} />
}

export function Card({
  titulo,
  accion,
  children,
  descripcion,
}: {
  titulo?: string
  descripcion?: string
  accion?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="card">
      {(titulo || accion) && (
        <header className="card__head">
          <div>
            {titulo && <h3 className="card__title">{titulo}</h3>}
            {descripcion && <p className="card__desc">{descripcion}</p>}
          </div>
          {accion}
        </header>
      )}
      <div className="card__body">{children}</div>
    </section>
  )
}

export function Metric({
  etiqueta,
  valor,
  sufijo,
  nota,
  estado,
}: {
  etiqueta: string
  valor: ReactNode
  sufijo?: string
  nota?: string
  estado?: Estado
}) {
  return (
    <div className="metric">
      <span className="metric__label">{etiqueta}</span>
      <span className={`metric__value${estado ? ` metric__value--${estado}` : ''}`}>
        {valor}
        {sufijo && <small>{sufijo}</small>}
      </span>
      {nota && <span className="metric__note">{nota}</span>}
    </div>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>
}

export function Notice({
  estado = 'neutral',
  titulo,
  children,
  onCerrar,
}: {
  estado?: Estado
  titulo: string
  children?: ReactNode
  onCerrar?: () => void
}) {
  return (
    <div className={`notice notice--${estado}`} role={estado === 'bad' ? 'alert' : 'status'}>
      <div className="grow">
        <strong>{titulo}</strong>
        {children && <div className="notice__body">{children}</div>}
      </div>
      {onCerrar && (
        <button className="notice__close" onClick={onCerrar} aria-label="Cerrar aviso">
          ×
        </button>
      )}
    </div>
  )
}

export function Table({ cols, children }: { cols: (string | { t: string; num?: boolean })[]; children: ReactNode }) {
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            {cols.map((c) => {
              const col = typeof c === 'string' ? { t: c, num: false } : c
              return (
                <th key={col.t} className={col.num ? 'num' : undefined}>
                  {col.t}
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  )
}

export function Spinner({ label = 'Cargando' }: { label?: string }) {
  return (
    <span className="spinner" role="status">
      <span className="sr-only">{label}</span>
    </span>
  )
}

export function Bar({ valor, max }: { valor: number; max: number }) {
  const ancho = max <= 0 ? 0 : Math.min(100, (valor / max) * 100)
  return (
    <span className="bar" aria-hidden="true">
      <span className="bar__fill" style={{ width: `${ancho}%` }} />
    </span>
  )
}
