# Plan — Tutoriales en video y Preguntas frecuentes

> Estado: **plan revisado (`/plan-eng-review` + segunda opinión independiente, 2026-10-12)**, sin código
> todavía. Las decisiones D1–D10 las tomó el Director en la revisión; las marcadas «por recomendación»
> se tomaron sin preguntar (regla «dale con lo recomendado») y se pueden reabrir.

## Qué se quiere

Que quien usa Spira pueda **ver cómo se hace** un flujo, no solo leerlo:

1. **Videos cortos narrados** de los flujos más importantes, con voz IA y subtítulos.
2. **Enganchados a la ayuda en contexto:** al lado de la acción clave, un globo con la explicación
   escrita, una miniatura y «Ver tutorial (1:20)», que reproduce el video en un modal.
3. **Un apartado «Ayuda»** con dos pestañas: **Tutoriales** (la lista entera, ordenada por módulo, como
   un curso) y **Preguntas frecuentes** (cada respuesta enlaza al tutorial que la muestra).

## Decisiones

| # | Decisión | Elegido | Por qué |
|---|---|---|---|
| D1 | Método | **Grabación guionada con Playwright + voz IA** | Reproducible: si cambia una pantalla, se vuelve a correr el guion. Los subtítulos salen del mismo guion (WCAG 1.2.2). |
| D2 | Alcance | **Por etapas** | La etapa 1 valida lo incierto con UN tutorial antes de guionar quince. |
| D3 | Datos de la grabación | **Proyecto Supabase «demo» aparte**, con las migraciones reales y datos ficticios | Desde el 2026-08-04 la app muestra el **nombre completo** de los pacientes: grabar contra prod publica datos reales. El demo es la app de verdad (RLS, RPC y escrituras reales) y queda además como **entorno de práctica** para capacitar. |
| D4 → **D9** | Dónde viven los videos | **Bucket público `tutoriales` en Storage de prod, con rutas versionadas** | La app saca varias versiones por día: regrabar en la misma PR ataría cada PR al demo y a la cuota de voz, y lo que entra al historial de git no sale sin reescribirlo. Los videos tienen datos 100 % ficticios. El catálogo y la versión de cada video van en el repo. La lista de reproducción se arma **dentro de la app**; el espejo en YouTube queda para más adelante. |
| D5 → **D7** | Enganche con la ayuda en contexto | **Un globo nuevo con foco (`AyudaTutorial`) sobre `usePopover`** | Ni `Pistas` ni `InfoTip` admiten un botón adentro: los dos son `role="tooltip"`, y `InfoTip` cierra con `onBlur` (`InfoTip.tsx:111`). En tablet, el toque en el botón le saca el foco al ⓘ y el globo se desmonta antes del clic; con teclado el botón es inalcanzable. Hace falta un *disclosure*: abre con clic, mueve el foco adentro y cierra con Esc o con un clic afuera. |
| D6 | Aviso de tutorial desactualizado | **Paso del skill `cierre-jornada`**: `npm run tutoriales:verificar` | Un video viejo falla en silencio. CI en cada PR queda para cuando el demo no se pause (TODOS). |
| D8 | Calibración de la etapa 1 | **Recortada:** primero la prueba de herramientas (T0), después demo y Preguntas frecuentes, y la fábrica con **una sola voz** | WDAC ya bloquea ejecutables sin firmar en esta máquina, y `ffmpeg` lo es: se averigua en 30 minutos, no con la fábrica a medio armar. Las preguntas en texto son baratas y llegan antes. |
| D10 | Arreglos de la segunda opinión | **Los cuatro:** guardia reforzada y config fuera del repo · semilla narrativa y reset · sesión sin contraseña · aviso por captura | Ver «Ambiente demo» y «Desactualización». |

Por recomendación:

- **El guion es la fuente única** de narración, subtítulos, transcripción, capítulos y clics.
- **Primero la voz, después la imagen:** el audio de cada paso fija cuánto espera Playwright.
- **Cursor dibujado:** Playwright graba sin puntero. Se inyecta uno, con movimiento suave y un pulso al
  hacer clic.
- **La voz se elige de oído en las consolas web** de los proveedores (Azure tiene `es-AR-ElenaNeural` /
  `es-AR-TomasNeural`; también ElevenLabs y OpenAI). Después se implementa **un solo** adaptador detrás
  de una interfaz chica, por si algún día se cambia.
- **Navegador de grabación: Edge del sistema** (`channel: 'msedge'`, como pide CLAUDE.md), con
  `recordVideo.size` explícito en 1536×864. Sin `size`, Playwright reduce a un máximo de 800×800.
- **Visibilidad:** cada usuario ve los tutoriales y preguntas de **sus** módulos.
- **«Visto» en localStorage,** igual que las leídas de la campana (v2). Envuelto en try/catch.
- **Preguntas frecuentes estáticas en el repo** (`src/ayuda/preguntas.ts`), con el patrón de
  `src/lib/glosario.ts`: versionadas con la pantalla que describen, revisadas en PR, sin migración.
- **El centro de Ayuda es un `Drawer`** que se abre desde el **menú de usuario** («Ayuda y tutoriales»,
  decisión del Director en `/plan-design-review`) y arranca filtrado por el módulo donde estás parado. No
  es un módulo del registry: los módulos son áreas de trabajo con roles, y la ayuda se abre encima de lo
  que estás haciendo. Ver «Diseño».
- **Subida a Storage, en la v1, por el dashboard:** la fábrica deja una carpeta lista para arrastrar
  (`<id>/<versión>/`). Así no queda ninguna clave de prod en disco. La subida automática va a TODOS.

## Arquitectura

### Las dos mitades y la frontera

```
  FÁBRICA (tutoriales/, corre en la máquina)                  APP (src/, corre en el navegador)
  ───────────────────────────────────────────                 ──────────────────────────────────
  guiones/<id>.ts ──importa──► src/ayuda/tutoriales.ts ◄──importa── AyudaTutorial (globo con foco)
     │ (pasos: dice/hace)       (catálogo: id, título, módulo,      AyudaDrawer (Tutoriales | Preguntas)
     │                           descripción, orden)                TutorialModal
     ▼                          src/ayuda/tutoriales.meta.json ◄──── (duración, versión, capítulos,
  1. reset del demo                    ▲ la escribe la fábrica        transcripción)
  2. TTS por paso → mp3 + duración     │                                  │
  3. Edge + Playwright contra la app local apuntada al DEMO               │ arma la URL versionada
     (sesión por storageState; cursor dibujado;                           ▼
      espera max(acción, audio); captura chica por paso)       Storage prod: tutoriales/<id>/<versión>/
     └─► video crudo + marcas de tiempo                          video.mp4 · subtitulos.vtt · poster.jpg
  4. ffmpeg-static: audios en sus marcas + video                          ▲
     armarVtt(marcas, textos) · póster · meta                             │ el Director arrastra la carpeta
     └─► tutoriales/salida/<id>/<versión>/  (git-ignored) ────────────────┘ (v1, sin claves de prod en disco)
```

**Las fronteras:** la app no importa nada de la fábrica; la fábrica importa el catálogo de `src/ayuda/`
para no repetir títulos. Lo que la fábrica le deja al repo es solo `tutoriales.meta.json` (texto chico)
y las capturas de referencia achicadas (ver «Desactualización»). Los binarios van a Storage.

**La versión** es un hash corto del contenido del mp4. Va en la ruta, así que un video regrabado nunca
choca con la caché del anterior, y el que todavía no se subió da 404 (manejado, ver «Modos de falla»).

### El guion

Un archivo por tutorial. Un único spec (`tutoriales/grabar.spec.ts`) los recorre: un `export default`
no lo ejecuta el runner por sí solo.

```ts
// tutoriales/guiones/dispensar.ts
export default guion('dispensar', {
  preparar: async (demo) => { await demo.pedidoPendiente({ paciente: 'Marta Quiroga' }) }, // vía RPC
  pasos: [
    { dice: 'Desde Farmacia, entrá a Dispensaciones.',
      hace: async (p) => { await p.irA('pharma/dispensaciones') } },
    { dice: 'Elegí el pedido de la paciente y tocá «Dispensar».',
      hace: async (p) => { await p.clic(p.getByRole('button', { name: 'Dispensar' }).first()) },
      capitulo: 'Elegir el pedido' },
    // …
  ],
})
```

