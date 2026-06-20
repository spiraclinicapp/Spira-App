# Spira · Diseño — Gestión del cronograma del protocolo

- **Fecha:** 2026-06-20
- **Estado:** aprobado (brainstorming) — pendiente plan de implementación
- **Módulo:** Track
- **Origen:** investigación del Bug "Próximas visitas: 0" (ver memoria `spira-bug-proximas-visitas-cronograma`)

## Contexto y causa raíz

El KPI **"Próximas visitas (7 días)"** del Resumen de Track da 0 aunque haya 12 pacientes
randomizados. La query (`useUpcomingVisits`) es correcta. La causa raíz es de datos/modelo:

- Las visitas **programadas** (el cronograma) las genera `generate_patient_visits` al
  randomizar = una por cada `visit_definitions` del protocolo.
- Pero hay **solo 2 `visit_definitions` en total** (1 por protocolo, la mayoría de los
  protocolos con 0), y **no existe ninguna UI para definir el cronograma del protocolo**
  (solo se cargan por SQL). → randomizar no genera cronograma → no hay nada "próximo".

Esta feature cierra ese hueco: permitir definir el cronograma de cada protocolo **dentro de
la app**, y generar/actualizar el cronograma de los pacientes randomizados a partir de él.

## Objetivo

Que un usuario admin pueda definir el cronograma de visitas de un protocolo (V1, V2, … con su
día relativo a la randomización y su ventana) y que esas definiciones generen las visitas
programadas de cada paciente randomizado, poblando Resumen / Agenda / Próximas visitas.

## Decisiones (del brainstorming)

1. **Alcance: solo post-randomización.** El cronograma son las visitas que **nacen de la
   randomización** (`estimated = randomization_date + offset_days`). Las visitas
   pre-randomización (firma, screening, randomización) son **libres** (sueltas manuales) y
   quedan fuera del editor.
2. **Backfill on-demand.** Botón "Generar/actualizar cronograma" que crea las visitas
   faltantes de los pacientes **ya randomizados**, sin tocar las atendidas. Arregla los 12.
3. **Edición con preview + aplicar.** Al editar un cronograma que ya generó visitas, se
   muestra qué se **crearía / movería / borraría** (solo de las **no atendidas**) y el usuario
   confirma. **Las atendidas (`real_date`) nunca se tocan.**
4. **Enfoque SQL-céntrico.** La reconciliación vive en una RPC `SECURITY DEFINER` (atómica,
   server-side), consistente con `generate_patient_visits` y con "estado calculado en SQL".
   No se abre RLS para escribir visitas programadas desde el cliente.

## Modelo de datos — sin cambios de tabla

`visit_definitions` ya tiene todo lo necesario: `id, protocol_id, code, name, visit_type
('presencial'|'telefonica'), offset_days, window_minus, window_plus, sort_order, dispenses`.
La feature **no agrega columnas**. (Si el borrado de definiciones se vuelve complejo, evaluar
en el plan un soft-delete con columna `active`; ver "Regla de borrado".)

## Permisos (RLS)

La **lectura** de `visit_definitions` ya funciona (las vistas `security_invoker` la exponen).
Se agregan políticas **insert / update / delete** scopeadas a **gerencia o track-admin**
(definir el cronograma es configuración a nivel del protocolo). CRUD directo desde el cliente
con el patrón "0 filas afectadas = sin permiso" (igual que `updatePatient`).
*Decisión abierta menor:* sumar o no a la coordinadora asignada del protocolo (default: no;
solo gerencia/track-admin).

## RPC de sincronización — `sync_protocol_schedule`

```
sync_protocol_schedule(p_protocol_id uuid, p_apply boolean default false) returns jsonb
```

- **Authz:** gerencia o track-admin. Sin permiso → `42501`.
- **Conjunto deseado:** para cada enrolamiento `e` del protocolo con `e.status='activo'` y
  `e.randomization_date is not null`, y cada `vd` activa del protocolo:
  - `estimated_date = e.randomization_date + vd.offset_days`
  - `window_start   = estimated_date - vd.window_minus`
  - `window_end     = estimated_date + vd.window_plus`
- **Match** contra las programadas existentes por `(enrollment_id, visit_def_id)`.
- **Plan:**
  - **Crear** las deseadas sin programada existente.
  - **Mover** la programada existente **no atendida** cuya `estimated_date`/ventana difiera de
    la deseada (update de las 3 fechas).
  - **Borrar** la programada existente **no atendida** cuya `visit_def_id` ya no esté entre las
    defs del protocolo.
  - **Atendidas (`real_date` no nulo): nunca se tocan** (ni mover ni borrar). Si una atendida
    difiere de la def, se reporta como "divergente" pero no se modifica.
