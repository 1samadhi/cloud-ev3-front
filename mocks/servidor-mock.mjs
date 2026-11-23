/* ----------------------------------------------------------------------------
   Servidor mock de los tres microservicios.

   Para que no haga falta Docker, Kafka, MySQL ni Transbank solo para trabajar
   la interfaz. Levanta los puertos reales (8083, 8084, 8085), responde los
   mismos contratos que los DTO de Spring y habilita CORS para el origen de
   Vite, igual que los servicios de verdad.

   Uso:  npm run mock     (en otra terminal, junto a npm run dev)

   Expone también /actuator/health en los tres puertos, igual que los servicios
   reales con Actuator, para poder trabajar el indicador de estado de la barra
   lateral. Para ver el caso "degradado" sin apagar nada:

       curl "http://localhost:8085/mock/degradar?valor=1"   # health -> DOWN (503)
       curl "http://localhost:8085/mock/degradar?valor=0"   # vuelve a UP

   Lo que NO hace: publicar en Kafka. El antifraude, el ranking y el lag se
   simulan en memoria, así que esto sirve para la UI, no para la evaluación.
   --------------------------------------------------------------------------- */
import { createServer } from 'node:http'

const ORIGEN_PERMITIDO = '*'

/* ---------- estado en memoria ---------- */
const intentosPorCliente = new Map() // clientId -> { intentos, bloqueadoHasta, actualizadoEn }
const puntajes = new Map() // `${clientId}|${itemId}` -> score
const vistasPorItem = new Map()
let totalInteracciones = 0

const PESOS = { view: 1, cart: 2, purchase: 3 }

const PRODUCTOS = {
  item_101: { nombre: 'Audífonos Over-Ear X1', categoria: 'electronica', marca: 'Sonex', precio: 89990, calificacion: 4.4 },
  item_102: { nombre: 'Teclado mecánico TKL', categoria: 'electronica', marca: 'Kyra', precio: 64990, calificacion: 4.6 },
  item_109: { nombre: 'Monitor 27" 165Hz', categoria: 'electronica', marca: 'Veltro', precio: 249990, calificacion: 4.7 },
  item_112: { nombre: 'Notebook 14" Ryzen 5', categoria: 'electronica', marca: 'Nordik', precio: 629990, calificacion: 4.3 },
  item_116: { nombre: 'Aspiradora robot A9', categoria: 'hogar', marca: 'Casaviva', precio: 189990, calificacion: 4.1 },
  item_117: { nombre: 'Set de sartenes antiadherentes', categoria: 'hogar', marca: 'Cocinare', precio: 54990, calificacion: 4.5 },
  item_118: { nombre: 'Mancuernas ajustables 20kg', categoria: 'deportes', marca: 'Ferrum', precio: 119990, calificacion: 4.8 },
  item_120: { nombre: 'Colchoneta de yoga pro', categoria: 'deportes', marca: 'Ferrum', precio: 24990, calificacion: 4.2 },
}

const productoDe = (itemId) =>
  PRODUCTOS[itemId] ?? {
    nombre: itemId,
    categoria: 'general',
    marca: 'Genérica',
    precio: 19990,
    calificacion: 3.9,
  }

const ahoraIso = () => new Date().toISOString().slice(0, 19)

/* Se degrada a mano para poder probar la interfaz: no hay forma de hacer caer
   "sólo la base de datos" de un mock que no tiene base de datos. */
let degradado = false

/* ---------- utilidades HTTP ---------- */
function responder(res, status, cuerpo) {
  const texto = typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo)
  res.writeHead(status, {
    'Content-Type': typeof cuerpo === 'string' ? 'text/plain; charset=utf-8' : 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': ORIGEN_PERMITIDO,
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
  })
  res.end(texto)
}

function leerCuerpo(req) {
  return new Promise((resolve) => {
    let datos = ''
    req.on('data', (c) => (datos += c))
    req.on('end', () => {
      try {
        resolve(datos ? JSON.parse(datos) : {})
      } catch {
        resolve({})
      }
    })
  })
}

/* Mismo contrato que Actuator: 200 con status UP, 503 con status DOWN y el
   detalle por componente en components. */
function salud(res, nombre) {
  const componentes = { diskSpace: { status: 'UP' } }
  if (nombre !== 'ms-kafka-admin') {
    componentes.db = { status: degradado ? 'DOWN' : 'UP', details: { database: 'MySQL' } }
  } else {
    componentes.kafkaCluster = {
      status: degradado ? 'DOWN' : 'UP',
      details: degradado
        ? { motivo: 'simulado por el mock', brokers: 1, brokersMinimos: 2 }
        : { clusterId: 'mock-cluster', brokers: 3, brokersMinimos: 2, controlador: 1 },
    }
  }
  const estado = degradado ? 'DOWN' : 'UP'
  return responder(res, degradado ? 503 : 200, { status: estado, components: componentes })
}

