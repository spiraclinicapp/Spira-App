-- Spira · Migración 0048 — Comentarios de visita (hilo plano, autor desnormalizado)
-- ----------------------------------------------------------------------------
-- Hilo de comentarios por visita, reusado en el Drawer de la cola del médico ("Para ver médico") y
-- en el panel "Comentarios" del detalle de visita (VisitDetail). Modelo PLANO: autor + puesto + texto
-- + fecha. Sin "resolución" (eso es del futuro módulo Médicos).
--
-- ⚠️ POR QUÉ EL AUTOR VA DESNORMALIZADO (author_name / author_role en la propia fila):
-- La RLS de public.users sólo deja ver la fila PROPIA (0006_rls_policies.sql:82 →
-- `id = auth.uid() or public.has_module('gerencia')`). Una vista `security_invoker` que joinee
-- public.users por author_id OCULTARÍA en silencio los comentarios de otros autores para quien no es
-- gerencia (el INNER JOIN no encuentra fila visible en users → descarta la fila del comentario), y el
-- hilo quedaría roto: cada coordinador vería SÓLO sus propios comentarios. Por eso el RPC
-- (SECURITY DEFINER) captura full_name + puesto del autor AL MOMENTO de comentar y los guarda en la
-- fila; la vista NO joinea users. Además es lo correcto para una app auditable: queda registrado quién
-- comentó y con qué puesto ENTONCES (si después cambia de puesto, el comentario viejo no se altera).
--
-- Authz de ESCRITURA alineada a la de LECTURA (quien ve la visita puede comentar): gerencia o
-- coordinador asignado (operator+). NO se usa el branch global track-admin de mark_wants_doctor, para
-- no crear "comentarios fantasma" (escritos por quien después no puede leerlos).
--
-- Convención: uuid_generate_v4() (uuid-ossp), como TODO el schema (ver 0023:12). El `default
-- auth.uid()` es anti-spoofing del actor; el cliente nunca pasa author_id (el insert va SÓLO por el
-- RPC, y no hay policy de INSERT directo).
-- APLICAR A MANO en el dashboard de Supabase, en orden, después de la 0047. Luego pushear el front.
-- ============================================================================

-- 1 · Tabla. author_id = FK estable (quién, para auditoría/joins de gerencia); author_name/author_role
--     = snapshot de display (cómo se mostraba entonces). body no vacío; created_at ordena el hilo.
create table if not exists public.visit_comments (
  id           uuid primary key default uuid_generate_v4(),
  visit_id     uuid not null references public.patient_visits(id) on delete cascade,
  author_id    uuid not null default auth.uid() references public.users(id),
  author_name  text not null,
  author_role  text not null,
  body         text not null check (btrim(body) <> ''),
  created_at   timestamptz not null default now()
);
comment on table public.visit_comments is
  'Hilo de comentarios por visita (plano). Autor desnormalizado (snapshot nombre+puesto) por la RLS de users. 0048.';

-- 2 · Índice para traer el hilo (por visita, en orden) y para el count de v_track_visits.
create index if not exists idx_visit_comments_visit on public.visit_comments(visit_id, created_at);

-- 3 · Grants. La vista v_visit_comments es security_invoker → el lector consulta la tabla como sí
--     mismo y necesita SELECT sobre visit_comments. Sin escritura directa (sólo por el RPC).
revoke all on public.visit_comments from anon;
grant select on public.visit_comments to authenticated;
revoke insert, update, delete, truncate, references, trigger on public.visit_comments from authenticated;

-- 4 · RLS. Lectura = espejo EXACTO de "ver visitas de mis protocolos" (0006:162). Sin policy de
--     INSERT: se escribe SÓLO por el RPC (SECURITY DEFINER). Idempotente (drop antes del create).
alter table public.visit_comments enable row level security;
drop policy if exists "ver comentarios de visitas visibles" on public.visit_comments;
create policy "ver comentarios de visitas visibles" on public.visit_comments for select using (
  public.has_module('gerencia')
  or exists (
    select 1 from public.patient_visits pv
    join public.enrollments e on e.id = pv.enrollment_id
    join public.protocol_coordinators pc on pc.protocol_id = e.protocol_id
    where pv.id = visit_comments.visit_id and pc.user_id = auth.uid()
  )
);

