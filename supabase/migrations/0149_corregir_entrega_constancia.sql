-- Spira · Migración 0149 — Corregir una entrega, fase 1: reemplazar la constancia del IP.
-- Spec: docs/superpowers/specs/2026-10-04-corregir-entrega-design.md (D1, D4, D5, D6, fase 1).
--
-- APLICAR A MANO en el SQL Editor de Supabase (rol postgres), DESPUÉS de la 0148.
-- IDEMPOTENTE: reintentar es volver a correr el archivo entero.
--
-- ⚠️ ADITIVA → VA **ANTES** DEL DEPLOY DEL FRONT. El front desplegado sigue andando con esto:
--    · no pide la tabla nueva ni llama a la función nueva;
--    · no cambia ninguna firma, vista ni policy existente;
--    · la tabla nueva tiene UNA sola FK, a `dispensations`. Con otra al pedido sería una tabla puente
--      entre `dispensation_requests` y `dispensations`, y el embed `dispensations(...)` que el front
--      ya pide quedaría ambiguo (PGRST201, voltea la consulta entera: lección de la 0076). Por lo
--      mismo `request_id` y `corrected_by` van sin FK: un camino nuevo hacia `users` o hacia el pedido
--      podría romper embeds que hoy andan.
--
-- ⚠️ NUNCA dos signos peso pegados dentro de un comentario (ver CLAUDE.md, 0071).
--
-- POR QUÉ EXISTE. «Corregir esta entrega» abría el formulario de un pedido NUEVO: no corregía nada de
-- la entrega y el IP ni se veía (Director, 2026-10-04). Y la base no dejaba otra cosa:
-- `attach_ip_document` (0141) corta con la solicitud `atendida`. Si se subió el PDF de otro paciente,
-- la nota fuente de la entrega quedaba equivocada para siempre.
--
-- CÓMO. La corrección NO reescribe: asienta (D5). La constancia vieja no se toca —el bucket no deja
-- borrar y la fila es nota fuente— sino que se marca reemplazada, con el mismo mecanismo de
-- `superseded_at` que `attach_ip_document`. Y cada corrección deja una fila en
-- `dispensation_corrections` con el antes, el después, el motivo y quién: es lo que el comprobante
-- muestra como «Corregida». La tabla es la de las tres fases; ésta sólo usa `tipo = 'constancia'`.
--
-- Registrar en supabase/README.md al confirmarse en prod.
-- ============================================================================


-- 1 · La tabla de correcciones -------------------------------------------------------------------
-- `id` lo exige audit_row() (0003), que resuelve old.id al planificar (0111). gen_random_uuid(), que
-- vive en pg_catalog (la lección de la 0113). El nombre va como snapshot: Coordinación no lee `users`.
create table if not exists public.dispensation_corrections (
  id                uuid primary key default gen_random_uuid(),
  dispensation_id   uuid not null references public.dispensations(id) on delete restrict,
  -- El pedido de la entrega, copiado para la RLS y para leer por visita. Sin FK: ver el encabezado.
  request_id        uuid not null,
  tipo              text not null,
  -- Lo que había y lo que quedó. Para la constancia: id, nombre y ruta de cada archivo (la ruta deja
  -- abrir la anterior desde el detalle de la corrección). `antes` es null si no había ninguna.
  antes             jsonb,
  despues           jsonb not null,
  motivo_codigo     text not null,
  motivo_texto      text,
  corrected_by      uuid not null default auth.uid(),
  corrected_by_name text,
  created_at        timestamptz not null default now(),
  constraint dc_tipo_chk check (
    tipo in ('constancia', 'kits_ip', 'renglon_cantidad', 'renglon_alta', 'renglon_baja')
  ),
  -- La lista de las tres fases (spec D6), así las próximas no tienen que tocar el check.
  constraint dc_motivo_chk check (
    motivo_codigo in (
      'constancia_equivocada', 'constancia_ilegible',
      'cantidad_mal_registrada', 'medicamento_equivocado', 'falto_registrar', 'kits_mal_declarados',
      'otro'
    )
    and (motivo_codigo <> 'otro' or nullif(btrim(coalesce(motivo_texto, '')), '') is not null)
  )
);

