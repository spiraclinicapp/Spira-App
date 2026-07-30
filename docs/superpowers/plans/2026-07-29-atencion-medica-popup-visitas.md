# Popup "Atención médica" desde Visitas — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que al pulsar "Quiere médico" / "En cola" en una fila de Visitas del día se abra un popup que pida el motivo (editable) y muestre el hilo completo de comentarios, reutilizando los componentes del modal de visita.

**Architecture:** Se extraen a archivos propios el catálogo `MOTIVOS`, el contenedor `Panel` y el panel `DoctorRequest` (hoy locales en `VisitDetail.tsx`); el modal y el popup nuevo (`DoctorRequestModal`) usan el mismo `DoctorRequest`. El popup compone `Modal` + `DoctorRequest` (modo `bare`/`startExpanded`) + `CommentThread`, todo atado al mismo `visit_id`.

**Tech Stack:** React 18 + TypeScript strict + Vite; Supabase (RPCs ya existentes); CSS por variables en `tokens.css` (sin Tailwind); íconos vía `components/Icon.tsx`.

## Global Constraints

- **Sin suite de tests** (regla del proyecto): el gate de cada tarea es `npm run typecheck` verde (+ `npm run build` en las tareas con UcI) y verificación en el navegador logueado. NO se escriben tests unitarios.
- **Sin migración**: toda la data y los RPCs ya existen en prod (`markWantsDoctor`/`toggleWantsDoctor` = 0047; `visit_comments`/`add_visit_comment` = 0048). No se toca `supabase/`.
- **Working copy compartido**: stagear SIEMPRE por ruta (`git add <archivos>`), nunca `git add -A`/`.`. Verificar la rama antes de cada commit (hook `branch-guard` bloquea `main`). Rama de trabajo: `feat/atencion-medica-popup-visitas`.
- **⚠️ Coordinación**: `src/views/track/DayVisitRowItem.tsx` y `src/views/track/VisitStepper.tsx` tienen cambios sin commitear del Director en el working copy. Antes de la Tarea 3, `git fetch` y rebasar/coordinar sobre `origin/main` fresco; al stagear en la Tarea 3, incluir SOLO los archivos de esta feature.
- **Idioma**: comentarios, nombres de dominio y copy de UI en castellano rioplatense; igualar la densidad de comentarios del código existente.
- **Estilo**: TypeScript strict (sin `any`, sin imports sin usar); color/espaciado por tokens; íconos vía `Icon`/`IconName`.

## File Structure

- `src/views/track/doctorMotivos.ts` — **nuevo**. Única fuente de verdad del catálogo `MOTIVOS`.
- `src/views/track/Panel.tsx` — **nuevo**. Card titulada con ícono (extraída de `VisitDetail`).
- `src/views/track/DoctorRequest.tsx` — **nuevo**. Panel de atención médica (extraído de `VisitDetail`) + motivo editable + `MotivoPicker` + props `startExpanded`/`bare`.
- `src/views/track/DoctorRequestModal.tsx` — **nuevo**. El popup: `Modal` + `DoctorRequest` + `CommentThread`.
- `src/views/track/VisitDetail.tsx` — **modificado**. Deja de declarar `MOTIVOS`/`Panel`/`DoctorRequest` inline; los importa.
- `src/views/track/DayVisitRowItem.tsx` — **modificado**. `onToggleDoctor` → `onOpenDoctor`.
- `src/views/DayVisitsView.tsx` — **modificado**. Estado `doctorFor` + render del popup; se retira `toggleDoctor`.

---

### Task 1: Extraer `MOTIVOS` y `Panel`

**Files:**
- Create: `src/views/track/doctorMotivos.ts`
- Create: `src/views/track/Panel.tsx`
- Modify: `src/views/track/VisitDetail.tsx` (quitar `MOTIVOS` inline línea ~20; quitar `Panel` inline líneas ~209-220; quitar `import type { IconName }` línea 4; agregar imports)

**Interfaces:**
- Produces: `export const MOTIVOS` (readonly tuple de 5 strings); `export function Panel({ title: string; icon: IconName; accent: string; children: ReactNode })`.

- [ ] **Step 1: Crear `doctorMotivos.ts`**

