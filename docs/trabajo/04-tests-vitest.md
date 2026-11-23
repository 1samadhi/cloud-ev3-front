# 04 · Tests con Vitest

Commit `0de2a16`. Ampliados en `c863e44` y `ca4ea79`.

## Qué hay

**75 tests en 7 suites**, Vitest con entorno jsdom.

```bash
npm test          # una corrida
npm run test:watch
```

| Suite | Qué fija |
|---|---|
| `lib/api.test.ts` | de qué campo saca el mensaje de error cada servicio (`mensaje`, `message`, `error`, texto plano), que un fallo de red sea `status 0` y no un 500, que el **429 del antifraude vuelva como dato y no como excepción**, y que los identificadores se codifiquen al armar la URL |
| `hooks/usePolling.test.ts` | el ciclo con timers falsos: progresión de la espera, corte al quinto fallo, recuperación, no solapar lecturas, cortar el timer al desmontar |
| `hooks/useWebSocket.test.ts` | la reconexión con un WebSocket simulado (jsdom no trae WebSocket) |
| `hooks/useHealth.test.ts` | que el sondeo pegue a `/actuator/health` y **nunca** a `/api`, y que un 503 sea *degradado* y no *caído* |
| `lib/backoff.test.ts` | la progresión y el techo, incluido el contador absurdo que daría `NaN` |
| `lib/transbank.test.ts` | normalización de estados: el SDK responde `AUTHORIZED`/`FAILED` y ms-pago `ANULADO`/`ERROR`; un estado **ausente no es un rechazo** |
| `lib/format.test.ts` | que `fechaHora` no corra 3 horas la fecha sin zona de Spring, y que `0` no se muestre como `—` |

## El criterio: qué se testea y qué no

Se testea **la lógica donde un error es silencioso en producción**. Un color mal
puesto se ve; que un 429 se convierta en excepción y la demostración del
antifraude muestre un error rojo en lugar de un éxito, no.

**No hay tests de renderizado de pantallas.** El valor estaba en la lógica, y las
pantallas se verifican contra el mock en el navegador, que además encuentra cosas
que un test de render no (alineaciones, formatos de número, marcos vacíos).

## Refactors que los tests forzaron, para bien

- La clasificación de estados de Webpay estaba enterrada en `CallbackScreen` y
  era intesteable. Salió a `lib/transbank.ts`.
- `usePolling` pasó a asignar sus refs en un efecto en vez de durante el render.
  Eran avisos legítimos del linter, no ruido.

## La suite se validó rompiendo el código a propósito

Una suite que pasa no prueba nada si nunca la vieron fallar. Se invirtió la
progresión del backoff (`siguienteEspera` devolviendo siempre la base) y
**6 tests se pusieron en rojo**, incluidos los del hook. Restaurado, 75 en verde.
Lo mismo con la reconexión: tratando todo cierre como intencional, 4 en rojo.

Si se toca `lib/backoff.ts` o `useWebSocket.ts`, conviene repetir el ejercicio.

## Avisos del linter que quedan

Cinco `set-state-in-effect` en pantallas que cargan datos al montar. Es el uso
correcto de un efecto —sincronizar con un sistema externo— y el linter se pone
estricto de más. No se silenciaron para no esconder apariciones futuras que sí
importen.
