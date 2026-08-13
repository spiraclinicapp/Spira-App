-- Borrado de lotes de prueba con stock fantasma (2026-08-13)
-- ============================================================================
-- NO es una migración: limpieza de una sola vez, para el editor SQL de Supabase.
--
-- QUÉ BORRA: cuatro lotes de prueba que inflan el inventario, y sus movimientos
-- de stock. Todo POR ID EXPLÍCITO.
--
--   TEST-LOTE  Frevia 160/4,5 mcg      ACT18301   7 u.   bdaed155-…
--   TEST01     Donepecilo 10 mg        ACT18301   1 u.   6ec61e0a-…
--   TEST02     Donepecilo 10 mg        ACT18301   1 u.   a26d6ad0-…
--   TEST 9     Trelegy Ellipta (92)    (ninguno)  1 u.   75326f6d-…
--
--   + el código de barras TEST-9999 (único código de Frevia).
--
-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ DOS LOTES QUE PARECÍAN IGUALES Y NO LO SON — NO SE BORRAN                 │
-- │                                                                           │
-- │   TEST01  Alvetide 92/22 mcg  ACT18301  4 u.  → tiene una ENTREGA hecha.   │
-- │   test    Alvetide 184/22     PROT-A    2 u.  → tiene movimientos de       │
-- │                                                 dispensación en el libro.  │
-- │                                                                           │
-- │ Los dos son trazabilidad de dispensaciones que ocurrieron. Borrarlos       │
-- │ rompería el libro de stock de un protocolo real.                          │
-- │                                                                           │
-- │ ⚠️ Y OJO CON CÓMO SE MIDE ESO: `dispensation_items` NO alcanza — esa tabla │
-- │ se VACÍA cuando una dispensación se cancela (0054/0057), así que un lote   │
-- │ usado puede aparecer con cero renglones. La señal correcta es              │
-- │ `stock_movements`, que es el libro y no se borra nunca.                    │
-- └──────────────────────────────────────────────────────────────────────────┘
--
-- POR ID Y NO POR PATRÓN: un `like 'TEST%'` sobre `lot_number` se habría llevado
-- los dos de arriba. Es exactamente el borrado en lote por categoría que ya costó
-- data real una vez (regla dura #1 de CLAUDE.md).
--
-- LAS RECEPCIONES NO SE TOCAN. Cada lote nació de una recepción, pero se enlazan
-- por número de lote (texto), no por FK: borrar el lote no las rompe. Y no deben
-- borrarse — son nota fuente de lo que físicamente llegó. Queda entonces una
-- recepción que dice "llegaron 10 de Frevia" sin lote vivo: es correcto, es la
-- diferencia entre el historial de lo que entró y el stock de lo que hay.
--
-- ORDEN OBLIGATORIO: `stock_movements` y `dispensation_items` apuntan a los lotes
-- con ON DELETE RESTRICT, así que los movimientos van PRIMERO o el borrado del
-- lote falla. Y las sentencias de un mismo bloque NO comparten transacción en el
-- editor de Supabase: si una falla, lo anterior queda committeado. Por eso cada
-- una es idempotente y reintentar es volver a pegar el bloque entero.
-- ============================================================================

-- 1 · Los movimientos de stock de esos cuatro lotes (5 filas en total).
delete from public.stock_movements
  where lot_id in (
    'bdaed155-34e6-4599-918a-2773ba32a8df',  -- TEST-LOTE  · Frevia
    '6ec61e0a-0c21-484a-9057-9a3fdb7b941d',  -- TEST01     · Donepecilo
    'a26d6ad0-f8cc-4e09-87ce-acdd1a54fe51',  -- TEST02     · Donepecilo
    '75326f6d-e826-4d73-9e6c-a6cd232e99a0'   -- TEST 9     · Trelegy
  );

-- 2 · Los lotes.
delete from public.medication_lots
  where id in (
    'bdaed155-34e6-4599-918a-2773ba32a8df',
    '6ec61e0a-0c21-484a-9057-9a3fdb7b941d',
    'a26d6ad0-f8cc-4e09-87ce-acdd1a54fe51',
    '75326f6d-e826-4d73-9e6c-a6cd232e99a0'
  );

-- 3 · El código de barras de prueba.
--     OJO: es el ÚNICO código de Frevia 160/4,5 mcg. Sin él, ese medicamento no
--     se puede escanear hasta que se le asigne su GTIN real desde el Catálogo.
delete from public.medication_codes
  where code = 'TEST-9999';


-- ─ Comprobación: las tres primeras en CERO, las dos últimas intactas ──────────
select
  (select count(*) from public.medication_lots
     where id in ('bdaed155-34e6-4599-918a-2773ba32a8df','6ec61e0a-0c21-484a-9057-9a3fdb7b941d',
                  'a26d6ad0-f8cc-4e09-87ce-acdd1a54fe51','75326f6d-e826-4d73-9e6c-a6cd232e99a0')) as lotes_borrados_debe_dar_0,
  (select count(*) from public.stock_movements
     where lot_id in ('bdaed155-34e6-4599-918a-2773ba32a8df','6ec61e0a-0c21-484a-9057-9a3fdb7b941d',
                      'a26d6ad0-f8cc-4e09-87ce-acdd1a54fe51','75326f6d-e826-4d73-9e6c-a6cd232e99a0')) as movimientos_debe_dar_0,
  (select count(*) from public.medication_codes where code = 'TEST-9999') as codigo_debe_dar_0,
  (select count(*) from public.medication_lots where id = '5935f881-f593-46fb-b635-7024f0b9ca1a') as alvetide_92_debe_dar_1,
  (select count(*) from public.medication_lots where id = '83c1da8a-51ca-4515-8be1-6bef93f6fb46') as alvetide_184_debe_dar_1;
