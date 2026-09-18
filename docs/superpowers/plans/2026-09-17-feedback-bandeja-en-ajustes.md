# Feedback: la bandeja en Ajustes — plan de implementación (entrega 2 de 2)

> **Para quien lo ejecute:** usá `superpowers:subagent-driven-development` o
> `superpowers:executing-plans` para llevarlo tarea por tarea. Los pasos son casillas (`- [ ]`).

**Objetivo:** que gerencia lea el feedback desde la app — con su lugar, filtros, marcado de visto y
un salto a donde estaba parada la persona que reportó.

**Arquitectura:** una sección nueva en el modal de Ajustes (`'feedback'`), sólo visible con el módulo
gerencia, que lee `public.feedback` con un hook de `useSupabaseQuery` y escribe el visto por un RPC.
El salto reusa el `navigate` del shell con el `place_target` que guardó la entrega 1.

**Stack:** React 19 + TypeScript strict, Vite, Vitest, Supabase (Postgres + RLS + RPC). Sin
react-router ni react-query.

**Spec:** [`docs/superpowers/specs/2026-09-17-feedback-con-lugar-design.md`](../specs/2026-09-17-feedback-con-lugar-design.md)
(decisiones F1-F6). **Entrega 1:** [`2026-09-17-feedback-captura-del-lugar.md`](2026-09-17-feedback-captura-del-lugar.md).

## Restricciones globales

- **Depende de la entrega 1**, que vive en la PR #222 (`feat/feedback-captura-del-lugar`). Arrancar
  con la #222 **ya en `main`**. Si hay que empezar antes, ramificar de `feat/feedback-captura-del-lugar`
  y reapuntar la PR a `main` a mano cuando aquélla se mergee — una PR apilada no se reapunta sola y
  el código de la base termina figurando como merged sin estarlo.
- **Rama:** `feat/feedback-bandeja`. **Nunca** commitear en `main` (hay un hook) y stagear **por
  ruta** (`git add <archivos>`): el árbol es compartido con el Director.
- **El gate es `npm run build`** (typecheck + vitest + build). Nada se da por hecho sin eso en verde.
- **Idioma:** comentarios, nombres de dominio y copy de UI en castellano rioplatense; el comentario
  explica el **porqué**. Los avisos, en una frase y sin tecnicismos.
- **Estilo:** CSS con variables en `src/styles/tokens.css`, íconos Lucide vía `components/Icon.tsx`,
  TypeScript strict, tipos a mano. En Ajustes se reusan las primitivas de
  `src/shell/settings/primitives.tsx` (`StCard`, `StSeg`, `StPill`, `btnGhost`).
- **Realce = elevación, nunca un borde de color.** El color se reserva para significado.
- **Tests:** sólo lo que falla **en silencio** (reglas puras). Lo visible se verifica mirando.
- **SQL:** migraciones inmutables y numeradas; el número se elige mirando `supabase/README.md` en el
  momento. Nunca dos signos peso seguidos dentro de un comentario.
- **La RLS filtra en silencio:** cero filas **no** es «no hay feedback». Ver la Task 4.

---

## Estructura de archivos

| Archivo | Responsabilidad |
|---|---|
| `supabase/migrations/NNNN_feedback_visto.sql` **(nuevo)** | El RPC `mark_feedback_seen`. Las columnas ya entraron en la 0129. |
| `src/data/feedback.ts` | Suma la lectura (`useFeedbackRecibido`) y el marcado (`markFeedbackSeen`). Ya tiene el envío. |
| `src/shell/settings/bandeja.ts` **(nuevo)** | Reglas puras de la bandeja: filtro y orden. |
| `src/shell/settings/bandeja.test.ts` **(nuevo)** | Sus casos. |
| `src/shell/settings/FeedbackSection.tsx` **(nuevo)** | La sección: filtros, lista, «Ir al lugar», «Marcar como visto». |
| `src/shell/settings/section.ts` + `section.test.ts` | La sección nueva y la regla de quién la ve. |
| `src/shell/settings/SettingsModal.tsx` | La entrada en el menú (sólo gerencia) y el ruteo interno. |
| `src/shell/AppShell.tsx` | Le pasa a Ajustes cómo navegar al lugar. |

---

### Task 1: El RPC del visto

**Files:**
- Create: `supabase/migrations/NNNN_feedback_visto.sql`
- Modify: `supabase/README.md` (el índice)

**Interfaces:**
- Consumes: `feedback.seen_at` y `feedback.seen_by` (ya existen, migración 0129).
- Produces: `public.mark_feedback_seen(p_id uuid)`.

- [ ] **Step 1: Elegir el número**

Correr: `ls supabase/migrations | tail -3`
Tomar el siguiente número libre. No renumerar ni editar ninguna existente.

- [ ] **Step 2: Escribir la migración**

Crear `supabase/migrations/NNNN_feedback_visto.sql` (con NNNN reemplazado por el del paso 1):

