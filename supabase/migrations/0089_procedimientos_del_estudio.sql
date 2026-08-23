-- Spira · Migración 0089 — Track: procedimientos del estudio + definiciones de reporte
-- ============================================================================
-- Fase 1 de "Cronograma · Procedimientos y Reportes" (plan: docs/plan-cronograma-reportes.md).
-- Un procedimiento puede generar VARIOS reportes, cada uno en su plataforma y con su plazo. El
-- flag binario procedures.has_report (0064) no alcanza. Esta migración construye el modelo nuevo
-- SIN tocar el viejo: has_report y report_eta_hours siguen vivos y siguen alimentando
-- v_patient_visits.computed_status y v_procedure_report_alerts. Se retiran recién en la 0091,
-- después de que el front deje de leerlos.
--
--   1. procedures.min_estimated: cuánto dura el procedimiento (el "Demora estimada" del modal).
--   2. protocol_procedures: "este estudio usa este procedimiento". No existía: protocol_activities
--      exige visit_def_id NOT NULL (0061), o sea que hoy no hay dónde anotarlo sin meterlo antes
--      en una visita.
--   3. report_definitions: "qué reportes lleva ese procedimiento, EN ESTE estudio".
--   4. RLS + auditoría, calcadas de procedures/protocol_activities (0061).
--   5. Backfill idempotente desde has_report.
--   6. RPCs: set_procedure_reports (atómica) y remove_protocol_procedure (con guard).
--
-- ORDEN DE DESPLIEGUE: esta migración va PRIMERO y el front después. Es puramente aditiva —
-- ningún front desplegado consulta estas tablas, así que el único que no funciona sin ellas es
-- el front nuevo (regla de CLAUDE.md; ver también supabase/README.md).
--
-- APLICAR: a mano en el SQL Editor de Supabase (rol postgres), en orden, DESPUÉS de la 0088.
-- IDEMPOTENTE. Registrar en supabase/README.md al confirmarse en prod.
-- ============================================================================


-- 1 · Demora estimada del procedimiento -----------------------------------------------------
-- Minutos de principio a fin. Nullable: el catálogo viene de 0061 sin este dato y no se inventa.
-- El tope de 1440 (un día) no es burocracia: ataja el error de tipeo de cargar horas donde van
-- minutos, que en una agenda de visitas se propaga sin que nadie lo note.
alter table public.procedures add column if not exists min_estimated integer;
do $mig$ begin
  alter table public.procedures add constraint procedures_min_estimated_chk
    check (min_estimated is null or (min_estimated > 0 and min_estimated <= 1440));
exception when duplicate_object then null; end $mig$;
comment on column public.procedures.min_estimated is
  'Duración estimada del procedimiento en minutos (presets 5..90 en la UI, valor libre permitido). 0089.';


-- 2 · protocol_procedures: el procedimiento pertenece al estudio -----------------------------
-- Sin esta tabla, "Procedimientos del estudio" no puede existir como concepto: protocol_activities
-- es el join visita↔procedimiento y su visit_def_id es NOT NULL desde 0061:79. Los reportes cuelgan
-- de ACÁ y no de procedures, porque el mismo procedimiento del catálogo global lleva reportes
-- distintos en cada protocolo (una extracción de sangre reporta a LabCorp en un estudio y a IQVIA
-- en otro).
create table if not exists public.protocol_procedures (
  id           uuid primary key default uuid_generate_v4(),
  protocol_id  uuid not null references public.protocols(id)  on delete cascade,
  procedure_id uuid not null references public.procedures(id) on delete restrict,
  created_by   uuid not null default auth.uid() references public.users(id),
  created_at   timestamptz not null default now(),
  unique (protocol_id, procedure_id)
);
create index if not exists ix_pp_protocol on public.protocol_procedures (protocol_id);
comment on table public.protocol_procedures is
  'Procedimientos que usa un protocolo. Padre de report_definitions. La asignación a VISITAS sigue en protocol_activities. 0089.';


