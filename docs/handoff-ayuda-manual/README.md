# Handoff: Ayuda con preguntas + tutoriales, bajada «¿Qué puedo hacer acá?» y Manual de usuario

## Overview
Rediseño de la Ayuda de Spira. Hoy la Ayuda es un panel de preguntas frecuentes con un tutorial aparte y una píldora «Ver cómo se hace» con animación flotante. El rediseño:

1. **Junta preguntas y tutoriales** en un mismo panel lateral, organizado por módulo. La mayoría de las respuestas son un tutorial en video con capítulos; algunas son sólo texto.
2. **Reemplaza la píldora «Cómo se hace»** por una **bajada** debajo del título de cada pantalla: la descripción del submódulo + el enlace «¿Qué puedo hacer acá?». Al pasar el mouse abre un globo con el tutorial.
3. **Suma un Manual de usuario**: una página por tarea, con los pasos enlazados al segundo exacto del video.
4. **La animación vive en el botón de play**: un halo suave mientras el tutorial no se vio. Ya visto, el disco queda en contorno. No hay más animación flotante.

## About the design files
Los archivos de este paquete son **referencias de diseño hechas en HTML**: prototipos que muestran el aspecto y el comportamiento buscados, no código para producción. La tarea es **recrearlos en el código de Spira App** (React + TypeScript, `src/ayuda/`, `src/shell/AppShell.tsx`, `src/styles/tokens.css`) con sus patrones, componentes y tokens. No hay que copiar el HTML.

Contexto existente en el repo:
- `src/ayuda/reglas.ts`: tipos `Pregunta` y `ModuloAyuda` (`'general' | 'track' | 'pharma'`), `preguntasVisibles`, orden y búsqueda. **Se mantiene**; la búsqueda con texto sigue recorriendo todo lo visible, no sólo el módulo elegido.
- `src/ayuda/preguntas.ts`: contenido de las preguntas.
- `src/ayuda/AyudaTutorial.tsx`: el tutorial actual.
- `docs/plan-tutoriales.md`: plan previo (DD3, DD4, DD7, DD8b).

## Fidelity
**Alta fidelidad.** Colores, tipografía, espaciados y estados son los finales. Las capturas de video son espacios vacíos (rayas diagonales). Los tutoriales que no son «Dispensar» y todas las duraciones son de ejemplo.

## Archivos
- `Ayuda - Final.html`: prototipo interactivo (shell de la app + bajada + panel). Con «Estás en» se cambia de pantalla (Dispensaciones / Visitas / Inicio).
- `Manual de usuario.html`: página del manual, con «Dispensar» de ejemplo.
- `screenshots/`: capturas de referencia (ver abajo).

## Screenshots
| Archivo | Qué muestra |
|---|---|
| `01-ayuda.png` | Pantalla con la bajada debajo del título (estado de reposo) |
| `02-ayuda.png` | Globo abierto al pasar el mouse por «¿Qué puedo hacer acá?» |
| `03-ayuda.png` | Panel de Ayuda: Inicio (preguntas primero) |
| `04-ayuda.png` | Panel: pestaña Farmacia (tutorial con capítulos) |
| `05-ayuda.png` | Panel: preguntas y «Leer en el manual» al final del módulo |
| `06-ayuda.png` | Panel: pestaña Primeros pasos |
| `07-ayuda.png` | Panel: búsqueda («lote»), resultados de todos los módulos |
| `08-ayuda.png` | (extra del mismo recorrido) |

---

## 1. Bajada del encabezado

### Layout (no se modifica el layout actual)
El encabezado de cada pantalla hoy tiene padding `20px 26px 4px` y el contenido `.spira-content` arranca con `padding-top: 16px`. La bajada suma una línea de **16px** sin mover el contenido:
- Encabezado: `padding-top 20 → 12`, `padding-bottom 4 → 0`.
- Contenido: `padding-top 16 → 12`.
- Total: −8 −4 −4 + 16 = 0. **El contenido arranca a la misma altura que hoy.**
- **Sólo en pantallas con tutorial publicado.** Si no hay tutorial, el encabezado queda exactamente como hoy (sin bajada y con los paddings originales).

