# La baja es por estudio — Plan de implementación

> **Para quien lo ejecute:** SUB-SKILL REQUERIDA: usar `superpowers:subagent-driven-development`
> (recomendado) o `superpowers:executing-plans` para ejecutarlo tarea por tarea. Los pasos usan
> checkbox (`- [ ]`) para seguimiento.

**Objetivo:** que dar de baja a un paciente cierre **su inscripción a un estudio** y no a la persona,
para que alguien dado de baja en ACT18301 siga viéndose activo en LTS17231.

**Arquitectura:** `enrollments.status` pasa a ser el estado dentro de un estudio; el estado de la
persona se deduce (activa = alguna inscripción abierta, o ninguna inscripción todavía) en vez de
guardarse. Una RPC nueva (`close_enrollment`) cierra la inscripción con motivo, sella autor y fecha, y
borra las visitas futuras sin atender en la misma transacción. El front deja de leer y de escribir
`patients.status`.

**Stack:** React + TypeScript strict, Vite, Supabase (PostgREST + RPC), vitest. Sin react-router ni
react-query. CSS con variables en `src/styles/tokens.css`.

**Spec:** `docs/superpowers/specs/2026-09-15-baja-por-estudio-design.md`

## Global Constraints

- Comentarios, nombres de dominio y copy de UI en **castellano rioplatense**. Comentarios densos que
  expliquen **el porqué**, no el qué — igualar la densidad del código existente.
- El gate de verificación es **`npm run build`** (`tsc --noEmit && vitest run && vite build`) **verde**.
  No afirmar "anda" sin eso.
- La migración es la **0127** (la última aplicada es la 0126). Migraciones **inmutables y numeradas**:
  nunca editar ni renumerar una aplicada.
- **Orden de despliegue: la migración va PRIMERO.** Es puramente aditiva (columnas y funciones nuevas
  que ningún front desplegado consulta) y el que no funciona sin ella es el front nuevo.
- Dentro de una función con `set search_path` acotado, **calificar todo** lo que no sea de `public` ni
  de `pg_catalog`. Para uuid en runtime, `gen_random_uuid()`.
- **Nunca dos signos peso pegados dentro de un comentario SQL**: el editor de Supabase rastrea el
  dollar-quoting sin ignorar comentarios y uno suelto le invierte la paridad.
- **Desplegables, no texto libre** (valores preestablecidos para evitar errores del operador).
- **El realce es elevación, nunca borde de color.** El color se reserva para significado.
- Errores de Postgres traducidos a **mensajes serenos en castellano** (patrón `*ErrorMessage` de
  `src/data/`). Tras un `update`/`delete` directo, **0 filas = sin permiso**, no éxito.
- Git: **verificar la rama antes de cada commit** (hay hook que bloquea `main`) y **stagear por ruta**
  (`git add <archivos>`), nunca `git add -A`. La rama de este trabajo es `feat/baja-por-estudio`.

---

## Estructura de archivos

| Archivo | Responsabilidad |
|---|---|
| `supabase/scripts/baja-por-estudio-fase0/corregir.sql` | **Crear.** Corrección puntual de los 3 pacientes ya mal marcados en prod. |
| `supabase/migrations/0127_cierre_de_inscripcion.sql` | **Crear.** Columnas del sello + `close_enrollment` + `reopen_enrollment` + comentario legacy en `patients.status`. |
| `src/lib/inscripcion.ts` | **Crear.** Reglas puras: qué es una inscripción abierta, cuál es la del estudio en contexto, si la persona está activa, y el mapa motivo → estado. |
| `src/lib/inscripcion.test.ts` | **Crear.** Tests de lo que falla en silencio. |
| `src/data/enrollments.ts` | **Crear.** `closeEnrollment`, `reopenEnrollment`, `useVisitasFuturas`. |
| `src/data/patients.ts` | **Modificar.** Sumar `status` al embed de `enrollments`; sacar `status` de `EditPatientInput`. |
| `src/components/EstadoPaciente.tsx` | **Modificar.** Recibe estado de inscripción, lo pinta binario y lo explica en palabras. |
| `src/views/track/PdPatientRow.tsx` | **Modificar.** El punto lee la inscripción del estudio de la fila. |
| `src/views/ProtocolDetailView.tsx` | **Modificar.** Filtro «Activos» y KPI por inscripción. |
| `src/views/PatientFichaView.tsx` | **Modificar.** El punto por inscripción + el botón «Cerrar participación». |
| `src/views/track/CerrarInscripcionModal.tsx` | **Crear.** El modal de cierre y de reapertura. |
| `src/views/InicioResumenView.tsx` | **Modificar.** KPI de pacientes activos. |
| `src/views/TrackResumenView.tsx` | **Modificar.** KPI de pacientes activos. |
| `src/views/EditPatientForm.tsx` | **Modificar.** Se va el campo «Estado». |
| `src/views/track/ReadyOutcomeModal.tsx` | **Modificar.** Copy: cierra la inscripción, no «inactiva el paciente». |

---

### Task 1: Fase 0 — corregir producción

Va **antes que todo el código**: hoy la app está diciendo que tres personas no están en seguimiento, y
es falso. Los tres `patient_id` salen del `audit_log` (sonda ya corrida el 2026-09-16) y van escritos
uno por uno: **nunca** barrer por categoría.

**Files:**
- Create: `supabase/scripts/baja-por-estudio-fase0/corregir.sql`

**Interfaces:**
- Consumes: nada.
- Produces: nada en código. Deja producción coherente para que las tareas siguientes se verifiquen
  contra datos que no mienten.

- [ ] **Step 1: Escribir el script**

