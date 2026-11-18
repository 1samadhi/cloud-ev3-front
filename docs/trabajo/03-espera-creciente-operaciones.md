# 03 · Espera creciente en la lectura de Operaciones

Commit `bb5bc5b`.

## El problema

La pantalla de Operaciones leía `:8084/api/metricas` y `:8083/api/alertas` con un
`setInterval` fijo de 5 segundos. Con un servicio caído eso significaba una
petición cada 5 segundos para siempre, y la **misma línea de error repetida en
cada vuelta**, justo cuando el registro es lo único que sirve para diagnosticar.

## Qué se hizo

`src/lib/backoff.ts` — la progresión, como funciones puras:

```
siguienteEspera(fallos)  →  5s, 5s, 10s, 20s, 40s … techo de 60s
debeRendirse(fallos)     →  true a los 5 fallos consecutivos
describirEspera(ms)      →  "5 s", "1 min", "1,5 min"
```

`src/hooks/usePolling.ts` — el ciclo, que la consume. Expone
`{ activo, fallos, esperaMs, rendido, iniciar, detener }`.

## Decisiones y sus motivos

| Decisión | Motivo |
|---|---|
| `setTimeout` reprogramado, no `setInterval` | la espera cambia entre iteraciones; y un intervalo fijo dispara la lectura siguiente aunque la anterior siga en vuelo, encolando peticiones contra un servicio que ya no da abasto |
| Una caída **parcial** no castiga el intervalo | con `:8084` vivo y `:8083` caído el tablero sigue sirviendo; sólo cuenta como fallo cuando no responde ninguno de los dos |
| El error de cada servicio se anota sólo cuando **cambia** | repetirlo en cada vuelta tapa el resto del registro |
| Sin *jitter* | el jitter existe para que N clientes no golpeen a la vez; acá hay una consola por operador, y sin jitter la progresión es determinista y testeable |
| El exponente se acota antes de elevar | `2**1024` es `Infinity`, y multiplicarlo por la base da `NaN`: un `setTimeout(NaN)` dispara de inmediato, o sea lo contrario del backoff |
| La tarea **lanza** para marcar fallo | mantiene el hook agnóstico de qué se está leyendo |
| Se corta tras 5 fallos y se avisa en pantalla | insistir contra algo que no está no lo va a resucitar |

## Verificación

Diez tests con timers falsos (ver documento 04), y además el ciclo completo
observado en el navegador: se activó la lectura, se mató el mock, y el registro
quedó así —

```
fallo 1/5 (ningún servicio respondió); próximo intento en 5 s
fallo 2/5 … en 10 s     fallo 3/5 … en 20 s     fallo 4/5 … en 40 s
5 fallos seguidos: se detiene la lectura automática
```

Con los servicios de vuelta se recuperó solo: `los servicios responden de nuevo,
se vuelve al intervalo normal`.

## Para quien siga

- `usePolling` asigna sus refs en un efecto, no durante el render, y se
  reprograma a través de un ref. Las dos cosas son deliberadas: el linter de
  React marca ambos patrones si se hacen en el cuerpo del componente.
- La misma progresión la reutiliza la reconexión del WebSocket (documento 08).
  Si se cambia `lib/backoff.ts`, se cambian las dos.
