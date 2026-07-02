# Rediseño visual de Recepción (re-piel "Sereno") · Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-piel **behavior-preserving** del submódulo Recepción de Pharma según el handoff aprobado (`Mejora visual recepciones/handoff_recepcion_v2/`): paso de escaneo (2a), lista transversal de recepciones (1b) y wizard "Nueva recepción" (1d) — sin cambiar la lógica de negocio.

**Architecture:** La funcionalidad ya existe (v0.9.0 + rama IP mergeada). Este plan solo cambia presentación e IA de la lista: (1) componentes compartidos nuevos `Badge`/`Chip` + helpers de agrupación por día (DRY de estilos hoy duplicados); (2) `RecepcionView` pasa de "ámbito + protocolo como gate" a **lista transversal filtrable** (chips de tipo, búsqueda, agrupación por día, "Más filtros" client-side) con el botón "Nueva recepción" movido al encabezado del shell vía `setHeader` (infra existente, hoy sin consumidores); (3) el wizard adopta el stepper del handoff + **barra de acciones fija abajo**, lo que exige **subir el submit del Paso 3 al wizard** (los `Step3*` quedan presentacionales — único refactor no-puramente-visual, con los guards portados verbatim); (4) ambos pasos de escaneo (base e IP) comparten el buscador central 2a vía `ScanField`. Dos ajustes **aditivos** a la capa de datos: `useReceptions` acepta `tipo=null` (chip "Todas") y embebe `protocol.code` + conteo de `ip_units` (las recepciones IP no tienen `reception_items`).

**Tech Stack:** React 19 + TS strict + Vite + Supabase. Sin react-router/react-query. CSS con variables (tokens "Sereno" en `src/styles/tokens.css`), íconos Lucide embebidos en `components/Icon.tsx`.

## Global Constraints

- **Precondición dura: este plan arranca POST-MERGE de `feat/pharma-ip` a `main`** (decisión lockeada del eng-review). Task 1 verifica el merge antes de tocar nada. La rama de trabajo es nueva, off `main`.
- **Gate de verificación (manda sobre el TDD de la skill):** el repo **no tiene suite de tests** (ver `CLAUDE.md`). El ciclo por tarea es: implementar → **`npm run typecheck` en verde** → commit. La verificación visual/funcional integral es la **Task 10** (checklist en navegador, Director) — el preview corre detrás del login y el Director recorre los flujos [PRESERVAR].
- **Se mantiene Inter** (decisión app-wide): `--spira-font-mono` ya ES Inter + `tabular-nums` vía `.spira-mono`. Donde el handoff pide "mono" (códigos, EAN, lotes, kits) se usa `className="spira-mono"`. Donde pide "display" (números grandes, títulos) se usa `var(--spira-font-display)` (Schibsted Grotesk). **No** se adopta Hanken/IBM Plex Mono.
- **Tokens de color:** los del handoff son idénticos a `tokens.css`. Tintes ámbar del handoff, usarlos literales: fondo de chip/ícono `rgba(168,132,47,.13)`–`.14`, halo `rgba(168,132,47,.12)`, borde de chip seleccionado `.35`. Chip "Ambulatoria" `var(--spira-contable)` + `rgba(58,107,140,.12)`. Chip "Investigación" (no está en el handoff; decisión de este plan): `var(--spira-primary)` + `rgba(15,95,87,.10)`.
- **Hit targets ≥ 44px** en steppers −/+ y botones de acción (nota del propio handoff; donde el mock dibuja 34px, se respeta 44 de alto en el control real).
- **Sin affordances falsas:** el mock 1b dibuja un chevron "→ detalle" por card, pero el detalle está **fuera de alcance**. NO renderizar chevrones ni cursors pointer en las cards de recepción (estándar del proyecto: affordances explícitas y sobrias).
- **Idioma:** comentarios, dominio y copy en castellano rioplatense; igualar la densidad de comentarios del código existente (el porqué, no el qué).
- **Comportamiento a PRESERVAR:** la lista completa vive en la Task 10 ("Checklist de comportamiento en navegador"). Cualquier paso de este plan que entre en conflicto con esa lista, pierde: se preserva el comportamiento.

## Mapeo con el eng-review

| Tarea del eng-review | Tasks de este plan |
|---|---|
| T1 (P2) — Chip/Badge compartido + groupByDay | Task 2 |
| T2 (P1) — RecepcionView lista transversal | Task 3 |
| T3 (P1) — Wizard: stepper + nav fija + Step0/Step3 | Tasks 4, 6 y 7 |
| T4 (P1) — Step1Scan escaneo 2a | Task 5 |
| T5 (P2) — Steps IP mismo lenguaje | Task 8 |
| T6 (P3) — MedicamentosView chips | Task 9 |
| Verificación | Task 10 |

## File Structure

| Archivo | Responsabilidad | Acción |
|---|---|---|
| `src/components/Badge.tsx` | Badge de estado (tonos semánticos) + colores custom con punto (chips de tipo) | Crear |
| `src/components/Chip.tsx` | Chip de filtro (píldora seleccionable) | Crear |
| `src/components/Icon.tsx` | + íconos `barcodeSearch`, `minus`, `shield`, `sliders` | Modificar |
| `src/lib/dates.ts` | + `dayGroupLabel()`, `groupByDay()` | Modificar |
| `src/data/pharma/receptions.ts` | `useReceptions` con `tipo` nullable + embebe `protocol.code` y conteo de `ip_units` | Modificar |
| `src/shell/AppShell.tsx` | + `'pharma/recepcion'` en `HIDE_ACTION` + limpieza del header como `useLayoutEffect` (fix de orden de efectos) | Modificar |
| `src/views/pharma/RecepcionView.tsx` | Lista transversal 1b: chips + búsqueda + agrupación por día + "Más filtros" | Reescribir |
| `src/components/Stepper.tsx` | Stepper del handoff (check/actual ámbar/futuro atenuado, conectores que crecen) — único consumidor: el wizard | Reescribir |
| `src/views/pharma/ReceptionWizard.tsx` | Barra de acciones fija abajo + submit lifteado (base e IP) + `CountedMed.code?` | Modificar |
| `src/views/pharma/wizard/Step3Summary.tsx` | Presentacional: fecha/notas + repaso (sin submit) | Reescribir |
| `src/views/pharma/wizard/Step3SummaryIp.tsx` | Presentacional: fecha/notas + resumen agregado (sin submit) | Reescribir |
| `src/views/pharma/wizard/Step0Setup.tsx` | Cards de tipo (3 ámbitos habilitados) + protocolo | Reescribir |
| `src/views/pharma/wizard/ScanField.tsx` | Buscador central 2a compartido (input 50px + ícono barras + Buscar) | Crear |
| `src/views/pharma/wizard/Step1Scan.tsx` | Escaneo base 2a: ScanField + card de medicamentos con stepper y footer contador | Reescribir |
| `src/views/pharma/wizard/Step2Lots.tsx` | Re-piel: cards blancas + badge de cobertura + botón dashed | Modificar |
| `src/views/pharma/wizard/Step1ScanIp.tsx` | Re-piel: ScanField + card de unidades | Modificar |
| `src/views/pharma/wizard/Step2ReviewIp.tsx` | Re-piel: card con encabezado de columnas | Modificar |
| `src/views/pharma/MedicamentosView.tsx` | Badges compartidos (Task 2) + filtros como chips (Task 9) | Modificar |

**NOT in scope:** vista de detalle de recepción (chevron del mock) · cambio de fuentes · filtrado server-side de "Más filtros" · otros submódulos de Pharma · commitear la carpeta `Mejora visual recepciones/` (queda como referencia local; si el Director quiere versionarla, es una decisión aparte).

---

## Task 1: Precondición y rama de trabajo

**Files:** ninguno (solo git).

- [ ] **Step 1: Verificar que `feat/pharma-ip` ya está en `main`**

```bash
git fetch origin 2>/dev/null; git log main --oneline -3
git branch --merged main | grep pharma-ip
```

Esperado: los commits del IP (`f723e60`, `da60de9`, …) aparecen en `main` (o `feat/pharma-ip` figura como mergeada). **Si NO está mergeada, FRENAR acá**: el plan entero está diferido a post-merge (decisión lockeada). Avisar al Director y no continuar.

- [ ] **Step 2: Crear la rama de trabajo off main**

```bash
git switch main && git pull
git switch -c feat/recepcion-reskin
```

- [ ] **Step 3: Sanity check del punto de partida**

```bash
npm run typecheck
```

Esperado: verde (exit 0). Si falla, el problema es previo al plan: investigar antes de seguir.

---

## Task 2: Fundaciones DRY — Badge, Chip, íconos y helpers de fecha

Extrae lo que hoy está duplicado (estilos de badge idénticos en `RecepcionView` y `MedicamentosView`) y crea lo que las tasks siguientes consumen. Incluye el swap mecánico de badges en `MedicamentosView` (paridad visual). `RecepcionView` NO se toca acá: la Task 3 la reescribe entera.

**Files:**
- Create: `src/components/Badge.tsx`
- Create: `src/components/Chip.tsx`
- Modify: `src/components/Icon.tsx` (objeto `ICONS`)
- Modify: `src/lib/dates.ts` (final del archivo)
- Modify: `src/views/pharma/MedicamentosView.tsx` (subcomponentes `IpUnitCard`, `StockRowItem`, `stockBadge`; borrar `badgeStyle`)

**Interfaces:**
- Produces: `Badge({ tone?, color?, bg?, dot?, children })` con `BadgeTone = 'good' | 'warn' | 'danger' | 'neutral'` · `Chip({ label, selected, onClick, accent, toggle? })` · `dayGroupLabel(iso: string): string` · `groupByDay<T>(rows: T[], getDate: (r: T) => string): { date: string; label: string; items: T[] }[]` · íconos nuevos `barcodeSearch`, `minus`, `shield`, `sliders` en `IconName`.

- [ ] **Step 1: Crear `src/components/Badge.tsx`**

```tsx
import type { CSSProperties, ReactNode } from 'react'

/** Tonos semánticos de estado. Los pares color/fondo calcan los que estaban duplicados
 *  entre RecepcionView y MedicamentosView (verificada/pendiente, stock, vencimientos). */
export type BadgeTone = 'good' | 'warn' | 'danger' | 'neutral'

const TONES: Record<BadgeTone, { color: string; bg: string }> = {
  good:    { color: 'var(--spira-good)',   bg: 'rgba(92,138,90,0.12)' },
  warn:    { color: 'var(--spira-warn)',   bg: 'rgba(176,130,63,0.12)' },
  danger:  { color: 'var(--spira-danger)', bg: 'rgba(166,72,59,0.10)' },
  neutral: { color: 'var(--spira-muted)',  bg: 'var(--spira-surface)' },
}

interface BadgeProps {
  tone?: BadgeTone
  /** Colores explícitos (pisan el tono): para chips de ámbito con acento propio
      (Protocolo ámbar / Ambulatoria contable / Investigación primario). */
  color?: string
  bg?: string
  /** Punto de color a la izquierda — convención del handoff para los chips de tipo. */
  dot?: boolean
  children: ReactNode
}

/** Píldora de estado/tipo, no interactiva. Para chips de filtro clickeables, ver Chip. */
export function Badge({ tone = 'neutral', color, bg, dot, children }: BadgeProps) {
  const c = color ?? TONES[tone].color
  const b = bg ?? TONES[tone].bg
  return (
    <span style={{ ...base, color: c, background: b }}>
      {dot && <span style={{ width: 6, height: 6, borderRadius: '50%', background: c, flex: '0 0 auto' }} />}
      {children}
    </span>
  )
}

const base: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6,
  fontSize: 12, fontWeight: 600, padding: '3px 10px',
  borderRadius: 999, whiteSpace: 'nowrap',
}
```

- [ ] **Step 2: Crear `src/components/Chip.tsx`**

```tsx
import type { CSSProperties } from 'react'

interface ChipProps {
  label: string
  selected: boolean
  onClick: () => void
  /** Acento sólido del módulo (hex): tiñe fondo/texto/borde del chip seleccionado.
      Los sufijos hex '24'/'59' son ~14%/35% de alfa — los valores del handoff. */
  accent: string
  /** true = chip independiente que se prende/apaga (aria-pressed); false/omitido = opción
      excluyente de un grupo (role=radio + aria-checked; el caller pone role=radiogroup). */
  toggle?: boolean
}

/**
 * Chip de filtro del handoff de Recepción (píldora clickeable, alto 34).
 * La semántica ARIA depende del uso: excluyente dentro de un radiogroup (tipo de
 * recepción, filtros de stock) o toggle suelto (rango 7/30 días) — un radio no se
 * destilda clickeándolo, así que el toggle NO puede ser role=radio.
 */
export function Chip({ label, selected, onClick, accent, toggle }: ChipProps) {
  const aria = toggle
    ? { 'aria-pressed': selected }
    : { role: 'radio' as const, 'aria-checked': selected }
  return (
    <button
      type="button"
      {...aria}
      onClick={onClick}
      style={{
        ...chip,
        ...(selected
          ? { background: accent + '24', color: accent, border: `1px solid ${accent}59` }
          : { background: 'var(--spira-white)', color: 'var(--spira-muted)', border: '1px solid var(--spira-line-2)' }),
      }}
    >
      {label}
    </button>
  )
}

const chip: CSSProperties = {
  height: 34, display: 'inline-flex', alignItems: 'center', padding: '0 14px',
  borderRadius: 999, fontSize: 13, fontWeight: 600, cursor: 'pointer',
  fontFamily: 'var(--spira-font-text)', whiteSpace: 'nowrap',
}
```

- [ ] **Step 3: Agregar los 4 íconos a `src/components/Icon.tsx`**

Dentro del objeto `ICONS`, después de la entrada `alertCircle` (mantener el estilo de una línea por ícono; los paths salen del mock del handoff, derivados de Lucide igual que el set existente):

```tsx
  barcodeSearch: (<><path d="M3.5 8.5V6A1.5 1.5 0 0 1 5 4.5H7.5" /><path d="M13 4.5H15A1.5 1.5 0 0 1 16.5 6V8.5" /><path d="M3.5 13V15.5A1.5 1.5 0 0 1 5 17H7.5" /><path d="M6 7V14.5" /><path d="M8.4 7V14.5" /><path d="M10.8 7V12" /><circle cx="14.3" cy="13.2" r="3.2" /><path d="M16.7 15.6 19.6 18.5" /></>),
  minus: (<path d="M5 12h14" />),
  shield: (<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1Z" />),
  sliders: (<><line x1="21" x2="14" y1="4" y2="4" /><line x1="10" x2="3" y1="4" y2="4" /><line x1="21" x2="12" y1="12" y2="12" /><line x1="8" x2="3" y1="12" y2="12" /><line x1="21" x2="16" y1="20" y2="20" /><line x1="12" x2="3" y1="20" y2="20" /><line x1="14" x2="14" y1="2" y2="6" /><line x1="8" x2="8" y1="10" y2="14" /><line x1="16" x2="16" y1="18" y2="22" /></>),
```