### Estructura
```
[miga: Spira Farmacia › Dispensaciones]
[H1: Dispensaciones]                                  [acción primaria]
[bajada: Entrega de medicación   (?) ¿Qué puedo hacer acá?]
```
- La bajada se alinea con el borde izquierdo del título y de la miga. No arranca más a la izquierda (`padding-left: 1px` para compensar el borde óptico de la H1).
- **Descripción**: es la misma descripción del submódulo que aparece en la barra lateral (p. ej. «Entrega de medicación», «Las visitas de hoy»). Inter 400, 12.5px / 16px, `--muted #7C8C87`.
- **Separación: sólo espacio**, `gap: 14px`. Sin punto, sin línea, sin barra.
- **Enlace «¿Qué puedo hacer acá?»**: Inter 500, 12.5px, color `--ink-soft #556966`, ícono «?» de 14px (círculo con trazo de 1.8), `gap 5px`, subrayado punteado (`text-decoration: underline dotted #A6B0AC; text-underline-offset: 3px`). Hover/foco: color `--ink #14302E`.
- `white-space: nowrap`.

### Globo (popup)
- **Se abre al pasar el mouse** (`:hover`) y con foco de teclado (`:focus-within`), sin clic. En tablet se abre con un toque.
- **Sale del enlace**: anclado debajo de «¿Qué puedo hacer acá?» (`top: 26px; left: -14px` respecto del enlace), con la flecha (cuadrado de 10px rotado 45°) apuntando al enlace, `left: 18px`.
- Un puente invisible de 14px entre el enlace y el globo deja mover el mouse hacia el globo sin que se cierre.
- Medidas: 340px de ancho, padding 14px, fondo blanco, borde `1px #D8CBB0`, radio 12px, sombra `0 14px 34px rgba(20,48,46,.16)`, `z-index` sobre el contenido.
- Contenido:
  1. Título del tutorial: Schibsted Grotesk 700, 14.5px.
  2. Resumen en 1–2 oraciones: Inter 12.8px / 1.5, `--ink-soft`. Los nombres de botones van resaltados (ver «Nombres de botones»).
  3. Video 16:9, radio 9px, play grande centrado (46px) con halo si no se vio, duración abajo a la derecha (`JetBrains Mono 11px`, fondo `rgba(20,48,46,.82)`).
  4. Pie: «N pasos» (12px, `--muted`) y, a la derecha, «Ver en la Ayuda» (600, `--primary`), que abre el panel en ese tutorial.
- El play dentro del globo también abre el panel en ese tutorial.

### Dónde va el tooltip «?» (otro patrón)
Para lugares sin espacio para la bajada, o donde haga falta información extra (un campo, un botón, una columna), se usa un ícono «?» chico que abre la misma pista al pasar el mouse. Esto **no** va en el encabezado de las pantallas.

---

## 2. Panel de Ayuda

### Apertura
- Desde el «?» al pie de la barra izquierda (rail): abre en **Inicio**.
- Desde la bajada / el globo: abre en la **pestaña del módulo**, con ese tutorial cargado.
- Panel lateral derecho de 440px y alto completo, que entra deslizándose (`transform .25s ease`).
- Fondo detrás: **velo oscuro suave, sin desenfoque** (`rgba(20,48,46,.22)`). Clic en el velo cierra.