```sql
-- NNNN · Feedback: marcarlo como visto desde la bandeja
--
-- Las columnas seen_at/seen_by entraron con la 0129, sin nadie que las escribiera: la bandeja es la
-- entrega 2 y es la que las usa. Acá va sólo la función.
--
-- VA POR RPC Y NO POR UNA POLICY DE UPDATE, a propósito: la RLS no limita QUÉ COLUMNAS se pueden
-- tocar, así que una policy de update sobre `feedback` dejaría a gerencia reescribir el mensaje que
-- reportó otra persona. En una app auditable eso no se hace. Con SECURITY DEFINER, la única
-- escritura posible es la de estas dos columnas.

create or replace function public.mark_feedback_seen(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Tu sesión venció.' using errcode = '28000';
  end if;
  if not public.has_module('gerencia') then
    raise exception 'No tenés permiso para gestionar el feedback.' using errcode = '42501';
  end if;
  update public.feedback set seen_at = now(), seen_by = v_uid where id = p_id and seen_at is null;
end;
$$;

comment on function public.mark_feedback_seen is 'Marca un feedback como visto (actor server-side vía auth.uid()). Sólo gerencia. Idempotente: si ya estaba visto no pisa quién lo vio primero. SECURITY DEFINER. NNNN.';

grant execute on function public.mark_feedback_seen(uuid) to authenticated;
```

El `and seen_at is null` es lo que lo hace **idempotente**: dos clics no reescriben quién lo vio
primero, que es el dato que sirve.

- [ ] **Step 3: Contar los marcadores de dollar-quote**

Correr:

```bash
node -e "const s=require('fs').readFileSync(process.argv[1],'utf8');const n=(s.match(/\$\$/g)||[]).length;console.log('marcadores:',n, n%2===0?'OK (par)':'IMPAR')" supabase/migrations/NNNN_feedback_visto.sql
```

Esperado: `marcadores: 2 OK (par)`.

- [ ] **Step 4: Probarla con PGlite**

Mismo banco que la 0129 (ver el commit `db(feedback): 0129`): esquema de juguete con `public.users`,
`public.feedback` (con las cuatro columnas de la 0129), un `auth.uid()` de mentira, un rol
`authenticated` y un `public.has_module(text)` que devuelva `true`. Comprobar tres cosas:

```js
// 1 · marca
await db.query(`select public.mark_feedback_seen('${id}')`)
const a = (await db.query(`select seen_at, seen_by from public.feedback where id = '${id}'`)).rows[0]
if (!a.seen_at || a.seen_by !== UID) throw new Error('No marcó: ' + JSON.stringify(a))

// 2 · idempotente: marcar de nuevo no cambia quién lo vio primero
await db.query(`select public.mark_feedback_seen('${id}')`)
const b = (await db.query(`select seen_at, seen_by from public.feedback where id = '${id}'`)).rows[0]
if (String(b.seen_at) !== String(a.seen_at)) throw new Error('Pisó la marca original')

// 3 · sin gerencia, 42501
await db.exec(`create or replace function public.has_module(m text) returns boolean language sql stable as 'select false'`)
let fallo = null
try { await db.query(`select public.mark_feedback_seen('${id}')`) } catch (e) { fallo = e }
if (!fallo) throw new Error('Dejó marcar sin gerencia')
```

Si PGlite no está disponible sin red, saltear y **decirlo** en el reporte de la tarea: no dar por
probada una verificación que no se corrió.

- [ ] **Step 5: Anotar la migración en el índice**

En `supabase/README.md`, al final de la tabla, con el formato de las anteriores y **sin** marca de
aplicada (la aplica el Director):

```markdown
| NNNN | `feedback_visto.sql` — **Feedback: marcarlo como visto desde la bandeja** (`docs/superpowers/specs/2026-09-17-feedback-con-lugar-design.md`, entrega 2). ADITIVA: va **antes** del front. `mark_feedback_seen(p_id uuid)` SECURITY DEFINER: exige `has_module('gerencia')`, fija `seen_by = auth.uid()` y es idempotente (`seen_at is null`), así que un segundo clic no pisa quién lo vio primero. Va por RPC y no por policy de UPDATE porque la RLS no limita columnas: una policy dejaría reescribir el mensaje ajeno. |
```

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/NNNN_feedback_visto.sql supabase/README.md
git commit -m "db(feedback): NNNN — marcar un feedback como visto"
```

- [ ] **Step 7: Pasarle el SQL al Director**

Decirle que está lista, que es aditiva y que va antes del deploy. Apenas confirme «aplicada»,
anotar **Aplicada en prod (fecha)** en el índice (lo vigila `scripts/check-migraciones.mjs`).

---

### Task 2: La capa de datos

**Files:**
- Modify: `src/data/feedback.ts`

**Interfaces:**
- Consumes: el RPC de la Task 1; las columnas de la 0129.
- Produces:
  - `interface FeedbackRow { id, type, message, module, app_version, route, place_label, place_target, created_at, seen_at, reporter_name }`
  - `useFeedbackRecibido(): QueryResult<FeedbackRow[]>`
  - `markFeedbackSeen(id: string): Promise<{ error: string | null }>`

- [ ] **Step 1: Escribir el tipo, el hook y la mutación**

Agregar al final de `src/data/feedback.ts`:

```ts
/* ============================================================================
   LA BANDEJA (entrega 2). Lectura y marcado de lo que llega; el envío vive arriba.
   ========================================================================== */

