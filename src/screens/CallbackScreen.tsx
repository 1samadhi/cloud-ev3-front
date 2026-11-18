import { Link, useSearchParams } from 'react-router-dom'
import { Badge, Button, Card, Notice, Table } from '../components/ui'
import { clp, fechaHora } from '../lib/format'
import './CallbackScreen.css'

/* ---------------------------------------------------------------------------
   Vuelta de Webpay.

   Transbank hace un POST de `token_ws` al returnUrl, y una página estática no
   puede leer el cuerpo de un POST: por eso el returnUrl apunta a
   ms-pago (/api/pagos/commit), que confirma la transacción contra Transbank y
   recién entonces redirige acá por GET con el resultado en el query string.
   Esta pantalla solo presenta lo que el backend ya resolvió.
   ------------------------------------------------------------------------- */

type Resultado = 'aprobado' | 'rechazado' | 'anulado' | 'error' | 'desconocido'

const TITULO: Record<Resultado, string> = {
  aprobado: 'Pago aprobado',
  rechazado: 'Pago rechazado',
  anulado: 'Pago anulado por el usuario',
  error: 'No se pudo confirmar el pago',
  desconocido: 'Resultado desconocido',
}

const BAJADA: Record<Resultado, string> = {
  aprobado: 'Transbank autorizó la transacción y ms-pago registró el resultado del cliente.',
  rechazado: 'Transbank no autorizó la transacción. El intento quedó registrado igual en payment-attempts.',
  anulado: 'La transacción se interrumpió en el formulario de Webpay antes de completarse.',
  error: 'El commit contra Transbank falló. Revisá los logs de ms-pago.',
  desconocido: 'Esta pantalla se abrió sin los parámetros que envía ms-pago tras el commit.',
}

function clasificar(estado: string | null): Resultado {
  if (!estado) return 'desconocido'
  const e = estado.toUpperCase()
  if (e === 'AUTHORIZED' || e === 'APROBADO') return 'aprobado'
  if (e === 'REJECTED' || e === 'FAILED' || e === 'RECHAZADO') return 'rechazado'
  if (e === 'NULLIFIED' || e === 'ANULADO' || e === 'ABORTED') return 'anulado'
  if (e === 'ERROR') return 'error'
  return 'desconocido'
}

export function CallbackScreen() {
  const [params] = useSearchParams()

  const estado = params.get('estado') ?? params.get('status')
  const resultado = clasificar(estado)
  const orden = params.get('orden') ?? params.get('buyOrder')
  const monto = params.get('monto') ?? params.get('amount')
  const cliente = params.get('cliente') ?? params.get('sessionId')
  const autorizacion = params.get('autorizacion') ?? params.get('authorizationCode')
  const tarjeta = params.get('tarjeta')
  const fecha = params.get('fecha')
  const detalleError = params.get('detalle')

  const estadoVisual = resultado === 'aprobado' ? 'ok' : resultado === 'anulado' ? 'warn' : 'bad'

  const filas: [string, string][] = [
    ['Orden de compra', orden ?? '—'],
    ['Cliente', cliente ?? '—'],
    ['Monto', monto ? clp(Number(monto)) : '—'],
    ['Código de autorización', autorizacion ?? '—'],
    ['Tarjeta', tarjeta ? `•••• ${tarjeta}` : '—'],
    ['Fecha de la transacción', fecha ? fechaHora(fecha) : '—'],
  ]

  return (
    <div className="callback">
      <div className="callback__panel">
        <div className="callback__brand">
          <span className="callback__logo" aria-hidden="true">
            P
          </span>
          <span>
            <strong>Pedidos360</strong>
            <small>Resultado de la transacción</small>
          </span>
        </div>

        <div className={`callback__icono callback__icono--${estadoVisual}`} aria-hidden="true">
          {resultado === 'aprobado' ? '✓' : resultado === 'anulado' ? '!' : '×'}
        </div>

        <h1 className="callback__titulo">{TITULO[resultado]}</h1>
        <p className="callback__bajada">{BAJADA[resultado]}</p>

        <div className="callback__badge">
          <Badge estado={estadoVisual}>{estado ? estado.toLowerCase() : 'sin estado'}</Badge>
        </div>

        {detalleError && (
          <Notice estado="bad" titulo="Detalle del error">
            <code>{detalleError}</code>
          </Notice>
        )}

        <Card titulo="Datos de la transacción">
          <Table cols={['Campo', 'Valor']}>
            {filas.map(([k, v]) => (
              <tr key={k}>
                <td className="muted">{k}</td>
                <td className="mono">{v}</td>
              </tr>
            ))}
          </Table>
        </Card>

        <div className="callback__acciones">
          <Link to="/pagos">
            <Button variante="primario">Volver a Pagos</Button>
          </Link>
          <Link to="/operaciones">
            <Button>Ver operaciones en vivo</Button>
          </Link>
        </div>

        {resultado === 'desconocido' && (
          <p className="callback__nota">
            Si llegaste acá desde Webpay y no ves datos, significa que el <code>returnUrl</code> de ms-pago no está
            apuntando a <code>/api/pagos/commit</code>.
          </p>
        )}
      </div>
    </div>
  )
}
