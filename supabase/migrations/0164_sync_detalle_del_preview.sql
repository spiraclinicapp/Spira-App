-- Spira · Migración 0164 — Coordinación: el preview del sync del cronograma dice CUÁLES visitas cambian
-- ============================================================================
-- Plan: `docs/plan-sync-sin-pisar-reprogramar.md`, § «Segunda vuelta: el detalle» (pedido del Director, 17/10).
--
-- EL PEDIDO. Con la 0163 el preview cuenta («5 cambian de fecha», «3 conservan la fecha que se les dio a
-- mano»), pero no dice cuáles. El Director: «tiene que darte un listado de las que se van a cambiar, de las que
-- siguen igual en base a los cambios que estés intentando aplicar».
--
-- Suma: sync_protocol_schedule RE-DECLARADA (la de la 0163 tal cual, salvo lo marcado con «0164») con una clave
-- nueva en la respuesta, `detalle`: un renglón por visita que el sync crea, cambia o deliberadamente no cambia.
--
--   grupo       'crea' | 'fecha' | 'conserva' | 'ventana' (cada visita en un solo grupo)
--   visita_id   la visita (NULL en 'crea': todavía no existe)
--   inscripcion_id, visita (el código de la definición), fecha (la de hoy), fecha_nueva ('crea' y 'fecha')
--   motivo      en 'conserva': 'a_mano' | 'no_vino' | 'llegada' | 'listo'; en 'ventana': 'cancelada' o NULL
--   fuera_de_ventana  la conservada a la que este sync le mueve la ventana y queda afuera
--
-- SIN NOMBRES: el sync es `security definer` y lo puede correr un admin de Coordinación que no coordina el
-- estudio. La app pide nombre e IVRS a v_track_visits por inscripción, con la RLS de quien mira (como el aviso
-- de fuera de ventana de la 0163).
--
-- Las visitas que no cambian en nada no se listan. Preview y aplicar devuelven el mismo detalle: se calcula
-- antes de escribir, sobre la misma clasificación (cronograma_por_sincronizar, 0163) que usa el UPDATE.
--
-- APLICAR A MANO en el SQL Editor de Supabase (rol postgres), DESPUÉS de la 0163. IDEMPOTENTE. Si el editor
-- avisa de una «tabla nueva sin RLS», correrlo SIN activarla (es el `select … into` de PL/pgSQL).
--
-- ⚠️ ADITIVA → VA **ANTES** DEL DEPLOY DEL FRONT. Sólo suma una clave a la respuesta: el front de hoy no la lee
-- y sigue igual. No escribe datos.
-- ============================================================================


-- 1 · sync_protocol_schedule: la respuesta suma el detalle -----------------------------------------------

create or replace function public.sync_protocol_schedule(p_protocol_id uuid, p_apply boolean default false)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $fn$
declare
  v_creates int; v_moves int; v_deletes int; v_attended_div int;
  v_fechas int; v_respetadas int; v_con_marcas int; v_fuera uuid[];                       -- 0163
  v_detalle jsonb;                                                                         -- 0164
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

  -- 0164: el detalle. Un renglón por visita que se crea, cambia de fecha, conserva su fecha (cuando el sync de
  -- antes la habría movido) o sólo toma la ventana nueva; cada una en un solo grupo. Sin nombres (ver arriba).
  -- Se calcula ANTES de escribir, así aplicar devuelve lo mismo que el preview.
  select coalesce(jsonb_agg(jsonb_build_object(
           'grupo', d.grupo, 'visita_id', d.visita_id, 'inscripcion_id', d.inscripcion_id,
           'visita', d.visita, 'fecha', d.fecha, 'fecha_nueva', d.fecha_nueva,
           'motivo', d.motivo, 'fuera_de_ventana', d.fuera_de_ventana)
         order by d.orden_grupo, d.orden_visita, coalesce(d.fecha_nueva, d.fecha), d.inscripcion_id), '[]'::jsonb)
    into v_detalle
  from (
    select
      case when c.cambia_fecha                                           then 'fecha'
           when c.clase in ('a_mano', 'marcada') and c.fecha_distinta    then 'conserva'
           else 'ventana' end                                            as grupo,
      case when c.cambia_fecha                                           then 2
           when c.clase in ('a_mano', 'marcada') and c.fecha_distinta    then 3
           else 4 end                                                    as orden_grupo,
      c.visita_id                                                        as visita_id,
      pv.enrollment_id                                                   as inscripcion_id,
      vd.code                                                            as visita,
      vd.sort_order                                                      as orden_visita,
      pv.estimated_date                                                  as fecha,
      case when c.cambia_fecha then c.fecha_teorica end                  as fecha_nueva,
      case when c.clase = 'a_mano'                                       then 'a_mano'
           when c.clase = 'marcada' and pv.no_show_at is not null        then 'no_vino'
           when c.clase = 'marcada' and pv.ready_at is not null          then 'listo'
           when c.clase = 'marcada'                                      then 'llegada'
           when c.clase = 'cancelada'                                    then 'cancelada' end as motivo,
      c.fuera_de_ventana                                                 as fuera_de_ventana
    from public.cronograma_por_sincronizar(p_protocol_id) c
    join public.patient_visits pv    on pv.id = c.visita_id
    join public.visit_definitions vd on vd.id = pv.visit_def_id
    where c.cambia_fecha or c.cambia_ventana
       or (c.clase in ('a_mano', 'marcada') and c.fecha_distinta)
    union all
    select 'crea', 1, null::uuid, e.id, vd.code, vd.sort_order, null::date,
           e.randomization_date + vd.offset_days, null::text, false
    from public.enrollments e
    join public.visit_definitions vd on vd.protocol_id = e.protocol_id and vd.date_mode = 'automatica'
    where e.protocol_id = p_protocol_id and e.status = 'activo' and e.randomization_date is not null
      and not exists (select 1 from public.patient_visits pv
        where pv.enrollment_id = e.id and pv.kind = 'programada' and pv.visit_def_id = vd.id)
  ) d;

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
    'fuera_de_ventana', to_jsonb(v_fuera),                                            -- 0163
    'detalle', v_detalle);                                                            -- 0164
end; $fn$;
revoke all on function public.sync_protocol_schedule(uuid, boolean) from public;
grant execute on function public.sync_protocol_schedule(uuid, boolean) to authenticated;
comment on function public.sync_protocol_schedule is
  'Reconcilia las programadas AUTOMÁTICAS (post-rando) vs visit_definitions; no toca atendidas ni libres. 0161: a un turno cancelado no le devuelve la fecha (sólo le mueve la ventana). 0163: tampoco a una fecha puesta a mano (estimated_date distinta de fecha_del_cronograma) ni a una visita con llegada, listo o «No vino» marcados; la clasificación vive en cronograma_por_sincronizar, y la respuesta suma fechas, respetadas, con_marcas y fuera_de_ventana. 0164: y `detalle`, un renglón por visita que se crea, cambia o conserva su fecha (ids y fechas, sin nombres). gerencia/track-admin. SECURITY DEFINER.';


-- 2 · Recarga de PostgREST y la sonda ---------------------------------------------------------------
notify pgrst, 'reload schema';

-- LA SONDA (decisión 101): tiene que dar `true`. La API no la distingue (misma firma): sólo el cuerpo.
select (select prosrc like '%v_detalle%' from pg_proc where proname = 'sync_protocol_schedule') as detalle;
