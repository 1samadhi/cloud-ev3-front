# 08 · Reconexión automática del WebSocket

Commit `ca4ea79`. Acompaña a la tarea 07, que creó las Lambdas y el API Gateway
(ver `docs/trabajo/07-lambdas-telemetria.md` en el backend).

## El bug, y de dónde salió

`ARQUITECTURA-PEDIDOS360.md` lo advertía en una línea: *API Gateway cierra la
conexión a los 10 minutos de inactividad, así que el front necesita reconectar*.

El front no reconectaba. Y el cierre **no llega como error**: un tablero dejado
abierto durante la presentación se quedaba sin datos en silencio, y nada lo
delataba hasta que alguien notaba que los números no se movían.

## Qué se hizo

El manejo del socket salió de `OperacionesScreen` a `src/hooks/useWebSocket.ts`,
que reconecta con la progresión de `lib/backoff` —la misma de la lectura
directa— y se rinde tras 5 intentos avisando en pantalla.

Estados que expone: `cerrado`, `conectando`, `conectado`, `reconectando`,
`rendido`.

## Decisiones y sus motivos

| Decisión | Motivo |
|---|---|
| Marca de **cierre intencional** | sin ella, pulsar *Desconectar* dispararía la reconexión del socket que se acaba de cerrar |
| Se desarman los handlers **antes** de cerrar el socket viejo | `onclose` reconectaría el socket que acabamos de descartar |
| Espera creciente (2 → 4 → 8 → 16 → 30 s) y rendirse | si la infraestructura se recreó y la URL cambió, insistir cada segundo no la va a resucitar |
| `clientId` nuevo en cada intento | API Gateway entrega un `connectionId` nuevo; reusar el anterior descorrelaciona la tabla de conexiones de la conexión viva |
| El `new WebSocket()` va en `try` | una URL mal formada lanza de forma sincrónica, sin pasar por `onerror` |
| La decisión de reconectar vive en `onclose`, no en `onerror` | `onerror` siempre viene seguido de `onclose`; decidir en los dos reconectaría dos veces |
| El aviso de *rendido* menciona la salida `url_websocket` de Terraform | es exactamente de dónde hay que sacar la URL nueva |

## Verificación

Nueve tests con un WebSocket simulado —jsdom no implementa WebSocket y, aunque
lo hiciera, haría falta un servidor— que cubren: reconexión sólo ante cierre no
pedido, progresión de la espera, rendirse, no reabrir al desconectar, y cerrar al
desmontar. Validados rompiendo la reconexión a propósito: 4 en rojo.

Y el ciclo completo en el navegador, apuntando a un puerto cerrado:

```
conexión perdida; reintento 1/5 en 2 s   … 2/5 en 4 s   … 3/5 en 8 s
… 4/5 en 16 s   … 5/5 en 30 s   5 reintentos sin éxito: se deja de reconectar
```

## Lo que NO está verificado

Nunca se probó contra un **API Gateway real**: no hay credenciales de AWS ni un
despliegue hecho. Lo que está comprobado es el ciclo de reconexión; el apretón de
manos contra el endpoint de verdad, no.
