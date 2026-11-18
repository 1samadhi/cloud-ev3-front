import { useCallback, useEffect, useState } from 'react'
import { PageHeader } from '../components/Shell'
import { LogPanel } from '../components/LogPanel'
import { Badge, Button, Card, Empty, Field, Input, Metric, Notice, Table } from '../components/ui'
import { useLog } from '../hooks/useLog'
import { pagos } from '../lib/api'
import { fechaHora } from '../lib/format'
import type { AlertaFraude, ResumenAlertas } from '../lib/types'
import { TARJETAS_PRUEBA } from '../lib/catalogo'

type Aviso = { estado: 'ok' | 'bad' | 'warn'; titulo: string; detalle?: React.ReactNode }

/* Transbank EXIGE POST con token_ws en un formulario: un redirect GET a la URL
   de Webpay se rechaza. Se navega en la MISMA pestaña para que la vuelta caiga
   en /callback de esta app y no en una pestaña huérfana. */
function irAWebpay(url: string, token: string) {
  const form = document.createElement('form')
  form.action = url
  form.method = 'POST'
  const campo = document.createElement('input')
  campo.type = 'hidden'
  campo.name = 'token_ws'
  campo.value = token
  form.appendChild(campo)
  document.body.appendChild(form)
  form.submit()
}

