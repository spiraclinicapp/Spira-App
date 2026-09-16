-- Spira · Verificación de la carga del 2026-09-15 (renumeración + fechas + entregas + procedimientos)
-- ============================================================================
-- SOLO LEE. No cambia nada, se puede correr las veces que haga falta.
-- Correr las cinco consultas de a una en el editor de Supabase (cada una da su propia tabla).
-- ============================================================================


-- 1 · LTS17231: tiene que dar 032001520001 … 032001520008, sin huecos ni repetidos.
select e.ivrs_code, pa.full_name, e.status
from public.enrollments e
join public.protocols p on p.id = e.protocol_id
join public.patients  pa on pa.id = e.patient_id
where p.code = 'LTS17231'
order by e.ivrs_code;


-- 2 · Las cinco fechas reales nuevas y la V2 de la 707408. Las seis tienen que tener fecha.
select p.code as protocolo, e.ivrs_code, upper(btrim(vd.code)) as visita, pv.real_date
from public.patient_visits pv
join public.enrollments e        on e.id = pv.enrollment_id
join public.protocols p          on p.id = e.protocol_id
join public.visit_definitions vd on vd.id = pv.visit_def_id
where (p.code, e.ivrs_code, upper(btrim(vd.code))) in (
        ('ACT18301', '032001500006', 'V17'), ('222714', '707401', 'V3'),
        ('222714', '707402', 'V4'),          ('222714', '707402', 'V5'),
        ('222714', '707405', 'V3'),          ('222714', '707408', 'V2'))
order by p.code, e.ivrs_code, vd.sort_order;


-- 3 · El tablero: entregas cargadas y cómo quedaron las visitas viejas.
--     «con_pendientes» tiene que ser exactamente las dos últimas de cada inscripción, que quedan
--     para revisar a mano. Si da más, algo no cerró.
select p.code as protocolo,
       count(distinct e.id)                                                   as inscripciones,
       count(distinct d.id)                                                   as entregas_cargadas,
       count(distinct pv.id) filter (where pv.real_date is not null)          as visitas_realizadas,
       count(distinct pv.id) filter (where v.computed_status = 'completa')    as completas,
       count(distinct pv.id) filter (where v.computed_status = 'realizada')   as con_pendientes
from public.protocols p
join public.enrollments e      on e.protocol_id = p.id
join public.patient_visits pv  on pv.enrollment_id = e.id
join public.v_patient_visits v on v.id = pv.id
left join public.dispensation_requests dr on dr.visit_id = pv.id
     and position('Carga histórica de entregas (listado del sitio, 2026-09-15)' in coalesce(dr.notes, '')) > 0
left join public.dispensations d on d.request_id = dr.id
where p.code in ('ACT18301', 'LTS17231', '222714', 'CKJX839D12302')
group by p.code
order by p.code;


-- 4 · Salud de las entregas: 70 pedidos, 70 dispensaciones entregadas con fecha, 86 renglones,
--     ningún renglón de dispensación (van sin lotes a propósito) y ningún movimiento de stock.
select
  (select count(*) from public.dispensation_requests dr
    where position('Carga histórica de entregas' in coalesce(dr.notes, '')) > 0)              as pedidos,
  (select count(*) from public.dispensation_request_items i
     join public.dispensation_requests dr on dr.id = i.request_id
    where position('Carga histórica de entregas' in coalesce(dr.notes, '')) > 0)              as renglones_pedidos,
  (select count(*) from public.dispensations d
     join public.dispensation_requests dr on dr.id = d.request_id
    where position('Carga histórica de entregas' in coalesce(dr.notes, '')) > 0)              as entregas,
  (select count(*) from public.dispensations d
     join public.dispensation_requests dr on dr.id = d.request_id
    where position('Carga histórica de entregas' in coalesce(dr.notes, '')) > 0
      and (d.status <> 'entregada' or d.delivered_at is null))                                as entregas_mal,
  (select count(*) from public.dispensation_items it
     join public.dispensations d on d.id = it.dispensation_id
     join public.dispensation_requests dr on dr.id = d.request_id
    where position('Carga histórica de entregas' in coalesce(dr.notes, '')) > 0)              as renglones_con_lote,
  (select count(*) from public.stock_movements sm
     join public.dispensations d on d.id = sm.reference_id and sm.reference_type = 'dispensation'
     join public.dispensation_requests dr on dr.id = d.request_id
    where position('Carga histórica de entregas' in coalesce(dr.notes, '')) > 0)              as movimientos_de_stock;


-- 5 · TU LISTA DE TRABAJO: las visitas que quedaron sin cerrar, que son las dos últimas de cada
--     inscripción. Son las que hay que mirar a mano para ver si están evolucionadas.
--     Sale de la base, no del Excel: es exactamente lo que la app muestra «con pendientes».
select p.code                        as protocolo,
       e.ivrs_code                   as ivrs,
       pa.full_name                  as paciente,
       upper(btrim(vd.code))         as visita,
       pv.real_date                  as fecha,
       (select count(*) from public.protocol_activities a
         where a.visit_def_id = pv.visit_def_id
           and not exists (select 1 from public.visit_procedure_completions c
                           where c.visit_id = pv.id and c.procedure_id = a.procedure_id)) as procedimientos_sin_tildar,
       (select count(*) from public.protocol_activities a
          join public.protocol_procedures pp on pp.protocol_id = e.protocol_id and pp.procedure_id = a.procedure_id
          join public.report_definitions rd  on rd.protocol_procedure_id = pp.id
          left join public.report_status rs  on rs.visit_id = pv.id and rs.report_definition_id = rd.id
         where a.visit_def_id = pv.visit_def_id
           and coalesce(rs.stage, 'pendiente') <> 'evolucionado')             as reportes_sin_evolucionar
from public.patient_visits pv
join public.v_patient_visits v   on v.id = pv.id
join public.enrollments e        on e.id = pv.enrollment_id
join public.protocols p          on p.id = e.protocol_id
join public.patients pa          on pa.id = e.patient_id
left join public.visit_definitions vd on vd.id = pv.visit_def_id
where p.code in ('ACT18301', 'LTS17231', '222714', 'CKJX839D12302')
  and pv.real_date is not null
  and v.computed_status = 'realizada'
order by p.code, e.ivrs_code, pv.real_date desc;
