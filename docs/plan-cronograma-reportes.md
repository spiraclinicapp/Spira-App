# Plan · Cronograma › Procedimientos del estudio + Reportes pendientes

**Origen:** handoff `docs/design_handoff_cronograma_reportes/` (copiado del bundle de Downloads
el 2026-08-23: README + 2 prototipos HTML + `colors_and_type.css` + 11 capturas).
**Review:** `/plan-eng-review` del 2026-08-23. Once decisiones tomadas, listadas abajo.
**Última migración aplicada:** 0088. Este plan agrega 0089, 0090 y 0091.

---

## 1 · Qué resuelve

Hoy un procedimiento tiene un flag binario `has_report` y una demora. En la realidad, una
extracción de sangre genera **varios reportes distintos**, cada uno en su plataforma (IQVIA,
LabCorp, Clario, Roche 4G) y con su propio plazo. Este trabajo:

1. Arma el **catálogo de procedimientos del estudio**, con la definición de qué reportes lleva
   cada uno (nombre, plataforma, link, plazo, notas).
2. Agrega un **tablero de reportes pendientes** a nivel protocolo, con tres etapas, links directos
   a cada plataforma, historial auditado y cierre automático de la visita.
3. Mete el mismo desglose **dentro del modal real de visita**, en la card "Procedimientos".

---

## 2 · Decisiones de la review (cerradas, no re-litigar)

| # | Decisión | Qué implica |
|---|---|---|
| D1 | **Tres PRs por fases** | Cada fase queda verde y desplegable sola |
| D2 | **Cierre de visita derivado**, sin tabla `visit_closure` | `computed_status = 'completa'` ya lo calcula; el "cerrada por X" sale del historial |
| D3 | **Catálogo mixto** | La solapa lista/borra por estudio; el alta come del catálogo global con autocompletado |
| 1A | Tabla **`protocol_procedures`** | Es donde vive "este estudio usa este procedimiento", y de donde cuelgan los reportes |
| 2A | El 📎 abre el **detalle de la visita del paciente** | `VisitDetail`, no el modal del cronograma — ese edita la plantilla de los 40 pacientes |
| 3A | **Una alerta por reporte**, migrando los descartes viejos | Archivar el de LabCorp no puede tapar el de Clario |
| 4A | **Bloquear el destilde** si algún reporte avanzó | Con mensaje que diga cuántos son y qué hacer |
| 5 | **Guardado atómico** del modal completo | Cancelar cancela, Guardar guarda — RPC `set_procedure_reports` |
| 6 | **Extraer el armazón del tablero** a compartido | Farmacia y Coordinación no pueden divergir visualmente |
| 7 | **Botones + arrastre nativo** | Los botones son el camino completo y accesible; el arrastre va encima |
| 8 | **Espejar la regla de cierre en JS** con tests | El SQL se deriva de esos casos; el front la necesita igual |
| 9 | **"Visitas cerradas" = últimos 7 días** + enlace al listado completo | La sección es un acuse de recibo, no el archivo del estudio |

**Correcciones al handoff, ya acordadas:**

- **"Actuando como" no va.** Autor sellado server-side con `default auth.uid()`, como todas las
  tablas del repo. El selector existía para demostrar el historial en el prototipo.
- **Plataformas: `text` + `check`, no enum.** Precedente propio, escrito en la 0070:38-40 —
  *"Texto con check y no enum: un enum nuevo obligaría a `alter type ... add value` en su propio
  archivo (la trampa de 0053)"*.
- **El historial lo escribe un trigger**, no el cliente. Dos escrituras divergen; una prueba que
  diverge deja de ser prueba.
- **El CHECK de plazos se reemplaza por un rango.** La 0064 fija
  `check (report_eta_hours in (24,48,72,168,336,720))` y el handoff pide chips de 1h/24h/48h/72h
  **más** un input libre. Pasa a `check (eta_hours > 0 and eta_hours <= 8760)`.

---

## 3 · Qué ya existe (y se reusa, no se reconstruye)