- Del mismo arreglo salen la narración (TTS de `dice`), los subtítulos, la transcripción debajo del
  video (WCAG 1.2.x, alternativa al medio) y los capítulos.
- Selectores **por rol y nombre accesible**, nunca por clase CSS.
- `preparar` crea con las **RPC reales** el estado que el guion va a consumir. Dispensar gasta el pedido
  (solicitada → preparando → lista → entregada), así que cada guion arranca de un reset más su propio
  `preparar`. Una toma nunca le deja el demo gastado a la siguiente.
- Config de Playwright con `testMatch: 'grabar.spec.ts'`. Si no, su patrón por defecto levanta los
  `tutoriales/lib/*.test.ts` de vitest. Un `tutoriales/tsconfig.json` propio entra al `typecheck` del
  build (`tsc --noEmit && tsc --noEmit -p tutoriales`): el `tsconfig` raíz solo mira `src`.

### El ambiente demo

```
  %USERPROFILE%\.spira\demo.env  (FUERA del repo: así anda desde cualquier worktree)
  ├── DEMO_REF=<ref del proyecto demo>
  ├── (la URL NO va: config.mjs la arma como https://<DEMO_REF>.supabase.co — un dato menos a mano)
  ├── VITE_SUPABASE_PUBLISHABLE_KEY=…
  ├── DEMO_SECRET_KEY=…        (clave secreta del DEMO: crear usuarios, generar sesiones)
  ├── DEMO_DB_URL=postgres://… (sólo el demo)
  └── TTS_KEY=…

  scripts/demo/
  ├── config.mjs    ← lee el archivo de arriba; si falta, «Falta %USERPROFILE%\.spira\demo.env (ver docs/plan-tutoriales.md)»
  ├── guardia.mjs   ← tres cerrojos (abajo), antes de cualquier escritura
  ├── verificar.mjs ← `npm run demo:verificar`: config + guardia + que las claves respondan, sin mostrar valores (T1)
  ├── resetear.mjs  ← base limpia + supabase/migrations/* en orden + bucket ip-docs + centinela + semilla
  └── semilla.mjs   ← semilla NARRATIVA (abajo)
```

**Guardia: tres cerrojos, porque escribir pacientes ficticios en prod es el peor escenario del plan.**

1. **Lista blanca, no lista negra.** El ref del proyecto tiene que ser `DEMO_REF`, mirando el host **y el
   usuario** de `DEMO_DB_URL`. En el pooler de Supabase el host es compartido entre proyectos
   (`aws-0-<región>.pooler.supabase.com`) y el ref viaja en el usuario (`postgres.<ref>`): una URL copiada
   de prod pasaría un chequeo solo por host. Exige además que lo lance un `npm run demo:…` (npm deja el nombre
   en `npm_lifecycle_event`) o `SPIRA_DEMO=1` explícito. No va un `SPIRA_DEMO=1 node …` en `package.json`
   porque esa sintaxis no anda en `cmd`. Lleva además el ref de prod escrito como lista negra encima de la
   blanca (no es secreto: viaja en el bundle público).
2. **Tabla centinela.** Después de conectar y antes de escribir: `select 1 from public.demo_centinela`.
   La crea `resetear.mjs` y **no es una migración**, así que en prod no existe nunca. Excepción única: la
   primera vez, con la base vacía (sin `public.users`), se permite crearla.
3. **En el navegador.** El setup global de Playwright lee la URL de Supabase del bundle cargado y aborta
   si no contiene `DEMO_REF`. Vite completa lo que falte con `.env` / `.env.local`, así que un
   `VITE_SUPABASE_URL` ausente haría que la app grabada apunte a prod. Por eso la app del demo se
   levanta con `--mode demo`, y las variables se inyectan desde `config.mjs`, no desde archivos del repo.

**Semilla narrativa (no la de `banco-rls`).** `scripts/banco-rls/sembrar.mjs` arma datos para probar
permisos, no para filmar: nombres como «Perfil 03», fechas al azar, una pasada con
`session_replication_role = replica` (que además el rol `postgres` de Supabase no tiene permitido) y
usuarios de `auth.users` sin contraseña ni identidad. De `banco-rls` se reusa solo **el orden de
aplicación** de las migraciones. La semilla se escribe a mano:

- Nombres ficticios creíbles, un protocolo de ejemplo con su medicación (GTIN, lote, vencimiento), un
  pedido pendiente, visitas de la semana y un reporte por evolucionar.
- **Fechas relativas al día de la grabación**, para que el Resumen y el calendario se vean vivos.
- Creada, donde existan, con las **RPC reales**, no con `insert` crudos: así respeta las mismas reglas
  que la app.
- Usuarios creados con la API admin del demo (`DEMO_SECRET_KEY`), un perfil por módulo.
- **Mantenimiento:** una migración que cambie una RPC usada por la semilla la rompe. `resetear.mjs` corre
  en `tutoriales:verificar`, así que se nota en el cierre de jornada.

**Sesión sin contraseña.** El setup obtiene la sesión con `auth.admin.generateLink` + `verifyOtp` y la
guarda como `storageState` de Playwright. Nadie tipea contraseñas (tampoco el agente, que no puede
hacerlo contra un host que no es local), y el login, con su iframe de YouTube, no se graba.

**Pausa del plan gratuito:** a los 7 días sin uso. `resetear.mjs` lo detecta (timeout o 5xx del health)
y dice «El demo está pausado: despausalo desde el dashboard de Supabase», no un stack trace.

### En la app

```
  UserMenu ──«Ayuda y tutoriales»──► AyudaDrawer (lazy)
  CommandPalette ──chip «Ayuda»──────┤ ├── Preguntas (primero): buscador sin tildes + acordeón ──«Ver cómo se hace»──┐
                                       └── Tutoriales: lista por módulo · duración · ✓ visto ────────────────────────┤
                                                                                                                      ▼
  <AyudaTutorial id="dispensar" />  ──clic──► globo (foco adentro, Esc / clic afuera)          TutorialModal (lazy)
     píldora «▶ Cómo se hace 1:20»             ├── explicación (descripción del catálogo)     ├── <video preload="none" poster
                                                ├── póster                                      │     controls crossOrigin="anonymous">
                                                └── [Ver tutorial (1:20)] ─────────────────────►├── <track kind="captions" default>
                                                                                                ├── transcripción plegable
                                                                                                └── «Siguiente: …» al terminar
```

- `AyudaTutorial` es un componente nuevo, no un prop de `InfoTip`: el ⓘ es una pista (se mira) y esto es
  un *disclosure* (se usa). Comparte `usePopover` (portal, Esc en capas, registro de popovers anidados) y
  agrega `aria-expanded`/`aria-controls`, el foco al primer control al abrir y la devolución del foco al
  cerrar. Sin cierre por `blur`.
- La URL del video se arma en un solo lugar (`urlDelTutorial(id)`): base de Storage + `<id>/<versión>/` +
  archivo, con la versión tomada de `tutoriales.meta.json`.

## Diseño (`/plan-design-review`, 2026-10-12)

**Mock: [`docs/mock-tutoriales.html`](mock-tutoriales.html)** (tokens reales, datos ficticios; el panel de Ayuda
responde de verdad). Se implementa **desde el mock**, no desde esta descripción. Si algo choca, manda el mock y
se corrige el plan.

### Decisiones

| # | Qué | Elegido | Por qué |
|---|---|---|---|
| DD1 | Mocks | HTML con tokens reales en `docs/` | Convención de la casa; lo aprobado es lo que se construye |
| DD3 | Entrada | **Fila «Ayuda y tutoriales» en el menú de usuario** (`helpCircle`), en grupo propio entre los ajustes y «Cerrar sesión» | Decisión del Director. Las otras tres filas abren Ajustes; esta abre el panel encima de lo que estás haciendo |
| DD4 | Buscador | **Chip «Ayuda» en `CommandPalette`**: busca en preguntas y títulos de tutoriales | La ayuda aparece donde la gente ya busca; compensa que la entrada esté en un menú |
| DD5 | Disparador en contexto | **Píldora «▶ Cómo se hace 1:20»** al lado del título de la vista, **una por pantalla** | Se entiende sin hover (tablet); la duración dice cuánto tiempo pide |
| DD6 | Descubrimiento | **Entrada en Novedades + las píldoras.** Sin avisos emergentes ni tours | No interrumpe a nadie en medio de una visita; Sereno pide calma |
| DD7 | Pestaña inicial | **Preguntas.** Desde la pantalla final del último video, «Todos los tutoriales» abre en Tutoriales | La duda puntual se resuelve leyendo; cada respuesta enlaza a su video |

