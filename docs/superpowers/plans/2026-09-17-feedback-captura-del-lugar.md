# Feedback: captura del lugar — plan de implementación (entrega 1 de 2)

> **Para quien lo ejecute:** usá `superpowers:subagent-driven-development` o
> `superpowers:executing-plans` para llevarlo tarea por tarea. Los pasos son casillas (`- [ ]`).

**Objetivo:** que cada feedback enviado guarde **desde dónde** se reportó — módulo › submódulo ›
entidad abierta —, con el id necesario para volver a ese lugar.

**Arquitectura:** una pila a nivel de módulo (`src/lib/lugar.ts`) donde las pantallas y los modales
publican su lugar mientras están montados; el shell lee el tope al abrir el modal de feedback, arma
el texto y el objetivo de navegación, y los manda por el RPC `submit_feedback`, que suma dos
parámetros. La lectura (bandeja en Ajustes) es la **entrega 2** y no entra acá.

**Stack:** React 19 + TypeScript strict, Vite, Vitest, Supabase (Postgres + RLS + RPC). Sin
react-router ni react-query: la navegación es estado del shell.

**Spec:** [`docs/superpowers/specs/2026-09-17-feedback-con-lugar-design.md`](../specs/2026-09-17-feedback-con-lugar-design.md)
(decisiones F1-F6).

## Restricciones globales

- **Rama:** trabajar en `feat/feedback-captura-del-lugar`. **Nunca** commitear en `main` (hay un hook
  que lo bloquea) y stagear **siempre por ruta** (`git add <archivos>`), nunca `git add -A`: el árbol
  es compartido con el Director.
- **El gate es `npm run build`** (typecheck + vitest + build). No dar nada por hecho sin eso en verde.
- **Idioma:** comentarios, nombres de dominio y copy de UI en castellano rioplatense. Los comentarios
  explican el **porqué**, no el qué, con la densidad del código existente.
- **Estilo:** CSS con variables en `src/styles/tokens.css` (sin Tailwind ni CSS-in-JS), íconos Lucide
  vía `components/Icon.tsx`, TypeScript strict, tipos a mano.
- **Tests:** sólo lo que falla **en silencio** (reglas puras). Lo que falla a la vista se verifica
  mirando. Criterio en `src/views/pharma/dispensaciones/estados.test.ts`.
- **SQL:** las migraciones son **inmutables y numeradas**; nunca editar una aplicada. Adentro de una
  función con `set search_path` acotado, calificar todo lo que no sea de `public` ni `pg_catalog`.
  Nunca escribir dos signos peso seguidos dentro de un comentario SQL.
- **Copy del modal:** los avisos van en una frase, sin tecnicismos.

---

## Estructura de archivos

| Archivo | Responsabilidad |
|---|---|
| `src/lib/lugar.ts` **(nuevo)** | La pila de lugares (`empujarLugar`, `useLugar`, `lugarActual`) y el armado puro de lo que se guarda (`armarLugar`). |
| `src/lib/lugar.test.ts` **(nuevo)** | Los casos de la pila y del armado. |
| `src/lib/teclas.ts` **(nuevo)** | El modificador según plataforma, para mostrar los atajos. Hoy vive duplicado en `AppShell`. |
| `supabase/migrations/NNNN_feedback_lugar.sql` **(nuevo)** | Las cuatro columnas nuevas + el RPC con dos parámetros más. |
| `supabase/README.md` | El renglón de la migración en el índice. |
| `src/data/feedback.ts` | `FeedbackInput` suma el lugar; el RPC lo manda. |
| `src/shell/AppShell.tsx` | Arma el lugar al abrir el feedback y lo pasa; registra el atajo. |
| `src/shell/FeedbackModal.tsx` | Muestra el lugar en la caja de contexto y lo envía. |
| `src/shell/AboutMenu.tsx` | La tecla del atajo junto a «Dar feedback». |
| `src/views/PatientFichaView.tsx`, `src/views/ProtocolDetailView.tsx`, `src/views/track/VisitDetail.tsx`, `src/views/pharma/ReceptionWizard.tsx` | Publican su lugar. |

**`RegisterVisitFlow` no se toca**, aunque el spec lo listaba: no recibe ni el nombre ni el id del
paciente (sólo `enrollmentId` y `protocolId`), y cuando está abierto la pila ya tiene el lugar de la
ficha que lo abrió — que dice más. Sumarle props sólo para esto no se paga.

---

### Task 1: La pila de lugares y el armado (`src/lib/lugar.ts`)

**Files:**
- Create: `src/lib/lugar.ts`
- Test: `src/lib/lugar.test.ts`