```ts
/** Motivos de derivación al médico (chips). Catálogo acotado a propósito para poder reportarlo
 *  (migración 0047). Fuente de verdad ÚNICA: la usan VisitDetail, DoctorRequest y —para el tono—
 *  MotivoChip. */
export const MOTIVOS = ['Evento adverso', 'Síntomas reportados', 'Laboratorio fuera de rango', 'Consulta clínica', 'Otro'] as const
```

- [ ] **Step 2: Crear `Panel.tsx`** (mismo markup que el `Panel` local de `VisitDetail`)

```tsx
import type { ReactNode } from 'react'
import { Icon } from '../../components/Icon'
import type { IconName } from '../../components/Icon'

/** Card con título e ícono, para las secciones del detalle de visita y del popup de atención médica. */
export function Panel({ title, icon, accent, children }: { title: string; icon: IconName; accent: string; children: ReactNode }) {
  return (
    <div style={{ border: '1px solid var(--spira-line)', borderRadius: 14, background: 'var(--spira-surface)', padding: '14px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <Icon name={icon} size={15} color={accent} />
        <span style={{ fontFamily: 'var(--spira-font-display)', fontWeight: 700, fontSize: 14 }}>{title}</span>
      </div>
      {children}
    </div>
  )
}
```

- [ ] **Step 3: Editar `VisitDetail.tsx`**
  - Borrar la línea 4 `import type { IconName } from '../../components/Icon'` (se va con `Panel`; ya no se usa en este archivo).
  - Borrar la línea ~20 `const MOTIVOS = [...] as const`.
  - Borrar la función `Panel` local (líneas ~209-220).
  - Agregar, junto a los demás imports de `./`:

```tsx
import { Panel } from './Panel'
import { MOTIVOS } from './doctorMotivos'
```

  > Nota: `DoctorRequest` sigue local en este archivo por ahora (usa el `Panel` y `MOTIVOS` ahora importados). `ReactNode` sigue importado (lo usan `row`/`ageOf`/`VisitDates`).

- [ ] **Step 4: Verificar typecheck**

Run: `npm run typecheck`
Expected: sin errores (en particular, ningún "declared but never used" por `IconName` o `MOTIVOS`).

- [ ] **Step 5: Commit**

```bash
git add src/views/track/doctorMotivos.ts src/views/track/Panel.tsx src/views/track/VisitDetail.tsx
git commit -m "refactor(track): extraer MOTIVOS y Panel de VisitDetail a archivos propios"
```

---

### Task 2: Extraer y extender `DoctorRequest` (motivo editable)

**Files:**
- Create: `src/views/track/DoctorRequest.tsx`
- Modify: `src/views/track/VisitDetail.tsx` (quitar `DoctorRequest` inline líneas ~222-320; quitar el import `MOTIVOS` agregado en la Tarea 1; agregar `import { DoctorRequest } from './DoctorRequest'`)

**Interfaces:**
- Consumes: `Panel` (de `./Panel`), `MOTIVOS` (de `./doctorMotivos`), `DayVisitRow` (de `../../data/dayVisits`).
- Produces: `export function DoctorRequest({ visit: DayVisitRow; accent: string; readOnly: boolean; busy: boolean; onMark: (motivo: string) => void; onUnmark: () => void; startExpanded?: boolean; bare?: boolean })`. `startExpanded` abre el picker de una; `bare` omite el `Panel` (el Modal ya pone el título). El uso existente en `VisitDetail` (`<DoctorRequest visit accent readOnly busy onMark onUnmark />`) queda idéntico: ambos flags por default `false` ⇒ el modal no cambia salvo el motivo editable.

- [ ] **Step 1: Crear `DoctorRequest.tsx`**

