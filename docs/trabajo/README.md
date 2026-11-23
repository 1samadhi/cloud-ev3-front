# Bitácora de trabajo — Pedidos360

Un documento por tarea, para que quien siga no tenga que reconstruir el *por qué*
leyendo diffs.

El sistema son tres repositorios y la numeración es compartida: el 05 (backend) y el 06
(consola) son dos mitades de la misma tarea. **El índice completo, con las tareas 09–17 de la
EV3, está en `cloud-ev3-kafka/docs/trabajo/README.md`**, y el trabajo pendiente en
`cloud-ev3-kafka/docs/trabajo/PENDIENTES.md`.

> **Estado de la consola (22-11):** versión `v2.0.0`. Funciona contra el backend
> `v3.0.0-rc.1` (verificado en Docker: dashboard por WebSocket, administración de Kafka,
> pagos), pero todavía describe parte del sistema anterior: antifraude por `clientId`,
> catálogo viejo en `src/lib/catalogo.ts`, sin pantalla de RabbitMQ. Ponerla al día es el
> pendiente **P1**.

## En este repositorio (`cloud-ev3-front`, rama `ev3-integracion`)

| # | Tarea | Documento | Commit |
|---|---|---|---|
| 01 | Rediseño de la consola a React + TypeScript | [01-rediseno-consola-react.md](01-rediseno-consola-react.md) | `a710fb1`, `7f0c5ca` |
| 03 | Espera creciente en la lectura de Operaciones | [03-espera-creciente-operaciones.md](03-espera-creciente-operaciones.md) | `bb5bc5b` |
| 04 | Tests con Vitest | [04-tests-vitest.md](04-tests-vitest.md) | `0de2a16` |
| 06 | El sondeo de salud pasa a `/actuator/health` | [06-sondeo-de-salud.md](06-sondeo-de-salud.md) | `c863e44` |
| 08 | Reconexión automática del WebSocket | [08-reconexion-websocket.md](08-reconexion-websocket.md) | `ca4ea79` |

## En el repositorio del backend (`cloud-ev3-kafka`, rama `ev3-integracion`)

Las de la entrega 2.0.0; las 09–15 y 17 están en su índice.

| # | Tarea | Documento | Commit |
|---|---|---|---|
| 02 | El pago se confirma y vuelve al frontend | `docs/trabajo/02-callback-webpay.md` | `ce0b72f` |
| 05 | Actuator en los tres servicios y compose raíz | `docs/trabajo/05-actuator-y-compose.md` | `5bd9faf` |
| 07 | Las dos Lambdas y su infraestructura | `docs/trabajo/07-lambdas-telemetria.md` | `2f1d402` |

## Lo que conviene saber antes de tocar algo

- **Los dos repos van de la mano.** El compose del backend construye la imagen de
  este frontend desde `../cloud-ev3-front`, y `ms-pago` redirige a este origen
  después del commit de Webpay. Clonarlos uno al lado del otro.
- **El puerto 5173 no es decorativo** (8090 en Docker). Son orígenes que los siete
  microservicios autorizan por CORS y la base a la que `ms-pago` redirige con
  `origen=CONSOLA`. Cambiarlos obliga a cambiar `CORS_ORIGENES` y `FRONT_URL` en el backend.
- **Se levantó de verdad el 22-11** con el compose del backend (doc 17 del backend): el
  dashboard se conectó a `ws://localhost:8084/ws/metricas`. En AWS no se desplegó nada.
- **El pendiente de `EventosOperaciones` está resuelto**: ms-recomendaciones escribe el
  snapshot de métricas con `DYNAMODB_PUBLICAR_OPERACIONES=true` (doc 11 del backend).