Por recomendación: sin reproducción automática del siguiente; «Contanos» al pie del panel abre el Feedback con
lugar; el panel arranca en el módulo actual con «Ver todos los módulos» (desde Inicio, o con un solo módulo,
arranca en todos y el enlace no aparece).

| # | Qué (segunda opinión de diseño, verificada en el código) | Elegido |
|---|---|---|
| DD8a | Capas | **Un solo dueño en `AppShell`** (ver «Capas y foco») |
| DD8b | Búsqueda del panel | Con texto, busca en **las dos pestañas y todos los módulos**; cuentas en el control; vacío sólo si el total es 0 |
| DD8c | Reproductor en tablet | Video **limitado por alto**; un solo quiebre en 1100 px; transcripción en caja propia; pantalla final fuera del `<video>` |
| DD8d | Píldora | **La dibuja `AppShell`** al lado del `h1`, según el catálogo; se oculta si el video no está publicado |
| DD10 | El tutorial **en el tooltip** (pedido del Director) | Los controles clave del flujo (`data-tutorial="<id>"`) muestran, al pasar el mouse, una **tarjeta con el tutorial pausado**: el texto del `title` + el video. **Play adentro, con sonido**. Al dar play **la tarjeta se fija** (no se cierra al sacar el mouse) hasta ✕ / Esc / clic afuera, y al cerrarse el video se detiene. «Ver en grande» lo pasa al reproductor en el mismo segundo. El globo de la píldora es **la misma tarjeta** (`TarjetaTutorial`), así hay una sola pieza |
| DD9 | Foco del `Modal` | **Se arregla en `Modal.tsx` para toda la app** (foco inicial, trampa y devolución, como el `Drawer`). Cierra el TODO «Core · focus trap en `components/Modal.tsx`» |

### Capas y foco

Verificado: el fondo del `Drawer` lleva `backdropFilter` (`Drawer.tsx:129`), así que todo hijo `position: fixed`
queda encerrado en sus 440px; `Modal` y `Drawer` comparten `--spira-z-drawer` (50); el globo vive en
`--spira-z-popover` (300) y `usePopover` cierra con cualquier `mousedown` afuera. Por eso **nada se monta adentro
de otra capa**:

```
  AppShell
  └── AyudaProvider  (estado: panel {abierto, pestaña, alcance, búsqueda, preguntaAbierta}
       │                     tutorial {id} | null · feedback {buscaba} | null)
       ├── …la app (la píldora llama abrirGlobo; el globo es un popover suelto)
       ├── AyudaDrawer        ← hermano
       ├── TutorialModal      ← hermano, DESPUÉS del Drawer (le gana en el orden del DOM)
       └── FeedbackModal      ← ya montado en el shell; recibe {buscaba}
```

Transiciones, una capa por vez:

| Desde | Acción | Qué pasa |
|---|---|---|
| Tooltip (tarjeta sin fijar) | sacar el mouse | se cierra como cualquier pista |
| Tooltip / globo | play | reproduce **ahí mismo con sonido** y la tarjeta se fija |
| Tarjeta fijada | ✕ / Esc / clic afuera | se cierra y el video se detiene; el foco vuelve al disparador |
| Tooltip / globo | «Ver en grande» | cierra la tarjeta → abre el reproductor **en el mismo segundo**; al cerrar, el foco vuelve al disparador |
| Panel | una fila de tutorial / «Ver cómo se hace» | el panel **queda abierto debajo**; el reproductor arriba; al cerrar, el foco vuelve a **la fila** |
| Panel | «Contanos» | el panel queda debajo; Feedback arriba, con el lugar = la vista de fondo y «Buscaba: "x"» precargado |
| Reproductor | «Ver siguiente» | cambia de video en el mismo modal |
| Paleta | resultado «Ayuda» (pregunta) | cierra la paleta → abre el panel en Preguntas con esa respuesta desplegada |
| Paleta | resultado «Ayuda» (tutorial) | cierra la paleta → abre el reproductor |

Esc cierra **sólo la capa de arriba** (el `Modal` frena la propagación; el globo nunca está abierto a la vez que el
modal). Lo que se recuerda al cerrar y reabrir el panel dentro de la sesión: pestaña y alcance; la búsqueda no.

### Piezas

- **Dónde va la píldora:** la dibuja `AppShell`, **hermana** del `h1` (no adentro: si no, el nombre accesible del
  título pasaría a ser «Dispensaciones Cómo se hace 1:20»), buscando el tutorial de la vista en el catálogo por
  `"<modulo>/<sub>"` (`tutorialDeLaVista`). Sólo en la pantalla principal del submódulo, no en las sub-pantallas
  con migas (el detalle de un paciente). No aparece si el tutorial no tiene versión publicada en el meta.
- **Píldora** (`AyudaTutorial`): alto 30, radio pill, borde 1px `--spira-line-2`, fondo blanco, Inter 600 12.5px
  tinta; disco de 18px en el acento del módulo con ▶ papel; duración en `muted` y `.spira-mono`. Hover y
  abierta: levante de 1px + `--spira-shadow-hover` (nunca un borde de color).
- **`TarjetaTutorial`** (DD10), la misma pieza en dos lugares: el **tooltip** de los controles clave (con mouse)
  y el **globo de la píldora** (tablet y teclado). Ancho 400, blanco, borde `--spira-line-2`, radio 12, sombra
  **lg**, padding 14, flecha hacia el disparador. Título Schibsted 700 14px; texto 13px `muted` (en el tooltip, el
  del `title`; en el globo, la descripción del catálogo); **el video pausado** 16:9 (372×209), con el primer
  cuadro de póster, un disco de play de 44px en el acento (nombre accesible «Reproducir el tutorial X, 1 minuto
  20 segundos») y el chip de duración. Al dar play: **con sonido**, subtítulos activados, barra de tiempo, pausa y
  silencio propios (chicos, 28px), y la tarjeta **se fija**: aparece un ✕ arriba a la derecha y deja de cerrarse
  al sacar el mouse. Pie: «⤢ Ver en grande» (abre el reproductor en el mismo segundo y cierra la tarjeta) y, si
  corresponde, «✓ Ya lo viste».
- **Cuándo se abre como tooltip:** con la misma demora y la misma gracia de `Pistas` (se puede entrar con el
  mouse a la tarjeta). Mientras está **sin fijar** se comporta como cualquier pista (se va al sacar el mouse);
  **fijada**, como un diálogo no modal (`role="dialog"`, el foco entra al control de play). Un solo video
  sonando a la vez: abrir otra tarjeta o el reproductor pausa el anterior. Nunca arranca solo.
- **Dónde lo decide el código:** `Pistas` sigue siendo el único que escucha los `title`; cuando el elemento
  apuntado tiene `data-tutorial`, en vez del papel de texto monta la `TarjetaTutorial` con ese texto. Los
  controles que lo llevan se eligen a mano: **uno por flujo**, la acción clave (p. ej. «Dispensar»), no los
  ~180 `title` de la app.
- **Reproductor** (`TutorialModal` sobre `Modal`): hasta 920px de ancho. Encabezado: título H2 20px + chip del
  módulo + ✕. Cuerpo: video 16:9 **limitado por alto** (`max-height: calc(100vh - 240px)`, el ancho sale del
  16:9), así entra entero en una tablet apaisada de 1024×768. **Capítulos** (240px) a la derecha **desde 1100px**;
  por debajo, una fila horizontal con desplazamiento bajo el video (un solo quiebre). Cada capítulo es un botón
  «0:38 Escanear el lote» que salta a ese tiempo; el **actual** va en peso 600, el tiempo en tinta, una barrita
  de progreso de 2px en el acento y `aria-current`. **Sin borde:** cambia solo con la reproducción, no lo elige
  el usuario, así que no le corresponde la regla de selección persistente. Pie: «Leer la transcripción»
  plegado, que se abre en **una caja propia con scroll** (`max-height` ~160px) para no empujar el video fuera de
  la vista, y «Siguiente: …». `playsInline`. Subtítulos activados de entrada; el fondo tinta al 82 % (`::cue`)
  es una mejora deseable, no una garantía (Safari lo ignora en parte).
- **Pantalla final:** reemplaza el área del video (no se superpone a sus controles, y sobrevive a salir de la
  pantalla completa nativa del iPad). Es el estado «al terminar» de la tabla de abajo.
