-- Spira · Migración 0163 — Coordinación: sincronizar el cronograma sin pisar las fechas que se dieron a mano
-- ============================================================================
-- Plan: `docs/plan-sync-sin-pisar-reprogramar.md` (revisado con /plan-eng-review y una segunda opinión el
-- 2026-10-16; las cinco preguntas de producto, decididas por el Director el 2026-10-17 con la recomendada).
--
-- EL PROBLEMA. «Generar / actualizar cronograma» (sync_protocol_schedule) comparaba cada visita automática
-- sin atender con la fecha que le daría el cronograma AHORA y pisaba toda diferencia. La base no guardaba de
-- dónde había salido la fecha: un turno que Recepción reprogramó al 23 se veía igual que una visita que quedó
-- en el 20 cuando la definición pasó del día 28 al 35. Las movía a las dos, sin aviso.
--
-- LA DECISIÓN DE FONDO (D1 del plan): se guarda la fecha que le dio el cronograma (`fecha_del_cronograma`), y
-- «a mano» es una `estimated_date` distinta de ésa, venga de donde venga: Reprogramar, la fecha del
-- encabezado, «Traer visita», la llegada adelantada, una pestaña con el front viejo, el editor o un script.
-- Ningún camino que escribe fechas cambia: la regla vale por cómo quedó el dato.
--
-- Suma:
--   1. La columna fecha_del_cronograma en patient_visits. La escriben SÓLO los dos que dan la fecha del
--      cronograma: generate_patient_visits (al randomizar) y el sync.
--   2. generate_patient_visits RE-DECLARADA (la de la 0029): la visita nace con la columna puesta.
--   3. cronograma_por_sincronizar(estudio): la clasificación, en un solo lugar. El preview cuenta sobre ella
--      y el UPDATE aplica sobre ella: preview y aplicar dicen lo mismo POR CONSTRUCCIÓN (ya divergieron una
--      vez: ver la guarda de randomización de la 0161).
--   4. sync_protocol_schedule RE-DECLARADA (la de la 0161): una fecha a mano se CONSERVA (la ventana sí se
--      mueve: es del sponsor); una visita con la llegada, «listo» o «No vino» marcados tampoco cambia de
--      fecha (es el registro de ese día); y la respuesta suma fechas, respetadas, con_marcas y
--      fuera_de_ventana. Las claves de antes significan lo mismo.
--
-- LAS FILAS DE ANTES: no hay relleno. Mientras la columna esté vacía, la clasificación la deduce de la
-- ventana, que ningún camino a mano toca (D6 del plan). El primer sync que se aplica en cada estudio la anota.
-- Esta migración NO ESCRIBE NINGÚN DATO ni mueve ninguna fecha: lo que cambia es el próximo sync, y el admin
-- lo ve antes en el preview.
--
-- APLICAR A MANO en el SQL Editor de Supabase (rol postgres), DESPUÉS de la 0162. IDEMPOTENTE: reintentar es
-- volver a correr el archivo entero. Si el editor avisa de una «tabla nueva sin RLS», correrlo SIN activarla:
-- es el `select … into` de PL/pgSQL del sync, no una tabla (quinta trampa de CLAUDE.md).
--
-- ⚠️ ADITIVA → VA **ANTES** DEL DEPLOY DEL FRONT. El front de hoy lee creates, moves, deletes y
-- attended_divergent, que significan lo mismo («lo que el UPDATE cambia»). Registrar en supabase/README.md
-- recién con la sonda del final en verde y la confirmación por la API sin sesión (decisión 101).
-- ============================================================================


-- 1 · La columna ---------------------------------------------------------------------------------

alter table public.patient_visits
  add column if not exists fecha_del_cronograma date;

