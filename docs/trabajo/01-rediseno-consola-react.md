# 01 · Rediseño de la consola a React + TypeScript

Commits `a710fb1` (rediseño) y `7f0c5ca` (favicon).

## Qué se hizo

Se reemplazó `consola.html` —un único archivo de 516 líneas con HTML, CSS y JS
en línea— por una aplicación React 19 + TypeScript con Vite, servida por la
misma imagen nginx, ahora multietapa.

## Por qué, más allá de lo estético

El hallazgo que reorientó la tarea: **el frontend usaba 7 de los 13 endpoints
que el backend ofrece**. La pantalla de Kafka era la más desaprovechada —
listaba tópicos y nada más, mientras su propio README prometía particiones,
réplicas y desfase de los grupos, y mostraba un aviso que decía *"todavía no
está construido"* sobre un microservicio que sí existía y funcionaba.

Los seis endpoints sin usar eran el plano de obra del rediseño, no un detalle.

## Estructura resultante

```
src/
  config.ts              URL base leídas de config.js (runtime, no build)
  lib/types.ts           espejo exacto de los DTO de Spring
  lib/api.ts             cliente HTTP tipado, único lugar que habla con la API
  lib/catalogo.ts        catálogo de productos y tarjetas de prueba
  lib/format.ts          formateo de moneda, números y fechas
  components/ui.tsx      primitivas: Card, Table, Badge, Metric, Notice…
  components/Shell.tsx   navegación lateral y cabecera de página
  hooks/                 useHealth, useLog, useAsync
  screens/               una pantalla por ruta
  styles/globals.css     tokens de diseño
mocks/servidor-mock.mjs  los tres microservicios simulados
```

Las pantallas quedan finas a propósito: la lógica vive en `lib/` y `hooks/`, que
es lo que después se pudo testear (documento 04).

## Decisiones y sus motivos

| Decisión | Motivo |
|---|---|
| React + Vite en lugar de seguir con un archivo suelto | había que cubrir 6 endpoints más y agregar una ruta `/callback`; en un archivo de 516 líneas eso no escala |
| Se conservó `config.js` generado por el entrypoint | las URL base siguen fuera del bundle: la misma imagen sirve en local y en AWS sin recompilar |
| Se conservó la política de **no** poner `proxy_pass` en nginx | fue una observación explícita del docente en la EV2 |
| Dark-mode nativo, estilo Linear/Vercel | la elevación se expresa subiendo la opacidad del blanco (0.02 → 0.04 → 0.06), no con sombras, que sobre negro son invisibles |
| `Inter` con `font-feature-settings: 'cv01','ss03'` | sin esas alternativas tipográficas es Inter genérica |
| Un `mocks/servidor-mock.mjs` versionado | el backend real necesita Docker, Kafka, MySQL y Transbank sólo para mirar la interfaz |
| `/callback` fuera del `Shell` | es una pantalla de resultado, no una sección de la consola |
| Los tópicos del enunciado no ofrecen botón de eliminar | un clic distraído dejaría la demostración sin datos (el backend igual los protege) |

## Lo que se recuperó del backend

`ProductoEnriquecidoDTO` traía `imagenUrl` y `calificacion` y la tabla anterior
los descartaba. Ahora se muestran; cuando no hay imagen se dibuja la inicial del
producto, porque un cuadro gris vacío se lee como un error de carga.

## Verificación

- `npm run build` (tsc + vite) limpio.
- Las cuatro pantallas y el callback recorridas en el navegador contra el mock:
  la ráfaga antifraude devuelve `200 · 200 · 200 · 429`, el bloqueo aparece en
  las tres vistas que lo muestran, el detalle de tópico y el desfase cargan.

Bugs que **sólo** aparecieron mirando la pantalla, no compilando:

- filas de formulario desalineadas cuando un campo tenía texto de ayuda;
- columnas numéricas que flotaban lejos de su encabezado;
- marcos de imagen vacíos que parecían fallos de carga;
- offsets de Kafka formateados con separador de miles (`1.200`), que se leen como
  decimales cuando en realidad son posiciones en el log.

## Trampas para quien siga

- `StrictMode` invoca los efectos dos veces en desarrollo, así que las cargas al
  montar se registran duplicadas en el log. Es sólo en desarrollo.
- La plantilla de Vite deja su propio favicon y un sprite de iconos en `public/`;
  se reemplazaron en `7f0c5ca`.
- `write_file` se niega a sobrescribir un archivo que no se leyó completo en la
  sesión. Para reemplazos totales, borrarlo primero.