- **Panel de Ayuda** (`AyudaDrawer` sobre `Drawer`): 440px desde la derecha. Arriba: título «Ayuda» + ✕,
  buscador (foco sobrio: sombra + levante), `SegmentedControl` Preguntas | Tutoriales (**`radiogroup`**, el de
  hoy; con texto en el buscador muestra cuentas: «Preguntas 2 · Tutoriales 1») y la línea «Mostrando
  **Farmacia** · Ver todos los módulos». Preguntas: acordeón de filas de 48px, la respuesta en 13px `muted`
  con «▶ Ver cómo se hace 1:20» si tiene video. Tutoriales: agrupados por módulo (rótulo en mayúsculas +
  «1 de 4 vistos»), filas de 64px con miniatura de 96px, título, una línea de qué enseña y, **al lado**, «✓
  Visto». Pie fijo: «¿No está tu duda? Contanos». **El encabezado y el pie quedan fijos** y solo scrollea el
  medio: hace falta sumar a `Drawer` los props `header` y `footer` (hoy todo scrollea junto).
- **«Visto»** = el video terminó (`ended`) o se reprodujo ≥90 %. Abrirlo no alcanza.

### Estados

```
  PIEZA            | CARGANDO                  | VACÍO                                  | ERROR                                   | ÉXITO / FIN
  -----------------|---------------------------|----------------------------------------|-----------------------------------------|----------------------------------
  Tarjeta (tooltip | póster + spinner nativo   | — (sólo existe si hay tutorial         | 404 / red: el texto de la pista se ve   | «✓ Ya lo viste» si corresponde;
  y globo)         |   al dar play             |   publicado; si no, pista de texto)    |   igual; en lugar del video, «No se     |   al terminar: [Volver a ver]
                   |                           |                                        |   pudo cargar el video» [Reintentar]    |   [Ver en grande]
  Reproductor      | póster + spinner nativo   | —                                      | 404: «Este video todavía no está        | Al terminar: «Siguiente: X (1:45)»
                   | del <video>               |                                        |   disponible» + la transcripción sigue  |   [Volver a ver] [Ver siguiente]
                   |                           |                                        | Red: «No se pudo cargar el video.       |   sin cuenta regresiva
                   |                           |                                        |   Revisá la conexión…» [Reintentar]     |
  Panel · buscador | —                         | «No encontramos nada con "x"» + «Probá |                                         | filtra mientras tipeás, sin tildes
                   |                           |   con otra palabra» + [Contanos qué     |                                         |
                   |                           |   buscabas] (EmptyState)               |                                         |
  Panel · módulo   | —                         | «Todavía no hay tutoriales de          |                                         |
  sin tutoriales   |                           |   Coordinación. Las preguntas sí.»     |                                         |
                   |                           |   + «Ver los de todos los módulos»     |                                         |
  Último de la     |                           |                                        |                                         | Al terminar, sólo [Volver a ver]
  lista            |                           |                                        |                                         |   y «Todos los tutoriales»
  Panel / repro.   | esqueleto con el ancho    |                                        | el chunk lazy no baja (sin red):        |
  (carga lazy)     |   final (440px / modal)   |                                        |   «No se pudo abrir la Ayuda. Probá de  |
                   |                           |                                        |   nuevo.» [Reintentar]                  |
  Póster / VTT 404 |                           |                                        | póster: el cuadro de papel liso con el  |
  (video sí)       |                           |                                        |   disco; VTT: sin subtítulos, la        |
                   |                           |                                        |   transcripción sigue                   |
```

### Recorrido

```
  PASO | QUIÉN HACE                                 | QUÉ SIENTE                    | LO SOSTIENE
  -----|--------------------------------------------|-------------------------------|------------------------------------------
  1    | Lee en Novedades «Ahora hay tutoriales»    | curiosidad, sin presión       | Novedades (ya existe), sin emergentes
  2    | En Dispensaciones ve «▶ Cómo se hace 1:20» | «son 80 segundos, va»         | la duración en la píldora
  2b   | Apoya el mouse en «Dispensar», duda        | «a ver cómo era»              | tarjeta con el video pausado; play ahí
       |                                            |                               |   mismo, con sonido, sin irse de la pantalla
  3    | Abre el globo                              | sabe qué va a ver antes       | descripción de dos renglones + póster
  4    | Mira el video                              | lo sigue sin perderse         | cursor visible, subtítulos, capítulos
  5    | Termina                                    | completo, no empujado         | «Siguiente» ofrecido, sin autoplay
  6    | Días después, duda puntual                 | quiere la respuesta ya        | buscador (chip Ayuda) o Preguntas primero
  7    | No encuentra su duda                       | escuchado, no frustrado       | «Contanos» → Feedback con lugar
```

### Tablet y accesibilidad

- **Tablet (768–1100):** el panel mantiene 440px; los capítulos pasan **abajo del video, en una fila
  horizontal** con desplazamiento (quiebre único en 1100px); el video se limita por alto; el globo se reubica
  con el flip de `usePopover`. Filas de 48px (preguntas) y
  64px (tutoriales): por encima de los 44px de toque.
- **Teclado:** la píldora es un `button` con `aria-expanded`/`aria-controls`; al abrir, el foco va al play;
  Tab recorre play → «Ver en grande» (y, fijada, ✕); Esc cierra la capa de arriba (modal antes que globo) y el foco
  vuelve a quien abrió. El panel atrapa el foco (`Drawer`). Las pestañas son `role="tablist"` con flechas;
  cada pregunta es un `button` con `aria-expanded`. Los capítulos son botones con nombre «Ir a 0:38, Escanear el
  lote» y `aria-current` en el actual. Las pestañas son el `radiogroup` de `SegmentedControl` (flechas para
  moverse), no un `tablist`. **El reproductor pone el foco inicial en el `<video>`** y lo devuelve a quien lo
  abrió (DD9).
- **Lector de pantalla:** el globo es `role="dialog"` con `aria-label` del título; el panel, `role="dialog"`
  «Ayuda»; el reproductor, el `Modal` existente. La transcripción es la alternativa al medio (WCAG 1.2.x).
- **Tema oscuro:** el mock es solo claro. Las piezas usan tokens, así que lo heredan; lo único fijo es lo que va
  **sobre el video** (chip de duración, subtítulos, velo del póster), en tinta translúcida, igual en ambos temas.
  Se verifica en QA con el tema oscuro puesto.
- **Contraste:** todo texto de lectura en tinta o `muted` (nunca `faint`); el chip de duración sobre el póster va
  sobre tinta al 78 %. **`prefers-reduced-motion`:** sin levante ni rotación del chevron.

## Etapas

### Etapa 1 — Recortada (D8)

0. **T0 — Prueba de herramientas (30 min), antes de todo:** `ffmpeg-static -version` bajo WDAC · 5 s con
   Edge + `recordVideo` a 1536×864 · `Page.startScreencast` por CDP · un `<track>` servido desde Storage
   de otro origen (CORS). Lo que falle ahí decide el plan B **antes** de construir.
   **Hecho el 2026-10-12, los cuatro en verde** (ver «Resultados de T0», abajo).
1. **Ambiente demo:** config, guardia de tres cerrojos, resetear, semilla narrativa, sesión. El Director
   crea el proyecto (5 min) y completa `demo.env`.
2. **Preguntas frecuentes en texto:** `AyudaDrawer` con la pestaña Preguntas, la fila en el menú de
   usuario y el chip «Ayuda» en el buscador.
   Las primeras preguntas salen de lo que ya llegó por feedback con lugar.
3. **Fábrica con una sola voz:** guion, cursor, TTS (un adaptador), línea de tiempo, VTT, mezcla y
   capturas.
4. **Piloto:** propuesto **Farmacia › Dispensar una medicación** (corto, frecuente, con escritura, popover
   y modal; a confirmar por el Director). Prueba de nitidez a 1536×864 (la notebook de referencia).
5. **Bucket `tutoriales`** (migración **0155**, aditiva) + `AyudaTutorial` + `TutorialModal` + pestaña
   Tutoriales + la píldora en Dispensaciones.
6. **`tutoriales:verificar`** y su paso en `cierre-jornada`.

**Sale de la etapa 1:** el Director mira el piloto en la app y aprueba voz, ritmo y formato.

