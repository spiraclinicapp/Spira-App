# Plan — Ayuda v2: panel por módulo, bajada «¿Qué puedo hacer acá?» y Manual de usuario

Handoff: [`docs/handoff-ayuda-manual/`](handoff-ayuda-manual/README.md) (copiado del Downloads del Director el
2026-10-16, con sus capturas). Plan anterior, del que esto es la continuación: [`plan-tutoriales.md`](plan-tutoriales.md).
Revisado con `/plan-eng-review` el 2026-10-16, con segunda opinión (ver el informe al final).

## Qué se quiere

El Director rediseñó la Ayuda. Hoy son dos cosas separadas: un panel de preguntas frecuentes con una pestaña de
tutoriales, y la píldora «Cómo se hace» al lado del título con su globo animado. El rediseño:

1. **Junta preguntas y tutoriales** en un solo panel, organizado por módulo: Inicio · Primeros pasos ·
   Coordinación · Farmacia. Cada pestaña de módulo es una vista: el video con sus **capítulos** (tocar uno salta al
   segundo), las preguntas del tema, los otros tutoriales del módulo y el acceso al manual.
2. **Reemplaza la píldora** por una **bajada** bajo el título: la descripción del submódulo y el enlace «¿Qué puedo
   hacer acá?», que al pasar el mouse abre un globo con el tutorial.
3. **Suma un Manual de usuario**: una página por tarea, con los pasos enlazados al segundo exacto del video.
4. **La animación vive en el play**: halo suave mientras el tutorial no se vio, disco en contorno cuando ya se vio.

Y un pedido aparte sobre el manual: **el contenido lo redacto yo primero**, y el Director después me pasa su
explicación, con sus palabras, de para qué sirve cada cosa, para ver qué se puede mejorar. Por eso el texto del manual
va como borrador legible (markdown) **antes** de cargarlo en la app (ver E4).

## Decisiones tomadas en la revisión

Por la preferencia del Director («dale con lo recomendado»), cada punto se resolvió con la opción recomendada. Están
anotadas con su porqué para poder revertirlas. Las que **se apartan del handoff** van marcadas con ⚠️.

