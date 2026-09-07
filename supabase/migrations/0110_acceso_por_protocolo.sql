-- ============================================================================
-- 0110 · Elegir qué protocolos ve cada persona, desde Ajustes
--
-- Plan: docs/plan-ajustes-capas-protocolos-plataformas.md (tanda 2, piezas E4).
--
-- ── EL HUECO ──
-- `protocol_coordinators` existe desde la 0002 y es EL modelo de scoping de Coordinación: su
-- propio comentario dice "Define qué pacientes ve cada una", y toda la RLS del módulo cuelga de
-- `is_assigned_coordinator`. Nunca tuvo pantalla: el front sólo lee sus propias filas
-- (`useMyCoordinations`) y las asignaciones se cargan a mano por SQL.
--
-- Ponerle pantalla choca con dos cosas:
--
--   1. LA LLAVE. La policy de escritura es "lideres asignan", endurecida en la 0009:100-102 a
--      `has_min_role('track','leader')` bajo el rótulo explícito de CARVE-OUT DE SEGURIDAD ("un
--      operator no debe auto-asignarse scope"). La consola de Ajustes es de GERENCIA, que no
--      cumple esa condición. Sin esta migración el selector guardaría CERO FILAS EN SILENCIO —
--      la RLS filtra callada, y 0 filas afectadas es "sin permiso", no éxito.
--
--      No se amplía la policy: se agrega un RPC `security definer` con la autorización adentro,
--      espejo de `set_module_access` (0096 §3). Así el carve-out sigue intacto —nadie gana
--      escritura directa sobre la tabla— y de paso se hereda el compare-and-swap, que es lo que
--      impide que dos gerencias editando a la vez se pisen sin enterarse.
--
--   2. LA AUDITORÍA. `protocol_coordinators` es la ÚNICA pieza del control de acceso SIN trigger
--      de auditoría: la 0003:217-223 audita protocols, patients, enrollments, medications,
--      requests, dispensations y user_module_roles — y a ella no. Hoy casi no se escribe (SQL a
--      mano, de a una vez); darle pantalla multiplica las escrituras y convierte el hueco en un
--      problema real. En un sistema ANMAT / ICH-GCP, "quién le dio acceso a los pacientes de este
--      protocolo" no puede ser irrecuperable.
--
-- ── POR QUÉ UNA VISTA NUEVA Y NO EXTENDER v_access_audit ──
-- Extender `v_access_audit` (0096 §2) sería BREAKING para el front que hoy está en producción:
-- sus filas nuevas llegarían con `module = null` y `auditLine` (src/lib/roles.ts) las redactaría
-- como «Fulana le dio acceso a un módulo a Mengana» — una frase impecable que dice algo que no
-- pasó, que es exactamente la falla contra la que existe el test de esa función. Con vista
-- aparte esta migración queda PURAMENTE ADITIVA y el front viejo no ve una sola fila nueva.
--
-- ADITIVA y NO BREAKING: un RPC, un trigger y una vista, todos nuevos. Va ANTES del front.
-- APLICAR: a mano en el SQL Editor de Supabase (rol postgres), DESPUÉS de la 0109. IDEMPOTENTE.
-- Registrar en supabase/README.md al confirmarse en prod.
-- ============================================================================


-- 1 · Auditoría de las asignaciones ------------------------------------------------------------
-- Mismo `audit_row()` genérico de la 0003 que ya usan las otras siete tablas: escribe en
-- `audit_log` el `to_jsonb` de la fila, o sea id + protocol_id + user_id + assigned_at. Con eso
-- alcanza para reconstruir quién le dio o le quitó qué protocolo a quién.
drop trigger if exists trg_audit_protocol_coordinators on public.protocol_coordinators;
create trigger trg_audit_protocol_coordinators
  after insert or update or delete on public.protocol_coordinators
  for each row execute function public.audit_row();


-- 2 · Historial legible de las asignaciones ----------------------------------------------------
-- `security_invoker = true`, igual que `v_access_audit` (0096): hereda la policy de `audit_log`
-- ("gerencia ve auditoria", 0006), así que quien no es gerencia recibe cero filas. La vista NO
-- decide permisos; sólo traduce.
--
-- El protocolo se resuelve con LEFT JOIN a propósito: un protocolo borrado deja sus líneas de
-- auditoría en pie —`audit_log` es inmutable— y perderlas al leer sería recortar el registro. El
-- front redacta ese caso con el código en null.
create or replace view public.v_protocol_access_audit
with (security_invoker = true) as
select
  l.id,
  l.occurred_at,
  l.action,
  coalesce(l.after_data ->> 'user_id',     l.before_data ->> 'user_id')::uuid     as target_user_id,
  coalesce(l.after_data ->> 'protocol_id', l.before_data ->> 'protocol_id')::uuid as protocol_id,
  p.code as protocol_code,
  p.name as protocol_name,
  l.actor_id,
  actor.full_name  as actor_name,
  target.full_name as target_name
from public.audit_log l
left join public.users actor
       on actor.id = l.actor_id
left join public.users target
       on target.id = coalesce(l.after_data ->> 'user_id', l.before_data ->> 'user_id')::uuid
left join public.protocols p
       on p.id = coalesce(l.after_data ->> 'protocol_id', l.before_data ->> 'protocol_id')::uuid
where l.entity_type = 'protocol_coordinators';

comment on view public.v_protocol_access_audit is
  'Historial legible de quién asignó o desasignó a quién en qué protocolo, derivado de audit_log '
  '(lo escribe trg_audit_protocol_coordinators desde la 0110). Vista APARTE de v_access_audit a '
  'propósito: sumarlas habría sido breaking para el front desplegado, que redactaría estas filas '
  'como si fueran de módulo. security_invoker → sólo gerencia. 0110.';

revoke all on public.v_protocol_access_audit from anon;
grant select on public.v_protocol_access_audit to authenticated;


-- 3 · Dar o quitar un protocolo a una persona --------------------------------------------------
-- p_asignado = el estado DESEADO (true = que lo vea, false = que no).
-- p_expected = lo que el cliente creía vigente. SIEMPRE se manda: es el compare-and-swap. Sin él,
--   dos gerencias editando a la vez se pisan y la que guarda última gana en silencio — y en
--   permisos "en silencio" significa que alguien conserva un acceso que se creyó revocado.
--
-- Booleanos y no un array con el conjunto entero: el editor de accesos ya manda UNA llamada por
-- cambio (el `for` de AccesoEditor.guardar), y con un conjunto completo el compare-and-swap
-- tendría que comparar listas — dos gerencias tocando protocolos DISTINTOS de la misma persona
-- chocarían sin motivo.
create or replace function public.set_protocol_access(
  p_user_id     uuid,
  p_protocol_id uuid,
  p_asignado    boolean,
  p_expected    boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_uid    uuid := auth.uid();
  v_actual boolean;
begin
  -- 3.1 · Sesión
  if v_uid is null then
    raise exception 'Tu sesión venció.' using errcode = '28000';
  end if;

  -- 3.2 · Permiso. VA ACÁ Y NO EN UNA POLICY: la función es SECURITY DEFINER, corre con los
  -- permisos del dueño y la RLS no la mira. Sin esta verificación, cualquier autenticado podría
  -- asignarse todos los protocolos con una llamada a PostgREST — que es justamente el scope de
  -- pacientes que el carve-out de la 0009 protege.
  if not public.has_module('gerencia') then
    raise exception 'No tenés permiso para cambiar accesos.' using errcode = '42501';
  end if;

  -- 3.3 · Que existan las dos puntas. Sin esto fallaría igual por la FK, pero con un mensaje de
  -- Postgres en inglés nombrando una constraint.
  if not exists (select 1 from public.users u where u.id = p_user_id) then
    raise exception 'Esa cuenta ya no existe. Refrescá la lista.' using errcode = '23503';
  end if;
  if not exists (select 1 from public.protocols pr where pr.id = p_protocol_id) then
    raise exception 'Ese estudio ya no existe. Refrescá la lista.' using errcode = '23503';
  end if;

  select exists (
    select 1 from public.protocol_coordinators pc
    where pc.user_id = p_user_id and pc.protocol_id = p_protocol_id
  ) into v_actual;

  -- 3.4 · Compare-and-swap. Acá los dos lados son booleanos no nulos, así que `is distinct from`
  -- se comporta como `<>`; se usa igual para que el guard se lea idéntico al de
  -- `set_module_access` (0096 §3.4), donde el null SÍ importa.
  if v_actual is distinct from p_expected then
    raise exception 'Alguien más cambió este acceso mientras lo editabas. Refrescá y volvé a mirar.'
      using errcode = 'P0001';
  end if;

  -- 3.5 · Nada que cambiar: se sale sin escribir. Un historial con líneas de cambios que no
  -- ocurrieron es un historial que nadie lee.
  if v_actual = p_asignado then
    return;
  end if;

  -- 3.6 · Escribir. El trigger de arriba se encarga del registro.
  --
  -- NO hay guard de "tiene que quedar al menos una coordinadora" (decisión del Director,
  -- 2026-09-07). Parecería el espejo del guard del último administrador, y sería un error: si la
  -- única coordinadora de un estudio se va del centro, ese guard impediría revocarle el acceso
  -- hasta conseguirle reemplazo — un control de integridad convertido en agujero de seguridad. Y
  -- un estudio cerrado (`protocols.status`) puede quedar sin coordinadora, que es correcto.
  -- La consecuencia se AVISA en pantalla antes de guardar, en el bloque "Con esto ve…".
  if p_asignado then
    insert into public.protocol_coordinators (protocol_id, user_id)
    values (p_protocol_id, p_user_id)
    on conflict (protocol_id, user_id) do nothing;
  else
    delete from public.protocol_coordinators pc
    where pc.user_id = p_user_id and pc.protocol_id = p_protocol_id;
  end if;
end;
$fn$;

comment on function public.set_protocol_access is
  'Da (p_asignado true) o quita el acceso de una persona a UN protocolo. Sólo gerencia, verificado '
  'adentro porque es security definer. Con compare-and-swap contra p_expected. Existe porque la '
  'policy "lideres asignan" (carve-out de la 0009) pide track-leader y la consola de accesos es de '
  'gerencia. La auditoría la escribe trg_audit_protocol_coordinators. 0110.';

grant execute on function public.set_protocol_access(uuid, uuid, boolean, boolean) to authenticated;


-- 4 · Que gerencia pueda leer las asignaciones de CUALQUIERA ------------------------------------
-- La policy "ver asignaciones" (0006:104-105) ya contempla a gerencia
-- (`user_id = auth.uid() or has_role('track','leader') or has_module('gerencia')`), así que la
-- lectura del bloque nuevo funciona sin tocar nada. Se deja escrito para que quien venga no la
-- busque: no falta un `alter policy` acá.

notify pgrst, 'reload schema';
