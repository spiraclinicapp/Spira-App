# PLAN — Visitas del día v2 (Fase 1)

Plan de implementación del rediseño de `HANDOFF - Visitas dia.md`, rebindeado al
schema real de Spira. Producido con `/plan-eng-review`. **Fase 1** = fila + modal.
Fase 2 (infra de lista: filtros multi, agrupar, buscador, teclado) va aparte.

## Decisiones tomadas (Director, 2026-08-04)

| # | Tema | Decisión |
|---|---|---|
| D1 | Hora / agrupar por hora | **Sin hora en v1.** No existe hora de cita en el schema. La columna izquierda de la fila muestra el **chip de estado**, no una hora. El default de agrupación deja de ser "hora" (se mantiene el orden actual En el centro / Resto, o agrupar por estado). |
| D2 | Coordinador | **Coordinador por visita.** Columna nullable `coordinator_id` en `patient_visits`, elegible **solo entre los coordinadores del protocolo**, autocompleta si el protocolo tiene 1, asignable desde la fila/modal vía RPC. Migración nueva. |
| D3 | Nombre del paciente | **Nombre completo visible SOLO en Visitas del día** (fila + modal). El resto de la app sigue con IVRS + `PrivacyAvatar`. |
| D4 | Alcance / fasing | **Fase 1** = reescritura de fila + modal rebindeados. **Fase 2** = filtros multi + agrupar + buscador + teclado. |

## Lo que se reusa (no se reinventa)

```
Prototipo (demo)          →  Real (ya en prod)                       Acción
──────────────────────────────────────────────────────────────────────────────
Etapas + stepper vertical →  VerticalRoute / STAGE_ORDER (0023)      reusar
Procedimientos            →  VisitProcedures + data/procedures       reusar (modelo real, más rico)
Comentarios               →  CommentThread (0048)                    reusar
"Quiere médico" + motivo  →  DoctorRequest / DoctorBadge / motivos   reusar
Avanzar etapa             →  markArrived/Attended/Ready/Left         reusar
"No vino"                 →  RescheduleModal (no es un estado)       reusar
Navegar por día           →  DateNavButton + useVisitsForDay         reusar
Tokens claro/oscuro       →  src/styles/tokens.css (theme-aware)     reusar (NO hardcodear la paleta del prototipo)
```

## Fasing

```
FASE 1A ── Base de datos: coordinador por visita  (migración + data, sin UI grande)
   └─ desbloquea la columna "Coord." de la fila
FASE 1B ── Presentación: fila + modal rebindeados  (la reescritura visual)
   └─ el 80% del valor visible del handoff
─────────────────────────────────────────────────
FASE 2  ── Infra de lista: filtros multi · agrupar · buscador · teclado · contadores
           (otra tanda; NO en este plan)
```

---

## FASE 1A — Coordinador por visita (base de datos)

### Migración `0065_visita_coordinador.sql`
1. `alter table public.patient_visits add column coordinator_id uuid references public.users(id) on delete set null;`
   - Nullable. Datos legacy → quedan en null (seguro; no rompe filas viejas). Sin backfill obligatorio.
2. Recrear `v_track_visits` (`create or replace view … security_invoker = true`) sumando:
   - `pv.coordinator_id`
   - `coordinator_name` = `left join users cu on cu.id = pv.coordinator_id` → `cu.full_name`
   - **Conservar TODAS las columnas actuales** (la vista se recrea entera; calificar columnas — gotcha 0056/0058).
3. RPC `set_visit_coordinator(p_visit_id uuid, p_coordinator_id uuid)` **SECURITY DEFINER**:
   - Valida authz (operator asignado al protocolo / track-admin / gerencia — mismo criterio que `rescheduleVisit`).
   - Valida que `p_coordinator_id` esté en `protocol_coordinators` del protocolo de la visita (o sea null = desasignar). Rechaza con mensaje claro si no.
   - Escribe `coordinator_id`. Auditable por el `audit_log` transversal.
   - Patrón: operaciones privilegiadas vía SECURITY DEFINER (igual que `mark_*`, `set_visit_procedures`).
4. Registrar en `supabase/README.md` (índice + "Aplicada en prod (fecha)" cuando el Director la corra — lo vigila `scripts/check-migraciones.mjs`).

**Gotchas de migración considerados:** sin placeholders `<...>`; columna nullable = seguro sobre legacy; no hay `ALTER TYPE ADD VALUE`; view recreada con columnas calificadas.