- [ ] **Step 4: Agregar los helpers de agrupación al final de `src/lib/dates.ts`**

```ts
/** Etiqueta de grupo por día para listas históricas (recepciones): "Hoy" / "Ayer" / "Jueves 26 jun".
 *  Espeja dayLabel() pero mira hacia atrás (una cola de recepciones no tiene "Mañana"). */
export function dayGroupLabel(iso: string): string {
  const diff = daysDiffISO(todayISO(), iso)
  if (diff === 0) return 'Hoy'
  if (diff === -1) return 'Ayer'
  return `${dayName(iso)} ${formatDayMonth(iso)}`
}

/**
 * Agrupa filas por su fecha ISO preservando el orden de entrada (pensado para listas
 * ya ordenadas desc por fecha: los grupos salen del más nuevo al más viejo).
 */
export function groupByDay<T>(rows: T[], getDate: (r: T) => string): { date: string; label: string; items: T[] }[] {
  const order: string[] = []
  const byDay = new Map<string, T[]>()
  for (const r of rows) {
    const d = getDate(r)
    if (!byDay.has(d)) { byDay.set(d, []); order.push(d) }
    byDay.get(d)!.push(r)
  }
  return order.map((d) => ({ date: d, label: dayGroupLabel(d), items: byDay.get(d)! }))
}
```

- [ ] **Step 5: Swap de badges en `src/views/pharma/MedicamentosView.tsx` (paridad visual)**

1. Sumar el import: `import { Badge } from '../../components/Badge'`.
2. Borrar la constante `badgeStyle` (al final del archivo).
3. Reemplazar `IpUnitCard` por:

```tsx
function IpUnitCard({ u }: { u: IpUnitRow }) {
  const estado = u.vencida
    ? { tone: 'danger' as const, label: 'Vencida' }
    : u.por_vencer
      ? { tone: 'warn' as const, label: 'Por vencer' }
      : { tone: 'good' as const, label: 'En stock' }
  return (
    <div style={rowCard}>
      <div style={{ minWidth: 0 }}>
        {/* N° de kit como identificador principal, en mono para lectura de códigos */}
        <div className="spira-mono" style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--spira-ink)' }}>{u.kit_number}</div>
        <div style={{ fontSize: 12.5, color: 'var(--spira-muted)', marginTop: 2 }}>
          {u.lot_number ? `lote ${u.lot_number}` : 'sin lote'}{u.expiry_date ? ` · vence ${u.expiry_date}` : ''}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginLeft: 'auto' }}>
        {/* Chip de droga: neutro cuando está cegado (no warning — es intencional en el diseño del ensayo) */}
        <Badge>{u.drug_name ?? 'Cegado'}</Badge>
        <Badge tone={estado.tone}>{estado.label}</Badge>
      </div>
    </div>
  )
}
```

4. Reemplazar `StockRowItem` y `stockBadge` por:

```tsx
function StockRowItem({ row, canManage, onAdjust }: { row: StockRow; canManage: boolean; onAdjust: () => void }) {
  const badge = stockBadge(row)
  return (
    <div style={rowCard}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 14.5, fontWeight: 600, color: 'var(--spira-ink)' }}>{row.name}</div>
        <div style={{ fontSize: 12.5, color: 'var(--spira-muted)', marginTop: 2 }}>{row.unit}</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginLeft: 'auto' }}>
        <Badge tone={badge.tone}>{badge.label} · {row.total_stock}</Badge>
        {canManage && (
          <button onClick={onAdjust} style={sideBtn}>
            <Icon name="pencil" size={14} color="var(--spira-muted)" /> Ajustar
          </button>
        )}
      </div>
    </div>
  )
}

function stockBadge(r: StockRow): { label: string; tone: 'good' | 'warn' | 'danger' } {
  if (r.total_stock === 0) return { label: 'Sin stock', tone: 'danger' }
  if (r.is_low_stock) return { label: 'Stock bajo', tone: 'warn' }
  return { label: 'En stock', tone: 'good' }
}
```

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck` — Esperado: verde.

- [ ] **Step 7: Commit**

```bash
git add src/components/Badge.tsx src/components/Chip.tsx src/components/Icon.tsx src/lib/dates.ts src/views/pharma/MedicamentosView.tsx
git commit -m "feat(pharma): Badge/Chip compartidos + groupByDay + iconos del handoff (T1 re-piel Recepción)"
```

---

## Task 3: Lista transversal de recepciones (1b)

El protocolo deja de ser gate y pasa a ser filtro. Chips Todas/Protocolo/Investigación/Ambulatoria + búsqueda libre + 7/30 días + "Más filtros" (client-side) + agrupación por día. "Nueva recepción" se muda al encabezado del shell vía `setHeader`.

**Files:**
- Modify: `src/data/pharma/receptions.ts` (tipo de `useReceptions`, `RECEPTION_COLS`, `ReceptionRow`)
- Modify: `src/shell/AppShell.tsx:44` (set `HIDE_ACTION`)
- Rewrite: `src/views/pharma/RecepcionView.tsx`

**Interfaces:**
- Consumes: `Badge`, `Chip`, `groupByDay` (Task 2); `ReceptionWizard` con props actuales (`accentSolid`, `initialTipo`, `initialProtocolId`, `onClose`, `onCreated`) — sin cambios en esta task.
- Produces: `useReceptions(tipo: ReceptionKind | null, protocolId: string | null)` (null = todos los tipos) · `ReceptionRow.protocol: { code: string } | null` · `ReceptionRow.ip_units: { count: number }[]`.

- [ ] **Step 1: Capa de datos — `src/data/pharma/receptions.ts`**

Reemplazar `RECEPTION_COLS` y `useReceptions` (el resto del archivo no se toca):

```ts
const RECEPTION_COLS =
  'id, tipo, protocol_id, reception_date, status, verified_at, notes, ' +
  // protocol.code para mostrar/buscar en la lista transversal; ip_units(count) porque las
  // recepciones IP no tienen reception_items (las unidades viven en ip_units, 0037).
  'protocol:protocols(code), ip_units(count), ' +
  'items:reception_items(id, medication_id, lot_number, expiry_date, quantity, medication:medications(name))'

/** Recepciones (cola; más nuevas primero), con renglones, protocolo e ítems/unidades.
 *  tipo=null → todos los tipos (lista transversal). ambulatoria → sin protocolo.
 *  protocolo/investigacion con protocolId → filtra por protocolo; con null trae todas del tipo. */
export function useReceptions(tipo: ReceptionKind | null, protocolId: string | null) {
  return useSupabaseQuery<ReceptionRow[]>(
    (c) => {
      let q = c.from('medication_receptions').select(RECEPTION_COLS)
      if (tipo) q = q.eq('tipo', tipo)
      if (tipo === 'ambulatoria') q = q.is('protocol_id', null)
      else if (tipo && protocolId) q = q.eq('protocol_id', protocolId)
      return q.order('reception_date', { ascending: false }).returns<ReceptionRow[]>()
    },
    [tipo, protocolId],
  )
}
```

Y en la interfaz `ReceptionRow`, sumar dos campos (después de `notes`):

```ts
  /** Código del protocolo (to-one) para mostrar/buscar en la lista transversal. */
  protocol: { code: string } | null
  /** Conteo de unidades IP (agregado PostgREST). Vacío en recepciones de base. */
  ip_units: { count: number }[]
```

- [ ] **Step 2: Shell — suprimir el botón genérico en Recepción y arreglar el orden de efectos del header**

Dos cambios en `src/shell/AppShell.tsx`:

1. Línea 44: agregar `'pharma/recepcion'` al set `HIDE_ACTION` (la vista registra su acción real vía `setHeader`; sin esto, cuando el usuario no es leader quedaría el "Nuevo" genérico muerto):

```ts
const HIDE_ACTION = new Set(['inicio/resumen', 'inicio/tareas', 'inicio/alertas', 'track/resumen', 'track/protocolos', 'track/visitas', 'track/para-ver-medico', 'track/agenda', 'track/alertas', 'pharma/protocolos', 'pharma/recepcion'])
```

2. **Orden de efectos (bug latente que esta task destaparía):** la limpieza del encabezado contextual (línea 77) es hoy un `useEffect` con deps `[moduleKey, subKey]`. Los efectos pasivos se flushean hijo→padre: al navegar a Recepción, la vista registraría el header en su `useEffect` de montaje y **acto seguido** el efecto del shell lo pisaría con `null` — el botón "Nueva recepción" no aparecería nunca (los consumidores actuales, `PatientFichaView`/`ProtocolDetailView`, no lo sufren porque registran en navegación interna, con `subKey` sin cambiar). El fix: hacer la limpieza un **layout effect** (flushea antes que cualquier efecto pasivo, así el shell limpia PRIMERO y la vista registra DESPUÉS).

Línea 1 (import; `useEffect` queda sin otros usos en el archivo):

```ts
import { Fragment, useLayoutEffect, useState } from 'react'
```

Líneas 74-77 (comentario + efecto):

```ts
  /* Al cambiar de módulo/submódulo, limpiar el encabezado contextual (que no quede
     pegado de otra vista). Es un LAYOUT effect a propósito: flushea antes que los
     efectos pasivos de las vistas hijas, así esta limpieza nunca pisa el header que
     una vista recién montada registra en su useEffect (la primera consumidora
     on-mount es RecepcionView). La navegación INTERNA de una vista no cambia subKey,
     así que la vista conserva el control de su encabezado mientras esté en su submódulo. */
  useLayoutEffect(() => { setViewHeader(null) }, [moduleKey, subKey])
```

- [ ] **Step 3: Reescribir `src/views/pharma/RecepcionView.tsx`**

Contenido completo del archivo:

```tsx
import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { Icon } from '../../components/Icon'
import { EmptyState } from '../../components/EmptyState'
import { Badge } from '../../components/Badge'
import { Chip } from '../../components/Chip'
import { btnOutline } from '../../components/buttons'
import { fieldInput, fieldLabelStyle } from '../../components/FormField'
import { useAuth } from '../../lib/auth'
import { addDaysISO, groupByDay, todayISO } from '../../lib/dates'
import { useProtocols } from '../../data/protocols'
import { useReceptions, useMedications, verifyReception } from '../../data/pharma'
import type { ReceptionRow, ReceptionKind } from '../../data/pharma'
import { ReceptionWizard } from './ReceptionWizard'
import type { ViewProps } from '../types'

/** Filtro de tipo de la lista: los tres ámbitos o todos juntos. */
type ChipFilter = 'todas' | ReceptionKind

/** Colores por ámbito para el chip de tipo (convención del handoff; Investigación es
 *  decisión propia: primario petróleo, distinto de ámbar y contable). */
const KIND_CHIP: Record<ReceptionKind, { label: string; color: string; bg: string }> = {
  protocolo:     { label: 'Protocolo',     color: 'var(--spira-pharma-solid)', bg: 'rgba(168,132,47,.14)' },
  investigacion: { label: 'Investigación', color: 'var(--spira-primary)',      bg: 'rgba(15,95,87,.10)' },
  ambulatoria:   { label: 'Ambulatoria',   color: 'var(--spira-contable)',     bg: 'rgba(58,107,140,.12)' },
}

/**
 * Pharma → Recepción. Lista TRANSVERSAL de recepciones (handoff 1b): todas las de todos
 * los ámbitos, agrupadas por día, con chips de tipo + búsqueda + rango + "Más filtros"
 * client-side. El protocolo es un filtro más, no un gate (Pharma es central: ve todo por RLS).
 * Alta vía wizard a pantalla completa (ReceptionWizard). Migraciones 0032+0035+0037.
 */