### Encabezado del panel
1. Título «Ayuda» (Schibsted 700, 21px) y X para cerrar.
2. Buscador (40px de alto, radio 10px, borde `#D8CBB0`; en foco el borde pasa a `--muted`, **nunca verde**).
3. **Pestañas** (sólo sin texto en el buscador), de izquierda a derecha y en este **orden fijo**: **Inicio · Primeros pasos · Coordinación · Farmacia**.
   - Ocupan todo el ancho, repartidas (`flex: 1 1 auto`, centradas).
   - Cada pestaña lleva un ícono de línea redondeado de 15px, con color propio: Inicio = casa (`#14302E`), Primeros pasos = bandera (`#B07A1E`), Coordinación = calendario con tilde (`#2E7D74`), Farmacia = píldora (`#3F7A3A`).
   - Activa: texto `--ink` y borde inferior de 2px `--primary`. Inactiva: `--muted`.
   - **No hay** indicador de «dónde estás» (sin punto verde).
   - Sólo se muestran los módulos que el usuario tiene habilitados (`preguntasVisibles`).

### Inicio («preguntas primero»)
- «¿Qué querés hacer?» (Schibsted 700, 17px) y buscador grande (46px de alto, radio 12px).
- **Franja del manual** (ver §4).
- «LO MÁS CONSULTADO»: lista mixta de tutoriales y preguntas de texto de todos los módulos. Cada fila: ícono (play chico si es tutorial, círculo con líneas si es texto), título y, a la derecha, módulo y duración.
- «POR MÓDULO»: grilla de 3 mosaicos (ícono, nombre, «N tutoriales») que llevan a la pestaña.

### Pestaña de módulo
Es una sola vista, sin otro nivel:
1. Rótulo de sección: nombre de la pantalla y duración.
2. **Video** 16:9 con play grande (54px), barra de progreso de 4px abajo y tiempo «0:12 / 0:41».
3. Título del tutorial (Schibsted 700, 15px) y «Leer «…» en el manual» (enlace chico con ícono de libro).
4. **Capítulos**: un renglón por paso con número en un círculo, título en negrita, descripción y marca de tiempo (mono). Tocar un capítulo salta el video a ese segundo. El activo lleva fondo `#E6EFEC` y el número relleno `--primary`.
5. «PREGUNTAS»: acordeón. Mezcla las preguntas del tutorial y las de sólo texto del módulo. La primera abre por defecto. Si la respuesta corresponde a un paso, lleva «▶ 0:26 en el video», que salta a ese capítulo.
6. «OTROS TUTORIALES DE <MÓDULO>»: filas con miniatura (88px, 16:10, duración en la esquina) y «✓ Visto» si corresponde. Al tocar una, se carga en el mismo lugar.
7. Fila «<Módulo> en el manual» al final.

Qué tutorial se carga primero: el de la pantalla actual si existe, si no el primero sin ver del módulo, y si no el primero.

### Búsqueda
- Con texto, desaparecen las pestañas y se buscan **todos los módulos visibles** (regla vigente de `reglas.ts`).
- Se buscan título, resumen, capítulos, preguntas y respuestas.
- Resultados con la coincidencia resaltada (`<mark>` con fondo `#E6EFEC`) y el módulo a la derecha.
- Sin resultados: «Nada para «x».» y «Contanos qué buscabas».

### Pie del panel
«¿No está tu duda? **Contanos**» (abre el feedback existente).

### Estados del play (en todo el sistema)
- **No visto**: disco relleno `--primary` con play claro y halo animado (`scale 1 → 1.85`, `opacity .55 → 0`, 2.4s, infinito).
- **Visto**: disco blanco con borde de 1.5px `--primary` y play en `--primary`, sin halo.
- «Visto» se marca al reproducir. Persistirlo por usuario.
- Respetar `prefers-reduced-motion` (sin halo).

---

## 3. Nombres de botones dentro de textos
En la Ayuda, los nombres de botones van como un rótulo en lugar de entre comillas: Inter 600, color `--ink`, fondo `#F1EDE3`, borde `1px #E4DECF`, radio 5px, padding `0 5px`, `white-space: nowrap`. En el contenido se pueden seguir escribiendo con «» y el render las convierte.