-- 5 · RPC de alta. Authz alineada a la lectura (gerencia o coordinador asignado operator+). Snapshotea
--     nombre + puesto del autor (su propia fila de users) y los guarda en la fila. author_id lo estampa
--     el default. Idempotente (create or replace).
create or replace function public.add_visit_comment(p_visit_id uuid, p_body text)
returns void language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  v_protocol uuid;
  v_name     text;
  v_role     text;
begin
  if auth.uid() is null then raise exception 'No autenticado' using errcode = '42501'; end if;
  if btrim(coalesce(p_body, '')) = '' then raise exception 'Comentario vacío' using errcode = '23514'; end if;
  select e.protocol_id into v_protocol
    from public.patient_visits pv join public.enrollments e on e.id = pv.enrollment_id
   where pv.id = p_visit_id;
  if v_protocol is null then raise exception 'Visita inexistente' using errcode = '23503'; end if;
  if not (public.has_module('gerencia')
          or (public.has_min_role('track', 'operator') and public.is_assigned_coordinator(v_protocol))) then
    raise exception 'No tenés permiso' using errcode = '42501';
  end if;
  -- Snapshot del autor: su propia fila de users (siempre visible para él; además SECURITY DEFINER).
  select u.full_name, coalesce(nullif(btrim(u.puesto), ''), 'Equipo')
    into v_name, v_role
    from public.users u where u.id = auth.uid();
  insert into public.visit_comments (visit_id, author_name, author_role, body)
  values (p_visit_id, v_name, v_role, btrim(p_body));
end; $$;
revoke all on function public.add_visit_comment(uuid, text) from public;
grant execute on function public.add_visit_comment(uuid, text) to authenticated;
comment on function public.add_visit_comment is
  'Agrega un comentario a la visita, snapshoteando autor + puesto. Authz gerencia / coord asignado. SECURITY DEFINER. 0048.';

-- 6 · Vista del hilo: SÓLO la tabla (NO joinea users → no la corta la RLS de users). security_invoker
--     → aplica la RLS de visit_comments de arriba. Idempotente (create or replace).
create or replace view public.v_visit_comments with (security_invoker = true) as
select vc.id, vc.visit_id, vc.body, vc.created_at, vc.author_name, vc.author_role
from public.visit_comments vc;
revoke all on public.v_visit_comments from anon;
grant select on public.v_visit_comments to authenticated;

-- 7 · comments_count en v_track_visits (aditiva). Recrear SÓLO v_track_visits (mirror 0047; el count
--     sale de un agregado sobre visit_comments, NO de una columna de patient_visits → v_patient_visits
--     NO se toca). Reproduce las 35 columnas de la 0047 en su orden exacto + comments_count al final.
drop view if exists public.v_track_visits;
create view public.v_track_visits with (security_invoker = true) as
select
  v.id, v.enrollment_id, v.visit_def_id, v.estimated_date, v.real_date,
  v.window_start, v.window_end, v.notes, v.computed_status,
  vd.code as visit_code, vd.name as visit_name,
  coalesce(vd.visit_type, 'presencial') as visit_type, vd.sort_order,
  e.protocol_id, e.patient_id, e.status as enrollment_status,
  e.randomization_date as enrollment_randomization_date,
  pr.code as protocol_code, pr.name as protocol_name,
  pa.code as patient_code, pa.full_name as patient_name,
  vd.offset_days, e.enrollment_date, pa.treating_physician,
  v.kind,
  v.arrived_at, v.ready_at, v.left_at, v.wants_doctor,
  v.doctor_seen_at,
  v.doctor_motivo,
  coalesce(vd.dispenses, false) as dispenses,
  v.operational_stage,
  vd.role, vd.date_mode,
  (select count(*) from public.visit_comments vc where vc.visit_id = v.id) as comments_count  -- nueva (0048)
from public.v_patient_visits v
left join public.visit_definitions vd on vd.id = v.visit_def_id
join public.enrollments e on e.id = v.enrollment_id
join public.protocols pr  on pr.id = e.protocol_id
join public.patients pa   on pa.id = e.patient_id;
comment on view public.v_track_visits is
  'v_track_visits (0047) + comments_count (subquery sobre visit_comments). security_invoker. 0048.';
revoke all on public.v_track_visits from anon;
grant select on public.v_track_visits to authenticated;
revoke insert, update, delete, truncate, references, trigger on public.v_track_visits from authenticated;

notify pgrst, 'reload schema';
