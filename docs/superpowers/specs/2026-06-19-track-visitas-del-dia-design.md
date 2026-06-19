# Spec — Track: reestructura de submódulos + vista "Visitas del día"

**Fecha:** 2026-06-19
**Autor:** Lautaro Molina (con Claude)
**Estado:** diseño aprobado en brainstorming, pendiente de plan de implementación.

---

## Contexto

El módulo **Track** tiene hoy 4 submódulos (`Resumen`, `Protocolos`, `Agenda`, `Plantillas`) y un
modelo de visitas **binario**: una visita salta de "próxima" a "realizada" en un solo paso (al setear
`real_date`). No existe forma de seguir el **recorrido del paciente dentro del centro en el día** (llegó,
fue atendido, se le dispensó, se retiró), que es justamente lo que la coordinación necesita para operar
el día a día con varias visitas simultáneas.

Este cambio reestructura el menú de Track según un diseño de referencia y agrega la pieza central: una
vista **"Visitas del día"** que modela ese recorrido como etapas operativas, con acciones gateadas por
rol, una cola de "pacientes por ver el médico", y dispensación condicional vinculable al futuro módulo
Pharma. El objetivo es una herramienta **simple de usar en el día a día** sobre el modelo de datos ya
existente (`v_track_visits`, migración 0022), reusando lo más posible.

## Alcance

**En alcance (esta tanda):**
- Reestructurar el menú de Track.
- Renombrar el submódulo `Protocolos` → "Pacientes" (solo etiqueta).
- Vista nueva **Visitas del día**.
- Submódulo nuevo **Para ver médico** (cola).
- Submódulo nuevo **Alertas** (promueve el card del Resumen).
- Sacar **Plantillas** del menú (la vista sigue existiendo, accesible aparte).
- Migración de base chica (etapas operativas + dispensación mínima).

**Fuera de alcance (fase 2):**
- Dashboard "Estudios" completo (breakdown por sitio + integración Spira Lab) — `Resumen` queda como está.
- Mejoras de **Agenda** (citas/turnos, hora de llegada) — queda como está.
- "Marcar visto/cerrado" en Alertas.
- Pantalla dedicada del médico (futuro módulo **Médicos**).
- Lógica completa de Pharma (stock, catálogo de kits, lotes).
- Módulo **Administración** de recepción y "en qué vino el paciente" (medio de transporte).

---

## 1. Reestructuración del menú de Track

Menú final (en `src/modules/registry.ts`, array `submodules` del módulo `track`):

`Resumen · Pacientes · Visitas · Para ver médico · Agenda · Alertas`

- **Pacientes**: el submódulo actual `protocolos`. Cambia **solo el `name`** a "Pacientes"; la `key`
  sigue siendo `protocolos` y la vista `ProtocolsView` queda intacta (la jerarquía de datos es
  Protocolo→Pacientes; no se invierte). Importante: NO renombrar la `key`, porque Pharma comparte
  `ProtocolsView` vía `pharma/protocolos`.
- **Visitas**, **Para ver médico**, **Alertas**: submódulos nuevos (secciones 2–4).
- **Plantillas**: se quita del array `submodules` de Track. `TemplatesView` sigue registrada; se accede
  desde config/ajustes (definir punto de acceso en el plan; no bloquea).
- **Resumen** y **Agenda**: sin cambios.

Patrón de alta de submódulo (verificado en el código):
1. Agregar `{key, name, icon}` a `MODULES[track].submodules` en `src/modules/registry.ts`.
2. Crear la vista (implementa `ViewProps` de `src/views/types.ts`).
3. Registrar `'track/<key>'` → componente en `src/views/registry.tsx` (`VIEW_REGISTRY`). Lo no
   registrado cae a `Placeholder.tsx`.
4. Si la vista trae acciones propias, sumar a `HIDE_ACTION` en `src/shell/AppShell.tsx` (y/o
   `ACTION_LABELS`).

`keys` sugeridas: `visitas`, `para-ver-medico`, `alertas`.

## 2. Vista "Visitas del día"

### Qué muestra
- Las visitas **de hoy**: `estimated_date = current_date` (programadas) **o** `real_date = current_date`
  (sueltas/registradas hoy) **o** con alguna marca de etapa hoy (en curso).
- Filtros arriba: **Todas · En el centro · Para ver médico** ("En el centro" = llegó y aún no se
  retiró, en cualquier etapa intermedia).
- Privacidad: identificador visible = código del paciente; nombre detrás de `PrivacyAvatar`.

### Layout (Variante 2 — lista con pasos)
- Cada visita es una **fila** con un **stepper** horizontal de etapas y un **botón** que avanza a la
  etapa siguiente (un tap). Todos los pacientes del día a la vista, sin panel de detalle aparte.
- Reusar el patrón de fila de `src/views/track/PdPatientRow.tsx` y los helpers de `src/lib/visits.ts`.

### Flujo de etapas y permisos por rol
Etapas operativas (recorrido del paciente en el centro):

