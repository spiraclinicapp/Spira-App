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
- **El centro de Ayuda es un `Drawer`** que se abre desde `AboutMenu` («Ayuda y tutoriales») y arranca
  filtrado por el módulo donde estás parado. No es un módulo del registry: los módulos son áreas de
  trabajo con roles, y la ayuda se abre encima de lo que estás haciendo. (Para `/plan-design-review`.)
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
  ├── VITE_SUPABASE_URL=https://<DEMO_REF>.supabase.co
  ├── VITE_SUPABASE_PUBLISHABLE_KEY=…
  ├── DEMO_SECRET_KEY=…        (clave secreta del DEMO: crear usuarios, generar sesiones)
  ├── DEMO_DB_URL=postgres://… (sólo el demo)
  └── TTS_KEY=…

  scripts/demo/
  ├── config.mjs    ← lee el archivo de arriba; si falta, «Falta %USERPROFILE%\.spira\demo.env (ver docs/plan-tutoriales.md)»
  ├── guardia.mjs   ← tres cerrojos (abajo), antes de cualquier escritura
  ├── resetear.mjs  ← base limpia + supabase/migrations/* en orden + bucket ip-docs + centinela + semilla
  └── semilla.mjs   ← semilla NARRATIVA (abajo)
```

**Guardia: tres cerrojos, porque escribir pacientes ficticios en prod es el peor escenario del plan.**

1. **Lista blanca, no lista negra.** El ref del proyecto tiene que ser `DEMO_REF`, mirando el host **y el
   usuario** de `DEMO_DB_URL`. En el pooler de Supabase el host es compartido entre proyectos
   (`aws-0-<región>.pooler.supabase.com`) y el ref viaja en el usuario (`postgres.<ref>`): una URL copiada
   de prod pasaría un chequeo solo por host. Exige además `SPIRA_DEMO=1`.
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
  AboutMenu ──«Ayuda y tutoriales»──► AyudaDrawer (lazy)
                                       ├── Preguntas: buscador sin tildes + acordeón ──«Ver tutorial»──┐
                                       └── Tutoriales: lista por módulo · duración · ✓ visto ──────────┤
                                                                                                        ▼
  <AyudaTutorial id="dispensar" />  ──clic──► globo (foco adentro, Esc / clic afuera)          TutorialModal (lazy)
     botón «▶» junto a la acción clave         ├── explicación (descripción del catálogo)     ├── <video preload="none" poster
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

## Etapas

### Etapa 1 — Recortada (D8)

0. **T0 — Prueba de herramientas (30 min), antes de todo:** `ffmpeg-static -version` bajo WDAC · 5 s con
   Edge + `recordVideo` a 1536×864 · `Page.startScreencast` por CDP · un `<track>` servido desde Storage
   de otro origen (CORS). Lo que falle ahí decide el plan B **antes** de construir.
1. **Ambiente demo:** config, guardia de tres cerrojos, resetear, semilla narrativa, sesión. El Director
   crea el proyecto (5 min) y completa `demo.env`.
2. **Preguntas frecuentes en texto:** `AyudaDrawer` con la pestaña Preguntas y la entrada en `AboutMenu`.
   Las primeras preguntas salen de lo que ya llegó por feedback con lugar.
3. **Fábrica con una sola voz:** guion, cursor, TTS (un adaptador), línea de tiempo, VTT, mezcla y
   capturas.
4. **Piloto:** propuesto **Farmacia › Dispensar una medicación** (corto, frecuente, con escritura, popover
   y modal; a confirmar por el Director). Prueba de nitidez a 1536×864 (la notebook de referencia).
5. **Bucket `tutoriales`** (migración **0155**, aditiva) + `AyudaTutorial` + `TutorialModal` + pestaña
   Tutoriales + el botón en Dispensaciones.
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
| Menú con Novedades y Feedback | `src/shell/AboutMenu.tsx` | Entrada «Ayuda y tutoriales» |
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
[+] scripts/demo/guardia.mjs                             [+] Ver un tutorial desde el botón ▶
  ├── refPermitido(dbUrl, viteUrl, demoRef)                ├── [navegador] clic abre el globo con foco adentro
  │   ├── [CRÍTICO] URL directa de prod → aborta           ├── [navegador] tablet (768): el toque en «Ver tutorial» llega
  │   ├── [CRÍTICO] pooler, host compartido, usuario       ├── [navegador] teclado: Tab llega al botón del globo
  │   │            postgres.<ref-prod> → aborta            ├── [navegador] Esc: primero el modal, después el globo
  │   ├── VITE url ≠ DEMO_REF → aborta                     ├── [navegador] clic afuera cierra; el foco vuelve al ▶
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

- **Nitidez (confianza media).** El bitrate de `recordVideo` es bajo y fijo. Plan B: `Page.startScreencast`
  por CDP con calidad alta, más `ffmpeg-static`. Se decide en T0.
- **WDAC.** Si bloquea `ffmpeg-static` y el `ffmpeg` de Playwright, la mezcla va sin binarios propios:
  se graba por CDP, se codifica con `MediaRecorder`/WebCodecs dentro del mismo Edge y el audio se mezcla
  con la Web Audio API. Más trabajo, pero sin ejecutables nuevos. Se decide en T0.
- **Límite de proyectos gratuitos de Supabase** (2 activos por organización). Si ya están los dos, el
  demo va en otra organización gratuita.
- **Mantenimiento de la semilla:** es código que acompaña a cada migración. Presupuestado en T2 y
  vigilado por `verificar`.
- **`Modal.tsx` no atrapa el foco** (TODO existente: «Core · focus trap en `components/Modal.tsx`»).
  `TutorialModal` lo hereda: con Tab se puede salir del modal a la página de atrás. No bloquea la v1,
  pero si ese TODO se toma, este modal entra en su prueba.

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

- [ ] **T0 (P1, humano: ~2 h / CC: ~30 min)** — herramientas — Prueba en WDAC: ffmpeg-static, Edge+recordVideo 1536×864, screencast CDP, CORS de `<track>` desde Storage
  - Surfaced by: segunda opinión #5 (D8)
  - Files: `scratchpad` (descartable)
  - Verify: los cuatro chequeos con resultado anotado en este plan
- [ ] **T1 (P1, humano: ~4 h / CC: ~30 min)** — demo — Config fuera del repo + guardia de tres cerrojos + tests
  - Surfaced by: D3, D10 (segunda opinión #2, #6)
  - Files: `scripts/demo/config.mjs`, `scripts/demo/guardia.mjs`, `scripts/demo/*.test.ts`
  - Verify: `npm run test`; con una URL de pooler de prod en `demo.env`, aborta antes de escribir
- [ ] **T2 (P1, humano: ~3 días / CC: ~1 día)** — demo — Resetear + semilla narrativa con RPC reales + sesión por `generateLink`
  - Surfaced by: D10 (segunda opinión #3, #4, #7)
  - Files: `scripts/demo/resetear.mjs`, `scripts/demo/semilla.mjs`, `package.json`
  - Verify: `npm run demo:resetear`; `npm run dev -- --mode demo` muestra solo datos ficticios creíbles
- [ ] **T3 (P1, humano: ~1 día / CC: ~1 h)** — app — `AyudaDrawer` con Preguntas + `preguntas.ts` (+test) + entrada en `AboutMenu`
  - Surfaced by: D8 (preguntas en texto antes que los videos)
  - Files: `src/ayuda/AyudaDrawer.tsx`, `src/ayuda/preguntas.ts`, `src/ayuda/preguntas.test.ts`, `src/shell/AboutMenu.tsx`
  - Verify: `npm run build` verde + navegador
- [ ] **T4 (P1, humano: ~2 días / CC: ~2 h)** — fábrica — guion, spec único, cursor, TTS (1 adaptador), línea de tiempo, VTT, mezcla, capturas, `tsconfig` propio
  - Surfaced by: D1, D8
  - Files: `tutoriales/playwright.config.ts`, `tutoriales/grabar.spec.ts`, `tutoriales/lib/*`, `tutoriales/tsconfig.json`, `package.json`
  - Verify: `npm run test`; `npm run tutoriales:grabar -- dispensar` deja `tutoriales/salida/dispensar/<versión>/`
- [ ] **T5 (P1, humano: ~1 día / CC: ~40 min)** — app — `AyudaTutorial` (disclosure sobre `usePopover`) + `TutorialModal` + catálogo + `visto` + pestaña Tutoriales
  - Surfaced by: D7
  - Files: `src/ayuda/AyudaTutorial.tsx`, `src/ayuda/TutorialModal.tsx`, `src/ayuda/tutoriales.ts`, `src/ayuda/tutoriales.meta.json`, `src/ayuda/visto.ts`, tests
  - Verify: `npm run build` + navegador: clic, tablet (768), teclado, Esc en capas, foco devuelto
- [ ] **T6 (P1, humano: ~4 h / CC: ~30 min)** — piloto — Guion de Dispensar + nitidez + migración 0155 (aditiva, va primero)
  - Surfaced by: D2, D9
  - Files: `tutoriales/guiones/dispensar.ts`, `supabase/migrations/0155_bucket_tutoriales.sql`, `supabase/README.md`, el botón ▶ en Dispensaciones
  - Verify: el Director aplica la 0155, sube la carpeta y mira el piloto en la app
- [ ] **T7 (P2, humano: ~2 h / CC: ~15 min)** — proceso — `tutoriales:verificar` (selector + captura) + paso en `cierre-jornada`
  - Surfaced by: D6, D10 (segunda opinión #8)
  - Files: `package.json`, `tutoriales/capturas/`, `.claude/skills/cierre-jornada/SKILL.md`
  - Verify: renombrar «Dispensar» en una rama → falla nombrando el paso; mover una columna → falla con el diff
- [ ] **T8 (P2, etapa 2)** — contenido — Guiones de los flujos elegidos por el Director + sus botones ▶

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | — |
| Codex Review | `/codex review` | Independent 2nd opinion | 1 | issues_found (Claude subagent; Codex no instalado) | 10 hallazgos; 9 incorporados vía D7–D10, 1 (piloto manual con Clipchamp) descartado en D8 |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | CLEAR (PLAN) | 14 issues, 0 critical gaps |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | — |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | — |

- **CROSS-MODEL:** la segunda opinión dio vuelta tres decisiones de la revisión: D5 (el ⓘ tampoco admite un botón → D7, globo con foco), D4 (git → D9, Storage versionado) y la secuencia de la etapa 1 (→ D8, recortada con T0 primero). Además desmintió que la semilla de `banco-rls` sirviera para filmar (confirmado en `sembrar.mjs`).
- **VERDICT:** ENG CLEARED — listo para implementar la etapa 1, empezando por T0. Recomendado antes de T5: `/plan-design-review` (globo, modal y Drawer de Ayuda).

NO UNRESOLVED DECISIONS