/** Fila de `public.feedback` para la bandeja. Tipos a mano, como el resto de `data/`. */
export interface FeedbackRow {
  id: string
  type: FeedbackType
  message: string
  module: string | null
  app_version: string | null
  route: string | null
  /** Migaja del lugar (0129). `null` en el feedback anterior a esa migración. */
  place_label: string | null
  /** NavTarget + módulo/submódulo (0129). `null` cuando la pantalla no publicó entidad. */
  place_target: Record<string, unknown> | null
  created_at: string
  /** Cuándo lo marcaron como visto; `null` = pendiente. */
  seen_at: string | null
  /** Nombre de quien reportó, del embed de `users`. */
  reporter_name: string | null
}

/** Cómo viene el embed antes de aplanarlo. */
interface FeedbackRawRow extends Omit<FeedbackRow, 'reporter_name'> {
  autor: { full_name: string } | { full_name: string }[] | null
}

/** Traduce los errores de LECTURA de la bandeja (sin esto se ve el mensaje crudo, en inglés). */
function feedbackReadErrorMessage(e: PostgrestError): string {
  const code = e.code ?? ''
  if (code === 'PGRST202' || code === 'PGRST205' || code === '42P01' || code === '42703') {
    return 'Falta aplicar una actualización del sistema para ver el feedback. Avisale al administrador.'
  }
  if (code === '42501') return 'No tenés permiso para ver el feedback del equipo.'
  return 'No pudimos traer el feedback. Probá de nuevo en un momento.'
}

/**
 * El feedback recibido, del más nuevo al más viejo. Lo ve SÓLO gerencia, por la RLS de la 0044 —
 * acá no hay ninguna decisión de permisos.
 *
 * ⚠️ CERO FILAS NO ES «no hay feedback»: la RLS filtra en silencio, así que quien no es gerencia
 * recibe una lista vacía sin ningún error. Por eso quien llama pregunta ANTES si esta persona es
 * gerencia (`modules.includes('gerencia')` de `useAuth`) en vez de contar filas. Mismo criterio que
 * `useTeamAccess`.
 *
 * ⚠️ EL EMBED VA DESAMBIGUADO POR COLUMNA. Desde la 0129 hay DOS FKs de `feedback` a `users`
 * (`user_id` y `seen_by`), así que un `users(full_name)` a secas es ambiguo: PostgREST responde
 * `PGRST201` y **voltea la consulta entera**, no sólo el embed. Es lo que tiró el tablero de
 * Farmacia con la 0076.
 */
export function useFeedbackRecibido(): QueryResult<FeedbackRow[]> {
  return useSupabaseQuery<FeedbackRow[]>(
    async (c) => {
      const r = await c
        .from('feedback')
        .select('id, type, message, module, app_version, route, place_label, place_target, created_at, seen_at, autor:users!user_id(full_name)')
        .order('created_at', { ascending: false })
        .limit(200)
        .returns<FeedbackRawRow[]>()
      if (r.error) return r
      const filas = (r.data ?? []).map(({ autor, ...f }): FeedbackRow => ({
        ...f,
        reporter_name: Array.isArray(autor) ? (autor[0]?.full_name ?? null) : (autor?.full_name ?? null),
      }))
      return { ...r, data: filas }
    },
    [],
    feedbackReadErrorMessage,
  )
}

/**
 * Marca un feedback como visto. El RPC fija el actor y exige gerencia; acá sólo se traduce el error.
 * Idempotente del lado del server: un segundo clic no pisa quién lo vio primero.
 */
export async function markFeedbackSeen(id: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('mark_feedback_seen', { p_id: id })
  if (!error) return { error: null }
  if (error.code === '42501') return { error: 'No tenés permiso para gestionar el feedback.' }
  if (error.code === '28000') return { error: 'Tu sesión venció. Volvé a entrar y probá de nuevo.' }
  if (error.code === 'PGRST202') return { error: 'Falta aplicar una actualización del sistema. Avisale al administrador.' }
  return { error: 'No pudimos marcarlo como visto. Probá de nuevo en un momento.' }
}
```

- [ ] **Step 2: Sumar los imports que faltan**

Arriba del archivo, junto al `import { supabase }` que ya está:

```ts
import { useSupabaseQuery } from '../lib/useSupabaseQuery'
import type { QueryResult } from '../lib/useSupabaseQuery'
import type { PostgrestError } from '@supabase/supabase-js'
```

- [ ] **Step 3: Verificar que compila**

Correr: `npm run typecheck`
Esperado: sin errores.

- [ ] **Step 4: Probar que PostgREST acepta el `select` (sin sesión)**

El parseo del `select` ocurre **antes** del chequeo de permisos, así que un `PGRST201` por embed
ambiguo se ve sin estar logueado. Con el dev server levantado y `.env` en su lugar:

```bash
node -e "
const url = process.env.VITE_SUPABASE_URL, key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY
const sel = 'id,type,message,place_label,place_target,created_at,seen_at,autor:users!user_id(full_name)'
fetch(url + '/rest/v1/feedback?select=' + encodeURIComponent(sel) + '&limit=1', { headers: { apikey: key, Authorization: 'Bearer ' + key } })
  .then(r => r.text().then(t => console.log(r.status, t.slice(0, 200))))
