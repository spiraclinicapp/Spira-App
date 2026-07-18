-- 0057 · Dispensación · cancelar libera el código
-- ============================================================================
-- Encontrado en el QA logueado del 2026-07-18, probando el camino de cancelación.
--
-- El código `D-{n}-{ddmmyy}-{iniciales}` lleva las iniciales de QUIEN DISPENSA.
-- Hasta acá, cancelar una preparación ya marcada lista devolvía el stock pero
-- dejaba el código pegado a la solicitud (para no perder el N° de comprobante).
-- Consecuencia: si otra farmacéutica tomaba después esa misma solicitud y la
-- entregaba, el comprobante que se sella y firma salía con las iniciales de la
-- primera. El documento que va a la carpeta del paciente mentía sobre quién
-- dispensó.
--
-- DECISIÓN (Director, 2026-07-18): cancelar LIBERA el código. Al volver a marcar
-- lista se sella de nuevo, con la fecha y las iniciales de quien realmente lo
-- hace. `mark_dispensation_ready` ya sella solo cuando el código es null, así que
-- no hay que tocarla: alcanza con nullear al cancelar.
--
-- Qué se conserva y qué no:
--   · `correlative_number` (N° de comprobante) SE CONSERVA. Es la numeración de la
--     nota fuente y no puede tener huecos — es el motivo por el que la fila
--     `dispensations` no se borra al cancelar.
--   · `daily_number` se libera y NO se devuelve al contador: si se cancela la D-1
--     del día, la próxima es la D-2. El hueco es aceptable, es un identificador
--     operativo, no la numeración legal. Preferimos un hueco antes que unas
--     iniciales equivocadas en un documento firmado.
-- ============================================================================


-- 1 · La inmutabilidad admite una excepción: liberar mientras se prepara ------
-- Sigue prohibido MODIFICAR un código por otro, y prohibido tocar cualquier cosa
-- de una dispensación ya entregada. Lo único que se permite es volverlo a NULL
-- mientras la dispensación está en preparación (es decir, al cancelar).
create or replace function public.dispensation_code_immutable()
returns trigger language plpgsql as $$
declare v_liberando boolean;
begin
  -- liberación válida: el código se va a null y la dispensación quedó en preparación
  v_liberando := new.dispensation_code is null
                 and new.daily_number is null
                 and new.status = 'en_preparacion';

  if v_liberando then
    return new;
  end if;

  if old.dispensation_code is not null
     and new.dispensation_code is distinct from old.dispensation_code then
    raise exception 'No se puede modificar el código de una dispensación ya emitida';
  end if;
  if old.daily_number is not null and new.daily_number is distinct from old.daily_number then
    raise exception 'No se puede modificar el correlativo diario de una dispensación';
  end if;
  return new;
end; $$;


-- 2 · Cancelar la preparación libera el código -------------------------------
create or replace function public.cancel_dispensation_preparation(p_request_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_status request_status; v_disp_id uuid; v_disp_status dispensation_status;
begin
  if auth.uid() is null then raise exception 'No autenticado' using errcode = '42501'; end if;
  if not public.has_min_role('pharma','operator') then
    raise exception 'Solo Pharma (operador) puede cancelar una preparación' using errcode = '42501';
  end if;

  select status into v_status
  from public.dispensation_requests where id = p_request_id for update;
  if not found then raise exception 'Solicitud inexistente' using errcode = '23503'; end if;
  if v_status <> 'preparando' then
    raise exception 'Esta solicitud no está en preparación (estado actual: %)', v_status
      using errcode = 'check_violation';
  end if;

  select id, status into v_disp_id, v_disp_status
  from public.dispensations
  where request_id = p_request_id and status in ('en_preparacion','lista')
  for update;

  if found then
    -- Un solo update: vuelve a preparación (el trigger de stock devuelve el lote si
    -- venía de 'lista') y libera el código en el mismo statement, que es lo que el
    -- trigger de inmutabilidad reconoce como liberación válida.
    update public.dispensations
      set status = 'en_preparacion', dispensation_code = null, daily_number = null
      where id = v_disp_id;
    -- Los renglones se borran DESPUÉS: el trigger de stock los necesita para saber
    -- cuánto devolver.
    delete from public.dispensation_items where dispensation_id = v_disp_id;
  end if;

  update public.dispensation_request_items
    set scanned_at = null, scanned_by = null
    where request_id = p_request_id;

  update public.dispensation_requests
    set status = 'solicitada', prepared_by = null, preparation_started_at = null
    where id = p_request_id;
end; $$;
revoke all on function public.cancel_dispensation_preparation(uuid) from public;
grant execute on function public.cancel_dispensation_preparation(uuid) to authenticated;


-- 3 · Rechazar también libera --------------------------------------------------
-- Mismo motivo: rechazar desde 'lista' revierte el stock, así que el código de esa
-- preparación abortada no debe sobrevivir.
create or replace function public.reject_dispensation_request(p_request_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare v_status request_status; v_disp_id uuid; v_disp_status dispensation_status;
begin
  if auth.uid() is null then raise exception 'No autenticado' using errcode = '42501'; end if;
  if not public.has_min_role('pharma','operator') then
    raise exception 'Solo Pharma (operador) puede rechazar solicitudes' using errcode = '42501';
  end if;
  if nullif(btrim(coalesce(p_reason,'')),'') is null then
    raise exception 'El rechazo requiere un motivo' using errcode = 'check_violation';
  end if;

  select status into v_status from public.dispensation_requests where id = p_request_id for update;
  if not found then raise exception 'Solicitud inexistente' using errcode = '23503'; end if;
  if v_status not in ('solicitada','preparando') then
    raise exception 'Solo se puede rechazar una solicitud pendiente o en preparación (estado actual: %)', v_status
      using errcode = 'check_violation';
  end if;

  select id, status into v_disp_id, v_disp_status
  from public.dispensations
  where request_id = p_request_id and status in ('en_preparacion','lista')
  for update;

  if found then
    update public.dispensations
      set status = 'en_preparacion', dispensation_code = null, daily_number = null
      where id = v_disp_id;
    delete from public.dispensation_items where dispensation_id = v_disp_id;
  end if;

  update public.dispensation_request_items
    set scanned_at = null, scanned_by = null
    where request_id = p_request_id;

  update public.dispensation_requests
    set status = 'rechazada', rejection_reason = btrim(p_reason)
    where id = p_request_id;
end; $$;
revoke all on function public.reject_dispensation_request(uuid, text) from public;
grant execute on function public.reject_dispensation_request(uuid, text) to authenticated;


-- 4 · Limpieza de lo que dejó el QA -------------------------------------------
-- La solicitud de prueba del 2026-07-18 quedó en 'solicitada' con el código todavía
-- pegado (se canceló ANTES de este fix). Se libera para que no arrastre iniciales
-- de una preparación que ya no existe. Acotado a dispensaciones en preparación sin
-- renglones: no toca ninguna dispensación lista ni entregada.
update public.dispensations
  set dispensation_code = null, daily_number = null
  where status = 'en_preparacion'
    and dispensation_code is not null
    and not exists (
      select 1 from public.dispensation_items di where di.dispensation_id = dispensations.id
    );
