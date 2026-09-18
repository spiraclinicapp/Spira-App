-- 0131 · Feedback: marcarlo como visto desde la bandeja
--
-- Las columnas seen_at/seen_by entraron con la 0129, sin nadie que las escribiera: la bandeja es la
-- entrega 2 y es la que las usa. Acá va sólo la función.
--
-- VA POR RPC Y NO POR UNA POLICY DE UPDATE, a propósito: la RLS no limita QUÉ COLUMNAS se pueden
-- tocar, así que una policy de update sobre `feedback` dejaría a gerencia reescribir el mensaje que
-- reportó otra persona. En una app auditable eso no se hace. Con SECURITY DEFINER, la única
-- escritura posible es la de estas dos columnas.
--
-- ORDEN: va DESPUÉS de la 0130 (desviaciones de protocolo). No depende de ella —sólo toca
-- `feedback`—, pero las migraciones se aplican en orden y la numeración no puede tener huecos.
--
-- ADITIVA: una función nueva que ningún front viejo llama. Va ANTES del deploy del front nuevo.
--
-- Diseño: docs/superpowers/specs/2026-09-17-feedback-con-lugar-design.md (entrega 2)

create or replace function public.mark_feedback_seen(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Tu sesión venció.' using errcode = '28000';
  end if;
  if not public.has_module('gerencia') then
    raise exception 'No tenés permiso para gestionar el feedback.' using errcode = '42501';
  end if;
  -- Idempotente: si ya estaba visto, no se pisa quién lo vio primero, que es el dato que sirve.
  update public.feedback set seen_at = now(), seen_by = v_uid where id = p_id and seen_at is null;
end;
$$;

comment on function public.mark_feedback_seen is 'Marca un feedback como visto (actor server-side vía auth.uid()). Sólo gerencia. Idempotente: si ya estaba visto no pisa quién lo vio primero. SECURITY DEFINER. 0131.';

grant execute on function public.mark_feedback_seen(uuid) to authenticated;