```sql
-- Spira · Fase 0 de «la baja es por estudio» — corregir lo que ya pasó en producción
-- ============================================================================
-- El 2026-09-16 02:38 UTC se dieron de baja tres pacientes desde ACT18301 usando
-- «Editar paciente › Estado › Inactivo». Esa columna es de la PERSONA, así que los tres
-- aparecieron dados de baja también en LTS17231, que es la extensión de ACT y tiene a las
-- mismas personas inscriptas.
--
-- Los tres NO abandonaron: completaron ACT y pasaron a la extensión. O sea que hay dos cosas
-- que corregir, no una: el estado de la persona (estaba mal) y el de la inscripción a ACT18301
-- (nunca se cerró).
--
-- Los ids salen del `audit_log` y van escritos uno por uno. NO se filtra por
-- `status = 'inactivo'`: eso barrería también bajas legítimas anteriores.
--
-- SÓLO TOCA: patients.status de esos 3 ids, y enrollments.status de sus inscripciones a ACT18301.
-- NO toca visitas, ni LTS17231, ni ningún otro paciente.
--
-- APLICAR: a mano en el SQL Editor de Supabase. IDEMPOTENTE (correrlo dos veces deja lo mismo).
-- Las sentencias NO comparten sesión ni transacción en ese editor: por eso todo va en un único
-- bloque `do`, y por eso cada consulta de control repite su propia lista de ids.
-- ============================================================================

do $fase0$
declare
  v_ids uuid[] := array[
    'a9265265-9be4-4c18-88c1-6ca9a08d6e24',  -- Ricardo Lucio Aguero
    '852f9d61-6b08-4154-9284-ef78cf8f3e90',  -- Andres Muñoz Pampillon
    'd0c14b37-6d9f-40ea-b6b3-64704220ac99'   -- Maria Julieta Calderon
  ];
  v_act uuid;
  v_n   int;
begin
  select p.id into v_act from public.protocols p where p.code = 'ACT18301';
  if v_act is null then
    raise exception 'No encontré el protocolo ACT18301. No se cambió nada.';
  end if;

  -- 1 · La persona vuelve a estar en seguimiento. El `where status` evita escribir (y dejar una
  --     fila en audit_log) si alguien ya la corrigió a mano.
  update public.patients
     set status = 'activo'
   where id = any (v_ids)
     and status <> 'activo';
  get diagnostics v_n = row_count;
  raise notice 'Pacientes devueltos a activo: %', v_n;

  -- 2 · La inscripción a ACT18301 queda CERRADA como corresponde: completaron y pasaron a la
  --     extensión. `completado` y no `discontinuado`: no abandonaron, y en una app auditable esa
  --     diferencia es el dato.
  update public.enrollments e
     set status = 'completado'
   where e.patient_id = any (v_ids)
     and e.protocol_id = v_act
     and e.status not in ('completado', 'discontinuado');
  get diagnostics v_n = row_count;
  raise notice 'Inscripciones a ACT18301 marcadas completadas: %', v_n;
end
$fase0$;


-- Control 1 · Los tres, con TODAS sus inscripciones. Esperado: persona «activo», ACT18301
--             «completado», LTS17231 como estuviera (activo).
select pa.full_name as paciente, pa.status as persona,
       p.code as estudio, e.status as inscripcion
from public.patients pa
join public.enrollments e on e.patient_id = pa.id
join public.protocols p   on p.id = e.protocol_id
where pa.id in ('a9265265-9be4-4c18-88c1-6ca9a08d6e24',
                '852f9d61-6b08-4154-9284-ef78cf8f3e90',
                'd0c14b37-6d9f-40ea-b6b3-64704220ac99')
order by pa.full_name, p.code;


-- Control 2 · Qué visitas futuras sin atender les quedan en ACT18301. NO se borran acá: el borrado
--             lo hace `close_enrollment` (0127) con el número a la vista. Esto es para saber de
--             cuántas estamos hablando antes de que exista el botón.
select pa.full_name as paciente,
       count(*) filter (where pv.window_end >= current_date) as futuras,
       count(*) filter (where pv.window_end <  current_date) as vencidas
from public.patient_visits pv
join public.enrollments e on e.id = pv.enrollment_id
join public.patients   pa on pa.id = e.patient_id
join public.protocols   p on p.id = e.protocol_id
where pa.id in ('a9265265-9be4-4c18-88c1-6ca9a08d6e24',
                '852f9d61-6b08-4154-9284-ef78cf8f3e90',
                'd0c14b37-6d9f-40ea-b6b3-64704220ac99')
  and p.code = 'ACT18301'
  and pv.real_date is null
group by pa.full_name
order by pa.full_name;
```

- [ ] **Step 2: Commit**

```bash
git add supabase/scripts/baja-por-estudio-fase0/corregir.sql
git commit -m "chore(datos): fase 0 de la baja por estudio - corregir los tres pacientes de ACT18301"
```

- [ ] **Step 3: Pedirle al Director que lo corra y pegue los dos controles**

No seguir hasta tener el resultado. El control 1 tiene que mostrar los tres con persona `activo`,
ACT18301 `completado` y LTS17231 `activo`. Si LTS aparece cerrado, **frenar y avisar**: significa que
hay otra baja que la sonda del `audit_log` no capturó.

---

### Task 2: Migración 0127 — el cierre de una inscripción

**Files:**
- Create: `supabase/migrations/0127_cierre_de_inscripcion.sql`
- Modify: `supabase/README.md` (índice de migraciones)

**Interfaces:**
- Produces:
  - `public.close_enrollment(p_enrollment_id uuid, p_reason text) returns jsonb`
    → `{"estado": "completado"|"discontinuado", "borradas": int, "conservadas": int}`
  - `public.reopen_enrollment(p_enrollment_id uuid) returns void`
  - Columnas nuevas en `enrollments`: `closed_at timestamptz`, `closed_reason text`,
    `closed_by uuid`, `closed_from_status public.enrollment_status`.

- [ ] **Step 1: Escribir la migración**

