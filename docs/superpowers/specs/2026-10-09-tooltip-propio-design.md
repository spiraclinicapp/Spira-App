# Pistas propias: el reemplazo del globo negro del navegador

**Fecha:** 2026-10-09 · **Estado:** aprobada por el Director (2026-10-09, propuesta A · papel); implementada · **Mock:** [`docs/mock-tooltip-propio.html`](../../mock-tooltip-propio.html)
(se puede usar: hay que abrirlo en el navegador y pasar el mouse, o recorrerlo con Tab)

## El problema

El Director preguntó por la ayuda que aparece al apuntar «Pacientes enrolados» en el detalle del
protocolo. Ese globo no es de Spira: es el **`title` nativo**, y lo pinta Windows, negro y en
Segoe, con letra de sistema. La app no tiene control sobre él:

- **Tarda ~1 s** en aparecer, y nada más se abre con el mouse. **No sale con el teclado** (Tab) ni en
  **tablet**, donde no hay "apuntar".
- **No se parece a nada de Spira.** Además, el ⓘ de `InfoTip` (Ajustes, Estadísticas, el Resumen) ya
  explica cosas en un panel de papel, así que hoy la app tiene **dos lenguajes** para lo mismo.
- **Explica también lo que no hace falta.** Los nombres de una lista llevan `title={nombre}` por si se
  cortan con «…», y el globo aparece igual cuando el nombre entra entero.

## Qué hay hoy (relevado el 2026-10-09)

Hay **284 `title=`** en 129 archivos. **Unos 100 no son ayudas**: son props que se llaman igual
(`<Modal title>`, `<EmptyState title>`, `<StCard title>`, `<iframe title>`) y esta propuesta no los
toca. Los **~180 que sí lo son** se dividen en cinco tipos:

| Tipo | Cuántos (aprox.) | Ejemplos |
|---|---|---|
| **Término del glosario** (`.spira-termino`, textos de `lib/glosario.ts`) | ~10 | «Pacientes enrolados», «Adherencia», estados de visita, IVRS |
| **Rótulo de un botón de ícono** | ~50 | «Cerrar (Esc)», «Subir», «Editar», «Visita anterior (↑)» |
| **Explicación de un estado** | ~45 | «La fecha real cayó fuera de la ventana…», el «por qué no» de un botón deshabilitado |
| **Nombre que puede cortarse** (`title` = el mismo texto) | ~25 | nombre del paciente, nombre de archivo, medicamento |
| **Destino de un enlace** | ~10 | «Abrir Medidata en una pestaña nueva — https://…» |

## Decisiones

Las tomé con el criterio de «dale con lo recomendado»: cada una lleva su porqué para poder revertirla.

