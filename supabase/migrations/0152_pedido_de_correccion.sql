-- Spira · Migración 0152 — Corregir una entrega, fase 3: Coordinación pide la corrección a Farmacia.
-- Spec: docs/superpowers/specs/2026-10-04-corregir-entrega-design.md (D1, D3, fase 3).
--
-- APLICAR A MANO en el SQL Editor de Supabase (rol postgres), DESPUÉS de la 0151. IDEMPOTENTE:
-- reintentar es volver a correr el archivo entero.
--
-- ⚠️ ADITIVA → VA **ANTES** DEL DEPLOY DEL FRONT. El front desplegado no pide la tabla nueva ni llama a
--    las funciones nuevas. No cambia ninguna firma, vista ni policy existente. La tabla nueva tiene UNA
--    sola FK, a `dispensations` (como `dispensation_corrections`, 0149): con otra al pedido sería una
--    tabla puente y dejaría ambiguo el embed `dispensations(...)` que el front ya pide (lección 0076).
--
-- ⚠️ NUNCA dos signos peso pegados dentro de un comentario (ver CLAUDE.md, 0071).
--
-- QUÉ HACE (D3: Coordinación nunca mueve stock). Coordinación dice qué está mal en la medicación de una
-- entrega —«eran 2, no 1», «esto no se dio», «faltó registrar esto otro»— y Farmacia lo resuelve:
--   · APLICAR: el líder de Farmacia corrige con `corregir_entrega_farmacia` (0151) —elige los lotes, que
--     Coordinación no sabe— y el pedido queda aplicado EN LA MISMA TRANSACCIÓN: no puede quedar aplicado
--     sin corrección, ni corregido con el pedido todavía pendiente.
--   · DESCARTAR: con una nota obligatoria, que Coordinación lee en el ticket de la visita.
-- Un solo pedido pendiente por entrega (índice único parcial): dos a la vez se pisarían.
--
-- Registrar en supabase/README.md al confirmarse en prod.
-- ============================================================================


-- 1 · La tabla ----------------------------------------------------------------------------------
-- `id` lo exige audit_row() (0003). Los nombres van como snapshot: Coordinación no lee `users`.
create table if not exists public.dispensation_correction_requests (
  id                uuid primary key default gen_random_uuid(),
  dispensation_id   uuid not null references public.dispensations(id) on delete restrict,
  -- El pedido de la entrega, copiado para la RLS y para leer por visita. Sin FK: ver el encabezado.
  request_id        uuid not null,
  -- Lo que se pide, por medicamento: [{medication_id, medicamento, registrado, correcto}]. `registrado`
  -- lo pone la base (lo que dice la entrega HOY), no el cliente; `correcto` 0 = no se dio.
  renglones         jsonb not null,
  motivo_codigo     text not null,
  motivo_texto      text,
  estado            text not null default 'pendiente',
  requested_by      uuid not null default auth.uid(),
  requested_by_name text,
  requested_at      timestamptz not null default now(),
  resolved_by       uuid,
  resolved_by_name  text,
  resolved_at       timestamptz,
  nota_resolucion   text,
  constraint dcr_estado_chk check (estado in ('pendiente', 'aplicado', 'descartado')),
  constraint dcr_motivo_chk check (
    motivo_codigo in ('cantidad_mal_registrada', 'medicamento_equivocado', 'falto_registrar', 'otro')
    and (motivo_codigo <> 'otro' or nullif(btrim(coalesce(motivo_texto, '')), '') is not null)
  ),
  constraint dcr_resolucion_chk check ((estado = 'pendiente') = (resolved_at is null)),
  constraint dcr_descarte_chk check (
    estado <> 'descartado' or nullif(btrim(coalesce(nota_resolucion, '')), '') is not null
  ),
  constraint dcr_renglones_chk check (jsonb_typeof(renglones) = 'array' and jsonb_array_length(renglones) > 0)
);

comment on table public.dispensation_correction_requests is
  'Pedido de corrección de la medicación de una entrega, de Coordinación a Farmacia (0152). Farmacia lo aplica (con corregir_entrega_farmacia, en la misma transacción) o lo descarta con una nota. Sin escritura directa: todo por funciones.';

create unique index if not exists dispensation_correction_requests_pendiente_uq
  on public.dispensation_correction_requests (dispensation_id) where estado = 'pendiente';
create index if not exists dispensation_correction_requests_request_idx
  on public.dispensation_correction_requests (request_id);

drop trigger if exists trg_audit_dispensation_correction_requests on public.dispensation_correction_requests;
create trigger trg_audit_dispensation_correction_requests
  after insert or update or delete on public.dispensation_correction_requests
  for each row execute function public.audit_row();

alter table public.dispensation_correction_requests enable row level security;

-- Lectura como `dispensation_corrections` (0149), con la forma de la 0146.
drop policy if exists "ver pedidos de correccion" on public.dispensation_correction_requests;
create policy "ver pedidos de correccion" on public.dispensation_correction_requests for select using (
  ((select public.has_min_role('pharma', 'viewer'))
    and ((select public.pharma_sin_recorte()) or public.pharma_alcanza_dispensacion(dispensation_id)))
  or (select public.has_module('gerencia'))
  or exists (
    select 1 from public.dispensation_requests r
     where r.id = dispensation_correction_requests.request_id
       and r.visit_id in (select public.visitas_que_coordino())
  )
);