**Orden de despliegue de la 0155:** es **aditiva** (un bucket nuevo que ningún front viejo pide), así que
va **la migración primero** y el front después (CLAUDE.md, regla 3). Contenido:
`insert into storage.buckets (id, name, public) values ('tutoriales','tutoriales', true) on conflict (id)
do nothing;`. Sin policies de escritura: la subida es por el dashboard. Idempotente.

### Etapa 2 — Contenido

1. **Elegir los flujos** (lo decide el Director). Candidatos:
   - Coordinación: marcar llegada y recorrer una visita · agendar/reprogramar · Pendientes · cargar un
     reporte · Tareas · alta de paciente en un estudio.
   - Farmacia: recepción de medicación · dispensar · reposición · leer el stock.
   - Transversal: el Resumen · notificaciones · feedback con lugar.
2. Un guion por flujo, de 60 a 120 s y con un solo objetivo por video.
3. Un `AyudaTutorial` en cada pantalla que tenga su tutorial, con medida: uno por flujo, en la acción
   clave.
4. Más preguntas frecuentes, enlazadas a sus tutoriales.

## Desactualización (D6 + D10)

`npm run tutoriales:verificar` = reset del demo + cada guion **sin TTS ni video**, con dos avisos:

1. **El selector ya no existe:** falla nombrando el tutorial, el paso y su texto.
2. **La pantalla cambió:** en cada paso se toma una captura chica (480 px de ancho, unos 20 KB) y se
   compara con `toHaveScreenshot`, con tolerancia, contra la de la última grabación
   (`tutoriales/capturas/<id>/<paso>.png`, en el repo, porque pesan poco). Así un cambio de layout, una
   columna nueva o un copy distinto también marcan el video como viejo, aunque los botones sigan
   llamándose igual.

Lo corre el skill `cierre-jornada`: «¿cambió alguna pantalla con tutorial? → `npm run tutoriales:verificar`».
Si falla, ese tutorial se regraba en lote. Ninguna PR queda frenada por eso.

## Lo que ya existe (y se reusa)

| Pieza | Dónde | Uso en este plan |
|---|---|---|
| Popover con registro de anidados, Esc en capas, portal, flip | `src/components/usePopover.ts` | Base de `AyudaTutorial` (D7) |
| ⓘ con título+cuerpo | `src/components/InfoTip.tsx` | **No se toca**: es una pista, no admite botones (D7) |
| `title` → pista de papel global | `src/components/Pistas.tsx` | **No se toca** |
| Contenido estático versionado | `src/lib/glosario.ts` | Patrón para `preguntas.ts`; las respuestas usan `<Termino>` |
| Modal / Drawer | `src/components/Modal.tsx`, `Drawer.tsx` | Bases de `TutorialModal` y `AyudaDrawer` |
| Menú de usuario (filas con cajita tintada) | `src/shell/UserMenu.tsx` | Fila «Ayuda y tutoriales» (`helpCircle`) en grupo propio |
| Buscador con chips por tipo | `src/shell/CommandPalette.tsx` | Chip «Ayuda»: preguntas y títulos de tutoriales |
| Novedades | `src/shell/AboutMenu.tsx` | La entrada que anuncia la Ayuda el día que sale |
| Pestañas / estado vacío | `src/components/SegmentedControl.tsx`, `EmptyState.tsx` | Preguntas | Tutoriales; vacío del buscador |
| Feedback con lugar | `src/shell/FeedbackModal.tsx` | Fuente de las primeras preguntas frecuentes |
| Orden de aplicación de migraciones | `scripts/banco-rls/base.mjs` | Lo reusa `resetear.mjs`. **La semilla de banco-rls NO** (ver arriba) |
| Embed de YouTube | `src/shell/CoverVideo.tsx` | Referencia para el espejo futuro (no en v1) |

## NO en alcance

- **Recorridos interactivos dentro de la app** (globos que señalan botones). Complemento futuro (TODOS).
- **Espejo en YouTube.** La fábrica deja mp4 + vtt listos para subir (TODOS).
- **Subida automática a Storage.** La v1 es por el dashboard, sin claves de prod en disco (TODOS).
- **CI de tutoriales en cada PR.** Necesita un demo que no se pause (TODOS).
- **«Visto» en la base / registro de capacitación.** Un video visto no prueba competencia (TODOS).
- **Medir el uso.** La app no tiene analítica; se pregunta al equipo después del piloto.
- **Preguntas frecuentes editables desde la app.** Estáticas en el repo hasta que alguien no-dev
  necesite editarlas.
- **Voz humana.** La interfaz de TTS la permitiría con un adaptador «archivo».
- **Traducciones.** Todo en castellano rioplatense.

## Tests

`vitest`, siguiendo el criterio de CLAUDE.md: se testea lo que falla **en silencio**. Los archivos
`tutoriales/guiones/*.ts` no chocan con vitest (no son `*.test.ts`); el choque real es con el
`testMatch` de Playwright, resuelto en su config.

```
CÓDIGO                                                   FLUJOS
[+] scripts/demo/guardia.mjs                             [+] Ver un tutorial desde la píldora
  ├── refPermitido(dbUrl, viteUrl, demoRef)                ├── [navegador] clic abre el globo con foco adentro
  │   ├── [CRÍTICO] URL directa de prod → aborta           ├── [navegador] tablet (768): el toque en «Ver tutorial» llega
  │   ├── [CRÍTICO] pooler, host compartido, usuario       ├── [navegador] teclado: Tab llega al botón del globo
  │   │            postgres.<ref-prod> → aborta            ├── [navegador] Esc: primero el modal, después el globo
  │   ├── VITE url ≠ DEMO_REF → aborta                     ├── [navegador] clic afuera cierra; el foco vuelve a la píldora
  │   ├── sin SPIRA_DEMO=1 / vacía / malformada → aborta   └── [navegador] subtítulos visibles por defecto
  │   └── todo coincide → sigue
  └── centinela: falta en una base con datos → aborta    [+] Ayuda › Tutoriales / Preguntas
[+] scripts/demo/config.mjs                                ├── [unit] filtra por módulos del usuario
  ├── archivo ausente → error con la ruta                  ├── [unit] orden por módulo y posición
  └── clave faltante → error nombrándola                   ├── [unit] buscador: sin tildes ni mayúsculas
[+] tutoriales/lib/vtt.ts · armarVtt                       ├── [unit] toda pregunta → tutorial existente
  ├── formato hh:mm:ss.mmm, > 1 h                          └── [navegador] «Siguiente» al terminar un video
  ├── paso sin texto → sin cue
  └── marcas desordenadas → error                        [+] Video no publicado
[+] tutoriales/lib/lineaDeTiempo.ts                        └── [navegador] 404 → «Todavía no está disponible este
  ├── acción > audio → espera la acción                        video.» (sin pantalla rota)
  ├── audio > acción → espera el audio
  └── pausa mínima entre pasos                           [+] Desactualización
[+] src/ayuda/catalogo                                     ├── [→E2E] tutoriales:verificar: selector perdido → falla
  ├── [unit] ids únicos; módulo existe en registry         │          nombrando tutorial y paso
  ├── [unit] todo id tiene entrada en meta.json            └── [→E2E] captura distinta → falla con el diff
  ├── [unit] meta: duración > 0, versión no vacía
  └── [unit] urlDelTutorial arma <id>/<versión>/<archivo>
[+] src/components/reglasDePista.ts (DD10)
  ├── [unit] tieneTarjeta: data-tutorial publicado → tarjeta; sin publicar → pista de texto
  └── [unit] seQuedaAbierta: sin fijar + mouse afuera → cierra; fijada → no cierra
[+] src/ayuda/visto.ts
  ├── [unit] marcar / leer
  └── [unit] localStorage que tira → no rompe, «no visto»
```

Archivos: `scripts/demo/guardia.test.ts`, `scripts/demo/config.test.ts`, `tutoriales/lib/vtt.test.ts`,
`tutoriales/lib/lineaDeTiempo.test.ts`, `src/ayuda/catalogo.test.ts`, `src/ayuda/visto.test.ts`,
`src/ayuda/preguntas.test.ts`. Lo que falla a la vista (globo, modal, drawer) se verifica en el
navegador, no con tests.

## Modos de falla

