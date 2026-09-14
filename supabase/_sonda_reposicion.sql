-- Sonda de SÓLO LECTURA para el plan de reposición (docs/plan-reposicion-stock-minimo.md, T1).
-- No escribe nada. Se corre entera en el editor SQL de Supabase: es UN solo SELECT (el editor
-- muestra sólo el resultado de la última sentencia) y devuelve un renglón por medición.
--
-- Para qué: saber ANTES de construir la card cuánto va a salir inflado o incompleto el total.
--   1-2  cuántas asignaciones activas suman, y cuántas no tuvieron retiros en 90 días (D22)
--   3    enrolamientos con dos presentaciones activas de la misma droga (D21, sustitución 0076)
--   4    enrolamientos en screening/activo sin ninguna medicación habilitada (aviso de la card)
--   5    renglones de protocol_medications a cargar (estudios no cerrados)
--   6    dispensaciones listas/entregadas cuyo pedido no tiene enrollment_id (rompería «ya retiró»)
--   7    movimientos de dispensación que no apuntan a una dispensación (rompería el neto)
with
enr as (
  select e.id, e.protocol_id
    from public.enrollments e
    join public.protocols p on p.id = e.protocol_id
   where e.status in ('screening', 'activo')
     and p.status <> 'cerrado'
),
asig as (
  select pm.id, pm.enrollment_id, pm.medication_id, m.drug_id, enr.protocol_id
    from public.patient_medications pm
    join enr on enr.id = pm.enrollment_id
    join public.medications m on m.id = pm.medication_id
   where pm.active
     and pm.habilitacion_id is null
),
retiros_90 as (
  select dr.enrollment_id, sm.medication_id, -sum(sm.quantity_delta) as neto
    from public.stock_movements sm
    join public.dispensations d on d.id = sm.reference_id
    join public.dispensation_requests dr on dr.id = d.request_id
   where sm.reference_type = 'dispensation'
     and sm.movement_type in ('dispensacion', 'devolucion')
     and sm.created_at >= now() - interval '90 days'
   group by dr.enrollment_id, sm.medication_id
)
select 1 as orden, 'asignaciones activas que sumarían' as sonda, count(*)::text as valor
  from asig
union all
select 2, 'de esas, sin retiros en 90 días', count(*)::text
  from asig a
  left join retiros_90 r on r.enrollment_id = a.enrollment_id and r.medication_id = a.medication_id
 where coalesce(r.neto, 0) <= 0
union all
select 3, 'enrolamientos con 2+ presentaciones activas de la misma droga', count(*)::text
  from (select enrollment_id, drug_id from asig where drug_id is not null
         group by enrollment_id, drug_id having count(*) > 1) x
union all
select 4, 'enrolamientos screening/activo sin medicación habilitada', count(*)::text
  from enr
 where not exists (select 1 from asig where asig.enrollment_id = enr.id)
union all
select 5, 'renglones de protocol_medications a cargar (estudios no cerrados)', count(*)::text
  from public.protocol_medications pmx
  join public.protocols p on p.id = pmx.protocol_id
 where p.status <> 'cerrado'
union all
select 6, 'dispensaciones lista/entregada con pedido sin enrollment_id (365 días)', count(*)::text
  from public.dispensations d
  join public.dispensation_requests dr on dr.id = d.request_id
 where d.status in ('lista', 'entregada')
   and dr.enrollment_id is null
   and d.created_at >= now() - interval '365 days'
union all
select 7, 'movimientos de dispensación sin dispensación', count(*)::text
  from public.stock_movements sm
 where sm.reference_type = 'dispensation'
   and not exists (select 1 from public.dispensations d where d.id = sm.reference_id)
order by orden;
