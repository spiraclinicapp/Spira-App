-- Spira · Migración 0045 — Perfil editable ("Mi cuenta")
-- Aplicar A MANO en el SQL Editor (como postgres), después de la 0044. IDEMPOTENTE.
-- ----------------------------------------------------------------------------
-- "Mi cuenta" pasa a ser editable de verdad, con reglas server-side (no se pueden
-- saltear desde el front):
--   · NOMBRE: se puede cambiar 1 vez cada 30 días (RPC con guarda + timestamp).
--   · CORREO: idem 30 días. El cambio real lo hace Supabase Auth (con confirmación
--     por mail); acá solo gateamos y sellamos el timestamp (guarda best-effort).
--   · PUESTO: título/rol de puesto — COSMÉTICO, NO es nivel de acceso — de un catálogo.
--   · CENTRO: forzado; se setea al crear la cuenta (default) y es de SOLO LECTURA.
-- Además se saca el UPDATE directo del perfil propio (RLS de 0006) y todo pasa por
-- RPCs, para que esas reglas no se puedan evitar con un update crudo.
-- ⚠️ Seguridad: el PUESTO NO toca user_module_roles. El nivel de acceso real lo
--    sigue manejando gerencia; un usuario nunca se edita su propio acceso.
-- ============================================================================

-- 1 · Columnas nuevas en users ----------------------------------------------
alter table public.users add column if not exists puesto           text;
alter table public.users add column if not exists centro           text not null default 'Fundación Scherbovsky';
alter table public.users add column if not exists name_changed_at  timestamptz;
alter table public.users add column if not exists email_changed_at timestamptz;

comment on column public.users.puesto           is 'Título/puesto (cosmético; NO es nivel de acceso). Catálogo validado en update_my_puesto. 0045.';
comment on column public.users.centro           is 'Centro asociado, forzado; se setea al crear la cuenta (default) y es de solo lectura. 0045.';
comment on column public.users.name_changed_at  is 'Último cambio de nombre (regla 1/30 días). 0045.';
comment on column public.users.email_changed_at is 'Último cambio de correo (guarda 1/30 días, best-effort). 0045.';

-- 2 · RLS: sacar el UPDATE directo del perfil propio (ahora todo por RPC) ----
-- La policy de SELECT "perfil propio: ver" se MANTIENE (el usuario lee su fila).
drop policy if exists "perfil propio: editar" on public.users;

-- 3 · RPC: cambiar nombre (regla dura de 30 días) ---------------------------
create or replace function public.update_my_name(p_name text)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_last timestamptz;
begin
  if v_uid is null then raise exception 'Tu sesión venció.' using errcode = '28000'; end if;
  if btrim(coalesce(p_name, '')) = '' then
    raise exception 'El nombre no puede quedar vacío.' using errcode = '23502';
  end if;
  select name_changed_at into v_last from public.users where id = v_uid;
  if v_last is not null and v_last > now() - interval '30 days' then
    raise exception 'Podés cambiar el nombre una vez cada 30 días. Vas a poder de nuevo el %.',
      to_char(v_last + interval '30 days', 'DD/MM/YYYY') using errcode = 'P0001';
  end if;
  update public.users set full_name = btrim(p_name), name_changed_at = now() where id = v_uid;
end; $$;
comment on function public.update_my_name is 'Cambia el nombre del usuario actual; regla 1 cambio/30 días. SECURITY DEFINER. 0045.';

-- 4 · RPC: cambiar puesto (catálogo; cosmético, sin límite de tiempo) --------
-- Mantener el catálogo sincronizado con el desplegable del front (AccountSection).
create or replace function public.update_my_puesto(p_puesto text)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Tu sesión venció.' using errcode = '28000'; end if;
  if p_puesto is not null and p_puesto not in (
    'Coordinadora', 'Investigador principal', 'Data manager', 'Farmacéutico', 'Enfermería', 'Administración'
  ) then
    raise exception 'Puesto inválido.' using errcode = '22023';
  end if;
  update public.users set puesto = p_puesto where id = v_uid;
end; $$;
comment on function public.update_my_puesto is 'Cambia el puesto (título cosmético) del usuario actual, validado contra el catálogo. NO toca acceso. 0045.';

-- 5 · RPC: sellar cambio de correo (guarda 30 días) -------------------------
-- El cambio REAL de correo lo hace supabase.auth.updateUser (con confirmación por
-- mail). Esta función gatea la regla de 30 días y sella el timestamp; el front la
-- llama ANTES de disparar el cambio en Auth.
create or replace function public.stamp_email_change()
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_last timestamptz;
begin
  if v_uid is null then raise exception 'Tu sesión venció.' using errcode = '28000'; end if;
  select email_changed_at into v_last from public.users where id = v_uid;
  if v_last is not null and v_last > now() - interval '30 days' then
    raise exception 'Podés cambiar el correo una vez cada 30 días. Vas a poder de nuevo el %.',
      to_char(v_last + interval '30 days', 'DD/MM/YYYY') using errcode = 'P0001';
  end if;
  update public.users set email_changed_at = now() where id = v_uid;
end; $$;
comment on function public.stamp_email_change is 'Gatea y sella el cambio de correo (1/30 días). El cambio real lo hace Auth con confirmación. SECURITY DEFINER. 0045.';

-- 6 · Grants -----------------------------------------------------------------
grant execute on function public.update_my_name(text)   to authenticated;
grant execute on function public.update_my_puesto(text) to authenticated;
grant execute on function public.stamp_email_change()   to authenticated;