```tsx
import { useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { Icon } from '../../components/Icon'
import { Panel } from './Panel'
import { MOTIVOS } from './doctorMotivos'
import type { DayVisitRow } from '../../data/dayVisits'

/**
 * "Atención médica" de una visita. Estados: (1) visto por el médico → solo lectura; (2) en cola →
 * motivo + editar motivo + quitar; (3) sin marcar → picker de motivo. En `readOnly` (ficha del
 * paciente) solo muestra el estado, sin acciones.
 *
 * Reusado por el panel del modal de visita (`VisitDetail`) y por el popup de Visitas del día
 * (`DoctorRequestModal`): `startExpanded` abre el picker de una (el popup); `bare` omite el
 * contenedor `Panel` cuando el título ya lo pone el Modal (el popup).
 */
export function DoctorRequest({ visit, accent, readOnly, busy, onMark, onUnmark, startExpanded = false, bare = false }: {
  visit: DayVisitRow
  accent: string
  readOnly: boolean
  busy: boolean
  onMark: (motivo: string) => void
  onUnmark: () => void
  startExpanded?: boolean
  bare?: boolean
}) {
  const [open, setOpen] = useState(startExpanded)
  const [editing, setEditing] = useState(false)
  const [motivo, setMotivo] = useState<string | null>(null)
  const seen = visit.doctor_seen_at != null
  const marked = visit.wants_doctor

  // En el popup (`bare`) el título lo pone el Modal; en el modal, cada estado va en su Panel.
  const wrap = (title: string, inner: ReactNode): ReactNode =>
    bare ? inner : <Panel title={title} icon="users" accent={accent}>{inner}</Panel>

  if (seen) {
    return wrap('Atención médica', (
      <>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--spira-good)', fontWeight: 600 }}>
          <Icon name="check" size={15} color="var(--spira-good)" /> Visto por el médico
        </div>
        {visit.doctor_motivo && <div style={{ fontSize: 12.5, color: 'var(--spira-muted)', marginTop: 6 }}>Motivo: {visit.doctor_motivo}</div>}
      </>
    ))
  }

  if (marked) {
    return wrap('Atención médica', (
      editing ? (
        <>
          <MotivoPicker accent={accent} value={motivo} onPick={setMotivo} />
          <div style={{ display: 'flex', gap: 9, marginTop: 14 }}>
            <button type="button" onClick={() => setEditing(false)} disabled={busy} style={cancelBtn}>Cancelar</button>
            <button
              type="button"
              onClick={() => { if (motivo && motivo !== visit.doctor_motivo && !busy) { onMark(motivo); setEditing(false) } }}
              disabled={!motivo || motivo === visit.doctor_motivo || busy}
              style={primaryBtn(!!motivo && motivo !== visit.doctor_motivo, accent)}
            >
              <Icon name="check" size={15} color={motivo && motivo !== visit.doctor_motivo ? 'var(--spira-on-accent)' : 'var(--spira-faint)'} />
              {busy ? 'Guardando…' : 'Guardar motivo'}
            </button>
          </div>
        </>
      ) : (
        <>
          <div style={{ fontSize: 13 }}>
            <span style={{ color: 'var(--spira-muted)' }}>Motivo: </span>
            <span style={{ fontWeight: 600 }}>{visit.doctor_motivo || 'sin especificar'}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 8, fontSize: 12.5, color: accent, fontWeight: 600 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: accent }} /> Esperando médico
          </div>
          {!readOnly && (
            <div style={{ display: 'flex', gap: 9, marginTop: 12 }}>
              <button type="button" onClick={() => { setMotivo(visit.doctor_motivo ?? null); setEditing(true) }} disabled={busy} style={secondaryBtn}>Editar motivo</button>
              <button type="button" onClick={() => { if (!busy) onUnmark() }} disabled={busy} style={secondaryBtn}>Quitar de "Para ver médico"</button>
            </div>
          )}
        </>
      )
    ))
  }

  // Sin marcar. En la ficha del paciente (readOnly) no ofrecemos marcar.
  if (readOnly) return null

  // En el modal, arranca colapsado (botón punteado); en el popup, `startExpanded` lo abre de una.
  if (!open) {
    return (
      <button
        type="button" onClick={() => setOpen(true)}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9, width: '100%', height: 46, borderRadius: 12, border: '1px dashed var(--spira-line-2)', background: 'var(--spira-white)', cursor: 'pointer', fontFamily: 'var(--spira-font-text)', fontWeight: 600, fontSize: 13.5, color: 'var(--spira-ink)' }}
      >
        <Icon name="users" size={16} color={accent} /> Marcar para ver médico
      </button>
    )
  }

  return wrap('Marcar para ver médico', (
    <>
      <MotivoPicker accent={accent} value={motivo} onPick={setMotivo} />
      <div style={{ display: 'flex', gap: 9, marginTop: 14 }}>
        {/* En el popup (bare) el ✕/Escape del Modal es el "cancelar"; no duplicamos botón. */}
        {!bare && (
          <button type="button" onClick={() => { setOpen(false); setMotivo(null) }} disabled={busy} style={cancelBtn}>Cancelar</button>
        )}
        <button
          type="button" onClick={() => { if (motivo && !busy) onMark(motivo) }} disabled={!motivo || busy}
          style={primaryBtn(!!motivo, accent)}
        >
          <Icon name="users" size={15} color={motivo ? 'var(--spira-on-accent)' : 'var(--spira-faint)'} />
          {busy ? 'Marcando…' : 'Marcar para el médico'}
        </button>
      </div>
    </>
  ))
}

/** Chips de motivo (catálogo `MOTIVOS`). DRY: lo usan el estado "sin marcar" y el "editar motivo". */
function MotivoPicker({ accent, value, onPick }: { accent: string; value: string | null; onPick: (m: string) => void }) {
  return (
    <>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--spira-muted)', marginBottom: 8 }}>Motivo</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {MOTIVOS.map((m) => {
          const active = value === m
          return (
            <button
              key={m} type="button" onClick={() => onPick(m)}
              style={{ height: 32, padding: '0 13px', borderRadius: 'var(--spira-radius-pill)', cursor: 'pointer', fontFamily: 'var(--spira-font-text)', fontWeight: 600, fontSize: 12.5, whiteSpace: 'nowrap', border: `1px solid ${active ? accent : 'var(--spira-line-2)'}`, background: active ? accent + '14' : 'var(--spira-white)', color: active ? accent : 'var(--spira-muted)' }}
            >
              {m}
            </button>
          )
        })}
      </div>
    </>
  )
}

const secondaryBtn: CSSProperties = {
  height: 34, padding: '0 12px', borderRadius: 9, border: '1px solid var(--spira-line-2)',
  background: 'var(--spira-white)', color: 'var(--spira-muted)', cursor: 'pointer',
  fontFamily: 'var(--spira-font-text)', fontWeight: 600, fontSize: 12.5,
}
const cancelBtn: CSSProperties = {
  height: 40, padding: '0 16px', borderRadius: 10, border: '1px solid var(--spira-line-2)',
  background: 'var(--spira-white)', color: 'var(--spira-ink)', cursor: 'pointer',
  fontFamily: 'var(--spira-font-text)', fontWeight: 600, fontSize: 13.5,
}
const primaryBtn = (active: boolean, accent: string): CSSProperties => ({
  flex: 1, height: 40, borderRadius: 10, border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
  background: active ? accent : 'var(--spira-line)', color: active ? 'var(--spira-on-accent)' : 'var(--spira-faint)',
  cursor: active ? 'pointer' : 'default', fontFamily: 'var(--spira-font-text)', fontWeight: 700, fontSize: 13.5,
})
```