| Pieza del handoff | Ya en el repo | Se reusa |
|---|---|---|
| Tablero kanban (grilla, columnas, contador) | `views/pharma/dispensaciones/KanbanBoard.tsx` | Sí — se extrae a compartido (D6) |
| Tarjeta del tablero | `KanbanCard.tsx` | No — la de Farmacia habla de medicamentos; se escribe nueva |
| Filtros del header | `components/FilterDropdown.tsx`, `MultiFilterMenu.tsx` | Sí, tal cual |
| Combobox "NameCombo" con autocompletado inline | `components/AutocompleteInput.tsx` | Sí — es exactamente ese patrón |
| Desplegable de categoría con punto de color | `components/SearchableSelect.tsx` (`variant='field'`, `leadingIcon`) | Sí, tal cual |
| Alta/baja en el catálogo global desde un desplegable | `SearchableSelect` con `onCreate`/`onDelete` | Sí — ya lo hace `VisitProceduresModal` |
| Modal con footer único | `components/Modal.tsx` + `components/buttons.ts` | Sí, tal cual |
| Card "Procedimientos" del modal de visita | `views/track/VisitProcedures.tsx` | Sí — se le suma el desglose |
| Tercera solapa | `views/ProtocolDetailView.tsx:181` ya tiene `pacientes \| cronograma` | Sí — se suma la tercera |
| Popovers que no se corren | `components/usePopover.ts` (portalea a `body`) | Sí — obligatorio, el fondo del modal lleva `backdrop-filter` |
| Vista desnormalizada para no hacer N+1 | patrón de `v_procedure_report_alerts` (0064) | Sí — `v_protocol_report_status` lo calca |

**Lo único genuinamente nuevo:** el modelo de datos de reportes, la tarjeta de reporte, y la
regla de cierre. Todo lo demás es composición de piezas que ya andan.

---

## 4 · Modelo de datos

```
procedures  (catálogo GLOBAL, ya existe — 0061)
  │  id, code ("iniciales"), name, category, requires_dispensation
  │  + min_estimated int          ← NUEVO, fase 1 ("demora estimada" del modal)
  │  ⚠ has_report, report_eta_hours  → SE RETIRAN en fase 3
  │
  ├──< protocol_procedures            ← NUEVO, fase 1
  │      protocol_id, procedure_id             "este estudio usa este procedimiento"
  │      unique (protocol_id, procedure_id)
  │      │
  │      └──< report_definitions      ← NUEVO, fase 1
  │             id, protocol_procedure_id      "qué reportes lleva, EN ESTE estudio"
  │             name, platform, link, eta_hours, notes
  │             │
  │             └──< report_status    ← NUEVO, fase 2
  │                    id, visit_id, report_definition_id
  │                    stage ('pendiente'|'descargado'|'evolucionado')
  │                    due_at            (completed_at del procedimiento + eta_hours)
  │                    updated_by  default auth.uid()
  │                    unique (visit_id, report_definition_id)
  │                    │
  │                    └──< report_status_history   ← NUEVO, fase 2
  │                           report_status_id, stage, changed_by, changed_at
  │                           ⚠ lo escribe un TRIGGER, nunca el cliente
  │
  └──< protocol_activities  (ya existe — 0002/0061)
         protocol_id, visit_def_id, procedure_id, suggested_order
                                             "esta visita del cuadro lleva este procedimiento"
```

**Por qué `protocol_procedures` y no colgar `protocol_id` de `report_definitions`:**
`protocol_activities` exige `visit_def_id NOT NULL` desde la 0061:79, así que hoy no hay dónde
anotar "el estudio usa este procedimiento" sin meterlo en una visita. Sin esa tabla, el
"+ Procedimiento" de la solapa no puede guardar nada sin pedir además una visita.

**Backfill (fase 1, idempotente):**
```sql
insert into protocol_procedures (protocol_id, procedure_id)
select distinct pa.protocol_id, pa.procedure_id from protocol_activities pa
on conflict do nothing;

insert into report_definitions (protocol_procedure_id, name, platform, eta_hours)
select pp.id, p.name, 'otro', p.report_eta_hours
from protocol_procedures pp join procedures p on p.id = pp.procedure_id
where p.has_report on conflict do nothing;
```

---

## 5 · Máquina de estados del reporte