comment on column public.patient_visits.fecha_del_cronograma is
  'La fecha que le dio el cronograma a la visita la última vez (generate_patient_visits al randomizar, o sync_protocol_schedule), 0163. Si estimated_date es otra, alguien la movió a mano después y el sync la conserva. NULL: todavía no la anotó nadie (filas de antes de la 0163, que el sync deduce de la ventana) o nació libre. La escriben sólo esas dos funciones.';


-- 2 · generate_patient_visits: la visita nace con la fecha del cronograma anotada ----------------------
-- La de la 0029 tal cual, salvo lo marcado con «0163». El trigger (trg_generate_visits, 0021) no se toca.
-- Sin esto, una visita randomizada después de la 0163, reprogramada y con un cambio de tamaño de ventana
-- antes del primer sync, se pisaría en silencio (la deducción de la ventana ya no podría saber nada).

create or replace function public.generate_patient_visits()
returns trigger language plpgsql security definer set search_path = public as $fn$
begin
  if new.randomization_date is null then return new; end if;
  insert into public.patient_visits
    (enrollment_id, visit_def_id, kind, estimated_date, window_start, window_end,
     fecha_del_cronograma)                                                              -- 0163
  select
    new.id, vd.id, 'programada',
    new.randomization_date + vd.offset_days,
    new.randomization_date + vd.offset_days - vd.window_minus,
    new.randomization_date + vd.offset_days + vd.window_plus,
    new.randomization_date + vd.offset_days                                             -- 0163
  from public.visit_definitions vd
  where vd.protocol_id = new.protocol_id
    and vd.date_mode = 'automatica'
    and not exists (
      select 1 from public.patient_visits pv
      where pv.enrollment_id = new.id and pv.kind='programada' and pv.visit_def_id = vd.id);
  return new;
end; $fn$;


-- 3 · La clasificación ---------------------------------------------------------------------------
-- Cada visita sin atender del alcance del sync (programada, de definición automática, de una inscripción
-- activa con fecha de randomización) con su fecha teórica, su ventana nueva y su clase:
--
--   turno cancelado ────────────────────────────► 'cancelada'      sigue sin fecha (0161)
--   llegada / listo / «No vino» marcados ───────► 'marcada'        conserva su fecha
--   estimated_date ≠ la fecha del cronograma ───► 'a_mano'         conserva su fecha
--   el resto ───────────────────────────────────► 'del_cronograma' la única que cambia de fecha
--
-- Todas toman la ventana nueva. La fecha del cronograma VIGENTE es la columna, o, si está vacía, la que
-- dice la ventana: window_start + window_minus, si da lo mismo que window_end - window_plus (o sea, si el
-- tamaño de la ventana no cambió desde que el cronograma la escribió). Sin ventana, nació libre: su fecha la
-- eligió una persona. Con la ventana cambiada de tamaño no se puede saber, y se comporta como antes.
--
-- Lo que se anota (fecha_anotada): la teórica, salvo en las marcadas, que guardan la que tenían. Si después se
-- desmarcan («No vino» deshecho, «Volver» desde Concurrió), vuelven a estar donde el cronograma las puso y el
-- próximo sync las acompaña; con la teórica nueva quedarían «a mano» para siempre.
--
-- fuera_de_ventana: una 'a_mano' a la que ESTE sync le mueve la ventana y cuya fecha queda afuera. Es el aviso
-- que pide hacer algo, así que sólo sale cuando es nuevo.
--
-- Sin `security definer`: si alguien la llamara directo correría con su propia RLS. Igual se le saca el
-- permiso a todos (en Supabase las funciones nuevas de public nacen ejecutables por anon y authenticated):
-- es una pieza interna del sync, que la llama como su dueño.

