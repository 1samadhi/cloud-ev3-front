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

## Despliegue

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

**Leer de los servicios** consulta `:8084/api/metricas` y `:8083/api/alertas` cada 5 segundos:
las mismas métricas que después llegan empujadas, pero sin depender de AWS.

## Kafka

Cubre los siete endpoints del microservicio administrador: clúster y brokers, lista de tópicos,
detalle con configuración efectiva y particiones, creación y borrado, grupos de consumo y
desfase por partición.

`payment-attempts` e `interacciones-user` no ofrecen botón de eliminar: son los tópicos del
enunciado y un clic distraído dejaría la demostración sin datos.

## Salud de los servicios

El punto de la barra lateral se calcula sondeando `GET /api/alertas`, `GET /api/metricas` y
`GET /api/cluster` cada 20 segundos. Son lecturas idempotentes y con CORS habilitado por el
mapeo `/api/**`.

Un 4xx también cuenta como "vivo": sólo un fallo de red marca el servicio como caído. Pedir una
ruta inexistente no sirve, porque la respuesta no lleva cabecera CORS y el navegador la bloquea
aunque el servicio esté arriba.

## Estructura

```
src/
  config.ts              URL base leídas de config.js (runtime, no build)
  lib/api.ts             cliente HTTP tipado de los tres servicios
  lib/types.ts           espejo de los DTO de Spring
  lib/catalogo.ts        catálogo de productos y tarjetas de prueba
  components/ui.tsx      primitivas: Card, Table, Badge, Metric, Notice…
  components/Shell.tsx   navegación lateral y cabecera de página
  hooks/                 useHealth, useLog, useAsync
  screens/               una pantalla por ruta
  styles/globals.css     tokens de diseño
mocks/servidor-mock.mjs  los tres microservicios simulados
```
