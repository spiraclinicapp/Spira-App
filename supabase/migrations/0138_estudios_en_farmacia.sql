-- ============================================================================
-- 0138 · Estudios en Farmacia: el recorte por protocolo
--
-- Plan: docs/plan-estudios-en-farmacia.md (PR 1).
--
-- ── QUÉ HACE ──
-- Farmacia es central desde el día uno: sus policies abren con has_module('pharma') a secas, sin
-- mirar de qué estudio es la fila. Esta migración le pone la perilla que Coordinación tiene desde
-- la 0002: gerencia puede acotar a una persona a una LISTA CERRADA de estudios.
--
-- Dos estados por persona, y la bandera es explícita a propósito:
--   · ve_todos_los_estudios = true  → ve todo (lo predeterminado, y como queda TODO EL MUNDO hoy)
--   · ve_todos_los_estudios = false → ve sólo los de pharma_protocol_access, y los estudios que se
--     creen más adelante TAMPOCO los ve hasta que alguien se los dé.
--
-- Sin la bandera, el estado se calcularía ("si no tiene filas, ve todo") y quitarle a alguien su
-- último estudio lo devolvería a ver el centro entero, sin que nadie lo decidiera y sin un solo
-- error. Una ampliación de permisos en silencio es lo que no puede pasar acá.
--
-- ── ADITIVA Y NO BREAKING ──
-- Mientras nadie esté acotado, ninguna policy nueva cambia una sola fila: pharma_sin_recorte()
-- devuelve true para todos. Por eso va ANTES del deploy del front. Lo que no funciona sin ella es
-- la consola nueva.
--
-- ── ALCANCE DE ESTE ARCHIVO ──
-- Recorta SÓLO los estudios y sus pacientes (PR 1). El stock, las recepciones, las dispensaciones,
-- la reposición y las estadísticas van en las PRs 2 a 4 (migraciones 0139 a 0141), que son puras
-- policies porque las funciones de alcance quedan definidas acá.
--
-- ⚠️ REGLA OPERATIVA: NO acotar a nadie en prod hasta que la 0141 esté aplicada. Entre medio el
-- recorte es parcial —la grilla filtra pero el stock no— y una restricción a medias promete un
-- candado que todavía no cierra.
--
-- APLICAR: a mano en el SQL Editor de Supabase (rol postgres), DESPUÉS de la 0137. IDEMPOTENTE.
-- Registrar en supabase/README.md al confirmarse en prod.
-- ============================================================================


-- 1 · El interruptor -----------------------------------------------------------------------------
-- Va en user_module_roles y no en una tabla propia: es un modificador DEL ROL, la tabla ya tiene
-- exactamente una fila por (persona, modulo) por su unique de la 0002, y ya la audita
-- trg_audit_module_roles (0003), así que el cambio queda registrado sin trigger nuevo.
--
-- CONSECUENCIA ASUMIDA (y documentada en el plan): si se le quita Farmacia a alguien y se le vuelve
-- a dar, la fila se borra y vuelve con true. El recorte se pierde. Queda en el audit_log y gerencia
-- ve la tarjeta en "ve todos" al momento de re-darle el módulo, pero hay que saberlo.
--
-- Coordinación NO lee esta columna: es lista cerrada siempre (protocol_coordinators + 0006).
alter table public.user_module_roles
  add column if not exists ve_todos_los_estudios boolean not null default true;

comment on column public.user_module_roles.ve_todos_los_estudios is
  'Farmacia: true = ve todos los estudios (predeterminado). false = ve solo los de '
  'pharma_protocol_access, y los que se creen despues TAMPOCO. Coordinacion no la lee. 0138.';


-- 2 · La lista cerrada ---------------------------------------------------------------------------
-- La columna `id` NO es decorativa: audit_row() (0003) hace
--   case when tg_op = 'DELETE' then old.id else new.id end
-- y Postgres resuelve old.id AL PLANIFICAR, sin importar por que rama vaya a pasar. Una tabla
-- auditada sin `id` revienta en la primera escritura con 42703, senalando el cuerpo de audit_row y
-- no esta tabla. Paso con la 0111.
--
-- El default es gen_random_uuid() (pg_catalog) y no uuid_generate_v4() (schema extensions): la
-- regla es una sola para todo el archivo, porque mas abajo hay funciones con search_path acotado
-- donde sin calificar aplica en verde y revienta en la primera llamada con 42883 (paso con la 0113).
create table if not exists public.pharma_protocol_access (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users(id)     on delete cascade,
  protocol_id uuid not null references public.protocols(id) on delete cascade,
  assigned_at timestamptz not null default now(),
  unique (user_id, protocol_id)
);

