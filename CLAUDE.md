# CLAUDE.md — Spira App

Guía para agentes que trabajan en este repo. Es complementaria, no un resumen:
el **panorama del proyecto** (qué es, stack, cómo correr, versionado) ya vive en
[`README.md`](README.md) y el de la base en [`supabase/README.md`](supabase/README.md).
Leelos primero. Acá va lo operativo y las reglas que evitan romper cosas.

## Qué es

Spira es una **plataforma modular de investigación clínica** de la **Fundación Scherbovsky**
(Mendoza, AR): un **Core compartido** (identidad, RBAC, auditoría, RLS, realtime — sistema
auditable ANMAT / ICH-GCP) sobre el que se montan módulos independientes.

> **Ojo con los nombres (2026-08-06).** En la UI los dos módulos operativos se llaman
> **Coordinación** y **Farmacia**; en el código, las carpetas y la base siguen siendo
> `track` y `pharma` — las claves son valores de un enum de Postgres del que dependen
> `user_module_roles`, la RLS y el `audit_log`, así que no se renombran. Este documento y el
> resto de los docs de arquitectura usan los nombres internos. Al escribir **copy de UI**,
> usá siempre Coordinación / Farmacia.

**No es solo la unificación de dos productos previos.** **Track** (coordinación clínica) y
**Pharma** (farmacia de investigación) son los primeros módulos —nacieron de fusionar dos
MVPs—, pero esa fusión fue el punto de partida, no el objetivo. La apuesta es la **base
modular para todo el flujo del centro**: el roadmap suma **Lab**, **Contable/Gerencia**,
módulo de **médicos** y, más adelante, integraciones como WhatsApp e IA, todo sobre el mismo
Core. Al escribir, pensá en términos de módulos sobre un núcleo común, no de "dos apps juntas".

## Comandos

```bash
npm install
npm run dev         # Vite → http://localhost:5173  (requiere .env, ver abajo)
npm run typecheck   # tsc --noEmit
npm run test        # vitest run
npm run build       # typecheck + tests + build de producción  ← el GATE de verificación
```

- **Hay suite de tests desde el 2026-08-13** (`vitest`), y corre dentro de `npm run build`
  (`tsc --noEmit && vitest run && vite build`). El control de calidad antes de dar algo por
  hecho es **`npm run build` verde + verificar en el navegador**. No afirmes "anda" sin eso.
- **Qué se testea:** lo que puede fallar **en silencio** — reglas puras que, si quedan al
  revés, no se ven mal en pantalla (ver el comentario de cabecera de
  `src/views/pharma/dispensaciones/estados.test.ts`, que fija el criterio). Lo que falla de
  manera visible se verifica mirando, no con un test.
- `.env` necesita `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY` (ver `.env.example`).
  El cliente (`src/lib/supabase.ts`) tira error si faltan.

## ⚠️ Reglas duras (romper esto hace daño real)

1. **El demo/prod tiene DATOS REALES.** Si tenés que crear o borrar pacientes/visitas para
   probar, usá **solo registros que vos creaste con prefijo `TEST-*`** y borrá exactamente
   esos. **Nunca** barras "todo lo de tipo X" ni borres en lote por categoría: ya pasó una
   vez que se perdió data real (se recuperó del `audit_log`). Ante la duda, no borres.
2. **No hay acceso SQL directo a producción.** Los cambios de schema se aplican **a mano**
   en el dashboard de Supabase, en orden. No asumas que podés correr SQL contra prod. El SQL
   que le pases al Director tiene que correr **tal cual** (sin placeholders `<...>`: ya se
   corrió uno literal) y prever datos legacy (constraints nuevas sobre filas viejas). Apenas
   confirme "aplicada", registralo en el índice de `supabase/README.md` (**Aplicada en prod
   (fecha)**) — CI lo vigila con `scripts/check-migraciones.mjs`.