### Capa de datos `src/data/dayVisits.ts`
- Sumar a `DayVisitRow`: `coordinator_id: string | null` y `coordinator_name: string | null` (con comentario citando 0065).
- `setVisitCoordinator(visitId, coordinatorId | null)`: llama al RPC; traduce 42501/23503/0-filas a mensaje sereno.
- El picker reusa `useProtocolCoordinators(protocolId)` (ya existe, `data/pharma/coordinators.ts`).

---

## FASE 1B — Fila + modal (presentación)

### Atoms a portar a TSX (desde `atoms.jsx`, con tokens.css)
Portar como componentes tipados en `src/views/track/` o `src/components/` según reuso:
`Estado2` (chip de estado) · `Proc2` (tag de procedimiento, variantes punto/letra) ·
`ProtoTag2` (etiqueta de protocolo) · `Persona2` (responsable). Usar variables de
`tokens.css`, NO la paleta LIGHT/DARK del prototipo.

### Mapeo prototipo → dato real

| Prototipo | Real | Nota |
|---|---|---|
| columna `time` (hora) | — | **Reemplazada por el chip de estado** (D1). |
| `patient.name` titular | `visit.patient_name` | **Titular** (D3), solo en esta vista. |
| `ProtoTag` | `visit.protocol_code` | Tag corto (identificador de estudio). Tono = hash estable de `protocol_id` contra la paleta (blue/accent/violet/gold/good). **[decisión menor abierta: code vs name]** |
| `#num` | `visit.patient_code` (IVRS) | tabular; "Sin IVRS" si null (visitas diferidas, 0021). |
| `visitTag` (V6/EOT/VNP) | `visit.visit_code ?? KIND_LABELS[kind]` | Suelta (kind≠programada) → label de kind. |
| `visitName` | `visitTitle(visit)` | ya existe el helper. |
| procs (punto tono+label) | `data/procedures` (nombres libres + category) | El catálogo real NO tiene los 7 tonos/letras fijos. En la fila: punto por category (o accent) + nombre; en el modal: chip con inicial del nombre. **Ajuste de fidelidad aceptado.** |
| `coordinador` | `coordinator_name` (Fase 1A) | "Sin asignar" + affordance de asignar. |
| `medico` | `treating_physician` | nullable → línea oculta o "—". |
| estados 5 + `no_vino` | `operational_stage` (5) + acción No vino | **No hay estado `no_vino`.** El ítem "Marcar como no vino" del ⋯ abre `RescheduleModal` (como hoy). El aviso "no vino" del modal del prototipo NO aplica. |
| comentarios rol/avatar | `CommentThread` (0048) | reusar el componente real. |
| header "lunes 3 ago · N · …" | `date` + conteos por `operational_stage` | contadores coloreados (por llegar `warn` · en el sitio `accent` · no vino/rojo n/a). |

### `DayVisitRowItem.tsx` (reescritura — layout `paciente`, densidad `compacta`)
```
┌─┬───────────────────────────────────────────────────────────────────────────────────┐
│▍│ [chip     Mariño, Carlos Adolfo                    ⌾ Coord.  Valeria Araya   [Médico][Primario →][⋯]│
│ │ estado]   [ATLAS-7] #0320040058 [V6] Visita 6 · Semana 24  ⌾ Médico Dr. F. Salas │
│ │           ● Procedimiento  ● Sangre                                              │
└─┴───────────────────────────────────────────────────────────────────────────────────┘
```
- Rail de estado (4px, color de la etapa), contenedor radio 14, hover con levante (respeta `micro-interaccion-pulsables`).
- Botones de acción de **ancho fijo** (médico 134 / primario 150 / ⋯ 34) — la columna derecha alineada al pixel entre filas (checklist de QA del handoff).
- Guarda de teclado: Enter/Space abre el modal solo si `e.target === e.currentTarget`; botones internos con `stopPropagation` en onClick **y** onKeyDown.
- Foco suave de inputs = estándar `input-foco-suave-pacientes` (ya default en tokens).

### `VisitDetail.tsx` (reescritura — modal aprobado)
- Header protocolo-manda: barra de estado + `protocol_name`/`code`/fase/área + línea 2 (nombre · IVRS · visitTag · visitName · estado · flag médico) + procedimientos ricos.
- Cuerpo 2 columnas: **izq** Ruta vertical (reusa `VerticalRoute`) + A cargo (Coordinador con picker + Médico + Atención médica) + Paciente (sexo/edad/nac/fértil). **der** Procedimientos (`VisitProcedures`) + Comentarios (`CommentThread`).
- Navegación **↑↓ / j k** recorre la lista visible ordenada tal como se ve; wrap circular; se ignora si el foco está en INPUT/TEXTAREA; `Esc` cierra.
- Se mantiene el contrato actual `context="day" | "patient"` (en `patient` la ruta y el médico son solo-lectura). **Ojo:** `VisitDetail` se abre también desde la ficha del paciente → la reescritura NO debe romper `context="patient"`, y ahí el nombre NO se muestra como titular (D3 es solo Visitas del día → parametrizar `showName`).

