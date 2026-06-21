-- Spira · randomization_date backfilleada por 0021 vs cronograma — 2026-06-21
-- ----------------------------------------------------------------------------
-- SÍNTOMA: "Generar / actualizar" del cronograma generó visitas para pacientes que
-- (clínicamente) NO randomizaron y nunca habían tenido visitas.
--
-- CAUSA RAÍZ: la migración 0021 (líneas 32-34) backfilleó
--     update enrollments set randomization_date = enrollment_date where randomization_date is null;
-- para TODOS los enrolamientos existentes, asumiendo que sus visitas ya existían. Pero los
-- protocolos SIN visit_definitions no tenían ninguna → esos enrolamientos quedaron con
-- randomization_date (= enrollment_date) y CERO visitas. El cronograma genera para todo
-- enrolamiento con randomization_date NOT NULL → les arma el calendario anclado en su
-- enrollment_date, hayan randomizado o no.
-- CRITERIO de la fecha: estimated = randomization_date + offset_days; para estos pacientes
-- randomization_date = enrollment_date (puesta por el backfill, NO por una randomización real).
--
-- ⚠️ DATOS REALES. La sección A es SOLO LECTURA. La sección C ESCRIBE y opera sobre una
--    LISTA EXPLÍCITA de enrolamientos que VOS confirmás como NO randomizados — nunca por
--    categoría/heurística en lote (regla dura del repo). Revisá A → confirmá → B → C.
-- ============================================================================


-- ── A · Inspección (SOLO LECTURA): candidatos con la firma del backfill 0021 ─
-- randomization_date == enrollment_date es la huella del backfill: por datos NO se puede
-- saber si randomizaron de verdad (a un pre-0021 randomizado también se le igualaron) →
-- revisá clínicamente cuáles NO randomizaron. Acotá a un protocolo si querés:
-- agregá  and e.protocol_id = '<PROTOCOL_ID>'  al WHERE.
select
  e.id            as enrollment_id,
  pr.code         as protocolo,
  pa.code         as ivrs,
  pa.full_name    as paciente,
  e.enrollment_date,
  e.randomization_date,
  e.screening_date,
  count(pv.id) filter (where pv.kind = 'programada' and pv.real_date is null) as programadas_no_atendidas,
  count(pv.id) filter (where pv.real_date is not null)                        as atendidas
from public.enrollments e
join public.protocols pr on pr.id = e.protocol_id
join public.patients  pa on pa.id = e.patient_id
left join public.patient_visits pv on pv.enrollment_id = e.id
where e.randomization_date = e.enrollment_date
group by e.id, pr.code, pa.code, pa.full_name, e.enrollment_date, e.randomization_date, e.screening_date
order by pr.code, pa.code;


-- ── B · (SOLO LECTURA) Previsualizar qué se borraría para una LISTA confirmada ─
-- Reemplazá la lista por los enrollment_id que confirmaste como NO randomizados (de A).
-- No borra nada: solo muestra las programadas no atendidas que se limpiarían.
-- select pv.id, pr.code as protocolo, pa.code as ivrs, pv.estimated_date, vd.code as visita
--   from public.patient_visits pv
--   join public.enrollments e  on e.id = pv.enrollment_id
--   join public.protocols   pr on pr.id = e.protocol_id
--   join public.patients    pa on pa.id = e.patient_id
--   left join public.visit_definitions vd on vd.id = pv.visit_def_id
--  where pv.enrollment_id in ('<ENR_1>', '<ENR_2>')   -- LISTA EXPLÍCITA confirmada
--    and pv.kind = 'programada' and pv.real_date is null
--  order by pr.code, pa.code, pv.estimated_date;


-- ── C · (ESCRIBE — descomentar SOLO tras revisar A y B) Corregir la data ─────
-- Para los enrolamientos NO randomizados de tu lista: (1) sacar la randomization_date
-- espuria (vuelve al paciente a pre-randomización; el trigger trg_generate_visits es
-- no-op con randomization_date null) y (2) borrar sus programadas NO atendidas.
-- Atómico, sobre la MISMA lista explícita. Las atendidas (real_date) NUNCA se tocan.
-- begin;
--   update public.enrollments
--      set randomization_date = null
--    where id in ('<ENR_1>', '<ENR_2>');
--   delete from public.patient_visits
--    where enrollment_id in ('<ENR_1>', '<ENR_2>')
--      and kind = 'programada' and real_date is null;
-- commit;
