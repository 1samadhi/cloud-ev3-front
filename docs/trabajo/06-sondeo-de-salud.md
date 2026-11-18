# 06 · El sondeo de salud pasa a `/actuator/health`

Commit `c863e44`. Es la mitad frontend de la tarea 05, que agregó Actuator a los
tres microservicios (ver `docs/trabajo/05-actuator-y-compose.md` en el backend).

## De dónde venía

El punto de estado de la barra lateral se calculaba **llamando a endpoints de
negocio**. En la versión original era peor: un `POST /api/pagos/iniciar` con
cliente vacío cada 15 segundos, para provocar un 400 y deducir que el servicio
estaba vivo. Funcionaba, pero:

- escribía ruido en los logs del servicio;
- dependía de que la validación siguiera rechazando ese cuerpo exacto;
- y no distinguía *el servicio responde* de *el servicio puede trabajar*.

El rediseño ya lo había cambiado a tres `GET` idempotentes (`/api/alertas`,
`/api/metricas`, `/api/cluster`). Mejor, pero seguía mezclando monitoreo con
operación.

## Qué se hizo

Ahora se lee `GET /actuator/health` de cada servicio cada 20 segundos, y hay
**tres** estados donde antes había dos:

| Punto | Estado | Qué pasó |
|---|---|---|
| verde | `arriba` | 200 con `status: UP` |
| ámbar | `degradado` | 503 con `status: DOWN`, o cualquier otra respuesta HTTP |
| rojo | `caido` | fallo de red: el proceso no atiende |

## Por qué importan los tres estados

Un 503 de Actuator significa que **el servicio está vivo y una dependencia suya
no** — la base de datos, o el clúster de Kafka en el caso del administrador.
Pintarlo rojo mandaría a revisar el servicio equivocado. El cuerpo del 503 trae
el detalle por componente y queda disponible en `detalle` del hook para quien
quiera mostrarlo.

Sólo `status 0`, el que identifica `ApiError.esDeRed`, cuenta como caído.

## Dependencia del backend

Requiere que el mapeo de CORS cubra `/actuator/**`, no sólo `/api/**`. Sin eso el
navegador bloquea la respuesta y los tres servicios aparecen **caídos estando
arriba** — es el síntoma más confuso posible, porque `curl` los muestra sanos.

## El mock también lo expone

`mocks/servidor-mock.mjs` sirve `/actuator/health` en los tres puertos, con un
interruptor para poder ver el estado degradado sin apagar nada:

```bash
curl "http://localhost:8085/mock/degradar?valor=1"   # health -> DOWN (503)
curl "http://localhost:8085/mock/degradar?valor=0"   # vuelve a UP
```

## Verificación

Siete tests (documento 04) y los tres estados observados en el navegador:

```
sano       → "3 de 3 sanos"                     puntos verdes
degradado  → "0 de 3 sanos · 3 degradados"      puntos ámbar
caído      → "0 de 3 sanos"                     puntos rojos
```
