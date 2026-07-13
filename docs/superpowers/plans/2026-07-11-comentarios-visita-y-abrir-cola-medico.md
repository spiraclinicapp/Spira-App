# Comentarios de visita + "Abrir" en la cola del médico — Plan de implementación

> **Para quien ejecute:** plan tarea por tarea (checkbox `- [ ]`). Nace del review de ingeniería
> del 2026-07-11 sobre los handoffs `handoff_visitas/` y `handoff_para_ver_medico/`, acotado a la
> corrección pedida por el Director. Fuentes de diseño (look & feel): esos dos handoffs.

**Goal:** en "Para ver médico" (cola del médico), que **"Abrir" abra la MISMA ficha** que ya abre
la app en Visitas y en el cronograma del paciente (el `VisitDetail`), y que el **botón de comentario
abra un Drawer deslizable** con el hilo de comentarios de la visita. El hilo de comentarios se
construye **una sola vez** y se enchufa además en el panel "Comentarios" del `VisitDetail` (hoy "en
construcción").

**Alcance (Focalizado):** solo la corrección Abrir/comentario. **NO** entra el rediseño completo de
"Para ver médico" (reloj de espera, stats, filtro dropdown), ni los comentarios inline en Visitas,
ni el concepto "resolución" del médico. Ver "NO en alcance".

## Decisiones tomadas (review 2026-07-11)

- **D1 — `context="patient"` (solo lectura)** para el "Abrir" del médico. Abre la misma ficha que el
  cronograma de pacientes: demográficos, ruta, motivo, checklist y comentarios, de lectura. Sin
  cablear avance de etapas en la cola (no es tarea del médico). El médico marca "Atendido" desde la
  fila, como hoy.
- **D2 — Hilo de comentarios plano.** `visit_comments` = (autor, rol, texto, fecha). Mismo hilo en el
  Drawer y en el panel del `VisitDetail`. Se **difiere** el concepto "resolución" (nota-al-atender)
  hasta que arranque el módulo Médicos.
- **RLS/escritura:** RPC `add_visit_comment` `SECURITY DEFINER` con authz **calcada de
  `mark_wants_doctor` (0047)**. `author_id` lo estampa el server. Lectura via `v_visit_comments`
  (security_invoker) con RLS **espejo de la visibilidad de `patient_visits`** (gerencia o coordinador
  asignado).
- **`author_role`:** sale de `public.users.puesto` (título cosmético, editable en "Mi cuenta"), no del
  rol RBAC.
- **`comments_count`:** columna aditiva en `v_track_visits` (subquery `count`), sin N+1.
- **Drawer:** componente nuevo, desliza desde la derecha, espeja el patrón de `Modal`.

## Constraints duras del repo

- **Sin suite de tests.** Verificación = `npm run typecheck` verde + prueba en navegador logueado.
- **Migración inmutable y numerada:** la última aplicada es la **0047** → esta es la **0048**, archivo
  nuevo. **Se aplica A MANO en el dashboard de Supabase**, en orden.
- **⚠️ Orden de deploy (crítico):** el push a `main` **auto-deploya** el front en Vercel, pero la 0048
  se aplica a mano. **Aplicar la 0048 en el dashboard PRIMERO, verificar, y recién después pushear el
  front.** Si no, `v_visit_comments`/`add_visit_comment`/`comments_count` no existen en prod y los
  comentarios fallan.
- **Estilo:** CSS con variables `--spira-*` (sin Tailwind), íconos Lucide vía `components/Icon`,
  TypeScript strict. Copy en castellano rioplatense.
- **Errores → mensajes serenos** traducidos (helpers `*ErrorMessage`/`rpcError`).

---

## Diagrama — flujo de datos

```
LISTA · Para ver médico (DoctorQueueView)          FICHA / HILO
  fila:
   [💬 N] ───────────────► Drawer (desliza →) ──► CommentThread(visitId)
   [Abrir] ──────────────► VisitDetail(visitId, context="patient")   [Modal 940, solo lectura]
   [Atendido por médico] ─► markDoctorSeen  (como hoy, en la fila)

  CommentThread(visitId)
     ├─ leer  ─► useVisitComments(visitId) ─► v_visit_comments  (SELECT, RLS espejo de la visita)
     └─ enviar ─► addVisitComment(visitId, body) ─► RPC add_visit_comment (SECURITY DEFINER, authz)

  VisitDetail · panel "Comentarios" ──► <CommentThread visitId={visit.id}/>   (mismo hilo, mismo dato)

  badge 💬 N  ◄── comments_count  ◄── v_track_visits (subquery count, sin N+1)
```

---

### Task 1: Migración 0048 — comentarios de visita (base)

**Files:** `supabase/migrations/0048_visit_comments.sql` (nuevo). **Aplicar a mano en el dashboard
ANTES de pushear el front.**

- [x] **Step 1: Migración escrita y verificada** → [`supabase/migrations/0048_visit_comments.sql`](../../../supabase/migrations/0048_visit_comments.sql).
  **Ese archivo es la fuente de verdad** (el SQL se validó con una revisión adversarial 2026-07-11 que
  corrigió 5 problemas del draft original). Correcciones aplicadas:
  - **Autor DESNORMALIZADO** (`author_name`/`author_role` en la fila, snapshoteados por el RPC). La RLS de
    `public.users` sólo expone la fila propia (0006:82) → una vista `security_invoker` que joinee `users`
    **ocultaría los comentarios de otros** para quien no es gerencia (INNER JOIN sin fila visible → fila
    descartada). Desnormalizar lo evita y es auditablemente correcto (queda quién comentó y su puesto *entonces*).
  - **`uuid_generate_v4()`** (no `gen_random_uuid()`) — convención uniforme del repo (0 excepciones).
  - **`grant select on public.visit_comments to authenticated`** + revokes — la vista `security_invoker`
    consulta la tabla como el lector; sin el grant, PostgREST devuelve *permission denied*.
  - **Authz de escritura alineada a la de lectura** (gerencia o coordinador asignado operator+). Se quitó el
    branch global `track-admin` para no crear "comentarios fantasma" (escritos por quien no puede leerlos).
  - **Idempotencia:** `drop policy if exists` + `create or replace view` (la migración se aplica a mano y
    puede re-correrse).

- [ ] **Step 2: Aplicar en el dashboard** (SQL Editor) y verificar: insertar un comentario de prueba
  con el RPC sobre una visita `TEST-*` propia, leer `v_visit_comments` (debe mostrar autor + puesto), y
  `select comments_count from v_track_visits where id = ...` devuelve 1. Borrar el comentario de prueba.
  Confirmar que un SEGUNDO usuario (coordinador del mismo protocolo) también ve ese comentario (regresión
  del bug de RLS).

---

### Task 2: Capa de datos — `src/data/visitComments.ts` (nuevo)

Patrón de referencia: `src/data/dayVisits.ts` (lectura = hook sobre `useSupabaseQuery`; mutación =
`async` que llama al RPC + `rpcError`).

**Files:**
- Create: `src/data/visitComments.ts`
- Modify: `src/data/dayVisits.ts` (sumar `comments_count` a `DayVisitRow`)

- [ ] **Step 1: `visitComments.ts`**

```ts
import { useSupabaseQuery } from '../lib/useSupabaseQuery'
import type { QueryResult } from '../lib/useSupabaseQuery'
import { supabase } from '../lib/supabase'

/** Comentario de una visita, con autor y puesto resueltos en la vista v_visit_comments (0048). */
export interface VisitComment {
  id: string
  visit_id: string
  author_name: string
  author_role: string   // puesto (título cosmético); "Equipo" si vacío
  body: string
  created_at: string
}

/** Hilo de comentarios de una visita (asc por fecha). visitId null = no consulta. */
export function useVisitComments(visitId: string | null): QueryResult<VisitComment[]> {
  return useSupabaseQuery<VisitComment[]>(
    async (c) => {
      if (!visitId) return { data: [], error: null }
      return await c.from('v_visit_comments').select('*')
        .eq('visit_id', visitId).order('created_at', { ascending: true })
        .returns<VisitComment[]>()
    },
    [visitId],
  )
}

function rpcError(code?: string, raw?: string): string {
  if (code === '42501') return 'No tenés permiso para comentar esta visita.'
  if (code === '23514') return 'El comentario está vacío.'
  return raw || 'No se pudo agregar el comentario. Probá de nuevo.'
}

/** Agrega un comentario (author_id = auth.uid() en el server). RPC add_visit_comment (0048). */
export async function addVisitComment(visitId: string, body: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('add_visit_comment', { p_visit_id: visitId, p_body: body })
  if (error) return { error: rpcError(error.code, error.message) }
  return { error: null }
}
```

- [ ] **Step 2: `dayVisits.ts` — sumar el count a `DayVisitRow`**

```ts
export interface DayVisitRow extends TrackVisitRow {
  // …existentes…
  /** Cantidad de comentarios de la visita (subquery en v_track_visits; migración 0048). */
  comments_count: number
}
```
> En runtime, antes de aplicar la 0048 la columna no existe → leer siempre como `visit.comments_count ?? 0`.

---

### Task 3: Componente `src/components/Drawer.tsx` (nuevo)

Overlay deslizable desde la derecha. Espeja `Modal` (backdrop + Escape + aria + click-afuera), pero
el panel se pega a la derecha, alto 100%, ancho `min(460px, 96vw)`. **Calibrado a Sereno** (ver §Diseño).

**Files:**
- Create: `src/components/Drawer.tsx`
- Modify: `src/styles/tokens.css` (keyframe `spira-drawer-in`)

- [ ] **Step 1:** keyframe en `tokens.css`, dentro de `@media (prefers-reduced-motion: no-preference)`:
```css
@keyframes spira-drawer-in { from { transform: translateX(100%); } to { transform: translateX(0); } }
```
- [ ] **Step 2:** `Drawer.tsx` con la misma API que `Modal` (`title`, `onClose`, `children`, `maxWidth?`).
  - Backdrop `rgba(20,48,46,.32)` + `blur(2px)` (idéntico a `Modal`).
  - Panel `position:fixed; top:0; right:0; height:100%; width:min(460px,96vw)`; radio **`16px 0 0 16px`**
    (lg de Sereno, no 20); sombra de overlay **md** cálida `0 12px 32px rgba(20,48,46,.10)` (NO negro/scrim);
    `animation: spira-drawer-in .15s ease-out` (doctrina Sereno: **corto .12–.18s y se asienta**, sin
    `cubic-bezier` con overshoot).
  - Header fijo (título Schibsted ~20px + ✕ 32×32), cuerpo con scroll.
  - **A11y (WCAG 2.1 AA):** al abrir, **foco al primer control** (o al panel con `tabIndex=-1`); **atrapar
    el foco** dentro (Tab/Shift+Tab ciclan); al cerrar, **devolver el foco** al disparador. Escape cierra;
    click en backdrop cierra; `role="dialog" aria-modal="true" aria-label={title}`.
> El foco atrapado/inicial/retorno es net-new (el `Modal` actual no lo hace — ver §NO en alcance). Encapsularlo
> en el `Drawer` deja el patrón listo para retrofitear al `Modal` después.

---

### Task 4: Componente `src/views/track/CommentThread.tsx` (nuevo)

Hilo + composer, reusable por `visitId`. Patrón visual de las *Aclaraciones* del handoff (avatar por
puesto + nombre + chip de rol + hora + burbuja). **Maneja `q.error` y vacío con estados serenos**
(no crashea si la 0048 aún no está aplicada).

**Files:**
- Create: `src/views/track/CommentThread.tsx`
- Modify: `src/lib/dates.ts` (agregar `fromNow`)

- [ ] **Step 1:** `fromNow(iso)` en `lib/dates` → "hace 41m / hace 1h 36m" (fallback `HH:mm`).
- [ ] **Step 2:** `CommentThread({ visitId }: { visitId: string })` — **todos los estados** (ver tabla §Diseño):
  - **Loading:** mientras `q.loading && !q.data` → línea sobria "Cargando comentarios…" (espeja "Cargando visita…"
    del `VisitDetail`).
  - **Error:** `q.error` → recuadro sereno "No pudimos cargar los comentarios." + botón "Reintentar" (`q.refetch`).
  - **Vacío (con calidez):** ícono Lucide `message` (tenue) + "Todavía no hay comentarios." + "Escribí el primero
    para el equipo." — orienta al composer, que queda justo debajo (los estados vacíos son features).
  - **Cada comentario:** avatar de iniciales tintado con **el acento del módulo** (único, no por-puesto) + nombre
    (Inter 13/700) + **chip de puesto sobrio** (badge-pill: fondo `--spira-surface`, texto `--spira-muted`, radio
    pill — el puesto se lee por el TEXTO, no por color) + `fromNow` + burbuja (`--spira-surface` + borde
    `--spira-line`, Inter 13.5 line-height 1.5).
  - **Composer (textarea):** `textarea` de **2 renglones que crece**, alto mín 44 (touch), radio 10, borde
    `--spira-line-2`, fondo blanco; **Enter envía, Shift+Enter hace salto de línea**; botón "Enviar" explícito
    (deshabilitado si vacío/solo-espacios **o** enviando → evita doble-submit). Al enviar: `addVisitComment` →
    limpiar → `q.refetch()`. **En vuelo:** botón "Enviando…" con `opacity .6`.

---

### Task 5: `DoctorQueueView.tsx` — botón comentario + "Abrir"

**Files:** Modify `src/views/DoctorQueueView.tsx`

- [ ] **Step 1:** estado `openVisitId: string | null` y `commentsVisit: DayVisitRow | null`.
- [ ] **Step 2:** en las acciones de la fila, orden **comentario · Abrir · Atendido**:
  - Botón comentario: `btnOutline` + **ícono Lucide `message`** (NO emoji) + contador `{v.comments_count ?? 0}`
    *sobre* el botón (no flotando); alto 40 en desktop, **≥44 en touch**. → `setCommentsVisit(v)`.
  - `[Abrir]` (estilo outline idéntico al de Visitas) → `setOpenVisitId(v.id)`.
  - `[Atendido por médico] / [Deshacer]` como está hoy.
- [ ] **Step 2b (responsive):** el grupo de acciones ahora tiene 3 botones. En anchos chicos, el cluster
  **envuelve** (`flex-wrap`) o el botón comentario cae a **solo-ícono** (sin número, el número al abrir), para
  que la fila no desborde en 375px. Verificar en el viewport móvil.
- [ ] **Step 3:** al final del componente:
```tsx
{openVisitId && (
  <VisitDetail visitId={openVisitId} accent={accent} context="patient"
    onClose={() => setOpenVisitId(null)} />
)}
{commentsVisit && (
  <Drawer title={`Comentarios · ${commentsVisit.patient_code ?? 'Visita'}`} onClose={() => setCommentsVisit(null)}>
    <CommentThread visitId={commentsVisit.id} />
  </Drawer>
)}
```
> `VisitDetail` en `context="patient"` no pide `onAdvance`/permisos → cableado mínimo.

- [ ] **Step 4: Verificar tipos** — `npm run typecheck` (exit 0).

---

### Task 6: `VisitDetail.tsx` — enchufar el hilo en "Comentarios"

**Files:** Modify `src/views/track/VisitDetail.tsx`

- [ ] Reemplazar el `<UnderConstruction .../>` del panel "Comentarios" (líneas ~146-148) por
  `<CommentThread visitId={visit.id} />`. El panel "Dispensación" sigue en construcción (fuera de
  alcance).
> **Aclaración (journey):** "solo lectura" en `context="patient"` aplica a las **etapas operativas** y a
> "marcar para ver médico" — NO a comentar. El composer del panel "Comentarios" **queda escribible** en ambos
> contextos (comentar es dejar una nota, permitida al médico/coord). Así el médico lee la ficha y comenta ahí
> mismo, sin cerrar y reabrir un Drawer.

---

## Diseño (Sereno) — estados, motion y a11y

Clasificación: **APP UI** (herramienta clínica densa). Calibrado contra `DESIGN.md` en el review de diseño 2026-07-11.

**Tabla de estados de interacción:**

| Feature | Loading | Vacío | Error | Éxito | En vuelo |
|---|---|---|---|---|---|
| Hilo de comentarios (`CommentThread`) | "Cargando comentarios…" | ícono `message` + "Todavía no hay comentarios. Escribí el primero." | "No pudimos cargar los comentarios." + Reintentar | comentario aparece al tope del composer, hilo se refresca | botón "Enviando…" `opacity .6`, textarea bloqueada |
| Drawer (abrir/cerrar) | — | (el hilo maneja su vacío) | — | desliza `.15s`, foco adentro | — |
| Badge de la fila | `comments_count ?? 0` | sin número (solo ícono) | `?? 0` (no crashea) | count sube tras refetch | — |

**Calibraciones Sereno aplicadas** (vs. lo que traían los handoffs):
- **Motion:** Drawer `.15s ease-out` que se asienta (regla: corto .12–.18s, sin bounce/overshoot). NO `.28s cubic-bezier`.
- **Sombra:** overlay **md** cálida `0 12px 32px rgba(20,48,46,.10)`. NO `scrim`/negro.
- **Radio:** Drawer `16px 0 0 16px` (lg). NO 20.
- **Íconos:** botón comentario con Lucide `message`. **Sin emoji** (regla dura).
- **Color con intención:** chip de puesto **sobrio único** (surface/muted); el avatar del autor va en el acento del
  módulo (único), no un color por-puesto. El color no decora.
- **Tipografía/controles:** textarea del composer = `input` de Sereno (44 alto, radio 10, borde line-2); burbuja y
  nombre en Inter; chip en badge-pill.

**A11y (WCAG 2.1 AA):** Drawer con foco atrapado + inicial + retorno (net-new; el `Modal` no lo hace todavía);
touch targets ≥44px; contraste de texto sobre `surface` OK con `ink`/`muted`.

**Responsive:** Drawer `min(460px,96vw)` (≈full-width en móvil). La fila del médico (3 botones) envuelve o el botón
comentario cae a solo-ícono en 375px.

## Verificación final (navegador, logueado — pablo@spira.test)

- [ ] `npm run typecheck` en verde.
- [ ] En "Para ver médico": el botón 💬 abre el Drawer que **desliza desde la derecha**; se cierra por
  Escape, click-afuera y la X. Enviar un comentario → aparece con nombre + puesto + hora.
- [ ] El botón "Abrir" abre el `VisitDetail` (modal 940) de **solo lectura**: se ve ruta, motivo,
  checklist y el **mismo hilo** de comentarios en el panel "Comentarios".
- [ ] El badge 💬 muestra el número correcto de comentarios.
- [ ] Marcar "Atendido por médico" sigue funcionando desde la fila.
- [ ] Degradación: si se corre el front sin la 0048, el Drawer/panel muestran un estado sereno (no
  pantalla rota) — confirma que el orden migración→deploy es el correcto.

## NO en alcance (diferido, con razón)

- Rediseño completo de "Para ver médico" (WaitBadge, reloj vivo 15s, stats, filtro dropdown) — no se
  relaciona con la corrección Abrir/comentario.
- Comentarios inline en filas de **Visitas del día** (handoff_visitas §3) — backend queda compartido
  para sumarlo después.
- Concepto "resolución"/aclaración-al-atender + `markWantsDoctor` de 3 args (D2).
- Navegación por días en `DayVisitsView` (handoff_visitas §2) — sobrante del otro handoff.
- Panel de Dispensación del `VisitDetail` (sigue "en construcción").
- Acción "marcar atendido" desde dentro del `VisitDetail` (queda en la fila, por D1).

**Deuda de diseño diferida (del review de diseño, no bloquea):**
- **Retrofit de foco atrapado/inicial/retorno al `Modal`.** El `Modal` actual no lo hace; el patrón nace en el
  `Drawer` de esta tanda y conviene portarlo después a `Modal` (mejora a11y de TODOS los modales). Tarea aparte.
- **`border-left: 3px solid accent` de la fila "el que le toca"** en `DoctorQueueView` ([:178](src/views/DoctorQueueView.tsx:178)):
  es preexistente y choca con el Don't de `DESIGN.md` (franja de acento) + slop #8. No es de este diff; reemplazar
  por otra señal (fondo tenue + ícono, que ya tiene) en una limpieza aparte.

## Lo que YA existe (reusado, no reconstruido)

- `VisitDetail` (modal 940 compartido) — reusado tal cual para "Abrir". Cero código nuevo de detalle.
- `Modal` — el `Drawer` espeja su patrón.
- `markWantsDoctor`/`toggleWantsDoctor`/`markDoctorSeen`, `DoctorBadge`, `PrivacyAvatar`, `Icon`,
  `SearchableSelect` — reusados.
- Helpers SQL `has_module`/`has_min_role`/`is_assigned_coordinator` + predicado de RLS de
  `patient_visits` — reusados en la 0048.

## Paralelización (worktrees)

| Lane | Toca | Depende de |
|---|---|---|
| A · base+datos (T1, T2) | `supabase/migrations`, `src/data` | — |
| B · Drawer (T3) | `src/components`, `src/styles` | — |
| C · CommentThread (T4) | `src/views/track`, `src/lib/dates` | A |
| D · wiring (T5, T6) | `src/views` | A, B, C |

Orden: **A ‖ B** → **C** → **D**. D toca `DoctorQueueView` y `VisitDetail` (mismo `views/track`):
hacerlo secuencial.

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Alcance y estrategia | 0 | — | — |
| Codex Review | `/codex review` | 2da opinión independiente | 0 | — | — |
| Eng Review | `/plan-eng-review` | Arquitectura y tests (requerido) | 1 | clean | 2 decisiones (D1 `patient`, D2 hilo plano) + 4 recomendaciones, 0 gaps críticos |
| Design Review | `/plan-design-review` | Huecos de UI/UX | 1 | clean | score 6/10 → 9/10, 2 decisiones (textarea, chip sobrio) + 6 calibraciones Sereno |
| DX Review | `/plan-devex-review` | Experiencia de desarrollo | 0 | — | — |

- **VERDICT:** ENG + DESIGN CLEARED — listo para implementar.

NO UNRESOLVED DECISIONS