```
   nace al tildar
   "realizado"          Marcar descargado          Marcar evolucionado
        │           ┌──────────────────────>┐  ┌──────────────────────>┐
        v           │                       │  │                       │
  ┌───────────┐     │   ┌──────────────┐    │  │  ┌────────────────┐   │
  │ pendiente │─────┘   │  descargado  │────┘  └──│  evolucionado  │───┘
  │  (muted)  │<────────│  (#3A6B8C)   │<─────────│ (--spira-primary)│
  └───────────┘    ↺    └──────────────┘    ↺     └────────────────┘
        ^                                                  │
        └──── arrastre: cualquier columna → cualquier columna ────┘

  GUARD (4A) ── destildar "realizado" se RECHAZA si algún reporte del procedimiento ≠ pendiente.
                Mensaje: "Este procedimiento tiene N reportes ya descargados. Retrocedelos primero."

  CIERRE (D2) ── visita sin reportes fuera de 'evolucionado' Y con todos sus
                 procedimientos-con-reporte realizados  →  computed_status = 'completa'
                 →  sale de las 3 columnas  →  entra a "Visitas cerradas" (últimos 7 días)
                 El "cerrada por X el Y" = último evento de report_status_history de esa visita.
                 REABRIR = retroceder un reporte. No hay acción manual de cierre ni de reapertura.
```

---

## 6 · Las tres fases y su orden de despliegue

El orden **no** se decide por "agrega o quita" sino por si el cambio altera lo que el front
**ya** pide (CLAUDE.md, regla dura 3).

```
FASE 1 ─── migración 0089 (ADITIVA) ────────> deploy front v1
           protocol_procedures, report_definitions, procedures.min_estimated,
           backfill desde has_report, RPC set_procedure_reports
           ORDEN: MIGRACIÓN PRIMERO — ningún front viejo consulta estas tablas;
                  el que no funciona sin ellas es el front nuevo.

FASE 2 ─── migración 0090 (ADITIVA) ────────> deploy front v2
           report_status + trigger de historial, report_status_history,
           vista v_protocol_report_status (desnormalizada, una consulta por protocolo)
           ORDEN: MIGRACIÓN PRIMERO — mismo criterio.

FASE 3 ─── deploy front v3 ────> migración 0091 (BREAKING)
           v_patient_visits / v_track_visits leen report_status en vez de has_report;
           v_procedure_report_alerts pasa a ser por reporte;
           alert_dismissals: identidad nueva + expansión de los descartes viejos;
           drop procedures.has_report / report_eta_hours
           ORDEN: FRONT PRIMERO — el front v2 todavía lee has_report en
                  data/procedures.ts, y la 0091 se la saca de abajo.
                  Al revés = la lección de la 0068 (2026-08-05), que dejó la Agenda
                  y la ficha del paciente en blanco hasta el deploy.
```

⚠️ **Antes de escribir la 0091, grepear `procedures` en los `select(...)` del front.** Agregar
una FK a una tabla ya embebida deja el embed ambiguo (PGRST201) y PostgREST voltea la consulta
entera — pasó con la 0076 el 2026-08-13 y tiró el tablero de Farmacia.

---

## 7 · Archivos

**Fase 1**
| Archivo | Qué |
|---|---|
| `supabase/migrations/0089_procedimientos_del_estudio.sql` | tablas + RLS + auditoría + backfill + RPC |
| `src/data/protocolProcedures.ts` | NUEVO — hooks + altas/bajas del estudio |
| `src/data/reportDefinitions.ts` | NUEVO — hooks + `setProcedureReports` (atómico) |
| `src/views/track/procedimientos/ProceduresCatalog.tsx` | NUEVO — la sub-solapa |
| `src/views/track/procedimientos/ProcedureEditModal.tsx` | NUEVO — el modal |
| `src/views/track/procedimientos/ReportForm.tsx` | NUEVO — alta/edición de un reporte |
| `src/views/track/procedimientos/plataformas.ts` (+ `.test.ts`) | NUEVO — colores, URLs default, link pegajoso |
| `src/views/track/ScheduleEditor.tsx` | sub-solapas Visitas / Procedimientos del estudio |

