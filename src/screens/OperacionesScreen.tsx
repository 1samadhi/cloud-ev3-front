import { useCallback, useEffect, useRef, useState } from 'react'
import { LogPanel } from '../components/LogPanel'
import { PageHeader } from '../components/Shell'
import { Badge, Bar, Button, Card, Empty, Field, Input, Metric, Table } from '../components/ui'
import { WS_URL } from '../config'
import { useLog } from '../hooks/useLog'
import { pagos, recomendaciones } from '../lib/api'
import { fechaHora, num } from '../lib/format'
import type { Metricas, ResumenAlertas } from '../lib/types'

const INTERVALO_POLL_MS = 5000

type Fuente = 'nada' | 'poll' | 'ws'

export function OperacionesScreen() {
  const [url, setUrl] = useState(WS_URL)
  const [fuente, setFuente] = useState<Fuente>('nada')
  const [metricas, setMetricas] = useState<Metricas | null>(null)
  const [alertas, setAlertas] = useState<ResumenAlertas | null>(null)
  const { lineas, log, limpiar } = useLog()

  const ws = useRef<WebSocket | null>(null)
  const timer = useRef<number | null>(null)

  /* Lectura directa de los microservicios: las mismas métricas que después
     llegan empujadas por el WebSocket. Permite trabajar el tablero sin AWS. */
  const leerDeServicios = useCallback(async () => {
    const [m, a] = await Promise.allSettled([recomendaciones.metricas(), pagos.alertas()])
    if (m.status === 'fulfilled') setMetricas(m.value)
    else log(`métricas: ${(m.reason as Error).message}`, 'error')
    if (a.status === 'fulfilled') setAlertas(a.value)
    else log(`alertas: ${(a.reason as Error).message}`, 'error')
  }, [log])

  const detener = useCallback(() => {
    if (timer.current !== null) {
      clearInterval(timer.current)
      timer.current = null
    }
    if (ws.current) {
      ws.current.onclose = null
      ws.current.close()
      ws.current = null
    }
    setFuente('nada')
  }, [])

  useEffect(() => detener, [detener])

  function alternarPoll() {
    if (fuente === 'poll') {
      detener()
      log('lectura periódica detenida')
      return
    }
    detener()
    setFuente('poll')
    log(`leyendo de :8084/api/metricas y :8083/api/alertas cada ${INTERVALO_POLL_MS / 1000} s`, 'ok')
    void leerDeServicios()
    timer.current = window.setInterval(() => void leerDeServicios(), INTERVALO_POLL_MS)
  }

  /* El broadcast de la Lambda llega como ARRAY de lecturas (envío por lotes),
     no de una en una, y cada elemento puede ser métricas o alerta. */
  function recibirLote(payload: unknown) {
    const lote = Array.isArray(payload) ? payload : [payload]
    for (const ev of lote) {
      if (!ev || typeof ev !== 'object') continue
      const o = ev as Record<string, unknown>
      if (o.tipo === 'metricas' || 'productosMasVistos' in o) setMetricas(o as unknown as Metricas)
      else if (o.tipo === 'alerta' || 'bloqueosActivos' in o) setAlertas(o as unknown as ResumenAlertas)
      else log(`evento de tipo desconocido: ${JSON.stringify(o).slice(0, 90)}`)
    }
  }

  function conectar() {
    const destino = url.trim()
    /* El navegador conecta con wss://; la Lambda usa https:// contra el mismo
       endpoint para postToConnection. Son dos esquemas de la misma API. */
    if (!/^wss?:\/\//.test(destino)) {
      log('la URL debe empezar con wss:// (o ws:// en pruebas locales)', 'error')
      return
    }
    detener()
    const clientId = `operaciones_${Date.now()}`
    log(`conectando con clientId=${clientId}`)
    const socket = new WebSocket(`${destino}?clientId=${encodeURIComponent(clientId)}`)
    ws.current = socket
    socket.onopen = () => {
      setFuente('ws')
      log('conexión establecida', 'ok')
    }
    socket.onmessage = (ev) => {
      log(`lote recibido: ${String(ev.data).slice(0, 110)}`)
      try {
        recibirLote(JSON.parse(String(ev.data)))
      } catch (e) {
        log(`JSON inválido: ${(e as Error).message}`, 'error')
      }
    }
    socket.onclose = () => {
      setFuente('nada')
      ws.current = null
      log('conexión cerrada')
    }
    socket.onerror = () => log('error de WebSocket', 'error')
  }

  const vistos = metricas?.productosMasVistos ?? []
  const maxVistas = vistos.length > 0 ? Math.max(...vistos.map((v) => v.vistas)) : 0

  const etiquetaFuente =
    fuente === 'ws' ? 'WebSocket conectado' : fuente === 'poll' ? 'lectura directa activa' : 'sin fuente de datos'

  return (
    <div className="stack">
      <PageHeader
        titulo="Operaciones en tiempo real"
        bajada="Pulso de la tienda: qué se mira, cuánto se mueve y qué se bloquea. Los datos llegan empujados por API Gateway o se leen directo de los microservicios."
        accion={<Badge estado={fuente === 'nada' ? 'bad' : 'ok'}>{etiquetaFuente}</Badge>}
      />

      <Card
        titulo="Fuente de datos"
        descripcion="El endpoint de API Gateway cambia cada vez que se recrea la infraestructura, por eso no está fijo en el código."
      >
        <div className="row">
          <div className="grow" style={{ minWidth: 280 }}>
            <Field etiqueta="Endpoint WebSocket">
              <Input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="wss://xxxx.execute-api.us-east-1.amazonaws.com/production"
              />
            </Field>
          </div>
          <Button variante="primario" onClick={conectar} disabled={fuente === 'ws'}>
            Conectar
          </Button>
          <Button onClick={detener} disabled={fuente === 'nada'}>
            Desconectar
          </Button>
          <Button onClick={alternarPoll}>{fuente === 'poll' ? 'Detener lectura' : 'Leer de los servicios'}</Button>
        </div>
      </Card>

      <div className="metrics">
        <Metric etiqueta="Interacciones por minuto" valor={num(metricas?.interaccionesPorMinuto)} />
        <Metric etiqueta="Usuarios activos" valor={num(metricas?.usuariosActivos)} sufijo="5 min" />
        <Metric etiqueta="Interacciones totales" valor={num(metricas?.totalInteracciones)} />
        <Metric
          etiqueta="Bloqueos de fraude"
          valor={alertas?.bloqueosActivos ?? '—'}
          estado={alertas && alertas.bloqueosActivos > 0 ? 'bad' : undefined}
        />
      </div>

      <div className="grid-2">
        <Card titulo="Productos más vistos" descripcion="Agregado por el consumidor de interacciones-user.">
          {vistos.length === 0 ? (
            <Empty>Sin datos. Conectá el WebSocket o leé de los servicios.</Empty>
          ) : (
            <Table cols={['Producto', 'Categoría', { t: 'Interacciones', num: true }, '']}>
              {vistos.map((p) => (
                <tr key={p.itemId}>
                  <td>
                    <strong style={{ fontWeight: 510, color: 'var(--ink)' }}>{p.nombre || p.itemId}</strong>
                  </td>
                  <td>{p.categoria || '—'}</td>
                  <td className="num">{num(p.vistas)}</td>
                  <td style={{ width: 90 }}>
                    <Bar valor={p.vistas} max={maxVistas} />
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </Card>

        <Card titulo="Alertas de fraude" descripcion="Clientes bloqueados por la regla de velocidad de intentos.">
          {!alertas || alertas.alertas.length === 0 ? (
            <Empty>Sin bloqueos vigentes.</Empty>
          ) : (
            <Table cols={['Cliente', { t: 'Intentos', num: true }, { t: 'Expira en', num: true }, 'Detectado']}>
              {alertas.alertas.map((a) => (
                <tr key={a.idCliente}>
                  <td className="mono">{a.idCliente}</td>
                  <td className="num">{a.cantidadIntentos}</td>
                  <td className="num">{a.minutosRestantes > 0 ? `${a.minutosRestantes} min` : '—'}</td>
                  <td className="mono muted">{fechaHora(a.actualizadoEn)}</td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
      </div>

      <LogPanel lineas={lineas} onLimpiar={limpiar} />
    </div>
  )
}
