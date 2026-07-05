-- Spira · Migración 0041 — Pharma: vista por-lote con EAN + estado de vencimiento
-- Aplicar A MANO en el SQL Editor (como postgres), después de la 0040. IDEMPOTENTE.
-- ----------------------------------------------------------------------------
-- Rediseño de la vista Medicamentos (handoff "Mejora visual Medicamentos"): la lista pasa a ser
-- POR LOTE (una fila por lote, con su código EAN13, su lote y su vencimiento), agrupada por
-- protocolo (Farmacia Protocolo) o plana (Farmacia Ambulatoria). `v_medication_stock` (0036) NO
-- sirve: agrega por SUM y no lleva `expiry_date`. Esta vista expone el grano por-lote que faltaba.
--
-- Decisiones del review (eng + design, 2026-07-04):
--   · EAN13: es por PRESENTACIÓN, no por lote (el mismo código se repite entre lotes). Traemos UN
--     código por medicamento vía subconsulta correlacionada (respeta la convención 1 código ↔ 1 med
--     de la 0032, y si hubiera >1 no hace fan-out de las filas-lote). `code` NULL → "Asignar código".
--   · Estado de vencimiento derivado EN SQL con umbral de 30 días. OJO: NO es un "reuso" de
--     v_ip_units — esa vista fue DROPEADA en la 0038; 30 es un literal nuevo, fuente única acá.
--     `expiry_date` NULL → vencido=false y por_vencer=false ⇒ el front lo trata como "vigente"/"—".
--   · Ambos ámbitos salen de la MISMA vista: protocolo (protocol_id no null) y ambulatoria
--     (protocol_id is null, ver CHECK de la 0035). El front filtra por protocol_id.
--   · security_invoker: respeta la RLS de medication_lots / medications / medication_codes.
-- ============================================================================

create or replace view public.v_medication_lots_detail
with (security_invoker = true) as
select
  ml.id                as lot_id,
  ml.medication_id,
  ml.protocol_id,
  ml.tipo,
  m.name,
  m.dosis,
  m.unit,
  d.name               as drug_name,
  ml.lot_number,
  ml.expiry_date,
  ml.quantity_on_hand,
  (select mc.code
     from public.medication_codes mc
    where mc.medication_id = ml.medication_id
    order by mc.created_at
    limit 1)           as code,
  (ml.expiry_date is not null and ml.expiry_date <  current_date)                                       as vencido,
  (ml.expiry_date is not null and ml.expiry_date >= current_date
                              and ml.expiry_date <  current_date + 30)                                  as por_vencer
from public.medication_lots ml
join public.medications m on m.id = ml.medication_id
left join public.drugs d on d.id = m.drug_id;

comment on view public.v_medication_lots_detail is
  'Una fila por lote (medication_lots) con nombre/monodroga/dosis, EAN13 (un código por medicamento), lote, vencimiento y estado de vencimiento (vencido / por_vencer <30d). Protocolo (protocol_id no null) y ambulatoria (protocol_id null) salen de la misma vista. 30d = literal nuevo (v_ip_units murió en 0038). 0041.';