| # | Tema | Decisión | Por qué |
|---|---|---|---|
| A1 | Texto de los capítulos | **Un resumen corto por capítulo, escrito en el guion al lado del `capitulo`** (`resumen: '…'`). La fábrica lo copia al meta (`capitulos[].texto`). La transcripción completa sigue en el meta para el buscador y como alternativa al video | La primera idea era usar lo que dice la voz, pero medido sobre los guiones da entre 11 y 47 palabras por capítulo: en 440 px la lista de capítulos terminaba siendo la transcripción entera, no la descripción corta del handoff. En el guion, quien cambia la voz tiene el resumen en el renglón de al lado |
| A2 | Los 6 videos publicados | **Se regraban los 6** después de E3 (E3b), con los resúmenes ya acordados en E4 | Hay que regrabarlos igual: los dos «Conocé…» **dicen** «al lado del título vas a ver el botón «Cómo se hace»» (`conocer-coordinacion.ts:112`, `conocer-farmacia.ts:98`), y los seis **muestran** la píldora, que E3 borra. Sin regrabar, la voz miente y `tutoriales:verificar` marca los seis como cambiados. Regrabar ya es rutina (#500 regrabó cinco). Se descarta el script para completar metas viejos |
| A3 | Preguntas de un tutorial | **Una sola lista** (`PREGUNTAS`). `Pregunta` suma `capitulo?: string` (el título del capítulo al que salta «▶ 0:26 en el video»). El handoff anidaba las preguntas adentro del tutorial | DRY: hoy una pregunta ya apunta a su tutorial con `tutorial`. Anidarlas duplicaría el buscador global y las preguntas sueltas |
| A4 | Pasos del manual con video | **Son los capítulos del tutorial** (título + resumen + marca de tiempo). El artículo escribe a mano la introducción, las notas y qué preguntas lleva; los pasos los toma del meta. Los artículos **sin** video escriben sus pasos a mano | Un paso escrito aparte que apunta a un capítulo es el mismo texto dos veces, y la primera regrabación los separa. Así el manual y el panel dicen lo mismo por construcción |
| A5 | Enlace tutorial ↔ manual | **Un solo sentido**: el artículo dice `tutorial?: id`; «Leer … en el manual» se calcula al revés | Dos punteros que se tienen que acordar son dos lugares para equivocarse |
| A6 | El reproductor | **Uno solo** (`ReproductorTutorial`) para el panel y el manual, sobre el `useVideoTutorial` que ya existe. Se borran `TutorialModal`, `TarjetaTutorial` (como reproductor) y `AyudaTutorial` (la píldora) | El panel ahora reproduce adentro. El «en grande» queda cubierto por la pantalla completa nativa del `<video>` |
| A7 | `abrirTutorial` | **Desde E2 abre el panel en ese tutorial y en ese segundo.** Lo llaman la píldora (`AyudaTutorial.tsx:88`, vive hasta E3) y la tarjeta de `Pistas` (`Pistas.tsx:427`) | E2 borra el reproductor; sin esto, esos dos botones quedan muertos entre E2 y E3 |
| A8 ⚠️ | El globo de los controles con `data-tutorial` (hoy el «Preparar» de Dispensaciones, DD10) | **Pasa a ser el mismo globo de la bajada**: play y «Ver en la Ayuda» abren el panel en ese tutorial. Ya no se reproduce adentro del globo | El handoff define el globo nuevo para la bajada y no dice nada de `Pistas`. Dos globos que hacen cosas distintas al dar play son la inconsistencia que el Director ya marcó otras veces. Si quiere conservar el play adentro (DD10), es volver a enchufar `TarjetaTutorial` sólo ahí |
| A9 ⚠️ | Cómo se abre el globo | **Con `Pistas`**, que ya tiene la forma «tutorial» (`data-forma="tutorial"`, `Pistas.tsx:405`): hover, foco, Esc y el paso del mouse al globo. El botón lleva `title` (el resumen) y `data-tutorial`. Cambios: el globo se **ancla al botón** (debajo, con la flecha) y no al puntero. **En tablet, el toque va directo al panel**: `Pistas` sólo abre por toque los términos que no están adentro de un botón (`Pistas.tsx:327`), y el enlace es un botón | Un segundo sistema de popups repetiría bugs que `Pistas` ya tiene arreglados (blur que cierra, `stopPropagation` que apaga el Esc). En tablet, abrir el panel es lo mismo que haría el «Ver en la Ayuda» del globo, con un toque menos |
| A10 ⚠️ | Bajada en todas las pantallas | **La fila de la bajada (16 px) va en TODAS las pantallas**, sub-pantallas con migas incluidas: la descripción del submódulo (`hint`) cuando la hay, y «¿Qué puedo hacer acá?» sólo con tutorial publicado. El handoff la pide sólo con tutorial | Con la bajada condicional, el título y la miga **saltan 8 px** entre pantallas con y sin tutorial, y entre la lista y la ficha (la transición más frecuente). Con la fila siempre, el encabezado mide lo mismo en toda la app. Inicio › Resumen no tiene `hint`: la fila queda reservada y vacía |
| A11 | Los 4 px del contenido | **`.spira-content` pasa a `padding-top: 12px` en toda la app** y `RenglonIndice.css:14-15` pasa de −16 a −12. Encabezado: 12 arriba, 0 abajo | Como la fila va siempre (A10), el número es uno solo y no hace falta una variable. El sticky de Estadísticas está atado a ese número: si se cambia uno sin el otro, el índice queda 4 px despegado (el mismo acople de #433) |
| A12 ⚠️ | «Lo más consultado» | **Se llama «Lo esencial»** y es una lista **elegida a mano** (`DESTACADOS`) | No hay ningún conteo de consultas. «Lo más consultado» afirmaría un dato que no existe (honestidad de datos) |
| A13 ⚠️ | Cuándo un tutorial es «visto» | **Sigue siendo ≥ 90 % reproducido o terminado** (regla vigente). El handoff dice «al reproducir» | Con «al reproducir», dar play y cerrar a los dos segundos apaga el halo para siempre y el «✓ Visto» miente. Ya se decidió así en el plan anterior |
| A14 | «Visto» por usuario | **localStorage con el id del usuario en la clave** (`spira.tutoriales.vistos:<uid>`). La clave vieja (sin usuario) se descarta | Las PC del centro son compartidas: con la clave por navegador, lo que vio una coordinadora le apagaba el halo a la siguiente. En la base sería una migración para un dato que no prueba nada (ver «NO en alcance») |
| A15 ⚠️ | Dónde vive el manual | **Una pantalla de la app, en la misma pestaña**: `/inicio/manual/<artículo>`, submódulo `manual` de Inicio, con `manual` en `SUB_CON_PATH`. Se navega con `pushUrl` llevando el `path` (o un `NavTarget`), porque `navigate()` siempre empuja `path: []` (`AppShell.tsx:252`). Al entrar desde otra pantalla se deja un `returnTo` para volver. Encabezado: H1 «Manual de usuario» (el del shell) y H2 el artículo. El handoff lo dibuja como página aparte con «‹ Volver a Spira» | La sesión vive en `sessionStorage` (`src/lib/supabase.ts:16`): **una pestaña nueva arranca sin sesión**. Como submódulo de Inicio no hace falta router nuevo ni flag `oculto`: Inicio no dibuja panel de submódulos (`AppShell.tsx:501`) y el buscador ya lo saltea (`searchIndex.ts:196`) |
| A16 | Tres columnas del manual | Índice (240) + artículo (≤ 720) + «En este artículo» (220). Con container query: la columna derecha se va abajo de ~1220 px de contenido, y abajo de 980 queda una sola | Inicio no tiene panel de submódulos, así que en la notebook de referencia (1536×864) el manual tiene ~1405 px: entran las tres. La query cubre las pantallas más chicas y el panel lateral replegado |
| A17 | «Para leer o imprimir» | **Una hoja `@media print` mínima** (sin shell, sin índice, sin video; los pasos y las preguntas abiertas) | El mock lo promete en un rótulo. O se cumple o se saca la palabra; cumplirlo son ~20 líneas |
| A18 | Rótulos de botón | **Todo lo que va entre «» en el contenido de la Ayuda se dibuja como rótulo** (`conRotulos`). Convención: «» = texto que aparece tal cual en pantalla (botones, estados, opciones); para comillas comunes, “ ” | Revisado el contenido actual: lo que va entre «» son botones, estados («Concurrió al centro», «Pendiente de verificar») u opciones («Ambulatoria»), todo texto que se ve en pantalla. Una regla «sólo después de *botón*» falla con «…pulsá el botón «Volver» o «Confirmar igual»» |
| A19 | Entradas a la Ayuda | **El «?» al pie del riel** (abre en Inicio), como pide el handoff, **y se queda** la fila del menú de usuario | Sacar un camino que la gente ya aprendió es una regresión gratis |
| A20 | Buscador global (chip «Ayuda») | Un tutorial abre **el panel en ese tutorial**. Los artículos del manual entran como resultados | Mismo destino que el resto de la Ayuda |
| A21 | Velo del panel | El `Drawer` suma la prop `velo="suave"`: `rgba(20,48,46,.22)` sin desenfoque. Los otros cajones no cambian | El handoff lo pide sin blur; cambiarlo en `Drawer` tocaría todos los cajones de la app |
| A22 | «¿Qué puedo hacer acá?» en la primera pantalla de un módulo | **Ofrece «Conocé Coordinación/Farmacia»** (el tutorial de `track/resumen` y `pharma/protocolos`) | Es literalmente la respuesta a «qué puedo hacer acá»: el recorrido de lo que hay en el módulo |
| A23 | Copy del contenido | **«Pulsá el botón «X»»**, no «Tocá» (regla del Director del 2026-10-14). El texto del mock (Ctrl K, «no se buscan visitas», etc.) es de ejemplo: **nada se copia sin verificarlo en el código** | El mock dice que el buscador no busca visitas y `SearchType` las incluye: ejemplo concreto de por qué no se copia |

## Arquitectura

### Las fuentes de contenido y quién las lee

```
 GUION (tutoriales/guiones/<id>.ts)        FÁBRICA → tutoriales.meta.json      A MANO
  pasos[{dice, capitulo?, resumen?←NUEVO}]  version, duracionMs,                tutoriales.ts   preguntas.ts           manual.ts (E5)
        │  grabar                           capitulos[{inicioMs, titulo,         id, modulo,     id, modulo, pregunta,  id, modulo, titulo,
        └──────────────────────────────►      texto←NUEVO}], transcripcion[]     vista, titulo,  respuesta, tutorial?,  intro, tutorial?,
                                                     │                           resumen, ...    capitulo?←NUEVO        pasos? (sólo sin video),
                                                     │                               │               │                  nota?, preguntas[ids]
                                                     ▼                               ▼               ▼                  │
                        catalogo.ts: publicados() → Publicado { meta con capítulos y texto } ◄──────────────────────────┘
                                                     │
                     ayuda/panel.ts + ayuda/texto.ts + ayuda/manualReglas.ts (PURAS, con test)
                                                     │
                     useEstadoAyuda (AppShell): panel {pestaña, tutorialId, preguntaId, segundo}, vistos por usuario
              ___________________/        |                     |                      \___________________
             /                            |                     |                                          \
   Bajada (AppShell) +             AyudaPanel             CommandPalette                         ManualView
   globo (Pistas, vía puente)      (Drawer, velo suave)   (chip «Ayuda»)                         /inicio/manual/<artículo>
                                   ReproductorTutorial                                           ReproductorTutorial
```

**La regla de siempre sigue:** un tutorial sin versión en el meta no existe para la UI (ni bajada, ni pestaña, ni
buscador). El artículo del manual que lo tiene se muestra sin video y sin pasos con marca de tiempo; si además no
escribió pasos a mano, la prueba de integridad lo marca (no puede quedar un artículo sin pasos).

### El panel: estados

```
                 «?» del riel / menú de usuario
                            │
                            ▼
   ┌──────────────── Inicio ◄──────────────┐ pestaña «Inicio»
   │  ¿Qué querés hacer? + buscador grande  │
   │  franja del manual · Lo esencial ·     │
   │  Por módulo (mosaicos)                 │
   └──┬───────────────┬─────────────────────┘
      │ mosaico /     │ fila de tutorial / pregunta
      │ pestaña       ▼
      │      ┌──────────── Pestaña de módulo ─────────────┐ ◄── bajada / globo / buscador global / abrirTutorial
      └────► │ tutorial cargado (tutorialInicial):         │     (abre con ese tutorial, y en ese segundo)
             │ video + capítulos + preguntas + otros       │
             │ Sin tutorial publicado en el módulo:        │
             │ sólo preguntas + «<Módulo> en el manual»    │
             └─────────────────────────────────────────────┘
      Texto en cualquier buscador ──► Búsqueda (sin pestañas, todos los módulos visibles) ──► borrar ──► vuelve
```

`tutorialInicial(módulo, pantalla, vistos)`: el de la pantalla actual si existe → si no, el primero sin ver del
módulo → si no, el primero.

### Encabezado de la pantalla (igual en todas)

```
[miga: Spira Farmacia › Dispensaciones]                         padding-top 12 (antes 20)
[H1: Dispensaciones]                          [acción primaria]
[Entrega de medicación   (?) ¿Qué puedo hacer acá?]             fila de 16 px, siempre; padding-bottom 0 (antes 4)
.spira-content  padding-top 12 (antes 16)                        → 12 + 16 + 0 + 12 = 20 + 4 + 16: el contenido no se mueve
RenglonIndice   top/margin −12 (antes −16)
```

## Piezas

**Se borran:** `AyudaTutorial.tsx` (píldora), `TutorialModal.tsx`, `AyudaDrawer.tsx` (lo reemplaza `AyudaPanel`),
la parte reproductora de `TarjetaTutorial.tsx` (queda `GloboTutorial`), el estado `reproductor` de `useEstadoAyuda`.

**Se reusan:** `reglas.ts` (`preguntasVisibles`, `coincide`, la búsqueda en todo lo visible), `catalogo.ts`
(`publicados`, `visiblesPara`, `tutorialDeLaVista`, URLs, duraciones, `capituloActual`, `motivoDelError`),
`useVideoTutorial` (ya aplica el segundo inicial en `onLoadedMetadata`), `visto.ts` (con la clave nueva), `Drawer`
(con `velo`), `Pistas` y su forma «tutorial», `puente.ts`, `lib/texto.ts` (`normalizar`), `EmptyState`, el Feedback
(«Contanos»), `returnTo` del shell.

**Nuevas:**
- `ayuda/panel.ts` (puro): `pestañasVisibles`, `tutorialInicial`, `preguntasDeLaPestaña`, `buscarEnAyuda`,
  `destacadosVisibles`.
- `ayuda/texto.ts` (puro): `resaltar(texto, término)` → segmentos (con tildes: buscar «recepcion» resalta
  «Recepción»), `conRotulos(texto)` → segmentos.
- `ayuda/AyudaPanel.tsx`, `ayuda/ReproductorTutorial.tsx`, `ayuda/DiscoPlay.tsx` (los dos estados + halo +
  `prefers-reduced-motion`), `ayuda/GloboTutorial.tsx`, `ayuda/BajadaPantalla.tsx`.
- E5: `ayuda/manual.ts` (contenido), `ayuda/manualReglas.ts` (puro), `views/inicio/ManualView.tsx`.
- Fábrica: el guion acepta `resumen` junto a `capitulo`; `armarCapitulos` lo copia a `texto` y falla si un capítulo
  no lo tiene.

## Etapas (una PR cada una)

- **E0 — Docs.** Este plan + el handoff en `docs/handoff-ayuda-manual/`.
- **E1 — Datos y reglas, sin UI.** `resumen`/`texto` en la fábrica (los metas viejos siguen andando: sin `texto`, el
  capítulo se dibuja sólo con su título); `Pregunta.capitulo`; `panel.ts` y `texto.ts` con sus tests; «visto» por
  usuario. Nada cambia en pantalla.
- **E2 — El panel.** `AyudaPanel` + `ReproductorTutorial` + `DiscoPlay`; `velo` del Drawer; «?» en el riel;
  `abrirTutorial` y el buscador global abren el panel. Se borran `AyudaDrawer` y `TutorialModal`.
- **E3 — Bajada y globo.** `BajadaPantalla` + `GloboTutorial` en `Pistas`; paddings 12 y `RenglonIndice` −12; se
  borra la píldora.
- **E3b — Regrabar los 6.** Se sacan las dos líneas de «Cómo se hace» de los «Conocé…» (y se cuenta la bajada en su
  lugar), se cargan los `resumen` acordados en E4 y se regraban los seis con la app ya en E3. El Director publica con
  `tutoriales:publicar` como siempre, **después** del deploy de E3 (si se publica antes, los videos muestran una
  bajada que todavía no existe en prod).
- **E4 — Borrador del manual (sólo texto).** `docs/manual/borrador.md`: un artículo por tarea, verificado contra el
  código, con «pulsá el botón», y los resúmenes de capítulo de los seis videos. **El Director lo lee y me pasa su
  explicación; ajusto antes de E3b y E5.** No espera a E1-E3: es sólo texto.
- **E5 — El manual en la app.** `manual.ts` (el borrador ya acordado), `ManualView`, ruta, accesos desde el panel
  (franja, «Leer … en el manual», «<Módulo> en el manual»), hoja de impresión, resultados en el buscador global.
- Al sacar versión: la Novedad en `version.ts` (la Ayuda cambió de lugar y de forma: la gente tiene que enterarse).

### Artículos del borrador (E4)

Primeros pasos: Buscar · Notificaciones (la campana) · Dar feedback · Preferencias y tema.
Coordinación: Conocé Coordinación · Atender una visita · Agendar y reprogramar · Para ver médico · Pendientes.
Farmacia: Conocé Farmacia · Recepción · Stock · Dispensar · Dispensar sin un pedido · Reposición.

Los que tienen video toman sus pasos de los capítulos; los demás escriben sus pasos y no prometen un video.

## Tests

Criterio de siempre: se testea lo que falla **en silencio**. Todo lo de abajo es puro (vitest, entorno node).

```
CÓDIGO                                                      RECORRIDOS
[+] tutoriales/lib (fábrica)                                [+] Panel
  └── armarCapitulos: `texto` por capítulo                    ├── [GAP→T] abre desde «?»: Inicio
      ├── [GAP] capítulo sin `resumen` → error claro           ├── [GAP→T] desde la bajada: pestaña + ese tutorial
      └── [GAP] paso sin capítulo no crea uno                  ├── [GAP→T] abrirTutorial(id, {segundo}) → panel en ese segundo
[+] catalogo.ts                                                ├── [GAP→T] usuario de un solo módulo: no ve la otra pestaña
  └── capítulos del meta                                       ├── [GAP→T] módulo sin tutoriales: sólo preguntas
      └── [GAP] meta viejo sin `texto` → capítulo sin texto    ├── [VER]   capítulo → salta al segundo (antes de metadata)
[+] panel.ts                                                   ├── [VER]   video no subido → «todavía no disponible»
  ├── pestañasVisibles: orden fijo, sólo módulos permitidos    └── [VER]   Esc / clic en el velo cierran; foco atrapado
  ├── tutorialInicial: pantalla → sin ver → primero → null  [+] Búsqueda
  ├── preguntasDeLaPestaña: del tutorial + sueltas del módulo  ├── [GAP→T] «recepcion» encuentra y resalta «Recepción»
  ├── buscarEnAyuda: mixto, todo lo visible                    ├── [GAP→T] coincide en un capítulo y en una pregunta
  └── destacadosVisibles: saca no publicados / no permitidos   ├── [GAP→T] término con «(» o «.» no rompe
[+] texto.ts                                                   └── [GAP→T] sin resultados → «Contanos»
  ├── resaltar: tildes, mayúsculas, varias apariciones      [+] Bajada y globo
  └── conRotulos: «a» y «b» en la misma frase, «» sin cerrar   ├── [VER] encabezado mide igual en todas (lista y ficha)
[+] visto.ts                                                   ├── [VER] REGRESIÓN: el índice sticky de Estadísticas
  ├── [GAP] clave por usuario: A no ve los de B                │         queda pegado (CRÍTICO, ver A11)
  └── [GAP] sin usuario → no persiste                          ├── [VER] globo: hover, foco, Esc, paso del mouse
[+] Integridad del contenido (como preguntas.test.ts)          ├── [VER] tablet: toque → panel
  ├── [GAP] pregunta.capitulo existe en el meta de su tutorial └── [VER] REGRESIÓN: «Preparar» de Dispensaciones
  ├── [GAP] preguntas del manual existen                                sigue mostrando su globo
  ├── [GAP] artículo con video publicado o con pasos propios [+] Manual
  ├── [GAP] a lo sumo un artículo por tutorial; ids únicos     ├── [GAP→T] artículo de un módulo ajeno → «no existe»
  └── [GAP] DESTACADOS apuntan a ids que existen               ├── [VER] desde el panel: abre y `returnTo` vuelve
[+] router.ts                                                  ├── [VER] marca de tiempo → el video salta
  └── [GAP] /inicio/manual/<artículo> ida y vuelta             └── [VER] imprimir: sin shell ni video
[+] searchIndex
  └── [GAP] resultado de tutorial → panel; de artículo → manual con su path

[GAP→T] = test unitario a escribir con la etapa · [VER] = se verifica en el preview (no se ve roto en un test)
```

**Regresiones (obligatorias):** el sticky de `RenglonIndice` (A11) y el globo de «Preparar» (A8) se verifican en el
preview antes de mergear E3; el buscador global con un tutorial (antes reproductor, ahora panel) y `abrirTutorial`
tienen test del destino en E2.

## Modos de falla

| Camino nuevo | Cómo falla en prod | Test | Manejo | ¿Silencioso? |
|---|---|---|---|---|
| Capítulos con resumen | Se regraba y un capítulo cambia de nombre; una pregunta apunta a uno que ya no existe | Integridad del contenido | El CI falla | No |
| Meta mergeado antes de subir el video | El video da 400 | `motivoDelError` (ya existe) | «Todavía no disponible»; los capítulos se leen igual | No |
| Videos de E3b publicados antes del deploy de E3 | El video muestra la bajada y la app todavía la píldora | — | Orden escrito en E3b | Sí: **el orden lo dice el chat al pasar la PR**, no sólo el archivo |
| Salto a un capítulo antes de que cargue el video | `currentTime` se pierde y arranca de 0 | — (DOM) | `segundoInicial` ya se aplica en `onLoadedMetadata`; el salto con el video abierto usa el mismo camino | Sí, si se rompe: **se verifica en el preview** |
| Resaltado con tildes | Busca «recepcion», encuentra, pero no resalta o corta mal | `resaltar` | — | Sería silencioso: **lo cubre el test** |
| «Visto» por usuario | localStorage bloqueado | `visto.test` | Todo figura «no visto» (honesto) | No |
| Artículo del manual desde el buscador | Se navega sin el `path` y abre el índice en vez del artículo | `searchIndex` | — | Sería silencioso: **lo cubre el test** |
| Sticky de Estadísticas | Un número cambia sin el otro: el índice queda 4 px despegado | — | — | **Silencioso**: verificación en el preview obligatoria (A11) |

Ninguno queda sin test, sin manejo **y** silencioso a la vez: los dos que no tienen test tienen verificación explícita.

## Rendimiento

Sin consultas a la base: todo es contenido del repo. Lo único a cuidar:
- El globo **no carga el video**: sólo el póster (`<img loading="lazy">`). El video del panel va con
  `preload="metadata"`.
- El halo es `transform` + `opacity` sobre un `::after` (compuesto por la GPU). Con `prefers-reduced-motion`, nada.
- La búsqueda recorre ~40 ítems por tecla: no hace falta memo ni debounce.

## Lo que ya existe (y se reusa)

- Visibilidad por módulo (`preguntasVisibles`, `visiblesPara`) y la regla «con texto se busca en todo lo visible».
- La frontera catálogo a mano / meta de la fábrica y `publicados()`.
- `useVideoTutorial`: estados del video, «visto» al 90 %, uno solo sonando, errores 400/sin red, segundo inicial.
- `Pistas`: hover/foco/Esc, la forma «tutorial» y el puente con la Ayuda (`puente.ts`).
- El Feedback con «Buscaba: …» precargado; `returnTo` del shell.
- `Drawer` con cabecera y pie fijos.
- Los descriptores de submódulo (`hint` en `modules/registry.ts`) son la descripción de la bajada: no se escriben
  de nuevo.

## NO en alcance

- **«Visto» en la base / registro de capacitación.** Un video visto no prueba competencia; ya estaba fuera en el plan
  anterior.
- **Contar consultas** para que «Lo más consultado» sea cierto: no hay telemetría y no se va a montar para esto.
- **Abrir el manual en otra pestaña:** la sesión es por pestaña. Si algún día hace falta, es cambiar el
  almacenamiento de la sesión, que es una decisión de seguridad.
- **Avisar al salir con un formulario a medias** al abrir el manual: no existe para ninguna navegación hoy; no se
  inventa sólo para esta.
- **Buscador propio dentro del manual** («Buscar en el manual» del índice): el buscador global con el chip «Ayuda»
  ya lo cubre. Se dibuja el índice sin ese campo.
- **Tutoriales nuevos** (Primeros pasos, Recepción, Reposición, Pendientes): siguen el flujo de siempre (grabo →
  `tutoriales:publicar` → merge). La pestaña Primeros pasos arranca sólo con preguntas.
- **Editar un resumen de capítulo sin regrabar:** hoy el meta se escribe al grabar. Si pasa seguido, se agrega un
  modo «sólo meta» a la fábrica; por ahora regrabar es rutina.

## Paralelización

| Paso | Módulos | Depende de |
|---|---|---|
| E1 datos y reglas | `src/ayuda/`, `tutoriales/` | — |
| E2 panel | `src/ayuda/`, `src/components/Drawer`, `src/shell/` | E1 |
| E3 bajada y globo | `src/shell/`, `src/components/Pistas`, `src/styles/` | E2 |
| E4 borrador del manual | `docs/manual/` | — |
| E3b regrabar los 6 | `tutoriales/guiones/`, `src/ayuda/tutoriales.meta.json` | E3, E4 |
| E5 manual en la app | `src/ayuda/`, `src/views/inicio/`, `src/lib/router` | E2, E4 |

- Carril A: E1 → E2 → E3 → E3b (secuencial: comparten `src/ayuda/` y `src/shell/AppShell.tsx`).
- Carril B: E4 (independiente, sólo texto) — **arranca ya**, en paralelo con A.
- Después: E5.

## Implementation Tasks

- [ ] **T1 (P1, humano: ~2 h / CC: ~15 min)** — fábrica — `resumen` en el guion → `capitulos[].texto` en el meta
  - Surfaced by: A1 + segunda opinión (capítulos de 11 a 47 palabras)
  - Files: `tutoriales/lib/guion.ts`, `tutoriales/lib/lineaDeTiempo.ts` (`armarCapitulos`), `tutoriales/lib/grabar.ts`, `src/ayuda/catalogo.ts`
  - Verify: tests de la fábrica; un meta viejo sin `texto` sigue cargando
- [ ] **T2 (P1, humano: ~4 h / CC: ~30 min)** — ayuda — reglas puras del panel y del texto, con tests
  - Surfaced by: A3, A12, A18, tests
  - Files: `src/ayuda/panel.ts`, `src/ayuda/texto.ts`, `src/ayuda/reglas.ts`, sus `.test.ts`
  - Verify: `npm run build`
- [ ] **T3 (P1, humano: ~1 h / CC: ~10 min)** — ayuda — «visto» por usuario
  - Surfaced by: A14
  - Files: `src/ayuda/visto.ts`, `src/ayuda/AyudaProvider.tsx`
  - Verify: `visto.test.ts`
- [ ] **T4 (P1, humano: ~2 días / CC: ~3 h)** — ayuda — `AyudaPanel` + `ReproductorTutorial` + `DiscoPlay`; «?» en el riel; `abrirTutorial` y el buscador global al panel; borrar `AyudaDrawer`/`TutorialModal`
  - Surfaced by: A6, A7, A19, A20, A21
  - Files: `src/ayuda/*`, `src/components/Drawer.tsx`, `src/shell/AppShell.tsx`, `src/shell/search/*`
  - Verify: `npm run build` + preview (los [VER] del panel)
- [ ] **T5 (P1, humano: ~1 día / CC: ~2 h)** — shell — bajada en todas las pantallas + globo en `Pistas` anclado al botón; paddings 12 y `RenglonIndice` −12; borrar la píldora
  - Surfaced by: A8, A9, A10, A11
  - Files: `src/shell/AppShell.tsx`, `src/components/Pistas.tsx`, `src/components/RenglonIndice.css`, `src/styles/tokens.css`, `src/ayuda/GloboTutorial.tsx`, `src/ayuda/BajadaPantalla.tsx`
  - Verify: preview — Estadísticas sticky (regresión), «Preparar» (regresión), lista ↔ ficha sin salto
- [ ] **T6 (P1, humano: ~2 días / CC: ~3 h)** — docs — borrador del manual + resúmenes de capítulo, verificado contra el código
  - Surfaced by: pedido del Director; A1, A4, A23
  - Files: `docs/manual/borrador.md`
  - Verify: cada afirmación con su archivo de origen; el Director compara con su explicación
- [ ] **T7 (P1, humano: ~1 día / CC: ~1 h de trabajo + grabación)** — fábrica — regrabar los 6 sin «Cómo se hace» y con resúmenes
  - Surfaced by: segunda opinión (A2)
  - Files: `tutoriales/guiones/*.ts`, `src/ayuda/tutoriales.meta.json`
  - Verify: `npm run tutoriales:verificar`; el Director publica después del deploy de E3
- [ ] **T8 (P1, humano: ~2 días / CC: ~3 h)** — ayuda — el manual en la app: contenido, vista, ruta con `path`, `returnTo`, accesos, impresión, buscador
  - Surfaced by: A4, A5, A15, A16, A17
  - Files: `src/ayuda/manual.ts`, `src/ayuda/manualReglas.ts`, `src/views/inicio/ManualView.tsx`, `src/modules/registry.ts`, `src/lib/router.ts`, `src/views/registry.tsx`, `src/shell/search/searchIndex.ts`
  - Verify: `npm run build` + preview a 1536×864 y a 1280
- [ ] **T9 (P2, humano: ~15 min / CC: ~5 min)** — release — Novedad en `version.ts`
  - Surfaced by: la Ayuda cambia de lugar
  - Files: `src/version.ts`
  - Verify: se ve en «Novedades»

## Segunda opinión (subagente de Claude; Codex no está instalado)

Diez puntos. Los diez se verificaron contra el código y se incorporaron:

| Punto | Qué cambió en el plan |
|---|---|
| P1: la voz de los «Conocé…» nombra «Cómo se hace», y los seis videos muestran la píldora | A2: regrabar los seis (E3b) en vez de completar los metas con un script |
| P2: el script no corría (imports sin extensión, Playwright en runtime) | Se cae junto con el script |
| P2: capítulos de 11 a 47 palabras; A1 se contradecía con el manual | A1: resumen corto en el guion; A4: los pasos del manual con video son los capítulos |
| P2: la bajada condicional no evitaba el salto (Resumen sin `hint`, lista ↔ ficha) | A10/A11: fila siempre, un solo 12, sin variable |
| P2: E2 dejaba muertos los dos llamadores de `abrirTutorial` | A7 |
| P3: `Pistas` no abre por toque adentro de un botón y ancla al puntero; la forma «tutorial» ya existía | A9 |
| P3: `navigate()` pisa el `path`; `oculto` sobraba; faltaba el camino de vuelta | A15 |
| P3: en la notebook entran las tres columnas | A16 corregida |
| P3: la bajada de la primera pantalla ofrece el recorrido del módulo | A22 |
| P3: el plan se contradecía sobre el estado de la revisión | Corregido |

No hubo puntos en tensión: todo lo que marcó la segunda opinión se aceptó.

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | — |
| Codex Review | `/codex review` | Independent 2nd opinion | 1 (subagente de Claude) | ISSUES FOUND → incorporados | 10 hallazgos, 10 incorporados |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | CLEAR (PLAN) | 23 decisiones; 2 caminos críticos sin test, con verificación explícita en el preview |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | — |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | — |

- **CROSS-MODEL:** la segunda opinión encontró dos problemas de fondo que la revisión no vio: había que regrabar igual y los capítulos salían largos. Los diez puntos se aceptaron.
- **VERDICT:** ENG CLEARED, listo para implementar. Las seis decisiones marcadas ⚠️ se apartan del handoff y quedan para que el Director las confirme o revierta.

NO UNRESOLVED DECISIONS