export function RecepcionView({ module, submodule, setHeader }: ViewProps) {
  const accent = module.accent
  const accentSolid = module.accentSolid
  const { hasMinRole } = useAuth()
  const canManage = hasMinRole('pharma', 'leader')

  const protocols = useProtocols()
  const catalog = useMedications() // para el filtro "Medicamento" (desplegable, sin texto libre)

  const [chip, setChip] = useState<ChipFilter>('todas')
  const [q, setQ] = useState('')
  const [days, setDays] = useState<7 | 30 | null>(null)
  const [moreOpen, setMoreOpen] = useState(false)
  const [fProtocol, setFProtocol] = useState('')
  const [fMedId, setFMedId] = useState('')
  const [fDesde, setFDesde] = useState('')
  const [fHasta, setFHasta] = useState('')

  // Definido acá arriba (no después del return temprano del wizard): onCreated lo captura.
  const clearMore = () => { setFProtocol(''); setFMedId(''); setFDesde(''); setFHasta('') }

  const [creating, setCreating] = useState(false)
  const [highlightId, setHighlightId] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  // El chip de tipo filtra server-side (el resto es client-side sobre lo traído).
  const receptions = useReceptions(chip === 'todas' ? null : chip, null)

  // Auto-limpia el highlight tras 5 s para no dejar el resaltado indefinidamente.
  useEffect(() => {
    if (!highlightId) return
    const t = setTimeout(() => setHighlightId(null), 5000)
    return () => clearTimeout(t)
  }, [highlightId])

  // Encabezado contextual del shell: "Nueva recepción" arriba a la derecha (gating leader),
  // y la miga "Nueva recepción" mientras el wizard está abierto. El shell lo limpia al
  // cambiar de submódulo; acá se limpia al desmontar.
  useEffect(() => {
    if (!setHeader) return
    if (creating) {
      setHeader({ crumbs: [{ label: 'Nueva recepción' }] })
    } else {
      setHeader(canManage
        ? { actions: [{ key: 'nueva', label: 'Nueva recepción', icon: 'plus', primary: true, onClick: () => setCreating(true) }] }
        : null)
    }
    return () => setHeader(null)
  }, [setHeader, creating, canManage])

  // Cuando el wizard termina, volvemos a la cola y resaltamos la recepción recién creada.
  if (creating) {
    return (
      <ReceptionWizard
        accentSolid={accentSolid}
        initialTipo={chip === 'todas' ? 'protocolo' : chip}
        initialProtocolId={fProtocol}
        onClose={() => setCreating(false)}
        // Al crear: resetear TODOS los filtros (chip, búsqueda, rango y "Más filtros") para que
        // la recepción nueva nunca quede oculta por un filtro activo y el highlight de 5 s se vea
        // (el usuario pudo cambiar tipo/fecha adentro del wizard).
        onCreated={(id) => { setCreating(false); setChip('todas'); setQ(''); setDays(null); clearMore(); setHighlightId(id); receptions.refetch() }}
      />
    )
  }

  const verify = async (r: ReceptionRow) => {
    setBusyId(r.id)
    setActionError(null)
    const res = await verifyReception(r.id)
    setBusyId(null)
    if (res.error) { setActionError(res.error); return }
    receptions.refetch()
  }

  // ── Filtros client-side ──────────────────────────────────────────────────────
  const t = q.trim().toLowerCase()
  const desdeRango = days ? addDaysISO(todayISO(), -(days - 1)) : null
  const rows = (receptions.data ?? []).filter((r) => {
    if (t) {
      const enTexto =
        (r.protocol?.code.toLowerCase().includes(t) ?? false) ||
        (r.notes?.toLowerCase().includes(t) ?? false) ||
        r.items.some((it) =>
          (it.medication?.name.toLowerCase().includes(t) ?? false) ||
          it.lot_number.toLowerCase().includes(t))
      if (!enTexto) return false
    }
    if (desdeRango && r.reception_date < desdeRango) return false
    if (fProtocol && r.protocol_id !== fProtocol) return false
    if (fMedId && !r.items.some((it) => it.medication_id === fMedId)) return false
    if (fDesde && r.reception_date < fDesde) return false
    if (fHasta && r.reception_date > fHasta) return false
    return true
  })
  const groups = groupByDay(rows, (r) => r.reception_date)
  const moreCount = [fProtocol, fMedId, fDesde, fHasta].filter(Boolean).length
  const hayFiltros = !!t || days !== null || moreCount > 0 || chip !== 'todas'

  // ── Toolbar (siempre visible, también en loading/error/vacío) ────────────────
  const toolbar = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
      <div style={searchWrap}>
        <span style={{ position: 'absolute', left: 13, display: 'grid', placeItems: 'center' }}>
          <Icon name="search" size={16} color="var(--spira-faint)" />
        </span>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar recepción…"
          className="spira-search-input"
          style={searchInput}
        />
      </div>
      <div role="radiogroup" aria-label="Tipo de recepción" style={{ display: 'flex', gap: 7 }}>
        <Chip label="Todas" selected={chip === 'todas'} onClick={() => { setChip('todas'); setHighlightId(null) }} accent={accentSolid} />
        {(Object.keys(KIND_CHIP) as ReceptionKind[]).map((k) => (
          <Chip key={k} label={KIND_CHIP[k].label} selected={chip === k} onClick={() => { setChip(k); setHighlightId(null) }} accent={accentSolid} />
        ))}
      </div>
      <span style={{ width: 1, height: 24, background: 'var(--spira-line)' }} />
      <div style={{ display: 'flex', gap: 7 }}>
        {/* Rango como toggles (se destildan al re-clickear) — no son radios. */}
        <Chip toggle label="7 días" selected={days === 7} onClick={() => setDays(days === 7 ? null : 7)} accent={accentSolid} />
        <Chip toggle label="30 días" selected={days === 30} onClick={() => setDays(days === 30 ? null : 30)} accent={accentSolid} />
      </div>
      <button
        type="button"
        onClick={() => setMoreOpen((v) => !v)}
        aria-expanded={moreOpen}
        style={{ ...btnOutline, height: 36, fontSize: 13, marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 7 }}
      >
        <Icon name="sliders" size={15} color="var(--spira-muted)" /> Más filtros{moreCount > 0 ? ` · ${moreCount}` : ''}
      </button>
    </div>
  )

  const morePanel = moreOpen ? (
    <div style={panel}>
      <label style={filterField}>
        <span style={fieldLabelStyle}>Protocolo</span>
        <select value={fProtocol} onChange={(e) => setFProtocol(e.target.value)} style={{ ...fieldInput, height: 38 }}>
          <option value="">Todos</option>
          {(protocols.data ?? []).map((p) => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
        </select>
      </label>
      <label style={filterField}>
        <span style={fieldLabelStyle}>Medicamento</span>
        <select value={fMedId} onChange={(e) => setFMedId(e.target.value)} style={{ ...fieldInput, height: 38 }}>
          <option value="">Todos</option>
          {(catalog.data ?? []).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
      </label>
      <label style={filterField}>
        <span style={fieldLabelStyle}>Desde</span>
        <input type="date" value={fDesde} onChange={(e) => setFDesde(e.target.value)} style={{ ...fieldInput, height: 38 }} />
      </label>
      <label style={filterField}>
        <span style={fieldLabelStyle}>Hasta</span>
        <input type="date" value={fHasta} onChange={(e) => setFHasta(e.target.value)} style={{ ...fieldInput, height: 38 }} />
      </label>
      <button type="button" onClick={clearMore} style={{ ...btnOutline, height: 38, alignSelf: 'flex-end' }}>Limpiar</button>
    </div>
  ) : null

  if (receptions.loading) {
    return (
      <div style={wrap}>
        {toolbar}
        {morePanel}
        <EmptyState accent={accent} icon={submodule.icon} title="Cargando…" description="Un momento." />
      </div>
    )
  }
  if (receptions.error) {
    return (
      <div style={wrap}>
        {toolbar}
        {morePanel}
        <div style={errorBox}><Icon name="alertCircle" size={18} color="var(--spira-danger)" /> No pudimos cargar las recepciones.</div>
        <button onClick={() => receptions.refetch()} style={btnOutline}>Reintentar</button>
      </div>
    )
  }

  return (
    <div style={wrap}>
      {toolbar}
      {morePanel}
      {actionError && <div style={errorBox}>{actionError}</div>}

      {rows.length === 0 ? (
        <EmptyState
          accent={accent}
          icon={submodule.icon}
          title={hayFiltros ? 'Nada con esos filtros' : 'Sin recepciones'}
          description={hayFiltros
            ? 'Ninguna recepción coincide con la búsqueda o los filtros activos.'
            : 'Cuando llegue medicación, cargá la recepción y verificala para ingresar el stock.'}
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {groups.map((g) => (
            <div key={g.date}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 2px 2px' }}>
                <span className="spira-eyebrow">{g.label}</span>
                <span style={{ height: 1, flex: 1, background: 'var(--spira-line)' }} />
                <span style={{ fontSize: 11.5, color: 'var(--spira-faint)' }}>{g.items.length}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginTop: 9 }}>
                {g.items.map((r) => (
                  <ReceptionCard
                    key={r.id}
                    r={r}
                    canManage={canManage}
                    busy={busyId === r.id}
                    highlight={r.id === highlightId}
                    accentSolid={accentSolid}
                    onVerify={() => verify(r)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ReceptionCard({ r, canManage, busy, highlight, accentSolid, onVerify }: {
  r: ReceptionRow
  canManage: boolean
  busy: boolean
  highlight: boolean
  accentSolid: string
  onVerify: () => void
}) {
  const verificada = r.status === 'verificada'
  const kind = KIND_CHIP[r.tipo] ?? KIND_CHIP.protocolo
  const esIp = r.tipo === 'investigacion'
  // Las recepciones IP no tienen reception_items: las unidades viven en ip_units (0037).
  const unidades = r.ip_units[0]?.count ?? 0
  const totalItems = esIp ? unidades : r.items.reduce((s, it) => s + it.quantity, 0)
  const first = esIp ? 'Producto de Investigación' : (r.items[0]?.medication?.name ?? '—')
  const extra = esIp ? 0 : r.items.length - 1

  const cardStyle: CSSProperties = {
    ...rowCard,
    ...(highlight ? { boxShadow: 'var(--spira-shadow-sm)', borderColor: accentSolid } : {}),
  }

  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <span style={iconSq}>
          <Icon name={esIp ? 'flask' : 'pill'} size={20} color="var(--spira-pharma-solid)" stroke={1.9} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {first}
            {extra > 0 && <span style={{ color: 'var(--spira-muted)', fontWeight: 500 }}> +{extra} más</span>}
          </div>
          {(r.protocol || r.notes) && (
            <div style={{ fontSize: 12.5, color: 'var(--spira-muted)', marginTop: 2, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {r.protocol && <span className="spira-mono" style={{ color: 'var(--spira-pharma-solid)' }}>{r.protocol.code}</span>}
              {r.notes && <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.protocol ? '· ' : ''}{r.notes}</span>}
            </div>
          )}
        </div>
        <Badge color={kind.color} bg={kind.bg} dot>{kind.label}</Badge>
        <Badge tone={verificada ? 'good' : 'warn'}>{verificada ? 'Verificada' : 'Pendiente'}</Badge>
        <div style={{ textAlign: 'right', minWidth: 64, whiteSpace: 'nowrap' }}>
          <span className="spira-mono" style={{ fontFamily: 'var(--spira-font-display)', fontWeight: 700, fontSize: 18 }}>{totalItems}</span>
          <span style={{ fontSize: 12, color: 'var(--spira-muted)' }}>
            {' '}{esIp ? (totalItems === 1 ? 'unidad' : 'unidades') : (totalItems === 1 ? 'ítem' : 'ítems')}
          </span>
        </div>
        {canManage && !verificada && (
          <button onClick={onVerify} disabled={busy} style={{ ...verifyBtn, opacity: busy ? 0.7 : 1, cursor: busy ? 'default' : 'pointer' }}>
            <Icon name="check" size={15} color="var(--spira-on-accent)" /> {busy ? 'Verificando…' : 'Verificar'}
          </button>
        )}
      </div>
      {r.items.length > 0 && (
        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {r.items.map((it) => (
            <div key={it.id} style={{ fontSize: 12.5, color: 'var(--spira-muted)', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ color: 'var(--spira-ink)', fontWeight: 500 }}>{it.medication?.name ?? '—'}</span>
              <span>· lote <span className="spira-mono">{it.lot_number}</span></span>
              {it.expiry_date && <span>· vence {it.expiry_date}</span>}
              <span>· {it.quantity}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

const wrap: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 16 }
const errorBox: CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, color: 'var(--spira-danger)', background: 'rgba(166,72,59,0.10)', borderRadius: 10, padding: '12px 14px' }
const rowCard: CSSProperties = { border: '1px solid var(--spira-line)', borderRadius: 14, background: 'var(--spira-white)', padding: '13px 16px', boxShadow: 'var(--spira-shadow-sm)', transition: 'border-color 0.2s, box-shadow 0.2s' }
const iconSq: CSSProperties = { width: 40, height: 40, flex: '0 0 auto', borderRadius: 11, background: 'rgba(168,132,47,.13)', display: 'grid', placeItems: 'center' }
const searchWrap: CSSProperties = { position: 'relative', flex: 1, minWidth: 230, maxWidth: 340, display: 'flex', alignItems: 'center' }
const searchInput: CSSProperties = {
  width: '100%', height: 40, padding: '0 13px 0 38px', borderRadius: 999,
  border: '1px solid var(--spira-line-2)', background: 'var(--spira-white)', boxShadow: 'var(--spira-shadow-sm)',
  color: 'var(--spira-ink)', fontFamily: 'var(--spira-font-text)', fontSize: 13.5,
}
const panel: CSSProperties = {
  display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end',
  border: '1px solid var(--spira-line)', borderRadius: 14, background: 'var(--spira-white)', padding: '12px 14px',
}
const filterField: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 6, minWidth: 180 }
const verifyBtn: CSSProperties = {
  height: 34, padding: '0 14px', border: 'none', borderRadius: 8, background: 'var(--spira-good)',
  color: 'var(--spira-on-accent)', fontFamily: 'var(--spira-font-text)', fontWeight: 600, fontSize: 13,
  display: 'flex', alignItems: 'center', gap: 6, flex: '0 0 auto',
}
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck` — Esperado: verde.

- [ ] **Step 5: Commit**

```bash
git add src/data/pharma/receptions.ts src/shell/AppShell.tsx src/views/pharma/RecepcionView.tsx
git commit -m "feat(pharma): lista transversal de recepciones (1b) — chips, busqueda, agrupacion por dia, Mas filtros"
```

---

## Task 4: Marco del wizard — Stepper, barra fija abajo y submit lifteado (1d)

El "Crear recepción" pasa del cuerpo del Paso 3 a la barra fija (regla del handoff). Para eso el submit (guards + RPC + busy/error) sube al wizard **verbatim** desde `Step3Summary`/`Step3SummaryIp`, que quedan presentacionales y re-pielados en esta misma task (así el typecheck cierra en un solo paso).

**Files:**
- Rewrite: `src/components/Stepper.tsx` (único consumidor: `ReceptionWizard`)
- Modify: `src/views/pharma/ReceptionWizard.tsx`
- Rewrite: `src/views/pharma/wizard/Step3Summary.tsx`
- Rewrite: `src/views/pharma/wizard/Step3SummaryIp.tsx`

**Interfaces:**
- Consumes: `Icon` con `shield` (Task 2); `createReception`/`createIpReception` de `data/pharma` (sin cambios).
- Produces: `Stepper` con la MISMA firma (`steps`, `current`, `maxReached`, `onJump`, `accent`) · `Step3Summary({ meds, receptionDate, notes, setReceptionDate, setNotes })` · `Step3SummaryIp({ units, receptionDate, notes, setReceptionDate, setNotes })` · `CountedMed` gana `code?: string` (lo consume la Task 5).

- [ ] **Step 1: Reescribir `src/components/Stepper.tsx`**

```tsx
import type { CSSProperties } from 'react'
import { Icon } from './Icon'

interface StepperProps { steps: string[]; current: number; maxReached: number; onJump: (i: number) => void; accent: string }

/**
 * Stepper del handoff de Recepción: círculos 30px (completado = acento + check,
 * actual = acento + número, futuro = superficie atenuada) y conectores que crecen
 * y se tiñen al completarse. Los pasos ya alcanzados (maxReached) siguen siendo
 * clickeables para saltar — el wizard resiembra lotes en el goto.
 */
export function Stepper({ steps, current, maxReached, onJump, accent }: StepperProps) {
  return (
    <div role="list" style={{ display: 'flex', alignItems: 'center', flex: 1, minWidth: 0, maxWidth: 680 }}>
      {steps.map((label, i) => {
        const done = i < current
        const active = i === current
        const reachable = i <= maxReached && i !== current
        const notLast = i < steps.length - 1
        return (
          <div key={label} role="listitem" style={{ display: 'flex', alignItems: 'center', flex: notLast ? 1 : '0 0 auto', minWidth: 0 }}>
            <button
              type="button"
              onClick={() => reachable && onJump(i)}
              aria-disabled={!reachable || undefined}
              aria-current={active ? 'step' : undefined}
              className={reachable ? undefined : 'spira-no-press'}
              style={{
                display: 'flex', alignItems: 'center', gap: 9, border: 'none', background: 'transparent',
                padding: '7px 4px', cursor: reachable ? 'pointer' : 'default', minHeight: 44,
              }}
            >
              <span
                style={{
                  ...dot,
                  background: done || active ? accent : 'var(--spira-surface)',
                  color: done || active ? 'var(--spira-on-accent)' : 'var(--spira-faint)',
                  border: done || active ? `1px solid ${accent}` : '1px solid var(--spira-line-2)',
                }}
              >
                {done ? <Icon name="check" size={15} color="var(--spira-on-accent)" stroke={3} /> : i + 1}
              </span>
              <span style={{ fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap', color: active ? 'var(--spira-ink)' : done ? 'var(--spira-muted)' : 'var(--spira-faint)' }}>{label}</span>
            </button>
            {notLast && <span style={{ flex: 1, height: 2, margin: '0 14px', minWidth: 24, background: done ? accent : 'var(--spira-line)' }} />}
          </div>
        )
      })}
    </div>
  )
}
const dot: CSSProperties = { width: 30, height: 30, borderRadius: '50%', display: 'grid', placeItems: 'center', fontFamily: 'var(--spira-font-display)', fontWeight: 700, fontSize: 13, flex: '0 0 auto' }
```

- [ ] **Step 2: Modificar `src/views/pharma/ReceptionWizard.tsx`**

Contenido completo del archivo:

```tsx
import { useState } from 'react'
import type { CSSProperties } from 'react'
import { Icon } from '../../components/Icon'
import { Stepper } from '../../components/Stepper'
import { Modal } from '../../components/Modal'
import { btnOutline, btnPrimary } from '../../components/buttons'
import { createReception, createIpReception } from '../../data/pharma'
import type { ReceptionKind } from '../../data/pharma'
import { Step0Setup } from './wizard/Step0Setup'
import { Step1Scan } from './wizard/Step1Scan'
import { Step2Lots } from './wizard/Step2Lots'
import { Step3Summary } from './wizard/Step3Summary'
import { Step1ScanIp } from './wizard/Step1ScanIp'
import { Step2ReviewIp } from './wizard/Step2ReviewIp'
import { Step3SummaryIp } from './wizard/Step3SummaryIp'

/** Borrador de un lote a recibir (se construye en el Paso 2). */
export interface LotDraft { key: number; lotNumber: string; expiryDate: string; quantity: string }

/** Borrador de una unidad de IP escaneada (Paso 1 del wizard, rama investigación). */
export interface IpUnitDraft {
  key: number
  kitNumber: string
  rawCode: string
  gtin: string
  lotNumber: string
  expiryDate: string
  drugId: string      // '' = cegado
  drugName: string    // etiqueta para mostrar
  manual: boolean     // vestigial del flujo GS1: hoy siempre false (el IP no parsea). Futuro: marcar carga a mano para auditoría.
}

/** Medicamento con cantidad y lotes ya contados (se arma en el Paso 1 y se detalla en el Paso 2).
 *  `code` es el código escaneado/asociado (para mostrar el EAN en la lista; a mano queda vacío). */
export interface CountedMed { medicationId: string; name: string; quantity: number; lots: LotDraft[]; code?: string }

interface Props {
  accentSolid: string
  initialTipo: ReceptionKind
  initialProtocolId: string
  onClose: () => void
  onCreated: (id: string) => void
}

/**
 * Wizard de recepción tipada (4 pasos). Maneja el estado global del wizard: tipo,
 * protocolo, medicamentos/lotes, fecha y notas. La validación por paso (`canAdvance`)
 * habilita el avance; cambiar tipo o cancelar con datos cargados pide confirmación.
 * El submit (base e IP) vive ACÁ (no en los Step3) porque el CTA "Crear recepción"
 * está en la barra de acciones fija de abajo (handoff 1d).
 */
export function ReceptionWizard({ accentSolid, initialTipo, initialProtocolId, onClose, onCreated }: Props) {
  const [step, setStep] = useState(0)
  const [maxReached, setMaxReached] = useState(0)
  const [tipo, setTipo] = useState<ReceptionKind>(initialTipo)
  const [protocolId, setProtocolId] = useState(initialProtocolId)
  const [meds, setMeds] = useState<CountedMed[]>([])
  const [ipUnits, setIpUnits] = useState<IpUnitDraft[]>([])
  const [receptionDate, setReceptionDate] = useState(new Date().toISOString().slice(0, 10))
  const [notes, setNotes] = useState('')
  const [submitBusy, setSubmitBusy] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  // Guardamos la acción a confirmar; `null | (() => void)` para evitar el colapso de
  // useState con una función inicializadora que TS no puede discriminar.
  const [confirmDiscard, setConfirmDiscard] = useState<null | (() => void)>(null)

  const isIp = tipo === 'investigacion'
  const STEPS = isIp ? ['Setup', 'Escaneo', 'Revisión', 'Resumen'] : ['Setup', 'Escaneo', 'Lotes', 'Resumen']

  const hasData = isIp ? ipUnits.length > 0 : meds.length > 0
  // guard: si hay datos cargados (medicamentos o unidades IP), pide confirmación antes de ejecutar la acción.
  const guard = (action: () => void) => { if (hasData) setConfirmDiscard(() => action); else action() }

  /** Validación por paso. El Paso 3 solo necesita fecha (siempre hay una por default).
   *  El Paso 0 exige protocolo tanto para 'protocolo' como 'investigacion'.
   *  Los pasos 1/2 se ramifican por isIp. */
  const canAdvance = (): boolean => {
    if (step === 0) return tipo === 'ambulatoria' || !!protocolId
    if (isIp) {
      if (step === 1) return ipUnits.length > 0
      if (step === 2) return true   // droga opcional; lote/vto editables en Step2ReviewIp
      return !!receptionDate
    }
    // Rama base (protocolo / ambulatoria)
    if (step === 1) return meds.length > 0 && meds.every((m) => m.quantity > 0)
    if (step === 2) return meds.every((m) => {
      const lotNums = m.lots.map((l) => l.lotNumber.trim()).filter(Boolean)
      const noDups = new Set(lotNums).size === lotNums.length && lotNums.length === m.lots.length
      return (
        noDups &&
        m.lots.reduce((s, l) => s + (Number(l.quantity) || 0), 0) === m.quantity
      )
    })
    return !!receptionDate
  }

  /** Para cada medicamento sin lotes, crea un lote default con la cantidad total. */
  const seedLots = (list: CountedMed[]): CountedMed[] =>
    list.map((m) => (m.lots.length ? m : { ...m, lots: [{ key: 1, lotNumber: '', expiryDate: '', quantity: String(m.quantity) }] }))

  // Al entrar a cualquier paso ≥ 2 (por avance o salto), sembramos los lotes faltantes solo en la
  // rama de base. seedLots es idempotente: solo rellena medicamentos sin lotes, nunca pisa los editados.
  const goto = (i: number) => {
    if (i >= 2 && !isIp) setMeds(seedLots)
    // Paridad con el submit por-paso previo: al salir del Resumen se descarta el error.
    if (step === 3 && i !== 3) setSubmitError(null)
    setStep(i)
    setMaxReached((m) => Math.max(m, i))
  }
  const next = () => {
    if (!canAdvance()) return
    goto(step + 1)
  }
  const back = () => { if (step === 3) setSubmitError(null); setStep((s) => Math.max(0, s - 1)) }

  /**
   * Submit lifteado de los Step3 (guards portados verbatim). Rama IP: exige protocolo,
   * fecha y N° de kit en toda unidad. Rama base: fecha, ≥1 ítem y suma de lotes == cantidad.
   * Errores del RPC ya llegan serenos desde la capa de datos.
   */
  const submitReception = async () => {
    if (isIp) {
      if (!protocolId || !receptionDate || ipUnits.length === 0) return
      // Guard: toda unidad necesita N° de kit (el fallback manual pudo quedar vacío).
      const sinKit = ipUnits.filter((u) => !u.kitNumber.trim()).length
      if (sinKit > 0) {
        setSubmitError(`Hay ${sinKit} unidad(es) sin N° de kit. Completá en Revisión.`)
        return
      }
      setSubmitBusy(true)
      setSubmitError(null)
      const res = await createIpReception({
        protocolId,
        receptionDate,
        notes: notes.trim() || null,
        units: ipUnits.map((u) => ({
          kit_number: u.kitNumber.trim(),
          raw_code: u.rawCode || null,
          gtin: u.gtin || null,
          lot_number: u.lotNumber || null,
          expiry_date: u.expiryDate || null,
          drug_id: u.drugId || null,
        })),
      })
      setSubmitBusy(false)
      if (res.error) { setSubmitError(res.error); return }
      if (res.id) onCreated(res.id)
      return
    }
    // Guards defensivos de la rama base: el botón es type="button", no hay validación nativa del form.
    if (!receptionDate) {
      setSubmitError('La fecha de recepción es obligatoria.')
      return
    }
    const items = meds.flatMap((m) =>
      m.lots.map((l) => ({
        medication_id: m.medicationId,
        lot_number: l.lotNumber.trim(),
        expiry_date: l.expiryDate || null,
        quantity: Number(l.quantity),
      })),
    )
    if (items.length === 0) {
      setSubmitError('Agregá al menos un ítem antes de crear la recepción.')
      return
    }
    // Guard defensivo: detecta medicamentos cuya suma de lotes no coincide con la cantidad
    // contada (puede pasar si se llega al paso 3 por un salto sin semillar correctamente).
    const bad = meds.find(
      (m) =>
        m.lots.length === 0 ||
        m.lots.reduce((s, l) => s + (Number(l.quantity) || 0), 0) !== m.quantity,
    )
    if (bad) {
      setSubmitError(`Revisá los lotes de ${bad.name}: la suma de lotes no coincide con la cantidad contada.`)
      return
    }
    setSubmitBusy(true)
    setSubmitError(null)
    const res = await createReception({
      tipo,
      protocol_id: tipo === 'ambulatoria' ? null : protocolId,
      reception_date: receptionDate,
      notes: notes.trim() || null,
      items,
    })
    setSubmitBusy(false)
    if (res.error) { setSubmitError(res.error); return }
    onCreated(res.id!)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* Encabezado: stepper + botón cancelar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Stepper steps={STEPS} current={step} maxReached={maxReached} onJump={goto} accent={accentSolid} />
        <button type="button" onClick={() => guard(onClose)} style={{ ...btnOutline, marginLeft: 'auto', flex: '0 0 auto' }}>Cancelar</button>
      </div>

      {/* Renderizado del paso actual */}
      {step === 0 && (
        <Step0Setup
          accentSolid={accentSolid}
          tipo={tipo}
          protocolId={protocolId}
          onTipo={(t) => guard(() => { setTipo(t); if (t === 'ambulatoria') setProtocolId(''); setMeds([]); setIpUnits([]) })}
          onProtocol={setProtocolId}
        />
      )}
      {step === 1 && (isIp
        ? <Step1ScanIp accentSolid={accentSolid} units={ipUnits} setUnits={setIpUnits} />
        : <Step1Scan tipo={tipo} protocolId={protocolId} accentSolid={accentSolid} meds={meds} setMeds={setMeds} />)}
      {step === 2 && (isIp
        ? <Step2ReviewIp accentSolid={accentSolid} units={ipUnits} setUnits={setIpUnits} />
        : <Step2Lots meds={meds} setMeds={setMeds} accentSolid={accentSolid} />)}
      {step === 3 && (isIp
        ? <Step3SummaryIp units={ipUnits} receptionDate={receptionDate} notes={notes} setReceptionDate={setReceptionDate} setNotes={setNotes} />
        : <Step3Summary meds={meds} receptionDate={receptionDate} notes={notes} setReceptionDate={setReceptionDate} setNotes={setNotes} />)}

      {/* Barra de acciones fija abajo (handoff 1d). Los márgenes negativos sangran sobre el
          padding del contenedor de contenido del shell (16px 26px 26px) para que la barra
          llegue a los bordes; sticky la pega al viewport de scroll. "Atrás" no aparece en
          el primer paso (regla del handoff). El error del submit vive DENTRO de la barra:
          el CTA está siempre visible (sticky), así que su feedback también tiene que estarlo
          (afuera podría quedar scrolleado fuera de pantalla y parecer que "no pasó nada"). */}
      <div style={footerBar}>
        {step > 0 && (
          <button type="button" onClick={back} style={{ ...btnOutline, height: 42, display: 'flex', alignItems: 'center', gap: 7, flex: '0 0 auto' }}>
            <Icon name="chevronLeft" size={16} color="var(--spira-ink)" /> Atrás
          </button>
        )}
        {submitError && <div style={{ ...submitErrorBox, flex: 1, margin: '0 14px', minWidth: 0 }} aria-live="assertive">{submitError}</div>}
        {step < 3 ? (
          <button
            type="button"
            onClick={next}
            disabled={!canAdvance()}
            style={{ ...btnPrimary(accentSolid), height: 42, marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8, opacity: canAdvance() ? 1 : 0.6 }}
          >
            Siguiente <Icon name="arrowRight" size={16} color="var(--spira-on-accent)" />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void submitReception()}
            disabled={submitBusy || (isIp && ipUnits.length === 0)}
            style={{ ...btnPrimary(accentSolid), height: 42, marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8, opacity: submitBusy ? 0.7 : 1 }}
          >
            {submitBusy ? (isIp ? `Creando ${ipUnits.length} unidades…` : 'Creando…') : 'Crear recepción'}
            {!submitBusy && <Icon name="check" size={16} color="var(--spira-on-accent)" />}
          </button>
        )}
      </div>

      {/* Modal de confirmación de descarte (se muestra solo si `confirmDiscard` tiene una acción) */}
      {confirmDiscard && (
        <Modal title="¿Descartar la recepción en curso?" onClose={() => setConfirmDiscard(null)}>
          <p style={{ fontSize: 14, color: 'var(--spira-muted)', lineHeight: 1.5 }}>Cargaste medicamentos en esta recepción. Si seguís, se pierden.</p>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
            <button type="button" onClick={() => setConfirmDiscard(null)} style={btnOutline}>Volver</button>
            <button type="button" onClick={() => { const a = confirmDiscard; setConfirmDiscard(null); a?.() }} style={btnPrimary('var(--spira-danger)')}>Descartar</button>
          </div>
        </Modal>
      )}
    </div>
  )
}

const footerBar: CSSProperties = {
  position: 'sticky', bottom: 0, zIndex: 10,
  margin: '0 -26px -26px', padding: '14px 26px',
  borderTop: '1px solid var(--spira-line)', background: 'var(--spira-white)',
  display: 'flex', alignItems: 'center',
}
const submitErrorBox: CSSProperties = {
  fontSize: 13, color: 'var(--spira-danger)', background: 'rgba(166,72,59,0.10)',
  borderRadius: 8, padding: '8px 12px',
}
```

- [ ] **Step 3: Reescribir `src/views/pharma/wizard/Step3Summary.tsx` (presentacional + re-piel)**

```tsx
import { fieldInput } from '../../../components/FormField'
import { Icon } from '../../../components/Icon'
import { formatAR } from '../../../lib/dates'
import type { CountedMed } from '../ReceptionWizard'

interface Props {
  meds: CountedMed[]
  receptionDate: string
  notes: string
  setReceptionDate: (v: string) => void
  setNotes: (v: string) => void
}

/**
 * Paso 3 del wizard de recepción (rama base): fecha, notas y repaso del contenido.
 * Presentacional: el CTA "Crear recepción" y el submit viven en la barra del wizard.
 */
export function Step3Summary({ meds, receptionDate, notes, setReceptionDate, setNotes }: Props) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 780 }}>
      {/* Fecha y notas */}
      <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: 14 }}>
        <label>
          <div className="spira-eyebrow" style={{ marginBottom: 8 }}>Fecha de recepción</div>
          <input type="date" value={receptionDate} onChange={(e) => setReceptionDate(e.target.value)} required style={fieldInput} />
        </label>
        <label>
          <div className="spira-eyebrow" style={{ marginBottom: 8 }}>Notas (opcional)</div>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Remito, observaciones…" style={fieldInput} />
        </label>
      </div>

      {/* Repaso de medicamentos y lotes: card única con renglones divididos */}
      <div style={{ background: 'var(--spira-white)', border: '1px solid var(--spira-line)', borderRadius: 16, padding: '2px 18px', boxShadow: 'var(--spira-shadow-sm)' }}>
        {meds.map((m, i) => (
          <div key={m.medicationId} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '14px 0', borderTop: i > 0 ? '1px solid var(--spira-line)' : 'none' }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontFamily: 'var(--spira-font-display)', fontWeight: 700, fontSize: 15 }}>{m.name}</div>
              {m.lots.map((l) => (
                <div key={l.key} style={{ fontSize: 12.5, color: 'var(--spira-muted)', marginTop: 2 }}>
                  lote <span className="spira-mono">{l.lotNumber || '—'}</span>
                  {l.expiryDate && <> · vence {formatAR(l.expiryDate)}</>} · {l.quantity}
                </div>
              ))}
            </div>
            <span className="spira-mono" style={{ fontFamily: 'var(--spira-font-display)', fontWeight: 700, fontSize: 18 }}>{m.quantity}</span>
          </div>
        ))}
      </div>

      {/* Nota de trazabilidad (handoff 1d) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 12.5, color: 'var(--spira-muted)' }}>
        <Icon name="shield" size={15} color="var(--spira-muted)" /> Queda registrada con trazabilidad completa.
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Reescribir `src/views/pharma/wizard/Step3SummaryIp.tsx` (presentacional + re-piel)**

```tsx
import { useMemo } from 'react'
import { fieldInput } from '../../../components/FormField'
import { Icon } from '../../../components/Icon'
import type { IpUnitDraft } from '../ReceptionWizard'

interface Props {
  units: IpUnitDraft[]
  receptionDate: string
  notes: string
  setReceptionDate: (d: string) => void
  setNotes: (n: string) => void
}

/**
 * Paso 3 del wizard de IP: fecha, notas y resumen agregado. Presentacional:
 * el CTA "Crear recepción" y el submit (con el guard de kits vacíos) viven en el wizard.
 */
export function Step3SummaryIp({ units, receptionDate, notes, setReceptionDate, setNotes }: Props) {
  // Métricas agregadas del lote a recibir. `porVencer` abarca las ya vencidas más las que
  // vencen en los próximos 30 días, alineado con los flags `vencida`/`por_vencer` de v_ip_units.
  const agg = useMemo(() => {
    const conDroga = units.filter((u) => u.drugId).length
    const in30 = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10)
    const porVencer = units.filter((u) => u.expiryDate && u.expiryDate < in30).length
    return { total: units.length, conDroga, cegadas: units.length - conDroga, porVencer }
  }, [units])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 780 }}>
      {/* Fecha y notas */}
      <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: 14 }}>
        <label>
          <div className="spira-eyebrow" style={{ marginBottom: 8 }}>Fecha de recepción</div>
          <input type="date" value={receptionDate} onChange={(e) => setReceptionDate(e.target.value)} style={fieldInput} />
        </label>
        <label>
          <div className="spira-eyebrow" style={{ marginBottom: 8 }}>Notas (opcional)</div>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Opcional" style={fieldInput} />
        </label>
      </div>

      {/* Resumen agregado: total en display grande, desgloses en muted */}
      <div style={{ background: 'var(--spira-white)', border: '1px solid var(--spira-line)', borderRadius: 16, padding: '16px 18px', boxShadow: 'var(--spira-shadow-sm)' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span className="spira-mono" style={{ fontFamily: 'var(--spira-font-display)', fontWeight: 700, fontSize: 24 }}>{agg.total}</span>
          <span style={{ fontWeight: 600 }}>{agg.total === 1 ? 'unidad' : 'unidades'}</span>
        </div>
        <div style={{ color: 'var(--spira-muted)', fontSize: 13.5, marginTop: 6 }}>
          {agg.conDroga} con droga · {agg.cegadas} cegadas
          {agg.porVencer ? ` · ${agg.porVencer} vencidas/por vencer` : ''}
        </div>
      </div>

      {/* Nota de trazabilidad (handoff 1d) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 12.5, color: 'var(--spira-muted)' }}>
        <Icon name="shield" size={15} color="var(--spira-muted)" /> Queda registrada con trazabilidad completa, unidad por unidad.
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck` — Esperado: verde.

- [ ] **Step 6: Commit**

```bash
git add src/components/Stepper.tsx src/views/pharma/ReceptionWizard.tsx src/views/pharma/wizard/Step3Summary.tsx src/views/pharma/wizard/Step3SummaryIp.tsx
git commit -m "feat(pharma): wizard 1d — stepper del handoff, barra fija abajo y submit lifteado (Step3 presentacionales)"
```

---

## Task 5: Paso de escaneo base (2a) — ScanField + lista con stepper

**Files:**
- Create: `src/views/pharma/wizard/ScanField.tsx`
- Rewrite: `src/views/pharma/wizard/Step1Scan.tsx`

**Interfaces:**
- Consumes: `CountedMed` con `code?: string` (Task 4); íconos `barcodeSearch`/`minus`/`box` (Task 2); `resolveCode`/`linkCode`/`assignMedicationToProtocol`/`useMedications` (sin cambios); `MedicationPicker` (sin cambios).
- Produces: `ScanField({ label, placeholder, value, onChange, onSubmit, accentSolid, inputRef })` — lo consume también la Task 8 (Step1ScanIp).

- [ ] **Step 1: Crear `src/views/pharma/wizard/ScanField.tsx`**

```tsx
import type { KeyboardEvent, RefObject } from 'react'
import { Icon } from '../../../components/Icon'

interface Props {
  label: string
  placeholder: string
  value: string
  onChange: (v: string) => void
  onSubmit: () => void
  accentSolid: string
  inputRef: RefObject<HTMLInputElement | null>
}

/**
 * Buscador central de escaneo (lenguaje 2a del handoff), compartido por la rama base y la IP.
 * El borde ámbar va SIEMPRE visible (no es un estado de foco): es la affordance de la acción
 * primaria del paso, que además vive autofocuseada. `0x1f` ≈ 12% de alfa para el halo.
 * Enter y el botón "Buscar" disparan el mismo onSubmit.
 */
export function ScanField({ label, placeholder, value, onChange, onSubmit, accentSolid, inputRef }: Props) {
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => { if (e.key === 'Enter') { e.preventDefault(); onSubmit() } }
  return (
    <div>
      <div className="spira-eyebrow" style={{ marginBottom: 9 }}>{label}</div>
      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{ position: 'relative', flex: 1, display: 'flex', alignItems: 'center' }}>
          <input
            ref={inputRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={onKey}
            autoFocus
            className="spira-mono"
            placeholder={placeholder}
            style={{
              width: '100%', height: 50, padding: '0 48px 0 16px', borderRadius: 12,
              background: 'var(--spira-white)', border: `2px solid ${accentSolid}`,
              boxShadow: `0 0 0 3px ${accentSolid}1f`, color: 'var(--spira-ink)', fontSize: 15,
            }}
          />
          <span style={{ position: 'absolute', right: 15, display: 'grid', placeItems: 'center', pointerEvents: 'none' }}>
            <Icon name="barcodeSearch" size={22} color={accentSolid} stroke={1.7} />
          </span>
        </div>
        <button
          type="button"
          onClick={onSubmit}
          style={{
            height: 50, padding: '0 22px', border: 'none', borderRadius: 12, background: accentSolid,
            color: 'var(--spira-on-accent)', fontFamily: 'var(--spira-font-text)', fontWeight: 600, fontSize: 14.5, cursor: 'pointer',
          }}
        >
          Buscar
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Reescribir `src/views/pharma/wizard/Step1Scan.tsx`**

```tsx
import { useRef, useState } from 'react'
import { fieldInput } from '../../../components/FormField'
import { btnOutline, btnPrimary } from '../../../components/buttons'
import { EmptyState } from '../../../components/EmptyState'
import { Icon } from '../../../components/Icon'
import { MedicationPicker } from '../MedicationPicker'
import { ScanField } from './ScanField'
import { resolveCode, linkCode, assignMedicationToProtocol, useMedications } from '../../../data/pharma'
import type { ReceptionKind } from '../../../data/pharma'
import type { CountedMed } from '../ReceptionWizard'

interface Props { tipo: ReceptionKind; protocolId: string; accentSolid: string; meds: CountedMed[]; setMeds: React.Dispatch<React.SetStateAction<CountedMed[]>> }

/**
 * Paso 1 del wizard de recepción (rama base), lenguaje 2a del handoff: buscador central
 * grande + lista de medicamentos cargados en card con stepper −/+ por fila y footer contador.
 * El flujo no cambia: escanear suma +1 (resolveCode), código desconocido abre el panel de
 * asociación (linkCode), y "Buscar a mano" (link, plegado por defecto) muestra el typeahead.
 */
export function Step1Scan({ tipo, protocolId, accentSolid, meds, setMeds }: Props) {
  const catalog = useMedications(); const all = catalog.data ?? []
  const [scan, setScan] = useState(''); const [msg, setMsg] = useState<string | null>(null)
  const [unknown, setUnknown] = useState<string | null>(null); const [linkId, setLinkId] = useState(''); const [linkErr, setLinkErr] = useState<string | null>(null)
  const [manualOpen, setManualOpen] = useState(false)
  const scanRef = useRef<HTMLInputElement>(null)

  const ensureAssigned = async (medicationId: string): Promise<string | null> => {
    if (tipo !== 'protocolo') return null
    const r = await assignMedicationToProtocol(protocolId, medicationId); return r.error
  }
  // `code` viaja solo en el alta de la fila (para mostrar el EAN); los deltas posteriores no lo pisan.
  const bump = (medicationId: string, name: string, delta = 1, code?: string) => {
    setMeds((prev) => {
      const i = prev.findIndex((m) => m.medicationId === medicationId)
      if (i === -1) return delta > 0 ? [...prev, { medicationId, name, quantity: 1, lots: [], code }] : prev
      const next = [...prev]; const q = Math.max(0, next[i].quantity + delta)
      if (q === 0) return next.filter((_, j) => j !== i)
      next[i] = { ...next[i], quantity: q, code: next[i].code ?? code }; return next
    })
  }
  const remove = (medicationId: string) => setMeds((prev) => prev.filter((m) => m.medicationId !== medicationId))
  const handleScan = async () => {
    const code = scan.trim(); if (!code) return; setScan(''); setMsg(null)
    const med = await resolveCode(code)
    if (!med) { setUnknown(code); setLinkId(''); setLinkErr(null); return }
    const aerr = await ensureAssigned(med.id); if (aerr) { setMsg(aerr); return }
    bump(med.id, med.name, +1, code); setMsg(`+1 ${med.name}`)
    scanRef.current?.focus()
  }
  const confirmLink = async () => {
    if (!unknown || !linkId) return
    const res = await linkCode(unknown, linkId); if (res.error) { setLinkErr(res.error); return }
    const aerr = await ensureAssigned(linkId); if (aerr) { setLinkErr(aerr); return }
    const m = all.find((x) => x.id === linkId); if (m) bump(m.id, m.name, +1, unknown)
    setUnknown(null); setLinkId(''); setMsg('Código guardado y +1')
    scanRef.current?.focus()
  }

  const totalItems = meds.reduce((s, m) => s + m.quantity, 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 820 }}>
      <ScanField
        label="Escáner (código de barras)"
        placeholder="Escaneá o tipeá el código y Enter"
        value={scan}
        onChange={setScan}
        onSubmit={() => void handleScan()}
        accentSolid={accentSolid}
        inputRef={scanRef}
      />
      {/* Ayuda + atajo "a mano" en un solo renglón (handoff 1d, paso Escaneo) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--spira-muted)', flexWrap: 'wrap' }}>
        Cada beep suma una unidad. Ajustá la cantidad con − / + si hace falta.
        <span style={{ color: 'var(--spira-line-2)' }}>·</span>
        ¿Sin lector?
        <button
          type="button"
          onClick={() => setManualOpen((v) => !v)}
          aria-expanded={manualOpen}
          style={{ border: 'none', background: 'transparent', padding: 0, color: accentSolid, fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'var(--spira-font-text)' }}
        >
          Buscar a mano
        </button>
      </div>
      <div aria-live="polite" style={{ fontSize: 12.5, color: 'var(--spira-muted)', minHeight: 18 }}>{msg ?? ''}</div>

      {unknown && (
        <div style={linkPanel}>
          <span style={{ fontSize: 12.5, color: 'var(--spira-muted)' }}>Código <span className="spira-mono" style={{ color: 'var(--spira-ink)', fontWeight: 600 }}>{unknown}</span> sin asociar. ¿A qué medicamento corresponde?</span>
          <select value={linkId} onChange={(e) => setLinkId(e.target.value)} style={{ ...fieldInput, height: 38 }}>
            <option value="" disabled>Elegí el medicamento</option>
            {all.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
          {linkErr && <div style={errorBox} aria-live="assertive">{linkErr}</div>}
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={() => void confirmLink()} disabled={!linkId} style={{ ...btnPrimary(accentSolid), height: 38, opacity: linkId ? 1 : 0.6 }}>Asociar y agregar</button>
            <button type="button" onClick={() => setUnknown(null)} style={{ ...btnOutline, height: 38 }}>No asociar</button>
          </div>
        </div>
      )}

      {manualOpen && (
        <MedicationPicker accent={accentSolid} onPick={async (id) => { try { const m = all.find((x) => x.id === id); if (!m) return; const e = await ensureAssigned(id); if (e) { setMsg(e); return } bump(id, m.name) } catch (err) { setMsg(err instanceof Error ? err.message : 'No se pudo agregar el medicamento') } }} />
      )}

      {meds.length === 0 ? (
        /* `package` no existe en IconName; se usa `box` que es semánticamente equivalente
           (caja/paquete de medicamentos). Adaptación necesaria por strict TS. */
        <EmptyState accent={accentSolid} icon="box" title="Escaneá el primer medicamento" description="Cada beep suma uno. Ajustá la cantidad con − / + si hace falta." minHeight={200} />
      ) : (
        <div style={listCard}>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {meds.map((m, i) => (
              <li key={m.medicationId} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '11px 18px', borderTop: i > 0 ? '1px solid var(--spira-line)' : 'none' }}>
                <span style={iconSq}>
                  <Icon name="pill" size={19} color="var(--spira-pharma-solid)" stroke={1.9} />
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14.5, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.name}</div>
                  {m.code && <div className="spira-mono" style={{ fontSize: 12, color: 'var(--spira-muted)', marginTop: 1 }}>{m.code}</div>}
                </div>
                {/* Stepper −/+ agrupado (handoff 2a); 44px de alto = hit target de la nota del handoff */}
                <div style={qtyGroup}>
                  <button type="button" aria-label="Restar uno" onClick={() => bump(m.medicationId, m.name, -1)} style={qtyBtn}>
                    <Icon name="minus" size={14} color="var(--spira-muted)" stroke={2.2} />
                  </button>
                  <span className="spira-mono" style={{ minWidth: 30, textAlign: 'center', fontFamily: 'var(--spira-font-display)', fontWeight: 700, fontSize: 15 }}>{m.quantity}</span>
                  <button type="button" aria-label="Sumar uno" onClick={() => bump(m.medicationId, m.name, +1)} style={qtyBtn}>
                    <Icon name="plus" size={14} color="var(--spira-pharma-solid)" stroke={2.2} />
                  </button>
                </div>
                <button type="button" aria-label={`Quitar ${m.name}`} onClick={() => remove(m.medicationId)} style={delBtn}>
                  <Icon name="x" size={16} color="var(--spira-faint)" />
                </button>
              </li>
            ))}
          </ul>
          {/* Footer contador (handoff 2a): números en display */}
          <div style={listFooter}>
            <Icon name="box" size={16} color="var(--spira-faint)" />
            <span>
              <strong style={contadorNum}>{meds.length}</strong> {meds.length === 1 ? 'medicamento' : 'medicamentos'}
              {' · '}
              <strong style={contadorNum}>{totalItems}</strong> {totalItems === 1 ? 'ítem' : 'ítems'}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

const linkPanel = { border: '1px solid rgba(176,130,63,0.38)', background: 'rgba(176,130,63,0.10)', borderRadius: 12, padding: '12px 13px', display: 'flex', flexDirection: 'column', gap: 10 } as const
const errorBox = { fontSize: 13, color: 'var(--spira-danger)', background: 'rgba(166,72,59,0.10)', borderRadius: 8, padding: '8px 12px' } as const
const listCard = { background: 'var(--spira-white)', border: '1px solid var(--spira-line)', borderRadius: 16, overflow: 'hidden', boxShadow: 'var(--spira-shadow-sm)' } as const
const iconSq = { width: 38, height: 38, flex: '0 0 auto', borderRadius: 10, background: 'rgba(168,132,47,.13)', display: 'grid', placeItems: 'center' } as const
const qtyGroup = { display: 'inline-flex', alignItems: 'center', border: '1px solid var(--spira-line-2)', borderRadius: 9, overflow: 'hidden', background: 'var(--spira-white)' } as const
const qtyBtn = { width: 40, height: 44, border: 'none', background: 'transparent', cursor: 'pointer', display: 'grid', placeItems: 'center' } as const
const delBtn = { width: 40, height: 44, border: 'none', background: 'transparent', cursor: 'pointer', display: 'grid', placeItems: 'center', borderRadius: 8 } as const
const listFooter = { borderTop: '1px solid var(--spira-line)', background: 'var(--spira-surface)', padding: '13px 18px', display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: 'var(--spira-muted)' } as const
const contadorNum = { color: 'var(--spira-ink)', fontWeight: 700, fontFamily: 'var(--spira-font-display)', fontSize: 15, fontVariantNumeric: 'tabular-nums' } as const
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck` — Esperado: verde.

- [ ] **Step 4: Commit**

```bash
git add src/views/pharma/wizard/ScanField.tsx src/views/pharma/wizard/Step1Scan.tsx
git commit -m "feat(pharma): paso de escaneo 2a — ScanField central + lista con stepper y footer contador"
```

---

## Task 6: Re-piel de Lotes (Paso 2 base)

**Files:**
- Rewrite: `src/views/pharma/wizard/Step2Lots.tsx`

**Interfaces:**
- Consumes: `Badge` (Task 2); `CountedMed`/`LotDraft` (sin cambios de forma en esta task).
- Produces: mismo contrato (`{ meds, setMeds, accentSolid }`).

- [ ] **Step 1: Reescribir `src/views/pharma/wizard/Step2Lots.tsx`**

```tsx
import type { CountedMed, LotDraft } from '../ReceptionWizard'
import { fieldInput } from '../../../components/FormField'
import { Badge } from '../../../components/Badge'
import { Icon } from '../../../components/Icon'

interface Props { meds: CountedMed[]; setMeds: React.Dispatch<React.SetStateAction<CountedMed[]>>; accentSolid: string }
const today = () => new Date().toISOString().slice(0, 10)

/**
 * Paso 2 del wizard de recepción (rama base): lotes por medicamento. Re-piel del handoff 1d:
 * card blanca por medicamento con badge de cobertura (X / Y), labels de columna y botón
 * dashed "Dividir en varios lotes". La validación (duplicados, vacíos, suma == cantidad,
 * vencimiento pasado que avisa pero no bloquea) no cambia.
 */
export function Step2Lots({ meds, setMeds, accentSolid: _accentSolid }: Props) {
  const patch = (mi: string, key: number, p: Partial<LotDraft>) =>
    setMeds((prev) => prev.map((m) => m.medicationId !== mi ? m : { ...m, lots: m.lots.map((l) => l.key === key ? { ...l, ...p } : l) }))
  const addLot = (mi: string) =>
    setMeds((prev) => prev.map((m) => m.medicationId !== mi ? m : { ...m, lots: [...m.lots, { key: Math.max(0, ...m.lots.map((l) => l.key)) + 1, lotNumber: '', expiryDate: '', quantity: '0' }] }))
  const delLot = (mi: string, key: number) =>
    setMeds((prev) => prev.map((m) => m.medicationId !== mi || m.lots.length <= 1 ? m : { ...m, lots: m.lots.filter((l) => l.key !== key) }))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 840 }}>
      {meds.map((m) => {
        const t = today()
        const sum = m.lots.reduce((s, l) => s + (Number(l.quantity) || 0), 0)
        const rest = m.quantity - sum
        const lotNums = m.lots.map((l) => l.lotNumber.trim()).filter(Boolean)
        const hasEmpty = m.lots.some((l) => !l.lotNumber.trim())
        const dup = new Set(lotNums).size !== lotNums.length
        const hasPast = m.lots.some((l) => l.expiryDate && l.expiryDate < t)
        return (
          <div key={m.medicationId} style={medCard}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 12 }}>
              <span style={{ fontFamily: 'var(--spira-font-display)', fontWeight: 700, fontSize: 16 }}>{m.name}</span>
              <span aria-live="polite">
                <Badge tone={rest === 0 ? 'good' : 'warn'}>
                  {rest === 0 ? `Cantidad cubierta · ${m.quantity} / ${m.quantity}` : rest > 0 ? `Faltan ${rest} · ${sum} / ${m.quantity}` : `Sobran ${-rest} · ${sum} / ${m.quantity}`}
                </Badge>
              </span>
            </div>
            {/* Labels de columna (handoff 1d, paso Lotes) */}
            <div style={{ ...lotGrid, fontSize: 11.5, color: 'var(--spira-faint)', marginBottom: 6 }}>
              <span>Número de lote</span><span>Vencimiento</span><span>Cantidad</span><span />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {m.lots.map((l) => {
                const past = l.expiryDate && l.expiryDate < t
                return (
                  <div key={l.key} style={lotGrid}>
                    <input value={l.lotNumber} onChange={(e) => patch(m.medicationId, l.key, { lotNumber: e.target.value })} placeholder="Lote" className="spira-mono" style={{ ...fieldInput, height: 42 }} />
                    {/* Lote vencido en danger (spec del handoff); avisa pero NO bloquea. */}
                    <input type="date" value={l.expiryDate} onChange={(e) => patch(m.medicationId, l.key, { expiryDate: e.target.value })} style={{ ...fieldInput, height: 42, borderColor: past ? 'var(--spira-danger)' : undefined }} />
                    <input type="number" min={0} value={l.quantity} onChange={(e) => patch(m.medicationId, l.key, { quantity: e.target.value })} style={{ ...fieldInput, height: 42 }} />
                    <button type="button" aria-label="Quitar lote" onClick={() => delLot(m.medicationId, l.key)} disabled={m.lots.length <= 1} style={{ ...delLotBtn, cursor: m.lots.length <= 1 ? 'default' : 'pointer', opacity: m.lots.length <= 1 ? 0.5 : 1 }}>
                      <Icon name="x" size={16} color="var(--spira-muted)" />
                    </button>
                  </div>
                )
              })}
            </div>
            {(dup || hasEmpty) && (
              <div style={{ fontSize: 12.5, color: 'var(--spira-danger)', marginTop: 6 }} aria-live="assertive">
                {dup ? 'Hay lotes repetidos en este medicamento.' : 'Cada lote necesita un número de lote.'}
              </div>
            )}
            {hasPast && <div style={{ fontSize: 12.5, color: 'var(--spira-danger)', marginTop: 6 }}>Hay un lote con vencimiento pasado — revisalo (no bloquea).</div>}
            <button type="button" onClick={() => addLot(m.medicationId)} style={addLotBtn}>
              <Icon name="plus" size={15} color="var(--spira-muted)" /> Dividir en varios lotes
            </button>
          </div>
        )
      })}
    </div>
  )
}

const medCard = { background: 'var(--spira-white)', border: '1px solid var(--spira-line)', borderRadius: 16, padding: '16px 18px', boxShadow: 'var(--spira-shadow-sm)' } as const
const lotGrid = { display: 'grid', gridTemplateColumns: '1.3fr 1fr 0.7fr 44px', gap: 8, alignItems: 'center' } as const
const delLotBtn = { width: 44, height: 44, borderRadius: 9, border: '1px solid var(--spira-line)', background: 'var(--spira-white)', display: 'grid', placeItems: 'center' } as const
const addLotBtn = { marginTop: 12, height: 38, padding: '0 14px', border: '1px dashed var(--spira-line-2)', borderRadius: 9, background: 'var(--spira-surface)', color: 'var(--spira-ink)', fontFamily: 'var(--spira-font-text)', fontWeight: 600, fontSize: 13, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 7 } as const
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck` — Esperado: verde.

- [ ] **Step 3: Commit**

```bash
git add src/views/pharma/wizard/Step2Lots.tsx
git commit -m "feat(pharma): re-piel del paso Lotes — cards blancas, badge de cobertura y labels de columna"
```

---

## Task 7: Re-piel del Setup (Paso 0) — cards de tipo

**Files:**
- Rewrite: `src/views/pharma/wizard/Step0Setup.tsx`

**Interfaces:**
- Consumes: `useProtocols`; íconos existentes `file`/`flask`/`pill`.
- Produces: mismo contrato (`{ accentSolid, tipo, protocolId, onTipo, onProtocol }`) — el guard de descarte sigue viviendo en el wizard (llega vía `onTipo`).

- [ ] **Step 1: Reescribir `src/views/pharma/wizard/Step0Setup.tsx`**

En el mock, "Producto Investigación" figura deshabilitado ("Próximamente") porque el diseño es anterior al merge del IP. En la app el IP **ya está habilitado** [PRESERVAR]: las tres cards son seleccionables, en el orden vigente de la app (Protocolo / Investigación / Ambulatoria).

```tsx
import type { CSSProperties } from 'react'
import { fieldInput } from '../../../components/FormField'
import { Icon } from '../../../components/Icon'
import type { IconName } from '../../../components/Icon'
import { useProtocols } from '../../../data/protocols'
import type { ReceptionKind } from '../../../data/pharma'

interface Props {
  accentSolid: string
  tipo: ReceptionKind
  protocolId: string
  onTipo: (t: ReceptionKind) => void
  onProtocol: (id: string) => void
}

/** Cards de tipo (handoff 1d): ícono teñido + título display + descripción. En el mock el IP
 *  estaba "Próximamente"; acá está habilitado (post-merge de feat/pharma-ip) [PRESERVAR]. */
const TIPOS: { value: ReceptionKind; title: string; desc: string; icon: IconName; tint: string; iconColor: string }[] = [
  { value: 'protocolo', title: 'Farmacia Protocolo', desc: 'Medicación del estudio, asociada a un protocolo.', icon: 'file', tint: 'rgba(168,132,47,.14)', iconColor: 'var(--spira-pharma-solid)' },
  { value: 'investigacion', title: 'Producto Investigación', desc: 'Kits del sponsor rastreados por unidad (N° de kit).', icon: 'flask', tint: 'rgba(15,95,87,.10)', iconColor: 'var(--spira-primary)' },
  { value: 'ambulatoria', title: 'Farmacia Ambulatoria', desc: 'Medicación de farmacia general, sin protocolo.', icon: 'pill', tint: 'rgba(58,107,140,.12)', iconColor: 'var(--spira-contable)' },
]

/**
 * Paso 0 del wizard de recepción: selección de tipo (cards) y, si aplica, el protocolo.
 * Tanto Protocolo como Producto Investigación exigen elegir un protocolo antes de avanzar
 * (lo valida `canAdvance` en el wizard). Cambiar de tipo con datos cargados pasa por el
 * guard de descarte (el wizard envuelve onTipo).
 */
export function Step0Setup({ accentSolid, tipo, protocolId, onTipo, onProtocol }: Props) {
  const protocols = useProtocols()
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22, maxWidth: 780 }}>
      <div>
        <div className="spira-eyebrow" style={{ marginBottom: 11 }}>Tipo de recepción</div>
        <div role="radiogroup" aria-label="Tipo de recepción" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
          {TIPOS.map((t) => {
            const selected = t.value === tipo
            return (
              <button
                key={t.value}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => !selected && onTipo(t.value)}
                style={{
                  ...tipoCard,
                  ...(selected
                    ? { border: `1.5px solid ${accentSolid}`, boxShadow: `0 0 0 3px ${accentSolid}21` }
                    : { border: '1px solid var(--spira-line-2)' }),
                }}
              >
                <span style={{ width: 36, height: 36, borderRadius: 10, background: t.tint, display: 'grid', placeItems: 'center' }}>
                  <Icon name={t.icon} size={19} color={t.iconColor} stroke={1.9} />
                </span>
                <span style={{ fontFamily: 'var(--spira-font-display)', fontWeight: 700, fontSize: 15 }}>{t.title}</span>
                <span style={{ fontSize: 12.5, color: 'var(--spira-muted)', lineHeight: 1.4 }}>{t.desc}</span>
              </button>
            )
          })}
        </div>
      </div>
      {(tipo === 'protocolo' || tipo === 'investigacion') && (
        <label style={{ maxWidth: 480 }}>
          <div className="spira-eyebrow" style={{ marginBottom: 9 }}>Protocolo</div>
          <select value={protocolId} onChange={(e) => onProtocol(e.target.value)} required style={fieldInput}>
            <option value="" disabled>Elegí un protocolo</option>
            {(protocols.data ?? []).map((p) => (
              <option key={p.id} value={p.id}>{p.code} — {p.name}</option>
            ))}
          </select>
          <div style={{ fontSize: 12.5, color: 'var(--spira-faint)', marginTop: 8 }}>Vas a recibir medicación para el protocolo seleccionado.</div>
        </label>
      )}
    </div>
  )
}

const tipoCard: CSSProperties = {
  display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 7,
  padding: '15px 16px', borderRadius: 12, background: 'var(--spira-white)',
  cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--spira-font-text)',
  transition: 'border-color 0.14s, box-shadow 0.14s',
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck` — Esperado: verde.

- [ ] **Step 3: Commit**

```bash
git add src/views/pharma/wizard/Step0Setup.tsx
git commit -m "feat(pharma): Setup del wizard — cards de tipo del handoff (3 ambitos habilitados)"
```

---

## Task 8: Re-piel de los pasos IP (Escaneo + Revisión)

**Files:**
- Modify: `src/views/pharma/wizard/Step1ScanIp.tsx`
- Modify: `src/views/pharma/wizard/Step2ReviewIp.tsx`

**Interfaces:**
- Consumes: `ScanField` (Task 5), `DrugPicker` (sin cambios). El escaneo del IP **no parsea** (kit = código crudo, ver spec §12); `parseGs1` no se usa acá.
- Produces: mismos contratos de props.

- [ ] **Step 1: Reescribir `src/views/pharma/wizard/Step1ScanIp.tsx`**

Preservar: el escaneo toma el código crudo como N° de kit (SIN parsear — spec §12), una fila por unidad, alta ARRIBA de la lista, dedup por kit, `DrugPicker` por fila, chip de droga clickeable para revertir, escáner sticky. Lote/vto se tipean en Revisión. Solo cambia la piel (ScanField + card de lista con filas divididas). **Nota:** si esta task corre post-merge del fix del 2026-07-01, el componente YA está sin parser — este bloque es la versión re-pielada de ese mismo flujo.

```tsx
import { useRef, useState } from 'react'
import { EmptyState } from '../../../components/EmptyState'
import { Icon } from '../../../components/Icon'
import { DrugPicker } from '../DrugPicker'
import { ScanField } from './ScanField'
import type { IpUnitDraft } from '../ReceptionWizard'

interface Props { accentSolid: string; units: IpUnitDraft[]; setUnits: React.Dispatch<React.SetStateAction<IpUnitDraft[]>> }

/**
 * Paso 1 del wizard de recepción IP (Producto de Investigación).
 *
 * El operador apunta el lector al código del kit → el string que emite el escáner ES el
 * N° de kit (identificador IVRS/IWRS del sponsor): se toma crudo, SIN parsear. Se confirmó
 * con escaneos reales (2026-07-01) que los kits usan códigos propietarios lineales (`D…`,
 * `K…`, numéricos, según protocolo), NO DataMatrix GS1: no traen GTIN/lote/vencimiento
 * embebidos. Cada beep agrega una fila arriba (última escaneada visible sin scrollear).
 *
 * El lote y el vencimiento van IMPRESOS en la etiqueta (no en el código) → se cargan a mano
 * en el Paso 2 (Revisión), donde además se puede corregir cualquier dato.
 *
 * Por fila: el operador puede asignar la droga con `DrugPicker` (principio activo).
 * En ensayos ciegos la droga puede quedar sin asignar ("Cegado"). Si la asigna,
 * aparece como chip clickeable para revertir.
 *
 * Dedup: se bloquea re-escanear el mismo kit (por `kitNumber`). El mensaje de estado
 * (`aria-live`) da feedback inmediato sin interrumpir el flujo.
 */
export function Step1ScanIp({ accentSolid, units, setUnits }: Props) {
  const [scan, setScan] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const scanRef = useRef<HTMLInputElement>(null)
  const nextKey = useRef(1)

  // Agrega una unidad arriba (última escaneada visible). Dedup por kit_number, o por raw_code si no hubo kit.
  // El feedback se calcula dentro del updater (puro) y se emite después: nada de side-effects en el updater.
  const addUnit = (u: Omit<IpUnitDraft, 'key'>) => {
    let feedback = ''
    setUnits((prev) => {
      const dupe = prev.some((p) =>
        (u.kitNumber && p.kitNumber === u.kitNumber) ||
        (!u.kitNumber && u.rawCode && p.rawCode === u.rawCode))
      if (dupe) { feedback = 'Esa unidad ya fue escaneada.'; return prev }
      feedback = `+1 ${u.kitNumber || u.rawCode || 'unidad'}`
      return [{ ...u, key: nextKey.current++ }, ...prev]
    })
    setMsg(feedback)
  }

  const handleScan = () => {
    // El código del kit ES el N° de kit (identificador IVRS del sponsor): se toma crudo, sin
    // parsear. Lote y vto no vienen en el código — se cargan a mano en el Paso 2 (Revisión).
    const code = scan.trim(); if (!code) return; setScan(''); setMsg(null)
    addUnit({ kitNumber: code, rawCode: code, gtin: '', lotNumber: '', expiryDate: '', drugId: '', drugName: '', manual: false })
    scanRef.current?.focus()
  }

  const setDrug = (key: number, drugId: string, drugName: string) =>
    setUnits((prev) => prev.map((u) => u.key === key ? { ...u, drugId, drugName } : u))
  const remove = (key: number) => setUnits((prev) => prev.filter((u) => u.key !== key))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 820 }}>
      {/* Escáner + contador: sticky, fuera del scroll de la lista. */}
      <div style={{ position: 'sticky', top: 0, background: 'var(--spira-paper)', zIndex: 5, paddingBottom: 8 }}>
        <ScanField
          label="Escáner (código del kit)"
          placeholder="Escaneá el kit y Enter"
          value={scan}
          onChange={setScan}
          onSubmit={handleScan}
          accentSolid={accentSolid}
          inputRef={scanRef}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 8 }}>
          <span aria-live="polite" style={{ fontSize: 12.5, color: 'var(--spira-muted)', minHeight: 18 }}>{msg ?? ''}</span>
          <span style={{ fontSize: 13, color: 'var(--spira-muted)', whiteSpace: 'nowrap' }}>
            <strong className="spira-mono" style={{ color: 'var(--spira-ink)', fontWeight: 700, fontFamily: 'var(--spira-font-display)', fontSize: 15 }}>{units.length}</strong>
            {' '}{units.length === 1 ? 'unidad' : 'unidades'}
          </span>
        </div>
      </div>

      {units.length === 0 ? (
        <EmptyState accent={accentSolid} icon="box" title="Escaneá el primer kit" description="Cada beep agrega una unidad. El lote y el vencimiento se cargan después, en Revisión." minHeight={200} />
      ) : (
        <ul style={listCard}>
          {units.map((u, i) => (
            <li key={u.key} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '11px 16px', borderTop: i > 0 ? '1px solid var(--spira-line)' : 'none' }}>
              <span style={iconSq}>
                <Icon name="flask" size={19} color="var(--spira-pharma-solid)" stroke={1.9} />
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="spira-mono" style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
                  {u.kitNumber || <span style={{ color: 'var(--spira-warn)' }}>Sin N° de kit</span>}
                </div>
                <div style={{ fontSize: 12, color: 'var(--spira-muted)', marginTop: 1 }}>
                  {u.lotNumber ? <>lote <span className="spira-mono">{u.lotNumber}</span></> : 'sin lote'}
                  {u.expiryDate ? ` · vence ${u.expiryDate}` : ''}
                </div>
              </div>
              <div style={{ width: 220, flex: '0 0 auto' }}>
                {u.drugId
                  ? <button type="button" aria-label={`Quitar droga ${u.drugName}`} style={drugChip} onClick={() => setDrug(u.key, '', '')}>{u.drugName} ✕</button>
                  : <DrugPicker accent={accentSolid} onPick={(id, name) => setDrug(u.key, id, name)} placeholder="Cegado — o elegí droga" />}
              </div>
              <button type="button" aria-label="Quitar unidad" onClick={() => remove(u.key)} style={delBtn}>
                <Icon name="x" size={16} color="var(--spira-faint)" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

const listCard = { listStyle: 'none', margin: 0, padding: 0, background: 'var(--spira-white)', border: '1px solid var(--spira-line)', borderRadius: 16, boxShadow: 'var(--spira-shadow-sm)', maxHeight: 460, overflowY: 'auto' } as const
const iconSq = { width: 38, height: 38, flex: '0 0 auto', borderRadius: 10, background: 'rgba(168,132,47,.13)', display: 'grid', placeItems: 'center' } as const
const drugChip = { display: 'inline-block', fontSize: 12.5, padding: '4px 10px', borderRadius: 999, background: 'var(--spira-surface)', color: 'var(--spira-ink)', cursor: 'pointer', border: 'none' } as const
const delBtn = { width: 40, height: 44, borderRadius: 8, border: 'none', background: 'transparent', cursor: 'pointer', display: 'grid', placeItems: 'center' } as const
```

- [ ] **Step 2: Reescribir `src/views/pharma/wizard/Step2ReviewIp.tsx`**

Preservar: selección múltiple + "seleccionar las sin droga" + droga masiva + limpieza de selección tras aplicar; edición de kit/lote/vto por fila; "Cegado" como estado neutro válido. **Y el bulk de lote/vto que ya existe en el archivo** ("Seleccionar todas" + panel para aplicar lote+vto a las seleccionadas — commiteado antes del merge del IP; NO lo pierdas). Cambia la piel: card única con encabezado de columnas.

```tsx
import { useState } from 'react'
import { fieldInput } from '../../../components/FormField'
import { btnOutline, btnPrimary } from '../../../components/buttons'
import { Badge } from '../../../components/Badge'
import { DrugPicker } from '../DrugPicker'
import type { IpUnitDraft } from '../ReceptionWizard'

interface Props { accentSolid: string; units: IpUnitDraft[]; setUnits: React.Dispatch<React.SetStateAction<IpUnitDraft[]>> }

/**
 * Paso 2 del wizard IP: revisión y corrección de las unidades escaneadas.
 * Permite editar N° de kit, lote y vto por fila. El lote y el vencimiento NO vienen en el
 * código del kit (van impresos) → se tipean acá; como un envío suele compartir tanda, hay
 * acción masiva: seleccionar filas (todas / las sin droga) y aplicarles lote+vto o droga de
 * una sola vez. Las filas sin droga muestran chip "Cegado" (neutro), estado válido y final,
 * no un error ni una advertencia de dato faltante.
 */
export function Step2ReviewIp({ accentSolid, units, setUnits }: Props) {
  const [selected, setSelected] = useState<Set<number>>(new Set())
  // Lote/vto a aplicar en masa: se tipean una vez y se vuelcan a las seleccionadas.
  const [bulkLot, setBulkLot] = useState('')
  const [bulkExp, setBulkExp] = useState('')

  // Parchea una sola unidad por key.
  const patch = (key: number, p: Partial<IpUnitDraft>) =>
    setUnits((prev) => prev.map((u) => u.key === key ? { ...u, ...p } : u))

  // Alterna la selección de una unidad.
  const toggle = (key: number) =>
    setSelected((s) => { const n = new Set(s); n.has(key) ? n.delete(key) : n.add(key); return n })

  // Selecciona solo las unidades sin droga asignada (cegadas).
  const selectBlind = () => setSelected(new Set(units.filter((u) => !u.drugId).map((u) => u.key)))

  // Selecciona/deselecciona todas (el caso más común: un envío entero comparte lote y vto).
  const allSelected = units.length > 0 && selected.size === units.length
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(units.map((u) => u.key)))

  // Aplica la droga elegida a todas las unidades seleccionadas y limpia la selección
  // (si no, el picker queda abierto y el contador muestra filas que ya tienen droga).
  const applyDrug = (drugId: string, drugName: string) => {
    setUnits((prev) => prev.map((u) => selected.has(u.key) ? { ...u, drugId, drugName } : u))
    setSelected(new Set())
  }

  // Aplica el lote y/o el vto a las seleccionadas. Solo vuelca los campos cargados: si dejás
  // el lote vacío y ponés solo vto (o al revés), no pisa el otro campo con vacío. Limpia todo
  // al terminar (misma convención que applyDrug).
  const applyLotExp = () => {
    const lot = bulkLot.trim()
    setUnits((prev) => prev.map((u) => selected.has(u.key)
      ? { ...u, ...(lot ? { lotNumber: lot } : {}), ...(bulkExp ? { expiryDate: bulkExp } : {}) }
      : u))
    setSelected(new Set())
    setBulkLot('')
    setBulkExp('')
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 900 }}>
      {/* Acciones masivas: selección + aplicar droga o lote/vto a las seleccionadas. */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <button type="button" onClick={toggleAll} style={btnOutline}>{allSelected ? 'Quitar selección' : 'Seleccionar todas'}</button>
          <button type="button" onClick={selectBlind} style={btnOutline}>Seleccionar las sin droga</button>
          <span style={{ fontSize: 12.5, color: 'var(--spira-muted)' }}>{selected.size} seleccionadas</span>
        </div>
        {selected.size > 0 && (
          <div style={bulkPanel}>
            <div style={{ width: 220 }}>
              <DrugPicker accent={accentSolid} onPick={applyDrug} placeholder="Aplicar droga a las seleccionadas" />
            </div>
            <span style={{ width: 1, height: 24, background: 'var(--spira-line-2)' }} />
            {/* Lote + vto en masa: un envío suele compartir tanda → se cargan una vez y se
                vuelcan a todas las seleccionadas. Cada fila sigue siendo editable para excepciones. */}
            <input value={bulkLot} onChange={(e) => setBulkLot(e.target.value)} placeholder="Lote" className="spira-mono" style={{ ...fieldInput, height: 38, width: 150 }} />
            <input type="date" value={bulkExp} onChange={(e) => setBulkExp(e.target.value)} aria-label="Vencimiento a aplicar a las seleccionadas" style={{ ...fieldInput, height: 38, width: 160 }} />
            <button type="button" onClick={applyLotExp} disabled={!bulkLot.trim() && !bulkExp} style={{ ...btnPrimary(accentSolid), height: 38, opacity: (!bulkLot.trim() && !bulkExp) ? 0.6 : 1 }}>Aplicar lote/vto</button>
          </div>
        )}
      </div>

      {/* Card única: encabezado de columnas + filas editables divididas (estética Sereno). */}
      <div style={{ background: 'var(--spira-white)', border: '1px solid var(--spira-line)', borderRadius: 16, boxShadow: 'var(--spira-shadow-sm)', overflow: 'hidden' }}>
        <div style={{ ...rowGrid, padding: '9px 16px', background: 'var(--spira-surface)', borderBottom: '1px solid var(--spira-line)', fontSize: 11.5, color: 'var(--spira-faint)' }}>
          <span /><span>N° de kit</span><span>Lote</span><span>Vencimiento</span><span>Droga</span>
        </div>
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, maxHeight: 440, overflowY: 'auto' }}>
          {units.map((u, i) => (
            <li key={u.key} style={{ ...rowGrid, padding: '9px 16px', borderTop: i > 0 ? '1px solid var(--spira-line)' : 'none' }}>
              <input type="checkbox" checked={selected.has(u.key)} onChange={() => toggle(u.key)} aria-label="Seleccionar unidad" />
              {/* N° de kit: identificador físico del kit de IP. */}
              <input value={u.kitNumber} onChange={(e) => patch(u.key, { kitNumber: e.target.value })} placeholder="N° de kit" className="spira-mono" style={{ ...fieldInput, height: 36 }} />
              {/* Lote: se carga a mano (no viene en el código del kit — spec §12). */}
              <input value={u.lotNumber} onChange={(e) => patch(u.key, { lotNumber: e.target.value })} placeholder="Lote" className="spira-mono" style={{ ...fieldInput, height: 36 }} />
              {/* Vencimiento: siempre <input type="date">, nunca texto libre. */}
              <input type="date" value={u.expiryDate} onChange={(e) => patch(u.key, { expiryDate: e.target.value })} style={{ ...fieldInput, height: 36 }} />
              {/* Droga: chip clickeable para quitar, o chip "Cegado" (estado válido, no error). */}
              {u.drugId
                ? <button type="button" aria-label={`Quitar droga ${u.drugName}`} style={drugChip} onClick={() => patch(u.key, { drugId: '', drugName: '' })}>{u.drugName} ✕</button>
                : <span style={{ justifySelf: 'start' }}><Badge>Cegado</Badge></span>}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

// Grilla compartida por encabezado y filas: checkbox + kit + lote + vto + droga.
const rowGrid = { display: 'grid', gridTemplateColumns: '24px 1fr 1.2fr 1fr 1.4fr', gap: 8, alignItems: 'center' } as const

// Panel de acciones masivas: agrupa droga + lote/vto sobre una superficie tenue.
const bulkPanel = { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '10px 12px', border: '1px solid var(--spira-line)', borderRadius: 12, background: 'var(--spira-surface)' } as const

// Chip de droga asignada: clicable para quitar. Tono ink sobre surface.
const drugChip = { fontSize: 12.5, padding: '4px 10px', borderRadius: 999, background: 'var(--spira-surface)', color: 'var(--spira-ink)', cursor: 'pointer', border: 'none', textAlign: 'center', justifySelf: 'stretch' } as const
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck` — Esperado: verde.

- [ ] **Step 4: Commit**

```bash
git add src/views/pharma/wizard/Step1ScanIp.tsx src/views/pharma/wizard/Step2ReviewIp.tsx
git commit -m "feat(pharma): re-piel pasos IP — ScanField compartido y cards de unidades/revision"
```

---

## Task 9: MedicamentosView — filtros como chips

**Files:**
- Modify: `src/views/pharma/MedicamentosView.tsx` (toolbar de ambas ramas; `searchInput`)

**Interfaces:**
- Consumes: `Chip` (Task 2). Los tipos `StockFilter`/`IpFilter` y la lógica de filtrado no cambian.

- [ ] **Step 1: Reemplazar los dos `<select>` de filtro por chips**

1. Sumar el import: `import { Chip } from '../../components/Chip'`.
2. En la rama IP, reemplazar el `<select value={ipFilter} …>` (con sus tres `<option>`) por:

```tsx
          <div role="radiogroup" aria-label="Filtro de vencimiento" style={{ display: 'flex', gap: 7 }}>
            {([['todas', 'Todas'], ['por_vencer', 'Por vencer'], ['vencidas', 'Vencidas']] as [IpFilter, string][]).map(([v, label]) => (
              <Chip key={v} label={label} selected={ipFilter === v} onClick={() => setIpFilter(v)} accent={accentSolid} />
            ))}
          </div>
```

3. En la rama base, reemplazar el `<select value={filter} …>` (con sus tres `<option>`) por:

```tsx
        <div role="radiogroup" aria-label="Filtro de stock" style={{ display: 'flex', gap: 7 }}>
          {([['todos', 'Todos'], ['bajo', 'Stock bajo'], ['sin', 'Sin stock']] as [StockFilter, string][]).map(([v, label]) => (
            <Chip key={v} label={label} selected={filter === v} onClick={() => setFilter(v)} accent={accentSolid} />
          ))}
        </div>
```

4. Alinear el buscador con el de Recepción: en la constante `searchInput`, cambiar `borderRadius: 10` por `borderRadius: 999` y sumar `boxShadow: 'var(--spira-shadow-sm)'`.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck` — Esperado: verde.

- [ ] **Step 3: Commit**

```bash
git add src/views/pharma/MedicamentosView.tsx
git commit -m "feat(pharma): MedicamentosView — filtros como chips (alineado al handoff de Recepcion)"
```

---

## Task 10: Verificación integral (typecheck + navegador)

**Files:** ninguno.

- [ ] **Step 1: Gate técnico**

```bash
npm run typecheck && npm run build
```

Esperado: ambos en verde.

- [ ] **Step 2: Checklist de comportamiento en navegador (Director)**

Levantar `npm run dev` y recorrer **cada** punto. Cualquier ítem que falle es una regresión de la re-piel: se arregla antes de cerrar la rama.

**Lista (RecepcionView):**
- [ ] La lista abre transversal (chip "Todas"): se ven recepciones de los tres ámbitos agrupadas por día ("Hoy"/"Ayer"/"Jueves 26 jun"), más nuevas arriba.
- [ ] Chips Protocolo/Investigación/Ambulatoria filtran por tipo; búsqueda libre matchea medicamento, lote, código de protocolo y notas; 7/30 días acota el rango; "Más filtros" filtra por protocolo, medicamento y desde/hasta, y "Limpiar" resetea.
- [ ] "Nueva recepción" aparece en el ENCABEZADO del shell solo para pharma leader+ (con un usuario operator no aparece, y tampoco queda el "Nuevo" genérico). **A la primera:** entrar a Recepción desde otro submódulo lo muestra sin interacción previa (verifica el fix de orden de efectos del shell).
- [ ] Crear una recepción → al volver, la card nueva queda resaltada (borde ámbar) y el resalte se apaga solo a los ~5 s.
- [ ] "Verificar" en una card pendiente: pasa a "Verificada" (refetch), el stock ingresa, y con error de permiso muestra el mensaje sereno.
- [ ] Las cards IP muestran "Producto de Investigación" + "N unidades" (no "0 ítems").
- [ ] Las cards NO tienen chevron ni parecen clickeables (el detalle no existe todavía).

**Wizard — rama base (protocolo y ambulatoria):**
- [ ] Setup: 3 cards; Protocolo/Investigación exigen protocolo para avanzar; Ambulatoria no. Cambiar de tipo con datos cargados pide confirmación de descarte.
- [ ] Stepper: completados con check ámbar, actual ámbar con número, futuros atenuados; labels "Lotes" (base) vs "Revisión" (IP); saltar a un paso ya alcanzado funciona (y siembra lotes al entrar a Lotes).
- [ ] Escaneo: escanear un código conocido suma +1 (mensaje "+1 …"); repetirlo incrementa (dedup por medicamento, no filas duplicadas); − / + ajustan; llegar a 0 saca la fila; la × la saca directo; el EAN escaneado se ve en mono bajo el nombre; footer "N medicamentos · M ítems" correcto.
- [ ] Código desconocido: abre el panel ámbar de asociación; "Asociar y agregar" guarda el código y suma +1; "No asociar" lo cierra; el 23505 muestra su mensaje propio.
- [ ] "Buscar a mano" (link) muestra el typeahead y agregar desde ahí funciona (en tipo protocolo, además asigna el medicamento al protocolo).
- [ ] Lotes: suma de lotes == cantidad habilita Siguiente; lotes duplicados o vacíos bloquean con su mensaje; vencimiento pasado avisa en danger (borde + texto) pero NO bloquea; "Dividir en varios lotes" agrega filas; la × de lote respeta el mínimo de 1.
- [ ] Resumen: fecha default hoy, notas opcionales; "Crear recepción" (en la barra de abajo) crea atómico y vuelve a la lista con highlight; un error del RPC se muestra sereno junto a la barra.
- [ ] La barra inferior queda fija abajo mientras el contenido scrollea; "Atrás" no aparece en el Setup.
- [ ] Cancelar con datos cargados pide confirmación; sin datos, sale directo.

**Wizard — rama IP:**
- [ ] Escanear un código de kit crea la fila ARRIBA con el N° de kit (= código crudo, sin lote/vto); re-escanear el mismo kit avisa "ya fue escaneada" y no duplica.
- [ ] Lote y vencimiento arrancan vacíos y se cargan a mano en Revisión (no vienen en el código).
- [ ] Droga por fila (typeahead) y chip para revertir a "Cegado"; en Revisión, editar kit/lote/vto por fila + selección múltiple + "Seleccionar las sin droga" + droga masiva (y la selección se limpia al aplicar).
- [ ] Crear con unidades sin kit bloquea con el mensaje "Hay N unidad(es) sin N° de kit…"; con todo completo crea las N unidades atómico y el stock IP aparece en Medicamentos → Producto Investigación.

**MedicamentosView:**
- [ ] Ámbito base/IP intacto (SegmentedControl + protocolo como gate); los filtros ahora son chips y filtran igual que antes; badges de stock/vencimiento se ven como siempre.

**Transversales:**
- [ ] Tema oscuro: chips, badges, barra del wizard y ScanField legibles (los tintes rgba ámbar/azul/verde funcionan sobre el fondo oscuro).
- [ ] Navegar a otro submódulo y volver: el encabezado contextual no queda pegado (acciones correctas en cada vista).

- [ ] **Step 3: Cierre**

Si todo pasa: proponer merge de `feat/recepcion-reskin` (PR o merge directo, decisión del Director) y actualizar la bitácora de la jornada.

---

## Notas de decisión (por qué el plan se aparta del mock donde se aparta)

1. **Sin chevron en las cards de la lista** — el detalle de recepción está fuera de alcance; un chevron sin destino es una affordance falsa (estándar del proyecto).
2. **Stepper −/+ y botones de fila a 44px de alto** (el mock dibuja 34): la nota del propio handoff exige hit targets ≥ 44px; gana la nota.
3. **Borde ámbar del ScanField siempre visible** (el mock lo dibuja como estado de foco): el input vive autofocuseado y es la acción primaria del paso; hacerlo estado-de-foco chocaría con la decisión app-wide de foco suave (`.spira-search-input`, commit cf81885). Se toma como affordance permanente del componente.
4. **"Producto Investigación" habilitado en el Setup** (el mock lo muestra "Próximamente"): el diseño es anterior al merge del IP; el comportamiento real manda [PRESERVAR].
5. **Filtro "Medicamento" como desplegable** (el handoff no especifica el control): preferencia fuerte del Director — desplegables antes que texto libre.
6. **Orden de cards del Setup: Protocolo / Investigación / Ambulatoria** (el mock pone Investigación al final por estar deshabilitada): se mantiene el orden vigente en toda la app.
7. **"Crear recepción" en la barra fija** exigió subir el submit del Paso 3 al wizard: es el único refactor no-puramente-visual del plan; los guards se portan verbatim y la paridad se cubre en la checklist (Task 10).
8. **El botón del encabezado del shell** reemplaza al "Nueva recepción" inline: es la infraestructura existente (`setHeader` + `HIDE_ACTION`) y calca el header del mock 1b. Exige el fix de orden de efectos del shell (Task 3, Step 2): la limpieza del header pasa a `useLayoutEffect` para no pisar lo que la vista registra al montar.
9. **Las cards de la lista conservan el desglose de ítems** (el mock 1b muestra una sola línea porque su data de ejemplo tenía un ítem por recepción): sin vista de detalle todavía, el desglose por card es la única forma de ver qué entró en cada recepción — se mantiene a propósito, compacto y en muted.