"
```

Esperado: **401/permission denied**, o `[]` — cualquiera de los dos significa que el `select`
parseó. Si sale `PGRST201` («more than one relationship»), el embed quedó ambiguo: corregir el
`!user_id`. **No** seguir a la Task 3 con un PGRST201 vivo.

- [ ] **Step 5: Commit**

```bash
git add src/data/feedback.ts
git commit -m "feat(feedback): la bandeja lee el feedback recibido y marca el visto"
```

---

### Task 3: Las reglas de la bandeja (puras)

**Files:**
- Create: `src/shell/settings/bandeja.ts`
- Test: `src/shell/settings/bandeja.test.ts`

**Interfaces:**
- Consumes: `FeedbackRow` (Task 2).
- Produces:
  - `type FiltroTipo = 'todos' | FeedbackType`
  - `type FiltroVisto = 'todos' | 'pendientes'`
  - `filtrarFeedback(filas: FeedbackRow[], f: { tipo: FiltroTipo; visto: FiltroVisto }): FeedbackRow[]`
  - `destinoDelLugar(place_target): { moduleKey: string; subKey: string; target: Record<string, unknown> } | null`

- [ ] **Step 1: Escribir el test que falla**

Crear `src/shell/settings/bandeja.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { FeedbackRow } from '../../data/feedback'
import { destinoDelLugar, filtrarFeedback } from './bandeja'

/* Las reglas de la bandeja de feedback.
 *
 * SE TESTEAN PORQUE FALLAN EN SILENCIO: un filtro al revés muestra una lista que parece correcta —
 * nadie sabe cuántos feedbacks hay— y un destino mal armado manda a quien supervisa a otra pantalla
 * sin ningún error. Las dos cosas se ven perfectas.
 */

function fila(over: Partial<FeedbackRow> = {}): FeedbackRow {
  return {
    id: over.id ?? 'f1',
    type: over.type ?? 'problema',
    message: over.message ?? 'no me deja avanzar',
    module: 'track',
    app_version: '0.79.0',
    route: 'track/protocolos',
    place_label: over.place_label ?? 'Coordinación › Estudios y pacientes › Juan Pérez',
    place_target: over.place_target ?? { moduleKey: 'track', subKey: 'protocolos', patientId: 'p1' },
    created_at: over.created_at ?? '2026-09-17T10:00:00Z',
    seen_at: over.seen_at ?? null,
    reporter_name: over.reporter_name ?? 'Ana',
  }
}

describe('filtrarFeedback', () => {
  const filas = [
    fila({ id: 'a', type: 'problema', seen_at: null }),
    fila({ id: 'b', type: 'idea', seen_at: '2026-09-17T12:00:00Z' }),
    fila({ id: 'c', type: 'problema', seen_at: '2026-09-17T12:00:00Z' }),
  ]

  it('sin filtros devuelve todo, en el orden en que vino', () => {
    // El orden lo pone la consulta (created_at desc); el filtro no reordena.
    expect(filtrarFeedback(filas, { tipo: 'todos', visto: 'todos' }).map((f) => f.id)).toEqual(['a', 'b', 'c'])
  })

  it('filtra por tipo', () => {
    expect(filtrarFeedback(filas, { tipo: 'problema', visto: 'todos' }).map((f) => f.id)).toEqual(['a', 'c'])
  })

  it('«pendientes» son los que no tienen seen_at', () => {
    expect(filtrarFeedback(filas, { tipo: 'todos', visto: 'pendientes' }).map((f) => f.id)).toEqual(['a'])
  })

  it('los dos filtros se combinan', () => {
    expect(filtrarFeedback(filas, { tipo: 'idea', visto: 'pendientes' })).toEqual([])
  })
})

describe('destinoDelLugar', () => {
  it('separa el módulo y el submódulo del resto del objetivo', () => {
    expect(destinoDelLugar({ moduleKey: 'track', subKey: 'protocolos', patientId: 'p1', protocolId: 'e1' })).toEqual({
      moduleKey: 'track',
      subKey: 'protocolos',
      target: { patientId: 'p1', protocolId: 'e1' },
    })
  })

  it('sin lugar guardado no hay salto', () => {
    // Es el feedback anterior a la 0129, y el de las pantallas que no publican: se lee, no se salta.
    expect(destinoDelLugar(null)).toBeNull()
  })

  it('un target sin módulo o sin submódulo tampoco es un salto', () => {
    // Guardado por una versión intermedia, o a mano: saltar a `undefined/undefined` aterrizaría en
    // la pantalla de "ruta desconocida", que es peor que no ofrecer el botón.
    expect(destinoDelLugar({ patientId: 'p1' })).toBeNull()
    expect(destinoDelLugar({ moduleKey: 'track', patientId: 'p1' })).toBeNull()
  })

  it('un lugar sin entidad igual lleva a la pantalla', () => {
    // «Recepción · paso 2 de 4» no tiene entidad, pero el submódulo sí existe y vale ir.
    expect(destinoDelLugar({ moduleKey: 'pharma', subKey: 'recepcion' })).toEqual({
      moduleKey: 'pharma',
      subKey: 'recepcion',
      target: {},
    })
  })
})
```

- [ ] **Step 2: Correr el test y verificar que falla**

Correr: `npx vitest run src/shell/settings/bandeja.test.ts`
Esperado: FAIL — `Failed to resolve import "./bandeja"`.

- [ ] **Step 3: Escribir la implementación**

Crear `src/shell/settings/bandeja.ts`:

```ts
import type { FeedbackRow, FeedbackType } from '../../data/feedback'