-- 3 · report_definitions: qué reportes lleva ese procedimiento en este estudio ---------------
-- `platform` es TEXTO con check y no un enum, por el precedente explícito de la 0070: un enum
-- nuevo obligaría a un `alter type ... add value` en su propio archivo (la trampa de la 0053)
-- cada vez que aparezca una CRO. Con check, sumar una plataforma es una línea acá y una en el
-- mapa de colores del front.
--
-- `eta_hours` NO reusa el check cerrado de la 0064 (24/48/72/168/336/720): el handoff pide chips
-- de 1/24/48/72 horas MÁS un valor libre, y ni 1 hora ni el valor libre entran en esa lista. Queda
-- un rango (una hora .. un año), que es lo único que la base tiene que garantizar; los presets son
-- decisión de la UI.
create table if not exists public.report_definitions (
  id                    uuid primary key default uuid_generate_v4(),
  protocol_procedure_id uuid not null references public.protocol_procedures(id) on delete cascade,
  name                  text not null,
  platform              text not null default 'otro',
  link                  text,
  eta_hours             integer,
  notes                 text,
  sort_order            integer,
  created_by            uuid not null default auth.uid() references public.users(id),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
do $mig$ begin
  alter table public.report_definitions add constraint report_definitions_platform_chk
    check (platform in ('iqvia', 'labcorp', 'clario', 'roche4g', 'otro'));
exception when duplicate_object then null; end $mig$;
do $mig$ begin
  alter table public.report_definitions add constraint report_definitions_eta_chk
    check (eta_hours is null or (eta_hours > 0 and eta_hours <= 8760));
exception when duplicate_object then null; end $mig$;
do $mig$ begin
  alter table public.report_definitions add constraint report_definitions_name_chk
    check (btrim(name) <> '');
exception when duplicate_object then null; end $mig$;
-- Un reporte no se repite con el mismo nombre en el mismo procedimiento del mismo estudio.
create unique index if not exists uq_rd_pp_name
  on public.report_definitions (protocol_procedure_id, lower(btrim(name)));
create index if not exists ix_rd_pp on public.report_definitions (protocol_procedure_id);
comment on table public.report_definitions is
  'Reportes que genera un procedimiento en un protocolo: nombre, plataforma, link, plazo y notas. 0089.';
comment on column public.report_definitions.eta_hours is
  'Horas desde que se realiza el procedimiento hasta que el reporte aparece en la plataforma. Nullable = no vence. 0089.';

drop trigger if exists trg_report_definitions_updated_at on public.report_definitions;
create trigger trg_report_definitions_updated_at
  before update on public.report_definitions
  for each row execute function public.set_updated_at();


-- 4 · RLS -----------------------------------------------------------------------------------
-- Espejo de la RLS de `procedures` (0061:46): ver es amplio (si no, el catálogo no renderiza) y
-- editar es rol alto. Ojo con la asimetría deliberada: EDITAR el catálogo global pide track-leader
-- porque afecta a TODOS los protocolos; armar el cuadro de UN estudio pide track-operator, igual
-- que editar su cronograma (es la misma tarea y la hace la misma persona).
alter table public.protocol_procedures enable row level security;
alter table public.report_definitions  enable row level security;

drop policy if exists "ver procedimientos del estudio" on public.protocol_procedures;
create policy "ver procedimientos del estudio" on public.protocol_procedures for select using (
  public.has_module('track') or public.has_module('pharma') or public.has_module('gerencia')
);
drop policy if exists "editar procedimientos del estudio" on public.protocol_procedures;
create policy "editar procedimientos del estudio" on public.protocol_procedures for all
  using      (public.has_module('gerencia') or public.has_min_role('track', 'operator'))
  with check (public.has_module('gerencia') or public.has_min_role('track', 'operator'));

drop policy if exists "ver definiciones de reporte" on public.report_definitions;
create policy "ver definiciones de reporte" on public.report_definitions for select using (
  public.has_module('track') or public.has_module('pharma') or public.has_module('gerencia')
);
drop policy if exists "editar definiciones de reporte" on public.report_definitions;
create policy "editar definiciones de reporte" on public.report_definitions for all
  using      (public.has_module('gerencia') or public.has_min_role('track', 'operator'))
  with check (public.has_module('gerencia') or public.has_min_role('track', 'operator'));

revoke all on public.protocol_procedures from anon;
revoke all on public.report_definitions  from anon;
grant select, insert, update, delete on public.protocol_procedures to authenticated;
grant select, insert, update, delete on public.report_definitions  to authenticated;


-- 5 · Auditoría ------------------------------------------------------------------------------
-- El cuadro de procedimientos y sus reportes son configuración regulatoria: dejan rastro, igual
-- que protocol_activities y procedures desde la 0061.
drop trigger if exists trg_audit_protocol_procedures on public.protocol_procedures;
create trigger trg_audit_protocol_procedures after insert or update or delete
  on public.protocol_procedures for each row execute function public.audit_row();

drop trigger if exists trg_audit_report_definitions on public.report_definitions;
create trigger trg_audit_report_definitions after insert or update or delete
  on public.report_definitions for each row execute function public.audit_row();


-- 6 · Backfill ------------------------------------------------------------------------------
-- Aditivo e idempotente. Dos pasos, cada uno con su propia consulta completa: las sentencias del
-- editor de Supabase NO comparten sesión ni transacción, así que nada se apoya en una temporal de
-- la sentencia anterior.
--
-- (a) Todo procedimiento que ya está en alguna visita de un protocolo, es del estudio.
-- (b) Todo procedimiento que hoy dice "genera reporte" estrena UNA definición equivalente, con
--     plataforma 'otro' (no sabemos cuál era; inventarla sería dato falso en un sistema auditado)
--     y el plazo que ya tenía. El nombre del reporte arranca siendo el del procedimiento, que es
--     exactamente la información que había.
do $mig$
declare v_by uuid;
begin
  select u.id into v_by
  from public.users u
  join public.user_module_roles r on r.user_id = u.id
  where r.module = 'gerencia'
  order by u.created_at limit 1;
  if v_by is null then select id into v_by from public.users order by created_at limit 1; end if;
  if v_by is null then
    raise notice 'Sin usuarios: se omite el backfill de procedimientos del estudio';
    return;
  end if;

  insert into public.protocol_procedures (protocol_id, procedure_id, created_by)
  select distinct pa.protocol_id, pa.procedure_id, v_by
  from public.protocol_activities pa
  on conflict (protocol_id, procedure_id) do nothing;

  insert into public.report_definitions (protocol_procedure_id, name, platform, eta_hours, created_by)
  select pp.id, p.name, 'otro', p.report_eta_hours, v_by
  from public.protocol_procedures pp
  join public.procedures p on p.id = pp.procedure_id
  where p.has_report
  on conflict do nothing;
end $mig$;


-- 7 · RPC: reemplazar atómicamente los reportes de un procedimiento del estudio --------------
-- El modal "Editar procedimiento" guarda TODO junto: si el usuario borra un reporte y aprieta
-- Cancelar, no tiene que haber pasado nada. Con guardados sueltos por reporte eso es imposible.
-- Mismo patrón que set_visit_procedures (0061): SECURITY DEFINER, authz server-side, search_path
-- fijo y columnas calificadas (la trampa de ambigüedad de 0056/0058, que costó dos migraciones).
--
-- p_reports es un array jsonb. Cada elemento: { id?, name, platform, link, eta_hours, notes }.
-- Los que traen `id` se actualizan; los que no, se insertan. Los que están en la base y NO vienen
-- en el array, se borran. Array vacío = el procedimiento se queda sin reportes.
create or replace function public.set_procedure_reports(
  p_protocol_procedure_id uuid,
  p_reports jsonb
)
returns void language plpgsql security definer set search_path = public as $fn$
declare
  v_protocol_id uuid;
  v_keep uuid[];
begin
  select pp.protocol_id into v_protocol_id
  from public.protocol_procedures pp where pp.id = p_protocol_procedure_id;
  if v_protocol_id is null then
    raise exception 'El procedimiento no pertenece a este estudio' using errcode = '23503';
  end if;
  if not (public.has_module('gerencia') or public.has_min_role('track', 'operator')) then
    raise exception 'Sin permiso para editar los reportes del estudio' using errcode = '42501';
  end if;

  -- Los ids que sobreviven. coalesce para que un array nulo se comporte como uno vacío (borrar todo).
  select coalesce(array_agg((e.value ->> 'id')::uuid), '{}'::uuid[])
    into v_keep
  from jsonb_array_elements(coalesce(p_reports, '[]'::jsonb)) as e
  where e.value ->> 'id' is not null;

  delete from public.report_definitions rd
   where rd.protocol_procedure_id = p_protocol_procedure_id
     and rd.id <> all (v_keep);

  -- Actualizar los existentes. El orden lo da la posición en el array.
  update public.report_definitions rd
     set name       = btrim(x.name),
         platform   = x.platform,
         link       = nullif(btrim(coalesce(x.link, '')), ''),
         eta_hours  = x.eta_hours,
         notes      = nullif(btrim(coalesce(x.notes, '')), ''),
         sort_order = x.ord::int
  from (
    select (e.value ->> 'id')::uuid      as id,
            e.value ->> 'name'           as name,
            coalesce(e.value ->> 'platform', 'otro') as platform,
            e.value ->> 'link'           as link,
           (e.value ->> 'eta_hours')::int as eta_hours,
            e.value ->> 'notes'          as notes,
            e.ord
    from jsonb_array_elements(coalesce(p_reports, '[]'::jsonb)) with ordinality as e(value, ord)
    where e.value ->> 'id' is not null
  ) as x
  where rd.id = x.id and rd.protocol_procedure_id = p_protocol_procedure_id;

  -- Insertar los nuevos (los que vienen sin id).
  insert into public.report_definitions (protocol_procedure_id, name, platform, link, eta_hours, notes, sort_order)
  select p_protocol_procedure_id,
         btrim(y.name),
         y.platform,
         nullif(btrim(coalesce(y.link, '')), ''),
         y.eta_hours,
         nullif(btrim(coalesce(y.notes, '')), ''),
         y.ord::int
  from (
    select  e.value ->> 'name'            as name,
            coalesce(e.value ->> 'platform', 'otro') as platform,
            e.value ->> 'link'            as link,
           (e.value ->> 'eta_hours')::int as eta_hours,
            e.value ->> 'notes'           as notes,
            e.ord
    from jsonb_array_elements(coalesce(p_reports, '[]'::jsonb)) with ordinality as e(value, ord)
    where e.value ->> 'id' is null
  ) as y;
end $fn$;

comment on function public.set_procedure_reports(uuid, jsonb) is
  'Reemplaza atómicamente el set de reportes de un procedimiento del estudio. authz: gerencia o track-operator. 0089.';


-- 8 · RPC: quitar un procedimiento del estudio, con guard -----------------------------------
-- No se borra si el procedimiento está asignado a alguna visita del cronograma: quitarlo dejaría
-- esas visitas con un procedimiento que el estudio ya no reconoce. Mismo criterio que el
-- `on delete restrict` del catálogo global (0061) — se avisa cuántas visitas lo usan y se deja
-- que el usuario decida, en vez de vaciarle el cronograma por elevación.
--
-- No se resuelve con una FK compuesta de protocol_activities a esta tabla a propósito: eso crearía
-- un SEGUNDO camino entre protocol_activities y procedures, y PostgREST responde PGRST201 volteando
-- la consulta entera (pasó con la 0076 el 2026-08-13 y tiró el tablero de Farmacia).
create or replace function public.remove_protocol_procedure(
  p_protocol_id  uuid,
  p_procedure_id uuid
)
returns void language plpgsql security definer set search_path = public as $fn$
declare v_visitas int;
begin
  if not (public.has_module('gerencia') or public.has_min_role('track', 'operator')) then
    raise exception 'Sin permiso para editar los procedimientos del estudio' using errcode = '42501';
  end if;

  select count(*) into v_visitas
  from public.protocol_activities pa
  where pa.protocol_id = p_protocol_id and pa.procedure_id = p_procedure_id;

  if v_visitas > 0 then
    raise exception 'El procedimiento está en % visita(s) del cronograma', v_visitas
      using errcode = '23503';
  end if;

  delete from public.protocol_procedures pp
   where pp.protocol_id = p_protocol_id and pp.procedure_id = p_procedure_id;
end $fn$;

comment on function public.remove_protocol_procedure(uuid, uuid) is
  'Quita un procedimiento del estudio. Bloquea si está asignado a visitas del cronograma. authz: gerencia o track-operator. 0089.';

-- Permisos de las dos RPCs. El `revoke ... from public` va PRIMERO y no es decorativo: Postgres le
-- da EXECUTE a PUBLIC por defecto en toda función nueva, y `anon` hereda de PUBLIC. Las dos
-- funciones son SECURITY DEFINER y validan el rol por dentro (un anónimo se comería un 42501), así
-- que esto es una segunda cerradura sobre una puerta que ya cierra — el mismo patrón de 0012/0015/0018.
revoke all on function public.set_procedure_reports(uuid, jsonb)    from public;
revoke all on function public.remove_protocol_procedure(uuid, uuid) from public;
grant execute on function public.set_procedure_reports(uuid, jsonb)    to authenticated;
grant execute on function public.remove_protocol_procedure(uuid, uuid) to authenticated;