**Fase 2**
| Archivo | Qué |
|---|---|
| `supabase/migrations/0090_estado_de_reportes.sql` | `report_status`, historial + trigger, vista |
| `src/data/reportStatus.ts` | NUEVO — hooks + avanzar/retroceder |
| `src/views/track/reportes/estados.ts` (+ `.test.ts`) | NUEVO — **el núcleo puro** (D8) |
| `src/views/track/reportes/ReportesPendientesView.tsx` | NUEVO — header, filtros, tablero, cerradas |
| `src/views/track/reportes/ReportCard.tsx` | NUEVO — la tarjeta, **compartida** con el modal de visita |
| `src/components/KanbanShell.tsx` | NUEVO — armazón extraído (D6) |
| `src/views/pharma/dispensaciones/KanbanBoard.tsx` | pasa a consumir el shell, **sin cambio visual** |
| `src/views/ProtocolDetailView.tsx` | tercera solapa |
| `src/views/track/VisitProcedures.tsx` | píldora "N reportes" + desglose |

**Fase 3**
| Archivo | Qué |
|---|---|
| `supabase/migrations/0091_reportes_fuente_de_verdad.sql` | vistas + alertas + descartes + drop columnas |
| `src/data/procedures.ts` | saca `has_report`/`report_eta_hours` de tipos y selects |
| `src/data/reports.ts`, `src/data/alertDismissals.ts` | alerta por reporte + ancla |
| `src/views/track/VisitProceduresModal.tsx` | saca el editor de `has_report` (muere con la columna) |
| `src/lib/checklist.ts` | queda solo `reportEtaLabel`; `REPORT_ETA_OPTIONS` se va |

---

## 8 · Modos de falla

| Ruta nueva | Cómo falla en producción | ¿Test? | ¿Manejo de error? | ¿Lo ve el usuario? |
|---|---|---|---|---|
| `computed_status` con la fuente nueva | Todas las visitas muestran el estado equivocado | Espejo en JS (D8) | — (es SQL) | **No — silencioso. Gap crítico mitigado por D8** |
| `isReportAlertDismissed` con identidad nueva | Alertas archivadas reaparecen, o alertas vivas se ocultan | Regresión obligatoria | — | No — silencioso |
| Avanzar etapa sin permiso | RLS filtra: 0 filas afectadas | Sí | Sí — "0 filas = sin permiso" | Sí, mensaje sereno |
| `setProcedureReports` a mitad de camino | Modal medio guardado | Sí | Sí — RPC atómica | Sí |
| Destildar con reportes avanzados | Se pierde el historial | Sí (`canUntickProcedure`) | Sí — guard + mensaje | Sí |
| Reporte con `eta_hours` nulo | La tarjeta muestra vencimiento en blanco | Sí (`dueAt → null`) | Sí — copy explícito | Sí |
| Definición agregada después de realizar | Tarjeta con vencimiento raro o ausente | Sí | Decidir en implementación: `due_at` desde `completed_at` | Sí |
| Arrastre sobre una columna inválida | La tarjeta vuelve sola | No (visual) | Sí — el drop no dispara | Sí |
| Vista `v_protocol_report_status` lenta | El tablero tarda | No | — | Sí — spinner |

---

## 9 · Tests

Criterio del repo: se testea **lo que falla en silencio**. Lo que falla visible se verifica
mirando. Framework: `vitest`, dentro de `npm run build`.

`views/track/reportes/estados.test.ts` — el núcleo:
- `nextStage`/`prevStage` en los bordes (`prevStage('pendiente') → null`, `nextStage('evolucionado') → null`)
- `dueAt`: eta nulo → null; suma horaria correcta
- `isOverdue`: borde exacto (`now === dueAt` → **no** vencido)
- `visibleCards`: sin realizar → 0; realizado con 3 definiciones → 3; definición agregada después
- `visitClosed`: 0 procedimientos con reporte → **no** cerrada; uno pendiente → no; todos evolucionados → sí
- `closedBy`: el último evento del historial
- `canUntickProcedure`: alguno ≠ pendiente → false  ← **el guard de 4A**

`views/track/procedimientos/plataformas.test.ts`:
- `platformDefaultUrl` + link editado a mano (pegajoso hasta "restablecer")
- `knownReports`: dedup por (nombre, plataforma)

**Regresiones (obligatorias, sin discusión):**
- `data/alertDismissals.test.ts` — un descarte migrado sigue silenciando; uno cuya condición
  cambió, **no**.
- Verificación manual guiada del `computed_status`: una visita realizada con reportes pendientes
  tiene que seguir figurando **"realizada"**, no "completa", en Visitas del día, la Agenda y la
  ficha del paciente.