| # | Tema | Elegido | Por qué |
|---|---|---|---|
| D1 | Mecanismo | **Un solo componente que se hace cargo de todos los `title` de la app**, escuchando a nivel de documento (delegación). No hay que migrar ningún sitio | Ver «Enfoques», abajo. Son ~180 sitios: tocarlos uno por uno es una PR enorme, y cada uno queda como lugar donde olvidarse. Con la delegación, el `title` que se escriba mañana sale bien sin que nadie se acuerde. |
| D2 | Aspecto | **A · papel**: `--spira-white`, borde `--spira-line-2`, radio 10, sombra suave, Inter 12,5 | Es la misma familia que el panel de `InfoTip`, así que Spira vuelve a tener **un solo lenguaje** para «esto se explica». La **alternativa B** (tinta petróleo invertida, como el globo de siempre pero en marca) también está en el mock: resalta más, pero queda al lado del ⓘ de papel y vuelve a haber dos lenguajes. |
| D3 | Formas | **Cuatro, que se deducen solas** y el sitio no las declara: **término** (título en negrita = la palabra subrayada + la definición abajo), **rótulo** (compacto, en una línea), **frase** (hasta 280 px de ancho, varias líneas), **nombre cortado** (como rótulo) | Las cuatro salen de lo que el código ya tiene: la clase `.spira-termino`, el largo del texto y si el `title` repite el texto visible. No suma API. |
| D4 | Nombre que no está cortado | **No muestra nada** | Si el `title` es igual al texto visible y el elemento **no está cortado** (`scrollWidth <= clientWidth`), repetirlo no informa. Hoy sí aparece. |
| D5 | Tiempos | **450 ms** la primera vez. Si se cerró otra pista hace menos de **400 ms**, la siguiente sale **al instante** («tibia»). Al salir, **140 ms de gracia** (`GRACIA_MS` de `useHoverIntent`) | Medio segundo es la mitad de lo que tarda el nativo y alcanza para no saltar al cruzar la pantalla. La tibieza deja recorrer una fila de íconos leyendo cada uno, que con el nativo no se puede. La gracia es la de WCAG 1.4.13 (se puede entrar con el mouse a la pista). |
| D6 | Posición | **Abajo y centrada** sobre el elemento. Se pasa **arriba si abajo no entra**, queda **a 8 px del borde** como mínimo y **se cierra al scrollear** | Abajo es donde aparece el nativo (la gente ya mira ahí) y donde abre `InfoTip`. Cerrarla al scrollear es más simple y más tranquilo que perseguir el elemento. |
| D7 | Teclado | Se abre con el **foco visible** (Tab), no con el foco que deja un clic. **Esc cierra solo la pista** y consume la tecla | Hoy esas ayudas con el teclado no existen. Si hay una pista abierta, el Esc es de ella: no se lleva el modal de atrás (es la misma regla de «una capa por vez» de `usePopover`). |
| D8 | Tablet | **Solo los términos** del glosario se abren al tocar, y solo los que **no están adentro de un botón o enlace** | En un botón, tocar ya ejecuta la acción, así que una pista ahí llegaría tarde o taparía el resultado. En los términos, tocar es la única forma de preguntar. |
| D9 | Lector de pantalla | **No cambia nada.** El `title` sigue en el DOM. Se saca **solo mientras el mouse está encima** (para que no salgan los dos globos) y vuelve al salir. Mientras la pista está abierta, el elemento la señala con `aria-describedby`, **sumada** a la que ya tuviera, y al cerrar se deja como estaba | El nombre y la descripción accesibles que hoy da el `title` se mantienen en todos los botones de ícono. No hay que agregar ningún `aria-label`. |
| D10 | Salida de emergencia | **`data-pista="nativa"`** deja el globo del navegador en ese elemento. Los `<iframe>` quedan afuera siempre | Por si aparece un caso que el sistema dibuja mal. No tiene que hacer falta, pero si falta, es una línea. |
| D11 | `Termino` e `InfoTip` | **No cambian.** `Termino` sigue siendo un `<abbr title>` y el sistema lo toma solo. `InfoTip` sigue siendo el control para título + cuerpo escritos a mano y con clic | `Termino` vive adentro de filas que son botones (los KPI de `ProtocolDetailView`), así que no puede volverse un `<button>`. Con la delegación no lo necesita. |

## Enfoques considerados

1. **Delegación global sobre `title` (elegido).** Un componente montado una vez en la raíz (`App.tsx`, así cubre también el Login).
   Escucha `pointerover`/`pointerout`/`focusin`/`focusout`/`keydown` en `document`. Saca el `title`
   mientras dura el hover y dibuja una sola pista portaleada a `body`.
   **A favor:** cero migración, cubre lo que se escriba mañana, una sola pieza para mantener.
   **En contra:** es "magia" (el `title` ya no hace lo que dice el estándar) y depende de que nadie
   lea el `title` del DOM en el medio de un hover (hoy nadie lo hace). Lo segundo queda cubierto por
   el riesgo R2.
2. **Componente `<Pista texto>` en cada sitio.** Es explícito y React puro. Pero son ~180 ediciones,
   cada una tiene que pasar su `ref` al hijo (botones con estilos inline, `spira-card-link`…), y
   cualquier `title` que se agregue después vuelve a mostrar el globo negro. Además, `Termino`
   adentro de un botón lo complica.
