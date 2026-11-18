import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, admin, pagos, recomendaciones } from './api'

/* Se simula fetch, no el servidor: lo que se verifica acá es el contrato del
   cliente (qué URL arma, cómo traduce los errores de cada servicio, qué
   devuelve como dato y qué lanza), no el comportamiento de Spring. */
function respuesta(status: number, cuerpo: unknown, { texto = false } = {}) {
  const payload = texto ? String(cuerpo) : JSON.stringify(cuerpo)
  return {
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(payload),
    json: () => Promise.resolve(cuerpo),
  } as unknown as Response
}

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const urlLlamada = (i = 0) => String(fetchMock.mock.calls[i][0])
const opcionesLlamada = (i = 0) => fetchMock.mock.calls[i][1] as RequestInit

describe('ApiError', () => {
  it('distingue un fallo de red de una respuesta del servicio', () => {
    expect(new ApiError(0, 'sin red').esDeRed).toBe(true)
    expect(new ApiError(500, 'boom').esDeRed).toBe(false)
    expect(new ApiError(404, 'no está').esDeRed).toBe(false)
  })
})

describe('traducción de errores', () => {
  it('usa el campo "mensaje" de ms-kafka-admin', async () => {
    fetchMock.mockResolvedValue(respuesta(409, { mensaje: 'El tópico ya existe', codigo: 409 }))
    await expect(admin.crearTopico({ nombre: 'x', particiones: 1, replicas: 1 })).rejects.toThrow(
      'El tópico ya existe',
    )
  })

  it('usa el campo "message" de ms-pago', async () => {
    fetchMock.mockResolvedValue(respuesta(500, { message: 'no se pudo' }))
    await expect(pagos.alertas()).rejects.toThrow('no se pudo')
  })

  it('usa el campo "error" cuando es el único presente', async () => {
    fetchMock.mockResolvedValue(respuesta(500, { error: 'pasarela caída' }))
    await expect(pagos.alertas()).rejects.toThrow('pasarela caída')
  })

  /* Varios endpoints del administrador devuelven texto plano, no JSON. */
  it('acepta un cuerpo de texto plano', async () => {
    fetchMock.mockResolvedValue(respuesta(400, 'El pago fue rechazado por Transbank', { texto: true }))
    await expect(admin.topicos()).rejects.toThrow('El pago fue rechazado por Transbank')
  })

  it('cae al código HTTP cuando el cuerpo viene vacío', async () => {
    fetchMock.mockResolvedValue(respuesta(503, '', { texto: true }))
    await expect(admin.topicos()).rejects.toThrow('HTTP 503')
  })

  it('convierte el rechazo de fetch en un error de red, no en un 500', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    const error = await admin.cluster().catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).esDeRed).toBe(true)
    expect((error as ApiError).status).toBe(0)
  })

  it('reporta el timeout como tal', async () => {
    const abort = new Error('tardó demasiado')
    abort.name = 'TimeoutError'
    fetchMock.mockRejectedValue(abort)
    await expect(admin.cluster()).rejects.toThrow('tiempo de espera agotado')
  })
})

describe('pagos.iniciar', () => {
  /* El 429 del antifraude es el resultado ESPERADO de la demostración, no una
     falla: tiene que volver como dato para que la pantalla lo muestre como
     éxito de la prueba, no como excepción. */
  it('devuelve el 429 del antifraude como dato', async () => {
    fetchMock.mockResolvedValue(respuesta(429, { message: 'Demasiados intentos detectados.' }))
    const r = await pagos.iniciar({ clientId: 'ismael', amount: 15000, transactionId: 'TX-1' })
    expect(r.status).toBe(429)
    expect(r.body.message).toContain('Demasiados intentos')
  })

  it('devuelve url y token en el camino feliz', async () => {
    fetchMock.mockResolvedValue(respuesta(200, { url: 'https://webpay/x', token: 'tok_123' }))
    const r = await pagos.iniciar({ clientId: 'ismael', amount: 15000, transactionId: 'TX-1' })
    expect(r.status).toBe(200)
    expect(r.body).toEqual({ url: 'https://webpay/x', token: 'tok_123' })
  })

  it('tolera un 400 de Spring sin cuerpo JSON', async () => {
    const res = {
      ok: false,
      status: 400,
      json: () => Promise.reject(new SyntaxError('Unexpected end of JSON input')),
    } as unknown as Response
    fetchMock.mockResolvedValue(res)
    const r = await pagos.iniciar({ clientId: '', amount: 0, transactionId: 'TX-1' })
    expect(r.status).toBe(400)
    expect(r.body).toEqual({})
  })

  it('lanza error de red si el servicio no responde', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    await expect(pagos.iniciar({ clientId: 'a', amount: 1, transactionId: 'TX' })).rejects.toThrow(
      'el servicio de pagos no responde',
    )
  })

  it('manda JSON por POST al endpoint de iniciar', async () => {
    fetchMock.mockResolvedValue(respuesta(200, { url: 'u', token: 't' }))
    await pagos.iniciar({ clientId: 'ismael', amount: 15000, transactionId: 'TX-1' })
    expect(urlLlamada()).toBe('http://localhost:8083/api/pagos/iniciar')
    const op = opcionesLlamada()
    expect(op.method).toBe('POST')
    expect(JSON.parse(String(op.body))).toEqual({
      clientId: 'ismael',
      amount: 15000,
      transactionId: 'TX-1',
    })
  })
})

describe('armado de URL', () => {
  /* Un userId con espacios o acentos sin codificar rompe el query string. */
  it('codifica el userId del Top', async () => {
    fetchMock.mockResolvedValue(respuesta(200, []))
    await recomendaciones.top('user test/1')
    expect(urlLlamada()).toBe('http://localhost:8084/api/recomendaciones?userId=user%20test%2F1')
  })

  it('codifica el nombre del tópico en la ruta', async () => {
    fetchMock.mockResolvedValue(respuesta(200, { nombre: 'a/b' }))
    await admin.topico('a/b')
    expect(urlLlamada()).toBe('http://localhost:8085/api/topicos/a%2Fb')
  })

  it('codifica el grupo al pedir el desfase', async () => {
    fetchMock.mockResolvedValue(respuesta(200, { groupId: 'g', lagTotal: 0, detalles: [] }))
    await admin.lag('payment velocity')
    expect(urlLlamada()).toBe('http://localhost:8085/api/consumer-groups/payment%20velocity/lag')
  })

  it('elimina un tópico con DELETE', async () => {
    fetchMock.mockResolvedValue(respuesta(200, 'borrado', { texto: true }))
    await admin.eliminarTopico('demo')
    expect(urlLlamada()).toBe('http://localhost:8085/api/topicos/demo')
    expect(opcionesLlamada().method).toBe('DELETE')
  })
})

describe('respuestas exitosas', () => {
  it('devuelve el cuerpo parseado', async () => {
    const cluster = { cantidadBrokers: 3, controlador: 1, brokers: [{ id: 1, host: 'kafka1:29092' }] }
    fetchMock.mockResolvedValue(respuesta(200, cluster))
    await expect(admin.cluster()).resolves.toEqual(cluster)
  })

  it('devuelve el texto plano de los endpoints que no son JSON', async () => {
    fetchMock.mockResolvedValue(respuesta(200, 'Interacción registrada', { texto: true }))
    await expect(
      recomendaciones.interactuar({
        clientId: 'u',
        itemId: 'item_101',
        action: 'view',
        category: 'c',
        productType: 't',
      }),
    ).resolves.toBe('Interacción registrada')
  })
})
