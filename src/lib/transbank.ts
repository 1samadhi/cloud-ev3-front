/* ---------------------------------------------------------------------------
   Estados de una transacción de Webpay, normalizados para la interfaz.

   Vive aparte de la pantalla porque Transbank y ms-pago no hablan el mismo
   vocabulario: el SDK devuelve AUTHORIZED / FAILED / NULLIFIED en inglés,
   mientras que el redirect de ms-pago usa ANULADO y ERROR en español. La
   pantalla no debería conocer las dos tablas.
   ------------------------------------------------------------------------- */

export type Resultado = 'aprobado' | 'rechazado' | 'anulado' | 'error' | 'desconocido'

const POR_ESTADO: Record<string, Resultado> = {
  AUTHORIZED: 'aprobado',
  APROBADO: 'aprobado',
  REJECTED: 'rechazado',
  FAILED: 'rechazado',
  RECHAZADO: 'rechazado',
  NULLIFIED: 'anulado',
  ABORTED: 'anulado',
  ANULADO: 'anulado',
  REVERSED: 'anulado',
  ERROR: 'error',
}

/**
 * Normaliza el parámetro `estado` del query string.
 *
 * Un estado ausente NO es un error: significa que la pantalla se abrió a mano
 * o que el returnUrl de ms-pago no está apuntando al commit, y esas dos cosas
 * se comunican distinto que un rechazo de Transbank.
 */
export function clasificarEstado(estado: string | null | undefined): Resultado {
  if (!estado || !estado.trim()) return 'desconocido'
  return POR_ESTADO[estado.trim().toUpperCase()] ?? 'desconocido'
}

export const TITULO: Record<Resultado, string> = {
  aprobado: 'Pago aprobado',
  rechazado: 'Pago rechazado',
  anulado: 'Pago anulado por el usuario',
  error: 'No se pudo confirmar el pago',
  desconocido: 'Resultado desconocido',
}

export const BAJADA: Record<Resultado, string> = {
  aprobado: 'Transbank autorizó la transacción y ms-pago registró el resultado del cliente.',
  rechazado: 'Transbank no autorizó la transacción. El intento quedó registrado igual en payment-attempts.',
  anulado: 'La transacción se interrumpió en el formulario de Webpay antes de completarse.',
  error: 'El commit contra Transbank falló. Revisá los logs de ms-pago.',
  desconocido: 'Esta pantalla se abrió sin los parámetros que envía ms-pago tras el commit.',
}

/** Color con el que se pinta cada resultado. */
export function estadoVisual(resultado: Resultado): 'ok' | 'warn' | 'bad' {
  if (resultado === 'aprobado') return 'ok'
  if (resultado === 'anulado') return 'warn'
  return 'bad'
}

/** Glifo del círculo superior de la pantalla de resultado. */
export function glifo(resultado: Resultado): string {
  if (resultado === 'aprobado') return '✓'
  if (resultado === 'anulado') return '!'
  return '×'
}
