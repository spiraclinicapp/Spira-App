-- Spira · Script de preparación (Etapa 0 del traspaso de Track) — 2026-06-12
-- ----------------------------------------------------------------------------
-- Correr COMPLETO en el SQL Editor del dashboard de Supabase (como postgres).
-- Es idempotente: se puede correr más de una vez sin romper nada.
--
-- Hace 4 cosas:
--   1. Aplica la migración 0012 (RPC de alta atómica paciente+enrolamiento).
--   2. Asigna la cuenta demo como coordinadora de TODOS los protocolos
--      (la RPC exige is_assigned_coordinator, sin bypass de gerencia).
--   3. Si los protocolos demo no tienen esquema de visitas, lo crea y
--      retro-genera las visitas de los enrolamientos existentes (el trigger
--      solo corre en el INSERT del enrolamiento, no retro-genera).
--   4. Si no existe la plantilla global de checklist, la crea con ítems demo.
-- ============================================================================


-- ── 1 · Migración 0012 (idéntica a supabase/migrations/0012_...sql) ─────────

create or replace function public.create_patient_with_enrollment(
  p_code               text,
  p_full_name          text,
  p_protocol_id        uuid,
  p_enrollment_date    date,
  p_birth_date         date default null,
  p_treating_physician text default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_uid     uuid := auth.uid();
  v_patient uuid;
begin
  if v_uid is null then
    raise exception 'No autenticado' using errcode = '42501';
  end if;
  if p_protocol_id is null then
    raise exception 'Falta el protocolo' using errcode = '23502';
  end if;
  if not public.has_min_role('track', 'operator') then
    raise exception 'Requiere nivel operator en Track' using errcode = '42501';
  end if;
  if not public.is_assigned_coordinator(p_protocol_id) then
    raise exception 'No coordinás este protocolo' using errcode = '42501';
  end if;

  if p_code is null or btrim(p_code) = '' then
    raise exception 'El código es obligatorio' using errcode = '23502';
  end if;
  if p_full_name is null or btrim(p_full_name) = '' then
    raise exception 'El nombre es obligatorio' using errcode = '23502';
  end if;
  if p_enrollment_date is null then
    raise exception 'La fecha de enrolamiento es obligatoria' using errcode = '23502';
  end if;

  insert into public.patients (code, full_name, birth_date, created_by)
  values (btrim(p_code), btrim(p_full_name), p_birth_date, v_uid)
  returning id into v_patient;

  insert into public.enrollments
    (patient_id, protocol_id, enrolled_by, enrollment_date, treating_physician)
  values
    (v_patient, p_protocol_id, v_uid, p_enrollment_date,
     nullif(btrim(coalesce(p_treating_physician, '')), ''));

  return v_patient;
end;
$$;

comment on function public.create_patient_with_enrollment is
  'Alta atomica paciente + enrolamiento desde Track. SECURITY DEFINER: valida coordinador asignado + operator a mano y fija created_by/enrolled_by = auth.uid().';

revoke all on function public.create_patient_with_enrollment(text, text, uuid, date, date, text) from public;
grant execute on function public.create_patient_with_enrollment(text, text, uuid, date, date, text) to authenticated;


-- ── 2 · Cuenta demo coordina todos los protocolos ───────────────────────────

insert into public.protocol_coordinators (protocol_id, user_id)
select p.id, au.id
from public.protocols p
cross join (select id from auth.users where email = 'spiraclinic.dev@gmail.com') au
on conflict (protocol_id, user_id) do nothing;


-- ── 3 · Esquema de visitas demo + retro-generación ──────────────────────────
-- Solo para los 3 protocolos demo (EFC18244, EFC18419, ACT18301) y solo si
-- todavía no tienen visit_definitions. Esquema tipo Track: V1 screening día 0,
-- V2 baseline +14 ±3, V3 +28 ±3, CT1 telefónica +35 ±2, V4 +56 ±5.

insert into public.visit_definitions
  (protocol_id, code, name, visit_type, offset_days, window_minus, window_plus, sort_order)
select p.id, v.code, v.name, v.visit_type::visit_type, v.offset_days, v.wminus, v.wplus, v.sort_order
from public.protocols p
cross join (values
  ('V1',  'Screening',            'presencial', 0,  0, 0, 1),
  ('V2',  'Baseline',             'presencial', 14, 3, 3, 2),
  ('V3',  'Seguimiento 1',        'presencial', 28, 3, 3, 3),
  ('CT1', 'Contacto telefónico',  'telefonica', 35, 2, 2, 4),
  ('V4',  'Seguimiento 2',        'presencial', 56, 5, 5, 5)
) as v(code, name, visit_type, offset_days, wminus, wplus, sort_order)
where p.code in ('EFC18244', 'EFC18419', 'ACT18301')
  and not exists (select 1 from public.visit_definitions vd where vd.protocol_id = p.id);

-- Retro-generar visitas para enrolamientos que quedaron sin ninguna
-- (misma lógica que public.generate_patient_visits, el trigger de 0003).
insert into public.patient_visits
  (enrollment_id, visit_def_id, estimated_date, window_start, window_end)
select
  e.id,
  vd.id,
  e.enrollment_date + vd.offset_days,
  e.enrollment_date + vd.offset_days - vd.window_minus,
  e.enrollment_date + vd.offset_days + vd.window_plus
from public.enrollments e
join public.visit_definitions vd on vd.protocol_id = e.protocol_id
where not exists (select 1 from public.patient_visits pv where pv.enrollment_id = e.id);


-- ── 4 · Plantilla global de checklist (si falta) ────────────────────────────

insert into public.checklist_templates (name)
select 'Plantilla global'
where not exists (select 1 from public.checklist_templates where protocol_id is null);

insert into public.checklist_template_items
  (template_id, description, deadline_hours, mandatory, sort_order)
select t.id, x.description, x.deadline_hours, x.mandatory, x.sort_order
from (select id from public.checklist_templates
      where protocol_id is null order by created_at limit 1) t
cross join (values
  ('Registrar la visita en el CRF',          48,  true,  1),
  ('Avisar a farmacia si hay dispensación',  0,   true,  2),
  ('Agendar la próxima visita',              0,   true,  3),
  ('Reportar eventos adversos',              48,  true,  4),
  ('Archivar documentación firmada',         168, false, 5)
) as x(description, deadline_hours, mandatory, sort_order)
where not exists (select 1 from public.checklist_template_items i where i.template_id = t.id);


-- ── Verificación final (los counts no deberían dar 0) ───────────────────────

select
  (select count(*) from public.protocol_coordinators)                          as coordinaciones,
  (select count(*) from public.visit_definitions)                              as visit_defs,
  (select count(*) from public.patient_visits)                                 as visitas,
  (select count(*) from public.checklist_templates where protocol_id is null)  as plantilla_global,
  (select count(*) from public.checklist_template_items)                       as items_plantilla,
  (select count(*) from pg_proc where proname = 'create_patient_with_enrollment') as rpc_0012;


-- ── OPCIONAL (descomentá para probar las alertas del Resumen) ───────────────
-- Fuerza una visita demo a "ventana_vencida" moviéndola al pasado:
--
-- update public.patient_visits
-- set estimated_date = current_date - 10,
--     window_start   = current_date - 13,
--     window_end     = current_date - 7
-- where id = (select id from public.patient_visits
--             where real_date is null order by estimated_date limit 1);
