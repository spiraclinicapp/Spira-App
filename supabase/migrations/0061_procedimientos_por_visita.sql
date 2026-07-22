-- Spira · Migración 0061 — Track: procedimientos por visita (Schedule of Assessments)
-- ============================================================================
-- Cada visita del cronograma (visit_definitions) declara qué procedimientos lleva.
-- Modelo híbrido (revisión CEO/Eng 2026-07-21):
--   1. procedures: catálogo GLOBAL de procedimientos (reutilizable cross-protocolo).
--   2. protocol_activities (tabla latente desde 0002, sin uso en la app) se REVIVE como el
--      join visita↔procedimiento: se le suma procedure_id; el orden reusa suggested_order.
--   3. set_visit_procedures: RPC atómico que reemplaza el set de una visita en una transacción.
--   4. Auditoría: audit_row() sobre procedures y protocol_activities (visit_definitions ya la
--      tiene desde 0026).
--
-- Procedimientos = metadata interna del cuadro, NO registro clínico regulado → hard-delete OK.
-- est_minutes fuera de alcance v1. Superficie en ejecución + grilla SoA + herencia: diferidos.
--
-- APLICAR: a mano en el SQL Editor de Supabase (rol postgres), en orden, DESPUÉS de la 0060.
-- IDEMPOTENTE: re-ejecutable (if not exists + create or replace + drop/create de triggers y
-- policies; el guard aborta solo si protocol_activities tiene filas legacy sin procedure_id).
-- Registrar en supabase/README.md al confirmarse en prod.
-- ============================================================================