```sql
-- Spira · Migración 0127 — cerrar la inscripción de un paciente a UN estudio
-- ============================================================================
-- EL PROBLEMA QUE CIERRA. Hasta hoy la única forma de «dar de baja» a un paciente desde la app era
-- «Editar paciente › Estado › Inactivo», que escribe `patients.status` — una columna de la PERSONA,
-- no del estudio. El 2026-09-16 eso dio de baja en LTS17231 a tres pacientes que se estaban cerrando
-- en ACT18301: son las mismas personas inscriptas dos veces (LTS es la extensión de ACT).
--
-- El estado por inscripción ya existía (`enrollments.status`, 0001) pero la única puerta que lo movía
-- era el desenlace «fallo de screening» de una visita (`discontinue_enrollment`, 0030), que siempre
-- escribe `discontinuado`. Faltaba el cierre BUENO: completar el estudio no es abandonarlo, y en un
-- sistema auditable esa diferencia es el dato.
--
-- QUÉ AGREGA:
--   · El sello del cierre en `enrollments` (cuándo, por qué, quién, y de qué estado venía).
--   · `close_enrollment`  — cierra con motivo y borra las visitas futuras sin atender.
--   · `reopen_enrollment` — deshace el cierre y devuelve la inscripción al estado que tenía.
--
-- ORDEN DE DESPLIEGUE: **ADITIVA, VA PRIMERO** (antes del front). Columnas y funciones nuevas que
-- ningún front desplegado consulta; el que no funciona sin esto es el front nuevo.
--
-- APLICAR: a mano en el SQL Editor de Supabase (rol postgres), DESPUÉS de la 0126. IDEMPOTENTE.
-- ============================================================================


-- 1 · El sello del cierre -------------------------------------------------------------------
-- Columnas propias y no una línea en `notes` (que es lo que hace hoy `discontinue_enrollment`):
-- esto es traza regulatoria y se consulta, no se lee a ojo.
-- `closed_from_status` existe para que reabrir devuelva al estado REAL: una inscripción cerrada en
-- screening tiene que volver a screening, no a activo — activo le dispararía el cronograma.
alter table public.enrollments
  add column if not exists closed_at          timestamptz,
  add column if not exists closed_reason      text,
  add column if not exists closed_by          uuid references public.users(id),
  add column if not exists closed_from_status public.enrollment_status;

comment on column public.enrollments.closed_reason is
  'Motivo del cierre, del vocabulario cerrado de close_enrollment. NULL en las cerradas antes de la 0127. 0127.';

-- La constraint acepta NULL, así que las filas viejas (todas con NULL) pasan sin tocarlas.
do $c$
begin
  if not exists (select 1 from pg_constraint where conname = 'enrollments_closed_reason_check') then
    alter table public.enrollments add constraint enrollments_closed_reason_check
      check (closed_reason is null or closed_reason in (
        'completo', 'extension', 'consentimiento', 'exclusion',
        'evento_adverso', 'perdida_seguimiento', 'investigador'));
  end if;
end
$c$;

-- El estado de la PERSONA queda legacy: desde el front de esta tanda no se escribe ni se lee más.
-- No se borra porque es parte de la traza histórica del audit_log.
comment on column public.patients.status is
  'LEGACY desde la 0127: el estado que vale es el de cada inscripción (enrollments.status). La app ya no lo escribe ni lo lee; se deduce «persona activa = alguna inscripción abierta».';


-- 2 · Cerrar la inscripción -----------------------------------------------------------------
-- Devuelve jsonb y no void porque el front necesita DOS números para decir la verdad: cuántas
-- visitas futuras se borraron y cuántas se conservaron por tener un pedido de farmacia colgando.
--
-- QUÉ SE BORRA, exactamente: `programada` (las sueltas no salen del cuadro), sin atender, y con la
-- ventana todavía abierta. Una con la ventana ya vencida NO se toca: esa ya produjo su alerta y el
-- camino es archivarla con motivo y autor (decisión del Director, 2026-09-05 — en una lista con
-- descarte auditable, esconder por regla es peor que dejarla).
--
-- Y se saltean las que tienen dependencias con FK `on delete restrict`: un pedido de dispensación
-- (0002) o una unidad de IP dispensada (0037). Borrarlas reventaría la transacción entera con 23503
-- justo cuando alguien cierra una inscripción, que es lo último que querés que falle.
--
-- El borrado va ANTES del update para que, si algo lo bloquea, la inscripción no quede cerrada con
-- las visitas a medio limpiar: las dos cosas viven en la misma transacción de la función.
create or replace function public.close_enrollment(p_enrollment_id uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $fn$
declare
  v_protocol    uuid;
  v_status      public.enrollment_status;
  v_nuevo       public.enrollment_status;
  v_borradas    int;
  v_conservadas int;
begin
  if auth.uid() is null then
    raise exception 'No autenticado' using errcode = '42501';
  end if;

  select e.protocol_id, e.status into v_protocol, v_status
  from public.enrollments e where e.id = p_enrollment_id;
  if v_protocol is null then
    raise exception 'La inscripción no existe' using errcode = '23503';
  end if;

  -- Misma autorización que discontinue_enrollment (0030): gerencia, track-admin, u operator
  -- asignado al protocolo.
  if not (public.has_module('gerencia') or public.has_min_role('track', 'admin')
          or (public.has_min_role('track', 'operator') and public.is_assigned_coordinator(v_protocol))) then
    raise exception 'No tenés permiso para cerrar esta inscripción' using errcode = '42501';
  end if;

  if v_status in ('completado', 'discontinuado') then
    raise exception 'Esa inscripción ya está cerrada' using errcode = '23514';
  end if;

  -- El motivo (hecho clínico) determina el estado (valor técnico). El vocabulario está duplicado en
  -- `src/lib/inscripcion.ts`: si se desincronizan, esta rama levanta 23514 y el front muestra el
  -- mensaje — falla RUIDOSA, que es lo que se quiere de una duplicación inevitable.
  v_nuevo := case p_reason
    when 'completo'            then 'completado'
    when 'extension'           then 'completado'
    when 'consentimiento'      then 'discontinuado'
    when 'exclusion'           then 'discontinuado'
    when 'evento_adverso'      then 'discontinuado'
    when 'perdida_seguimiento' then 'discontinuado'
    when 'investigador'        then 'discontinuado'
  end;
  if v_nuevo is null then
    raise exception 'Motivo de cierre desconocido: %', p_reason using errcode = '23514';
  end if;

  select count(*) into v_conservadas
  from public.patient_visits pv
  where pv.enrollment_id = p_enrollment_id
    and pv.real_date is null
    and pv.window_end >= current_date
    and (exists (select 1 from public.dispensation_requests dr where dr.visit_id = pv.id)
         or exists (select 1 from public.ip_units u where u.dispensed_visit_id = pv.id));

  delete from public.patient_visits pv
  where pv.enrollment_id = p_enrollment_id
    and pv.kind = 'programada'
    and pv.real_date is null
    and pv.window_end >= current_date
    and not exists (select 1 from public.dispensation_requests dr where dr.visit_id = pv.id)
    and not exists (select 1 from public.ip_units u where u.dispensed_visit_id = pv.id);
  get diagnostics v_borradas = row_count;

  update public.enrollments
     set status             = v_nuevo,
         closed_at          = now(),
         closed_reason      = p_reason,
         closed_by          = auth.uid(),
         closed_from_status = v_status
   where id = p_enrollment_id;

  return jsonb_build_object('estado', v_nuevo, 'borradas', v_borradas, 'conservadas', v_conservadas);
end
$fn$;

comment on function public.close_enrollment(uuid, text) is
  'Cierra una inscripción con motivo (completado|discontinuado según el motivo), sella autor/fecha/estado previo y borra sus visitas futuras sin atender. authz: gerencia, track-admin u operator asignado. 0127.';

revoke all    on function public.close_enrollment(uuid, text) from public;
grant execute on function public.close_enrollment(uuid, text) to authenticated;


-- 3 · Reabrir -------------------------------------------------------------------------------
-- Devuelve al estado que tenía antes del cierre. `coalesce(..., 'activo')` cubre las cerradas antes
-- de la 0127 (y las que cierre `discontinue_enrollment`, que no sella): ésas no saben de dónde
-- venían y 'activo' es el único supuesto razonable.
--
-- Las visitas borradas NO vuelven acá: las regenera el botón de sincronizar del cronograma, que
-- opera sobre inscripciones en `activo` (sync_protocol_schedule, 0026). Por eso el copy del front
-- lo dice explícitamente.
create or replace function public.reopen_enrollment(p_enrollment_id uuid)
returns void language plpgsql security definer set search_path = pg_catalog, public as $fn$
declare
  v_protocol uuid;
  v_status   public.enrollment_status;
  v_previo   public.enrollment_status;
begin
  if auth.uid() is null then
    raise exception 'No autenticado' using errcode = '42501';
  end if;

  select e.protocol_id, e.status, e.closed_from_status
    into v_protocol, v_status, v_previo
  from public.enrollments e where e.id = p_enrollment_id;
  if v_protocol is null then
    raise exception 'La inscripción no existe' using errcode = '23503';
  end if;

  if not (public.has_module('gerencia') or public.has_min_role('track', 'admin')
          or (public.has_min_role('track', 'operator') and public.is_assigned_coordinator(v_protocol))) then
    raise exception 'No tenés permiso para reabrir esta inscripción' using errcode = '42501';
  end if;

  if v_status not in ('completado', 'discontinuado') then
    raise exception 'Esa inscripción no está cerrada' using errcode = '23514';
  end if;

  update public.enrollments
     set status             = coalesce(v_previo, 'activo'),
         closed_at          = null,
         closed_reason      = null,
         closed_by          = null,
         closed_from_status = null
   where id = p_enrollment_id;
end
$fn$;

comment on function public.reopen_enrollment(uuid) is
  'Deshace el cierre de una inscripción y la devuelve al estado que tenía (closed_from_status, o activo si no hay sello). NO recupera las visitas borradas: eso lo hace sync_protocol_schedule. 0127.';

revoke all    on function public.reopen_enrollment(uuid) from public;
grant execute on function public.reopen_enrollment(uuid) to authenticated;
```

- [ ] **Step 2: Probarla contra Postgres de verdad, antes de pasársela al Director**

La regla de qué visitas se borran **no la puede cubrir un test de vitest**: vive en SQL. Y es
justamente de las que fallan en silencio — si el predicado queda al revés, borra visitas atendidas de
pacientes reales y no hay pantalla que lo muestre.

Se prueba con **PGlite** (Postgres real en WASM) en el directorio de scratchpad de la sesión, nunca
contra producción: se arma un esquema de juguete con `enrollments`, `patient_visits`,
`dispensation_requests` e `ip_units` (sólo las columnas y las FK que la función toca), se cargan cinco
visitas —una atendida, una futura sin atender, una con la ventana vencida, una futura con pedido de
farmacia y una suelta (`kind <> 'programada'`)— y se corre el cuerpo del `delete`.

Esperado: borra **una sola**, la futura sin atender y sin pedido. Las otras cuatro quedan.

- [ ] **Step 3: Anotar la migración en el índice**

