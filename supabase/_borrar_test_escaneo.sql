-- Borrado de los datos de prueba del ESCANEO POR UNIDAD (2026-08-13)
-- ============================================================================
-- NO es una migración: es un script de limpieza de una sola vez. Va en el editor
-- SQL de Supabase, después de leer esta cabecera entera.
--
-- QUÉ BORRA, Y NADA MÁS: los registros creados a mano el 2026-08-13 para verificar
-- el conteo por unidad y la sustitución, todos apuntados POR ID EXPLÍCITO.
--
--   protocolo    TEST-DISP                        6aa9a4a0-ad28-4caf-bc26-49bc3c35a102
--   paciente     TEST Escaneo Unidades            79504850-b936-49c5-8e97-c3984364a7c2
--   enrolamiento                                  62cfbba3-a989-4aed-8aea-9ea65d389021
--   visita       Firma, 13/08/2026                3eaa9583-5033-42bc-82dd-93943a222f2d
--   pedido       cancelada, 1 renglón             06c8e06d-9a3a-41cc-98ec-71ce94798b3f
--   medicamento  TEST Salbutral gemelo 100 mcg…   9f44ec23-da1f-4c0d-af6e-24cdd3ae6d9a
--   código       TEST-8888                        (del medicamento de arriba)
--
-- POR ID Y NO POR PATRÓN, a propósito. Un `like 'TEST%'` parece más cómodo y es
-- exactamente cómo se pierde data real: ya hay al menos un `TEST-9999` en
-- `medication_codes` que NO es de esta prueba y NO se toca. La regla dura #1 de
-- CLAUDE.md manda borrar lo creado, nunca "todo lo de tipo X".
--
-- NO HAY DISPENSACIÓN EJECUTADA que borrar: el pedido nunca se marcó lista, así
-- que no existe fila en `dispensations` ni movimiento de stock. Verificado antes
-- de escribir esto.
--
-- CÓMO CORRERLO. Las sentencias de un mismo bloque NO comparten sesión ni
-- transacción en el editor de Supabase: si una falla, lo anterior queda
-- committeado. Por eso cada una es idempotente y va en orden de dependencias —
-- reintentar es volver a pegar el bloque entero.
--
-- El `audit_log` conserva el rastro de todo esto, como corresponde: es inmutable
-- y no se toca.
-- ============================================================================

-- 1 · Renglones del pedido (hijos primero).
delete from public.dispensation_request_items
  where request_id = '06c8e06d-9a3a-41cc-98ec-71ce94798b3f';

-- 2 · El pedido.
delete from public.dispensation_requests
  where id = '06c8e06d-9a3a-41cc-98ec-71ce94798b3f';

-- 3 · Medicación habilitada para el paciente (las dos: Salbutral y el gemelo).
delete from public.patient_medications
  where enrollment_id = '62cfbba3-a989-4aed-8aea-9ea65d389021';

-- 4 · Medicación asignada al protocolo de prueba.
--     Acotado al protocolo TEST-DISP: Salbutral sigue asignado donde corresponda.
delete from public.protocol_medications
  where protocol_id = '6aa9a4a0-ad28-4caf-bc26-49bc3c35a102';

-- 5 · Código de barras del medicamento gemelo.
delete from public.medication_codes
  where medication_id = '9f44ec23-da1f-4c0d-af6e-24cdd3ae6d9a';

-- 6 · El medicamento gemelo del catálogo global.
--     Solo este id. El catálogo es compartido y el resto no se toca.
delete from public.medications
  where id = '9f44ec23-da1f-4c0d-af6e-24cdd3ae6d9a';

-- 7 · La visita. (El enrolamiento cascadea a sus visitas, pero se borra explícito
--     para que el orden se lea solo y para no depender de la cascada.)
delete from public.patient_visits
  where id = '3eaa9583-5033-42bc-82dd-93943a222f2d';

-- 8 · El enrolamiento.
delete from public.enrollments
  where id = '62cfbba3-a989-4aed-8aea-9ea65d389021';

-- 9 · El paciente.
delete from public.patients
  where id = '79504850-b936-49c5-8e97-c3984364a7c2';

-- 10 · El protocolo de prueba, último.
delete from public.protocols
  where id = '6aa9a4a0-ad28-4caf-bc26-49bc3c35a102';


-- ─ Comprobación: las cuatro cuentas tienen que dar CERO ────────────────────────
select
  (select count(*) from public.protocols            where id = '6aa9a4a0-ad28-4caf-bc26-49bc3c35a102') as protocolo,
  (select count(*) from public.patients             where id = '79504850-b936-49c5-8e97-c3984364a7c2') as paciente,
  (select count(*) from public.dispensation_requests where id = '06c8e06d-9a3a-41cc-98ec-71ce94798b3f') as pedido,
  (select count(*) from public.medications          where id = '9f44ec23-da1f-4c0d-af6e-24cdd3ae6d9a') as medicamento;