- [ ] **Step 2: Editar `VisitDetail.tsx`**
  - Borrar la función `DoctorRequest` local (líneas ~222-320).
  - Borrar el `import { MOTIVOS } from './doctorMotivos'` (agregado en la Tarea 1): ya no se usa en este archivo (se fue con `DoctorRequest`).
  - Agregar: `import { DoctorRequest } from './DoctorRequest'`.
  - Dejar la línea de uso EXACTAMENTE igual (línea ~136): `<DoctorRequest visit={visit} accent={accent} readOnly={readOnly} busy={busy} onMark={mark} onUnmark={unmark} />`.

- [ ] **Step 3: Verificar typecheck + build**

Run: `npm run typecheck`
Expected: sin errores (ningún import sin usar: `MOTIVOS` ya no debe estar importado en `VisitDetail`).

Run: `npm run build`
Expected: build OK.

- [ ] **Step 4: Verificar en el navegador (el modal no se rompió + motivo editable)**

Levantar el dev server en el 5250 (`.claude/launch.json` → `spira-dev`) y, logueado, abrir una visita del día ("Abrir"):
  - El panel "Atención médica"/"Marcar para ver médico" se ve igual que antes.
  - Marcar con un motivo → queda "Esperando médico" con el motivo.
  - Aparece **"Editar motivo"** → cambiar el motivo → **"Guardar motivo"** lo actualiza.
  - "Quitar de 'Para ver médico'" desmarca.

- [ ] **Step 5: Commit**

```bash
git add src/views/track/DoctorRequest.tsx src/views/track/VisitDetail.tsx
git commit -m "refactor(track): DoctorRequest a archivo propio + motivo editable en cola"
```

---

### Task 3: Crear `DoctorRequestModal` y cablearlo en Visitas del día

