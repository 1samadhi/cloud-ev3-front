import { NavLink, Outlet } from 'react-router-dom'
import { useHealth, type Servicio } from '../hooks/useHealth'
import { Dot } from './ui'
import './Shell.css'

type Entrada = { a: string; etiqueta: string; puerto: string; servicio: Servicio | null }

const NAV: Entrada[] = [
  { a: '/pagos', etiqueta: 'Pagos', puerto: ':8083', servicio: 'pagos' },
  { a: '/recomendaciones', etiqueta: 'Recomendaciones', puerto: ':8084', servicio: 'recomendaciones' },
  { a: '/operaciones', etiqueta: 'Operaciones', puerto: 'wss', servicio: null },
  { a: '/kafka', etiqueta: 'Kafka', puerto: ':8085', servicio: 'admin' },
]

export function Shell() {
  const { salud } = useHealth()

  const estadoDe = (s: Servicio | null) => {
    if (s === null) return 'neutral' as const
    const v = salud[s]
    return v === null ? ('neutral' as const) : v ? ('ok' as const) : ('bad' as const)
  }

  const vivos = Object.values(salud).filter((v) => v === true).length
  const resueltos = Object.values(salud).filter((v) => v !== null).length

  return (
    <div className="shell">
      <nav className="nav" aria-label="Secciones">
        <div className="nav__brand">
          <span className="nav__logo" aria-hidden="true">
            P
          </span>
          <span>
            <strong>Pedidos360</strong>
            <small>DSY1107 · EV3</small>
          </span>
        </div>

        <ul className="nav__list">
          {NAV.map((e) => (
            <li key={e.a}>
              <NavLink to={e.a} className={({ isActive }) => `nav__link${isActive ? ' nav__link--on' : ''}`}>
                <Dot estado={estadoDe(e.servicio)} />
                <span className="grow">{e.etiqueta}</span>
                <span className="nav__port">{e.puerto}</span>
              </NavLink>
            </li>
          ))}
        </ul>

        <div className="nav__foot">
          <span className="nav__footlabel">Microservicios</span>
          <span className="nav__footvalue">
            {resueltos === 0 ? 'comprobando…' : `${vivos} de 3 responden`}
          </span>
        </div>
      </nav>

      <main className="main">
        <Outlet />
      </main>
    </div>
  )
}

export function PageHeader({
  titulo,
  bajada,
  accion,
}: {
  titulo: string
  bajada: string
  accion?: React.ReactNode
}) {
  return (
    <header className="page-head">
      <div>
        <h1 className="page-head__title">{titulo}</h1>
        <p className="page-head__sub">{bajada}</p>
      </div>
      {accion && <div className="page-head__accion">{accion}</div>}
    </header>
  )
}
