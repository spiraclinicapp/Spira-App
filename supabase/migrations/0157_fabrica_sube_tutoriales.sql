-- Spira · Migración 0157 — Una cuenta dedicada sube los videos de los tutoriales, y nada más.
--
-- APLICAR A MANO en el SQL Editor de Supabase (rol postgres), DESPUÉS de la 0156. IDEMPOTENTE.
--
-- ⚠️ ADITIVA: va ANTES de usar `npm run tutoriales:publicar`. Ningún front la pide.
--
-- ⚠️ NUNCA dos signos peso pegados dentro de un comentario (ver CLAUDE.md, 0071).
--
-- POR QUÉ (docs/plan-tutoriales.md, «Publicar»; decisión del Director, 2026-10-14). Hasta ahora el Director subía
-- cada video a mano desde el dashboard. Para que lo haga un comando hace falta una credencial con permiso de
-- escritura en Storage, y la más cómoda —una clave S3— alcanza a TODO el Storage, incluido `ip-docs` (las
-- constancias del IRT, documentos clínicos). Ésta es la opción acotada: una cuenta de Auth dedicada,
-- `tutoriales@fabrica.spira`, que puede SUBIR al bucket `tutoriales` y nada más.
--   · Sólo INSERT: no lee, no reemplaza, no borra. Un video regrabado tiene otra versión, o sea otra ruta: nunca
--     hace falta pisar uno. Leer tampoco: el bucket es público (0156).
--   · Sólo ese bucket: `ip-docs` y cualquier otro quedan fuera.
--   · La cuenta no tiene módulos (`user_module_roles`): en la app no ve nada. Figura en la consola de accesos como
--     una persona más; no hay que darle nada.
--
-- POR QUÉ UNA FUNCIÓN Y NO EL UUID DE LA CUENTA EN LA POLICY. El uuid se conoce recién al crear la cuenta, y en el
-- demo las migraciones corren ANTES de que existan las cuentas (scripts/demo/resetear.mjs). Con la función, el
-- orden no importa: la cuenta se puede crear antes o después de aplicar esto. Pide el mail CONFIRMADO, así una
-- cuenta sin confirmar con ese mail no pasa. `security definer` porque `authenticated` no puede leer
-- `auth.users`; `set search_path` acotado y todo calificado (CLAUDE.md, regla 3).
--
-- La policy pregunta una vez por consulta, no por fila: la función va envuelta en `(select …)` (0146).

create or replace function public.es_fabrica_de_tutoriales()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $f$
  select exists (
    select 1
      from auth.users u
     where u.id = auth.uid()
       and u.email = 'tutoriales@fabrica.spira'
       and u.email_confirmed_at is not null
  );
$f$;

revoke all on function public.es_fabrica_de_tutoriales() from public, anon;
grant execute on function public.es_fabrica_de_tutoriales() to authenticated;

-- Como en la 0071: `storage.objects` es de `supabase_storage_admin`, y según el proyecto `create policy` ahí puede
-- devolver 42501. El bloque absorbe ese error y avisa por NOTICE, que el editor NO siempre muestra: la prueba de
-- que quedó creada es la consulta del final.
do $b$
begin
  drop policy if exists "fabrica sube tutoriales" on storage.objects;
  create policy "fabrica sube tutoriales" on storage.objects for insert to authenticated
    with check (bucket_id = 'tutoriales' and (select public.es_fabrica_de_tutoriales()));
exception when insufficient_privilege then
  raise notice 'PENDIENTE A MANO: no se pudo crear la policy "fabrica sube tutoriales" sobre storage.objects (%). Creala desde Storage › Policies › bucket tutoriales: INSERT, rol authenticated, con la expresión bucket_id = ''tutoriales'' and (select public.es_fabrica_de_tutoriales()).', sqlerrm;
end
$b$;

-- Verificación: tiene que devolver UNA fila, con cmd = INSERT y roles = {authenticated}.
select policyname, cmd, roles, with_check
  from pg_policies
 where schemaname = 'storage' and tablename = 'objects' and policyname = 'fabrica sube tutoriales';
