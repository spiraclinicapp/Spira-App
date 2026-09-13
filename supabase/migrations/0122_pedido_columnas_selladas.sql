-- Spira · Migración 0122 — Las columnas selladas del pedido no se cambian por fuera de la app.
-- Plan: docs/plan-dispensacion-base-e-imp.md (Tanda 2, cierre del hallazgo del QA del 2026-09-13).
--
-- APLICAR A MANO en el SQL Editor de Supabase (rol postgres), DESPUÉS de la 0121.
-- IDEMPOTENTE: reintentar es volver a correr el archivo entero.
--
-- ⚠️ NO ES BREAKING, se puede aplicar antes o después de cualquier deploy: el front NUNCA hace un
--    UPDATE directo sobre dispensation_requests; todo lo que escribe va por funciones SECURITY
--    DEFINER, que este guard deja pasar.
--
-- ⚠️ NUNCA dos signos peso pegados dentro de un comentario (ver CLAUDE.md, 0071).
--
-- POR QUÉ. La 0121 cerró la escritura directa de Coordinación, pero la policy «pharma atiende
-- solicitud» (0009:161-163) sigue dejando a Farmacia y a gerencia hacer UPDATE de CUALQUIER columna
-- del pedido por PostgREST. En el QA se probó: un PATCH puso `includes_ip = true` en un pedido de pura
-- base (se revirtió en el acto). Con eso se puede:
--   · prender o apagar el IP de un pedido → el mostrador exige una constancia y kits que no existen, o
--     la alerta «IP sin entregar» (0119) se apaga sin que el IP se haya entregado;
--   · cambiar `protocol_id` → el tablero y el stock de IP imputan el pedido al estudio equivocado;
--   · borrar la marca de excepción o el sello de base → el comprobante deja de decirle a un monitor
--     que la entrega no estaba prevista.
--
-- CÓMO. Estas columnas las escribe el SERVIDOR (create_dispensation_request, add_dispensation_items,
-- attach_ip_document, seal_request_protocol). Todas son SECURITY DEFINER: adentro, `current_user` es
-- el dueño de la función. Una escritura directa por PostgREST, en cambio, corre como `authenticated`.
-- El guard mira eso y nada más: no hace falta listar funciones permitidas, y una función nueva que
-- selle estas columnas pasa sola.
--
-- El trigger es SECURITY INVOKER (el default) a propósito: si fuera definer, `current_user` sería
-- siempre el dueño y el guard no distinguiría nada.
--
-- Qué NO cubre, y queda anotado: el ESTADO del pedido (`status`) sigue siendo modificable por esa
-- policy. No estaba en lo decidido y cerrarlo toca el flujo de Farmacia; va a TODOS.md.
--
-- Registrar en supabase/README.md al confirmarse en prod.
-- ============================================================================

create or replace function public.guard_request_sealed_columns()
returns trigger language plpgsql as $fn$
begin
  -- Escrituras hechas por el servidor (funciones SECURITY DEFINER, el SQL Editor, service_role):
  -- pasan. Sólo se frenan los roles con los que llega una escritura directa desde el navegador.
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if new.protocol_id         is distinct from old.protocol_id
     or new.enrollment_id    is distinct from old.enrollment_id
     or new.visit_code       is distinct from old.visit_code
     or new.includes_ip      is distinct from old.includes_ip
     or new.off_schedule     is distinct from old.off_schedule
     or new.off_schedule_reason is distinct from old.off_schedule_reason
     or new.base_sin_cronograma is distinct from old.base_sin_cronograma then
    raise exception 'Estos datos del pedido los sella el sistema: no se cambian a mano.'
      using errcode = '42501';
  end if;

  return new;
end;
$fn$;

comment on function public.guard_request_sealed_columns() is
  'Frena los UPDATE directos (roles authenticated/anon) sobre las columnas que sella el servidor en dispensation_requests: protocol_id, enrollment_id, visit_code, includes_ip, off_schedule, off_schedule_reason y base_sin_cronograma. Las funciones SECURITY DEFINER de la app pasan porque adentro current_user es su dueño. 0122.';

drop trigger if exists trg_guard_request_sealed on public.dispensation_requests;
create trigger trg_guard_request_sealed
  before update on public.dispensation_requests
  for each row execute function public.guard_request_sealed_columns();