create index if not exists ix_ppa_user     on public.pharma_protocol_access (user_id);
create index if not exists ix_ppa_protocol on public.pharma_protocol_access (protocol_id);

comment on table public.pharma_protocol_access is
  'Que estudios ve en FARMACIA una persona acotada. Solo se lee cuando '
  'user_module_roles.ve_todos_los_estudios es false. Se escribe UNICAMENTE por '
  'set_pharma_protocol_access (security definer): no hay policy de escritura. 0138.';

alter table public.pharma_protocol_access enable row level security;

-- Lectura: lo propio, o todo si administra accesos. La consola de gerencia las necesita enteras
-- para pintar los chips de cualquiera.
--
-- NO HAY POLICY DE ESCRITURA, y es deliberado: una que aceptara a gerencia dejaria de paso que un
-- operator de Farmacia se auto-asigne estudios por PostgREST. Se escribe solo por el RPC, que lleva
-- la autorizacion adentro. Mismo criterio que la 0110 con protocol_coordinators.
drop policy if exists "ver alcance de farmacia" on public.pharma_protocol_access;
create policy "ver alcance de farmacia" on public.pharma_protocol_access for select
  using (user_id = auth.uid() or public.has_module('gerencia'));


-- 3 · Las funciones de alcance -------------------------------------------------------------------
-- OJO CON LOS NOMBRES: dicen "alcanza", no "ve". NINGUNA comprueba el modulo ni el nivel, y eso es
-- a proposito.
--
-- El barrido de las policies tiene que SUMAR esta condicion, nunca reemplazar la que ya estaba:
--   ANTES:   using (has_module('pharma') or has_module('gerencia'))
--   DESPUES: using ((has_module('pharma') and pharma_alcanza_protocolo(protocol_id))
--                   or has_module('gerencia'))
-- Once de las 42 policies a recortar comprueban NIVEL (has_min_role('pharma','operator')) y no
-- modulo. Si el barrido las sustituye, el recorte queda bien y el nivel se pierde: un viewer de
-- Farmacia ganaria escritura sobre los pedidos de reposicion. Un candado nuevo que abre otro.
--
-- Y la clausula de gerencia queda SIEMPRE afuera del and: gerencia ve todo el centro, igual que en
-- Coordinacion.

-- Esta persona, ¿NO tiene recorte? true = ve todos los estudios.
-- Separada de las demas porque es el atajo: para el 100% de la gente de hoy devuelve true y ninguna
-- de las otras siete llega a tocar una tabla.
create or replace function public.pharma_sin_recorte()
returns boolean language sql security definer stable
set search_path = pg_catalog, public as $fn$
  select coalesce(
    (select r.ve_todos_los_estudios
       from public.user_module_roles r
      where r.user_id = auth.uid() and r.module = 'pharma'), true);
$fn$;

comment on function public.pharma_sin_recorte is
  'true = la persona ve todos los estudios en Farmacia (lo predeterminado, y lo que devuelve '
  'tambien para quien no tiene el modulo). 0138.';

-- ¿Este protocolo esta dentro del alcance de Farmacia de quien consulta?
create or replace function public.pharma_alcanza_protocolo(proto_id uuid)
returns boolean language sql security definer stable
set search_path = pg_catalog, public as $fn$
  select public.pharma_sin_recorte() or exists (
    select 1 from public.pharma_protocol_access a
     where a.user_id = auth.uid() and a.protocol_id = proto_id);
$fn$;

comment on function public.pharma_alcanza_protocolo is
  'Alcance por protocolo en Farmacia. NO comprueba el modulo ni el nivel: se SUMA a la condicion '
  'que la policy ya tenia, nunca la reemplaza. 0138.';

