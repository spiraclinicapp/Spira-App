-- 0129 · Feedback: dónde estaba parada la persona que reporta
--
-- El feedback ya guardaba módulo, ruta y versión (0044). Faltaba el detalle fino: qué paciente, qué
-- visita, qué paso del wizard estaba mirando quien reportó. Sin eso, quien supervisa no sabe en qué
-- punto se detectó el problema — que es exactamente el pedido que originó esta migración.
--
-- ADITIVA y compatible hacia atrás: el front desplegado sigue llamando a `submit_feedback` con cinco
-- argumentos, que es lo que garantizan los defaults de los dos nuevos. Por eso va ANTES del front.
--
-- Diseño: docs/superpowers/specs/2026-09-17-feedback-con-lugar-design.md

-- 1 · Columnas -----------------------------------------------------------------
alter table public.feedback
  add column if not exists place_label  text,
  add column if not exists place_target jsonb,
  add column if not exists seen_at      timestamptz,
  add column if not exists seen_by      uuid references public.users(id);

comment on column public.feedback.place_label is 'Migaja legible del lugar al enviar: "Coordinación > Estudios y pacientes > Juan Pérez · 4022001". Null en el feedback anterior a esta migración, que sigue mostrando su `route`.';
comment on column public.feedback.place_target is 'NavTarget + moduleKey/subKey para volver a ese lugar desde la bandeja. Lo consume la app para navegar, no el SQL para filtrar: por eso es jsonb y no columnas sueltas. Null cuando la pantalla no publicó ninguna entidad.';
comment on column public.feedback.seen_at is 'Cuándo lo marcó como visto quien supervisa. Se usa desde la entrega 2 (bandeja en Ajustes); la columna entra acá para no pedir una segunda ida al dashboard por dos campos que mientras tanto duermen.';
comment on column public.feedback.seen_by is 'Quién lo marcó como visto. Ver seen_at.';

-- 2 · RPC de envío -------------------------------------------------------------
-- Suma dos parámetros, así que CAMBIA LA FIRMA: sin este drop, `create or replace` deja viva la
-- versión de cinco argumentos y la llamada con argumentos nombrados se vuelve ambigua. Es lo mismo
-- que hizo la 0128 con create_reception al sumarle p_pedido_id.
drop function if exists public.submit_feedback(text, text, text, text, text);

create or replace function public.submit_feedback(
  p_type text, p_message text, p_module text default null,
  p_version text default null, p_route text default null,
  p_place_label text default null, p_place_target jsonb default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Tu sesión venció.' using errcode = '28000';
  end if;
  if lower(coalesce(p_type, '')) not in ('sugerencia', 'problema', 'idea') then
    raise exception 'Tipo de feedback inválido.' using errcode = '22023';
  end if;
  if btrim(coalesce(p_message, '')) = '' then
    raise exception 'El mensaje está vacío.' using errcode = '23502';
  end if;
  -- anti-flooding: una guarda simple por usuario (no hace falta infra).
  if exists (select 1 from public.feedback where user_id = v_uid and created_at > now() - interval '10 seconds') then
    raise exception 'Esperá unos segundos antes de enviar otro feedback.' using errcode = 'P0001';
  end if;
  insert into public.feedback (user_id, type, message, module, app_version, route, place_label, place_target)
  values (v_uid, lower(p_type), btrim(p_message), p_module, p_version, p_route,
          nullif(btrim(coalesce(p_place_label, '')), ''), p_place_target);
end;
$$;

comment on function public.submit_feedback is 'Envía feedback del usuario actual (actor server-side vía auth.uid()). Rate-limit 10s. SECURITY DEFINER. 0044; el lugar desde donde se reportó se suma en la 0129.';

grant execute on function
  public.submit_feedback(text, text, text, text, text, text, jsonb)
  to authenticated;