Agregar la fila de la `0127` en `supabase/README.md`, con el formato que usan las anteriores y
**sin** marcarla como aplicada todavía (eso lo agrega el Director cuando confirme).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0127_cierre_de_inscripcion.sql supabase/README.md
git commit -m "feat(db): 0127 - cerrar la inscripcion de un paciente a un estudio (aditiva, va antes del front)"
```

- [ ] **Step 5: Pedirle al Director que la aplique**

Decirlo en el chat: es **aditiva y va PRIMERO**, antes de desplegar el front. Cuando confirme
«aplicada», anotarlo en `supabase/README.md` (**Aplicada en prod (fecha)**) — lo vigila
`scripts/check-migraciones.mjs`.

---

### Task 3: Las reglas puras (`src/lib/inscripcion.ts`)

Es el corazón de la tanda y es lo único que puede fallar **en silencio**: si «abierta» queda al revés,
la pantalla se ve perfecta y el número miente. Por eso va con tests y primero.

**Files:**
- Create: `src/lib/inscripcion.ts`
- Test: `src/lib/inscripcion.test.ts`

**Interfaces:**
- Consumes: `PatientRow`, `PatientEnrollment` de `src/data/patients.ts`.
- Produces:
  - `type EnrollmentStatus = 'screening' | 'activo' | 'completado' | 'discontinuado'`
  - `MOTIVOS_DE_CIERRE: readonly { value: string; label: string; estado: EnrollmentStatus }[]`
  - `estadoDelMotivo(motivo: string): EnrollmentStatus | null`
  - `estaAbierta(status: EnrollmentStatus | null | undefined): boolean`
  - `inscripcionDelEstudio(patient, protocolId): PatientEnrollment | null`
  - `personaActiva(patient: Pick<PatientRow, 'enrollments'>): boolean`
  - `ETIQUETA_ESTADO: Record<EnrollmentStatus, string>`

- [ ] **Step 1: Escribir el test que falla**

```ts
import { describe, expect, it } from 'vitest'
import type { PatientEnrollment, PatientRow } from '../data/patients'
import {
  estaAbierta, estadoDelMotivo, inscripcionDelEstudio, personaActiva, MOTIVOS_DE_CIERRE,
} from './inscripcion'

/**
 * Las reglas del estado por inscripción.
 *
 * POR QUÉ ESTAS Y NO OTRAS: son las que fallan EN SILENCIO. Un listado que muestra a alguien como
 * activo cuando cerró el estudio no se ve mal —se ve perfecto— y es dato de paciente en una app
 * auditable. El modal, el botón y el punto de color fallan de manera visible y se verifican mirando.
 *
 * El caso que trajo todo esto (prod, 2026-09-16): tres personas dadas de baja en ACT18301
 * aparecieron dadas de baja también en LTS17231, que es la extensión y tiene a las mismas personas.
 */

function insc(over: Partial<PatientEnrollment> & { protocolId?: string } = {}): PatientEnrollment {
  return {
    id: over.id ?? 'e1',
    enrollment_date: over.enrollment_date ?? '2026-01-10',
    randomization_date: over.randomization_date ?? null,
    ivrs_code: over.ivrs_code ?? null,
    status: over.status ?? 'activo',
    protocol: { id: over.protocolId ?? 'act', code: 'ACT18301', name: 'ACT' },
  }
}

function paciente(enrollments: PatientEnrollment[]): Pick<PatientRow, 'enrollments'> {
  return { enrollments }
}

describe('estaAbierta', () => {
  it('screening y activo están abiertas', () => {
    expect(estaAbierta('screening')).toBe(true)
    expect(estaAbierta('activo')).toBe(true)
  })

  it('completado y discontinuado están cerradas', () => {
    expect(estaAbierta('completado')).toBe(false)
    expect(estaAbierta('discontinuado')).toBe(false)
  })

  // Sin dato NO es «cerrada»: un null llega cuando una consulta vieja no trajo la columna, y
  // pintar de rojo a medio padrón por eso sería peor que no pintar nada.
  it('sin dato cuenta como abierta', () => {
    expect(estaAbierta(null)).toBe(true)
    expect(estaAbierta(undefined)).toBe(true)
  })
})

describe('inscripcionDelEstudio', () => {
  it('devuelve la del protocolo pedido, no la primera', () => {
    const p = paciente([insc({ id: 'e-act', protocolId: 'act' }), insc({ id: 'e-lts', protocolId: 'lts' })])
    expect(inscripcionDelEstudio(p, 'lts')?.id).toBe('e-lts')
  })

  it('devuelve null si no está inscripto a ese protocolo', () => {
    expect(inscripcionDelEstudio(paciente([insc({ protocolId: 'act' })]), 'lts')).toBeNull()
  })
})

describe('personaActiva', () => {
  // EL CASO DEL BUG: cerrada en ACT, abierta en LTS. La persona sigue en seguimiento.
  it('con una inscripción cerrada y otra abierta, la persona está activa', () => {
    const p = paciente([
      insc({ id: 'e-act', protocolId: 'act', status: 'completado' }),
      insc({ id: 'e-lts', protocolId: 'lts', status: 'activo' }),
    ])
    expect(personaActiva(p)).toBe(true)
  })

  it('con todas cerradas, la persona ya no está activa', () => {
    const p = paciente([
      insc({ id: 'e-act', protocolId: 'act', status: 'completado' }),
      insc({ id: 'e-lts', protocolId: 'lts', status: 'discontinuado' }),
    ])
    expect(personaActiva(p)).toBe(false)
  })

  // El paciente recién dado de alta, antes de inscribirlo: la regla literal lo dejaría inactivo
  // apenas se crea, que es exactamente al revés de la verdad.
  it('sin ninguna inscripción, la persona está activa', () => {
    expect(personaActiva(paciente([]))).toBe(true)
  })
})

describe('estadoDelMotivo', () => {
  it('completar y pasar a la extensión son cierres BUENOS', () => {
    expect(estadoDelMotivo('completo')).toBe('completado')
    expect(estadoDelMotivo('extension')).toBe('completado')
  })

  it('el resto de los motivos discontinúan', () => {
    for (const m of ['consentimiento', 'exclusion', 'evento_adverso', 'perdida_seguimiento', 'investigador']) {
      expect(estadoDelMotivo(m)).toBe('discontinuado')
    }
  })

  it('un motivo desconocido no inventa un estado', () => {
    expect(estadoDelMotivo('cualquier_cosa')).toBeNull()
  })

  // Espejo del `case` de la 0127: si acá se agrega un motivo y allá no, la RPC levanta 23514.
  // Este test no lo puede evitar, pero deja anotado el contrato de los siete valores.
  it('el desplegable ofrece exactamente los siete motivos que conoce la base', () => {
    expect(MOTIVOS_DE_CIERRE.map((m) => m.value)).toEqual([
      'completo', 'extension', 'consentimiento', 'exclusion',
      'evento_adverso', 'perdida_seguimiento', 'investigador',
    ])
  })
})
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npx vitest run src/lib/inscripcion.test.ts`
Expected: FAIL — `Failed to resolve import "./inscripcion"`.

- [ ] **Step 3: Escribir la implementación mínima**

```ts
import type { PatientEnrollment, PatientRow } from '../data/patients'

/**
 * El estado de una INSCRIPCIÓN (`enrollments.status`, enum de 0001), que es el que manda dentro de
 * un estudio.
 *
 * Ojo con el otro «activo»: `patients.status` es de la PERSONA y quedó LEGACY con la 0127. Los dos
 * se llamaban igual en pantalla y por eso dar de baja en ACT18301 daba de baja también en LTS17231,
 * que es su extensión y tiene a las mismas personas inscriptas (prod, 2026-09-16).
 */
export type EnrollmentStatus = 'screening' | 'activo' | 'completado' | 'discontinuado'

/** Cómo se dice cada estado en pantalla (va al `title` del punto). */
export const ETIQUETA_ESTADO: Record<EnrollmentStatus, string> = {
  screening: 'En screening',
  activo: 'Activo en el estudio',
  completado: 'Completó el estudio',
  discontinuado: 'Discontinuado',
}

/**
 * Motivos de cierre. Quien opera elige un HECHO CLÍNICO y la app deriva el valor técnico: «pasó a la
 * extensión» y «retiró el consentimiento» son las dos un cierre, pero una es buena y la otra no, y
 * pedirle a una coordinadora que elija entre `completado` y `discontinuado` es pedirle que traduzca.
 *
 * ESPEJO DEL `case` DE LA 0127: los siete `value` tienen que existir en la función `close_enrollment`
 * y en su check constraint. Si se desincronizan, la RPC levanta 23514 y el front muestra el mensaje:
 * la duplicación es inevitable (una vive en la base y la otra en el desplegable) pero falla RUIDOSA.
 */
