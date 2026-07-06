-- Spira · Migración 0046 — Hardening del search_path de las RPCs de perfil
-- Aplicar A MANO en el SQL Editor (como postgres), después de la 0045. IDEMPOTENTE.
-- ----------------------------------------------------------------------------
-- Las RPCs SECURITY DEFINER de 0045 quedaron con `set search_path = public`, mientras
-- que el estándar del repo (helpers de 0006: has_module/has_role/coordina_visita) usa
-- `set search_path = pg_catalog, public`. Fijar pg_catalog primero es la recomendación
-- para funciones SECURITY DEFINER: evita que un objeto creado en `public` sombree un
-- operador/función de pg_catalog y termine resolviéndose corriendo como owner.
-- Riesgo práctico bajo (el rol `authenticated` no tiene CREATE en public), pero es
-- defensa en profundidad y consistencia con el resto de la base.
-- Solo cambia la cláusula search_path; los cuerpos son idénticos a los de 0045.
-- (Nota: submit_feedback de 0044 tiene el mismo patrón; se puede alinear en un futuro pass.)
-- ============================================================================

create or replace function public.update_my_name(p_name text)
returns void language plpgsql security definer set search_path = pg_catalog, public as $$
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

create or replace function public.update_my_puesto(p_puesto text)
returns void language plpgsql security definer set search_path = pg_catalog, public as $$
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

create or replace function public.stamp_email_change()
returns void language plpgsql security definer set search_path = pg_catalog, public as $$
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
