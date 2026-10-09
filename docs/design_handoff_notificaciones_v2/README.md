# Handoff: Panel de notificaciones (Spira)

## Resumen
Rediseño del panel de notificaciones de Spira que se abre desde la campana:
- Listado en orden cronológico, agrupado por Hoy / Ayer / Esta semana / Anteriores.
- Tarjeta nueva («C5»): encabezado con «Paciente» y «Protocolo», ícono chico junto al nombre.
- Alerta tipo toast que sale de la campana, muestra la misma tarjeta y vuelve a la campana.
- Dispensación en curso como tarjeta fija arriba del panel, con su progreso por pasos.

## Sobre los archivos
Los archivos de esta carpeta son **referencias de diseño hechas en HTML**: prototipos que muestran el aspecto y el comportamiento esperados. **No son código de producción para copiar.** La tarea es recrearlos en el entorno de la app (framework, componentes, set de íconos y tokens existentes).

- `Especificacion visual.html`: **empezar por acá.** Anatomía de la tarjeta con medidas numeradas, tipos, estados, formato de tiempo, alerta y animaciones, más capturas.
- `Notificaciones - Final.html`: prototipo interactivo. Los botones de arriba simulan una alerta nueva y el avance de una dispensación.
- `screenshots/`: capturas del prototipo (panel, alerta, dispensación en curso, entregada).

## Fidelidad
**Alta fidelidad.** Los colores, la tipografía, los espaciados y los tiempos son finales. Si la app ya tiene tokens equivalentes, usar esos.

## Componentes

### 1. Panel
- Anclado a la campana: 10px debajo, borde derecho alineado (right −6px), 452px de ancho.
- Fondo blanco, borde 1px `#E4DECF`, radio 14px, sombra `0 14px 34px rgba(20,48,46,.14)`.
- **Encabezado** (padding 14px 16px 12px):
  - «Notificaciones» en Schibsted Grotesk 15.5px 700.
  - Pastilla «N pendientes»: 11.5px 700 `#A6483B` sobre `rgba(166,72,59,.10)`, radio total, padding 2px 8px.
  - «Marcar como leídas»: 12px 600 `#61706C`, alineado a la derecha; en hover pasa a `#0F5F57` con fondo `#FBFAF6`.
- **Cuerpo con scroll**: max-height 540px, borde superior 1px `#E4DECF`.
- **Grupos**: encabezado sticky, Inter 10.5px 700, mayúsculas, tracking .12em, `#838C89`, línea 1px `#E4DECF`. Padding 10px 16px 6px.
- **Listado**: padding 2px 10px 8px, gap 6px.
- **Pie**: «Ver todas», 13px 600 `#0F5F57`, padding 12px, borde superior 1px.

### 2. Tarjeta de notificación (C5 · ícono junto al nombre)
Ver la sección 01 de la especificación visual.

**Contenedor**
- Grid de una columna, padding 11px.
- Blanco, borde 1px `#E4DECF`, radio 10px, cursor pointer.

**Fila 1 · encabezado**
- Flex con gap 14px, centrado vertical.
- Padding inferior 6px, margen inferior 7px, borde inferior 1px **punteado** `#E4DECF`.
- `Paciente {código}` y `Protocolo {código}`: Inter 11px. La etiqueta va en `#838C89` y el valor en `#14302E` 600, con 3px de margen y `font-variant-numeric: tabular-nums`.
- A la derecha, la hora exacta: 11px 500 `#838C89`, alto mínimo 22px.

**Fila 2 · nombre**
- Flex con gap 8px, centrado vertical.
- Ícono: caja 20×20, radio 6px, glifo de 12px con trazo 2. Color y fondo según el tipo.
- Nombre: Inter 13px 600 `#14302E`, flex 1, una línea con ellipsis.
- Tiempo relativo: 11.5px 600 `#14302E`, nowrap.

**Fila 3 · motivo**
- Inter 12px `#61706C`, line-height 1.4, margen superior 3px.
- Máximo 2 líneas (line-clamp).

**Tipos de alerta**

| Tipo | Ícono (Lucide) | Trazo | Fondo |
|---|---|---|---|
| Reporte pendiente | clipboard-check | `#0F5F57` | `rgba(15,95,87,.09)` |
| Ventana vencida | alert-circle | `#A6483B` | `rgba(166,72,59,.09)` |
| Pendiente vencido | clock | `#8C6520` | `rgba(140,101,32,.10)` |
| Dispensación | pill | `#4A7248` | `rgba(74,114,72,.11)` |

