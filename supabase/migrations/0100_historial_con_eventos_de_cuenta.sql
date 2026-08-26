-- Spira · Migración 0100 — El historial también cuenta el alta, la baja y la eliminación
-- Aplicar A MANO en el SQL Editor (como postgres), después de la 0099.  IDEMPOTENTE.
-- ============================================================================
-- ⚠️⚠️  ESTA VA **DESPUÉS** DEL DEPLOY. ES LA ÚNICA DE LA SERIE QUE VA AL REVÉS.  ⚠️⚠️
--
-- Las 0097, 0098 y 0099 eran aditivas y se aplicaban antes. Ésta NO: reescribe `v_access_audit`,
-- que el front YA CONSULTA (`useAccessAudit`, en la ficha de cada persona). Desde que se aplique,
-- la vista empieza a devolver filas con `module` y `role_before/after` en NULL —los eventos de
-- cuenta no son de un módulo—, y el código desplegado hoy no sabe redactarlas: `auditLine` cae a su
-- rama de UPDATE y escribe "volvió a guardar el acceso de X a un módulo, sin cambiar el nivel (—)",
-- que es una frase falsa en el registro de auditoría de un sistema clínico.
--
-- O sea: aplicarla antes no rompe la pantalla, hace algo peor — la deja MINTIENDO.
--
-- Ya pasó dos veces al revés (0068 el 2026-08-05, 0092 el 2026-08-23) y las dos veces el aviso
-- estaba adentro del archivo, que es donde se lee TARDE: para cuando lo abrís, ya lo abriste para
-- correrlo. Por eso este orden se avisa en el chat, no sólo acá.
--
--   1 · Mergear el PR y esperar a que Vercel termine el deploy de `main`.
--   2 · RECIÉN AHÍ correr este archivo.
-- ============================================================================

-- Reemplaza la definición de la 0096. Los cambios son tres y están marcados abajo.
create or replace view public.v_access_audit
with (security_invoker = true) as
select
  l.id,
  l.occurred_at,
  l.action,

  -- (1) De dónde sale a QUIÉN le pasó. Para user_module_roles, del payload de la fila de rol; para
  -- un evento de cuenta, de entity_id — que es la persona misma, porque la entidad ES la cuenta.
  case
    when l.entity_type = 'users' then l.entity_id
    else coalesce(l.after_data ->> 'user_id', l.before_data ->> 'user_id')::uuid
  end as target_user_id,

  -- (2) Los eventos de cuenta no son de ningún módulo ni tienen nivel: van en null, y el front los
  -- redacta por su `action`.
  case when l.entity_type = 'users' then null
       else coalesce(l.after_data ->> 'module', l.before_data ->> 'module') end as module,
  case when l.entity_type = 'users' then null else l.before_data ->> 'role' end as role_before,
  case when l.entity_type = 'users' then null else l.after_data  ->> 'role' end as role_after,

  l.actor_id,
  actor.full_name as actor_name,

  -- (3) El nombre del objetivo, con respaldo en el payload. Para una ELIMINACION el join no puede
  -- devolver nada —la fila de `users` ya no existe— y sin esto el historial diría "una cuenta que
  -- ya no existe", justo en la única línea que prueba que existió. El nombre viajó en el payload
  -- por eso (0099).
  coalesce(
    target.full_name,
    l.before_data ->> 'full_name',
    l.after_data  ->> 'full_name'
  ) as target_name

from public.audit_log l
left join public.users actor
       on actor.id = l.actor_id
left join public.users target
       on target.id = case
            when l.entity_type = 'users' then l.entity_id
            else coalesce(l.after_data ->> 'user_id', l.before_data ->> 'user_id')::uuid
          end
where l.entity_type = 'user_module_roles'
   -- El filtro por `action` no es decorativo: `users` podría recibir otras líneas de auditoría el
   -- día que se le ponga un trigger genérico, y el historial de accesos no es el lugar para un
   -- cambio de nombre o de puesto. Se listan las tres que este historial sabe contar.
   or (l.entity_type = 'users' and l.action in ('ALTA', 'BAJA', 'ELIMINACION'));

comment on view public.v_access_audit is
  'Historial legible de accesos: los cambios de módulo (que escribe trg_audit_module_roles desde 0003) más el alta, la baja y la eliminación de la cuenta (0098 y 0099). Sólo lectura y sólo para gerencia, por la policy "gerencia ve auditoria" (0006). El target_name cae al payload cuando la cuenta ya no existe. 0096, ampliada en 0100.';