3. **Migraciones = inmutables y numeradas.** La fuente de verdad del schema son los archivos
   `supabase/migrations/NNNN_*.sql`, aplicados en orden. **Nunca edites una migración ya
   aplicada ni renumeres**: todo cambio de base es un archivo **nuevo** con el siguiente
   número. La última aplicada va por la `0102` (ver `supabase/README.md`).
   **Si una migración es _breaking_ para el front desplegado** (p. ej. una vista que empieza a
   emitir valores que el código viejo no conoce): **se despliega el front PRIMERO y se aplica la
   migración inmediatamente después**, no al revés. Ya pasó una vez al revés (0068, 2026-08-05) y
   dejó la Agenda y la ficha del paciente en blanco en producción hasta el deploy.
   **Y volvió a pasar con la 0092 (2026-08-23), aunque el archivo lo avisaba en mayúsculas en su
   primer bloque.** Un aviso adentro del `.sql` llega tarde: para cuando se lee, ya se abrió el
   archivo para correrlo. Cuando la migración va SEGUNDA, decilo en el chat junto con el "está
   listo el SQL" — o mejor, **no pushees el archivo hasta que el front esté desplegado**.
   **Pero el orden NO se decide por "agrega o quita": se decide por si el cambio altera lo que el
   front YA pide.** Una migración puramente **aditiva** (columna o RPC nuevas que ningún front viejo
   consulta) va **al revés — migración primero**, porque el que no funciona sin ella es el front
   nuevo. Y ojo con el caso que no parece breaking y lo es: **agregar una FK a una tabla que ya está
   EMBEBIDA en algún `select`** deja el embed ambiguo (PostgREST responde `300/PGRST201` y **voltea
   la consulta entera**, no solo el embed). Pasó con la 0076 el 2026-08-13 y tiró el tablero de
   Farmacia; se arregla desambiguando por columna (`medications!medication_id`). Antes de agregar
   una FK, buscá la tabla en los `select(...)` del front.
   Cuatro trampas que ya hicieron fallar SQL en prod y conviene tener presentes al escribirlo:
   **`ALTER TYPE ... ADD VALUE` no puede usar el valor nuevo en la misma transacción** (va en un
   archivo aparte, aplicado antes — ver 0053); en PL/pgSQL los nombres de un
   **`returns table (...)` compiten con los de columna sin calificar** (calificá siempre; ver
   0056 y 0058, que fue el mismo error dos veces); y **nunca escribas dos signos peso pegados
   dentro de un comentario**: el editor SQL de Supabase rastrea el dollar-quoting **sin ignorar los
   comentarios**, así que uno suelto le invierte la paridad, deja de reconocer los cuerpos de función
   y las parte por sus `;` internos. El error que tira es desconcertante y lejanísimo del comentario
   culpable (`42P01: relation "v_status" does not exist`, por una variable de plpgsql ejecutada como
   si fuera una tabla) — ver 0071, costó una tarde el 2026-08-10. Se detecta contando: la cantidad de
   marcadores de dollar-quote en el texto **crudo** tiene que ser par.
   Y una cuarta, que vale para **todo** el SQL que le pases (migraciones y scripts de datos):
   **las sentencias de un mismo bloque NO comparten sesión en el editor de Supabase.** Una
   `create temporary table` en la primera ya no existe en la segunda (`42P01: relation "tmp_..."
   does not exist`), y **tampoco hay una transacción que abarque el bloque**: un error en el medio
   deja committeado todo lo anterior, sin rollback que lo salve. El comentario de la 0071 afirma lo
   contrario y está equivocado. Si necesitás juntar un conjunto de ids, repetilo como CTE o
   subconsulta **dentro de cada sentencia**; si necesitás atomicidad de verdad, envolvelo en una
   función `plpgsql` y llamala. Y escribí las sentencias **idempotentes y en orden de dependencias**,
   para que reintentar sea volver a correr el bloque entero (ver `supabase/_borrar_test_ip.sql`,
   2026-08-11).
4. **El preview es una sesión de navegador aparte de la del usuario.** No podés precargarle
   formularios ni ver su estado; verificá las escrituras recargando tu propia instancia.

## Operativa git (el working copy es COMPARTIDO)

El Director trabaja, commitea y mergea en paralelo sobre esta misma carpeta:

- **Verificá la rama antes de cada commit** — ya cayó un commit de sesión en `main` por un
  cambio de rama no detectado. Hay un hook (`.claude/hooks/branch-guard.mjs`) que bloquea
  `git commit` en `main`; si el Director autorizó commitear ahí (release, bitácora),
  anteponé `SPIRA_ALLOW_MAIN=1` al comando.
- **Stagear siempre POR RUTA** (`git add <archivos>`), nunca `git add -A` ni `.`: el árbol
  suele tener cambios y borrados ajenos a tu sesión.
- **`git fetch` antes de razonar sobre PRs o el estado del remoto** — el Director mergea
  PRs mientras trabajás y tus refs locales quedan viejas.
- Worktrees en `.claude/worktrees/` pueden estar stale o con trabajo sin commitear:
  inspeccionalos antes de mergear nada (uno stale casi borra 16k líneas en un merge).