**Interfaces:**
- Consumes: `NavTarget` de `src/views/types.ts` (ya existe).
- Produces:
  - `interface Lugar { label: string; target?: NavTarget }`
  - `empujarLugar(lugar: Lugar): () => void` — publica y devuelve la función que lo saca.
  - `useLugar(lugar: Lugar | null): void` — cáscara de `empujarLugar` en un efecto.
  - `lugarActual(): Lugar | null` — el tope, con el target heredado (ver abajo).
  - `armarLugar(args: { moduleName: string; moduleKey: string; subName: string; subKey: string; crumbs: string[]; lugar: Lugar | null }): { label: string; target: Record<string, unknown> | null }`

- [ ] **Step 1: Escribir el test que falla**

Crear `src/lib/lugar.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { armarLugar, empujarLugar, lugarActual } from './lugar'

/* Dónde estaba parada la persona cuando mandó el feedback.
 *
 * SE TESTEA PORQUE FALLA EN SILENCIO: el que lee esto es el supervisor, días después, y un lugar
 * armado al revés —o el target de otra pantalla— se ve perfecto en la bandeja y lo manda a mirar
 * donde no era. En pantalla no se nota nada, que es exactamente el criterio de qué se testea acá.
 */

describe('la pila de lugares', () => {
  it('manda el último que se publicó', () => {
    const sacarFicha = empujarLugar({ label: 'Juan Pérez · 4022001', target: { patientId: 'p1' } })
    const sacarModal = empujarLugar({ label: 'V8 · Juan Pérez', target: { visitId: 'v1' } })
    expect(lugarActual()?.label).toBe('V8 · Juan Pérez')
    sacarModal()
    expect(lugarActual()?.label).toBe('Juan Pérez · 4022001')
    sacarFicha()
    expect(lugarActual()).toBeNull()
  })

  it('un modal sin target hereda el de la pantalla de abajo', () => {
    // El wizard de Recepción no tiene entidad propia hasta que se confirma. Sin herencia, abrirlo
    // BORRARÍA el salto que ya tenía la pantalla: el supervisor perdería el destino por abrir una
    // ventana.
    const sacarLista = empujarLugar({ label: 'LTS17231', target: { protocolId: 'e1' } })
    const sacarWizard = empujarLugar({ label: 'Recepción · paso 2 de 4' })
    expect(lugarActual()).toEqual({ label: 'Recepción · paso 2 de 4', target: { protocolId: 'e1' } })
    sacarWizard()
    sacarLista()
  })

  it('desmontar en desorden saca la entrada correcta', () => {
    // React no garantiza el orden de limpieza entre componentes hermanos, y en StrictMode cada
    // efecto monta y desmonta dos veces. Sacar "el último" a ciegas dejaría la pila mintiendo.
    const sacarA = empujarLugar({ label: 'A' })
    const sacarB = empujarLugar({ label: 'B' })
    sacarA()
    expect(lugarActual()?.label).toBe('B')
    sacarB()
    expect(lugarActual()).toBeNull()
  })

  it('sacar dos veces no rompe ni saca a otro', () => {
    const sacarA = empujarLugar({ label: 'A' })
    const sacarB = empujarLugar({ label: 'B' })
    sacarB()
    sacarB()
    expect(lugarActual()?.label).toBe('A')
    sacarA()
  })
})

describe('armarLugar', () => {
  const base = { moduleName: 'Coordinación', moduleKey: 'track', subName: 'Estudios y pacientes', subKey: 'protocolos' }

  it('con un lugar publicado, lo usa y le suma el módulo y el submódulo', () => {
    expect(armarLugar({ ...base, crumbs: ['LTS17231'], lugar: { label: 'Juan Pérez · 4022001', target: { patientId: 'p1' } } })).toEqual({
      label: 'Coordinación › Estudios y pacientes › Juan Pérez · 4022001',
      target: { moduleKey: 'track', subKey: 'protocolos', patientId: 'p1' },
    })
  })

  it('sin lugar publicado cae a las migas del encabezado, y entonces no hay salto', () => {
    // Es el estado de hoy para las pantallas que no se cablearon: se lee, no se salta.
    expect(armarLugar({ ...base, crumbs: ['LTS17231', 'Juan Pérez'], lugar: null })).toEqual({
      label: 'Coordinación › Estudios y pacientes › LTS17231 › Juan Pérez',
      target: null,
    })
  })

  it('sin lugar y sin migas, el módulo y el submódulo pelados', () => {
    expect(armarLugar({ ...base, crumbs: [], lugar: null })).toEqual({
      label: 'Coordinación › Estudios y pacientes',
      target: null,
    })
  })

  it('un lugar publicado sin target no inventa uno', () => {
    expect(armarLugar({ ...base, crumbs: [], lugar: { label: 'Recepción · paso 2 de 4' } }).target).toBeNull()
  })

  it('descarta las migas vacías', () => {
    // Una vista que registra su encabezado antes de que carguen los datos pone una miga en blanco:
    // sin esto el texto guardado quedaría con un "›" colgando.
    expect(armarLugar({ ...base, crumbs: ['', 'Juan Pérez'], lugar: null }).label)
      .toBe('Coordinación › Estudios y pacientes › Juan Pérez')
  })
})
```

