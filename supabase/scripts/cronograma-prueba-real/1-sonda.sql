-- Spira · Cronograma de la prueba real — 1 · SONDA (sólo lectura)
-- ============================================================================
-- GENERADO por supabase/scripts/cronograma-prueba-real/generar.mjs desde
-- cronograma-procedimientos-y-dias.xlsx (hoja «Resumen unificado por visita»). No editar a mano:
-- cambiar el generador y volver a generar.
--
-- Protocolos: ACT18301, LTS17231, CKJX839D12302, 222714.
-- ============================================================================

-- QUÉ HACE: nada. Sólo LEE y muestra, por protocolo, qué hay hoy y qué va a cambiar cuando se corra
-- 2-aplicar.sql. Correla primero y mirá sobre todo:
--   · «Protocolo»: los cuatro tienen que decir «existe». Si uno no existe, el script 2 se frena sin
--     tocar nada; la fila «parecidos» muestra con qué código está cargado.
--   · «Visitas que quedan fuera y NO se borran»: tienen visitas de pacientes colgando, así que el
--     script no puede borrarlas. Las deja al final del cronograma, como manuales (dejan de generarse).
--   · «Reportes que se borran» y «Estados de reporte que se borran»: lo que se pierde al sacar los
--     procedimientos viejos del estudio (decisión del Director).
--
-- Es UNA sola consulta a propósito: el editor de Supabase muestra sólo el resultado de la última.