- **Cierre de jornada y releases**: usá la skill **`cierre-jornada`** (bitácora + handoff +
  bump con `scripts/release.mjs` + tag). No reconstruyas el ritual a mano.

## Entorno de esta máquina (Windows) — no lo redescubras

- **No hay** Python real (el `python` del PATH es el stub del Microsoft Store), ni `gh`,
  ni `jq`, ni poppler. El fallback universal es **Node** (`node -e`).
- **PRs sin `gh`:** API REST de GitHub con `git credential fill` + script Node. No podés
  self-mergear (el clasificador lo bloquea): creás la PR y el Director mergea.
- **gstack:** `browse.exe` está bloqueado por WDAC y los preámbulos bash de sus skills no
  corren en Windows — saltealos sin culpa. Para navegar: preview tools nativas o
  playwright-core + Edge del sistema (`channel: 'msedge'`).
- PowerShell 5.1 pinta de **rojo** la salida normal de git — no es un error.

## Verificación en el preview (gotchas que ya costaron horas)

- El dev server del Director suele ocupar el **5173**; el preview usa el **5250**
  (fijado en `.claude/launch.json`). No compitas por el puerto.
- **`preview_screenshot` se cuelga (timeout 30s) casi siempre** (iframe de YouTube del
  login + el preview corre como documento oculto). No insistas: verificá por
  **snapshot/eval/estilos computados** y presentá evidencia de DOM.
- Documento oculto ⇒ **transiciones y rAF pausados**: un "congelado" no es un bug de la app.
  Corolario al medir un `:hover`: `getComputedStyle` devuelve el valor **inicial** aunque la regla
  aplique. Apagá la transición del elemento (`el.style.transition = 'none'`) y medí de nuevo, o vas
  a diagnosticar un bug que no existe.
- **El buffer de consola sobrevive a los reloads**: los errores que ves pueden ser de antes de tu
  fix. Para saber si un warning es actual, interceptá `console.error` y provocá el remontaje.
  (Se comprueba con un marcador: logueá algo, recargá, y si el marcador sigue ahí es acumulativo.)
- **React no ve `fill`/`click` sintéticos:** setter nativo + `dispatchEvent('input')` +
  `requestSubmit()`; eventos de teclado con `keyCode` y despachados en `document` (no
  `window`). `preview_resize` con preset a veces no aplica → `width`/`height` explícitos.
- Errores de consola tras editar suelen ser **stale de HMR** → reiniciá el server y
  confirmá con `npm run build` antes de ponerte a diagnosticar.
- **QA logueado:** las credenciales de prueba están en `.claude/qa-creds.local.md`
  (git-ignored). **Nunca** pidas ni aceptes credenciales por el chat.

## Arquitectura (lo mínimo para no desentonar)

Shell modular: módulos y submódulos en `src/modules/registry.ts`; cada submódulo resuelve a
una vista vía `src/views/registry.tsx` (clave `"<modulo>/<sub>"`; lo no listado cae a
`Placeholder`, así los módulos a futuro —Lab, Contable— no rompen). Sin react-router ni
react-query: la navegación es estado propio del shell.

| Carpeta | Qué |
|---|---|
| `src/shell/` | Top bar, navegación, login (`AppShell.tsx`, `Login.tsx`) |
| `src/views/` | Una vista por submódulo; `views/track/` los componentes del recorrido de visitas |
| `src/data/` | Capa de datos: hooks de lectura + funciones de mutación contra Supabase |
| `src/lib/` | `supabase.ts` (cliente), `auth.tsx`, `useSupabaseQuery.ts`, `theme.ts`, `dates.ts` |
| `src/components/` | UI reusable (Modal, Icon, FormField, …) |
| `supabase/migrations/` | Schema (numeradas, fuente de verdad) |

## Convenciones de código (seguilas al escribir)

- **Capa de datos** (`src/data/*.ts`): las **lecturas** son hooks `useXxx()` que envuelven
  `useSupabaseQuery(queryFn, deps)`; las **mutaciones** son funciones `async` que llaman a
  un **RPC** (`supabase.rpc(...)`, para altas/borrados atómicos con authz server-side) o a un
  `.from(...).update(...)` directo. Mirá `src/data/patients.ts` como patrón de referencia.
- **Tipos a mano**, no generados: se declaran `interface`s por fila/input en cada archivo de
  `data/`, con comentarios que citan la migración que introdujo cada columna.