-- ¿Alcanza a este paciente? Si alcanza ALGUNO de sus estudios.
--
-- EL `exists` NO ES COSMETICO: hay pacientes inscriptos en DOS protocolos en produccion. Con un `=`
-- contra el primer enrolamiento, uno de LTS17231 y ACT18301 apareceria o desapareceria segun el
-- orden que devolviera la consulta — la misma trampa que hace que todo enrollments[0] del front
-- este mal.
--
-- Y el atajo de pharma_sin_recorte() va PRIMERO por una razon de correccion, no de velocidad: un
-- paciente SIN ningun enrolamiento daria false por el exists, y sin el atajo dejaria de verlo
-- tambien quien no tiene recorte. Seria una regresion silenciosa para todo el mundo.
create or replace function public.pharma_alcanza_paciente(p_patient_id uuid)
returns boolean language sql security definer stable
set search_path = pg_catalog, public as $fn$
  select public.pharma_sin_recorte() or exists (
    select 1 from public.enrollments e
     where e.patient_id = p_patient_id
       and public.pharma_alcanza_protocolo(e.protocol_id));
$fn$;

comment on function public.pharma_alcanza_paciente is
  'Alcanza al paciente si alcanza ALGUNO de sus estudios (hay pacientes en dos protocolos). 0138.';

-- Las cinco transitivas que usan las PRs 2, 3 y 4. Se definen ACA para que esas migraciones sean
-- puras policies: un archivo que solo agrega condiciones es mucho mas facil de revisar que uno que
-- ademas estrena funciones.
create or replace function public.pharma_alcanza_lote(p_lot_id uuid)
returns boolean language sql security definer stable
set search_path = pg_catalog, public as $fn$
  select public.pharma_sin_recorte() or exists (
    select 1 from public.medication_lots l
     where l.id = p_lot_id and public.pharma_alcanza_protocolo(l.protocol_id));
$fn$;

create or replace function public.pharma_alcanza_recepcion(p_reception_id uuid)
returns boolean language sql security definer stable
set search_path = pg_catalog, public as $fn$
  select public.pharma_sin_recorte() or exists (
    select 1 from public.medication_receptions r
     where r.id = p_reception_id and public.pharma_alcanza_protocolo(r.protocol_id));
$fn$;

-- dispensation_requests.protocol_id lo sella create_dispensation_request desde la 0071, y esta
-- desnormalizado justamente porque Farmacia NO puede leer patient_visits: un join para llegar al
-- protocolo devolveria cero filas en silencio.
create or replace function public.pharma_alcanza_solicitud(p_request_id uuid)
returns boolean language sql security definer stable
set search_path = pg_catalog, public as $fn$
  select public.pharma_sin_recorte() or exists (
    select 1 from public.dispensation_requests dr
     where dr.id = p_request_id and public.pharma_alcanza_protocolo(dr.protocol_id));
$fn$;

create or replace function public.pharma_alcanza_dispensacion(p_dispensation_id uuid)
returns boolean language sql security definer stable
set search_path = pg_catalog, public as $fn$
  select public.pharma_sin_recorte() or exists (
    select 1 from public.dispensations d
     where d.id = p_dispensation_id and public.pharma_alcanza_solicitud(d.request_id));
$fn$;

create or replace function public.pharma_alcanza_pedido(p_pedido_id uuid)
returns boolean language sql security definer stable
set search_path = pg_catalog, public as $fn$
  select public.pharma_sin_recorte() or exists (
    select 1 from public.pedidos_medicacion pm
     where pm.id = p_pedido_id and public.pharma_alcanza_protocolo(pm.protocol_id));
$fn$;

grant execute on function public.pharma_sin_recorte()                to authenticated;
grant execute on function public.pharma_alcanza_protocolo(uuid)      to authenticated;
grant execute on function public.pharma_alcanza_paciente(uuid)       to authenticated;
grant execute on function public.pharma_alcanza_lote(uuid)           to authenticated;
grant execute on function public.pharma_alcanza_recepcion(uuid)      to authenticated;
grant execute on function public.pharma_alcanza_solicitud(uuid)      to authenticated;
grant execute on function public.pharma_alcanza_dispensacion(uuid)   to authenticated;
grant execute on function public.pharma_alcanza_pedido(uuid)         to authenticated;


-- 4 · Auditoría ----------------------------------------------------------------------------------
-- El audit_row() generico de la 0003, el mismo que ya usan las otras ocho tablas auditadas.
drop trigger if exists trg_audit_pharma_protocol_access on public.pharma_protocol_access;
create trigger trg_audit_pharma_protocol_access
  after insert or update or delete on public.pharma_protocol_access
  for each row execute function public.audit_row();