/* Las reglas de la bandeja de feedback, aparte de la pantalla para poder testearlas: importar la
   sección arrastra el cliente de Supabase, que exige variables de entorno y no monta en un test de
   node. Misma división que el resto del repo entre las reglas puras y su cáscara. */

export type FiltroTipo = 'todos' | FeedbackType
export type FiltroVisto = 'todos' | 'pendientes'

/** Los dos filtros de la bandeja, combinados. NO reordena: el orden lo pone la consulta. */
export function filtrarFeedback(
  filas: FeedbackRow[],
  f: { tipo: FiltroTipo; visto: FiltroVisto },
): FeedbackRow[] {
  return filas.filter((r) => {
    if (f.tipo !== 'todos' && r.type !== f.tipo) return false
    if (f.visto === 'pendientes' && r.seen_at !== null) return false
    return true
  })
}

/**
 * A dónde lleva «Ir al lugar», partiendo el `place_target` que guardó la entrega 1 en lo que pide
 * `navigate(moduleKey, subKey, target)`.
 *
 * Devuelve `null` —y entonces no se ofrece el botón— cuando no hay a dónde ir: el feedback anterior
 * a la 0129, el de una pantalla que no publica, o un objetivo a medias. Saltar con el módulo o el
 * submódulo en blanco aterrizaría en «ruta desconocida», que es peor que no ofrecer el salto.
 */
