-- 0081 · El error del lector dice UNA cosa: qué pasó con la caja que se pasó
-- ============================================================================
-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ "NO ME GUSTA QUE DIGA REVISÁ LA CAJA. TIENE QUE DECIR ALVETIDE NO FIGURA  │
-- │  EN ESTE PEDIDO Y LISTO, EL RESTO ESTÁ DEMÁS" (Director, 2026-08-15)      │
-- │                                                                           │
-- │ La 0080 arregló el mensaje que mentía, pero lo dejó largo:                │
-- │                                                                           │
-- │   "Alvetide 184/22 mcg no figura en este pedido. Revisá la caja.          │
-- │    Falta Alvetide 92/22 mcg · Symbicort Forte 320/9 mcg"                  │
-- │                                                                           │
-- │ Dos cosas sobran, cada una por su motivo:                                 │
-- │                                                                           │
-- │   · "Revisá la caja" es una INSTRUCCIÓN, y de las obvias. Quien tiene el  │
-- │     lector en la mano ya sabe qué hacer cuando algo no entra; el sistema  │
-- │     tiene que decir el hecho, no dar indicaciones.                        │
-- │   · "Falta X · Y" ya está en pantalla, a la izquierda, en el riel del     │
-- │     proceso, con su contador por renglón. Repetirlo dentro del error es   │
-- │     decir lo mismo dos veces en la misma pantalla — y encima empuja el    │
-- │     hecho importante (esta caja no es de acá) a un segundo renglón.       │
-- │                                                                           │
-- │ El error habla SOLO de la caja que se acaba de pasar. Lo que falta es     │
-- │ trabajo del riel, que para eso está.                                      │
-- └──────────────────────────────────────────────────────────────────────────┘
--
-- Al quedar los cuatro mensajes independientes de lo pendiente, la consulta que
-- juntaba los nombres (`v_pendientes`) deja de tener uso y se va. Menos SQL
-- corriendo en el camino más caliente de la pantalla.
--
-- Se reescribe ENTERA desde la 0080, su última versión. FIRMA IDÉNTICA
-- `(uuid, text)`: `create or replace` reemplaza de verdad, sin dejar sobrecarga.
--
-- ORDEN DE DESPLIEGUE: indistinto. Solo cambia el texto de un error que el front
-- muestra tal cual viene. Aditiva y no breaking. Idempotente.

create or replace function public.scan_dispensation_item(p_request_id uuid, p_code text)
returns table (item_id uuid, medication_name text, remaining integer)
language plpgsql security definer set search_path = public as $$
declare
  v_status        request_status;
  v_medication_id uuid;
  v_med_name      text;
  v_item_id       uuid;
  v_en_pedido     boolean;
  v_sustituido    boolean;
begin
  if auth.uid() is null then raise exception 'No autenticado' using errcode = '42501'; end if;
  if not public.has_min_role('pharma','operator') then
    raise exception 'Solo Pharma (operador) puede escanear' using errcode = '42501';
  end if;

  select dr.status into v_status
  from public.dispensation_requests dr where dr.id = p_request_id for update;
  if not found then raise exception 'Solicitud inexistente' using errcode = '23503'; end if;
  if v_status <> 'preparando' then
    raise exception 'Esta solicitud no está en preparación (estado actual: %)', v_status
      using errcode = 'check_violation';
  end if;

  select mc.medication_id into v_medication_id
  from public.medication_codes mc
  where mc.code = btrim(p_code);
  if not found then
    raise exception 'Ese código de barras no está en el catálogo' using errcode = 'no_data_found';
  end if;

  select coalesce(m.name, 'Ese producto') into v_med_name
  from public.medications m where m.id = v_medication_id;

  -- Pendiente es "le faltan UNIDADES", no "no tiene scanned_at".
  -- `for update` sobre la fila: dos farmacéuticas escaneando el mismo pedido se
  -- serializan acá en vez de pisarse el conteo (el incremento de abajo es sobre
  -- la columna, nunca un valor leído en el cliente).
  select dri.id into v_item_id
  from public.dispensation_request_items dri
  where dri.request_id = p_request_id
    and dri.medication_id = v_medication_id
    and dri.scanned_units < dri.quantity
  order by dri.id
  limit 1
  for update;

  if not found then
    -- Las tres explicaciones posibles, cada una con su frase y ninguna con cola.
    select exists (
      select 1 from public.dispensation_request_items dri
      where dri.request_id = p_request_id and dri.medication_id = v_medication_id
    ) into v_en_pedido;

    if v_en_pedido then
      raise exception '% ya tiene sus unidades escaneadas', v_med_name
        using errcode = 'check_violation';
    end if;

    -- Sustituido (0076): la caja que se tiene en la mano es la que el pedido ya
    -- no pide. Se distingue de "no figura" porque manda a mirar el renglón, no a
    -- la estantería.
    select exists (
      select 1 from public.dispensation_request_items dri
      where dri.request_id = p_request_id
        and dri.substituted_from_medication_id = v_medication_id
    ) into v_sustituido;

    if v_sustituido then
      raise exception '% fue sustituido en este pedido', v_med_name
        using errcode = 'check_violation';
    end if;

    raise exception '% no figura en este pedido', v_med_name
      using errcode = 'check_violation';
  end if;

  -- INCREMENTO ATÓMICO: se suma sobre la columna, no sobre un valor traído antes.
  -- Leer-sumar-escribir desde el cliente perdería pasadas en silencio cuando dos
  -- lectores disparan a la vez sobre el mismo renglón.
  update public.dispensation_request_items dri
    set scanned_units = dri.scanned_units + 1,
        scanned_at    = now(),
        scanned_by    = auth.uid()
    where dri.id = v_item_id;

  return query
    select v_item_id,
           v_med_name,
           -- `remaining` cuenta UNIDADES pendientes de todo el pedido. El front
           -- solo pregunta si es 0, y cero sigue queriendo decir "no falta nada".
           (select coalesce(sum(dri.quantity - dri.scanned_units), 0)::integer
              from public.dispensation_request_items dri
             where dri.request_id = p_request_id);
end; $$;
revoke all on function public.scan_dispensation_item(uuid, text) from public;
grant execute on function public.scan_dispensation_item(uuid, text) to authenticated;

comment on function public.scan_dispensation_item(uuid, text) is
  'Confirma UNA unidad del renglón que corresponde al código escaneado (0075). Desde la 0080 distingue si el producto no figura en el pedido, si fue sustituido o si ya está completo. Desde la 0081 el mensaje habla SOLO de la caja escaneada: lo que falta lo dice el riel del cajón, y repetirlo acá era decir lo mismo dos veces.';