- [ ] **Step 2: Correr el test y verificar que falla**

Correr: `npx vitest run src/lib/lugar.test.ts`
Esperado: FAIL — `Failed to resolve import "./lugar"`.

- [ ] **Step 3: Escribir la implementación**

Crear `src/lib/lugar.ts`:

```ts
import { useEffect } from 'react'
import type { NavTarget } from '../views/types'

/* ============================================================================
   DÓNDE ESTÁ PARADA LA PERSONA, para que el feedback lo pueda anclar.

   El shell no tiene URL routing profundo —la navegación es estado—, así que "en qué pantalla estaba"
   no se puede leer de ningún lado: hay que publicarlo. Cada pantalla o modal que muestra UNA entidad
   publica su lugar mientras está montado, y el feedback lee el tope al abrirse.

   ES UNA PILA Y NO UN CONTEXT porque un modal se monta ENCIMA de la vista que lo abrió y las dos
   cosas son ciertas a la vez: manda el de más arriba. Además, el único lector lee una vez (en el
   handler que abre el modal), así que un Context re-renderizaría a media app por un dato que nadie
   está mirando. Mismo patrón que la pila de `Modal.tsx` para decidir quién atiende la tecla Escape.

   EL TARGET SE HEREDA hacia abajo: un modal sin entidad propia —el wizard de Recepción, que todavía
   no creó nada— no debe BORRAR el salto que ya tenía la pantalla de atrás. Hereda el primero que
   encuentre bajando, y así abrir una ventana nunca empeora lo que se guarda.
   ============================================================================ */

export interface Lugar {
  /** Texto legible, sin el módulo ni el submódulo (los pone el shell): "Juan Pérez · 4022001". */
  label: string
  /** Cómo volver acá. Es el mismo tipo que ya usa la navegación del shell. */
  target?: NavTarget
}

/** La entrada es un objeto propio: así se saca la que corresponde aunque el orden de limpieza no
 *  sea el de publicación (React no lo garantiza entre hermanos, y StrictMode monta dos veces). */
interface Entrada { lugar: Lugar }

const pila: Entrada[] = []

/** Publica un lugar y devuelve la función que lo saca. Es la pieza que testea la suite; `useLugar`
 *  es su cáscara para componentes. */
export function empujarLugar(lugar: Lugar): () => void {
  const yo: Entrada = { lugar }
  pila.push(yo)
  return () => {
    const i = pila.indexOf(yo)
    if (i >= 0) pila.splice(i, 1)
  }
}

/**
 * Publica un lugar mientras el componente esté montado. `null` = este componente no aporta lugar
 * (p. ej. todavía está cargando y no sabe de quién es la ficha).
 *
 * Las dependencias son el CONTENIDO y no el objeto: quien lo usa arma el literal en el render, así
 * que la identidad cambia siempre y el efecto se re-suscribiría en cada tecla que se toca.
 */
export function useLugar(lugar: Lugar | null): void {
  const label = lugar?.label ?? ''
  const target = lugar?.target ? JSON.stringify(lugar.target) : ''
  useEffect(() => {
    if (!label) return
    return empujarLugar({ label, target: target ? (JSON.parse(target) as NavTarget) : undefined })
  }, [label, target])
}

/** El tope de la pila, con el target heredado del más cercano que tenga uno. `null` si nadie
 *  publicó. NO es reactivo a propósito: se llama en el handler que abre el feedback. */
export function lugarActual(): Lugar | null {
  if (pila.length === 0) return null
  const label = pila[pila.length - 1].lugar.label
  for (let i = pila.length - 1; i >= 0; i--) {
    const target = pila[i].lugar.target
    if (target) return { label, target }
  }
  return { label }
}

/**
 * El texto y el objetivo que se guardan con el feedback.
 *
 * El lugar publicado GANA sobre las migas del encabezado: es más preciso y lo puso quien sabe qué
 * está mostrando. Las migas son el fallback de las pantallas que no se cablearon — dan el texto,
 * no el salto, que es exactamente lo que se podía hacer antes de esta feature.
 */
export function armarLugar(args: {
  moduleName: string
  moduleKey: string
  subName: string
  subKey: string
  /** Los labels de `ViewHeader.crumbs` de la vista activa. */
  crumbs: string[]
  /** `lugarActual()`. */
  lugar: Lugar | null
}): { label: string; target: Record<string, unknown> | null } {
  const { moduleName, moduleKey, subName, subKey, crumbs, lugar } = args
  const cola = lugar ? [lugar.label] : crumbs
  const label = [moduleName, subName, ...cola].filter((p) => p.trim() !== '').join(' › ')
  const target = lugar?.target ? { moduleKey, subKey, ...lugar.target } : null
  return { label, target }
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Correr: `npx vitest run src/lib/lugar.test.ts`
Esperado: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/lugar.ts src/lib/lugar.test.ts
git commit -m "feat(feedback): la pila de lugares y el armado de lo que se guarda"
```

