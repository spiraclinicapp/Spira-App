-- Spira · Migración 0073 — Sellar `ip_kits` y `delivered_at` una vez entregada.
-- Aplicar A MANO en el SQL Editor (como postgres), después de la 0072. IDEMPOTENTE.
--
-- POR QUÉ EXISTE. La 0071 sumó `dispensations.ip_kits` y le dio dos trabajos: es el número que sale
-- impreso en el comprobante y es el que `v_ip_stock` resta para calcular los kits disponibles del
-- protocolo. La UI le dice a la farmacéutica, con todas las letras, que ese número "no se puede
-- corregir después: entregada es definitiva" — y hasta le interrumpe la entrega con un pop-up para
-- que lo declare bien la primera vez, porque después no hay vuelta.
--
-- La base no lo sostenía. La política de RLS de `dispensations` habilita el update a todo el módulo
-- pharma (0006:287) y el guard de inmutabilidad (0003:268) protege solo `executed_by`, `request_id`,
-- `correlative_number` y la reversión del estado. `ip_kits` y `delivered_at` quedaban abiertos: un
-- PATCH directo a PostgREST, sin pasar por ninguna función, cambiaba los kits de una entrega ya
-- cerrada y con eso MOVÍA EL STOCK DE IP del protocolo — sin dejar rastro de que el papel archivado
-- dice otra cosa. En un sistema auditable la promesa de la pantalla y la garantía de la base tienen
-- que ser la misma; acá la pantalla prometía más de lo que la base cumplía.
--
-- QUÉ NO ROMPE. `deliver_dispensation` (0071 §9) escribe `ip_kits` mientras la dispensación todavía
-- está en `lista` y recién en un segundo update la pasa a `entregada`, así que el camino legítimo no
-- toca ninguno de los dos campos con `old.status = 'entregada'`. La corrección de un error real
-- sigue siendo posible por donde corresponde: `gerencia`, que ya tiene el delete de la tabla.
--
-- No cambia ninguna firma ni ninguna vista, así que NO es breaking para el front desplegado y puede
-- aplicarse en cualquier orden respecto del deploy.
--
-- ⚠️ Recordatorio heredado de la 0071 y la 0072: NUNCA escribir dos signos peso pegados dentro de un
--    comentario de un archivo .sql. El editor SQL de Supabase rastrea el dollar-quoting SIN ignorar
--    los comentarios, así que uno suelto le invierte la paridad, deja de reconocer los cuerpos de
--    función y los parte por sus `;` internos — con un error desconcertante y lejanísimo del
--    comentario culpable. Costó una tarde el 2026-08-10.
-- ============================================================================

-- `create or replace` sobre la función existente: el trigger `trg_guard_dispensation_immutable`
-- (0003:282) ya está creado sobre esta función y sigue apuntando a ella, así que no hay que tocarlo.
-- Se reescribe entera (no se "agrega" nada) para que el archivo muestre la regla completa y no haya
-- que leer dos migraciones para saber qué protege el guard.
create or replace function public.guard_dispensation_immutable()
returns trigger language plpgsql as $$
begin
  if new.executed_by is distinct from old.executed_by
     or new.request_id is distinct from old.request_id
     or new.correlative_number is distinct from old.correlative_number then
    raise exception 'No se pueden modificar executed_by/request_id/correlative_number de una dispensación';
  end if;

  if old.status = 'entregada' and new.status is distinct from 'entregada' then
    raise exception 'No se puede revertir una dispensación ya entregada';
  end if;

  -- Nuevo en la 0073. Una vez entregada, el número de kits y el momento del retiro son el papel:
  -- están impresos en el comprobante que se archiva y el stock de IP se deriva de ellos.
  if old.status = 'entregada' then
    if new.ip_kits is distinct from old.ip_kits then
      raise exception 'No se pueden corregir los kits de IP de una dispensación ya entregada'
        using errcode = 'check_violation';
    end if;
    if new.delivered_at is distinct from old.delivered_at then
      raise exception 'No se puede cambiar la fecha de entrega de una dispensación ya entregada'
        using errcode = 'check_violation';
    end if;
  end if;

  return new;
end;
$$;

comment on function public.guard_dispensation_immutable() is
  'Inmutabilidad de la dispensación. Además de la identidad (executed_by/request_id/correlative_number) '
  'y de la no-reversión del estado, desde la 0073 sella ip_kits y delivered_at una vez entregada: los '
  'dos salen impresos en el comprobante y v_ip_stock deriva el stock de IP de ip_kits.';