---

## 4. Manual de usuario
### Accesos desde la Ayuda (variante «dentro del contenido»)
- Inicio: franja con fondo `#F1EDE3`, radio 12px, ícono de libro en un cuadro blanco de 40px, «Manual de usuario» y «Cada tarea explicada, con su video», y el botón oscuro «Abrir manual» (`--ink`, 34px de alto).
- Debajo de cada tutorial: «Leer <tarea> en el manual».
- Al final de cada módulo: fila «<Módulo> en el manual».

### Página del manual (`Manual de usuario.html`)
Tres columnas: índice (240px), artículo (máx. 720px) y «En este artículo» (220px). Por debajo de 980px queda una sola columna.
- **Índice**: agrupado por módulo, con el artículo activo resaltado en `#E6EFEC`. Los artículos con video llevan el play chico (con halo o en contorno, según si se vio).
- **Artículo**: miga, H2 de 28px, introducción y video.
- **Paso a paso**: lista numerada donde cada paso lleva una **marca de tiempo** a la derecha. Tocarla abre el tutorial en ese segundo.
- Nota destacada, por ejemplo «El lote no se escanea».
- «Preguntas frecuentes» del tema, en acordeón, al pie.
- Columna derecha: anclas del artículo y artículos relacionados.

---

## Design tokens
| Token | Valor |
|---|---|
| `--ink` | `#14302E` |
| `--primary` | `#0F5F57` |
| `--paper` (fondo de la app) | `#F4F1EA` |
| `--surface` | `#FBFAF6` |
| `--white` | `#FFFFFF` |
| `--muted` | `#7C8C87` |
| `--faint` | `#A6B0AC` |
| `--ink-soft` | `#556966` |
| `--line` | `#E4DECF` |
| `--line-2` | `#D8CBB0` |
| `--on-accent` | `#F4F1EA` |
| Verde claro (activo, resaltado) | `#E6EFEC` |
| Tono papel (rótulos, franja del manual) | `#F1EDE3` |

Tipografía: **Schibsted Grotesk** (títulos, 700), **Inter** (texto), **JetBrains Mono** (duraciones y marcas de tiempo, 11px).
Radios: 5 (rótulo), 8–10 (filas y controles), 12 (tarjetas y globo), 14 (paneles), 999 (chips).
Sombras: globo `0 14px 34px rgba(20,48,46,.16)`, panel `-14px 0 34px rgba(20,48,46,.14)`.

**Regla: nada de bordes verdes** en hover ni en foco. Usar fondos (`--paper`, `--surface`) o grises (`--muted`).

## Modelo de datos sugerido
Extiende lo que ya existe en `reglas.ts`:
```ts
interface Tutorial {
  id: string                 // estable
  modulo: ModuloAyuda
  pantalla?: string          // submódulo donde aparece en la bajada (p. ej. 'Dispensaciones')
  titulo: string
  resumen: string            // 1–2 oraciones para el globo
  duracion: string           // '0:41'
  video: string              // url
  capitulos: { titulo: string; texto: string; t: number }[]   // t en segundos
  preguntas?: { pregunta: string; respuesta: string; capitulo?: number }[]
  manual?: string            // slug del artículo
}
// Pregunta (existente) sigue sirviendo para las de sólo texto; `tutorial?` las vincula.
```
Estado por usuario: tutoriales vistos (`Set<id>`) y progreso.

## Accesibilidad
- El enlace de la bajada es un `<button>` que abre el globo con hover y con foco. `Esc` lo cierra.
- El panel es un `aside` con `aria-label="Ayuda"`, foco atrapado mientras está abierto y `Esc` para cerrar.
- Las pestañas usan `role="tablist"`/`tab` y se recorren con las flechas.
- Duraciones y marcas de tiempo tienen texto legible por lector de pantalla («0 minutos 41 segundos»).