| Etapa | Marca | Quién la marca |
|---|---|---|
| **Por llegar** | (estado inicial, sin marca) | — |
| **En el sitio** (llegó) | `arrived_at` | Recepción / Administración |
| **Atendido** | `real_date` (existente) | Clínico / Coordinador |
| **Listo para irse** | `ready_at` | Clínico / Coordinador |
| **Fuera del sitio** (se retiró) | `left_at` | Recepción / Administración |

- El flujo es lineal; la **etapa actual se deriva** de la última marca seteada
  (`left_at` → fuera; `ready_at` → listo; `real_date` → atendido; `arrived_at` → en el sitio; si no,
  por llegar).
- **Handoff:** el clínico marca "Listo para irse"; recién entonces recepción marca "Se retiró".
- En "Por llegar" hay una acción **"No vino"** (marca/reprograma vía `RescheduleModal`).
- Las marcas guardan timestamp (auditoría) pero la **UI no muestra la hora**.

### Acciones laterales (si corresponde)
- **Dispensar medicación**: solo si la visita dispensa (ver `visit_definitions.dispenses`, §5). La marca
  el **clínico/coordinador** (un rol Farmacia exclusivo es ajuste futuro). Crea un registro mínimo en
  `dispensations` (§5) que el futuro módulo Pharma leerá. Reusar `Modal`/`FormField` para elegir kit.
- **"Quiere ver el médico"** (toggle, `wants_doctor`): la suma a la cola **Para ver médico** (§3). La
  marca el clínico/coordinador.

### Atendido y checklist clínico
- "Atendido" = la visita clínica ocurrió → setea `real_date` (reusar `registerVisit` de
  `src/data/visits.ts`), lo que dispara el trigger `materialize_checklist` (0022) y materializa el
  checklist de la visita.
- El **checklist clínico** (consentimiento, labs, ECG, IVRS…) se ve/completa al **abrir** la visita
  desde la fila — **separado** de las etapas operativas. Esto requiere construir lo que hoy NO existe
  (ver §6): un hook `useVisitChecklist(visitId)` que lea `checklist_items` + `checklist_completions`,
  la mutación de completar/descompletar ítem, y un componente de checklist.

## 3. Submódulo "Para ver médico"

- Cola de pacientes con `wants_doctor = true` y aún en el centro (`left_at IS NULL`), del día.
- Lista simple reusando el patrón de filas + `PrivacyAvatar`. Acción: "Atendido por médico" (limpia el
  flag) — definir en el plan si limpia `wants_doctor` o setea un `seen_by_doctor_at`.
- Es la **semilla** del futuro módulo Médicos. Hook nuevo `useDoctorQueue()`.

## 4. Submódulo "Alertas"

- Promueve el card "Alertas" del Resumen (`TrackResumenView.tsx`, ~líneas 143–180) a **vista full**.
- Reusa `useVisitAlerts()` (`v_track_visits` con `computed_status IN ('ventana_vencida','item_vencido')`)
  + `VISIT_STATES`/`VisitChip`.
- Agregar filtros por **protocolo** y por **antigüedad** (hoy `useVisitAlerts` no filtra por fecha →
  arrastra alertas viejas).
- "Marcar visto/cerrado" → **fase 2** (requiere columna/tabla nueva).

## 5. Modelo de datos / migración

Una migración nueva en `supabase/migrations/` (siguiente en la serie, ~`0023_track_visita_dia.sql`).
Seguir el patrón de 0022 (recrear vistas en orden de dependencia: `v_track_visits` depende de
`v_patient_visits`).

### Cambios de esquema
- `patient_visits` += `arrived_at timestamptz`, `ready_at timestamptz`, `left_at timestamptz`,
  `wants_doctor boolean NOT NULL DEFAULT false`. ("Atendido" reusa `real_date`, ya existente.)
- `visit_definitions` += `dispenses boolean NOT NULL DEFAULT false` — marca qué visitas entregan
  medicación (Dispensado condicional). Setear `true` donde corresponda por protocolo. Para sueltas
  (sin `visit_def_id`) el default es no-dispensa salvo `kind` que lo amerite (definir en el plan).
- Tabla nueva `dispensations`: `id`, `patient_visit_id` (FK), `patient_id`, `dispensed_at timestamptz`,
  `dispensed_by` (usuario), `kit_code text`, `notes text`. Pensada para que Pharma la lea después.

### Vistas / derivación
- Extender `v_track_visits` (o exponer en una vista) las nuevas columnas + una expresión de **etapa
  operativa** derivada de las marcas (por_llegar/en_el_sitio/atendido/listo/fuera). Mantener
  `computed_status` (clínico) **separado** de la etapa operativa.

### RPCs / mutaciones (SECURITY DEFINER, patrón de `register_visit_event`)
- `mark_arrived(visit)` / `mark_left(visit)` → autorizadas para **recepción/admin**.
- `mark_attended(visit)` (= `registerVisit` / set `real_date`), `mark_ready(visit)`,
  `toggle_wants_doctor(visit, bool)` → **clínico/coordinador** (operator+ asignado).
