-- Spira · Migración 0153 — El reporte de Farmacia deja de contar dos veces una preparación cancelada.
--
-- APLICAR A MANO en el SQL Editor de Supabase (rol postgres), DESPUÉS de la 0152. IDEMPOTENTE.
--
-- ⚠️ NO es breaking en ninguna dirección: la vista conserva columnas, orden y tipos; sólo cambia lo que
--    suma `unidades`. Puede ir antes o después de cualquier deploy.
--
-- ⚠️ NUNCA dos signos peso pegados dentro de un comentario (ver CLAUDE.md, 0071).
--
-- EL BUG (verificado en el banco PGlite el 2026-10-04). Marcar lista una dispensación descuenta el
-- stock y asienta un `dispensacion` (trigger apply_dispensation_stock, 0071). Cancelar la preparación
-- la vuelve a `en_preparacion` y asienta un `devolucion`. Volver a marcarla lista REUSA la misma
-- dispensación (mark_dispensation_ready busca la que está en `en_preparacion`, 0141) y asienta OTRO
-- `dispensacion` con la misma referencia. El libro queda bien —salida, vuelta, salida: neto, una
-- salida— y el lote también. Pero v_pharma_report_items sumaba sólo `dispensacion`: contaba las dos
-- salidas e ignoraba la vuelta. En el banco: el lote perdió 5 unidades y el reporte decía 10.
--
-- Lo veía Farmacia › Estadísticas (`useReportItems`, `src/data/pharma/reports.ts`): las unidades
-- dispensadas de cada entrega con una preparación cancelada en el medio salían infladas. La reposición
-- (`reposicion_del_periodo`) NO tenía el problema: ya restaba `devolucion` desde la 0125.
--
-- EL ARREGLO. Sumar también `devolucion`, igual que la reposición. Una devolución con referencia a una
-- dispensación sólo la escribe ese trigger al cancelar la preparación, así que es exactamente la vuelta
-- que faltaba restar. Para una entrega sin cancelaciones no cambia nada.
--
-- Y SE REPITE `with (security_invoker = true)`: un `create or replace view` sin él lo pierde, y la vista
-- pasaría a mostrar todo sin la RLS de quien consulta. La 0151 también lo repitió; acá se vuelve a
-- dejar explícito y se verifica al pie.
--
-- Registrar en supabase/README.md al confirmarse en prod.
-- ============================================================================

-- Copia de la 0151 (que es la 0126 + `correccion_entrega`), con `devolucion` en el filtro.
create or replace view public.v_pharma_report_items with (security_invoker = true) as
select
  d.id                                  as dispensation_id,
  d.correlative_number,
  d.dispensation_code,
  d.delivered_at,
  -- Fecha LOCAL. Sin esto una entrega de las 21:30 cae al día siguiente y la serie diaria
  -- queda corrida. Mismo criterio que v_patient_visits (0004:30) y el resto del repo.
  (d.delivered_at at time zone 'America/Argentina/Buenos_Aires')::date as fecha,
  d.ip_kits,                            -- por DISPENSACIÓN: sumarlo sobre las filas duplica
  greatest(0, round(extract(epoch from (d.delivered_at - d.created_at)) / 60))::int
                                        as minutos_hasta_entrega,
  coalesce(sol.unidades, 0)             as unidades_solicitadas,
  dr.id                                 as request_id,
  dr.protocol_id,
  pr.code                               as protocol_code,
  pr.name                               as protocol_name,
  pr.sponsor,
  dr.visit_code,                        -- 0084
  dr.enrollment_id,
  e.patient_id,
  coalesce(e.ivrs_code, pa.code)                               as patient_code,
  pa.full_name                          as patient_name,
  mov.medication_id,
  m.name                                as medication_name,
  coalesce(mov.unidades, 0)             as unidades
from public.dispensations d
join public.dispensation_requests dr on dr.id = d.request_id
left join public.protocols   pr on pr.id = dr.protocol_id
left join public.enrollments e  on e.id  = dr.enrollment_id
left join public.patients    pa on pa.id = e.patient_id
left join lateral (
  select sum(dri.quantity)::int as unidades
    from public.dispensation_request_items dri
   where dri.request_id = dr.id
) sol on true
left join lateral (
  select sm.medication_id, sum(-sm.quantity_delta)::int as unidades
    from public.stock_movements sm
   where sm.reference_type = 'dispensation'
     and sm.reference_id   = d.id
     and sm.movement_type  in ('dispensacion', 'devolucion', 'correccion_entrega')   -- 0153: + devolucion
   group by sm.medication_id
  having sum(-sm.quantity_delta) <> 0
) mov on true
left join public.medications m on m.id = mov.medication_id
where d.status = 'entregada'
  and d.delivered_at is not null;

comment on view public.v_pharma_report_items is
  'patient_code = IVRS de la INSCRIPCIÓN (enrollments.ivrs_code, 0062), con fallback a patients.code para las filas legacy. 0126. Las unidades suman las correcciones de la entrega (0151) y restan la devolución de una preparación cancelada (0153).';

notify pgrst, 'reload schema';


-- Verificación (correr aparte, después): tiene que decir {security_invoker=true}.
--   select reloptions from pg_class where relname = 'v_pharma_report_items';