function servicio(puerto, nombre, manejador) {
  createServer(async (req, res) => {
    if (req.method === 'OPTIONS') return responder(res, 204, '')
    const url = new URL(req.url, `http://localhost:${puerto}`)
    try {
      if (url.pathname === '/actuator/health') return salud(res, nombre)
      if (url.pathname === '/mock/degradar') {
        degradado = url.searchParams.get('valor') === '1'
        return responder(res, 200, { degradado })
      }
      const atendido = await manejador(req, res, url)
      if (!atendido) responder(res, 404, { mensaje: `ruta no encontrada: ${url.pathname}`, codigo: 404 })
    } catch (e) {
      responder(res, 500, { mensaje: String(e), codigo: 500 })
    }
  }).listen(puerto, () => console.log(`[mock] ${nombre} escuchando en http://localhost:${puerto}`))
}

/* ======================= ms-pago :8083 ======================= */
servicio(8083, 'ms-pago', async (req, res, url) => {
  if (url.pathname === '/api/pagos/iniciar' && req.method === 'POST') {
    const { clientId, amount } = await leerCuerpo(req)
    if (!clientId || !amount || amount <= 0) {
      return responder(res, 400, { message: 'clientId no puede estar vacío y amount debe ser mayor a 0' }), true
    }

    const estado = intentosPorCliente.get(clientId) ?? { intentos: 0, bloqueadoHasta: null }
    const ahora = Date.now()

    if (estado.bloqueadoHasta && estado.bloqueadoHasta > ahora) {
      return (
        responder(res, 429, {
          message: 'Demasiados intentos detectados. Estás bloqueado temporalmente por 30 minutos. Por favor, espera.',
        }),
        true
      )
    }

    estado.intentos += 1
    estado.actualizadoEn = ahoraIso()
    /* La regla real: 3 intentos en menos de 10 s bloquean 30 minutos. */
    if (estado.intentos >= 3) estado.bloqueadoHasta = ahora + 30 * 60 * 1000
    intentosPorCliente.set(clientId, estado)

    return (
      responder(res, 200, {
        /* El mock devuelve una URL propia en lugar de la de Transbank: así se ve
           la pantalla de resultado sin salir de localhost. */
        url: 'http://localhost:8083/api/pagos/commit-simulado',
        token: 'MOCK-' + Math.random().toString(36).slice(2).padEnd(24, '0'),
      }),
      true
    )
  }

  /* Simula la vuelta de Webpay: redirige al callback del front, como el
     controlador real después del commit. */
  if (url.pathname === '/api/pagos/commit-simulado') {
    const destino = new URL('http://localhost:5173/callback')
    destino.searchParams.set('estado', 'AUTHORIZED')
    destino.searchParams.set('orden', 'TX-' + Date.now())
    destino.searchParams.set('cliente', 'ismael')
    destino.searchParams.set('monto', '15000')
    destino.searchParams.set('autorizacion', '1213')
    destino.searchParams.set('tarjeta', '6623')
    destino.searchParams.set('fecha', ahoraIso())
    res.writeHead(302, { Location: destino.toString() })
    res.end()
    return true
  }

  if (url.pathname === '/api/alertas' && req.method === 'GET') {
    const alertas = []
    for (const [idCliente, e] of intentosPorCliente) {
      const restante = e.bloqueadoHasta ? Math.max(0, Math.round((e.bloqueadoHasta - Date.now()) / 60000)) : 0
      if (restante > 0) {
        alertas.push({
          idCliente,
          cantidadIntentos: e.intentos,
          bloqueadoHasta: new Date(e.bloqueadoHasta).toISOString().slice(0, 19),
          minutosRestantes: restante,
          actualizadoEn: e.actualizadoEn ?? ahoraIso(),
        })
      }
    }
    return (
      responder(res, 200, {
        bloqueosActivos: alertas.length,
        totalClientesVigilados: intentosPorCliente.size,
        alertas,
      }),
      true
    )
  }
  return false
})

