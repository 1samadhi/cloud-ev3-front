# Pedidos360 — Consola de operaciones (DSY1107 EV3)

Interfaz de operación y supervisión del backend de streaming con Kafka.

El backend está en un repositorio aparte:
[cloud-ev3-kafka](https://github.com/1samadhi/cloud-ev3-kafka)

## Qué contiene

Aplicación React servida como estáticos por nginx. Cinco pantallas:

| Ruta | Qué hace | Servicio |
|---|---|---|
| `/pagos` | inicia pagos con Webpay y demuestra el bloqueo por fraude | `:8083` |
| `/recomendaciones` | genera interacciones y consulta el Top del usuario | `:8084` |
| `/operaciones` | métricas y alertas en vivo por WebSocket o lectura directa | API Gateway |
| `/kafka` | clúster, tópicos, particiones, grupos de consumo y desfase | `:8085` |
| `/callback` | resultado de la transacción al volver de Webpay | — |

Stack: React 19 · TypeScript · Vite · React Router · nginx

## Desarrollo

```bash
npm install
npm run dev          # http://localhost:5173
```

El puerto **5173 no es negociable**: es el origen que los tres microservicios autorizan por
CORS (`CORS_ORIGENES`) y la base a la que `ms-pago` redirige después del commit (`FRONT_URL`).
Cambiarlo obliga a cambiar también esas variables en el backend.

### Sin levantar el backend

```bash
npm run mock         # en otra terminal: simula :8083, :8084 y :8085
npm run dev
```

El mock (`mocks/servidor-mock.mjs`) responde los mismos contratos que los DTO de Spring, con
antifraude y ranking simulados en memoria. Sirve para trabajar la interfaz sin Docker, Kafka,
MySQL ni Transbank — **no** para la evidencia de la evaluación, porque no publica en Kafka.

También expone `/actuator/health` en los tres puertos. Para ver el estado *degradado* sin
apagar nada:

```bash
curl "http://localhost:8085/mock/degradar?valor=1"   # health -> DOWN (503)
curl "http://localhost:8085/mock/degradar?valor=0"   # vuelve a UP
```

## Despliegue

El `docker-compose.yml` de la raíz del **backend** ya construye esta imagen y la publica en
`:8090`, esperando a que los tres microservicios estén sanos. Para eso espera este repositorio
clonado al lado del suyo. Lo de abajo es el camino manual, imagen sola.

```bash
npm run build        # genera dist/
docker build -t pedidos360-front .
docker run -p 8090:80 \
  -e API_PAGOS=http://localhost:8083 \
  -e API_RECOMENDACIONES=http://localhost:8084 \
  -e API_ADMIN=http://localhost:8085 \
  -e WS_URL=wss://xxxx.execute-api.us-east-1.amazonaws.com/production \
  pedidos360-front
```

nginx y no un archivo abierto a mano: un archivo `file://` tiene origen `null`, y un origen
null sólo pasa el CORS con el comodín `*`. Como los microservicios declaran la ruta concreta
del frontend, el front necesita un origen HTTP real.

### Configuración en tiempo de arranque

Las URL base **no se compilan dentro del bundle**. `docker-entrypoint.sh` genera `config.js` en
cada arranque a partir de variables de entorno, y el HTML lo carga antes del bundle. Así la
misma imagen sirve en local y en AWS sin reconstruirse.

| Variable | Default |
|---|---|
| `API_PAGOS` | `http://localhost:8083` |
| `API_RECOMENDACIONES` | `http://localhost:8084` |
| `API_ADMIN` | `http://localhost:8085` |
| `WS_URL` | vacío (el tablero cae a lectura directa) |

En desarrollo el mismo archivo vive en `public/config.js` con los valores locales.

## Pagos

El botón **Ráfaga de 4** envía cuatro intentos seguidos con el mismo cliente para comprobar la
regla antifraude: los primeros responden 200 y a partir del tercero aparece el 429.

El antifraude cuenta por `clientId`, así que con identificadores distintos el contador arranca
de cero cada vez.

La redirección a Webpay se hace por **POST** con el campo `token_ws` dentro de un formulario
oculto, en la misma pestaña. Transbank rechaza un `GET`.

Tarjetas del ambiente de integración, sin dinero real:

| Tarjeta | Número | CVV | Resultado |
|---|---|---|---|
| VISA | 4051 8856 0044 6623 | 123 | aprobada |
| MASTERCARD | 5186 0595 5959 0568 | 123 | rechazada |

RUT `11.111.111-1`, clave `123`, cualquier fecha futura.

## Callback

Transbank vuelve con un **POST** y una SPA estática no puede leer el cuerpo de un POST. Por eso
el `returnUrl` apunta a `ms-pago` y no acá:

```
Webpay --POST token_ws--> :8083/api/pagos/commit --302--> /callback?estado=...
```

`/callback` sólo presenta lo que el backend ya resolvió: lee `estado`, `orden`, `cliente`,
`monto`, `autorizacion`, `tarjeta` y `fecha` del query string. Si la pantalla aparece sin datos,
el `returnUrl` de `ms-pago` no está apuntando al commit.

## Recomendaciones

**Ver**, **Carrito** y **Comprar** publican una interacción con pesos 1, 2 y 3. El ranking se
recalcula en el consumidor, por lo que la tabla se refresca un segundo después de publicar.

El catálogo (`src/lib/catalogo.ts`) vive en el frontend porque el tópico espera `category` y
`productType`, y `ms-recomendaciones` no expone un endpoint de catálogo.

## Operaciones

El campo de la URL existe porque el endpoint de API Gateway cambia cada vez que se recrea la
infraestructura, de modo que no conviene fijarlo en el código.

El navegador conecta con `wss://`; la función Lambda que envía los mensajes usa `https://` para
el mismo endpoint. Son dos esquemas distintos para la misma API.

Los mensajes llegan como **arreglo** de eventos, no de uno en uno: la Lambda hace un envío por
lotes. Cada elemento se enruta según su forma (`productosMasVistos` → métricas,
`bloqueosActivos` → alertas).

### Reconexión

API Gateway **cierra la conexión a los 10 minutos de inactividad**, y el cierre no llega como
error. Sin reconexión, un tablero que se deja abierto durante la presentación deja de recibir
datos en silencio: nada lo delata hasta que alguien nota que los números no se mueven.

`useWebSocket` reconecta solo con la misma progresión creciente de la lectura directa (2 → 4 →
8 → 16 → 30 s) y se rinde tras 5 intentos, avisando en pantalla. Si el endpoint cambió porque
se recreó la infraestructura, insistir cada segundo no lo va a resucitar.

Un cierre que **pidió el usuario** no dispara reconexión: sin esa distinción, pulsar
*Desconectar* reabriría el socket que se acaba de cerrar.

**Leer de los servicios** consulta `:8084/api/metricas` y `:8083/api/alertas`: las mismas
métricas que después llegan empujadas, pero sin depender de AWS.

### Espera creciente

El ciclo no tiene un intervalo fijo. Mientras los servicios responden lee cada 5 s; con cada
fallo consecutivo duplica la espera (5 → 10 → 20 → 40 s, con techo de 60 s) y tras **5 fallos
seguidos se detiene** y lo dice en pantalla, en vez de martillar un servicio caído para
siempre. Una lectura exitosa devuelve el ciclo al intervalo base.

Dos detalles que importan al leer el registro:

- El error de cada servicio se anota sólo cuando **cambia**. Repetir la misma línea en cada
  vuelta tapa el resto del registro justo cuando hace falta para diagnosticar.
- Una caída parcial no castiga el intervalo: con `:8083` abajo y `:8084` arriba el tablero
  sigue sirviendo, así que sólo cuenta como fallo cuando **ninguno** de los dos responde.

Se reprograma un `setTimeout` en lugar de usar `setInterval` porque la espera cambia entre
iteraciones y porque un intervalo fijo dispara la lectura siguiente aunque la anterior siga en
vuelo, encolando peticiones contra un servicio que ya no da abasto.

## Kafka

Cubre los siete endpoints del microservicio administrador: clúster y brokers, lista de tópicos,
detalle con configuración efectiva y particiones, creación y borrado, grupos de consumo y
desfase por partición.

`payment-attempts` e `interacciones-user` no ofrecen botón de eliminar: son los tópicos del
enunciado y un clic distraído dejaría la demostración sin datos.

## Salud de los servicios

El punto de la barra lateral lee `GET /actuator/health` de cada servicio cada 20 segundos, y
distingue **tres** estados en lugar de dos:

| Punto | Estado | Qué pasó |
|---|---|---|
| verde | `arriba` | 200 con `status: UP` |
| ámbar | `degradado` | 503 con `status: DOWN`, o cualquier otra respuesta HTTP |
| rojo | `caido` | fallo de red: el proceso no atiende |

La distinción importa: un 503 de Actuator significa que **el servicio está vivo y una
dependencia suya no** (la base, o el clúster de Kafka en el caso del administrador). Pintarlo
rojo mandaría a revisar el servicio equivocado. El cuerpo del 503 trae el detalle por
componente y queda disponible en `detalle` del hook.

Sólo `status 0` —el que `ApiError.esDeRed` identifica— cuenta como caído.

Antes se sondeaba un endpoint de negocio por servicio, y antes de eso un
`POST /api/pagos/iniciar` con cliente vacío para provocar un 400. Funcionaba, pero mezclaba el
monitoreo con la operación: ensuciaba los logs del servicio y dependía de que la validación
siguiera rechazando ese cuerpo.

Requiere que el backend tenga `/actuator/**` en su mapeo de CORS; sin eso el navegador bloquea
la respuesta y los tres servicios aparecen caídos estando arriba.

## Tests

```bash
npm test          # una corrida
npm run test:watch
```

Vitest con entorno jsdom. Cubren la lógica donde un error es silencioso en runtime:

| Suite | Qué fija |
|---|---|
| `lib/api.test.ts` | el cliente HTTP con `fetch` simulado: de qué campo saca el mensaje cada servicio (`mensaje`, `message`, `error`, texto plano), que un fallo de red sea `status 0` y no un 500, que el **429 del antifraude vuelva como dato y no como excepción**, y que los identificadores se codifiquen en la URL |
| `hooks/usePolling.test.ts` | el ciclo con timers falsos: progresión de la espera, que se rinda al quinto fallo, que se recupere, que no solape lecturas y que corte el timer al desmontar |
| `lib/backoff.test.ts` | la progresión de la espera y el techo, incluido el caso de contador absurdo que daría `NaN` |
| `lib/transbank.test.ts` | la normalización de estados: el SDK responde `AUTHORIZED`/`FAILED` y ms-pago `ANULADO`/`ERROR`, y un estado **ausente no es un rechazo** |
| `hooks/useWebSocket.test.ts` | la reconexión con un WebSocket simulado: que reconecte sólo ante un cierre no pedido, la progresión de la espera, que se rinda, y que *Desconectar* no reabra |
| `hooks/useHealth.test.ts` | el sondeo de salud: que pegue a `/actuator/health` y no a `/api`, y que un 503 sea *degradado* y no *caído* |
| `lib/format.test.ts` | que `fechaHora` no corra 3 horas la fecha sin zona de Spring, y que `0` no se muestre como `—` |

No hay tests de renderizado de pantallas: el valor estaba en la lógica, y las pantallas se
verifican contra el mock en el navegador.

## Estructura

```
src/
  config.ts              URL base leídas de config.js (runtime, no build)
  lib/api.ts             cliente HTTP tipado de los tres servicios
  lib/types.ts           espejo de los DTO de Spring
  lib/catalogo.ts        catálogo de productos y tarjetas de prueba
  components/ui.tsx      primitivas: Card, Table, Badge, Metric, Notice…
  components/Shell.tsx   navegación lateral y cabecera de página
  lib/backoff.ts         progresión de la espera creciente
  lib/transbank.ts       estados de Webpay normalizados
  hooks/                 useHealth, useLog, useAsync, usePolling, useWebSocket
  screens/               una pantalla por ruta
  styles/globals.css     tokens de diseño
mocks/servidor-mock.mjs  los tres microservicios simulados
```

Los tests viven junto al archivo que prueban (`lib/api.ts` + `lib/api.test.ts`).