-- El interruptor NO necesita trigger propio: vive en user_module_roles, que ya esta auditada.


-- 5 · El historial legible -----------------------------------------------------------------------
-- VISTA NUEVA, no una extension de v_protocol_access_audit. El motivo lo dejo escrito la 0110 para
-- el caso identico: si las filas de Farmacia entran por la vista de Coordinacion, el front que esta
-- HOY en produccion las redacta como "le dio acceso a los pacientes del estudio X" — una frase
-- impecable que dice algo que no paso. Con vista aparte la migracion queda puramente aditiva.
--
-- Junta las DOS fuentes porque para gerencia son un solo hecho ("que le paso al alcance de esta
-- persona en Farmacia"): los estudios que entran o salen de la lista, y el interruptor.
--
-- security_invoker = true: hereda la policy "gerencia ve auditoria" de audit_log (0006), asi que
-- quien no es gerencia recibe cero filas. La vista NO decide permisos; solo traduce.
--
-- Los LEFT JOIN a protocols y users son a proposito: un protocolo o una cuenta borrados dejan sus
-- lineas de auditoria en pie —audit_log es inmutable— y perderlas al leer seria recortar el
-- registro. El front redacta esos casos con el codigo o el nombre en null.
create or replace view public.v_pharma_protocol_access_audit
with (security_invoker = true) as

-- (a) un estudio que entra o sale de la lista
select
  l.id,
  l.occurred_at,
  l.action,
  'estudio'::text as clase,
  coalesce(l.after_data ->> 'user_id', l.before_data ->> 'user_id')::uuid as target_user_id,
  p.code           as protocol_code,
  p.name           as protocol_name,
  null::boolean    as ve_todos,
  l.actor_id,
  actor.full_name  as actor_name,
  target.full_name as target_name
from public.audit_log l
left join public.users actor  on actor.id = l.actor_id
left join public.users target
       on target.id = coalesce(l.after_data ->> 'user_id', l.before_data ->> 'user_id')::uuid
left join public.protocols p
       on p.id = coalesce(l.after_data ->> 'protocol_id', l.before_data ->> 'protocol_id')::uuid
where l.entity_type = 'pharma_protocol_access'

union all

-- (b) el interruptor. Solo las lineas de user_module_roles donde la bandera CAMBIO y el modulo es
-- Farmacia: un cambio de nivel no es un cambio de alcance y ya lo cuenta v_access_audit.
select
  l.id,
  l.occurred_at,
  l.action,
  'interruptor'::text as clase,
  coalesce(l.after_data ->> 'user_id', l.before_data ->> 'user_id')::uuid as target_user_id,
  null::text          as protocol_code,
  null::text          as protocol_name,
  (l.after_data ->> 've_todos_los_estudios')::boolean as ve_todos,
  l.actor_id,
  actor.full_name  as actor_name,
  target.full_name as target_name
from public.audit_log l
left join public.users actor  on actor.id = l.actor_id
left join public.users target
       on target.id = coalesce(l.after_data ->> 'user_id', l.before_data ->> 'user_id')::uuid
where l.entity_type = 'user_module_roles'
  and l.action = 'UPDATE'
  and coalesce(l.after_data ->> 'module', l.before_data ->> 'module') = 'pharma'
  and (l.before_data ->> 've_todos_los_estudios')
      is distinct from (l.after_data ->> 've_todos_los_estudios');

comment on view public.v_pharma_protocol_access_audit is
  'Historial legible del alcance por estudio en Farmacia: los estudios que entran o salen de la '
  'lista (trg_audit_pharma_protocol_access) mas los cambios del interruptor (user_module_roles). '
  'Vista APARTE de v_protocol_access_audit a proposito: sumarlas habria sido breaking para el front '
  'desplegado, que redactaria estas lineas como si fueran de Coordinacion. security_invoker → solo '
  'gerencia. 0138.';

revoke all on public.v_pharma_protocol_access_audit from anon;
grant select on public.v_pharma_protocol_access_audit to authenticated;


-- 6 · v_access_audit deja de contar los cambios de SOLO el interruptor ---------------------------
-- Sin esto, apagar el interruptor produciria en el historial de modulos la linea "volvio a guardar
-- el acceso de X a Farmacia, sin cambiar el nivel" — tecnicamente cierta y completamente engañosa,
-- porque esconde lo unico que si cambio. Y ademas duplicada, porque la vista de arriba ya la cuenta
-- bien.
--
-- Es un cambio SEGURO aunque toque una vista vieja: hoy no existe ni una sola fila que pueda
-- matchear, porque la columna ve_todos_los_estudios se crea en esta misma migracion.
--
-- ⚠️ EL `with (security_invoker = true)` VA SI O SI: create or replace VIEW reemplaza las opciones,
-- y sin repetirlo la vista se saltearia la RLS de audit_log en silencio. Se sondea al final.
create or replace view public.v_access_audit
with (security_invoker = true) as
select
  l.id,
  l.occurred_at,
  l.action,
  case
    when l.entity_type = 'users' then l.entity_id
    else coalesce(l.after_data ->> 'user_id', l.before_data ->> 'user_id')::uuid
  end as target_user_id,
  case when l.entity_type = 'users' then null
       else coalesce(l.after_data ->> 'module', l.before_data ->> 'module') end as module,
  case when l.entity_type = 'users' then null else l.before_data ->> 'role' end as role_before,
  case when l.entity_type = 'users' then null else l.after_data  ->> 'role' end as role_after,
  l.actor_id,
  actor.full_name as actor_name,
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
where (
        l.entity_type = 'user_module_roles'
        -- NUEVO en la 0138: fuera los updates que solo movieron el interruptor.
        and not (
          l.action = 'UPDATE'
          and (l.before_data ->> 'role') is not distinct from (l.after_data ->> 'role')
          and (l.before_data ->> 've_todos_los_estudios')
              is distinct from (l.after_data ->> 've_todos_los_estudios')
        )
      )
   or (l.entity_type = 'users' and l.action in ('ALTA', 'BAJA', 'ELIMINACION'));

comment on view public.v_access_audit is
  'Historial legible de accesos: los cambios de modulo (trg_audit_module_roles, 0003) mas el alta, '
  'la baja y la eliminacion de la cuenta (0098, 0099). Desde la 0138 EXCLUYE los updates que solo '
  'movieron ve_todos_los_estudios: esos los cuenta v_pharma_protocol_access_audit. '
  'Solo gerencia, por la policy "gerencia ve auditoria" (0006). 0096, 0100, 0138.';


-- 7 · Escribir el alcance ------------------------------------------------------------------------
-- Dos RPC y ninguna escritura directa, por la misma razon que la 0110: la consola es de GERENCIA, y
-- una policy de escritura que la aceptara dejaria de paso que un operator de Farmacia se
-- auto-asigne estudios por PostgREST. Ademas, un insert directo afectaria CERO FILAS EN SILENCIO —
-- la RLS filtra callada, y 0 filas no es exito, es falta de permiso.
--
-- Los dos llevan compare-and-swap contra p_expected. No es ceremonia: sin el, dos gerencias
-- editando a la vez se pisan y gana la ultima en silencio — y en permisos "en silencio" significa
-- que alguien conserva un acceso que se creyo revocado.

-- 7.1 · El interruptor
create or replace function public.set_pharma_todos_los_estudios(
  p_user_id  uuid,
  p_todos    boolean,
  p_expected boolean
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
  if v_uid is null then
    raise exception 'Tu sesión venció.' using errcode = '28000';
  end if;

  -- VA ACA Y NO EN UNA POLICY: la funcion es security definer, corre con los permisos del dueño y
  -- la RLS no la mira.
  if not public.has_module('gerencia') then
    raise exception 'No tenés permiso para cambiar accesos.' using errcode = '42501';
  end if;

  select r.ve_todos_los_estudios into v_actual
    from public.user_module_roles r
   where r.user_id = p_user_id and r.module = 'pharma';

  -- Sin fila de rol no hay interruptor que mover: el alcance es un modificador DEL ROL y sin el
  -- modulo no significa nada. Mensaje propio para que no llegue un error de Postgres en ingles.
  if not found then
    raise exception 'Primero dale acceso a Farmacia y después elegí los estudios.'
      using errcode = 'P0001';
  end if;

  if v_actual is distinct from p_expected then
    raise exception 'Alguien más cambió este acceso mientras lo editabas. Refrescá y volvé a mirar.'
      using errcode = 'P0001';
  end if;

  -- Nada que cambiar: se sale sin escribir. Un historial con lineas de cambios que no ocurrieron es
  -- un historial que nadie lee.
  if v_actual = p_todos then
    return;
  end if;

  update public.user_module_roles
     set ve_todos_los_estudios = p_todos
   where user_id = p_user_id and module = 'pharma';

  -- Volver a "ve todos" NO borra la lista a proposito: si gerencia se arrepiente y vuelve a
  -- acotarla, encuentra los estudios que habia elegido. La lista sin el interruptor no da acceso a
  -- nada — pharma_sin_recorte() corta antes.
end;
$fn$;

comment on function public.set_pharma_todos_los_estudios is
  'Prende (p_todos true = ve todos) o apaga el recorte por estudio en Farmacia. Solo gerencia, '
  'verificado adentro porque es security definer. Con compare-and-swap contra p_expected. La '
  'auditoria la escribe trg_audit_module_roles. 0138.';

grant execute on function public.set_pharma_todos_los_estudios(uuid, boolean, boolean) to authenticated;


-- 7.2 · Un estudio, espejo exacto de set_protocol_access (0110 §3)
create or replace function public.set_pharma_protocol_access(
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
  if v_uid is null then
    raise exception 'Tu sesión venció.' using errcode = '28000';
  end if;

  if not public.has_module('gerencia') then
    raise exception 'No tenés permiso para cambiar accesos.' using errcode = '42501';
  end if;

  -- Que existan las dos puntas. Sin esto fallaria igual por la FK, pero con un mensaje de Postgres
  -- en ingles nombrando una constraint.
  if not exists (select 1 from public.users u where u.id = p_user_id) then
    raise exception 'Esa cuenta ya no existe. Refrescá la lista.' using errcode = '23503';
  end if;
  if not exists (select 1 from public.protocols pr where pr.id = p_protocol_id) then
    raise exception 'Ese estudio ya no existe. Refrescá la lista.' using errcode = '23503';
  end if;

  select exists (
    select 1 from public.pharma_protocol_access a
     where a.user_id = p_user_id and a.protocol_id = p_protocol_id
  ) into v_actual;

  if v_actual is distinct from p_expected then
    raise exception 'Alguien más cambió este acceso mientras lo editabas. Refrescá y volvé a mirar.'
      using errcode = 'P0001';
  end if;

  if v_actual = p_asignado then
    return;
  end if;

  if p_asignado then
    insert into public.pharma_protocol_access (user_id, protocol_id)
    values (p_user_id, p_protocol_id)
    on conflict (user_id, protocol_id) do nothing;
  else
    delete from public.pharma_protocol_access a
     where a.user_id = p_user_id and a.protocol_id = p_protocol_id;
  end if;
end;
$fn$;

comment on function public.set_pharma_protocol_access is
  'Da (p_asignado true) o quita UN estudio del alcance de Farmacia de una persona. Solo gerencia, '
  'verificado adentro porque es security definer. Con compare-and-swap. Existe porque '
  'pharma_protocol_access no tiene policy de escritura a proposito. 0138.';

grant execute on function public.set_pharma_protocol_access(uuid, uuid, boolean, boolean) to authenticated;


-- 8 · El recorte: estudios y pacientes -----------------------------------------------------------
-- NUEVE policies sobre SIETE tablas: siete de SELECT mas las dos de escritura de protocol_alerts
-- y protocol_medications, que comprueban NIVEL. La transformacion es SIEMPRE aditiva:
--   has_module('pharma')  →  (has_module('pharma') and pharma_alcanza_*(...))
-- y la clausula de gerencia queda AFUERA del and.
--
-- Cada una se reescribe entera a partir de su definicion VIVA, no de la primera: "ver protocolos
-- asignados" se redefinio en la 0028, "ver enrolamientos" en la 0010, "ver procedimientos del
-- estudio" en la 0089 y "ver asignacion" en la 0032. Copiar la version de la 0006 habria REVERTIDO
-- esas migraciones en silencio.

-- 8.1 · protocols (viva: 0028). El protocolo ES la fila, asi que el alcance va sobre `id`.
drop policy if exists "ver protocolos asignados" on public.protocols;
create policy "ver protocolos asignados" on public.protocols for select using (
  public.has_module('gerencia')
  or public.is_assigned_coordinator(id)
  or public.has_role('track','leader')
  or public.has_min_role('track','admin')
  or (public.has_module('pharma') and public.pharma_alcanza_protocolo(id))
  or public.has_module('contable')
);

-- 8.2 · enrollments (viva: 0010, que amplio la de la 0006 con `alter policy`).
alter policy "ver enrolamientos de mis protocolos" on public.enrollments
  using (
    public.has_module('gerencia')
    or (public.has_module('pharma') and public.pharma_alcanza_protocolo(protocol_id))
    or public.is_assigned_coordinator(protocol_id)
  );

-- 8.3 · patients (viva: 0006). Un paciente puede estar en DOS protocolos: pharma_alcanza_paciente
-- usa exists, no un `=` contra el primer enrolamiento.
drop policy if exists "ver pacientes de mis protocolos" on public.patients;
create policy "ver pacientes de mis protocolos" on public.patients for select using (
  public.has_module('gerencia')
  or (public.has_module('pharma') and public.pharma_alcanza_paciente(patients.id))
  or exists (
    select 1 from public.enrollments e
    join public.protocol_coordinators pc on pc.protocol_id = e.protocol_id
    where e.patient_id = patients.id and pc.user_id = auth.uid()
  )
);

-- 8.4 · protocol_activities (viva: 0006).
drop policy if exists "ver config protocolo (activities)" on public.protocol_activities;
create policy "ver config protocolo (activities)" on public.protocol_activities for select using (
  public.has_module('gerencia')
  or (public.has_module('pharma') and public.pharma_alcanza_protocolo(protocol_activities.protocol_id))
  or exists (select 1 from public.protocol_coordinators pc
             where pc.protocol_id = protocol_activities.protocol_id and pc.user_id = auth.uid())
);

-- 8.5 · protocol_procedures (viva: 0089).
drop policy if exists "ver procedimientos del estudio" on public.protocol_procedures;
create policy "ver procedimientos del estudio" on public.protocol_procedures for select using (
  public.has_module('track')
  or (public.has_module('pharma') and public.pharma_alcanza_protocolo(protocol_procedures.protocol_id))
  or public.has_module('gerencia')
);

-- 8.6 · protocol_alerts (viva: 0006). Son DOS: la de lectura y la de escritura de lideres.
-- La de escritura comprueba NIVEL (has_role('pharma','leader')), asi que el and se SUMA sin tocarlo
-- — si se reemplazara, un viewer de Farmacia ganaria escritura.
drop policy if exists "ver alertas" on public.protocol_alerts;
create policy "ver alertas" on public.protocol_alerts for select using (
  public.has_module('track')
  or (public.has_module('pharma') and public.pharma_alcanza_protocolo(protocol_alerts.protocol_id))
  or public.has_module('gerencia')
);
drop policy if exists "lideres administran alertas" on public.protocol_alerts;
create policy "lideres administran alertas" on public.protocol_alerts for all
  using (
    public.has_role('track','leader')
    or (public.has_role('pharma','leader')
        and public.pharma_alcanza_protocolo(protocol_alerts.protocol_id))
  )
  with check (
    public.has_role('track','leader')
    or (public.has_role('pharma','leader')
        and public.pharma_alcanza_protocolo(protocol_alerts.protocol_id))
  );

-- 8.7 · protocol_medications (viva: 0032). Tambien son dos, y la de escritura comprueba nivel.
drop policy if exists "ver asignacion" on public.protocol_medications;
create policy "ver asignacion" on public.protocol_medications for select using (
  (public.has_module('pharma') and public.pharma_alcanza_protocolo(protocol_medications.protocol_id))
  or public.has_module('gerencia')
);
drop policy if exists "pharma leader asigna" on public.protocol_medications;
create policy "pharma leader asigna" on public.protocol_medications for all
  using (
    public.has_min_role('pharma','leader')
    and public.pharma_alcanza_protocolo(protocol_medications.protocol_id)
  )
  with check (
    public.has_min_role('pharma','leader')
    and public.pharma_alcanza_protocolo(protocol_medications.protocol_id)
  );


-- 9 · Sonda de security_invoker ------------------------------------------------------------------
-- Las dos vistas que esta migracion recrea tienen que seguir con security_invoker. Si alguna
-- devuelve NULL o vacio, la vista se saltea la RLS y hay que volver a correr su bloque.
select c.relname, c.reloptions
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public'
   and c.relname in ('v_access_audit', 'v_pharma_protocol_access_audit');

notify pgrst, 'reload schema';