export function destinoDelLugar(
  placeTarget: Record<string, unknown> | null,
): { moduleKey: string; subKey: string; target: Record<string, unknown> } | null {
  if (!placeTarget) return null
  const { moduleKey, subKey, ...target } = placeTarget
  if (typeof moduleKey !== 'string' || typeof subKey !== 'string') return null
  return { moduleKey, subKey, target }
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Correr: `npx vitest run src/shell/settings/bandeja.test.ts`
Esperado: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add src/shell/settings/bandeja.ts src/shell/settings/bandeja.test.ts
git commit -m "feat(feedback): las reglas de la bandeja (filtros y destino del salto)"
```

---

### Task 4: La sección

**Files:**
- Create: `src/shell/settings/FeedbackSection.tsx`

**Interfaces:**
- Consumes: `useFeedbackRecibido`, `markFeedbackSeen` (Task 2); `filtrarFeedback`, `destinoDelLugar`
  (Task 3); `StCard`, `StSeg`, `StPill`, `btnGhost` de `./primitives`.
- Produces: `FeedbackSection({ onIrAlLugar }: { onIrAlLugar?: (moduleKey: string, subKey: string, target: Record<string, unknown>) => void })`.

- [ ] **Step 1: Escribir la sección**

Crear `src/shell/settings/FeedbackSection.tsx`:

```tsx
import { useState } from 'react'
import { Icon } from '../../components/Icon'
import type { IconName } from '../../components/Icon'
import { EmptyState } from '../../components/EmptyState'
import { useAuth } from '../../lib/auth'
import { formatAR } from '../../lib/dates'
import { markFeedbackSeen, useFeedbackRecibido } from '../../data/feedback'
import type { FeedbackRow, FeedbackType } from '../../data/feedback'
import { destinoDelLugar, filtrarFeedback } from './bandeja'
import type { FiltroTipo, FiltroVisto } from './bandeja'
import { ACCENT, StCard, StSeg, btnGhost } from './primitives'

/* ============================================================================
   Feedback recibido — la bandeja de gerencia (entrega 2 del spec del 2026-09-17).

   Antes esto se leía entrando a Supabase: la tabla existe desde la 0044 y ninguna pantalla la
   mostraba. Cada renglón trae el mensaje, quién lo mandó, cuándo, Y DÓNDE ESTABA PARADO —que es el
   pedido que originó todo— con un salto a ese mismo lugar.

   ⚠️ LA RAMA DE PERMISO SE DECIDE CON `useAuth`, NO CONTANDO FILAS. La RLS de la 0044 deja ver el
   feedback sólo a gerencia y filtra EN SILENCIO: sin el módulo, la consulta devuelve cero filas y
   ningún error. Si esta pantalla dedujera "no vino nada, no hay feedback", alguien sin permiso —o un
   administrador con la migración sin aplicar— vería un vacío indistinguible de un sistema roto. Es
   el mismo criterio que documenta `EquipoYAccesosSection`.
   ============================================================================ */

const TIPOS: { v: FiltroTipo; l: string }[] = [
  { v: 'todos', l: 'Todos' },
  { v: 'problema', l: 'Problemas' },
  { v: 'sugerencia', l: 'Sugerencias' },
  { v: 'idea', l: 'Ideas' },
]
const VISTOS: { v: FiltroVisto; l: string }[] = [
  { v: 'pendientes', l: 'Pendientes' },
  { v: 'todos', l: 'Todos' },
]

/** Ícono y color por tipo. El color dice QUÉ ES, no decora: problema en rojo, el resto neutro. */
const PINTA: Record<FeedbackType, { icon: IconName; color: string }> = {
  problema: { icon: 'alert', color: 'var(--spira-acc-deep-danger)' },
  sugerencia: { icon: 'message', color: 'var(--spira-muted)' },
  idea: { icon: 'heart', color: 'var(--spira-muted)' },
}

export function FeedbackSection({ onIrAlLugar }: {
  /** Navegar al lugar desde donde se reportó. Lo pasa el shell, que es el que sabe navegar. */
  onIrAlLugar?: (moduleKey: string, subKey: string, target: Record<string, unknown>) => void
}) {
  const { modules } = useAuth()
  const esGerencia = modules.includes('gerencia')
  const q = useFeedbackRecibido()
  const [tipo, setTipo] = useState<FiltroTipo>('todos')
  const [visto, setVisto] = useState<FiltroVisto>('pendientes')
  /** Errores de marcado, por fila: el de una no puede tapar la lista entera. */
  const [errores, setErrores] = useState<Record<string, string>>({})

  if (!esGerencia) {
    return (
      <EmptyState
        accent={ACCENT}
        icon="lock"
        title="Sin acceso"
        description="El feedback del equipo lo ve gerencia."
      />
    )
  }

  const filas = filtrarFeedback(q.data ?? [], { tipo, visto })

  const marcar = async (f: FeedbackRow) => {
    const res = await markFeedbackSeen(f.id)
    if (res.error) { setErrores((e) => ({ ...e, [f.id]: res.error! })); return }
    setErrores((e) => { const { [f.id]: _, ...resto } = e; return resto })
    q.refetch()
  }

  return (
    <StCard
      title="Feedback recibido"
      desc="Lo que manda el equipo desde «Dar feedback», con la pantalla en la que estaba."
      pad={false}
    >
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', padding: '13px 18px', borderBottom: '1px solid var(--spira-line)' }}>
        <StSeg options={TIPOS} value={tipo} onChange={setTipo} label="Filtrar por tipo" />
        <StSeg options={VISTOS} value={visto} onChange={setVisto} label="Filtrar por estado" />
      </div>

      {q.loading && <div style={{ padding: '18px', fontSize: 13.5, color: 'var(--spira-muted)' }}>Cargando…</div>}
      {q.error && <div style={{ padding: '18px', fontSize: 13.5, color: 'var(--spira-acc-deep-danger)' }}>{q.error}</div>}

      {!q.loading && !q.error && filas.length === 0 && (
        <div style={{ padding: '10px 18px 18px' }}>
          <EmptyState
            accent={ACCENT}
            icon="message"
            title={visto === 'pendientes' ? 'Nada pendiente' : 'Sin feedback'}
            description={visto === 'pendientes' ? 'Ya miraste todo lo que llegó.' : 'Todavía no mandaron feedback.'}
          />
        </div>
      )}

      {filas.map((f) => {
        const destino = destinoDelLugar(f.place_target)
        const pinta = PINTA[f.type]
        return (
          <div key={f.id} style={{ display: 'flex', gap: 12, padding: '14px 18px', borderTop: '1px solid var(--spira-line)', opacity: f.seen_at ? 0.6 : 1 }}>
            <Icon name={pinta.icon} size={17} color={pinta.color} style={{ flex: '0 0 auto', marginTop: 2 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13.5, color: 'var(--spira-ink)', lineHeight: 1.45, whiteSpace: 'pre-wrap' }}>{f.message}</div>
              {/* EL LUGAR, que es el punto de toda la feature. Sin él —feedback anterior a la
                  0129— se muestra la ruta de siempre, para que el renglón nunca quede mudo. */}
              <div style={{ fontSize: 12, color: 'var(--spira-muted)', marginTop: 5 }}>
                {f.place_label ?? f.route ?? 'Sin lugar registrado'}
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--spira-faint)', marginTop: 3 }}>
                {f.reporter_name ?? 'Alguien del equipo'} · {formatAR(f.created_at.slice(0, 10))}
                {f.app_version ? ` · v${f.app_version}` : ''}
                {f.seen_at ? ' · visto' : ''}
              </div>
              {errores[f.id] && <div style={{ fontSize: 12, color: 'var(--spira-acc-deep-danger)', marginTop: 5 }}>{errores[f.id]}</div>}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7, flex: '0 0 auto', alignItems: 'flex-end' }}>
              {/* Sin destino NO se dibuja el botón: no se ofrece un salto que no se puede dar. */}
              {destino && onIrAlLugar && (
                <button type="button" style={btnGhost} onClick={() => onIrAlLugar(destino.moduleKey, destino.subKey, destino.target)}>
                  Ir al lugar <Icon name="arrowRight" size={15} color="currentColor" />
                </button>
              )}
              {!f.seen_at && (
                <button type="button" style={btnGhost} onClick={() => marcar(f)}>
                  Marcar como visto
                </button>
              )}
            </div>
          </div>
        )
      })}
    </StCard>
  )
}
```

- [ ] **Step 2: Verificar que compila**

Correr: `npm run typecheck`
Esperado: sin errores. Si `EmptyState` pide otras props, mirar su firma en
`src/components/EmptyState.tsx` y ajustar — no inventar props.

- [ ] **Step 3: Commit**

```bash
git add src/shell/settings/FeedbackSection.tsx
git commit -m "feat(feedback): la sección «Feedback recibido» de Ajustes"
```

---

### Task 5: La sección entra en Ajustes (y sólo la ve gerencia)

**Files:**
- Modify: `src/shell/settings/section.ts`
- Modify: `src/shell/settings/section.test.ts`
- Modify: `src/shell/settings/SettingsModal.tsx`
- Modify: `src/shell/AppShell.tsx`

**Interfaces:**
- Consumes: `FeedbackSection` (Task 4).
- Produces: `SettingsSection` incluye `'feedback'`; `seccionVisible(section, esGerencia)`;
  `SettingsModalProps` suma `onIrAlLugar?`.

- [ ] **Step 1: Escribir el test que falla**

Agregar al final de `src/shell/settings/section.test.ts`:

```ts
describe('seccionVisible', () => {
  it('sin gerencia, «Feedback recibido» cae a Mi cuenta', () => {
    // La sección no está en el menú, pero `?ajustes=feedback` es una URL que cualquiera puede
    // escribir. Mostrarla igual dejaría una pantalla que sólo puede fallar: la RLS de la 0044 no le
    // va a devolver ni una fila.
    expect(seccionVisible('feedback', false)).toBe('cuenta')
  })

  it('con gerencia, la deja pasar', () => {
    expect(seccionVisible('feedback', true)).toBe('feedback')
  })

  it('las demás secciones no dependen de gerencia', () => {
    for (const s of ['cuenta', 'prefs', 'roles', 'plataformas'] as const) {
      expect(seccionVisible(s, false)).toBe(s)
      expect(seccionVisible(s, true)).toBe(s)
    }
  })
})
```

Y sumar `seccionVisible` al import de arriba del archivo:

```ts
import { parseSettingsSection, SECCIONES, seccionVisible } from './section'
```

- [ ] **Step 2: Correr el test y verificar que falla**

Correr: `npx vitest run src/shell/settings/section.test.ts`
Esperado: FAIL — `seccionVisible is not a function`.

- [ ] **Step 3: Registrar la sección y la regla**

En `src/shell/settings/section.ts`, cambiar el tipo y la lista, y sumar la función:

```ts
export type SettingsSection = 'cuenta' | 'prefs' | 'roles' | 'plataformas' | 'feedback'

