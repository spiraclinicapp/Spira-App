-- Spira · Migración 0004 — Vistas (estado calculado, stock, facturación)

-- ============================================================================
-- 11 · VISTAS (estados calculados al leer)
-- security_invoker = true → respetan la RLS del usuario que consulta.
-- ============================================================================

-- 11.1 · Estado de visita calculado (los 6 estados, sin almacenarlos) -------
-- Réplica exacta de Track · calcVisitState (Spira Track/src/utils.js). Regla:
--   real_date NULL:  hoy > window_end → ventana_vencida
--                    (estimated_date - hoy) > 7 días → futura | si no → proxima
--   real_date set :  SOLO ítems obligatorios; deadline = real_date 00:00 + deadline_hours
--                    hay obligatorio vencido sin completar → item_vencido
--                    hay obligatorio pendiente (en plazo)  → realizada
--                    sin obligatorios pendientes           → completa
create or replace view public.v_patient_visits
with (security_invoker = true) as
select
  pv.*,
  (
    case
      when pv.real_date is null and current_date > pv.window_end          then 'ventana_vencida'
      when pv.real_date is null and (pv.estimated_date - current_date) > 7 then 'futura'
      when pv.real_date is null                                            then 'proxima'
      when exists (
        select 1 from public.checklist_items ci
        left join public.checklist_completions cc on cc.item_id = ci.id
        where ci.visit_id = pv.id and ci.mandatory and cc.id is null
          and now() > ((pv.real_date::timestamp + (ci.deadline_hours * interval '1 hour'))
                       at time zone 'America/Argentina/Buenos_Aires')
      ) then 'item_vencido'
      when exists (
        select 1 from public.checklist_items ci
        left join public.checklist_completions cc on cc.item_id = ci.id
        where ci.visit_id = pv.id and ci.mandatory and cc.id is null
      ) then 'realizada'
      else 'completa'
    end
  )::visit_status as computed_status
from public.patient_visits pv;
comment on view public.v_patient_visits is 'patient_visits + estado calculado al leer (no almacenado).';

-- 11.2 · Stock total por medicamento (suma de lotes) ------------------------
create or replace view public.v_medication_stock
with (security_invoker = true) as
select
  m.id as medication_id,
  m.protocol_id,
  m.name,
  m.unit,
  m.low_stock_threshold,
  coalesce(sum(ml.quantity_on_hand), 0) as total_stock,
  coalesce(sum(ml.quantity_on_hand), 0) <= m.low_stock_threshold as is_low_stock
from public.medications m
left join public.medication_lots ml on ml.medication_id = m.id
group by m.id;
comment on view public.v_medication_stock is 'Stock total por medicamento = suma de lotes + flag de stock bajo.';

-- 11.3 · Respaldo de facturación / liquidación a sponsors --------------------
create or replace view public.v_billing_dispensations
with (security_invoker = true) as
select
  d.id              as dispensation_id,
  d.correlative_number,
  d.delivered_at,
  p.code            as protocol_code,
  p.name            as protocol_name,
  p.sponsor,
  p.legal_entity,
  m.name            as medication,
  di.quantity,
  di.lot_number,
  di.expiry_date
from public.dispensations d
join public.dispensation_requests dr on dr.id = d.request_id
join public.patient_visits pv       on pv.id = dr.visit_id
join public.enrollments e           on e.id  = pv.enrollment_id
join public.protocols p             on p.id  = e.protocol_id
join public.dispensation_items di   on di.dispensation_id = d.id
join public.medications m           on m.id  = di.medication_id
where d.status = 'entregada';
comment on view public.v_billing_dispensations is 'Dispensaciones entregadas por protocolo/sponsor/entidad legal. Para contable.';
