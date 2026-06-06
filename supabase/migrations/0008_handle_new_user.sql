-- Spira · Migración 0008 — Perfil automático al registrarse (auth.users → public.users)
-- ----------------------------------------------------------------------------
-- Supabase Auth crea al usuario en auth.users, pero NO crea solo su perfil en
-- public.users. Este trigger lo copia automáticamente en cada alta.
-- NO asigna roles a propósito: un usuario nuevo arranca SIN acceso a ningún
-- módulo (lo habilita gerencia vía user_module_roles). Default seguro.
-- ----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.users (id, full_name)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data->>'full_name', ''), split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