-- 1 · Catálogo global de procedimientos ------------------------------------------------------
-- Global (sin protocol_id): un mismo procedimiento (espirometría, ECG…) se reutiliza entre
-- protocolos. requires_dispensation es del procedimiento (no de la asignación). category es
-- texto libre en la base; la UI la restringe a un set cerrado (desplegable).
create table if not exists public.procedures (
  id                    uuid primary key default uuid_generate_v4(),
  code                  text,
  name                  text not null,
  category              text,
  requires_dispensation boolean not null default false,
  created_by            uuid not null default auth.uid() references public.users(id),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
comment on table public.procedures is 'Catálogo global de procedimientos (Schedule of Assessments). Reutilizable cross-protocolo. Se asigna a las visitas vía protocol_activities.';

-- code único cuando está presente (los creados a mano por la UI pueden no tener código).
create unique index if not exists uq_procedures_code on public.procedures (code) where code is not null;

drop trigger if exists trg_procedures_updated_at on public.procedures;
create trigger trg_procedures_updated_at
  before update on public.procedures
  for each row execute function public.set_updated_at();

alter table public.procedures enable row level security;

-- SELECT amplio: cualquiera con módulo track/pharma/gerencia (si no, el catálogo no renderiza
-- en el modal de asignación). Edición del catálogo (afecta TODOS los protocolos) restringida a
-- rol alto: gerencia o líder de Track.
drop policy if exists "ver procedures" on public.procedures;
create policy "ver procedures" on public.procedures for select using (
  public.has_module('track') or public.has_module('pharma') or public.has_module('gerencia')
);
drop policy if exists "editar procedures" on public.procedures;
create policy "editar procedures" on public.procedures for all
  using      (public.has_module('gerencia') or public.has_min_role('track', 'leader'))
  with check (public.has_module('gerencia') or public.has_min_role('track', 'leader'));


-- 2 · Revivir protocol_activities (0002, latente) como join visita↔procedimiento -------------
-- Le sumamos procedure_id (FK al catálogo). El nombre display sale de procedures.name → name
-- pasa a opcional. El orden reusa suggested_order (ya existe; NO agregamos sort_order).
alter table public.protocol_activities
  add column if not exists procedure_id uuid references public.procedures(id) on delete restrict;

-- GUARD: la tabla es latente (nunca se cableó a la app). Si hay filas legacy sin procedure_id,
-- abortar antes de endurecer — una constraint NOT NULL sobre filas viejas rompería (regla dura).
do $$
begin
  if exists (
    select 1 from public.protocol_activities
    where procedure_id is null or visit_def_id is null
  ) then
    raise exception 'protocol_activities tiene filas legacy (procedure_id/visit_def_id null): revisar antes de aplicar 0061';
  end if;
end $$;

alter table public.protocol_activities alter column procedure_id set not null;
alter table public.protocol_activities alter column visit_def_id  set not null;
alter table public.protocol_activities alter column name          drop not null;

-- Un procedimiento no se repite en la misma visita (el modelo mental es un conjunto).
alter table public.protocol_activities drop constraint if exists uq_pa_visit_procedure;
alter table public.protocol_activities add  constraint uq_pa_visit_procedure unique (visit_def_id, procedure_id);
create index if not exists ix_pa_visit_def on public.protocol_activities (visit_def_id);

comment on table public.protocol_activities is 'Procedimientos por visita (join visita↔procedimiento del catálogo global). Revivida en 0061: procedure_id + orden en suggested_order; name display sale de procedures.';


-- 3 · Auditoría (protocol_activities no estaba cubierta; procedures es nueva) -----------------
-- visit_definitions YA está auditada desde 0026. El cuadro (SoA) es config regulatoria → deja rastro.
drop trigger if exists trg_audit_procedures on public.procedures;
create trigger trg_audit_procedures after insert or update or delete
  on public.procedures for each row execute function public.audit_row();

drop trigger if exists trg_audit_protocol_activities on public.protocol_activities;
create trigger trg_audit_protocol_activities after insert or update or delete
  on public.protocol_activities for each row execute function public.audit_row();


-- 4 · RPC atómico: reemplaza el set de procedimientos de una visita --------------------------
-- Recibe la definición de visita y el array ORDENADO de procedure_id. En una transacción:
-- borra los que ya no están e inserta/actualiza el orden de los presentes. authz server-side
-- (gerencia o track-operator, igual que editar el cronograma). `set search_path` + columnas
-- calificadas evitan la trampa de ambigüedad del repo (0056/0058).
create or replace function public.set_visit_procedures(p_visit_def_id uuid, p_procedure_ids uuid[])
returns void language plpgsql security definer set search_path = public as $$
declare v_protocol_id uuid;
begin
  select vd.protocol_id into v_protocol_id
  from public.visit_definitions vd where vd.id = p_visit_def_id;
  if v_protocol_id is null then
    raise exception 'La definición de visita no existe' using errcode = '23503';
  end if;
  if not (public.has_module('gerencia') or public.has_min_role('track', 'operator')) then
    raise exception 'Sin permiso para editar el cronograma' using errcode = '42501';
  end if;

  -- quitar los que ya no están (array vacío o null = quitar todos)
  delete from public.protocol_activities pa
   where pa.visit_def_id = p_visit_def_id
     and (p_procedure_ids is null or pa.procedure_id <> all (p_procedure_ids));

  -- insertar/actualizar el orden de los presentes (orden = posición en el array)
  if p_procedure_ids is not null then
    insert into public.protocol_activities (protocol_id, visit_def_id, procedure_id, suggested_order)
    select v_protocol_id, p_visit_def_id, t.pid, t.ord::int
    from unnest(p_procedure_ids) with ordinality as t(pid, ord)
    on conflict (visit_def_id, procedure_id) do update set suggested_order = excluded.suggested_order;
  end if;
end $$;

comment on function public.set_visit_procedures(uuid, uuid[]) is 'Reemplaza atómicamente el set ordenado de procedimientos de una visita. authz: gerencia o track-operator.';


-- 5 · Seed curado del catálogo global --------------------------------------------------------
-- Set clínico estándar reutilizable. Idempotente (on conflict do nothing por el unique de code).
-- created_by: se resuelve a un usuario real (gerencia primero) porque el seed corre como postgres
-- sin auth.uid() y la tabla exige created_by not null. Sin usuarios, se omite (no rompe).
do $$
declare v_seed_by uuid;
begin
  select u.id into v_seed_by
  from public.users u
  join public.user_module_roles r on r.user_id = u.id
  where r.module = 'gerencia'
  order by u.created_at limit 1;
  if v_seed_by is null then
    select id into v_seed_by from public.users order by created_at limit 1;
  end if;
  if v_seed_by is null then
    raise notice 'Sin usuarios: se omite el seed del catálogo de procedimientos';
    return;
  end if;

  insert into public.procedures (code, name, category, requires_dispensation, created_by) values
    ('SIGNOS',   'Signos vitales',                  'Evaluación clínica',  false, v_seed_by),
    ('EXAMFIS',  'Examen físico',                   'Evaluación clínica',  false, v_seed_by),
    ('ESPIRO',   'Espirometría',                    'Cardio-respiratorio', false, v_seed_by),
    ('ECG',      'Electrocardiograma (ECG)',        'Cardio-respiratorio', false, v_seed_by),
    ('SAT',      'Saturometría',                    'Cardio-respiratorio', false, v_seed_by),
    ('EXTSANG',  'Extracción de sangre',            'Laboratorio',         false, v_seed_by),
    ('HEMATO',   'Hematología',                     'Laboratorio',         false, v_seed_by),
    ('QUIMICA',  'Química sanguínea',               'Laboratorio',         false, v_seed_by),
    ('ORINA',    'Análisis de orina',               'Laboratorio',         false, v_seed_by),
    ('EMBARAZO', 'Test de embarazo',                'Laboratorio',         false, v_seed_by),
    ('CONSENT',  'Consentimiento informado',        'Elegibilidad',        false, v_seed_by),
    ('CRITERIOS','Criterios de inclusión/exclusión','Elegibilidad',        false, v_seed_by),
    ('CALVIDA',  'Cuestionario de calidad de vida', 'Cuestionarios',       false, v_seed_by),
    ('EVADVER',  'Registro de eventos adversos',    'Seguridad',           false, v_seed_by),
    ('MEDCONC',  'Medicación concomitante',         'Seguridad',           false, v_seed_by),
    ('DISPENSA', 'Dispensación de medicación',      'Medicación',          true,  v_seed_by)
  on conflict do nothing;
end $$;
