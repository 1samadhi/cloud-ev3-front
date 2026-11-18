export const clp = (n: number | null | undefined) =>
  n == null ? '—' : '$' + Math.round(n).toLocaleString('es-CL')

export const num = (n: number | null | undefined) => (n == null ? '—' : n.toLocaleString('es-CL'))

export const hora = (d: Date = new Date()) =>
  d.toLocaleTimeString('es-CL', { hour12: false })

/* Las fechas de Spring llegan como "2026-11-18T14:03:22" sin zona. Tratarlas
   como UTC las correría 3 horas, así que se formatean como texto. */
export const fechaHora = (iso: string | null | undefined) =>
  !iso ? '—' : String(iso).replace('T', ' ').slice(0, 19)

export const pct = (parte: number, total: number) => (total === 0 ? 0 : Math.round((parte / total) * 100))
