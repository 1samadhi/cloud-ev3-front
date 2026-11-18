# Bitácora de trabajo — Pedidos360

Un documento por tarea, para que quien siga no tenga que reconstruir el *por qué*
leyendo diffs.

El trabajo se reparte en dos repositorios. Los números son los mismos en los dos
índices, así que el 05 y el 06 son dos mitades de la misma tarea.

## En este repositorio (`cloud-ev3-front`, rama `rediseno-react`)

| # | Tarea | Documento | Commit |
|---|---|---|---|
| 01 | Rediseño de la consola a React + TypeScript | [01-rediseno-consola-react.md](01-rediseno-consola-react.md) | `a710fb1`, `7f0c5ca` |
| 03 | Espera creciente en la lectura de Operaciones | [03-espera-creciente-operaciones.md](03-espera-creciente-operaciones.md) | `bb5bc5b` |
| 04 | Tests con Vitest | [04-tests-vitest.md](04-tests-vitest.md) | `0de2a16` |
| 06 | El sondeo de salud pasa a `/actuator/health` | [06-sondeo-de-salud.md](06-sondeo-de-salud.md) | `c863e44` |
| 08 | Reconexión automática del WebSocket | [08-reconexion-websocket.md](08-reconexion-websocket.md) | `ca4ea79` |

## En el repositorio del backend (`cloud-ev3-kafka`, rama `fix-callback-webpay`)

| # | Tarea | Documento | Commit |
|---|---|---|---|
| 02 | El pago se confirma y vuelve al frontend | `docs/trabajo/02-callback-webpay.md` | `ce0b72f` |
| 05 | Actuator en los tres servicios y compose raíz | `docs/trabajo/05-actuator-y-compose.md` | `5bd9faf` |
| 07 | Las dos Lambdas y su infraestructura | `docs/trabajo/07-lambdas-telemetria.md` | `2f1d402` |

## Lo que conviene saber antes de tocar algo

- **Los dos repos van de la mano.** El compose del backend construye la imagen de
  este frontend desde `../cloud-ev3-front`, y `ms-pago` redirige a este origen
  después del commit de Webpay. Clonarlos uno al lado del otro.
- **El puerto 5173 no es decorativo.** Es el origen que los tres microservicios
  autorizan por CORS y la base a la que `ms-pago` redirige. Cambiarlo obliga a
  cambiar `CORS_ORIGENES` y `FRONT_URL` en el backend.
- **Nada de esto se desplegó.** No hay Docker ni credenciales de AWS en el
  entorno donde se trabajó: cada documento dice explícitamente qué se verificó y
  qué no.
- **Hay un pendiente que cruza los dos repos**: ningún microservicio escribe
  todavía en la tabla `EventosOperaciones`, así que la telemetría en vivo se
  alimenta a mano. Está en el documento 07.