- **`p_apply=false`** → devuelve el plan como JSON `{creates, moves, deletes, untouched_attended, details[]}` sin escribir.
- **`p_apply=true`** → ejecuta el plan en **una transacción** y devuelve el resumen aplicado.

El cliente llama dry-run para el preview, y apply al confirmar.

## CRUD de definiciones + regla de borrado

- **Crear / editar / reordenar** `visit_definitions` por escritura directa (RLS). Reordenar =
  update de `sort_order`.
- **Regla de borrado de una definición:** vía RPC `delete_visit_definition(p_def_id)`
  (`SECURITY DEFINER`, atómica):
  - Si existe **alguna visita atendida** (`real_date` no nulo) que la referencie → **bloquea**
    con mensaje claro ("no se puede quitar una visita que ya ocurrió"). 
  - Si no → borra sus visitas programadas **no atendidas** y luego la definición.
  - El front muestra el impacto antes de confirmar (cuántas no atendidas se borrarían).
  - Evita el conflicto de FK `patient_visits.visit_def_id → visit_definitions`.

## UI

Sección **"Cronograma"** dentro del **Detalle de Protocolo** (`ProtocolDetailView`):

- **Tabla de definiciones:** orden · código · nombre · día (offset_days) · ventana (−/+) ·
  tipo · dispensa. Acciones: agregar, editar (modal), borrar (con confirm de impacto),
  reordenar.
- **Botón "Generar / actualizar cronograma"** → llama al dry-run → **modal de preview**
  (X a crear · Y a mover · Z a borrar, desglosable por paciente/visita) → "Aplicar" → ejecuta
  → toast + refetch de las vistas afectadas.
- **Empty state** cuando el protocolo no tiene definiciones: "Este protocolo no tiene
  cronograma. Agregá las visitas para generarlo."

**Componentes nuevos:**
- `src/data/visitDefinitions.ts` — hooks/funciones: `useProtocolDefinitions`,
  `createDefinition`, `updateDefinition`, `deleteDefinition`, `reorderDefinitions`,
  `previewScheduleSync`, `applyScheduleSync`.
- `src/views/track/ScheduleEditor.tsx` — la sección/tabla.
- `src/views/track/ScheduleDefinitionForm.tsx` — alta/edición de una definición.
- `src/views/track/ScheduleSyncModal.tsx` — preview + aplicar.

## Migración y rollout

- **Nueva migración `0026`**: políticas RLS de `visit_definitions` (insert/update/delete) +
  `sync_protocol_schedule` + `delete_visit_definition`. Se aplica **a mano en prod** (sin
  acceso SQL directo programático; el usuario la corre en el dashboard).
- **Backfill de los 12 actuales:** una vez definido el cronograma de cada protocolo, correr
  "Generar/actualizar cronograma" desde la UI por protocolo.

## Fuera de alcance (YAGNI — van por separado)

- Sueltas que nunca vencen (sin `window_end` → nunca `ventana_vencida`).
- Validación de `real_date` futuro.
- Regla de "cierre/arrastre" de la vista Visitas del día (visitas cerradas que siguen en la
  lista).

Estos quedan documentados como deuda; no son parte de esta feature.

## Verificación

- `npm run typecheck` verde.
- **QA en browser** (gstack `/browse`): definir un cronograma en un protocolo → "Generar" →
  confirmar que las visitas aparecen en Agenda y que "Próximas visitas (7d)" se puebla.
- **Script SQL de verificación** en `supabase/scripts/` (patrón de los `*-verificacion.sql`):
  validar el plan de sync (create/move/delete) y que las atendidas no se tocan.

## Riesgos / a resolver en el plan

- **FK `visit_def_id`** y borrado de definiciones (ver regla de borrado; alternativa
  soft-delete con `active`).
- Forma exacta del JSON del plan (preview) y cuánto detalle por paciente mostrar.
- Reordenar definiciones: que `sort_order` no choque con índices únicos si los hubiera.
- Confirmar el estado actual de RLS sobre `visit_definitions` (¿RLS activa? ¿hay policy de
  select, o se lee solo vía vistas?) antes de escribir las policies de escritura.