/* ================== ms-recomendaciones :8084 ================== */
servicio(8084, 'ms-recomendaciones', async (req, res, url) => {
  if (url.pathname === '/api/interacciones' && req.method === 'POST') {
    const { clientId, itemId, action } = await leerCuerpo(req)
    const peso = PESOS[action] ?? 1
    const clave = `${clientId}|${itemId}`
    puntajes.set(clave, (puntajes.get(clave) ?? 0) + peso)
    vistasPorItem.set(itemId, (vistasPorItem.get(itemId) ?? 0) + 1)
    totalInteracciones += 1
    return responder(res, 200, 'Interacción registrada'), true
  }

  if (url.pathname === '/api/recomendaciones' && req.method === 'GET') {
    const userId = url.searchParams.get('userId') ?? ''
    const propias = [...puntajes.entries()]
      .filter(([k]) => k.startsWith(userId + '|'))
      .map(([k, score]) => ({ itemId: k.split('|')[1], score }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map((p, i) => ({ rankPosition: i + 1, score: p.score, itemId: p.itemId, imagenUrl: '', ...productoDe(p.itemId) }))
    return responder(res, 200, propias), true
  }

  if (url.pathname === '/api/metricas' && req.method === 'GET') {
    const productosMasVistos = [...vistasPorItem.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([itemId, vistas]) => ({ itemId, nombre: productoDe(itemId).nombre, categoria: productoDe(itemId).categoria, vistas }))
    const usuarios = new Set([...puntajes.keys()].map((k) => k.split('|')[0]))
    return (
      responder(res, 200, {
        productosMasVistos,
        interaccionesPorMinuto: totalInteracciones,
        usuariosActivos: usuarios.size,
        totalInteracciones,
      }),
      true
    )
  }
  return false
})

/* =================== ms-kafka-admin :8085 =================== */
const topicos = [
  { nombre: 'payment-attempts', particiones: 3, replicas: 3, isr: '1,2,3' },
  { nombre: 'interacciones-user', particiones: 3, replicas: 3, isr: '1,2,3' },
]

servicio(8085, 'ms-kafka-admin', async (req, res, url) => {
  if (url.pathname === '/api/cluster' && req.method === 'GET') {
    return (
      responder(res, 200, {
        cantidadBrokers: 3,
        controlador: 1,
        brokers: [
          { id: 1, host: 'kafka1:29092' },
          { id: 2, host: 'kafka2:29092' },
          { id: 3, host: 'kafka3:29092' },
        ],
      }),
      true
    )
  }

  if (url.pathname === '/api/topicos' && req.method === 'GET') {
    return responder(res, 200, topicos), true
  }

  if (url.pathname === '/api/topicos' && req.method === 'POST') {
    const { nombre, particiones, replicas } = await leerCuerpo(req)
    if (topicos.some((t) => t.nombre === nombre)) {
      return responder(res, 409, { mensaje: `El tópico ${nombre} ya existe`, codigo: 409 }), true
    }
    topicos.push({ nombre, particiones, replicas, isr: '1,2,3'.slice(0, replicas * 2 - 1) })
    return responder(res, 201, `Tópico ${nombre} creado`), true
  }

  const detalle = url.pathname.match(/^\/api\/topicos\/(.+)$/)
  if (detalle && req.method === 'GET') {
    const t = topicos.find((x) => x.nombre === decodeURIComponent(detalle[1]))
    if (!t) return responder(res, 404, { mensaje: 'tópico no encontrado', codigo: 404 }), true
    return (
      responder(res, 200, {
        ...t,
        configuracion: {
          retentionMs: '604800000',
          cleanupPolicy: 'delete',
          minInsyncReplicas: '2',
          segmentBytes: '1073741824',
        },
        particionesDetalle: Array.from({ length: t.particiones }, (_, i) => ({
          numero: i,
          lider: (i % 3) + 1,
          replicas: [1, 2, 3].slice(0, t.replicas),
          isr: i === 1 ? [1, 2] : [1, 2, 3].slice(0, t.replicas),
        })),
      }),
      true
    )
  }
  if (detalle && req.method === 'DELETE') {
    const nombre = decodeURIComponent(detalle[1])
    const i = topicos.findIndex((x) => x.nombre === nombre)
    if (i === -1) return responder(res, 404, { mensaje: 'tópico no encontrado', codigo: 404 }), true
    topicos.splice(i, 1)
    return responder(res, 200, `Tópico ${nombre} eliminado`), true
  }

  if (url.pathname === '/api/consumer-groups' && req.method === 'GET') {
    return (
      responder(res, 200, [
        { id: 'payment-velocity-group', estado: 'STABLE', cantidadMiembros: 1, topicos: ['payment-attempts'] },
        { id: 'recommendation-consumer-group', estado: 'STABLE', cantidadMiembros: 1, topicos: ['interacciones-user'] },
      ]),
      true
    )
  }

  const lag = url.pathname.match(/^\/api\/consumer-groups\/(.+)\/lag$/)
  if (lag && req.method === 'GET') {
    const groupId = decodeURIComponent(lag[1])
    const detalles = [0, 1, 2].map((p) => {
      const final = 1200 + p * 37
      const actual = final - (p === 2 ? 14 : 0)
      return { topico: groupId.includes('payment') ? 'payment-attempts' : 'interacciones-user', particion: p, offsetActual: actual, offsetFinal: final, lag: final - actual }
    })
    return (
      responder(res, 200, {
        groupId,
        lagTotal: detalles.reduce((a, d) => a + d.lag, 0),
        detalles,
      }),
      true
    )
  }
  return false
})

console.log('[mock] listo. Dejá este proceso corriendo junto a `npm run dev`.')