create or replace function public.cronograma_por_sincronizar(p_protocol_id uuid)
returns table (
  visita_id        uuid,
  clase            text,
  fecha_teorica    date,
  ventana_desde    date,
  ventana_hasta    date,
  fecha_anotada    date,
  cambia_fecha     boolean,
  cambia_ventana   boolean,
  cambia_anotada   boolean,
  fecha_distinta   boolean,
  fuera_de_ventana boolean
)
language sql stable
set search_path = pg_catalog, public
as $fn$
  with base as (
    select pv.id, pv.estimated_date, pv.window_start, pv.window_end, pv.fecha_del_cronograma,
           pv.turno_cancelado_at, pv.arrived_at, pv.ready_at, pv.no_show_at,
           e.randomization_date + vd.offset_days                   as teorica,
           e.randomization_date + vd.offset_days - vd.window_minus as desde,
           e.randomization_date + vd.offset_days + vd.window_plus  as hasta,
           coalesce(pv.fecha_del_cronograma,
             case
               when pv.window_start is null or pv.window_end is null then null
               when pv.window_start + vd.window_minus = pv.window_end - vd.window_plus
                 then pv.window_start + vd.window_minus
               else pv.estimated_date
             end)                                                  as vigente
    from public.patient_visits pv
    join public.enrollments e        on e.id = pv.enrollment_id
    join public.visit_definitions vd on vd.id = pv.visit_def_id
    where e.protocol_id = p_protocol_id
      and e.status = 'activo'
      and e.randomization_date is not null
      and vd.date_mode = 'automatica'
      and pv.kind = 'programada'
      and pv.real_date is null
  ),
  clasificada as (
    select b.*,
      case
        when b.turno_cancelado_at is not null                                          then 'cancelada'
        when b.arrived_at is not null or b.ready_at is not null or b.no_show_at is not null then 'marcada'
        when b.estimated_date is distinct from b.vigente                                then 'a_mano'
        else 'del_cronograma'
      end as clase_de_fila
    from base b
  ),
  con_anotada as (
    select k.*,
      case when k.clase_de_fila = 'marcada' then k.vigente else k.teorica end as anotada
    from clasificada k
  )
  select
    c.id,
    c.clase_de_fila,
    c.teorica,
    c.desde,
    c.hasta,
    c.anotada,
    c.clase_de_fila = 'del_cronograma' and c.estimated_date is distinct from c.teorica,
    c.window_start is distinct from c.desde or c.window_end is distinct from c.hasta,
    c.fecha_del_cronograma is distinct from c.anotada,
    c.estimated_date is distinct from c.teorica,
    c.clase_de_fila = 'a_mano'
      and (c.window_start is distinct from c.desde or c.window_end is distinct from c.hasta)
      and (c.estimated_date < c.desde or c.estimated_date > c.hasta)
  from con_anotada c;
$fn$;

revoke all on function public.cronograma_por_sincronizar(uuid) from public;
revoke all on function public.cronograma_por_sincronizar(uuid) from anon;
revoke all on function public.cronograma_por_sincronizar(uuid) from authenticated;
comment on function public.cronograma_por_sincronizar(uuid) is
  'Clasificación del sync del cronograma (0163): cada visita automática sin atender de una inscripción activa y randomizada del estudio, con su fecha teórica, su ventana nueva, lo que se anota en fecha_del_cronograma y su clase (cancelada, marcada, a_mano, del_cronograma; sólo del_cronograma cambia de fecha). La usan el preview y el UPDATE de sync_protocol_schedule, así cuentan lo mismo. Sin permiso para nadie: es interna.';


-- 4 · sync_protocol_schedule: conserva las fechas a mano y las de las visitas marcadas ------------------
-- La de la 0161, salvo lo marcado con «0163». CREAR y BORRAR quedan como estaban; MOVER pasa a la
-- clasificación de § 3 (lo de la 0161 queda adentro: la cancelada sigue sin fecha, y la guarda de
-- randomización es parte del alcance).
-- Al APLICAR, primero se bloquean las visitas del estudio: un UPDATE que toma sus filas de una función no
-- vuelve a evaluar las condiciones si otra sesión cambió la fila mientras tanto (las guardas viven adentro de
-- la función, no sobre pv), así que sin el bloqueo una visita atendida en ese instante podía cambiar de fecha.
-- Dura lo que el sync, y sólo al aplicar.