---

### Task 2: La migración

**Files:**
- Create: `supabase/migrations/NNNN_feedback_lugar.sql`
- Modify: `supabase/README.md` (el índice, al final de la tabla)

**Interfaces:**
- Produces: las columnas `feedback.place_label`, `feedback.place_target`, `feedback.seen_at`,
  `feedback.seen_by` y el RPC `submit_feedback(text, text, text, text, text, text, jsonb)`.

- [ ] **Step 1: Elegir el número**

Correr: `ls supabase/migrations | tail -3`
La última del repo es la `0128` y la `0129` está reservada para la guarda de Recepción. Tomar el
**siguiente número libre** (probablemente `0130`) y usarlo en el nombre del archivo. No renumerar ni
editar ninguna existente.

- [ ] **Step 2: Escribir la migración**

Crear `supabase/migrations/NNNN_feedback_lugar.sql` (con NNNN reemplazado por el número del paso 1):

```sql
-- NNNN · Feedback: dónde estaba parada la persona que reporta
--
-- El feedback ya guardaba módulo, ruta y versión (0044). Faltaba el detalle fino: qué paciente, qué
-- visita, qué paso del wizard estaba mirando quien reportó. Sin eso, quien supervisa no sabe en qué
-- punto se detectó el problema.
--
-- ADITIVA y compatible hacia atrás: el front desplegado sigue llamando con cinco argumentos, que es
-- lo que garantizan los defaults. Va ANTES del front nuevo.

-- 1 · Columnas -----------------------------------------------------------------
alter table public.feedback
  add column if not exists place_label  text,
  add column if not exists place_target jsonb,
  add column if not exists seen_at      timestamptz,
  add column if not exists seen_by      uuid references public.users(id);

comment on column public.feedback.place_label is 'Migaja legible del lugar al enviar: "Coordinación > Estudios y pacientes > Juan Pérez · 4022001". Null en el feedback anterior a esta migración.';
comment on column public.feedback.place_target is 'NavTarget + moduleKey/subKey para volver a ese lugar desde la bandeja. Lo consume la app para navegar, no el SQL para filtrar. Null cuando la pantalla no publicó entidad.';
comment on column public.feedback.seen_at is 'Cuándo lo marcó como visto quien supervisa. Se usa desde la entrega 2 (bandeja en Ajustes); la columna entra acá para no pedir una segunda ida al dashboard por dos campos que duermen.';
comment on column public.feedback.seen_by is 'Quién lo marcó como visto. Ver seen_at.';

-- 2 · RPC de envío -------------------------------------------------------------
-- Suma dos parámetros, así que CAMBIA LA FIRMA: sin el drop, `create or replace` deja viva la
-- versión de cinco y la llamada con argumentos nombrados se vuelve ambigua (la misma razón por la
-- que la 0128 borró la firma vieja de create_reception antes de recrearla).
drop function if exists public.submit_feedback(text, text, text, text, text);

create or replace function public.submit_feedback(
  p_type text, p_message text, p_module text default null,
  p_version text default null, p_route text default null,
  p_place_label text default null, p_place_target jsonb default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Tu sesión venció.' using errcode = '28000';
  end if;
  if lower(coalesce(p_type, '')) not in ('sugerencia', 'problema', 'idea') then
    raise exception 'Tipo de feedback inválido.' using errcode = '22023';
  end if;
  if btrim(coalesce(p_message, '')) = '' then
    raise exception 'El mensaje está vacío.' using errcode = '23502';
  end if;
  -- anti-flooding: una guarda simple por usuario (no hace falta infra).
  if exists (select 1 from public.feedback where user_id = v_uid and created_at > now() - interval '10 seconds') then
    raise exception 'Esperá unos segundos antes de enviar otro feedback.' using errcode = 'P0001';
  end if;
  insert into public.feedback (user_id, type, message, module, app_version, route, place_label, place_target)
  values (v_uid, lower(p_type), btrim(p_message), p_module, p_version, p_route,
          nullif(btrim(coalesce(p_place_label, '')), ''), p_place_target);
end;
$$;

comment on function public.submit_feedback is 'Envía feedback del usuario actual (actor server-side vía auth.uid()). Rate-limit 10s. SECURITY DEFINER. 0044; el lugar se suma en esta migración.';

grant execute on function
  public.submit_feedback(text, text, text, text, text, text, jsonb)
  to authenticated;
```

- [ ] **Step 3: Contar los marcadores de dollar-quote**

Correr:

```bash
node -e "const s=require('fs').readFileSync(process.argv[1],'utf8');const n=(s.match(/\$\$/g)||[]).length;console.log('marcadores:',n, n%2===0?'OK (par)':'IMPAR — el editor de Supabase va a partir la función')" supabase/migrations/NNNN_feedback_lugar.sql
```