- **Errores → mensajes serenos en castellano.** Traducí los códigos de Postgres
  (`23505` duplicado, `23502` faltante, `42501` permiso/RLS) a un texto claro y calmo para
  el usuario; ver los helpers `*ErrorMessage` en `data/`.
- **RLS filtra en silencio:** tras un `update`/`delete` directo, **0 filas afectadas = sin
  permiso**, no éxito. Manejalo (ver `updatePatient`).
- **Estilo:** CSS con variables en `src/styles/tokens.css` (sin Tailwind ni CSS-in-JS),
  íconos **Lucide** vía `components/Icon.tsx`, TypeScript **strict**.
- **El realce de estado es ELEVACIÓN, nunca un borde de color.** Hover, foco y "activo" se
  señalan con el levante de ~1px + sombra (`--spira-shadow-sm/md`). **Nada de bordes verdes
  con el acento** — decisión del Director (2026-08-06), es lo mismo que ya regía para el foco
  de los inputs (§"foco suave", nunca el outline verde). El color se reserva para *significado*
  (estado clínico, alerta, error), no para decir "el mouse está acá".
- **El realce va en CSS, no en `onMouseEnter`.** Escribir `borderColor`/`boxShadow` a mano
  desde un handler sobre un `border` ABREVIADO deja el borde roto: React resuelve el conflicto
  en el render siguiente **vaciando todos los longhand** y el elemento se queda sin borde
  (consola: "Removing borderColor border"). Y si el borde va inline, le gana por especificidad
  a la hoja de estilos y el hover no puede tocarlo. Usá una clase (ver `.spira-card-link` y
  `.spira-row-link`) y, cuando el borde sí va inline, declaralo en **longhands**
  (`borderWidth`/`borderStyle`/`borderColor`), nunca mezclado con la abreviada.
- **Idioma:** comentarios, nombres de dominio y copy de UI en **castellano rioplatense**.
  El código existente tiene comentarios densos y explicativos (el porqué, no el qué) —
  igualá esa densidad y tono.
- **Identidad del paciente: nombre visible.** Desde el **2026-08-04** (decisión del Director) el
  **nombre completo se muestra en toda la app** — Track y Pharma, listas y detalles. Antes se
  ocultaba tras iniciales (`PrivacyAvatar`, ya **eliminado**) y el IVRS era el único identificador.
  El criterio ahora es **nombre en tinta como identidad primaria + IVRS en mono como secundario**;
  seguilo en vistas nuevas que muestren personas. (El `audit_log` y la RLS no cambian: esto es
  presentación, el control de acceso sigue siendo el de siempre.)

## Contexto de diseño

El sistema visual **"Sereno"** (petróleo + papel cálido, calma clínica) está documentado para
que cualquier agente diseñe on-brand. Leelo antes de tocar UI:

- **[`PRODUCT.md`](PRODUCT.md)** — el *qué/quién/por qué*: usuarios, propósito, personalidad de
  marca, anti-referencias, principios y accesibilidad (WCAG 2.1 AA).
- **[`DESIGN.md`](DESIGN.md)** — el *cómo se ve*: tokens, color, tipografía, elevación,
  componentes y "Do's and Don'ts" (formato spec; `.impeccable/design.json` lo extiende).
- Marca de origen y tokens vivos: `docs/identidad-visual/` + `src/styles/tokens.css`.
- **Mocks y handoffs de diseño: al repo ANTES de implementar** (`docs/` o la carpeta de la
  feature). Nunca implementes "desde snippets" si existe un mock — desviarse del mock ya
  costó una reescritura completa. Si el mock vive fuera del repo (Downloads), copialo primero.

Generados con la skill **impeccable** (`/impeccable document` regenera `DESIGN.md`;
`/impeccable critique|audit|polish <archivo>` revisan una vista).

## Seguridad

RLS en todas las tablas + `audit_log` transversal (inmutable, recuperable) + operaciones
privilegiadas (alta/borrado de paciente, generación de visitas/stock) vía funciones
`SECURITY DEFINER`. El schema pasó dos rondas de revisión adversarial → ver
`supabase/schema-review.md`. Track se aísla por protocolo; **Pharma es central** (ve todos).

## Para orientarte

- Estado y narrativa por jornada: `docs/bitacora/` (incluye handoffs).
- Roadmap y los 3 pasos del proyecto: `docs/#4- ROADMAP.md`.
- Índice de migraciones y decisiones de diseño de la base: `supabase/README.md`.