export const SECCIONES: SettingsSection[] = ['cuenta', 'prefs', 'roles', 'plataformas', 'feedback']

/**
 * Qué sección mostrar de verdad. «Feedback recibido» es de gerencia: no está en el menú de los
 * demás, pero `?ajustes=feedback` es una URL que cualquiera puede escribir o recibir. Sin gerencia
 * cae a «Mi cuenta», igual que una sección desconocida — quien abrió el link pidió entrar a Ajustes.
 *
 * Esto NO es el control de acceso: el control es la RLS de la 0044, que no le devuelve una fila a
 * nadie más. Acá se evita mostrar una pantalla que sólo puede fallar.
 */
export function seccionVisible(section: SettingsSection, esGerencia: boolean): SettingsSection {
  return section === 'feedback' && !esGerencia ? 'cuenta' : section
}
```

`'feedback'` va **último** en `SECCIONES` por el mismo criterio que `plataformas`: no corre a
ninguna de las que ya estaban.

- [ ] **Step 4: Correr el test y verificar que pasa**

Correr: `npx vitest run src/shell/settings/section.test.ts`
Esperado: PASS (los casos que ya había + los tres nuevos).

- [ ] **Step 5: Mostrarla en el modal**

En `src/shell/settings/SettingsModal.tsx`:

```tsx
// imports
import { useAuth } from '../../lib/auth'
import { FeedbackSection } from './FeedbackSection'
import { seccionVisible } from './section'

// el título de la sección
const SETTINGS_TITLE: Record<SettingsSection, string> = {
  cuenta: 'Mi cuenta', prefs: 'Preferencias', roles: 'Equipo y accesos', plataformas: 'Plataformas',
  feedback: 'Feedback recibido',
}