### `DayVisitsView.tsx`
- Header con contadores coloreados derivados de `operational_stage`.
- Wiring del picker de coordinador y del teclado; montaje del modal con `pos` (n/total) y `onPrev/onNext` sobre la lista visible.
- Se mantiene la salvaguarda de randomización, el cierre clínico (ReadyOutcomeModal) y el gating (canReception/canClinical) actuales.

### Procedimientos en la fila — fetch batch (performance)
`useVisitProcedureStatus` hace **3 queries por visita** → 14 filas ≈ 42 queries. No escala.
- Nuevo hook `useDayProceduresSummary(visitIds, visitDefIds)` en `data/procedures.ts`:
  una query `protocol_activities` por los `visit_def_id` del día + una `visit_procedure_completions`
  por los `visit_id` del día, unidas en cliente → `Map<visitId, {nombres[], done, total}>`.
  Sin el circuito de reporte (eso vive en el modal).

---

## Archivos que toca (Fase 1)

**1A (migración):**
1. `supabase/migrations/0065_visita_coordinador.sql` *(nuevo)*
2. `src/data/dayVisits.ts` — `coordinator_id`/`coordinator_name` + `setVisitCoordinator()`
3. `supabase/README.md` — índice de migración

**1B (presentación):**
4. `src/views/track/DayVisitRowItem.tsx` — reescritura
5. `src/views/track/VisitDetail.tsx` — reescritura (parametrizar `showName`)
6. `src/views/DayVisitsView.tsx` — header, teclado, wiring
7. `src/data/procedures.ts` — `useDayProceduresSummary`
8. `src/views/track/visitAtoms.tsx` *(nuevo)* — atoms portados (Estado/Proc/ProtoTag/Persona)
9. `src/lib/visits.ts` — helpers `protoTone(id)` + `visitTag(visit)`
10. Picker de coordinador en el modal (reusa `SearchableSelect` + `useProtocolCoordinators`)

~10 archivos. Es una reescritura, no un parche: el diff correcto acá es grande.

## Edge cases (checklist)
- [ ] Visita suelta (kind≠programada): sin visit_def → sin procedimientos, sin ventana; visitTag = label de kind. Fila y modal toleran nulls.
- [ ] `patient_code` null → "Sin IVRS" (subordinado; el titular es el nombre).
- [ ] `treating_physician` null → línea Médico "—" u oculta.
- [ ] `coordinator_id` null → "Sin asignar" + asignar. Protocolo con 0 coord → no se puede (mensaje); 1 → autocompleta; >1 → picker.
- [ ] `setVisitCoordinator`: RLS silenciosa (0 filas / 42501) → mensaje sereno.
- [ ] ↑↓ en el modal recorre la lista VISIBLE ordenada; ignora foco en composer de comentarios; wrap circular.
- [ ] Enter/Space no dispara acción interna + abre modal a la vez (guarda `currentTarget` + stopPropagation).
- [ ] `context="patient"` sigue andando y NO muestra el nombre como titular.
- [ ] Modo oscuro: chips y tono+alpha sobre `white=#17302C` (usar tokens.css).

## Verificación (no hay suite de tests)
- **Gate:** `npm run typecheck` verde + `npm run build`.
- **QA logueado en el preview** (puerto 5250; `preview_screenshot` se cuelga → verificar por snapshot/eval/estilos; React no ve fill/click sintéticos → setter nativo + dispatch input + requestSubmit).
- Adaptar el **checklist de QA** del handoff (§11): alineación de la columna derecha en los 5 estados, sin línea divisoria bajo filtros (Fase 2), teclado, modo oscuro.

## Decisiones menores abiertas (no bloquean; defaults propuestos)
- **Etiqueta de protocolo**: `protocol_code` (EFC…) vs `protocol_name` (ATLAS-7). *Default: `protocol_code`* (es el identificador de estudio en el resto de la app).
- **Avatar en la fila**: el prototipo `paciente` no lleva avatar; hoy la fila sí. *Default: seguir el prototipo (nombre titular, sin avatar)*.
- **Backfill de coordinador**: dejar null y asignar a demanda vs backfillear los protocolos de 1 solo coordinador. *Default: null a demanda*.
