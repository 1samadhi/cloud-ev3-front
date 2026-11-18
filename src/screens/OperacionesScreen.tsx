import { useCallback, useEffect, useRef, useState } from 'react'
import { LogPanel } from '../components/LogPanel'
import { PageHeader } from '../components/Shell'
import { Badge, Bar, Button, Card, Empty, Field, Input, Metric, Notice, Table } from '../components/ui'
import { WS_URL } from '../config'
import { useLog } from '../hooks/useLog'
import { usePolling } from '../hooks/usePolling'
import { useWebSocket } from '../hooks/useWebSocket'
import { pagos, recomendaciones } from '../lib/api'
import { describirEspera } from '../lib/backoff'
import { fechaHora, num } from '../lib/format'
import type { Metricas, ResumenAlertas } from '../lib/types'

type Fuente = 'nada' | 'poll' | 'ws'

export function OperacionesScreen() {
  const [url, setUrl] = useState(WS_URL)
  const [fuente, setFuente] = useState<Fuente>('nada')
  const [metricas, setMetricas] = useState<Metricas | null>(null)
  const [alertas, setAlertas] = useState<ResumenAlertas | null>(null)
  const { lineas, log, limpiar } = useLog()

  /* Último error registrado por servicio. Sin esto, un servicio caído escribe
     la misma línea en cada vuelta y el registro deja de servir para ver qué
     pasó: sólo se anota cuando el mensaje CAMBIA. */
  const ultimoError = useRef<Record<string, string>>({})

  const registrarFallo = useCallback(
    (servicio: string, mensaje: string) => {
      if (ultimoError.current[servicio] !== mensaje) {
        ultimoError.current[servicio] = mensaje
        log(`${servicio}: ${mensaje}`, 'error')
      }
    },
    [log],
  )

  /* Lectura directa de los microservicios: las mismas métricas que después
     llegan empujadas por el WebSocket. Permite trabajar el tablero sin AWS.

     Lanza sólo si fallan LOS DOS: con uno vivo el tablero sigue sirviendo, así
     que no corresponde castigar el intervalo por una caída parcial. */
  const leerDeServicios = useCallback(async () => {
    const [m, a] = await Promise.allSettled([recomendaciones.metricas(), pagos.alertas()])

    if (m.status === 'fulfilled') {
      setMetricas(m.value)
      delete ultimoError.current.metricas
    } else {
      registrarFallo('metricas', (m.reason as Error).message)
    }

    if (a.status === 'fulfilled') {
      setAlertas(a.value)
      delete ultimoError.current.alertas
    } else {
      registrarFallo('alertas', (a.reason as Error).message)
    }

    if (m.status === 'rejected' && a.status === 'rejected') {
      throw new Error('ningún servicio respondió')
    }
  }, [registrarFallo])

  const poll = usePolling({ tarea: leerDeServicios, onAviso: log })

  /* El broadcast de la Lambda llega como ARRAY de lecturas (envío por lotes),
     no de una en una, y cada elemento puede ser métricas o alerta. */
  const recibirLote = useCallback((payload: unknown) => {
    const lote = Array.isArray(payload) ? payload : [payload]
    for (const ev of lote) {
      if (!ev || typeof ev !== 'object') continue
      const o = ev as Record<string, unknown>
      if (o.tipo === 'metricas' || 'productosMasVistos' in o) setMetricas(o as unknown as Metricas)
      else if (o.tipo === 'alerta' || 'bloqueosActivos' in o) setAlertas(o as unknown as ResumenAlertas)
      else log(`evento de tipo desconocido: ${JSON.stringify(o).slice(0, 90)}`)
    }
  }, [log])

  const ws = useWebSocket({ onMensaje: recibirLote, onAviso: log })

  const detener = useCallback(() => {
    poll.detener()
    ws.desconectar()
    ultimoError.current = {}
    setFuente('nada')
  }, [poll, ws])

  /* Cuando el ciclo se rinde solo, la pantalla tiene que dejar de anunciar
     "lectura directa activa". */
  useEffect(() => {
    if (poll.rendido) setFuente('nada')
  }, [poll.rendido])

  function alternarPoll() {
    if (fuente === 'poll') {
      poll.detener()
      setFuente('nada')
      log('lectura periódica detenida')
      return
    }
    ws.desconectar()
    ultimoError.current = {}
    setFuente('poll')
    log('leyendo de :8084/api/metricas y :8083/api/alertas, con espera creciente si fallan', 'ok')
    poll.iniciar()
  }

  function conectar() {
    const destino = url.trim()
    /* El navegador conecta con wss://; la Lambda usa https:// contra el mismo
       endpoint para postToConnection. Son dos esquemas de la misma API. */
    if (!/^wss?:\/\//.test(destino)) {
      log('la URL debe empezar con wss:// (o ws:// en pruebas locales)', 'error')
      return
    }
    poll.detener()
    setFuente('ws')
    ws.conectar(destino)
  }

  /* El hook reconecta solo; la pantalla sólo deja de anunciar la fuente cuando
     se rindió del todo. */
  useEffect(() => {
    if (ws.estado === 'rendido' || ws.estado === 'cerrado') {
      setFuente((f) => (f === 'ws' ? 'nada' : f))
    }
  }, [ws.estado])

  const vistos = metricas?.productosMasVistos ?? []
  const maxVistas = vistos.length > 0 ? Math.max(...vistos.map((v) => v.vistas)) : 0

  const etiquetaFuente =
    fuente === 'ws'
      ? ws.estado === 'conectado'
        ? 'WebSocket conectado'
        : ws.estado === 'reconectando'
          ? `reconectando (intento ${ws.intentos})`
          : 'conectando…'
      : fuente === 'poll'
        ? poll.fallos > 0
          ? `reintentando cada ${describirEspera(poll.esperaMs)}`
          : `lectura directa cada ${describirEspera(poll.esperaMs)}`
        : 'sin fuente de datos'

  const estadoFuente =
    fuente === 'nada'
      ? 'bad'
      : (fuente === 'ws' && ws.estado !== 'conectado') || poll.fallos > 0
        ? 'warn'
        : 'ok'

  return (
    <div className="stack">
      <PageHeader
        titulo="Operaciones en tiempo real"
        bajada="Pulso de la tienda: qué se mira, cuánto se mueve y qué se bloquea. Los datos llegan empujados por API Gateway o se leen directo de los microservicios."
        accion={<Badge estado={estadoFuente}>{etiquetaFuente}</Badge>}
      />

      {ws.estado === 'rendido' && (
        <Notice estado="bad" titulo="Se dejó de reconectar el WebSocket">
          El endpoint no aceptó la conexión después de varios reintentos. Si la infraestructura se recreó, la URL de
          API Gateway cambió: tomá la nueva de la salida <code>url_websocket</code> de Terraform. Mientras tanto,{' '}
          <b>Leer de los servicios</b> da los mismos datos sin AWS.
        </Notice>
      )}

      {poll.rendido && (
        <Notice estado="bad" titulo="Lectura automática detenida">
          Los servicios no respondieron {poll.fallos} veces seguidas, así que se cortó el ciclo en lugar de seguir
          insistiendo. Revisá que <code>:8083</code> y <code>:8084</code> estén arriba y volvé a pulsar{' '}
          <b>Leer de los servicios</b>.
        </Notice>
      )}

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
