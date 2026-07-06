-- Spira · Migración 0044 — Feedback ("Acerca de" → "Dar feedback")
-- Aplicar A MANO en el SQL Editor (como postgres), después de la 0043. IDEMPOTENTE.
-- ----------------------------------------------------------------------------
-- El botón «i» al pie del rail abre el popover "Acerca de Spira"; desde ahí se
-- abre "Dar feedback". El envío guarda tipo + mensaje + contexto (módulo, versión,
-- ruta) del usuario actual. El actor lo fija el server con auth.uid() (anti-spoof);
-- la lectura es solo para gerencia (mismo criterio que audit_log).
-- ============================================================================

-- 1 · Tabla ------------------------------------------------------------------
create table if not exists public.feedback (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references public.users(id) on delete cascade,
  type        text not null check (type in ('sugerencia', 'problema', 'idea')),
  message     text not null check (char_length(message) between 1 and 2000),
  module      text,            -- mod.key al enviar
  app_version text,            -- __APP_VERSION__ del cliente (telemetría; spoofeable, no es autorización)
  route       text,            -- "<mod>/<sub>" (el shell navega por estado, no por URL)
  created_at  timestamptz not null default now()
);
comment on table public.feedback is 'Feedback de usuarios (sugerencia/problema/idea) + contexto autoadjuntado. El actor lo fija el server. 0044.';
create index if not exists feedback_created_at_idx on public.feedback (created_at desc);

-- 2 · RLS --------------------------------------------------------------------
alter table public.feedback enable row level security;
-- SELECT: solo gerencia (como audit_log). El alta NO va por policy: solo por el RPC de abajo.
drop policy if exists "gerencia ve feedback" on public.feedback;
create policy "gerencia ve feedback" on public.feedback for select using (public.has_module('gerencia'));

-- 3 · RPC de envío -----------------------------------------------------------
-- Fija user_id = auth.uid() (anti-spoof). Valida tipo y mensaje. Rate-limit: 1 envío / 10s por usuario.
create or replace function public.submit_feedback(
  p_type text, p_message text, p_module text default null,
  p_version text default null, p_route text default null)
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
  insert into public.feedback (user_id, type, message, module, app_version, route)
  values (v_uid, lower(p_type), btrim(p_message), p_module, p_version, p_route);
end;
$$;
comment on function public.submit_feedback is 'Envía feedback del usuario actual (actor server-side vía auth.uid()). Rate-limit 10s. SECURITY DEFINER. 0044.';

grant execute on function
  public.submit_feedback(text, text, text, text, text)
  to authenticated;