with deseado(protocolo, code) as (
  values
    ('ACT18301', 'V1'),
    ('ACT18301', 'V2'),
    ('ACT18301', 'V3'),
    ('ACT18301', 'V4'),
    ('ACT18301', 'V5'),
    ('ACT18301', 'V6'),
    ('ACT18301', 'V7'),
    ('ACT18301', 'V8'),
    ('ACT18301', 'V9'),
    ('ACT18301', 'V10'),
    ('ACT18301', 'V11'),
    ('ACT18301', 'V12'),
    ('ACT18301', 'V13'),
    ('ACT18301', 'V14'),
    ('ACT18301', 'V15'),
    ('ACT18301', 'V16'),
    ('ACT18301', 'V17'),
    ('ACT18301', 'V18'),
    ('ACT18301', 'ETD'),
    ('LTS17231', 'V1'),
    ('LTS17231', 'V2'),
    ('LTS17231', 'V3'),
    ('LTS17231', 'V4'),
    ('LTS17231', 'V5'),
    ('LTS17231', 'V6'),
    ('LTS17231', 'V7'),
    ('LTS17231', 'V8'),
    ('LTS17231', 'V9'),
    ('LTS17231', 'V10'),
    ('LTS17231', 'V11'),
    ('LTS17231', 'V12'),
    ('LTS17231', 'V13'),
    ('LTS17231', 'V14'),
    ('LTS17231', 'V15'),
    ('LTS17231', 'V16'),
    ('LTS17231', 'V17'),
    ('LTS17231', 'V18'),
    ('LTS17231', 'V19'),
    ('LTS17231', 'V20'),
    ('LTS17231', 'V21'),
    ('LTS17231', 'V22'),
    ('LTS17231', 'V23'),
    ('LTS17231', 'V24'),
    ('LTS17231', 'V25'),
    ('LTS17231', 'V26'),
    ('CKJX839D12302', 'V0'),
    ('CKJX839D12302', 'V1'),
    ('CKJX839D12302', 'V2'),
    ('CKJX839D12302', 'V3'),
    ('CKJX839D12302', 'V4'),
    ('CKJX839D12302', 'V5'),
    ('CKJX839D12302', 'V6'),
    ('CKJX839D12302', 'V7'),
    ('CKJX839D12302', 'V8'),
    ('CKJX839D12302', 'V9'),
    ('CKJX839D12302', 'V10'),
    ('CKJX839D12302', 'V11'),
    ('CKJX839D12302', 'V12'),
    ('CKJX839D12302', 'V13'),
    ('CKJX839D12302', 'V14'),
    ('CKJX839D12302', 'FdE'),
    ('222714', 'V0'),
    ('222714', 'V1'),
    ('222714', 'V2'),
    ('222714', 'V3'),
    ('222714', 'V4'),
    ('222714', 'V5'),
    ('222714', 'V6'),
    ('222714', 'V7'),
    ('222714', 'V8'),
    ('222714', 'V9'),
    ('222714', 'V10'),
    ('222714', 'V11'),
    ('222714', 'V12'),
    ('222714', 'V13'),
    ('222714', 'V14'),
    ('222714', 'V15'),
    ('222714', 'V16'),
    ('222714', 'V17'),
    ('222714', 'V18'),
    ('222714', 'V19'),
    ('222714', 'V20'),
    ('222714', 'V21'),
    ('222714', 'V22'),
    ('222714', 'V23'),
    ('222714', 'V24'),
    ('222714', 'V25'),
    ('222714', 'V26'),
    ('222714', 'V27'),
    ('222714', 'V28'),
    ('222714', 'WS')
),
nuevos(nombre) as (
  values ('Cuestionarios'), ('Laboratorio'), ('IVRS y Administración del IMP'), ('Cuestionario de HCRU'), ('ECG de 12 derivaciones'), ('Espirometría (Pre)'), ('Espirometría (Post)'), ('FeNO'), ('Oscilometría (Pre)'), ('Oscilometría (Post)'), ('Examen físico completo')
),
proto as (
  select d.protocolo, p.id, p.name
  from (select distinct protocolo from deseado) d
  left join public.protocols p on p.code = d.protocolo
),
defs as (
  select pr.protocolo, vd.id, vd.code, vd.sort_order,
         (select count(*) from public.patient_visits pv where pv.visit_def_id = vd.id) as n_visitas,
         exists (select 1 from deseado d
                 where d.protocolo = pr.protocolo and upper(d.code) = upper(btrim(vd.code))) as sigue
  from proto pr
  join public.visit_definitions vd on vd.protocol_id = pr.id
),
-- El procedimiento que el script 2 va a usar para cada nombre: el más viejo con la misma clave (sin
-- tildes ni mayúsculas). Con el mismo criterio que el script, así lo que la sonda dice que sale del
-- estudio es exactamente lo que sale, aunque el catálogo tenga duplicados.
elegidos as (
  select n.nombre,
         (select p.id from public.procedures p where lower(translate(btrim(p.name), 'ÁÉÍÓÚÜáéíóúü', 'AEIOUUaeiouu')) = lower(translate(btrim(n.nombre), 'ÁÉÍÓÚÜáéíóúü', 'AEIOUUaeiouu'))
          order by p.created_at, p.id limit 1) as id
  from nuevos n
),
viejos as (
  select pr.protocolo, pp.id, p.name
  from proto pr
  join public.protocol_procedures pp on pp.protocol_id = pr.id
  join public.procedures p on p.id = pp.procedure_id
  where not exists (select 1 from elegidos e where e.id = pp.procedure_id)
)
select orden, seccion, protocolo, detalle, cantidad from (
  select 1 as orden, 'Protocolo' as seccion, pr.protocolo,
         case when pr.id is null
              then 'NO EXISTE: el script 2 se va a frenar sin tocar nada. Parecidos: '
                   || coalesce((select string_agg(p2.code, ', ') from public.protocols p2
                                where p2.code ilike '%' || regexp_replace(pr.protocolo, '^[A-Za-z]+', '') || '%'
                                   or p2.name ilike '%' || pr.protocolo || '%'), 'ninguno')
              else 'existe · ' || pr.name end as detalle,
         null::bigint as cantidad
  from proto pr

  union all
  select 2, 'Cronograma hoy', pr.protocolo,
         coalesce((select string_agg(coalesce(d.code, '(sin código)'), ', ' order by d.sort_order) from defs d where d.protocolo = pr.protocolo), '(vacío)'),
         (select count(*) from defs d where d.protocolo = pr.protocolo)
  from proto pr

  union all
  select 3, 'Visitas que se actualizan (mismo código)', pr.protocolo,
         coalesce((select string_agg(d.code, ', ' order by d.sort_order) from defs d where d.protocolo = pr.protocolo and d.sigue), '—'),
         (select count(*) from defs d where d.protocolo = pr.protocolo and d.sigue)
  from proto pr

  union all
  select 4, 'Visitas nuevas', pr.protocolo,
         coalesce((select string_agg(x.code, ', ') from deseado x
                   where x.protocolo = pr.protocolo
                     and not exists (select 1 from defs d where d.protocolo = pr.protocolo and upper(btrim(d.code)) = upper(x.code))), '—'),
         (select count(*) from deseado x
           where x.protocolo = pr.protocolo
             and not exists (select 1 from defs d where d.protocolo = pr.protocolo and upper(btrim(d.code)) = upper(x.code)))
  from proto pr

  union all
  select 5, 'Visitas que se borran (sin pacientes)', pr.protocolo,
         coalesce((select string_agg(coalesce(d.code, '(sin código)'), ', ' order by d.sort_order) from defs d
                   where d.protocolo = pr.protocolo and not d.sigue and d.n_visitas = 0), '—'),
         (select count(*) from defs d where d.protocolo = pr.protocolo and not d.sigue and d.n_visitas = 0)
  from proto pr

  union all
  select 6, 'Visitas que quedan fuera y NO se borran (tienen visitas de pacientes)', pr.protocolo,
         coalesce((select string_agg(coalesce(d.code, '(sin código)') || ' (' || d.n_visitas || ')', ', ' order by d.sort_order) from defs d
                   where d.protocolo = pr.protocolo and not d.sigue and d.n_visitas > 0), '—'),
         (select count(*) from defs d where d.protocolo = pr.protocolo and not d.sigue and d.n_visitas > 0)
  from proto pr

  union all
  select 7, 'Pacientes inscriptos (no se tocan)', pr.protocolo,
         'activos: ' || (select count(*) from public.enrollments e where e.protocol_id = pr.id and e.status = 'activo'),
         (select count(*) from public.enrollments e where e.protocol_id = pr.id)
  from proto pr

  union all
  select 8, 'Visitas de pacientes (no se tocan)', pr.protocolo,
         'realizadas: ' || (select count(*) from public.patient_visits pv join public.enrollments e on e.id = pv.enrollment_id
                            where e.protocol_id = pr.id and pv.real_date is not null),
         (select count(*) from public.patient_visits pv join public.enrollments e on e.id = pv.enrollment_id where e.protocol_id = pr.id)
  from proto pr

  union all
  select 9, 'Procedimientos que salen del estudio', pr.protocolo,
         coalesce((select string_agg(v.name, ', ' order by v.name) from viejos v where v.protocolo = pr.protocolo), '—'),
         (select count(*) from viejos v where v.protocolo = pr.protocolo)
  from proto pr

  union all
  select 10, 'Reportes que se borran', pr.protocolo,
         coalesce((select string_agg(v.name || ' › ' || rd.name || ' (' || rd.platform || ')', ', ' order by v.name, rd.name)
                   from viejos v join public.report_definitions rd on rd.protocol_procedure_id = v.id
                   where v.protocolo = pr.protocolo), '—'),
         (select count(*) from viejos v join public.report_definitions rd on rd.protocol_procedure_id = v.id where v.protocolo = pr.protocolo)
  from proto pr

  union all
  select 11, 'Estados de reporte que se borran (de visitas de pacientes)', pr.protocolo,
         'no pendientes: ' || (select count(*) from viejos v join public.report_definitions rd on rd.protocol_procedure_id = v.id
                               join public.report_status rs on rs.report_definition_id = rd.id
                               where v.protocolo = pr.protocolo and rs.stage <> 'pendiente'),
         (select count(*) from viejos v join public.report_definitions rd on rd.protocol_procedure_id = v.id
          join public.report_status rs on rs.report_definition_id = rd.id where v.protocolo = pr.protocolo)
  from proto pr

  union all
  select 12, 'Catálogo global', 'todos',
         'se reusan: ' || coalesce((select string_agg(case when p.name = e.nombre then e.nombre
                                                            else p.name || ' (pasa a «' || e.nombre || '»)' end, ', ')
                                    from elegidos e join public.procedures p on p.id = e.id), '—')
         || ' · se crean: ' || coalesce((select string_agg(e.nombre, ', ') from elegidos e where e.id is null), '—'),
         (select count(*) from elegidos e where e.id is null)
) s
order by orden, protocolo;
