-- ============================================================================
-- BORRAR la recepción de prueba del reskin "2c" — 2026-08-17
--
-- NO es una migración. Es un script de limpieza de un registro que creé yo para poder mirar la
-- card en estado pendiente y el paso a verificada, que no se podían ver: las diez recepciones de
-- la base estaban todas verificadas.
--
-- QUÉ SE CREÓ (recepción folio 11, ambulatoria, Salbutral 100 mcg, lote TEST-RESKIN-2C, 5 u.):
--   1. medication_receptions  — la recepción (folio 11)
--   2. reception_items        — su renglón (CASCADEA al borrar la recepción, no hace falta tocarlo)
--   3. medication_lots        — el lote TEST-RESKIN-2C, creado por el trigger apply_reception_stock
--   4. stock_movements        — el ingreso de 5 unidades, creado por el mismo trigger
--
-- POR QUÉ SE BORRA TAMBIÉN EL MOVIMIENTO. `stock_movements` es el libro insert-only y la regla es
-- que no se toca: registra hechos. Este no es un hecho, es una prueba. Y sobre todo: borrar el
-- lote y dejar el movimiento produce exactamente el descuadre que hoy está pendiente de
-- investigar —un movimiento apuntando a algo que ya no existe—, o sea ensuciaría la misma
-- pesquisa. Se van los cuatro, o no se va ninguno.
--
-- ORDEN OBLIGATORIO: movimiento → lote → recepción. `stock_movements.lot_id` referencia el lote,
-- así que el lote no se puede borrar antes que su movimiento.
--
-- APLICAR A MANO en el SQL Editor de Supabase (rol postgres). IDEMPOTENTE: correrlo de nuevo no
-- hace nada. Las sentencias NO comparten sesión ni transacción, por eso cada una se identifica
-- sola por el lote y el folio en vez de apoyarse en una tabla temporal.
-- ============================================================================


-- 0 · MIRAR ANTES DE BORRAR. Tiene que devolver exactamente 1 recepción, 1 renglón, 1 lote y
--     1 movimiento. Si devuelve algo distinto, PARAR y avisar.
select
  (select count(*) from public.medication_receptions r
     where r.folio = 11 and r.tipo = 'ambulatoria')                       as recepciones,
  (select count(*) from public.reception_items i
     where i.lot_number = 'TEST-RESKIN-2C')                               as renglones,
  (select count(*) from public.medication_lots l
     where l.lot_number = 'TEST-RESKIN-2C')                               as lotes,
  (select count(*) from public.stock_movements m
     where m.lot_id in (select l.id from public.medication_lots l
                         where l.lot_number = 'TEST-RESKIN-2C'))          as movimientos;


-- 1 · El movimiento de stock del ingreso. Acotado por el LOTE de prueba: no puede alcanzar
--     ningún movimiento de un lote real.
delete from public.stock_movements m
 where m.lot_id in (
   select l.id from public.medication_lots l where l.lot_number = 'TEST-RESKIN-2C'
 );


-- 2 · El lote de prueba. Si el borrado del paso 1 no corrió, este falla por la FK — que es
--     justamente la red que queremos.
delete from public.medication_lots l
 where l.lot_number = 'TEST-RESKIN-2C';


-- 3 · La recepción. Sus `reception_items` se van en cascada (0002:262).
--     Doble condición a propósito: el folio solo alcanzaría, pero el tipo lo confirma.
delete from public.medication_receptions r
 where r.folio = 11
   and r.tipo = 'ambulatoria'
   and exists (select 1 from public.reception_items i
                where i.reception_id = r.id and i.lot_number = 'TEST-RESKIN-2C');


-- 4 · CONFIRMAR: las cuatro cuentas tienen que dar 0.
select
  (select count(*) from public.medication_receptions r where r.folio = 11)            as recepciones,
  (select count(*) from public.reception_items i where i.lot_number = 'TEST-RESKIN-2C') as renglones,
  (select count(*) from public.medication_lots l where l.lot_number = 'TEST-RESKIN-2C') as lotes,
  (select count(*) from public.stock_movements m
     where m.lot_id in (select l.id from public.medication_lots l
                         where l.lot_number = 'TEST-RESKIN-2C'))                       as movimientos;

-- NOTA: el folio 11 queda consumido. La secuencia no se reinicia y la próxima recepción real será
-- la 12. Es correcto: un folio anulado es un hueco, no un número que se recicla.
