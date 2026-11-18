/* Tipos espejo de los DTO de Spring. Los nombres de campo son los que viajan en
   el JSON, no se renombran: cualquier desvío acá es un bug silencioso en runtime. */

/* ---- ms-pago :8083 ---- */
export type PeticionPago = {
  clientId: string
  amount: number
  transactionId: string
}

/* PagosController responde un Map, no el DTO: {url, token} o {message} o {error} */
export type RespuestaIniciarPago = {
  url?: string
  token?: string
  message?: string
  error?: string
}

export type AlertaFraude = {
  idCliente: string
  cantidadIntentos: number
  bloqueadoHasta: string
  minutosRestantes: number
  actualizadoEn: string
}

export type ResumenAlertas = {
  bloqueosActivos: number
  totalClientesVigilados: number
  alertas: AlertaFraude[]
}

/* ---- ms-recomendaciones :8084 ---- */
export type Interaccion = {
  clientId: string
  itemId: string
  action: 'view' | 'cart' | 'purchase'
  category: string
  productType: string
}

export type ProductoEnriquecido = {
  rankPosition: number
  score: number
  itemId: string
  nombre: string
  categoria: string
  marca: string
  precio: number
  calificacion: number
  imagenUrl: string
}

export type ProductoVisto = {
  itemId: string
  nombre: string
  categoria: string
  vistas: number
}

export type Metricas = {
  productosMasVistos: ProductoVisto[]
  interaccionesPorMinuto: number
  usuariosActivos: number
  totalInteracciones: number
}

/* ---- ms-kafka-admin :8085 ---- */
export type Topico = {
  nombre: string
  particiones: number
  replicas: number
  isr: string
}

export type ConfiguracionTopico = {
  retentionMs: string
  cleanupPolicy: string
  minInsyncReplicas: string
  segmentBytes: string
}

export type ParticionDetalle = {
  numero: number
  lider: number
  replicas: number[]
  isr: number[]
}

export type TopicoDetalle = Topico & {
  configuracion: ConfiguracionTopico
  particionesDetalle: ParticionDetalle[]
}

export type CrearTopicoRequest = {
  nombre: string
  particiones: number
  replicas: number
  retentionMs?: number | null
  cleanupPolicy?: string | null
  minInsyncReplicas?: number | null
}

export type Broker = {
  id: number
  host: string
}

export type Cluster = {
  cantidadBrokers: number
  brokers: Broker[]
  controlador: number
}

export type ConsumerGroup = {
  id: string
  estado: string
  cantidadMiembros: number
  topicos: string[]
}

export type LagDetalle = {
  topico: string
  particion: number
  offsetActual: number
  offsetFinal: number
  lag: number
}

export type ConsumerGroupLag = {
  groupId: string
  lagTotal: number
  detalles: LagDetalle[]
}
