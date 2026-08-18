-- ============================================================================
-- BORRAR los datos de prueba de la anulación de recepciones — 2026-08-18
--
-- NO es una migración. Es la limpieza de los registros que creé yo para probar la feature de
-- anulación de punta a punta (PR #57), incluido el caso que define su diseño: el bloqueo cuando
-- del lote ya salieron unidades.
--
-- QUÉ SE CREÓ (recepción folio 12, ambulatoria, Salbutral 100 mcg, lote TEST-ANULAR-0818, 5 u.):
--   1. medication_receptions  — la recepción (folio 12), hoy en estado 'anulada'
--   2. reception_items        — su renglón (CASCADEA al borrar la recepción, no hay que tocarlo)
--   3. medication_lots        — el lote TEST-ANULAR-0818, creado por el trigger apply_reception_stock
--   4. stock_movements        — CUATRO asientos, en este orden:
--        +5  'recepcion'            (al verificar)
--        -3  'ajuste_manual'        (bajé el lote a 2 a propósito, para forzar el bloqueo)
--        +3  'ajuste_manual'        (lo devolví a 5)
--        -5  'anulacion_recepcion'  (la anulación, que dejó el lote en 0)
--
-- POR QUÉ SE BORRA TAMBIÉN EL LIBRO. `stock_movements` es insert-only y la regla es que no se
-- toca: registra hechos. Estos cuatro no son hechos, son una prueba. Y sobre todo: borrar el lote
-- y dejar los movimientos produce un movimiento apuntando a algo que ya no existe — el mismo
-- descuadre que el script de limpieza del reskin evitó en su momento. Se van los cuatro, o no se
-- va ninguno.
--
-- LA RECEPCIÓN ANULADA TAMBIÉN SE VA, y conviene decir por qué, porque parece contradecir la
-- feature: anular NO borra, y está bien que no borre. Pero esta recepción no documenta un
-- cargamento que llegó y se anuló: documenta una prueba de software sobre la base de producción.
-- Dejarla sería ensuciar el talonario con un folio que nunca existió como hecho clínico.
--
-- ORDEN OBLIGATORIO: movimientos → lote → recepción. `stock_movements.lot_id` referencia el lote
-- con `on delete restrict`, así que el lote no se puede borrar antes que sus movimientos.
--
-- APLICAR A MANO en el SQL Editor de Supabase (rol postgres). IDEMPOTENTE: correrlo de nuevo no
-- hace nada. Las sentencias NO comparten sesión ni transacción, por eso cada una se identifica
-- sola por el lote y el folio en vez de apoyarse en una tabla temporal.
-- ============================================================================


-- 0 · MIRAR ANTES DE BORRAR. Tiene que devolver exactamente 1 recepción (anulada), 1 renglón,
--     1 lote (en 0) y 4 movimientos. Si devuelve algo distinto, PARAR y avisar.
select
  (select count(*) from public.medication_receptions r
     where r.folio = 12 and r.tipo = 'ambulatoria' and r.status = 'anulada')  as recepciones_anuladas,
  (select count(*) from public.reception_items i
     where i.lot_number = 'TEST-ANULAR-0818')                                 as renglones,
  (select count(*) from public.medication_lots l
     where l.lot_number = 'TEST-ANULAR-0818')                                 as lotes,
  (select coalesce(sum(l.quantity_on_hand), -1) from public.medication_lots l
     where l.lot_number = 'TEST-ANULAR-0818')                                 as stock_del_lote,
  (select count(*) from public.stock_movements m
     where m.lot_id in (select l.id from public.medication_lots l
                         where l.lot_number = 'TEST-ANULAR-0818'))            as movimientos;


-- 1 · Los cuatro movimientos de stock. Acotado por el LOTE de prueba: no puede alcanzar ningún
--     movimiento de un lote real, porque el lot_id sale de la subconsulta por número de lote.
delete from public.stock_movements m
 where m.lot_id in (
   select l.id from public.medication_lots l where l.lot_number = 'TEST-ANULAR-0818'
 );


-- 2 · El lote de prueba. Si el borrado del paso 1 no corrió, este falla por la FK — que es
--     justamente la red que queremos.
delete from public.medication_lots l
 where l.lot_number = 'TEST-ANULAR-0818';


-- 3 · La recepción. Sus `reception_items` se van en cascada (0002:262).
--     Triple condición a propósito: el folio solo alcanzaría, pero el tipo y el renglón lo
--     confirman. Ojo: el `exists` mira reception_items, que todavía existe en este punto.
delete from public.medication_receptions r
 where r.folio = 12
   and r.tipo = 'ambulatoria'
   and exists (select 1 from public.reception_items i
                where i.reception_id = r.id and i.lot_number = 'TEST-ANULAR-0818');


-- 4 · CONFIRMAR: las cuatro cuentas tienen que dar 0.
select
  (select count(*) from public.medication_receptions r where r.folio = 12)               as recepciones,
  (select count(*) from public.reception_items i where i.lot_number = 'TEST-ANULAR-0818') as renglones,
  (select count(*) from public.medication_lots l where l.lot_number = 'TEST-ANULAR-0818') as lotes,
  (select count(*) from public.stock_movements m
     where m.lot_id in (select l.id from public.medication_lots l
                         where l.lot_number = 'TEST-ANULAR-0818'))                        as movimientos;

-- NOTA 1: el folio 12 queda consumido. La secuencia no se reinicia y la próxima recepción real
-- será la 13. Es correcto: un folio que se fue es un hueco, no un número que se recicla.
--
-- NOTA 2: el `audit_log` conserva la traza de todo esto —creación, verificación, ajustes,
-- anulación y estos borrados—, que es exactamente lo que se espera de él. Este script limpia el
-- estado operativo, no la historia.