Plan de QA para `/qa`:
`~/.gstack/projects/spiraclinicapp-Spira-App/Tutuca-main-eng-review-test-plan-20260823.md`

---

## 10 · NO está en alcance

| Diferido | Por qué |
|---|---|
| Tabla `visit_closure` | D2: el cierre se deriva de `computed_status`. Una tabla y un trigger menos, y "¿cómo se reabre?" deja de existir |
| Selector "Actuando como" | Regulatorio: el autor lo sella el servidor con `auth.uid()` |
| Arrastre accesible por teclado (dnd-kit) | D7: los botones ya son el camino completo y accesible; el arrastre es comodidad de mouse |
| Tests de SQL (Supabase local) | D8 opción C → anotado en `TODOS.md` con las tres vistas por donde empezar |
| Convergir `VisitProceduresModal` al guardado atómico | Anotado en `TODOS.md`; depende de que cierre la fase 3 |
| Link de plataforma por sitio/investigador | Pregunta abierta del handoff §9. Se asume uno por protocolo, que es lo que el prototipo modela |
| Permiso especial para "evolucionar" | Pregunta abierta del handoff §9. Arranca con el permiso de coordinación que ya rige el resto de la visita |
| Reapertura manual de una visita cerrada | Dejó de aplicar con D2: reabrir = retroceder un reporte |
| Responsive de tablet del tablero | No está diseñado. Implementar responsive sin mock ya costó una reescritura en este repo |

---

## 11 · Paralelización

Las tres fases son **secuenciales** (la 2 necesita las definiciones de la 1; la 3 necesita los
estados de la 2). Dentro de la fase 2 sí hay dos carriles independientes:

| Paso | Módulos | Depende de |
|---|---|---|
| P1 · extraer `KanbanShell` + adaptar Farmacia | `src/components/`, `src/views/pharma/dispensaciones/` | — |
| P2 · `estados.ts` + sus tests | `src/views/track/reportes/` | — |
| P3 · el tablero, la tarjeta y la vista | `src/views/track/reportes/`, `src/views/` | P1, P2 |

```
Carril A: P1 (components/ + pharma/)      ─┐
                                            ├──> P3 (el tablero)
Carril B: P2 (estados.ts + tests)         ─┘
```

**Sin conflicto:** A toca `components/` y `pharma/`; B toca solo `track/reportes/`. P3 entra
después de mergear los dos. Las fases 1 y 3 no se paralelizan: cada una es un carril solo.

---

## 12 · Tareas

- [ ] **T1 (P1, human: ~2d / CC: ~40min)** — base — Migración 0089: `protocol_procedures`,
      `report_definitions`, `procedures.min_estimated`, RLS, auditoría, backfill, RPC
      `set_procedure_reports`
  - Surgió de: Arquitectura 1A + Calidad 5
  - Archivos: `supabase/migrations/0089_procedimientos_del_estudio.sql`
  - Verificar: aplicar en Supabase y confirmar que el backfill deja una definición por cada
    procedimiento con `has_report`
- [ ] **T2 (P1, human: ~1d / CC: ~25min)** — datos — Capa `protocolProcedures.ts` +
      `reportDefinitions.ts`, siguiendo `data/patients.ts` (hooks para leer, funciones para mutar)
  - Surgió de: convenciones del repo
  - Archivos: `src/data/protocolProcedures.ts`, `src/data/reportDefinitions.ts`
  - Verificar: `npm run typecheck`
- [ ] **T3 (P1, human: ~3d / CC: ~1h)** — UI — Sub-solapa "Procedimientos del estudio" + modal de
      edición + form de reporte, reusando `AutocompleteInput` y `SearchableSelect`
  - Surgió de: D3 (catálogo mixto) + Calidad 5 (guardado atómico)
  - Archivos: `src/views/track/procedimientos/*`, `src/views/track/ScheduleEditor.tsx`
  - Verificar: borrar un reporte + Cancelar → el reporte sigue ahí
- [ ] **T4 (P2, human: ~4h / CC: ~20min)** — UI — `plataformas.ts` + tests (URL default, link
      pegajoso, dedup de reportes conocidos)
  - Surgió de: handoff §5 + Tests
  - Archivos: `src/views/track/procedimientos/plataformas.ts`, `plataformas.test.ts`
  - Verificar: `npm run test`
