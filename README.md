# Pedidos360 — Consola de operaciones (DSY1107 EV3)

Interfaz de operación y supervisión del backend de streaming con Kafka.

El backend está en un repositorio aparte:
[cloud-ev3-kafka](https://github.com/1samadhi/cloud-ev3-kafka)

## Qué contiene

Un archivo HTML autocontenido, sin dependencias ni compilación: se abre directamente en el
navegador. Cuatro pantallas:

| Pantalla | Qué hace | Servicio |
|---|---|---|
| **Pagos** | inicia pagos con Webpay y muestra el bloqueo por fraude | `:8083` |
| **Recomendaciones** | genera interacciones y consulta el Top 5 | `:8084` |
| **Telemetría** | lecturas en vivo por WebSocket, con simulador local | API Gateway |
| **Kafka** | tópicos, particiones, réplicas y desfase de los grupos | `:8085` |

## Uso

```bash
# con el backend corriendo, abrir el archivo en el navegador
xdg-open consola.html
```

El indicador de la barra lateral muestra qué servicios responden. Se consultan endpoints reales
porque son los únicos con CORS habilitado: pedir una ruta inexistente devolvería un bloqueo del
navegador incluso con el servicio arriba.

## Pagos

El botón **Ráfaga de 4** envía cuatro intentos seguidos con el mismo cliente para comprobar la
regla antifraude: los primeros responden 200 y a partir del tercero aparece el 429.

El antifraude cuenta por cliente, así que con identificadores distintos el contador arranca de
cero cada vez.

La redirección a Webpay se hace por **POST** con el campo `token_ws` dentro de un formulario
oculto. Transbank rechaza un `GET`.

Tarjetas del ambiente de integración, sin dinero real:

| Tarjeta | Número | CVV | Resultado |
|---|---|---|---|
| VISA | 4051 8856 0044 6623 | 123 | aprobada |
| MASTERCARD | 5186 0595 5959 0568 | 123 | rechazada |

RUT `11.111.111-1`, clave `123`, cualquier fecha futura.

## Recomendaciones

Los botones **Ver**, **Carrito** y **Comprar** publican una interacción con pesos 1, 2 y 3
respectivamente. El ranking se recalcula en el consumidor, por lo que la tabla se refresca un
segundo después.

## Telemetría

El campo de la URL existe porque el endpoint de API Gateway cambia cada vez que se recrea la
infraestructura, de modo que no conviene fijarlo en el código.

El navegador conecta con `wss://`; la función Lambda que envía los mensajes usa `https://` para
el mismo endpoint. Son dos esquemas distintos para la misma API.

Los mensajes llegan como **arreglo** de lecturas, no de una en una: la Lambda hace un envío por
lotes. El estado se indexa por identificador de camión para que cada uno tenga una sola tarjeta
que se actualiza.

El botón **Simular datos** inyecta lecturas generadas localmente, lo que permite trabajar la
interfaz sin infraestructura en la nube.

## Métricas

Tres métricas en tiempo real: camiones activos, lecturas por minuto y alertas de temperatura
sobre −10 °C.

## Pendiente

- Integración en el proyecto React con autenticación (Azure Entra ID / Cognito)
- Página de callback de Webpay en `/callback`
- Reconexión automática del WebSocket: API Gateway cierra la conexión a los 10 minutos de
  inactividad