**Files:**
- Create: `src/views/track/DoctorRequestModal.tsx`
- Modify: `src/views/track/DayVisitRowItem.tsx` (prop `onToggleDoctor` → `onOpenDoctor`; onClick del botón)
- Modify: `src/views/DayVisitsView.tsx` (import del popup + `toggleWantsDoctor` fuera; estado `doctorFor`; `renderRow` usa `onOpenDoctor`; render del popup; borrar `toggleDoctor`)

**Interfaces:**
- Consumes: `Modal` (`../../components/Modal`), `Panel` (`./Panel`), `DoctorRequest` (`./DoctorRequest`), `CommentThread` (`./CommentThread`), `useVisit`/`markWantsDoctor`/`toggleWantsDoctor` (`../../data/dayVisits`).
- Produces: `export function DoctorRequestModal({ visitId: string; accent: string; canClinical: boolean; onClose: () => void; onChanged: () => void })`.

- [ ] **Step 1: Coordinar el working copy** (por la ⚠️ de Global Constraints)

Run: `git fetch`
Confirmar la rama: `git branch --show-current` → `feat/atencion-medica-popup-visitas`. Revisar que `DayVisitRowItem.tsx` no tenga cambios ajenos a medio hacer antes de editarlo (`git status`).

- [ ] **Step 2: Crear `DoctorRequestModal.tsx`**

```tsx
import { useState } from 'react'
import type { CSSProperties } from 'react'
import { Modal } from '../../components/Modal'
import { Panel } from './Panel'
import { DoctorRequest } from './DoctorRequest'
import { CommentThread } from './CommentThread'
import { useVisit, markWantsDoctor, toggleWantsDoctor } from '../../data/dayVisits'

/**
 * Popup "Atención médica" que se abre desde el botón de la fila en Visitas del día. Reutiliza el
 * panel de motivo (`DoctorRequest`, en modo `bare` porque el título ya lo pone el Modal) + el hilo
 * completo de comentarios (`CommentThread`), atados al mismo `visit_id` (el mismo hilo del modal de
 * visita). Trae la visita por id con `useVisit` para reflejar el estado en vivo tras marcar/editar/
 * quitar. Al "Quitar de la cola" se cierra.
 */
export function DoctorRequestModal({ visitId, accent, canClinical, onClose, onChanged }: {
  visitId: string
  accent: string
  canClinical: boolean
  onClose: () => void
  onChanged: () => void
}) {
  const q = useVisit(visitId)
  const visit = q.data?.[0] ?? null
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const mark = async (motivo: string) => {
    if (!visit) return
    setBusy(true); setErr(null)
    const res = await markWantsDoctor(visit.id, motivo)
    setBusy(false)
    if (res.error) { setErr(res.error); return }
    onChanged()
    q.refetch()
  }
  const unmark = async () => {
    if (!visit) return
    setBusy(true); setErr(null)
    const res = await toggleWantsDoctor(visit.id, false)
    setBusy(false)
    if (res.error) { setErr(res.error); return }
    onChanged()
    onClose()  // "Quitar de la cola" cierra el popup (decisión de diseño)
  }

  return (
    <Modal title="Atención médica" icon="users" accent={accent} accentSoft={accent + '1F'} maxWidth={520} onClose={onClose}>
      {q.loading && !visit ? (
        <div style={{ padding: '20px 4px', fontSize: 13.5, color: 'var(--spira-muted)' }}>Cargando visita…</div>
      ) : q.error ? (
        <div style={{ padding: '16px 4px', fontSize: 13.5, color: 'var(--spira-danger)' }}>No se pudo cargar la visita: {q.error}</div>
      ) : !visit ? (
        <div style={{ padding: '16px 4px', fontSize: 13.5, color: 'var(--spira-muted)' }}>No se encontró la visita.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {err && <div style={errBox}>{err}</div>}
          <DoctorRequest visit={visit} accent={accent} readOnly={!canClinical} busy={busy} onMark={mark} onUnmark={unmark} startExpanded bare />
          <Panel title="Comentarios" icon="message" accent={accent}>
            <CommentThread visitId={visit.id} accent={accent} onAdded={onChanged} />
          </Panel>
        </div>
      )}
    </Modal>
  )
}

const errBox: CSSProperties = {
  fontSize: 13, color: 'var(--spira-danger)', background: 'rgba(166, 72, 59, 0.10)', borderRadius: 8, padding: '8px 12px',
}
```