export const MOTIVOS_DE_CIERRE: readonly { value: string; label: string; estado: EnrollmentStatus }[] = [
  { value: 'completo', label: 'Completó el estudio', estado: 'completado' },
  { value: 'extension', label: 'Pasó a la extensión', estado: 'completado' },
  { value: 'consentimiento', label: 'Retiró el consentimiento', estado: 'discontinuado' },
  { value: 'exclusion', label: 'Criterio de exclusión', estado: 'discontinuado' },
  { value: 'evento_adverso', label: 'Evento adverso', estado: 'discontinuado' },
  { value: 'perdida_seguimiento', label: 'Pérdida de seguimiento', estado: 'discontinuado' },
  { value: 'investigador', label: 'Decisión del investigador', estado: 'discontinuado' },
]

/** El estado que deja un motivo, o null si el motivo no es de los siete. */
export function estadoDelMotivo(motivo: string): EnrollmentStatus | null {
  return MOTIVOS_DE_CIERRE.find((m) => m.value === motivo)?.estado ?? null
}

/**
 * ¿La inscripción sigue en curso? Screening y activo sí; completado y discontinuado no.
 *
 * Sin dato cuenta como ABIERTA a propósito: un `null` llega cuando una consulta no trajo la columna,
 * y pintar de cerrado a medio padrón por una consulta incompleta es peor que no pintar nada.
 */
export function estaAbierta(status: EnrollmentStatus | null | undefined): boolean {
  return status !== 'completado' && status !== 'discontinuado'
}

/**
 * La inscripción que corresponde cuando se está parado en UN estudio. Mismo criterio que
 * `ivrsDelEstudio`: la misma persona en dos estudios tiene DOS inscripciones y cada una lleva su
 * propio estado.
 */
export function inscripcionDelEstudio(
  patient: Pick<PatientRow, 'enrollments'>,
  protocolId: string,
): PatientEnrollment | null {
  return patient.enrollments.find((e) => e.protocol?.id === protocolId) ?? null
}

/**
 * ¿La persona sigue en seguimiento en el centro? Reemplaza a `patients.status`, que era una sola
 * columna para todos los estudios.
 *
 * SIN NINGUNA INSCRIPCIÓN cuenta como activa: es el paciente recién dado de alta, antes de
 * inscribirlo a un estudio. La regla literal («alguna abierta») lo dejaría inactivo apenas se crea.
 */
export function personaActiva(patient: Pick<PatientRow, 'enrollments'>): boolean {
  if (patient.enrollments.length === 0) return true
  return patient.enrollments.some((e) => estaAbierta(e.status))
}
```

- [ ] **Step 4: Sumar `status` a `PatientEnrollment`**

En `src/data/patients.ts`, dentro de `interface PatientEnrollment`, agregar:

```ts
  /**
   * Estado de ESTA inscripción (`enrollments.status`, 0001). Es el estado que manda dentro del
   * estudio desde la 0127 — `patients.status` quedó legacy. Nullable en el tipo por defensa: si
   * alguna consulta vieja no lo pide, `estaAbierta` lo trata como abierto en vez de pintar de
   * cerrado a quien no lo está.
   */
  status: EnrollmentStatus | null
```

y el import al inicio del archivo:

```ts
import type { EnrollmentStatus } from '../lib/inscripcion'
```

⚠️ **Tiene que ser `import type`, no un import común.** `lib/inscripcion.ts` importa tipos de
`data/patients.ts` y ahora `data/patients.ts` importa un tipo de `lib/inscripcion.ts`: es un ciclo.
Con `import type` en los dos lados TypeScript los borra al compilar y no queda ciclo en runtime; si
alguien convierte éste en un import de valor (para traerse `MOTIVOS_DE_CIERRE`, por ejemplo), el
ciclo se vuelve real y revienta con un `undefined` en la carga del módulo, lejos de acá. Lo que
`data/` necesite de valores, que lo reciba por parámetro.

- [ ] **Step 5: Correr los tests y verificar que pasan**

Run: `npx vitest run src/lib/inscripcion.test.ts`
Expected: PASS — 11 tests.

- [ ] **Step 6: Commit**

```bash
git add src/lib/inscripcion.ts src/lib/inscripcion.test.ts src/data/patients.ts
git commit -m "feat(pacientes): las reglas del estado por inscripcion, con tests"
```

---

### Task 4: Capa de datos (`src/data/enrollments.ts`)

**Files:**
- Create: `src/data/enrollments.ts`
- Modify: `src/data/patients.ts` (el embed de `usePatients`)

**Interfaces:**
- Consumes: `estadoDelMotivo` de `src/lib/inscripcion.ts`.
- Produces:
  - `closeEnrollment(enrollmentId: string, motivo: string): Promise<{ borradas: number; conservadas: number } | { error: string }>`
  - `reopenEnrollment(enrollmentId: string): Promise<{ error: string | null }>`
  - `useVisitasFuturas(enrollmentId: string | null): QueryResult<number>`

- [ ] **Step 1: Sumar `status` al embed de pacientes**

En `src/data/patients.ts`, dentro de `usePatients`, cambiar el `select`:

```ts
        .select('id, code, full_name, status, birth_date, sex, fertility, treating_physician, enrollments(id, enrollment_date, randomization_date, ivrs_code, status, protocol:protocols(id, code, name))')
```

(Se suma `status` **dentro** del embed `enrollments(...)`. El `status` de afuera es el de la persona
y se deja: sale de la misma fila y sacarlo no ahorra nada, pero ya nadie lo lee.)

- [ ] **Step 2: Escribir la capa de datos**

```ts
import { useSupabaseQuery } from '../lib/useSupabaseQuery'
import type { QueryResult } from '../lib/useSupabaseQuery'
import { supabase } from '../lib/supabase'
import { todayISO } from '../lib/dates'

/**
 * Cierre y reapertura de una INSCRIPCIÓN (migración 0127).
 *
 * Las dos mutaciones van por RPC `SECURITY DEFINER` y no por un `update` directo, por dos razones:
 * la authz se valida server-side (gerencia / track-admin / operator asignado) y el cierre tiene que
 * ser ATÓMICO con el borrado de las visitas futuras — media cosa hecha deja una inscripción cerrada
 * con visitas fantasma en la agenda.
 *
 * Sigue el patrón de `data/patients.ts`: lecturas como hooks `useXxx`, mutaciones como funciones
 * async, y los códigos de Postgres traducidos a castellano.
 */

/** Traduce los códigos de Postgres a mensajes serenos (patrón `*ErrorMessage` del repo). */
function cierreErrorMessage(code: string | undefined, raw?: string): string {
  if (code === '42501') return 'No tenés permiso para cerrar o reabrir esta inscripción.'
  // 23514: lo levanta la RPC con su propio texto — «ya está cerrada», «no está cerrada»,
  // «motivo desconocido». El último sólo aparece si el desplegable y la 0127 se desincronizaron.
  if (code === '23514') return raw || 'Esa inscripción no está en un estado que permita la acción.'
  if (code === '23503') return 'Esa inscripción ya no existe. Actualizá la página.'
  // 42883 = falta aplicar la 0127 (la función no existe en el schema cache).
  if (code === '42883') return 'Falta aplicar una actualización de la base para poder cerrar inscripciones.'
  return raw || 'No pudimos completar la acción. Probá de nuevo.'
}

/** Lo que devuelve la RPC: qué pasó con las visitas futuras. */
export interface CierreResultado {
  /** Visitas futuras sin atender que se borraron. */
  borradas: number
  /** Las que se conservaron por tener un pedido de farmacia o una unidad de IP colgando. */
  conservadas: number
}