export function PagosScreen() {
  const [cliente, setCliente] = useState('ismael')
  const [monto, setMonto] = useState('15000')
  const [enviando, setEnviando] = useState(false)
  const [rafagaEnCurso, setRafagaEnCurso] = useState(false)
  const [aviso, setAviso] = useState<Aviso | null>(null)
  const [resumen, setResumen] = useState<ResumenAlertas | null>(null)
  const { lineas, log, limpiar } = useLog()

  const cargarAlertas = useCallback(async () => {
    try {
      setResumen(await pagos.alertas())
    } catch {
      /* el panel de alertas es informativo: si falla, no bloquea la pantalla */
    }
  }, [])

  useEffect(() => {
    void cargarAlertas()
    const t = setInterval(() => void cargarAlertas(), 15000)
    return () => clearInterval(t)
  }, [cargarAlertas])

  const bloqueadoEsteCliente = resumen?.alertas.find(
    (a) => a.idCliente === cliente.trim() && a.minutosRestantes > 0,
  )

  async function pagar() {
    const cli = cliente.trim()
    const importe = Number(monto)
    if (!cli) {
      setAviso({ estado: 'bad', titulo: 'Falta el cliente', detalle: 'El campo clientId no puede ir vacío.' })
      return
    }
    if (!Number.isFinite(importe) || importe <= 0) {
      setAviso({ estado: 'bad', titulo: 'Monto inválido', detalle: 'El backend valida @Positive: debe ser mayor que 0.' })
      return
    }

    const tx = `TX-${Date.now()}`
    setEnviando(true)
    setAviso(null)
    log(`POST /api/pagos/iniciar  cliente=${cli} monto=${importe} tx=${tx}`)

    try {
      const { status, body } = await pagos.iniciar({ clientId: cli, amount: importe, transactionId: tx })

      if (status === 429) {
        setAviso({ estado: 'bad', titulo: 'Bloqueado por el antifraude', detalle: body.message })
        log('HTTP 429 — cliente bloqueado por velocidad de intentos', 'error')
        void cargarAlertas()
      } else if (status === 400) {
        setAviso({
          estado: 'bad',
          titulo: 'Datos inválidos',
          detalle: 'Spring rechazó la petición: clientId no puede estar vacío y amount debe ser mayor que 0.',
        })
        log('HTTP 400 — validación de entrada', 'error')
      } else if (body.url && body.token) {
        setAviso({
          estado: 'ok',
          titulo: 'Transacción creada en Transbank',
          detalle: (
            <>
              Token <code>{body.token.slice(0, 28)}…</code> — redirigiendo a Webpay por POST.
            </>
          ),
        })
        log('HTTP 200 — token recibido, redirigiendo a Webpay', 'ok')
        irAWebpay(body.url, body.token)
      } else {
        setAviso({
          estado: 'bad',
          titulo: `Respuesta inesperada (HTTP ${status})`,
          detalle: <code>{JSON.stringify(body).slice(0, 220)}</code>,
        })
        log(`HTTP ${status} — respuesta sin url/token`, 'error')
      }
    } catch (e) {
      setAviso({
        estado: 'bad',
        titulo: 'El servicio de pagos no responde',
        detalle: <>Revisá que ms-pago esté arriba en <code>:8083</code> y que el origen esté en CORS_ORIGENES.</>,
      })
      log(`error de red: ${(e as Error).message}`, 'error')
    } finally {
      setEnviando(false)
    }
  }

  /* La ráfaga es la prueba de la regla antifraude: 3 intentos del mismo cliente
     en menos de 10 s deben devolver 429 y bloquearlo 30 minutos. */
  async function rafaga() {
    const cli = cliente.trim() || 'ismael'
    setRafagaEnCurso(true)
    setAviso(null)
    log(`ráfaga de 4 intentos con el mismo clientId (${cli})`)

    const codigos: (number | 'err')[] = []
    for (let i = 1; i <= 4; i++) {
      try {
        const { status } = await pagos.iniciar({
          clientId: cli,
          amount: Number(monto) || 1000,
          transactionId: `TXB-${Date.now()}-${i}`,
        })
        codigos.push(status)
        log(`intento ${i} → HTTP ${status}`, status === 429 ? 'error' : 'ok')
      } catch {
        codigos.push('err')
        log(`intento ${i} → error de red`, 'error')
      }
    }

    const bloqueo = codigos.includes(429)
    setAviso({
      estado: bloqueo ? 'ok' : 'warn',
      titulo: `Resultado de la ráfaga: ${codigos.join(' · ')}`,
      detalle: bloqueo
        ? 'El antifraude bloqueó al cliente, que es el comportamiento esperado.'
        : 'No hubo bloqueo. Revisá que el consumidor del tópico payment-attempts esté procesando.',
    })
    setRafagaEnCurso(false)
    void cargarAlertas()
  }

  return (
    <div className="stack">
      <PageHeader
        titulo="Pagos"
        bajada="Webpay Plus sobre Transbank, con detección de fraude por velocidad de intentos. Cada intento se publica en el tópico payment-attempts."
        accion={
          bloqueadoEsteCliente ? (
            <Badge estado="bad">cliente bloqueado · {bloqueadoEsteCliente.minutosRestantes} min</Badge>
          ) : (
            <Badge estado="ok">cliente habilitado</Badge>
          )
        }
      />

      <div className="metrics">
        <Metric
          etiqueta="Bloqueos vigentes"
          valor={resumen?.bloqueosActivos ?? '—'}
          estado={resumen && resumen.bloqueosActivos > 0 ? 'bad' : undefined}
        />
        <Metric etiqueta="Clientes vigilados" valor={resumen?.totalClientesVigilados ?? '—'} />
        <Metric etiqueta="Umbral antifraude" valor="3" sufijo="intentos / 10 s" nota="bloqueo de 30 minutos" />
      </div>

      <Card titulo="Iniciar un pago" descripcion="El antifraude cuenta por clientId: con identificadores distintos el contador arranca de cero.">
        <div className="row">
          <Field etiqueta="clientId" ancho={200}>
            <Input value={cliente} onChange={(e) => setCliente(e.target.value)} placeholder="ismael" />
          </Field>
          <Field etiqueta="Monto (CLP)" ancho={160}>
            <Input type="number" min={1} value={monto} onChange={(e) => setMonto(e.target.value)} />
          </Field>
          <Button variante="primario" onClick={pagar} disabled={enviando || rafagaEnCurso}>
            {enviando ? 'Verificando…' : 'Pagar con Webpay'}
          </Button>
          <Button onClick={rafaga} disabled={enviando || rafagaEnCurso}>
            {rafagaEnCurso ? 'Enviando ráfaga…' : 'Ráfaga de 4 (probar bloqueo)'}
          </Button>
        </div>

        {aviso && (
          <div style={{ marginTop: 'var(--s4)' }}>
            <Notice estado={aviso.estado} titulo={aviso.titulo} onCerrar={() => setAviso(null)}>
              {aviso.detalle}
            </Notice>
          </div>
        )}
      </Card>

      <div className="grid-2">
        <Card titulo="Tarjetas del ambiente de integración" descripcion="Sin dinero real. RUT 11.111.111-1, clave 123, cualquier fecha futura.">
          <Table cols={['Tarjeta', 'Número', 'CVV', 'Resultado']}>
            {TARJETAS_PRUEBA.map((t) => (
              <tr key={t.numero}>
                <td>{t.marca}</td>
                <td className="mono">{t.numero}</td>
                <td className="mono">{t.cvv}</td>
                <td>
                  <Badge estado={t.aprueba ? 'ok' : 'bad'}>{t.aprueba ? 'aprobada' : 'rechazada'}</Badge>
                </td>
              </tr>
            ))}
          </Table>
        </Card>

        <Card titulo="Bloqueos vigentes" descripcion="GET /api/alertas, refrescado cada 15 s.">
          {!resumen || resumen.alertas.length === 0 ? (
            <Empty>Ningún cliente bloqueado en este momento.</Empty>
          ) : (
            <Table cols={['Cliente', { t: 'Intentos', num: true }, { t: 'Expira en', num: true }, 'Detectado']}>
              {resumen.alertas.map((a: AlertaFraude) => (
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