create or replace function public.sync_protocol_schedule(p_protocol_id uuid, p_apply boolean default false)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $fn$
declare
  v_creates int; v_moves int; v_deletes int; v_attended_div int;
  v_fechas int; v_respetadas int; v_con_marcas int; v_fuera uuid[];                       -- 0163
begin
  if auth.uid() is null then raise exception 'No autenticado' using errcode='42501'; end if;
  if not (public.has_module('gerencia') or public.has_min_role('track','admin')) then
    raise exception 'No tenés permiso para gestionar el cronograma' using errcode='42501';
  end if;

  if p_apply then                                                                          -- 0163
    perform 1
      from public.patient_visits pv
      join public.enrollments e on e.id = pv.enrollment_id
     where e.protocol_id = p_protocol_id and pv.kind = 'programada' and pv.real_date is null
       for update of pv;
  end if;

  with desired as (
    select e.id as enrollment_id, vd.id as visit_def_id,
           (e.randomization_date + vd.offset_days) as estimated_date
    from public.enrollments e
    join public.visit_definitions vd on vd.protocol_id = e.protocol_id and vd.date_mode = 'automatica'
    where e.protocol_id = p_protocol_id and e.status = 'activo' and e.randomization_date is not null
  ),
  existing as (
    select pv.id, pv.enrollment_id, pv.visit_def_id, pv.estimated_date, pv.real_date
    from public.patient_visits pv
    join public.enrollments e on e.id = pv.enrollment_id
    join public.visit_definitions vd on vd.id = pv.visit_def_id
    where e.protocol_id = p_protocol_id and pv.kind = 'programada' and vd.date_mode = 'automatica'
  )
  select
    (select count(*) from desired d
       left join existing x on x.enrollment_id=d.enrollment_id and x.visit_def_id=d.visit_def_id
      where x.id is null),
    -- v_deletes cuenta EXACTAMENTE lo que borra el DELETE de abajo: programadas no
    -- atendidas cuya definición ya no existe (huérfanas). No cuenta las de defs vivas
    -- (incluidas las flipeadas a 'libre'), que el apply tampoco toca → preview == apply.
    (select count(*) from public.patient_visits pv2
       join public.enrollments e2 on e2.id = pv2.enrollment_id
      where e2.protocol_id = p_protocol_id and pv2.kind = 'programada' and pv2.real_date is null
        and not exists (select 1 from public.visit_definitions vd where vd.id = pv2.visit_def_id)),
    (select count(*) from existing x join desired d
       on d.enrollment_id=x.enrollment_id and d.visit_def_id=x.visit_def_id
      where x.real_date is not null and x.estimated_date is distinct from d.estimated_date)
  into v_creates, v_deletes, v_attended_div;

  -- 0163: MOVER se cuenta sobre la clasificación. `moves` sigue siendo «a cuántas les cambia la fecha o la
  -- ventana»; `fechas`, a cuántas la fecha; `respetadas` y `con_marcas`, cuántas el sync de antes habría
  -- movido y ahora conservan su fecha (a mano o con algo marcado).
  select
    count(*) filter (where c.cambia_fecha or c.cambia_ventana),
    count(*) filter (where c.cambia_fecha),
    count(*) filter (where c.clase = 'a_mano' and c.fecha_distinta),
    count(*) filter (where c.clase = 'marcada' and c.fecha_distinta),
    coalesce(array_agg(c.visita_id order by c.visita_id) filter (where c.fuera_de_ventana), '{}')
  into v_moves, v_fechas, v_respetadas, v_con_marcas, v_fuera
  from public.cronograma_por_sincronizar(p_protocol_id) c;

  if p_apply then
    insert into public.patient_visits (enrollment_id, visit_def_id, kind, estimated_date, window_start, window_end,
                                       fecha_del_cronograma)                                -- 0163
    select e.id, vd.id, 'programada',
           e.randomization_date + vd.offset_days,
           e.randomization_date + vd.offset_days - vd.window_minus,
           e.randomization_date + vd.offset_days + vd.window_plus,
           e.randomization_date + vd.offset_days                                            -- 0163
    from public.enrollments e
    join public.visit_definitions vd on vd.protocol_id = e.protocol_id and vd.date_mode = 'automatica'
    where e.protocol_id = p_protocol_id and e.status='activo' and e.randomization_date is not null
      and not exists (select 1 from public.patient_visits pv
        where pv.enrollment_id = e.id and pv.kind='programada' and pv.visit_def_id = vd.id);

    -- 0163: MOVER sobre la clasificación. La fecha cambia sólo en las 'del_cronograma'; la ventana, en todas;
    -- y se escriben también las filas donde sólo cambia lo anotado (no se cuentan: es contabilidad).
    update public.patient_visits pv
       set estimated_date       = case when c.cambia_fecha then c.fecha_teorica else pv.estimated_date end,
           window_start         = c.ventana_desde,
           window_end           = c.ventana_hasta,
           fecha_del_cronograma = c.fecha_anotada
      from public.cronograma_por_sincronizar(p_protocol_id) c
     where pv.id = c.visita_id
       and (c.cambia_fecha or c.cambia_ventana or c.cambia_anotada);

    delete from public.patient_visits pv
    using public.enrollments e
    where pv.enrollment_id = e.id and e.protocol_id = p_protocol_id and e.status='activo'
      and pv.kind='programada' and pv.real_date is null
      and not exists (select 1 from public.visit_definitions vd where vd.id = pv.visit_def_id);
  end if;

  return jsonb_build_object('creates', v_creates, 'moves', v_moves,
    'deletes', v_deletes, 'attended_divergent', v_attended_div, 'applied', p_apply,
    'fechas', v_fechas, 'respetadas', v_respetadas, 'con_marcas', v_con_marcas,     -- 0163
    'fuera_de_ventana', to_jsonb(v_fuera));                                           -- 0163
