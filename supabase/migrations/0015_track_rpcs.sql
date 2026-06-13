-- Spira · Migración 0015 — RPCs de Track (alta con bypass admin + plantillas atómicas)
-- ----------------------------------------------------------------------------
-- Tres cambios, todos SECURITY DEFINER con autorización validada a mano (mismo
-- patrón que 0012). Cierran:
--   1) El alta de paciente ahora permite a gerencia / track-admin enrolar en
--      CUALQUIER protocolo sin ser coordinador asignado (antes solo el coordinador).
--   2) R2-5: creación atómica de la plantilla de un protocolo + clonado de ítems
--      en UNA transacción (evita el template huérfano vacío que suprimía el checklist).
--   3) R2-6: reordenamiento atómico de dos ítems en UN solo UPDATE (evita el
--      sort_order duplicado si el 2º UPDATE fallaba).
-- ============================================================================


-- ── 1 · Alta de paciente: bypass para gerencia / track-admin ────────────────
-- Reemplaza la función de 0012. Único cambio: el chequeo de autorización ahora
-- es (gerencia OR track-admin) OR (track-operator asignado al protocolo).

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

  -- Autorización: gerencia o track-admin enrolan en cualquier protocolo;
  -- el coordinador asignado (operator+) solo en los suyos.
  if not (
    public.has_module('gerencia')
    or public.has_min_role('track', 'admin')
    or (public.has_min_role('track', 'operator') and public.is_assigned_coordinator(p_protocol_id))
  ) then
    raise exception 'No tenés permiso para enrolar pacientes en este protocolo' using errcode = '42501';
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
  'Alta atomica paciente + enrolamiento desde Track. SECURITY DEFINER: gerencia/track-admin enrolan en cualquier protocolo, el coordinador asignado solo en los suyos. Actor fijado server-side con auth.uid().';

revoke all on function public.create_patient_with_enrollment(text, text, uuid, date, date, text) from public;
grant execute on function public.create_patient_with_enrollment(text, text, uuid, date, date, text) to authenticated;


-- ── 2 · R2-5 · Creación atómica de plantilla de protocolo + clonado ─────────
-- Inserta la plantilla del protocolo y (opcional) clona los ítems de otra
-- plantilla (la global) en la MISMA transacción. Authz = la misma que la RLS de
-- escritura de plantillas por protocolo (0014).

create or replace function public.create_protocol_template(
  p_protocol_id  uuid,
  p_name         text,
  p_clone_from   uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_template uuid;
begin
  if p_protocol_id is null then
    raise exception 'Falta el protocolo' using errcode = '23502';
  end if;

  -- Authz: gerencia / track-admin, o coordinador asignado (operator+).
  if not (
    public.has_module('gerencia')
    or public.has_min_role('track', 'admin')
    or (public.has_min_role('track', 'operator') and public.is_assigned_coordinator(p_protocol_id))
  ) then
    raise exception 'No tenés permiso para crear la plantilla de este protocolo' using errcode = '42501';
  end if;

  insert into public.checklist_templates (protocol_id, name)
  values (p_protocol_id, coalesce(nullif(btrim(p_name), ''), 'Plantilla'))
  returning id into v_template;

  if p_clone_from is not null then
    insert into public.checklist_template_items
      (template_id, description, deadline_hours, mandatory, sort_order)
    select v_template, ci.description, ci.deadline_hours, ci.mandatory, ci.sort_order
    from public.checklist_template_items ci
    where ci.template_id = p_clone_from
    order by ci.sort_order;
  end if;

  return v_template;
end;
$$;

comment on function public.create_protocol_template is
  'Crea la plantilla de un protocolo y clona (opcional) los items de otra en una transaccion. SECURITY DEFINER con authz de plantilla por protocolo (0014).';

revoke all on function public.create_protocol_template(uuid, text, uuid) from public;
grant execute on function public.create_protocol_template(uuid, text, uuid) to authenticated;


-- ── 3 · R2-6 · Reordenamiento atómico de dos ítems ─────────────────────────
-- Intercambia el sort_order de dos ítems de la MISMA plantilla en un solo UPDATE.

create or replace function public.swap_template_item_order(
  p_a uuid,
  p_b uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_template_a uuid;
  v_template_b uuid;
  v_protocol   uuid;
  v_order_a    integer;
  v_order_b    integer;
begin
  select template_id, sort_order into v_template_a, v_order_a
  from public.checklist_template_items where id = p_a;
  select template_id, sort_order into v_template_b, v_order_b
  from public.checklist_template_items where id = p_b;

  if v_template_a is null or v_template_b is null then
    raise exception 'Ítem inexistente' using errcode = '23503';
  end if;
  if v_template_a <> v_template_b then
    raise exception 'Los ítems no pertenecen a la misma plantilla' using errcode = 'check_violation';
  end if;

  -- Authz: igual que la escritura de ítems (0014). Global → gerencia/track-admin;
  -- por protocolo → coordinador asignado (operator+).
  select protocol_id into v_protocol from public.checklist_templates where id = v_template_a;
  if not (
    public.has_module('gerencia')
    or public.has_min_role('track', 'admin')
    or (v_protocol is not null
        and public.has_min_role('track', 'operator')
        and public.is_assigned_coordinator(v_protocol))
  ) then
    raise exception 'No tenés permiso para editar esta plantilla' using errcode = '42501';
  end if;

  update public.checklist_template_items
  set sort_order = case id when p_a then v_order_b when p_b then v_order_a end
  where id in (p_a, p_b);
end;
$$;

comment on function public.swap_template_item_order is
  'Intercambia el sort_order de dos items de la misma plantilla en un solo UPDATE (atomico). SECURITY DEFINER con authz de items (0014).';

revoke all on function public.swap_template_item_order(uuid, uuid) from public;
grant execute on function public.swap_template_item_order(uuid, uuid) to authenticated;
