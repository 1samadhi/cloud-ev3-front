/* ---------------------------------------------------------------------------
   Espera creciente para lecturas periódicas.

   Sin esto, un servicio caído recibe una petición cada 5 s para siempre y el
   registro se llena de la misma línea de error, que es justo cuando el panel
   deja de servir para diagnosticar.

   No lleva jitter a propósito: el jitter existe para que N clientes no golpeen
   el servicio a la vez, y acá hay una sola consola abierta por operador. Sin
   jitter la progresión es determinista y se puede testear.
   ------------------------------------------------------------------------- */

export const ESPERA_BASE_MS = 5000
export const ESPERA_MAX_MS = 60000
export const FALLOS_PARA_RENDIRSE = 5

/**
 * Espera antes del próximo intento, duplicando por cada fallo consecutivo.
 *
 * fallos = 0 (todo bien)  -> base
 * fallos = 1              -> base
 * fallos = 2              -> base * 2
 * fallos = 3              -> base * 4 … hasta el techo
 */
export function siguienteEspera(
  fallosConsecutivos: number,
  base = ESPERA_BASE_MS,
  max = ESPERA_MAX_MS,
): number {
  if (fallosConsecutivos <= 1) return base
  const exponente = fallosConsecutivos - 1
  /* El exponente se acota antes de elevar: 2**1024 es Infinity y multiplicarlo
     por base daría NaN en lugar del techo. */
  if (exponente > 32) return max
  return Math.min(max, base * 2 ** exponente)
}

/** Tras N fallos seguidos se corta el ciclo y se espera una acción del usuario. */
export function debeRendirse(fallosConsecutivos: number, maxFallos = FALLOS_PARA_RENDIRSE): boolean {
  return fallosConsecutivos >= maxFallos
}

/** "5 s", "1 min", "1,5 min" — para decirle al usuario cuánto falta. */
export function describirEspera(ms: number): string {
  if (ms < 60000) return `${Math.round(ms / 1000)} s`
  const minutos = ms / 60000
  return `${Number.isInteger(minutos) ? minutos : minutos.toFixed(1).replace('.', ',')} min`
}