3. **Solo el glosario.** Pasar los ~10 términos a `InfoTip` y dejar el resto nativo. Es lo más chico,
   pero los ~170 globos negros quedan, que es justo lo que preguntó el Director. Y anida un `<button>`
   adentro de las filas-botón de los KPI.

## Las piezas

- **`src/components/reglasDePista.ts`** (no `pistas.ts`: en Windows choca con `Pistas.tsx`): la lógica **pura**, sin DOM real. `formaDePista(...)` (término /
  rótulo / frase / nada), `esRotulo(texto)` y `ubicarPista(rectDelElemento, tamañoDeLaPista,
  ventana)` → `{ top, left }`. Es lo que puede fallar en silencio (una pista que nunca aparece, o que
  sale tapando el elemento), así que va con **tests** (`reglasDePista.test.ts`), según el criterio de
  `estados.test.ts`.
- **`src/components/Pistas.tsx`**: el componente que se monta **una vez** en `App.tsx`. Los
  listeners, los timers (450 / 400 / 140), guardar y restaurar el `title` y el portal con
  `role="tooltip"`. No recibe props.
- **`src/styles/tokens.css`**: `.spira-ayuda` (no `.spira-pista`: ése es el alternador de `SegmentedControl`) y sus tres `data-forma`, más la entrada de 120 ms
  (desactivada con `prefers-reduced-motion`). El mock trae el CSS listo.
- **`Termino.tsx` / `InfoTip.tsx`**: solo se actualiza el comentario de cabecera que dice «`title` es
  la convención de la casa», para que nombre la pista.

## Riesgos que el plan tiene que verificar antes de dar algo por hecho

- **R1 · Botones deshabilitados.** El «por qué no» de un botón deshabilitado vive en su `title`
  (`PanelSustitucion`, `ArmarPedido`, `Resumen` de Reportes, `ProcedureEditModal`). Hay que confirmar
  en Edge que un `<button disabled>` dispara `pointerover`. Si no lo dispara, esos sitios llevan
  `data-pista="nativa"` (D10) y quedan como hoy, no peor.
- **R2 · React escribe el `title` mientras está guardado.** Si un re-render cambia el `title`
  durante el hover, React lo vuelve a poner en el DOM. Al restaurar, **no** se pisa un `title`
  presente (es la regla del mock). Hay que probarlo con un `title` que cambia solo, por ejemplo el
  de «Mostrar/Ocultar navegación».
- **R3 · Popovers abiertos.** Una pista sobre una opción de un menú abierto (`MenuAcciones`,
  `ActionMenu`) no lo puede cerrar: el `pointerdown` que cierra la pista no tiene que cortar la
  propagación. El Esc sí la corta (D7), y hay que verificar que el segundo Esc cierre el menú.
- **R4 · Preview oculto.** En el panel oculto los timers van frenados (CLAUDE.md). El QA se hace
  esperando más allá de los 450 ms, o con `playwright-core` + Edge, como se armó este mock.

## Fuera de alcance

- Que los términos sueltos se puedan enfocar con Tab (`tabIndex` en `Termino` cuando no está adentro
  de un control). Hoy tampoco se puede. Vale la pena, pero es otra decisión.
- Reescribir textos de `title`. Esta propuesta cambia **cómo se ven**, no **qué dicen**.
- Pistas en botones en tablet (D8).

## Cómo se verifica

`npm run build` verde (con los tests de `pistas.test.ts`) y QA en el preview:

1. El KPI «Pacientes enrolados» muestra título + definición.
2. Una fila de íconos del `ScheduleEditor` muestra rótulos y la pista sale tibia al pasar de uno a otro.
3. La versión del «Acerca de» respeta el salto de línea.
4. Un nombre que no está cortado no muestra nada.
5. Esc adentro del modal de la visita cierra la pista y no el modal.
6. Tab sobre los íconos del encabezado de la visita muestra la pista.
7. Tema oscuro.

Sin migraciones ni SQL: es una PR de front sola.