**Estados**
- **No leída**:
  - Fondo `linear-gradient(rgba(15,95,87,.035)…), #fff`.
  - Punto de 6px `#A6483B` en left −6px, centrado vertical.
- **Hover**:
  - Borde `#D8CBB0`, fondo `#FBFAF6`, sombra `0 1px 2px rgba(20,48,46,.06)`, transición 140 ms.
  - La hora exacta baja a opacity 0 en 120 ms y en el mismo lugar aparece «Descartar»: botón circular de 24px con ícono trash de 14px en `#838C89`.
  - Hover sobre el botón: fondo `rgba(166,72,59,.12)`, ícono `#A6483B`.
- **Focus**: el botón Descartar se muestra también con `:focus-visible`.
- **Entrada de una tarjeta nueva**: translateY −6px → 0 con fade, en 500 ms `cubic-bezier(.2,.8,.3,1)`.

### 3. Alerta desde la campana (toast)
Ver la sección 05 de la especificación visual.

**Contenedor**
- 348px, misma posición que el panel.
- Blanco, borde 1px `#E4DECF`, radio 12px, misma sombra que el panel.
- Pico de 11×11 rotado 45°, a 19px del borde derecho, apuntando a la campana.

**Rótulo**
- Padding 8px 8px 0 14px.
- Punto de 6px del color del tipo, seguido del texto en Inter 10.5px 700, mayúsculas, tracking .1em, `#838C89`.
- Textos: «Nueva notificación» o «Dispensación actualizada».
- Botón cerrar de 22px a la derecha.

**Tarjeta**
- Es el mismo componente de la tarjeta del listado, sin borde y sin Descartar. Envoltorio con padding 4px 2px 2px.

**Barra de tiempo**
- 3px de alto, pista `#E4DECF`, relleno del color del tipo.
- Se vacía con `scaleX(1→0)` desde la derecha en 6000 ms lineal.
- Se pausa con hover.

**Movimiento**
- **Entrada**: 140 ms de retardo, luego scale .2→1 en 320 ms `cubic-bezier(.2,.9,.3,1.15)` y opacity en 220 ms ease. El `transform-origin` va en la campana (`calc(100% - 25px) -10px`).
- **Salida**: scale →.2 en 300 ms `cubic-bezier(.6,0,.8,.4)` y opacity en 250 ms con 50 ms de retardo.
- **Campana**: se sacude ±14° amortiguado en 700 ms. El punto rojo de 8px (borde blanco 2px) emite 2 pulsos (scale 1→2.6, 1,6 s).

### 4. Dispensación en curso (tarjeta fija)
Ver `screenshots/03-dispensacion.png`.

**Ubicación y contenedor**
- Arriba del listado, margen 10px 10px 4px.
- Borde 1px `rgba(15,95,87,.28)`, radio 12px.

**Cabecera**
- Fondo `#2E7D74`, texto `#F4F1EA`, padding 9px 12px.
- «Dispensación en curso» en Schibsted Grotesk 13px 700, seguido de la visita en 12px. Tiempo relativo a la derecha.

**Cuerpo** (padding 12px)
- Nombre con código y chip de protocolo; chip de estado a la derecha.
- Chip de estado: 11.5px 700, punto de 7px. Late (opacity .35, 1,4 s) mientras el estado no sea final.

**Pasos**
- Grid de 4 columnas: Solicitada → Preparando → Lista → Entregada.
- Cada paso tiene una barra de 4px (radio 2px), relleno del color del estado. El paso actual se llena con scaleX en 1,2 s.
- Debajo de la barra, el nombre (11px 600) y la hora del paso (10.5px `#838C89`). Si el paso no llegó, la hora es «—».

**Detalle**
- Separado por un borde 1px punteado `#D8CBB0`.
- Grid de dos columnas «Medicación» / «Pidió», 12px.

**Pie**
- Fondo `#FBFAF6`, borde superior 1px.
- Mensaje del estado a la izquierda y «Ver dispensación →» (12.5px 600 `#0F5F57`) a la derecha.

**Colores por estado**