revoke all on public.dispensation_correction_requests from anon;
revoke insert, update, delete, truncate on public.dispensation_correction_requests from authenticated;
grant select on public.dispensation_correction_requests to authenticated;


-- 2 · pedir_correccion_entrega (Coordinación) ---------------------------------------------------
-- `p_renglones`: [{"medication_id": …, "correcto": n}], n ≥ 0. Lo registrado lo pone la base.
create or replace function public.pedir_correccion_entrega(
  p_request_id   uuid,
  p_renglones    jsonb,
  p_motivo       text,
  p_motivo_texto text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_visit_id    uuid;
  v_status      request_status;
  v_protocol_id uuid;
  v_disp_id     uuid;
  v_texto       text := nullif(btrim(coalesce(p_motivo_texto, '')), '');
  v_r           jsonb;
  v_med         uuid;
  v_correcto    int;
  v_registrado  int;
  v_nombre_med  text;
  v_vistos      uuid[] := '{}';
  v_salida      jsonb := '[]'::jsonb;
  v_id          uuid;
begin
  if auth.uid() is null then raise exception 'No autenticado' using errcode = '42501'; end if;

  select r.visit_id, r.status, coalesce(r.protocol_id, e.protocol_id)
    into v_visit_id, v_status, v_protocol_id
  from public.dispensation_requests r
  join public.patient_visits pv on pv.id = r.visit_id
  join public.enrollments e     on e.id  = pv.enrollment_id
  where r.id = p_request_id
  for update of r;

  if not found then
    raise exception 'No se encontró la solicitud' using errcode = 'check_violation';
  end if;
  -- D3: pide quien coordina la visita. Farmacia no pide: corrige directo (0151).
  if not public.coordina_visita(v_visit_id) then
    raise exception 'Sólo quien coordina la visita puede pedir la corrección' using errcode = '42501';
  end if;
  if p_motivo is null or p_motivo not in ('cantidad_mal_registrada', 'medicamento_equivocado', 'falto_registrar', 'otro') then
    raise exception 'Elegí el motivo de la corrección' using errcode = 'check_violation';
  end if;
  if p_motivo = 'otro' and v_texto is null then
    raise exception 'Contá el motivo de la corrección' using errcode = 'check_violation';
  end if;
  if v_status <> 'atendida' then
    raise exception 'Esta entrega todavía no se hizo: lo que falte se cambia en el pedido' using errcode = 'check_violation';
  end if;

  select d.id into v_disp_id
  from public.dispensations d
  where d.request_id = p_request_id and d.status = 'entregada'
  order by d.delivered_at desc nulls last
  limit 1;
  if v_disp_id is null then
    raise exception 'Esta entrega todavía no se hizo: lo que falte se cambia en el pedido' using errcode = 'check_violation';
  end if;

  if exists (select 1 from public.dispensation_correction_requests
              where dispensation_id = v_disp_id and estado = 'pendiente') then
    raise exception 'Ya hay una corrección pedida para esta entrega: esperá a que Farmacia la resuelva'
      using errcode = 'check_violation';
  end if;

  if p_renglones is null or jsonb_typeof(p_renglones) <> 'array' then
    raise exception 'Los renglones no tienen la forma esperada' using errcode = 'check_violation';
  end if;

  for v_r in select * from jsonb_array_elements(p_renglones) loop
    v_med      := (v_r->>'medication_id')::uuid;
    v_correcto := (v_r->>'correcto')::int;
    if v_med is null or v_correcto is null or v_correcto < 0 then
      raise exception 'Cada renglón necesita el medicamento y la cantidad correcta (0 si no se dio)'
        using errcode = 'check_violation';
    end if;
    if v_med = any(v_vistos) then
      raise exception 'Un medicamento aparece dos veces en la corrección' using errcode = 'check_violation';
    end if;
    v_vistos := v_vistos || v_med;
    -- El medicamento tiene que ser del estudio: es lo mismo que exigirá la corrección de Farmacia.
    if not exists (select 1 from public.protocol_medications pm
                    where pm.protocol_id = v_protocol_id and pm.medication_id = v_med) then
      raise exception 'Ese medicamento no es de este estudio' using errcode = 'check_violation';
    end if;
    v_nombre_med := (select m.name from public.medications m where m.id = v_med);
    v_registrado := coalesce((select sum(di.quantity) from public.dispensation_items di
                               where di.dispensation_id = v_disp_id and di.medication_id = v_med), 0)::int;
    -- Igual a lo registrado no es un cambio: no se pide.
    continue when v_correcto = v_registrado;
    v_salida := v_salida || jsonb_build_object(
      'medication_id', v_med, 'medicamento', v_nombre_med, 'registrado', v_registrado, 'correcto', v_correcto);
  end loop;

  if jsonb_array_length(v_salida) = 0 then
    raise exception 'No hay cambios para pedir' using errcode = 'check_violation';
  end if;

  insert into public.dispensation_correction_requests
    (dispensation_id, request_id, renglones, motivo_codigo, motivo_texto, requested_by, requested_by_name)
  values (v_disp_id, p_request_id, v_salida, p_motivo, v_texto,
          auth.uid(), (select u.full_name from public.users u where u.id = auth.uid()))
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.pedir_correccion_entrega(uuid, jsonb, text, text) from public, anon;
grant execute on function public.pedir_correccion_entrega(uuid, jsonb, text, text) to authenticated;


-- 3 · aplicar_pedido_correccion (Farmacia) -----------------------------------------------------
-- La corrección y el «aplicado» en UNA transacción. Los cambios los arma Farmacia (con los lotes): pueden
-- no ser exactamente lo pedido —lo que se asienta es lo que se corrigió de verdad—. Los permisos los
-- vuelve a exigir corregir_entrega_farmacia (líder, alcance).
create or replace function public.aplicar_pedido_correccion(
  p_pedido_id    uuid,
  p_cambios      jsonb,
  p_kits         int,
  p_motivo       text,
  p_motivo_texto text default null)
returns int language plpgsql security definer set search_path = public as $$
declare
  v_disp_id uuid;
  v_estado  text;
  v_n       int;
begin
  if auth.uid() is null then raise exception 'No autenticado' using errcode = '42501'; end if;

  select p.dispensation_id, p.estado into v_disp_id, v_estado
  from public.dispensation_correction_requests p
  where p.id = p_pedido_id
  for update;
  if not found then
    raise exception 'No se encontró el pedido de corrección' using errcode = 'check_violation';
  end if;
  if not ((select public.pharma_sin_recorte()) or public.pharma_alcanza_dispensacion(v_disp_id)) then
    raise exception 'No tenés acceso a este estudio.' using errcode = '42501';
  end if;
  if not public.has_min_role('pharma', 'leader') then
    raise exception 'Sólo el líder de Farmacia puede corregir una entrega' using errcode = '42501';
  end if;
  if v_estado <> 'pendiente' then
    raise exception 'Este pedido de corrección ya se resolvió' using errcode = 'check_violation';
  end if;

  v_n := public.corregir_entrega_farmacia(v_disp_id, p_cambios, p_kits, p_motivo, p_motivo_texto);

  update public.dispensation_correction_requests
     set estado = 'aplicado', resolved_by = auth.uid(),
         resolved_by_name = (select u.full_name from public.users u where u.id = auth.uid()),
         resolved_at = now()
   where id = p_pedido_id;

  return v_n;
end;
$$;

revoke all on function public.aplicar_pedido_correccion(uuid, jsonb, int, text, text) from public, anon;
grant execute on function public.aplicar_pedido_correccion(uuid, jsonb, int, text, text) to authenticated;


-- 4 · descartar_pedido_correccion (Farmacia) ---------------------------------------------------
create or replace function public.descartar_pedido_correccion(p_pedido_id uuid, p_nota text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_disp_id uuid;
  v_estado  text;
  v_nota    text := nullif(btrim(coalesce(p_nota, '')), '');
begin
  if auth.uid() is null then raise exception 'No autenticado' using errcode = '42501'; end if;

  select p.dispensation_id, p.estado into v_disp_id, v_estado
  from public.dispensation_correction_requests p
  where p.id = p_pedido_id
  for update;
  if not found then
    raise exception 'No se encontró el pedido de corrección' using errcode = 'check_violation';
  end if;
  if not ((select public.pharma_sin_recorte()) or public.pharma_alcanza_dispensacion(v_disp_id)) then
    raise exception 'No tenés acceso a este estudio.' using errcode = '42501';
  end if;
  if not public.has_min_role('pharma', 'leader') then
    raise exception 'Sólo el líder de Farmacia puede resolver un pedido de corrección' using errcode = '42501';
  end if;
  if v_estado <> 'pendiente' then
    raise exception 'Este pedido de corrección ya se resolvió' using errcode = 'check_violation';
  end if;
  -- La nota es lo que Coordinación lee en el ticket: un descarte sin porqué no se entiende.
  if v_nota is null then
    raise exception 'Contá por qué no se aplica' using errcode = 'check_violation';
  end if;

  update public.dispensation_correction_requests
     set estado = 'descartado', nota_resolucion = v_nota, resolved_by = auth.uid(),
         resolved_by_name = (select u.full_name from public.users u where u.id = auth.uid()),
         resolved_at = now()
   where id = p_pedido_id;
end;
$$;

revoke all on function public.descartar_pedido_correccion(uuid, text) from public, anon;
grant execute on function public.descartar_pedido_correccion(uuid, text) to authenticated;

notify pgrst, 'reload schema';


-- Verificación (correr aparte, después): tiene que devolver la tabla y funciones = 3.
--   select to_regclass('public.dispensation_correction_requests') as tabla,
--          (select count(*) from pg_proc where proname in
--            ('pedir_correccion_entrega', 'aplicar_pedido_correccion', 'descartar_pedido_correccion')) as funciones;
