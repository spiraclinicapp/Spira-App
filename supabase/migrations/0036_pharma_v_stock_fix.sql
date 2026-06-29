-- Spira · Migración 0036 — Pharma: fix de cardinalidad de v_medication_stock (review de la 0035)
-- ----------------------------------------------------------------------------
-- La 0035 agrupó la vista por `ml.tipo`, lo que duplica filas por (medicamento, protocolo)
-- si un protocolo tuviera lotes de tipos mixtos (protocolo + investigacion bajo el mismo
-- protocol_id, que el CHECK no prohíbe). Hoy es latente (no hay lotes 'investigacion'), pero
-- rompe la invariante "una fila por (medicamento, protocolo)" de los consumidores.
--
-- Fix: la rama de protocolo agrupa por (medicamento, protocolo) y usa `tipo` fijo 'protocolo';
-- la rama ambulatoria queda igual (una fila por medicamento, protocol_id null).
-- Aplicar A MANO después de la 0035. IDEMPOTENTE (create or replace view; misma firma de columnas).
-- ============================================================================

create or replace view public.v_medication_stock
with (security_invoker = true) as
select
  m.id as medication_id, pm.protocol_id, m.name, m.unit, m.low_stock_threshold,
  coalesce(sum(ml.quantity_on_hand), 0)                          as total_stock,
  coalesce(sum(ml.quantity_on_hand), 0) <= m.low_stock_threshold as is_low_stock,
  'protocolo'::public.reception_kind                              as tipo
from public.protocol_medications pm
join public.medications m on m.id = pm.medication_id
left join public.medication_lots ml
  on ml.medication_id = pm.medication_id and ml.protocol_id = pm.protocol_id
group by m.id, pm.protocol_id
union all
select
  m.id, null::uuid, m.name, m.unit, m.low_stock_threshold,
  coalesce(sum(ml.quantity_on_hand), 0),
  coalesce(sum(ml.quantity_on_hand), 0) <= m.low_stock_threshold,
  'ambulatoria'::public.reception_kind
from public.medications m
join public.medication_lots ml on ml.medication_id = m.id and ml.protocol_id is null
group by m.id;
comment on view public.v_medication_stock is 'Stock por (medicamento, ámbito): protocolo (una fila por med+protocolo, tipo fijo protocolo) + ambulatoria (protocol_id null). 0036 corrige el fan-out por ml.tipo de la 0035.';