end; $fn$;
revoke all on function public.sync_protocol_schedule(uuid, boolean) from public;
grant execute on function public.sync_protocol_schedule(uuid, boolean) to authenticated;
comment on function public.sync_protocol_schedule is
  'Reconcilia las programadas AUTOMÁTICAS (post-rando) vs visit_definitions; no toca atendidas ni libres. 0161: a un turno cancelado no le devuelve la fecha (sólo le mueve la ventana). 0163: tampoco a una fecha puesta a mano (estimated_date distinta de fecha_del_cronograma) ni a una visita con llegada, listo o «No vino» marcados; la clasificación vive en cronograma_por_sincronizar, y la respuesta suma fechas, respetadas, con_marcas y fuera_de_ventana. gerencia/track-admin. SECURITY DEFINER.';


-- 5 · Recarga de PostgREST y la sonda ---------------------------------------------------------------
notify pgrst, 'reload schema';

-- LA SONDA (decisión 101): tienen que dar las cinco en `true`. Hasta entonces la migración no está aplicada.
-- `cerrada`: la clasificación no la puede llamar nadie desde la app.
select
  exists (select 1 from information_schema.columns where table_schema = 'public'
          and table_name = 'patient_visits' and column_name = 'fecha_del_cronograma')                  as columna,
  (select prosrc like '%fecha_del_cronograma%' from pg_proc where proname = 'generate_patient_visits')    as generar,
  (select prosrc like '%cronograma_por_sincronizar%' from pg_proc where proname = 'sync_protocol_schedule') as sync,
  (select count(*) from pg_proc where proname = 'cronograma_por_sincronizar') = 1                        as clasificacion,
  not has_function_privilege('authenticated', 'public.cronograma_por_sincronizar(uuid)', 'execute')     as cerrada;