| Camino | Falla realista | ¿Test? | ¿Manejo? | ¿Lo ve el usuario? |
|---|---|---|---|---|
| Demo | `DEMO_DB_URL` de prod por el pooler (host compartido) | Sí | Lista blanca por usuario + centinela | Sí, aborta con mensaje |
| Demo | Falta `VITE_SUPABASE_URL` y Vite toma la de `.env` (prod) | Sí (`config`) | `--mode demo` + chequeo del bundle en el setup | Sí, aborta |
| Demo | Proyecto pausado | No | Detecta y lo dice | Sí |
| Demo | Una migración cambia una RPC de la semilla | Lo avisa `verificar` | Falla el reset con el nombre de la RPC | Sí, en el cierre |
| Grabar | WDAC bloquea `ffmpeg.exe` | T0 | Se decide el plan B antes de construir | — |
| Grabar | Selector inexistente / captura distinta | Es el aviso | Falla con tutorial y paso | Sí, en consola |
| TTS | Clave vencida / sin cuota | No | Error nombrando al proveedor | Sí |
| App | Catálogo sin entrada en `meta.json` | Sí | El build no pasa | — |
| App | Versión en `meta.json` todavía no subida a Storage (404) | No | `onError` → «Todavía no está disponible este video.» | Sí, sereno |
| App | `<track>` de otro origen bloqueado por CORS | T0 | `crossOrigin="anonymous"`; si Storage no manda CORS, la transcripción debajo del video sigue siendo la alternativa | Sí, sin subtítulos (degradado) |
| App | localStorage bloqueado | Sí | Todo «no visto» | No hace falta |

Sin brechas críticas: nada queda sin test, sin manejo y en silencio a la vez.

## Riesgos

- **Legibilidad en la tarjeta (DD10). CONFIRMADA en T0:** a 372px se leen títulos y botones, **no el texto de
  cuerpo**, ni grabando a 1280×720. En la tarjeta el sentido lo dan la voz y los subtítulos; el detalle, «Ver en
  grande». A probar en el piloto: una segunda versión **«recorte»** para la tarjeta, encuadrada sobre la zona
  donde ocurre la acción (la fábrica conoce la caja de cada elemento que toca, así que puede seguirla con un
  `crop` + zoom de ffmpeg), que a 372px quedaría cerca del 50 % en vez del 24 %.
- ~~**Nitidez.**~~ **Resuelta en T0:** `recordVideo` se lee bien en un cuadro quieto (apenas más blando y con el
  blanco un poco lavado); CDP + H.264 no se distingue de la captura de referencia. Arranque: `recordVideo`
  (ritmo de cuadros fijo, más simple) **siempre recodificado a mp4 H.264** con `ffmpeg-static` (el webm VP8 no
  anda en todos los Safari). Si en el piloto el movimiento (scroll, tipeo) se ve con bloques, se pasa a CDP.
  **Ojo con CDP:** manda un cuadro sólo cuando la pantalla cambia (12 cuadros en ~4 s), así que hay que armar
  el video con la duración real de cada cuadro (`concat` con `duration`), no con un ritmo fijo.
- ~~**WDAC.**~~ **Descartado en T0:** `ffmpeg-static` 6.0 corre (desde el scratchpad y desde la ruta del repo),
  con `libx264` y `aac`; el `ffmpeg` de Playwright también (`recordVideo` anduvo); Edge + playwright-core 1.56.1
  también. No hace falta el plan sin binarios.
- **Límite de proyectos gratuitos de Supabase** (2 activos por organización). Si ya están los dos, el
  demo va en otra organización gratuita.
- **Mantenimiento de la semilla:** es código que acompaña a cada migración. Presupuestado en T2 y
  vigilado por `verificar`.
- **`Modal.tsx` no maneja el foco** (TODO existente: «Core · focus trap en `components/Modal.tsx`»). **Entra
  a este plan (DD9, tarea T5a):** foco inicial, trampa y devolución en `Modal.tsx`, copiando el patrón del
  `Drawer`. Toca todos los modales de la app, así que lleva una pasada de QA por los principales.

## Resultados de T0 (2026-10-12)

Corrido en esta máquina (WDAC activo), en el scratchpad de la sesión, contra `docs/mock-tutoriales.html` como
escena (tiene texto real con los tokens). Nada quedó instalado en el repo.

| Chequeo | Resultado | Detalle |
|---|---|---|
| `ffmpeg-static` bajo WDAC | **Verde** | v6.0 (build gyan.dev, 81 MB) corre desde el scratchpad y desde una carpeta del repo; trae `libx264`, `libvpx`, `aac` |
| Edge + `recordVideo` 1536×864 | **Verde** | `channel: 'msedge'` + playwright-core 1.56.1; también a 1280×720. ~6 s de scroll = ~590 KB webm. El `ffmpeg` propio de Playwright corre |
| CDP `Page.startScreencast` | **Verde** | JPEG calidad 92 → mp4 H.264 crf 20: indistinguible de la captura de referencia. Cuadros sólo al cambiar la pantalla (12 en ~4 s) |
| CORS de Storage (prod) | **Verde** | GET y preflight responden `Access-Control-Allow-Origin: *`; el preflight acepta `range`. Medido sobre un objeto inexistente (el bucket aún no existe: «Bucket not found», la 0155 no está aplicada); se reconfirma con un 200 real después de la 0155 |
| Legibilidad a 372px (tarjeta) | **Como se temía** | títulos y botones sí, texto de cuerpo no (grabando a 1536 o a 1280) → versión «recorte» a probar en el piloto |

Decisión que sale de acá: **grabar con `recordVideo` y recodificar siempre a mp4 H.264**; CDP queda como plan B
si el movimiento se ve con bloques en el piloto.

## Paralelización

| Paso | Módulos | Depende de |
|---|---|---|
| T0. Prueba de herramientas | (descartable) | — |
| A. Ambiente demo | `scripts/demo/` | — |
| B. Preguntas frecuentes (Drawer) | `src/ayuda/`, `src/shell/` | — |
| C. Fábrica | `tutoriales/` | T0 (para grabar de verdad, también A) |
| D. App: catálogo, AyudaTutorial, modal, pestaña Tutoriales | `src/ayuda/`, `src/components/` | B (comparten `src/ayuda/`) |
| E. Piloto + 0155 | `tutoriales/guiones/`, `supabase/migrations/` | A, C, D |

Carriles: **T0** primero (30 min). Después **A**, **B** y **C** en paralelo (no comparten carpetas).
**D** después de B. **E** al final.

## Implementation Tasks

- [x] **T0 (P1, humano: ~2 h / CC: ~30 min)** — herramientas — Prueba en WDAC: ffmpeg-static, Edge+recordVideo 1536×864, screencast CDP, CORS de `<track>` desde Storage
  - Surfaced by: segunda opinión #5 (D8)
  - Files: `scratchpad` (descartable)
  - Verify: los cuatro chequeos con resultado anotado en este plan — **hecho el 2026-10-12, ver «Resultados de T0»**
