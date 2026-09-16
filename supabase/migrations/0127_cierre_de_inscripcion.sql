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
--   · close_enrollment  — cierra con motivo y borra las visitas futuras sin atender.
--   · reopen_enrollment — deshace el cierre y devuelve la inscripción al estado que tenía.
--
-- ORDEN DE DESPLIEGUE: ADITIVA, VA PRIMERO (antes del front). Columnas y funciones nuevas que ningún
-- front desplegado consulta; el que no funciona sin esto es el front nuevo.
--
-- APLICAR: a mano en el SQL Editor de Supabase (rol postgres), DESPUÉS de la 0126. IDEMPOTENTE.
-- ============================================================================


-- 1 · El sello del cierre -------------------------------------------------------------------
-- Columnas propias y no una línea en `notes` (que es lo que hace hoy discontinue_enrollment): esto
-- es traza regulatoria y se consulta, no se lee a ojo.
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
-- `window_end` es NOT NULL desde la 0002, así que alcanza con compararlo: no hace falta caer a
-- `estimated_date`.
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
  -- src/lib/inscripcion.ts: si se desincronizan, esta rama levanta 23514 y el front muestra el
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
    and pv.kind = 'programada'
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
-- de la 0127 (y las que cierre discontinue_enrollment, que no sella): ésas no saben de dónde venían
-- y 'activo' es el único supuesto razonable.
--
-- Las visitas borradas NO vuelven acá: las regenera el botón de sincronizar del cronograma, que
-- opera sobre inscripciones en `activo` (sync_protocol_schedule, 0026). Por eso el copy del front lo
-- dice explícitamente.
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