/**
 * Cierra la inscripción con un motivo del vocabulario de `MOTIVOS_DE_CIERRE`. El motivo determina
 * el estado (`completado` o `discontinuado`): eso lo decide la base, no el front.
 */
export async function closeEnrollment(
  enrollmentId: string,
  motivo: string,
): Promise<CierreResultado | { error: string }> {
  const { data, error } = await supabase.rpc('close_enrollment', {
    p_enrollment_id: enrollmentId,
    p_reason: motivo,
  })
  if (error) return { error: cierreErrorMessage(error.code, error.message) }
  const d = (data ?? {}) as { borradas?: number; conservadas?: number }
  return { borradas: d.borradas ?? 0, conservadas: d.conservadas ?? 0 }
}

/**
 * Deshace el cierre y devuelve la inscripción al estado que tenía. NO recupera las visitas
 * borradas: eso lo hace el botón de sincronizar del cronograma, que opera sobre inscripciones en
 * `activo` (`sync_protocol_schedule`, 0026). El copy del modal lo dice.
 */
export async function reopenEnrollment(enrollmentId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('reopen_enrollment', { p_enrollment_id: enrollmentId })
  if (error) return { error: cierreErrorMessage(error.code, error.message) }
  return { error: null }
}

/**
 * Cuántas visitas futuras sin atender tiene la inscripción. Es el número que el modal pone en la
 * confirmación ANTES de cerrar: «se van a borrar N».
 *
 * El criterio es el MISMO que el de la 0127 —sin atender y con la ventana todavía abierta— pero el
 * conteo se hace acá con la RLS del usuario, que es la que ya filtra sus visitas. No pretende ser
 * exacto al voto con lo que la RPC va a borrar: las que tienen un pedido de farmacia se conservan y
 * el resultado real vuelve en `CierreResultado`, que es lo que se le muestra después.
 */
export function useVisitasFuturas(enrollmentId: string | null): QueryResult<number> {
  return useSupabaseQuery<number>(
    async (c) => {
      if (!enrollmentId) return { data: 0, error: null }
      const { count, error } = await c
        .from('patient_visits')
        .select('id', { count: 'exact', head: true })
        .eq('enrollment_id', enrollmentId)
        .is('real_date', null)
        .gte('window_end', todayISO())
      if (error) return { data: null, error }
      return { data: count ?? 0, error: null }
    },
    [enrollmentId],
  )
}
```

- [ ] **Step 3: Verificar que compila**

Run: `npm run typecheck`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add src/data/enrollments.ts src/data/patients.ts
git commit -m "feat(datos): cerrar y reabrir una inscripcion, y el conteo de visitas futuras"
```

---

### Task 5: `EstadoPaciente` habla de la inscripción

**Files:**
- Modify: `src/components/EstadoPaciente.tsx`

**Interfaces:**
- Consumes: `EnrollmentStatus`, `ETIQUETA_ESTADO`, `estaAbierta` de `src/lib/inscripcion.ts`.
- Produces: `<EstadoPaciente estado={EnrollmentStatus | null} forma? style? />` — misma forma de
  uso que antes, distinto tipo del prop.

- [ ] **Step 1: Cambiar el tipo y el mapeo**

Reemplazar el bloque de constantes y la firma. El componente sigue **binario** (decisión del
Director, 2026-09-16: no sumar un tercer color a la lista), pero la palabra del `title` ahora dice
cuál de los cuatro estados es.

```ts
import type { CSSProperties } from 'react'
import type { EnrollmentStatus } from '../lib/inscripcion'
import { estaAbierta, ETIQUETA_ESTADO } from '../lib/inscripcion'
```

```ts
/* Binario a propósito: verde = la inscripción sigue en curso, rojo = está cerrada. Se evaluó un
   tercer color para distinguir «completó» de «se discontinuó» y el Director prefirió no sumar un
   color a una lista donde el color ya significa otras cosas (2026-09-16). La diferencia igual se
   dice, en palabras, en el `title` y en el `aria-label`. */
const VERDE = 'var(--spira-good)'
const ROJO = 'var(--spira-acc-deep-danger)'

/** La palabra exacta. Sin dato → se asume abierta (ver `estaAbierta`). */
function etiqueta(estado: EnrollmentStatus | null): string {
  return estado ? ETIQUETA_ESTADO[estado] : 'Activo en el estudio'
}
```

Y la firma del componente pasa a:

```ts
export function EstadoPaciente({ estado, forma = 'punto', style }: {
  /** Estado de la inscripción AL ESTUDIO EN CONTEXTO, no de la persona. `null` = sin dato. */
  estado: EnrollmentStatus | null
  forma?: 'punto' | 'etiqueta'
  style?: CSSProperties
}) {
```

Dentro, `COLOR[estado]` pasa a `estaAbierta(estado) ? VERDE : ROJO`, `ETIQUETA[estado]` a
`etiqueta(estado)` y `EXPLICACION[estado]` también a `etiqueta(estado)`. El `Punto` recibe el color
ya resuelto:

```ts
function Punto({ color }: { color: string }) {
  return <span aria-hidden="true" style={{ display: 'block', width: 8, height: 8, borderRadius: '50%', background: color, flex: '0 0 auto' }} />
}
```

- [ ] **Step 2: Actualizar el comentario de cabecera**

El bloque de comentarios del archivo describe el estado como «del PACIENTE (activo / inactivo)».
Reemplazar ese primer párrafo por uno que diga que es el de la **inscripción al estudio en contexto**
y por qué cambió (el caso de ACT/LTS del 2026-09-16). **Conservar** toda la sección «HISTORIA» y la
de «LOS TOKENS»: siguen siendo verdad y explican por qué el punto va arriba a la derecha.

- [ ] **Step 3: Verificar que el typecheck marca TODOS los call-sites**

Run: `npm run typecheck`
Expected: FALLA en `PdPatientRow.tsx` y `PatientFichaView.tsx` (le pasan `patient.status`, que es
`PatientStatus`). Es la red de seguridad: los dos se arreglan en la Task 6.

---

### Task 6: El listado y la ficha leen la inscripción del estudio

**Files:**
- Modify: `src/views/track/PdPatientRow.tsx:98`
- Modify: `src/views/ProtocolDetailView.tsx:125`
- Modify: `src/views/PatientFichaView.tsx:236`

**Interfaces:**
- Consumes: `inscripcionDelEstudio`, `estaAbierta` de `src/lib/inscripcion.ts`.

- [ ] **Step 1: `PdPatientRow` — el punto es el de la fila**

El componente ya recibe `protocolId` y ya lo usa para el IVRS (`ivrsDelEstudio`). Mismo criterio:

```ts
import { inscripcionDelEstudio } from '../../lib/inscripcion'
```

Junto a la línea del `ivrs`, agregar:

```ts
  /* El estado que se muestra es el de ESTA inscripción, no el de la persona: la misma persona en
     dos estudios puede estar cerrada en uno y activa en el otro. Es exactamente el bug del
     2026-09-16 (baja en ACT18301 → se veía de baja en LTS17231). Sin `protocolId` —ninguna pantalla
     hoy— no hay estudio en contexto y no se pinta nada. */
  const estadoInscripcion = protocolId ? (inscripcionDelEstudio(patient, protocolId)?.status ?? null) : null
```

y la línea 98 pasa a:

```tsx
      <EstadoPaciente estado={estadoInscripcion} style={{ position: 'absolute', top: 4, right: 4 }} />
```

- [ ] **Step 2: `ProtocolDetailView` — el filtro y el KPI**

Reemplazar la línea 125 y su comentario:

```ts
  /* UNA sola definición de "activo" para el KPI y para el filtro, y desde la 0127 es la del
     ESTUDIO: la inscripción a ESTE protocolo. Antes era `patients.status`, que es de la persona —
     una sola columna para todos los estudios— y por eso cerrar a alguien en ACT18301 lo mostraba
     cerrado en LTS17231, que es su extensión (prod, 2026-09-16). `screening` cuenta como activo:
     contarlo aparte dejaría fuera de "Activos" a quien está entrando al estudio. */
  const activos = patients.filter((p) => estaAbierta(inscripcionDelEstudio(p, protocol.id)?.status ?? null))
```

con el import correspondiente:

```ts
import { estaAbierta, inscripcionDelEstudio } from '../lib/inscripcion'
```

- [ ] **Step 3: `PatientFichaView` — el punto de la ficha**

La ficha ya resuelve `const enrollment = patient.enrollments.find((e) => e.protocol?.id === protocol.id)`
en la línea 79. La línea 236 pasa a:

```tsx
              <EstadoPaciente estado={enrollment?.status ?? null} style={{ height: 23, marginRight: -4 }} />
```

Y el comentario de arriba, que dice «El estado es del PACIENTE (activo/inactivo)», pasa a decir que
es el de la inscripción a este estudio. **Conservar** el resto del comentario (la geometría del punto
y por qué va arriba a la derecha): sigue siendo verdad.

- [ ] **Step 4: Verificar**

Run: `npm run typecheck`
Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add src/components/EstadoPaciente.tsx src/views/track/PdPatientRow.tsx src/views/ProtocolDetailView.tsx src/views/PatientFichaView.tsx
git commit -m "fix(pacientes): el estado que se muestra es el de la inscripcion al estudio en contexto"
```

---

### Task 7: Los KPI globales cuentan personas con inscripción abierta

**Files:**
- Modify: `src/views/InicioResumenView.tsx:85`
- Modify: `src/views/TrackResumenView.tsx:535`

**Interfaces:**
- Consumes: `personaActiva` de `src/lib/inscripcion.ts`.

- [ ] **Step 1: Inicio**

```ts
import { personaActiva } from '../lib/inscripcion'
```

```ts
  /* «Pacientes en seguimiento»: personas con al menos una inscripción abierta. Antes era
     `patients.status`, que quedó legacy con la 0127 — ver `personaActiva`, que además cuenta como
     activa a la persona recién dada de alta y todavía sin inscribir. */
  const pacientesActivos = (patients.data ?? []).filter(personaActiva).length
```

- [ ] **Step 2: Resumen de Coordinación**

Mismo import y mismo reemplazo en la línea 535:

```ts
  const activePatients = allPatients.filter(personaActiva).length
```

- [ ] **Step 3: Verificar**

Run: `npm run typecheck`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add src/views/InicioResumenView.tsx src/views/TrackResumenView.tsx
git commit -m "fix(resumen): los pacientes activos se cuentan por inscripcion abierta"
```

---

### Task 8: Se va el campo «Estado» de «Editar paciente»

Es la puerta que causó el problema. Mientras exista, alguien la va a volver a usar.

**Files:**
- Modify: `src/views/EditPatientForm.tsx`
- Modify: `src/data/patients.ts` (`EditPatientInput`)

- [ ] **Step 1: Sacar el campo del formulario**

En `src/views/EditPatientForm.tsx`, borrar el `<FormField label="Estado">` entero (el bloque del
`SearchableSelect` con `activo`/`inactivo`), el `useState` de `status` y el `status` del objeto que se
manda a `updatePatient`. Sacar también el import de `PatientStatus` si queda sin uso.

En su lugar, donde estaba el campo, va una línea explicativa — el hueco sin explicación es peor que
el campo:

```tsx
          <FormField label="Estado en el estudio">
            <div style={{ fontSize: 12.5, color: 'var(--spira-muted)', lineHeight: 1.45, paddingTop: 6 }}>
              El estado es de cada estudio y se cambia desde la ficha del paciente, con «Cerrar
              participación». Una persona puede haber terminado un estudio y seguir activa en otro.
            </div>
          </FormField>
```

- [ ] **Step 2: Sacar `status` de `EditPatientInput`**

En `src/data/patients.ts`, borrar la línea `status: PatientStatus` de `EditPatientInput`. El tipo
`PatientStatus` queda exportado (lo usa la fila `PatientRow`, que sigue trayendo la columna) pero ya
no se escribe desde ningún lado.

- [ ] **Step 3: Verificar**

Run: `npm run typecheck`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add src/views/EditPatientForm.tsx src/data/patients.ts
git commit -m "fix(pacientes): editar paciente ya no cambia el estado global de la persona"
```

---

### Task 9: El modal «Cerrar participación»

**Files:**
- Create: `src/views/track/CerrarInscripcionModal.tsx`
- Modify: `src/views/PatientFichaView.tsx` (el bloque «Protocolo» de la ficha lateral)

**Interfaces:**
- Consumes: `closeEnrollment`, `reopenEnrollment`, `useVisitasFuturas` de `src/data/enrollments.ts`;
  `MOTIVOS_DE_CIERRE`, `estaAbierta`, `ETIQUETA_ESTADO` de `src/lib/inscripcion.ts`.
- Produces: `<CerrarInscripcionModal enrollmentId estado protocolCode pacienteNombre accentSolid onClose onDone />`

- [ ] **Step 1: Escribir el modal**

```tsx
import { useState } from 'react'
import { Modal } from '../../components/Modal'
import { FormField } from '../../components/FormField'
import { SearchableSelect } from '../../components/SearchableSelect'
import { btnOutline, btnPrimary } from '../../components/buttons'
import { closeEnrollment, reopenEnrollment, useVisitasFuturas } from '../../data/enrollments'
import { estaAbierta, ETIQUETA_ESTADO, MOTIVOS_DE_CIERRE } from '../../lib/inscripcion'
import type { EnrollmentStatus } from '../../lib/inscripcion'

/**
 * Cierra —o reabre— la participación de un paciente en UN estudio (migración 0127).
 *
 * Es la puerta que faltaba. Hasta el 2026-09-16 lo único parecido era «Editar paciente › Estado ›
 * Inactivo», que marca a la PERSONA y por eso daba de baja en todos los estudios a la vez.
 *
 * Se elige un MOTIVO, no un estado: la persona que opera sabe si el paciente terminó el estudio o si
 * lo abandonó, no si eso se llama `completado` o `discontinuado`. El mapeo lo hace la base.
 *
 * La confirmación dice el número REAL de visitas que se van a borrar, contado antes de apretar. Sin
 * ese número la frase sería «se van a borrar las visitas futuras», que no deja decidir nada.
 */