// el ruteo interno (la sección recibe el salto; el resto sigue sin props)
function renderSection(cur: SettingsSection, onIrAlLugar?: SettingsModalProps['onIrAlLugar']) {
  switch (cur) {
    case 'cuenta': return <AccountSection />
    case 'prefs': return <PrefsSection />
    case 'roles': return <EquipoYAccesosSection />
    case 'plataformas': return <PlataformasSection />
    case 'feedback': return <FeedbackSection onIrAlLugar={onIrAlLugar} />
  }
}
```

En `SettingsModalProps`, sumar:

```tsx
  /** Ir al lugar desde donde se reportó un feedback. Lo pasa el shell, que es el que navega. */
  onIrAlLugar?: (moduleKey: string, subKey: string, target: Record<string, unknown>) => void
```

Y dentro del componente, donde hoy se usa `section` para pintar el menú y el contenido:

```tsx
  const { modules } = useAuth()
  const esGerencia = modules.includes('gerencia')
  /* El menú NO muestra «Feedback recibido» a quien no es gerencia, y la URL tampoco lo deja entrar
     (ver `seccionVisible`). Las dos cosas son presentación: el que decide es la RLS de la 0044. */
  const nav = SETTINGS_NAV.filter((it) => it.key !== 'feedback' || esGerencia)
  const cur = seccionVisible(section, esGerencia)
```

— y usar `nav` donde hoy dice `SETTINGS_NAV.map(...)`, y `cur` donde hoy se usa la sección actual
(el `aria-current` del menú, el título y `renderSection`). Sumar la entrada al menú:

```tsx
const SETTINGS_NAV: NavDef[] = [
  { key: 'cuenta', name: 'Mi cuenta', icon: 'user' },
  { key: 'prefs', name: 'Preferencias', icon: 'settings' },
  { key: 'roles', name: 'Equipo y accesos', icon: 'lock' },
  { key: 'plataformas', name: 'Plataformas', icon: 'externalLink' },
  { key: 'feedback', name: 'Feedback recibido', icon: 'message' },
]
```

- [ ] **Step 6: Conectar el salto en el shell**

En `src/shell/AppShell.tsx`, donde se monta `<SettingsModal … />`, sumar:

```tsx
          onIrAlLugar={(mKey, sKey, target) => navigate(mKey, sKey, target as NavTarget)}
```

Navegar **cierra Ajustes solo**: `pushUrl` escribe un query vacío y se lleva el `?ajustes=` con él
(está documentado en el propio shell), así que no hay que cerrarlo a mano.

- [ ] **Step 7: Verificar que compila y que la suite pasa**

Correr: `npm run build`
Esperado: typecheck limpio, todos los tests en verde, build terminado.

- [ ] **Step 8: Commit**

```bash
git add src/shell/settings/section.ts src/shell/settings/section.test.ts src/shell/settings/SettingsModal.tsx src/shell/AppShell.tsx
git commit -m "feat(feedback): «Feedback recibido» entra en Ajustes, sólo para gerencia"
```

---

### Task 6: Verificación en el navegador

**Files:** ninguno del producto. El banco de pruebas se borra al terminar.

- [ ] **Step 1: Montar la sección con filas de mentira**

Crear `harness.html` en la raíz y `src/__harness__/main.tsx` que monte `FeedbackSection` dentro de
`<AuthProvider>` (el `useAuth` lanza sin provider). Como sin sesión `modules` viene vacío, la sección
va a mostrar «Sin acceso» — que **es** el primer caso a verificar. Para ver la lista, montar en su
lugar una copia del `map` de renglones con tres `FeedbackRow` de mentira: uno con `place_target`
completo, uno con `place_label` pero `place_target: null`, y uno sin lugar (`place_label: null`).

- [ ] **Step 2: Levantar el server y abrir el banco**

```bash
npm run dev -- --port 5251 --strictPort
```

Abrir `http://localhost:5251/harness.html` con `preview_start { url }` — **no** con `navigate`, que
normaliza la URL a la raíz del preview y deja ver `index.html` en su lugar.

- [ ] **Step 3: Comprobar los tres renglones**

Con `javascript_tool`, verificar que:
- el renglón con `place_target` completo tiene el botón «Ir al lugar»;
- el que tiene `place_label` pero sin `place_target` **no** lo tiene, y muestra el lugar igual;
- el que no tiene lugar muestra su `route` y tampoco ofrece el salto;
- un renglón con `seen_at` se ve atenuado (`opacity` 0.6) y **sin** el botón de marcar.

- [ ] **Step 4: Screenshot y limpieza**

Sacar un screenshot como evidencia, y después:

```bash
rm -rf src/__harness__ harness.html
npm run build
```

Esperado: build verde.

- [ ] **Step 5: Commit (si hubo ajustes) y PR**

Abrir la PR con el formato de la casa (API REST de GitHub + `git credential fill`; no hay `gh`).
En el cuerpo: que es la entrega 2, que la migración va **antes** del deploy, y qué quedó sin probar.

- [ ] **Step 6: Lo que sólo se puede probar con la migración aplicada**

Decirlo explícitamente en el chat y **no** darlo por hecho: marcar como visto de punta a punta, y que
la lista traiga filas reales. Las dos cosas necesitan el RPC en prod.
