import { Link, useSearchParams } from 'react-router-dom'
import { Badge, Button, Card, Notice, Table } from '../components/ui'
import { clp, fechaHora } from '../lib/format'
import { BAJADA, TITULO, clasificarEstado, estadoVisual, glifo } from '../lib/transbank'
import './CallbackScreen.css'

/* ---------------------------------------------------------------------------
   Vuelta de Webpay.

   Transbank hace un POST de `token_ws` al returnUrl, y una página estática no
   puede leer el cuerpo de un POST: por eso el returnUrl apunta a
   ms-pago (/api/pagos/commit), que confirma la transacción contra Transbank y
   recién entonces redirige acá por GET con el resultado en el query string.
   Esta pantalla solo presenta lo que el backend ya resolvió.
   ------------------------------------------------------------------------- */

export function CallbackScreen() {
  const [params] = useSearchParams()

  const estado = params.get('estado') ?? params.get('status')
  const resultado = clasificarEstado(estado)
  const orden = params.get('orden') ?? params.get('buyOrder')
  const monto = params.get('monto') ?? params.get('amount')
  const cliente = params.get('cliente') ?? params.get('sessionId')
  const autorizacion = params.get('autorizacion') ?? params.get('authorizationCode')
  const tarjeta = params.get('tarjeta')
  const fecha = params.get('fecha')
  const detalleError = params.get('detalle')

  const visual = estadoVisual(resultado)

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

        <div className={`callback__icono callback__icono--${visual}`} aria-hidden="true">
          {glifo(resultado)}
        </div>

        <h1 className="callback__titulo">{TITULO[resultado]}</h1>
        <p className="callback__bajada">{BAJADA[resultado]}</p>

        <div className="callback__badge">
          <Badge estado={visual}>{estado ? estado.toLowerCase() : 'sin estado'}</Badge>
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