Esperado: `marcadores: 2 OK (par)`.

- [ ] **Step 4: Probar el SQL con PGlite**

Levantar un Postgres de juguete y correr la migración contra un esquema mínimo (tabla `feedback` de
la 0044 + un `auth.uid()` de mentira), como se hizo con la 0128:

```bash
npx --yes @electric-sql/pglite@latest --version
```

Si PGlite no está disponible sin red, saltear este paso y decirlo en el reporte de la tarea — no
inventar una verificación que no se hizo.

- [ ] **Step 5: Anotar la migración en el índice**

En `supabase/README.md`, agregar el renglón al final de la tabla de migraciones, con el mismo formato
que los anteriores y **sin** marca de aplicada (la aplica el Director):

```markdown
| NNNN | `feedback_lugar.sql` — **Feedback con lugar: dónde estaba parada la persona que reporta** (`docs/superpowers/specs/2026-09-17-feedback-con-lugar-design.md`). ADITIVA: va **antes** del front. `feedback.place_label` (migaja legible), `feedback.place_target` (jsonb con el NavTarget + módulo/submódulo), `feedback.seen_at` / `feedback.seen_by` (los usa la entrega 2). `submit_feedback` suma `p_place_label` y `p_place_target` con default null: se borra antes la firma de cinco para no dejar sobrecarga, y el front desplegado sigue andando. |
```

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/NNNN_feedback_lugar.sql supabase/README.md
git commit -m "db(feedback): NNNN — el feedback guarda desde dónde se reportó"
```

- [ ] **Step 7: Pasarle el SQL al Director**

Decirle en el chat que la migración está lista, que es **aditiva** y que por eso va **antes** del
deploy del front. Apenas confirme «aplicada», anotar **Aplicada en prod (fecha)** en el índice de
`supabase/README.md` (lo vigila `scripts/check-migraciones.mjs`).

---

### Task 3: La capa de datos manda el lugar

**Files:**
- Modify: `src/data/feedback.ts`

**Interfaces:**
- Consumes: el RPC de la Task 2.
- Produces: `FeedbackInput` con dos campos más — `placeLabel: string` y
  `placeTarget: Record<string, unknown> | null`.

- [ ] **Step 1: Ampliar el input y la llamada**

En `src/data/feedback.ts`, dejar la interfaz así (los tres campos de arriba ya existen):

```ts
/** Payload del envío. El contexto (módulo/versión/ruta/lugar) se autoadjunta; el actor lo fija el server. */
export interface FeedbackInput {
  type: FeedbackType
  message: string
  /** mod.key del módulo activo. */
  module: string
  /** __APP_VERSION__ del cliente. */
  version: string
  /** "<mod>/<sub>" (el shell no tiene URL routing). */
  route: string
  /** Dónde estaba parada la persona, en palabras: "Coordinación › Estudios y pacientes › Juan Pérez". */
  placeLabel: string
  /** Cómo volver a ese lugar (NavTarget + módulo/submódulo), o null si la pantalla no publicó entidad. */
  placeTarget: Record<string, unknown> | null
}
```

Y en `submitFeedback`, sumar los dos parámetros al `rpc`:

```ts
  const { error } = await supabase.rpc('submit_feedback', {
    p_type: input.type,
    p_message: input.message,
    p_module: input.module,
    p_version: input.version,
    p_route: input.route,
    p_place_label: input.placeLabel,
    p_place_target: input.placeTarget,
  })