- [x] **T1 (P1, humano: ~4 h / CC: ~30 min)** — demo — Config fuera del repo + guardia de tres cerrojos + tests
  - Surfaced by: D3, D10 (segunda opinión #2, #6)
  - Files: `scripts/demo/config.mjs`, `scripts/demo/guardia.mjs`, `scripts/demo/verificar.mjs`, `scripts/demo/*.test.ts`, `package.json` (`demo:verificar`)
  - Verify: `npm run test`; con una URL de pooler de prod en `demo.env`, aborta antes de escribir — **hecho el 2026-10-13**: 29 tests (con una mutación que rompe la lectura del usuario del pooler, fallan 5, entre ellos el crítico); `npm run demo:verificar` pasa contra el demo real y corrido a mano con `node` lo frena la guardia; `npm run build` verde (1948 tests)
- [x] **T2 (P1, humano: ~3 días / CC: ~1 día)** — demo — Resetear + semilla narrativa con RPC reales + sesión por `generateLink`. **Partida en dos PRs:**
  - Surfaced by: D10 (segunda opinión #3, #4, #7)
  - [x] **T2a — migrar y resetear** (2026-10-13): `scripts/demo/{db,migraciones,migrar,resetear}.mjs` + tests, `pg` como devDependency, `npm run demo:migrar` / `demo:resetear`.
    - **Las 154 migraciones entraron al demo en la primera corrida, sin un error.** Quedaron 63 tablas, 25 vistas, 183 funciones y 136 policies en `public`, el bucket privado `ip-docs` y sus **dos** policies.
    - El reset vuelve exactamente a lo mismo.
    - Cada migración va en su transacción, con su fila en `demo.migraciones`. Un hueco o una migración «fantasma» frenan y mandan a resetear.
    - **La centinela vive en el schema `demo`, no en `public`:** el reset vacía `public` y se la llevaría. La guardia se ajustó y hay un test que lo fija.
    - **El reset vacía `public` objeto por objeto y no hace `drop schema`:** Supabase guarda privilegios por defecto de `supabase_admin` atados al schema, y `postgres` no los puede recrear. Verificado después del reset: el dueño, el ACL y los 6 privilegios por defecto quedaron intactos.
    - **Sin la centinela presente, el reset no corre** (test con un cliente falso que confirma que no se ejecuta nada).
    - `config.mjs` arma la cadena desde `DEMO_DB_URL` (con `[YOUR-PASSWORD]`) + `DEMO_DB_PASSWORD`, codificando la contraseña.
  - [x] **T2b — semilla narrativa + cuentas + sesión** (2026-10-13): `scripts/demo/{semilla,sesion,app}.mjs` + `semilla.test.ts`, `tutoriales/lib/sesion.ts`, `npm run demo:sesion` / `demo:app`. Receta: `docs/plan-tutoriales-semilla.md`.
    - **`npm run demo:resetear` deja el centro ficticio en ~45 s, en la primera corrida y sin un error.** Son 4 cuentas (Valeria Sosa coord, Julieta Paz farma operator, Martín Ibarra farma leader, Dr. Andrés Ferro gerencia), ACME-301 con 5 visitas y 16 procedimientos, Bufomix con 60 en stock (lote L24A031), 4 pacientes y el pedido «solicitada». Cada paso corre como su cuenta, con las RPC reales.
    - Mirado en la app (Edge headless, logueada con la sesión del archivo). El Resumen de Coordinación muestra «2 visitas hoy (1 en el centro, 1 por llegar)», la ventana vencida de Ernesto Villalba en Pendientes, 2 próximas el jueves y la dispensación solicitada. En Farmacia › Dispensaciones aparece Héctor Quiroga con «Preparar».
    - **Las cuatro incertidumbres de la receta, resueltas:**
      1. Las 183 funciones son de `postgres`, así que el guard de la 0132 (`guard_reception_items_write`) deja pasar a `create_reception`.
      2. `auth.uid()` lee `request.jwt.claims->>'sub'`.
      3. Ninguna alerta mira `dispenses` a secas: salen de `computed_status`, y `lleva_ip` queda en false.
      4. `computed_status` compara `CURRENT_DATE` (UTC) con `window_end`, pero las ventanas de la semilla dejan días de margen. La semilla calcula «hoy» en hora AR, y hay un test para las 22:30.
    - **`sello_autor` re-sella `arrived_by`/`ready_by` en cada cambio de marca.** Corregir las horas históricas como `postgres` pelado los dejaba en null, así que se corrigen con los claims de la coordinadora puestos. La receta no lo traía.
    - **La fecha de alta también se corrige.** `create_patient_with_enrollment` la fija en `current_date`, la ficha la muestra, y un alta de hoy con un screening de hace seis semanas desentona. Se apaga `trg_guard_enrollment_immutable` sólo dentro de esa transacción.
    - **El IVRS va como lo carga la app**: en `p_code` del alta (`NewPatientForm`), y `ivrsDeInscripcion` cae ahí. No hace falta el UPDATE de `enrollments.ivrs_code` (hallazgo E).
    - **La sesión NO es un `storageState`:** la app la guarda en `sessionStorage` (`src/lib/supabase.ts`), y el `storageState` de Playwright sólo lleva cookies y `localStorage`.
      - `sesion.mjs` guarda la entrada tal como la escribe supabase-js, en `%USERPROFILE%\.spira\demo-sesiones\<cuenta>.json`, fuera del repo como `demo.env`.
      - `entrarComo(context, cuenta)` (`tutoriales/lib/sesion.ts`) la pone con `addInitScript`, sólo si no hay una.
      - El refresh token es de un solo uso: se regenera en cada reset, y cada guion arranca de uno.
    - **`npm run demo:app`** levanta la app contra el demo en el 5290 (el 5252 del primer intento chocaba con el Vite de otra sesión): el `webServer` de T6 y la forma de mirarla a mano.
      - `npm run dev -- --mode demo` solo no alcanza, porque no hay `.env.demo` y Vite completaría con el `.env` de prod.
      - Inyecta las variables en el entorno del proceso y comprueba en el módulo servido que la URL sea la del demo, sin el ref de prod.
    - El GTIN usa el prefijo GS1 `200` (uso interno, no se asigna a empresas) con el verificador bien calculado. El de la receta (`…457`) tenía mal el dígito.
  - Verify: `npm run demo:resetear`; `npm run demo:app` muestra solo datos ficticios creíbles — **hecho el 2026-10-13** (ver T2b)
- [ ] **T3 (P1, humano: ~1,5 días / CC: ~1,5 h)** — app — `AyudaDrawer` con Preguntas + `preguntas.ts` (+test) + fila en el menú de usuario + chip «Ayuda» en el buscador + entrada en Novedades
  - Surfaced by: D8 (preguntas en texto antes que los videos); DD3, DD4, DD6, DD7 del diseño
  - Files: `src/ayuda/AyudaDrawer.tsx`, `src/ayuda/preguntas.ts`, `src/ayuda/preguntas.test.ts`, `src/shell/UserMenu.tsx`, `src/shell/CommandPalette.tsx`, `src/shell/search/*`, las Novedades
  - Verify: `npm run build` verde + navegador contra `docs/mock-tutoriales.html` (recuadros 1 y 4): buscar «lote» filtra, «xyz» da el vacío, «Contanos» abre el Feedback
  - **Decisiones al implementar (2026-10-13):**
    - La fila del menú dice **«Ayuda»**, no «Ayuda y tutoriales», hasta que exista el primer video (T5).
    - El panel **no lleva todavía la pestaña Tutoriales**. Una pestaña que lleva a una lista vacía promete algo que no hay. Entra con el primer video.
    - El panel **no se carga diferido** (`React.lazy`): son unos pocos KB de texto, y la app no usa `lazy` en ningún lado. Estrenarlo sumaba un estado de error sin ganar nada. La carga diferida queda para el reproductor (T5).
    - La entrada en **Novedades** va en el ritual de cierre, con la versión (`src/lib/version.ts` se cura a mano al sacar release), no en esta PR.
    - `normalizar` (sin tildes) se mudó a `src/lib/texto.ts`, y el buscador global también dejó de distinguir tildes.
- [x] **T4 (P1, humano: ~2 días / CC: ~2 h)** — fábrica — guion, spec único, cursor, TTS (1 adaptador), línea de tiempo, VTT, mezcla, capturas, `tsconfig` propio
  - Surfaced by: D1, D8
  - Files: `tutoriales/package.json` (paquete propio), `tutoriales/playwright.config.ts`, `tutoriales/grabar.pw.ts`, `tutoriales/lib/*`, `tutoriales/guiones/prueba-mock.ts`, `tutoriales/tsconfig.json`, `package.json`, `.gitignore`
  - Verify: `npm run test`; `npm run tutoriales:grabar -- dispensar` deja `tutoriales/salida/dispensar/<versión>/` — **hecho el 2026-10-13 con el guion de prueba**: `npm run tutoriales:grabar -- -g prueba-mock` grabó 15,3 s a 1536×864 (mp4 H.264 + AAC, 825 KB). Los cuadros del medio de cada subtítulo muestran lo que dice la voz, con el cursor dibujado. El audio está (−21 dB medio). 13 tests puros, y `npm run build` verde (1977).
  - **Decisiones al implementar:**
    - **Paquete propio** (`tutoriales/package.json`): Playwright y el ffmpeg de 80 MB no se descargan en el CI ni en Vercel. Los módulos puros (`vtt`, `lineaDeTiempo`, `wav`) no importan nada pesado y los testea el `vitest` de la app. El chequeo de tipos de la fábrica corre aparte, con `npm run tutoriales:tipos` (no en `npm run build`, que no instala la fábrica).
    - **El spec es `grabar.pw.ts`, no `.spec.ts`**: el vitest de la app levanta todo `*.spec.ts` y reventaría importando Playwright.
    - **Voz provisoria: Helena** (Windows, es-ES), gratis y sin claves. La voz final es un adaptador más en `lib/voz.ts`, elegido con `TUTORIALES_VOZ`. Hay caché por voz + texto en `tutoriales/.cache/voz/`.
    - **Duración del WAV leyendo sus chunks** (`lib/wav.ts`): `ffmpeg-static` no trae `ffprobe`, y Windows mete chunks extra antes de `data`.
    - **Queda para T6:** la app levantada contra el demo (`webServer` con `--mode demo`), la sesión por `storageState`, el cerrojo 3 de la guardia (`verificarBundle`) y la versión «recorte» para la tarjeta.
- [x] **T5a (P1, humano: ~1 día / CC: ~1 h)** — core — Foco en `Modal.tsx`: inicial, trampa y devolución (patrón del `Drawer`) + QA de los modales principales
  - Surfaced by: diseño DD9 (segunda opinión #2); cierra el TODO «Core · focus trap en `components/Modal.tsx`»
  - Files: `src/components/Modal.tsx`, `src/components/reglasDeFoco.ts` (+ test), `TODOS.md` (tachado)
  - Verify: `npm run build` + navegador: Tab no sale del modal; Esc devuelve el foco al disparador, en el reproductor, el Feedback y un modal de Dispensaciones — **hecho el 2026-10-13**, contra el demo (`demo:app`), con Edge y teclado real:
    - **Feedback** (`autoFocus` en el texto): el foco abre en el texto, 15 Tab y 15 Shift+Tab no salen, y Esc lo devuelve al botón.
    - **Documentar la desviación** (sin `autoFocus`): abre en el ✕; con un Esc apenas abierto, cierra y vuelve al disparador.
    - **Cronograma › Editar visita** (dos modales): sólo el de arriba atrapa; Esc vuelve a «Editar» en el de abajo, y el siguiente a «Cronograma y procedimientos».
    - **Historial sobre el cajón de dispensación** (`Modal` sobre `Drawer`): atrapa el foco aunque el `Drawer` escuche Tab, y al cerrar el foco queda en el cajón.
    - El reproductor todavía no existe: entra con T5, y para eso está `initialFocusRef`.
  - **Decisiones al implementar:**
    - **El foco inicial respeta un `autoFocus` de adentro.** Más de diez modales lo usan, y React lo aplica antes que el efecto del `Modal`. Sin `autoFocus`, el foco va al `initialFocusRef` y si no, al primer control (el ✕, como el `Drawer`).
    - **El disparador se lee en el primer render**, no en el efecto: para entonces el `autoFocus` ya movió el foco.
    - **El foco se devuelve sólo si quedó suelto** (en el `body`). Si quien cerró lo puso en otro lado, como el escáner de `DispensacionDrawer.tsx:290`, no se le roba.
    - **Sólo el modal de arriba atrapa**, y un foco en otra capa (un cajón encima, un desplegable en su portal) no se toca.
    - **Después de recorrer con Tab, salir pide dos Esc** si el foco quedó en el ✕: el primero cierra la pista «Cerrar» que abrió el foco por teclado. Es la regla de una capa por vez de `Pistas`, que ya regía antes de este cambio.
    - **Con el modal abierto desde un menú** (Historial desde «Más acciones»), el ítem ya no existe al cerrar. El foco no se devuelve, y el `Drawer` lo pone en su primer control. No se pierde.
    - Las reglas van puras en `reglasDeFoco.ts`, con 12 tests, como `reglasDePista.ts`. El TODO proponía el primer test de componente del repo, pero vitest corre sin DOM.
- [ ] **T5b (P1, humano: ~1 día / CC: ~1 h)** — app — `TarjetaTutorial` en `Pistas` para los elementos con `data-tutorial` (DD10): video pausado, play con sonido, se fija al reproducir, «Ver en grande» en el mismo segundo
  - Surfaced by: pedido del Director (el tutorial en el tooltip)
  - Files: `src/components/Pistas.tsx`, `src/components/reglasDePista.ts` (+ test: `seQuedaAbierta(fijada, reproduciendo)`, `tieneTarjeta(el)`), `src/ayuda/TarjetaTutorial.tsx`, el `data-tutorial` en el botón «Dispensar»
  - Verify: `npm run build` + navegador contra el mock (recuadro 2b): sin fijar se va al sacar el mouse; play suena y fija; ✕/Esc/afuera cierran y detienen; «Ver en grande» sigue en el mismo segundo; los demás `title` de la app siguen iguales
  - Depende de: T5. **Ojo:** `Pistas` es global (todos los `title`) y tiene historia de arreglos finos (#414, #416, #418): cambiar sólo la rama de `data-tutorial`, con sus reglas puras testeadas
- [ ] **T5 (P1, humano: ~1,5 días / CC: ~1 h)** — app — `AyudaProvider` en `AppShell` + píldora dibujada por el shell + `AyudaTutorial` (disclosure sobre `usePopover`) + `TutorialModal` + catálogo + `visto` + pestaña Tutoriales + `header`/`footer` en `Drawer`
  - Surfaced by: D7; diseño DD5, DD8a-d
  - Files: `src/ayuda/AyudaProvider.tsx`, `src/ayuda/AyudaTutorial.tsx`, `src/ayuda/TutorialModal.tsx`, `src/ayuda/tutoriales.ts`, `src/ayuda/tutoriales.meta.json`, `src/ayuda/visto.ts`, `src/shell/AppShell.tsx`, `src/components/Drawer.tsx`, tests
  - Depende de: T5a, T3
  - Verify: `npm run build` + navegador contra el mock (recuadros 2, 3 y 5): clic, tablet (768), teclado, Esc en capas, foco devuelto, los cuatro estados del reproductor
- [ ] **T6 (P1, humano: ~4 h / CC: ~30 min)** — piloto — Guion de Dispensar + nitidez + migración 0155 (aditiva, va primero)
  - Surfaced by: D2, D9
  - Files: `tutoriales/guiones/dispensar.ts`, `supabase/migrations/0155_bucket_tutoriales.sql`, `supabase/README.md`, la píldora «Cómo se hace» en Dispensaciones
  - Verify: el Director aplica la 0155, sube la carpeta y mira el piloto en la app
- [ ] **T7 (P2, humano: ~2 h / CC: ~15 min)** — proceso — `tutoriales:verificar` (selector + captura) + paso en `cierre-jornada`
  - Surfaced by: D6, D10 (segunda opinión #8)
  - Files: `package.json`, `tutoriales/capturas/`, `.claude/skills/cierre-jornada/SKILL.md`
  - Verify: renombrar «Dispensar» en una rama → falla nombrando el paso; mover una columna → falla con el diff
- [ ] **T8 (P2, etapa 2)** — contenido — Guiones de los flujos elegidos por el Director + sus píldoras «Cómo se hace»

## Approved Mockups

| Pantalla / pieza | Mock | Dirección | Notas |
|---|---|---|---|
| Las cinco piezas (menú de usuario, píldora y globo, reproductor, panel de Ayuda, estados) | [`docs/mock-tutoriales.html`](mock-tutoriales.html) · capturas en `~/.gstack/projects/spiraclinicapp-Spira-App/designs/tutoriales-20261012/` (`mock-1536.png`, `mock-768.png`) | Sereno: papel, borde antes que sombra, sombra `lg` sólo en lo que flota, una píldora por pantalla | El capítulo actual va sin borde (corregido tras la segunda opinión); el panel busca en las dos pestañas con cuentas |

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | — |
| Codex Review | `/codex review` | Independent 2nd opinion | 2 | issues_found (Claude subagent; Codex no instalado) | Ingeniería: 10 hallazgos, 9 incorporados. Diseño: 8 hallazgos, todos incorporados (DD8a-d, DD9) |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | CLEAR (PLAN) | 14 issues, 0 critical gaps |
| Design Review | `/plan-design-review` | UI/UX gaps | 1 | CLEAR (FULL) | score: 4/10 → 9/10, 12 decisions |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | — |

- **CROSS-MODEL:** en diseño, la segunda opinión encontró lo que la revisión no había visto: las capas (el `backdropFilter` del `Drawer` encierra a cualquier modal hijo; `Modal` y `Drawer` comparten z-index), el `Modal` sin manejo de foco, el `h1` que dibuja el shell (la vista no puede poner la píldora al lado) y la búsqueda que daba un vacío falso. Además corrigió el realce del capítulo actual. Todo verificado en el código e incorporado.
- **VERDICT:** ENG + DESIGN CLEARED — listo para implementar la etapa 1, empezando por T0. Se implementa desde `docs/mock-tutoriales.html`.

NO UNRESOLVED DECISIONS