export function CerrarInscripcionModal({
  enrollmentId, estado, protocolCode, pacienteNombre, accentSolid, onClose, onDone,
}: {
  enrollmentId: string
  estado: EnrollmentStatus | null
  protocolCode: string
  pacienteNombre: string
  accentSolid: string
  onClose: () => void
  /** Refrescar la ficha: cambió el estado y puede haber cambiado el cronograma. */
  onDone: () => void
}) {
  const [motivo, setMotivo] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const futuras = useVisitasFuturas(enrollmentId)
  const abierta = estaAbierta(estado)

  const cerrar = async () => {
    if (!motivo) return
    setBusy(true)
    setError(null)
    const res = await closeEnrollment(enrollmentId, motivo)
    setBusy(false)
    if ('error' in res) { setError(res.error); return }
    onDone()
    onClose()
  }

  const reabrir = async () => {
    setBusy(true)
    setError(null)
    const res = await reopenEnrollment(enrollmentId)
    setBusy(false)
    if (res.error) { setError(res.error); return }
    onDone()
    onClose()
  }

  const n = futuras.data ?? 0

  return (
    // Mientras la RPC está en vuelo se ignora el cierre del modal: si se desmonta a mitad, el
    // mensaje de error se pierde justo en una acción que toca el cronograma.
    <Modal
      title={abierta ? `Cerrar participación en ${protocolCode}` : `Reabrir participación en ${protocolCode}`}
      onClose={busy ? () => undefined : onClose}
      maxWidth={460}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {abierta ? (
          <>
            <div style={{ fontSize: 13.5, lineHeight: 1.5 }}>
              {pacienteNombre} deja de participar en <strong>{protocolCode}</strong>. Sus otros
              estudios no cambian.
            </div>

            <FormField label="Motivo">
              <SearchableSelect
                value={motivo}
                onChange={setMotivo}
                options={MOTIVOS_DE_CIERRE.map((m) => ({ value: m.value, label: m.label }))}
                placeholder="Elegí el motivo…"
                entity="motivo"
              />
            </FormField>

            {/* El número va SIEMPRE, incluso en cero: «no hay visitas futuras que borrar» también es
                información, y el silencio se lee como que el modal no terminó de cargar. */}
            <div style={{ fontSize: 12.5, lineHeight: 1.5, color: 'var(--spira-muted)', background: 'var(--spira-surface)', borderRadius: 9, padding: '9px 12px' }}>
              {futuras.loading
                ? 'Contando las visitas que le quedan…'
                : n === 0
                  ? 'No le quedan visitas futuras sin atender.'
                  : `Se van a borrar ${n} ${n === 1 ? 'visita futura' : 'visitas futuras'} sin atender. Lo ya atendido no se toca.`}
              {' '}Si reabrís la participación, las visitas se recuperan con el botón de sincronizar
              del cronograma.
            </div>

            <Pie
              busy={busy} disabled={!motivo} accentSolid={accentSolid}
              ok="Cerrar participación" onClose={onClose} onOk={() => void cerrar()}
            />
          </>
        ) : (
          <>
            <div style={{ fontSize: 13.5, lineHeight: 1.5 }}>
              La participación de {pacienteNombre} en <strong>{protocolCode}</strong> está cerrada
              ({estado ? ETIQUETA_ESTADO[estado].toLowerCase() : 'cerrada'}). Reabrirla la devuelve al
              estado que tenía antes.
            </div>
            <div style={{ fontSize: 12.5, lineHeight: 1.5, color: 'var(--spira-muted)', background: 'var(--spira-surface)', borderRadius: 9, padding: '9px 12px' }}>
              Las visitas que se borraron al cerrar no vuelven solas: se regeneran con el botón de
              sincronizar del cronograma del protocolo.
            </div>
            <Pie
              busy={busy} disabled={false} accentSolid={accentSolid}
              ok="Reabrir participación" onClose={onClose} onOk={() => void reabrir()}
            />
          </>
        )}
        {error && <div style={{ fontSize: 13, color: 'var(--spira-acc-deep-danger)' }}>{error}</div>}
      </div>
    </Modal>
  )
}

/** Pie con Cancelar + acción primaria. Mismo vocabulario que el `Footer` de `ReadyOutcomeModal`. */
function Pie({ busy, disabled, accentSolid, ok, onClose, onOk }: {
  busy: boolean; disabled: boolean; accentSolid: string; ok: string
  onClose: () => void; onOk: () => void
}) {
  const blocked = busy || disabled
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 2 }}>
      <button type="button" onClick={onClose} style={btnOutline}>Cancelar</button>
      <button
        type="button" disabled={blocked} onClick={onOk}
        style={{ ...btnPrimary(accentSolid), opacity: blocked ? 0.6 : 1, cursor: blocked ? 'default' : 'pointer' }}
      >
        {busy ? 'Guardando…' : ok}
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Colgarlo de la ficha**

En `src/views/PatientFichaView.tsx`, esta vista maneja sus modales con **una sola** variable de
estado (línea 66). Sumar `'cerrar'` a esa unión en vez de agregar un `useState` aparte:

```tsx
  const [modal, setModal] = useState<null | 'reschedule' | 'register' | 'edit' | 'alerts' | 'cerrar'>(null)
```

Al final del bloque «Protocolo» de la ficha lateral (el que muestra Protocolo / Sponsor /
Investigador / Especialidad, línea 253 y siguientes), el botón. Sólo con inscripción y con permiso de
escritura (`canWrite`, que la vista ya recibe por props):

```tsx
            {enrollment && canWrite && (
              <button
                type="button"
                onClick={() => setModal('cerrar')}
                style={{ ...btnOutline, marginTop: 12, width: '100%' }}
              >
                {estaAbierta(enrollment.status) ? 'Cerrar participación' : 'Reabrir participación'}
              </button>
            )}
```

Y el montaje del modal, junto a los otros (líneas 154-175), con los nombres reales del archivo:

```tsx
      {modal === 'cerrar' && enrollment && (
        <CerrarInscripcionModal
          enrollmentId={enrollment.id}
          estado={enrollment.status}
          protocolCode={protocol.code}
          pacienteNombre={patient.full_name}
          accentSolid={accentSolid}
          onClose={() => setModal(null)}
          /* `onPatientUpdated` es el que importa: el estado que acaba de cambiar viaja en el
             paciente (su embed de inscripciones), no en las visitas. Los otros dos refetch son
             porque cerrar BORRA visitas futuras, y el cronograma y las alertas de la ficha las
             están mostrando. */
          onDone={() => { setModal(null); onPatientUpdated(); visitsQ.refetch(); alertsQ.refetch() }}
        />
      )}
```

El import de `estaAbierta` ya entra en la Task 6 si se usó ahí; si no, agregarlo.

- [ ] **Step 3: Verificar que compila y que la suite sigue verde**

Run: `npm run build`
Expected: typecheck + tests + build, todo verde.

- [ ] **Step 4: Commit**

```bash
git add src/views/track/CerrarInscripcionModal.tsx src/views/PatientFichaView.tsx
git commit -m "feat(pacientes): cerrar y reabrir la participacion en un estudio desde la ficha"
```

---

### Task 10: El copy del desenlace de la visita deja de mentir

`ReadyOutcomeModal` dice «Marcar fallo de screening (inactivar paciente)». No inactiva al paciente:
inactiva **la inscripción**. Es la misma confusión que estamos arreglando, escrita en un botón.

**Files:**
- Modify: `src/views/track/ReadyOutcomeModal.tsx`

- [ ] **Step 1: Cambiar el rótulo y el comentario**

El texto del botón pasa a `Marcar fallo de screening (cerrar la participación)`, y el comentario del
prop `onDiscontinue` pasa a:

```ts
  /** "Fallo de screening": cierra la inscripción a ESTE estudio (discontinue_enrollment). Los otros
   *  estudios del paciente no se tocan. */
```

- [ ] **Step 2: Verificar**

Run: `npm run build`
Expected: verde.

- [ ] **Step 3: Commit**

```bash
git add src/views/track/ReadyOutcomeModal.tsx
git commit -m "fix(copy): el fallo de screening cierra la inscripcion, no inactiva a la persona"
```

---

## Cierre de la tanda

- [ ] **`npm run build` verde** (el gate; ojo que con otra sesión en `.claude/worktrees/` el conteo
  de tests puede venir duplicado — no es un cambio tuyo).
- [ ] **Verificación en el navegador**, con la 0127 ya aplicada: abrir la ficha de uno de los tres
  pacientes en **ACT18301** (tiene que decir «Completó el estudio» en el `title` del punto, y el
  botón tiene que ofrecer «Reabrir participación») y la misma persona en **LTS17231** (punto verde,
  botón «Cerrar participación»). Ese lado a lado ES la verificación del bug.
- [ ] **PR** con el resumen de las diez tareas. CI corre `npm run build`.
- [ ] Recordar que el orden es **0127 aplicada → deploy del front**. Cuando el Director confirme la
  aplicación, anotarla en `supabase/README.md`.