```

- [ ] **Step 2: Verificar que el typecheck marca a los llamadores**

Correr: `npm run typecheck`
Esperado: FALLA en `src/shell/FeedbackModal.tsx` — faltan `placeLabel` y `placeTarget`. Es la señal
de que el campo es obligatorio y nadie lo puede olvidar; se arregla en la Task 4.

- [ ] **Step 3: No commitear todavía**

Esta tarea deja el árbol sin compilar a propósito; se commitea junto con la Task 4.

---

### Task 4: El shell arma el lugar y el modal lo muestra

**Files:**
- Modify: `src/shell/AppShell.tsx`
- Modify: `src/shell/FeedbackModal.tsx`

**Interfaces:**
- Consumes: `armarLugar` y `lugarActual` (Task 1); `FeedbackInput` (Task 3).
- Produces: `FeedbackModalProps` con `placeLabel: string` y `placeTarget: Record<string, unknown> | null`
  en lugar de `moduleFull` (que pasa a estar adentro de `placeLabel`).

- [ ] **Step 1: Armar el lugar en el shell**

En `src/shell/AppShell.tsx`, importar:

```ts
import { armarLugar, lugarActual } from '../lib/lugar'
```

Y donde hoy se monta el modal (busca `{feedbackOpen && (`), reemplazar el bloque por:

```tsx
      {/* Modal "Dar feedback" (se abre desde el popover Acerca de del rail, o con el atajo).
          EL LUGAR SE CALCULA ACÁ Y UNA SOLA VEZ, al abrir: `lugarActual()` lee una pila que no es
          estado de React, así que leerla en el render daría un valor distinto según cuándo le toque
          re-renderizar al shell. Acá, en cambio, se congela lo que había cuando la persona pidió
          reportar, que es exactamente el momento que interesa. */}
      {feedbackOpen && (
        <FeedbackModal
          moduleKey={moduleKey}
          subKey={sub.key}
          {...armarLugar({
            moduleName: mod.full,
            moduleKey,
            subName: sub.name,
            subKey: sub.key,
            crumbs: (viewHeader?.crumbs ?? []).map((c) => c.label),
            lugar: lugarActual(),
          })}
          accent={accent}
          accentSolid={mod.accentSolid}
          onClose={() => setFeedbackOpen(false)}
        />
      )}
```

Nota: `armarLugar` devuelve `{ label, target }`, así que el spread pasa props llamadas `label` y
`target`. Renombrarlas en el modal sería más ruido; **el modal las recibe con esos nombres** (ver el
paso siguiente).

- [ ] **Step 2: Recibirlas en el modal y mostrarlas**

En `src/shell/FeedbackModal.tsx`, cambiar las props:

```tsx
interface FeedbackModalProps {
  moduleKey: string
  subKey: string
  /** El lugar en palabras, ya armado por el shell: "Coordinación › Estudios y pacientes › Juan Pérez". */
  label: string
  /** Cómo volver a ese lugar, o null si la pantalla no publicó ninguna entidad. */
  target: Record<string, unknown> | null
  accent: string
  accentSolid: string
  onClose: () => void
}

export function FeedbackModal({ moduleKey, subKey, label, target, accent, accentSolid, onClose }: FeedbackModalProps) {
```

En `send()`, mandar el lugar:

```tsx
    const res = await submitFeedback({
      type, message: msg.trim(), module: moduleKey, version: __APP_VERSION__, route: `${moduleKey}/${subKey}`,
      placeLabel: label, placeTarget: target,
    })
```

Y en la caja de contexto, reemplazar el `<span>` por:

```tsx
            <span style={{ fontSize: 12.5, color: 'var(--spira-muted)', lineHeight: 1.4 }}>
              {/* SE MUESTRA EL LUGAR COMPLETO, y no sólo el módulo como hasta ahora: lo que se
                  adjunta se muestra, que es la misma regla que el resto de la app. Y de paso quien
                  reporta ve si el lugar es el que quería —si venía de otra pantalla, lo puede
                  aclarar en el mensaje. */}
              Se adjunta automáticamente: <b style={{ color: 'var(--spira-ink)' }}>{label}</b> · v{__APP_VERSION__} · {userName}
            </span>
```

- [ ] **Step 3: Verificar que compila**

Correr: `npm run typecheck`
Esperado: sin errores.

- [ ] **Step 4: Verificar en el navegador**

Levantar el preview (`preview_start` con `spira-dev`, puerto 5250) y, con la sesión del Director ya
abierta o en el harness, abrir «Dar feedback» desde el popover *Acerca de* en dos pantallas
distintas. Leer la caja de contexto con `read_page` o `javascript_tool`.
Esperado: en el Resumen dice `Spira Coordinación › Resumen`; en la ficha de un paciente, el nombre
del paciente al final (sale por el fallback de migas hasta que se haga la Task 6).

- [ ] **Step 5: Commit**

```bash
git add src/data/feedback.ts src/shell/AppShell.tsx src/shell/FeedbackModal.tsx
git commit -m "feat(feedback): el envío viaja con el lugar y el modal lo muestra"
```

---

### Task 5: El atajo de teclado y su tecla a la vista

**Files:**
- Create: `src/lib/teclas.ts`
- Modify: `src/shell/AppShell.tsx`
- Modify: `src/shell/AboutMenu.tsx`
- Modify: `src/styles/tokens.css`

**Interfaces:**
- Produces: `KBD_BUSCADOR` y `KBD_FEEDBACK` (`src/lib/teclas.ts`), la clase CSS `.spira-kbd`.

- [ ] **Step 1: Sacar la detección de plataforma a su propio archivo**

Crear `src/lib/teclas.ts`:

```ts
/* Cómo se escriben los atajos en pantalla. Vivía adentro de `AppShell` cuando el buscador era el
   único; con el segundo, copiarlo era garantizar que un día digan cosas distintas. */
const ES_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/i.test(navigator.platform || '')

/** Buscador global (Ctrl/⌘ + K). */
export const KBD_BUSCADOR = ES_MAC ? '⌘ K' : 'Ctrl K'

/** Dar feedback (Ctrl/⌘ + Shift + F). */
export const KBD_FEEDBACK = ES_MAC ? '⌘ ⇧ F' : 'Ctrl ⇧ F'
```

En `src/shell/AppShell.tsx`, borrar la constante `KBD` (línea 21) y usar el import:

```ts
import { KBD_BUSCADOR } from '../lib/teclas'
```

y en el trigger del buscador, `{KBD_BUSCADOR}` en lugar de `{KBD}`.

- [ ] **Step 2: Registrar el atajo**

En `src/shell/AppShell.tsx`, junto al efecto del `Ctrl+K`, agregar:

```tsx
  /* Ctrl/⌘ + Shift + F abre «Dar feedback». A DIFERENCIA DEL BUSCADOR, este atajo SÍ funciona con un
     modal abierto, y es el punto de la feature: los problemas se ven adentro del detalle de una
     visita o del wizard de Recepción, y hasta ahora había que cerrarlos para poder reportar —con lo
     que el lugar que se guardaba ya no era donde se vio el problema—. Es seguro porque `Modal.tsx`
     apila: el de abajo no se desmonta y su formulario a medio llenar sigue ahí al cerrar el feedback.
     Si el feedback ya está abierto no hace nada: cerrarlo con el mismo atajo tiraría lo escrito. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === 'f' || e.key === 'F')) {
        e.preventDefault()
        setFeedbackOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
```

- [ ] **Step 3: Generalizar la clase de la tecla**

En `src/styles/tokens.css`, la regla de la tecla está anidada bajo `.spira-search-trigger` y por eso
no sirve afuera. Reemplazar las dos reglas por una clase propia, dejando el ocultamiento responsive
donde estaba:

```css
/* Tecla de un atajo, en el molde de un `<kbd>`. Nació adentro del buscador; desde que hay dos
   atajos a la vista (el buscador y «Dar feedback») vive suelta, para que los dos se vean igual. */
.spira-kbd {
  font-size: 11.5px; font-weight: 600; color: var(--spira-muted);
  background: var(--spira-white); border: 1px solid var(--spira-line);
  border-radius: 6px; padding: 2px 7px;
}
```

y dentro del `@media (max-width: 980px)` existente, cambiar
`.spira-search-trigger .spira-search-kbd { display: none; }` por
`.spira-search-trigger .spira-kbd { display: none; }`.

En `src/shell/AppShell.tsx`, el `<span className="spira-search-kbd">` del trigger pasa a
`<span className="spira-kbd">`.

- [ ] **Step 4: Mostrar la tecla junto a «Dar feedback»**

En `src/shell/AboutMenu.tsx`, importar `KBD_FEEDBACK` desde `../lib/teclas` y dejar el botón del pie
así:

```tsx
            {/* La tecla no es adorno: es la única forma de descubrir que se puede reportar SIN
                cerrar lo que estás mirando, que es donde más problemas se ven. */}
            <button type="button" onClick={feedback} style={feedbackBtn}>
              <Icon name="message" size={16} color={accent} /> Dar feedback
              <span className="spira-kbd" style={{ marginLeft: 'auto' }}>{KBD_FEEDBACK}</span>
            </button>
```

y en `feedbackBtn`, cambiar `justifyContent: 'center'` por `justifyContent: 'flex-start'` y sumar
`padding: '0 11px'`, para que el texto no quede descentrado cuando la tecla se lleva su ancho.

- [ ] **Step 5: Verificar en el navegador**

Con el preview abierto y **un modal cualquiera abierto** (p. ej. el detalle de una visita), disparar
el atajo:

```js
document.dispatchEvent(new KeyboardEvent('keydown', { key: 'F', ctrlKey: true, shiftKey: true, bubbles: true }))
```

Esperado: aparece el modal de feedback **encima**, y al cerrarlo el de abajo sigue abierto y con lo
que tuviera escrito. Verificarlo con `read_page` (dos `[aria-modal="true"]` mientras está abierto).

- [ ] **Step 6: Commit**

```bash
git add src/lib/teclas.ts src/shell/AppShell.tsx src/shell/AboutMenu.tsx src/styles/tokens.css
git commit -m "feat(feedback): atajo Ctrl/Cmd+Shift+F, que funciona con un modal abierto"
```

---

### Task 6: Las dos pantallas que publican su lugar

**Files:**
- Modify: `src/views/PatientFichaView.tsx`
- Modify: `src/views/ProtocolDetailView.tsx`

**Interfaces:**
- Consumes: `useLugar` (Task 1).

- [ ] **Step 1: La ficha del paciente**

En `src/views/PatientFichaView.tsx`, importar `useLugar` de `../lib/lugar` y agregarlo junto a los
demás hooks del componente (después de que `patient`, `protocol` e `ivrs` estén resueltos):

```tsx
  /* Para el feedback: quien reporta desde acá está mirando a ESTE paciente en ESTE estudio, y el
     supervisor va a querer abrir exactamente eso. El `protocolId` va junto al paciente porque la
     misma persona puede estar en dos estudios (0127). */
  useLugar({
    label: `${patient.full_name}${ivrs ? ` · ${ivrs}` : ''}`,
    target: { patientId: patient.id, protocolId: protocol.id },
  })
```

- [ ] **Step 2: El detalle del protocolo**

En `src/views/ProtocolDetailView.tsx`, importar `useLugar` de `../lib/lugar` y agregarlo después de
`rightTab`:

```tsx
  /* Para el feedback: acá se está mirando el tablero de UN estudio, y la pestaña importa —«Reportes
     pendientes» y «Pacientes» son dos pantallas distintas para quien reporta. */
  useLugar({
    label: `${protocol.code}${rightTab === 'reportes' ? ' · Reportes pendientes' : ''}`,
    target: { protocolId: protocol.id, protocolTab: rightTab },
  })
```

- [ ] **Step 3: Verificar en el navegador**

Abrir la ficha de un paciente, disparar el atajo y leer la caja de contexto.
Esperado: `Spira Coordinación › Estudios y pacientes › <nombre> · <IVRS>`.

- [ ] **Step 4: Commit**

```bash
git add src/views/PatientFichaView.tsx src/views/ProtocolDetailView.tsx
git commit -m "feat(feedback): la ficha y el tablero del estudio publican su lugar"
```

---

### Task 7: Los dos modales que publican su lugar

**Files:**
- Modify: `src/views/track/VisitDetail.tsx`
- Modify: `src/views/pharma/ReceptionWizard.tsx`

**Interfaces:**
- Consumes: `useLugar` (Task 1); `visitShortLabel` de `src/lib/visits.ts` (ya existe).

- [ ] **Step 1: El detalle de la visita**

En `src/views/track/VisitDetail.tsx`, importar `useLugar` de `../../lib/lugar` y agregarlo después de
la línea donde se resuelve `visit` (hoy la 95):

```tsx
  /* Para el feedback: es el modal donde más se trabaja, y donde un problema se ve mientras se
     registra la visita. `null` mientras carga: sin datos, el lugar de abajo —la lista o la ficha que
     lo abrió— dice más que un "Visita" pelado. */
  useLugar(visit ? {
    label: `${visitShortLabel(visit)} · ${visit.patient_name}`,
    target: { visitId: visit.id, visitDate: visit.estimated_date ?? visit.real_date ?? undefined },
  } : null)
```

Si `visitShortLabel` no está importado en el archivo, sumarlo al import existente de `../../lib/visits`.

- [ ] **Step 2: El wizard de Recepción**

En `src/views/pharma/ReceptionWizard.tsx`, importar `useLugar` de `../../lib/lugar` y agregarlo
después de `step`:

```tsx
  /* Para el feedback: sin `target` a propósito —todavía no hay recepción creada—, así que el salto lo
     hereda de la pantalla de atrás. El paso importa: «no me deja avanzar» en el paso 2 y en el 4 son
     dos problemas distintos. */
  useLugar({ label: `Recepción · paso ${step + 1} de 4` })
```

- [ ] **Step 3: Verificar en el navegador**

Abrir el detalle de una visita, disparar el atajo con el modal abierto y leer la caja de contexto.
Esperado: `Spira Coordinación › Visitas › V8 · <nombre del paciente>`.

- [ ] **Step 4: Commit**

```bash
git add src/views/track/VisitDetail.tsx src/views/pharma/ReceptionWizard.tsx
git commit -m "feat(feedback): el detalle de visita y el wizard de Recepción publican su lugar"
```

---

### Task 8: El gate y la PR

**Files:** ninguno nuevo.

- [ ] **Step 1: Correr el gate completo**

Correr: `npm run build`
Esperado: typecheck limpio, todos los tests en verde (los de `lugar.test.ts` incluidos) y el build
terminado.

- [ ] **Step 2: Probar el envío de punta a punta**

Con la migración **ya aplicada en prod** (Task 2, paso 7), mandar un feedback de prueba desde una
ficha de paciente y verificar en Supabase que `place_label` y `place_target` llegaron completos.
Si la migración todavía no está aplicada, **no** dar la tarea por terminada: el envío va a fallar con
el mensaje de «revisá el tipo y el mensaje», que es lo que traduce un error de firma.

- [ ] **Step 3: Abrir la PR**

Con el formato de la casa (API REST de GitHub + `git credential fill`, no hay `gh`). En el cuerpo:
qué entrega es, qué quedó para la entrega 2, y que la migración va **antes** del deploy.

- [ ] **Step 4: Avisar en el chat**

Decir explícitamente que esta es la **entrega 1 de 2** y que la bandeja en Ajustes —leer, filtrar,
marcar como visto, saltar al lugar— es la entrega 2, que se planifica aparte.