- [ ] **T5 (P1, human: ~1d / CC: ~30min)** — base — Migración 0090: `report_status`,
      `report_status_history` + **trigger**, vista `v_protocol_report_status` desnormalizada
  - Surgió de: Arquitectura (historial por trigger) + Performance
  - Archivos: `supabase/migrations/0090_estado_de_reportes.sql`
  - Verificar: la vista devuelve todo lo del tablero en UNA consulta por protocolo
- [ ] **T6 (P1, human: ~1d / CC: ~30min)** — lógica — `estados.ts` + `estados.test.ts` con los
      casos borde de la sección 9
  - Surgió de: Tests D8 (espejar la regla)
  - Archivos: `src/views/track/reportes/estados.ts`, `estados.test.ts`
  - Verificar: `npm run test`
- [ ] **T7 (P2, human: ~4h / CC: ~20min)** — UI — Extraer `KanbanShell` y hacer que Farmacia lo
      consuma **sin cambio visual**
  - Surgió de: Calidad 6
  - Archivos: `src/components/KanbanShell.tsx`, `src/views/pharma/dispensaciones/KanbanBoard.tsx`
  - Verificar: el tablero de Dispensaciones se ve idéntico (4 columnas, mismos anchos)
- [ ] **T8 (P1, human: ~3d / CC: ~1h)** — UI — Tablero de Reportes pendientes: header con filtros,
      3 columnas, `ReportCard`, arrastre nativo, sección "Visitas cerradas" de 7 días
  - Surgió de: D1 fase 2 + Calidad 7 + Performance 9
  - Archivos: `src/views/track/reportes/*`, `src/views/ProtocolDetailView.tsx`
  - Verificar: avanzar por botón y por arrastre; el 📎 abre `VisitDetail` del paciente
- [ ] **T9 (P1, human: ~1d / CC: ~30min)** — UI — Desglose de reportes en `VisitProcedures`,
      reusando `ReportCard`; el tilde NO auto-expande; guard del destilde con mensaje
  - Surgió de: handoff §7 + Arquitectura 4A
  - Archivos: `src/views/track/VisitProcedures.tsx`
  - Verificar: destildar con un reporte descargado → mensaje, no borrado
- [ ] **T10 (P1, human: ~2d / CC: ~45min)** — base — Migración 0091: vistas a la fuente nueva,
      alerta por reporte, expansión de descartes viejos, drop de las columnas
  - Surgió de: Arquitectura 3A + D1 fase 3
  - Archivos: `supabase/migrations/0091_reportes_fuente_de_verdad.sql`
  - Verificar: **desplegar el front v3 ANTES**; después, ninguna alerta archivada reaparece
- [ ] **T11 (P1, human: ~4h / CC: ~20min)** — datos — `alertDismissals.ts` con la identidad nueva
      + ancla, con test de regresión
  - Surgió de: Arquitectura 3A (regresión obligatoria)
  - Archivos: `src/data/alertDismissals.ts`, `src/data/alertDismissals.test.ts`
  - Verificar: `npm run test` + la campana no cambia de número tras el deploy

---

## GSTACK REVIEW REPORT

| Corrida | Estado | Hallazgos |
|---|---|---|
| Step 0 · desafío de alcance | completo | 3 estructurales (radio de explosión de `has_report`, el 📎 apuntando a la plantilla, "Actuando como") |
| 1 · Arquitectura | completo | 7 (4 decididos por vos, 3 resueltos por precedente del repo) |
| 2 · Calidad de código | completo | 5 (3 decididos por vos, 2 resueltos) |
| 3 · Tests | completo | 22 rutas sin cobertura (todas código nuevo) + 2 regresiones obligatorias |
| 4 · Performance | completo | 3 (1 decidido por vos, 2 resueltos; 1 auto-corrección) |
| Voz externa | **no corrió** | Codex no está instalado y los subagentes están desactivados por instrucción del usuario |

**VERDICT:** APROBADO CON CONDICIONES. El plan es implementable en tres fases. Las dos condiciones
que no se negocian: el orden de despliegue de la fase 3 (front primero, migración después) y las
dos regresiones con test. Sin segunda opinión de otro modelo — este review es de un solo revisor.

NO UNRESOLVED DECISIONS