- [ ] **Step 3: Editar `DayVisitRowItem.tsx`**
  - En el tipo de props: cambiar `onToggleDoctor: (visit: DayVisitRow) => void` por `onOpenDoctor: (visit: DayVisitRow) => void`.
  - En la desestructuración de props: `onToggleDoctor` → `onOpenDoctor`.
  - Reemplazar el botón de médico (líneas ~111-120) por:

```tsx
{canClinical && stage !== 'por_llegar' && stage !== 'fuera' && !visit.doctor_seen_at && (
  <button
    onClick={() => { if (!busy) onOpenDoctor(visit) }}
    disabled={busy}
    title={visit.wants_doctor ? 'Ver / editar atención médica' : 'Marcar para ver médico'}
    style={auxBtn(visit.wants_doctor)}
  >
    <Icon name="users" size={14} color="currentColor" /> {visit.wants_doctor ? 'En cola' : 'Quiere médico'}
  </button>
)}
```

- [ ] **Step 4: Editar `DayVisitsView.tsx`**
  - En el import de `../data/dayVisits`, **quitar** `toggleWantsDoctor` (queda sin uso). El bloque queda:

```tsx
import {
  useVisitsForDay, markArrived, markAttended, markReady, markLeft,
  markReadyWithOutcome, discontinueEnrollment,
} from '../data/dayVisits'
```

  - Agregar import: `import { DoctorRequestModal } from './track/DoctorRequestModal'`.
  - Agregar estado, junto a `openVisit` (línea ~46): `const [doctorFor, setDoctorFor] = useState<DayVisitRow | null>(null)`.
  - **Borrar** la función `toggleDoctor` completa (líneas ~133-140).
  - En `renderRow` (línea ~172), cambiar `onToggleDoctor={toggleDoctor}` por `onOpenDoctor={(vv) => setDoctorFor(vv)}`.
  - Agregar el render del popup junto a los otros modales (después del bloque `{openVisit && (…)}`, ~línea 309):

```tsx
{doctorFor && (
  <DoctorRequestModal
    visitId={doctorFor.id}
    accent={accent}
    canClinical={canClinical(doctorFor)}
    onClose={() => setDoctorFor(null)}
    onChanged={() => day.refetch()}
  />
)}
```

- [ ] **Step 5: Verificar typecheck + build**

Run: `npm run typecheck`
Expected: sin errores (ni `toggleWantsDoctor` ni `toggleDoctor` sin usar; `onOpenDoctor` bien tipado en ambos lados).

Run: `npm run build`
Expected: build OK.

- [ ] **Step 6: Verificar en el navegador (flujo completo, logueado)**

Dev server en el 5250. En Visitas del día, con un usuario clínico/coordinador del protocolo:
  - Fila con "Quiere médico" → click **abre el popup "Atención médica"** (no togglea directo).
  - Elegir un motivo → "Marcar para el médico" → el popup pasa a estado "en cola"; el botón de la fila dice "En cola" y el filtro "Para ver médico" la incluye (badge/contador sube).
  - Escribir un comentario en el hilo → aparece; abrir el modal de esa visita ("Abrir") → **el mismo comentario está** en el panel Comentarios.
  - Reabrir el popup desde "En cola" → "Editar motivo" cambia el motivo; "Quitar de 'Para ver médico'" **cierra el popup** y saca la visita del filtro.
  - Revisar consola sin errores (si hay stale de HMR, reiniciar el dev server y confirmar con `npm run build`).

- [ ] **Step 7: Commit**

```bash
git add src/views/track/DoctorRequestModal.tsx src/views/track/DayVisitRowItem.tsx src/views/DayVisitsView.tsx
git commit -m "feat(track): popup \"Atención médica\" al derivar al médico desde Visitas"
```

---

## Notas de cierre

- **Sin migración**; nada que aplicar en el dashboard de Supabase.
- Al terminar, seguir la operativa de PR del proyecto (`gh` no está → API REST; el Director mergea). Esta rama sale de `main`, independiente de `fix/login-icono-email-parpadeo`.
- Eco de título: en el popup el `DoctorRequest` va en modo `bare`, así que NO hay doble "Atención médica" (el título lo pone solo el Modal). El hilo de comentarios sí va en su `Panel` "Comentarios".