comment on table public.dispensation_corrections is
  'Correcciones de una entrega ya hecha (0149): qué cambió (antes/después), por qué y quién. La entrega no se reescribe: se asienta. Filas sin escritura directa ni borrado: todo por funciones.';

create index if not exists dispensation_corrections_dispensation_idx
  on public.dispensation_corrections (dispensation_id);
create index if not exists dispensation_corrections_request_idx
  on public.dispensation_corrections (request_id);

drop trigger if exists trg_audit_dispensation_corrections on public.dispensation_corrections;
create trigger trg_audit_dispensation_corrections
  after insert or update or delete on public.dispensation_corrections
  for each row execute function public.audit_row();

alter table public.dispensation_corrections enable row level security;

-- Lectura como las constancias del IP, ya con la forma de la 0146 (los permisos una vez por
-- consulta): Farmacia con su alcance, gerencia y quien coordina la visita.
drop policy if exists "ver correcciones de entrega" on public.dispensation_corrections;
create policy "ver correcciones de entrega" on public.dispensation_corrections for select using (
  ((select public.has_min_role('pharma', 'viewer'))
    and ((select public.pharma_sin_recorte()) or public.pharma_alcanza_dispensacion(dispensation_id)))
  or (select public.has_module('gerencia'))
  or exists (
    select 1 from public.dispensation_requests r
     where r.id = dispensation_corrections.request_id
       and r.visit_id in (select public.visitas_que_coordino())
  )
);

-- Sin policies de escritura, y los privilegios acompañan: Supabase reparte insert/update/delete a
-- `authenticated` en cada tabla nueva de public, y "no hay policy" es un candado más blando (0071).
revoke all on public.dispensation_corrections from anon;
revoke insert, update, delete, truncate on public.dispensation_corrections from authenticated;
grant select on public.dispensation_corrections to authenticated;