| Estado | Color | Fondo del chip | Mensaje |
|---|---|---|---|
| Solicitada | `#61706C` | `rgba(97,112,108,.10)` | Farmacia recibió el pedido. |
| Preparando | `#8C6520` | `rgba(140,101,32,.10)` | {persona} está preparando la medicación. |
| Lista para retirar | `#0F5F57` | `rgba(15,95,87,.09)` | Ya podés retirarla en farmacia. |
| Entregada | `#4A7248` | `rgba(74,114,72,.11)` | Se entregó y pasó a Dispensaciones. |

## Comportamiento
- **Orden y grupos**:
  - Se agrupa por día calendario local: Hoy (0 días), Ayer (1), Esta semana (2–6), Anteriores (7 o más).
  - Dentro de cada grupo, de la más reciente a la más antigua.
- **Formato de tiempo**:
  - Relativo: `ahora` (< 1 min), `hace N min` (< 60 min), `hace N h` (< 24 h), `hace N d`. Se recalcula cada 30 s.
  - Exacta: `HH:mm h` para Hoy y Ayer; `D mmm, HH:mm h` para el resto (por ejemplo «3 oct, 08:00 h»), con el mes en minúscula y abreviado.
- **No leídas**:
  - El punto de la campana se ve mientras haya no leídas o una alerta sin ver.
  - Al abrir el panel, las tarjetas pasan a leídas a los 2,5 s.
  - «Marcar como leídas» lo hace de inmediato.
- **Alerta**:
  - Se muestra solo con el panel cerrado. Con el panel abierto, la tarjeta entra directo al listado con su animación.
  - Una alerta nueva reemplaza a la visible.
  - Clic en la alerta: abre el panel. Clic en la X: la cierra.
  - Si nadie la toca, se cierra sola a los 6 s y vuelve a la campana.
- **Dispensación**:
  - Cada cambio de estado lanza una alerta «Dispensación actualizada», que muestra el estado nuevo como motivo.
  - Al llegar a «Entregada», la tarjeta fija sale del panel y queda en el listado un registro de tipo Dispensación: «Dispensación entregada — {visita} · {medicación}». El registro pasa a la sección Dispensaciones.
- **Descartar**: ⚠️ el prototipo elimina directo para simplificar. **En producción tiene que abrir el flujo de descarte con motivo que ya está definido.**
- **Cierre del panel**: con clic afuera o con Escape.
- **Movimiento reducido**: con `prefers-reduced-motion`, todo pasa a fundido de opacidad de 150 ms, sin escala, sin sacudida y sin pulsos.

## Datos necesarios por notificación
```ts
type Notificacion = {
  id: string;
  tipo: 'reporte' | 'ventana' | 'vencido' | 'disp';
  paciente: { nombre: string; codigo: string };
  protocolo: string;
  motivo: string;      // texto completo de la fila 3
  creadaEn: string;    // ISO 8601
  leida: boolean;
};
type Dispensacion = {
  id: string; visita: string; paciente: {...}; protocolo: string;
  medicacion: string; pidio: string;
  estado: 0 | 1 | 2 | 3;              // Solicitada…Entregada
  horas: (string | null)[];           // ISO por paso
};
```
- Los cambios de estado de la dispensación y las notificaciones nuevas tienen que llegar en tiempo real (websocket, SSE o polling) para disparar la alerta.

## Tokens
- **Colores**:
  - ink `#14302E`, primary `#0F5F57`, track `#2E7D74`
  - paper `#F4F1EA`, surface `#FBFAF6`, white `#FFFFFF`
  - muted `#61706C`, faint `#838C89`, line `#E4DECF`, line2 `#D8CBB0`
  - danger `#A6483B`, good `#4A7248`, warn `#8C6520`
- **Tipografía**:
  - Schibsted Grotesk 600/700 para títulos.
  - Inter 400–700 para textos.
  - Cifras con `tabular-nums`.
- **Radios**: tarjeta 10px, alerta 12px, panel 14px, ícono 6px, chips de radio total.
- **Sombras**:
  - sm `0 1px 2px rgba(20,48,46,.06)`
  - md `0 14px 34px rgba(20,48,46,.14)`

## Assets
- Íconos de [Lucide](https://lucide.dev): bell, clipboard-check, alert-circle, clock, pill, trash, x, arrow-right. Si la app ya usa un set equivalente, conviene usar ese.
- No hay imágenes.

## Pendiente antes de producción
- Reemplazar los datos de ejemplo (nombres, códigos, horas, medicación), que son inventados.
- Conectar «Descartar» con el flujo de descarte con motivo.
- Conectar la alerta y la tarjeta de dispensación a los eventos reales de cambio de estado.