- `dispense(visit, kit_code, notes)` → inserta en `dispensations` (clínico/coordinador por ahora).
- Todas auditadas (el trigger de `patient_visits` ya audita INSERT/UPDATE; sumar `dispensations`).

### Permisos / RLS
- Las RPCs validan el rol del llamador (como hoy validan operator+). Mapear a roles existentes:
  - **Recepción/Administración**: nuevo capability/rol. Si no existe, sumarlo al sistema de roles
    (hoy el gating real es por `useAuth().modules` + niveles). Solo puede `mark_arrived` / `mark_left`.
  - **Clínico/Coordinador** (operator+ asignado al protocolo): el resto de las marcas + dispensar +
    médico.
- `dispensations`: RLS por protocolo del paciente (como el resto de Track); Pharma/gerencia ven todo.

### Hooks (front, en `src/data/visits.ts` o nuevo `src/data/dayVisits.ts`)
- `useVisitsForDay(date)` — NUEVO (hoy solo hay 7d/semana/protocolo/paciente).
- `useDoctorQueue()` — NUEVO.
- Mutaciones por etapa + `dispense` que llaman a las RPCs.
- `useVisitChecklist(visitId)` + toggle completion — NUEVO (lee el checklist materializado).

## 6. Componentes a reusar (verificados en el código)

| Qué | Ruta | Uso |
|---|---|---|
| MODULES / submódulos | `src/modules/registry.ts` | renombrar Pacientes, sacar Plantillas, agregar 3 |
| VIEW_REGISTRY / resolveView | `src/views/registry.tsx` | registrar las vistas nuevas |
| Placeholder | `src/views/Placeholder.tsx` | fallback para submódulos aún sin vista |
| ViewProps / ViewHeader | `src/views/types.ts` | contrato de las vistas nuevas |
| VISIT_STATES + VisitChip | `src/views/visitStates.tsx` | estados; extender con las etapas operativas |
| hooks/mutaciones de visitas | `src/data/visits.ts` | base; sumar useVisitsForDay, cola, etapas |
| registerVisit | `src/data/visits.ts` | "Atendido" (set real_date + checklist) |
| RegisterVisitFlow / RescheduleModal | `src/views/track/` | registrar/reprogramar; "No vino" |
| PdPatientRow / lib/visits | `src/views/track/PdPatientRow.tsx`, `src/lib/visits.ts` | fila + helpers del stepper |
| card de Alertas + KpiCard | `src/views/TrackResumenView.tsx` (~143–180) | base de la vista Alertas |
| templates (referencia) | `src/data/templates.ts` | referencia para `useVisitChecklist` |
| UI compartida | `src/components/` (PrivacyAvatar, EmptyState, Modal, FormField, Icon, buttons) | reusar en todas las vistas nuevas |

## 7. Verificación (cómo probar)

1. **Build:** `npm run build` verde (tsc + vite).
2. **Migración:** aplicar `0023` en el SQL Editor; verificar columnas/tabla y que `v_track_visits`
   sigue funcionando.
3. **En vivo (preview):**
   - Track → Visitas: aparecen las visitas de hoy con su stepper.
   - Avanzar etapas: como clínico se puede marcar Atendido/Listo; como recepción solo
     En el sitio/Se retiró (verificar que el rol contrario está bloqueado).
   - Toggle "Quiere ver el médico" → aparece en **Para ver médico**.
   - Dispensar en una visita con `dispenses=true` → se crea fila en `dispensations`; no aparece la
     acción si `dispenses=false`.
   - Abrir una visita → se ve/completa el checklist clínico.
   - Alertas: la vista lista las alertas con filtros.
4. **Datos:** confirmar auditoría de las marcas y de `dispensations`. No tocar pacientes/visitas que no
   sean `TEST-*`.

## 8. Decisiones tomadas (no re-discutir)

- Alcance = estructura + Visitas a fondo; Estudios/Lab/sitio, Agenda, "visto" en Alertas, Médicos y
  Pharma completo = fase 2.
- Pacientes = Protocolos con `name` cambiado (no se cambia la `key` ni se invierte la jerarquía).
- "En curso" evolucionó a recorrido de 5 etapas: Por llegar → En el sitio → Atendido → Listo para irse
  → Fuera del sitio.
- Etapas operativas **decopladas** del registro clínico; el punto clínico es "Atendido" (= `real_date`).
- Layout = Variante 2 (lista con pasos), por simplicidad con varias visitas.
- Dispensado **condicional** (`visit_definitions.dispenses`).
- Dispensación = marca + **registro mínimo** (`dispensations`) vinculable a Pharma; detalle completo de
  Pharma = futuro.
- Permisos por rol: Recepción/Admin = llegó + se retiró; Clínico = atendido, listo, dispensar, médico.
- "Para ver médico" = submódulo propio ya.
- Plantillas fuera del menú.
- Marcas sin hora en la UI (timestamp en base para auditoría).