-- 2 · reemplazar_constancia_entregada --------------------------------------------------------------
-- La constancia de una entrega YA HECHA. Mismas puertas que `attach_ip_document` (quien coordina la
-- visita, o Farmacia con su alcance), pero sólo con la solicitud `atendida` y con motivo obligatorio.
-- También sirve para cargar la que FALTÓ en una entrega con IP que salió sin constancia (las
-- anteriores a la 0071): ahí `antes` queda en null.
--
-- No escribe en `dispensation_requests`: un update ahí dispara `trg_requests_updated_at` y mueve el
-- pedido a la columna «Entregadas» de hoy en el tablero de Farmacia.
create or replace function public.reemplazar_constancia_entregada(
  p_request_id    uuid,
  p_path          text,
  p_file_name     text,
  p_mime          text,
  p_size          int,
  p_motivo        text,
  p_motivo_texto  text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_status      request_status;
  v_includes_ip boolean;
  v_visit_id    uuid;
  v_protocol_id uuid;
  v_disp_id     uuid;
  v_anterior    public.dispensation_ip_documents%rowtype;
  v_id          uuid;
  v_texto       text := nullif(btrim(coalesce(p_motivo_texto, '')), '');
begin
  -- Alcance primero, como en attach_ip_document (0141 §3.27).
  if not (
       public.coordina_visita((select dr.visit_id from public.dispensation_requests dr where dr.id = p_request_id))
       or public.pharma_alcanza_solicitud(p_request_id)) then
    raise exception 'No tenés acceso a este estudio.' using errcode = '42501';
  end if;
  if auth.uid() is null then raise exception 'No autenticado' using errcode = '42501'; end if;

  select r.status, r.includes_ip, r.visit_id, coalesce(r.protocol_id, e.protocol_id)
    into v_status, v_includes_ip, v_visit_id, v_protocol_id
  from public.dispensation_requests r
  join public.patient_visits pv on pv.id = r.visit_id
  join public.enrollments e     on e.id  = pv.enrollment_id
  where r.id = p_request_id
  for update of r;

  if not found then
    raise exception 'No se encontró la solicitud' using errcode = 'check_violation';
  end if;
  if not (public.has_min_role('pharma', 'operator') or public.coordina_visita(v_visit_id)) then
    raise exception 'Sin permiso para corregir la constancia' using errcode = '42501';
  end if;
  if p_motivo is null or p_motivo not in ('constancia_equivocada', 'constancia_ilegible', 'otro') then
    raise exception 'Elegí el motivo de la corrección' using errcode = 'check_violation';
  end if;
  if p_motivo = 'otro' and v_texto is null then
    raise exception 'Contá el motivo de la corrección' using errcode = 'check_violation';
  end if;
  -- Antes de entregar no es una corrección: la constancia se cambia con attach_ip_document.
  if v_status <> 'atendida' then
    raise exception 'Esta entrega todavía no se hizo: la constancia se cambia desde el pedido' using errcode = 'check_violation';
  end if;

  select d.id into v_disp_id
  from public.dispensations d
  where d.request_id = p_request_id and d.status = 'entregada'
  order by d.delivered_at desc nulls last
  limit 1;
  if v_disp_id is null then
    raise exception 'Esta entrega todavía no se hizo: la constancia se cambia desde el pedido' using errcode = 'check_violation';
  end if;

  select * into v_anterior
  from public.dispensation_ip_documents
  where request_id = p_request_id and superseded_at is null
  for update;

  -- Sin IP en la entrega no hay constancia que corregir. Sumarle IP después de entregar es declarar
  -- kits, y eso es de Farmacia (fase 2), no un cambio de archivo.
  if not v_includes_ip and v_anterior.id is null then
    raise exception 'Esta entrega no llevó producto en investigación' using errcode = 'check_violation';
  end if;
  -- La misma regla que attach_ip_document: el archivo cae en la carpeta del protocolo de ESTA visita.
  if v_protocol_id is null or public.ip_doc_protocol(p_path) is distinct from v_protocol_id then
    raise exception 'La constancia no corresponde al protocolo de esta visita' using errcode = 'check_violation';
  end if;

  if v_anterior.id is not null then
    update public.dispensation_ip_documents
       set superseded_at = now()
     where id = v_anterior.id;
  end if;

  insert into public.dispensation_ip_documents
    (request_id, storage_path, file_name, mime_type, size_bytes, uploaded_by)
  values (p_request_id, p_path, p_file_name, p_mime, p_size, auth.uid())
  returning id into v_id;

  insert into public.dispensation_corrections
    (dispensation_id, request_id, tipo, antes, despues, motivo_codigo, motivo_texto,
     corrected_by, corrected_by_name)
  values (
    v_disp_id, p_request_id, 'constancia',
    case when v_anterior.id is null then null else jsonb_build_object(
      'document_id', v_anterior.id, 'file_name', v_anterior.file_name,
      'storage_path', v_anterior.storage_path, 'mime_type', v_anterior.mime_type) end,
    jsonb_build_object(
      'document_id', v_id, 'file_name', p_file_name, 'storage_path', p_path, 'mime_type', p_mime),
    p_motivo, v_texto,
    auth.uid(), (select u.full_name from public.users u where u.id = auth.uid()));

  return v_id;
end;
$$;

revoke all on function public.reemplazar_constancia_entregada(uuid, text, text, text, int, text, text) from public, anon;
grant execute on function public.reemplazar_constancia_entregada(uuid, text, text, text, int, text, text) to authenticated;

notify pgrst, 'reload schema';


-- Verificación (correr aparte, después): las dos tienen que devolver una fila.
--   select to_regclass('public.dispensation_corrections');
--   select proname from pg_proc where proname = 'reemplazar_constancia_entregada';
