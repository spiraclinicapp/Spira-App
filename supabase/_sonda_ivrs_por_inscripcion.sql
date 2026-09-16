-- Spira · Sonda de la 0126 — ¿el IVRS que sale de las vistas es el del estudio de la fila?
-- ============================================================================
-- SÓLO LEE. Correr DESPUÉS de aplicar la 0126, en el SQL Editor (rol postgres).
-- Cada sentencia es independiente: en este editor no comparten sesión ni transacción.
-- ============================================================================

-- 1 · Los pacientes que están en DOS estudios, con el IVRS de cada inscripción. Son los que hacían
--     visible el error: si las dos columnas de la derecha son iguales, ese enrolamiento todavía no
--     tiene su propio número cargado.
select p.full_name,
       p.code                        as ivrs_del_paciente,
       pr.code                       as estudio,
       e.ivrs_code                   as ivrs_de_la_inscripcion
  from public.enrollments e
  join public.patients  p  on p.id  = e.patient_id
  join public.protocols pr on pr.id = e.protocol_id
 where e.patient_id in (select patient_id from public.enrollments group by patient_id having count(*) > 1)
 order by p.full_name, pr.code;

-- 2 · La vista de visitas ya tiene que devolver el IVRS de la inscripción. Para un paciente en dos
--     estudios, cada visita tiene que traer el número de SU estudio.
select v.protocol_code, v.patient_name, v.patient_code, count(*) as visitas
  from public.v_track_visits v
 where v.patient_id in (select patient_id from public.enrollments group by patient_id having count(*) > 1)
 group by 1, 2, 3
 order by v.patient_name, v.protocol_code;

-- 3 · Control de que el fallback sigue vivo: inscripciones sin ivrs_code (legacy o pre-randomización).
--     Tienen que seguir mostrando el código del paciente, no un vacío.
select count(*) filter (where e.ivrs_code is null) as inscripciones_sin_ivrs,
       count(*)                                    as inscripciones_totales
  from public.enrollments e;

-- 4 · Las seis vistas, con su comentario puesto por la 0126 (si falta alguna, no se aplicó entera).
select c.relname as vista,
       obj_description(c.oid, 'pg_class') as comentario
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public'
   and c.relname in ('v_track_visits','v_ip_delivery_alerts','v_pharma_report_items',
                     'v_procedure_report_alerts','v_protocol_report_status','v_report_alerts')
 order by 1;
