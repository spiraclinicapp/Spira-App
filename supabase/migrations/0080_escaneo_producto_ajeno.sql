-- 0080 · El escaneo distingue "ya está completo" de "no es de este pedido"
-- ============================================================================
-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ EL MENSAJE MENTÍA, Y MENTÍA JUSTO CUANDO MÁS IMPORTA                      │
-- │                                                                           │
-- │ Reportado el 2026-08-15 desde el mostrador: un pedido con                 │
-- │   · Alvetide 92/22 mcg   1/1  (completo)                                  │
-- │   · Symbicort Forte      0/1  (pendiente)                                 │
-- │ recibe la pasada de un ALVETIDE 184/22 mcg —otra concentración, que no    │
-- │ está en el pedido— y la farmacéutica lee:                                 │
-- │                                                                           │
-- │   "Alvetide 184/22 mcg ya tiene sus unidades escaneadas."                 │
-- │                                                                           │
-- │ Que es falso: ese producto no se escaneó nunca acá, ni figura en el       │
-- │ pedido. La pregunta que deja es "¿dónde lo escaneé?" — y la respuesta     │
-- │ correcta era "agarraste la caja equivocada de la estantería".             │
-- │                                                                           │
-- │ CAUSA: la 0075 buscaba un renglón PENDIENTE de ese medicamento y, al no   │
-- │ encontrarlo, asumía una sola explicación (el renglón está completo). Hay  │
-- │ tres, y en una farmacia de investigación son bien distintas:              │
-- │   a) el renglón existe y está completo   → pasaste la caja dos veces      │
-- │   b) el producto NO está en el pedido    → es de otro paciente/protocolo  │
-- │   c) estaba, y se SUSTITUYÓ por otro     → tenés la caja vieja en la mano │
-- │ Confundir (b) con (a) es lo que hace que una equivocación de estantería   │
-- │ se lea como un problema del sistema.                                      │
-- └──────────────────────────────────────────────────────────────────────────┘
--
-- Se reescribe ENTERA desde la 0075 (su última versión), no parcheada: lo único
-- que cambia es la rama del `if not found`. El incremento atómico, el `for
-- update` del renglón y el `remaining` sobre unidades se conservan verbatim.
--
-- FIRMA IDÉNTICA `(uuid, text)`, a propósito: `create or replace` reemplaza de
-- verdad. Si algún día hay que sumarle un parámetro, va `drop function` explícito
-- primero — cambiar la firma deja una sobrecarga viva y Postgres resuelve la
-- llamada vieja con la función vieja (la trampa que documenta la 0075 §5).
--
-- ORDEN DE DESPLIEGUE: indistinto. No cambia firma, ni tipo de retorno, ni el
-- contrato de `remaining`; solo redacta mejor un error que el front ya muestra
-- tal cual viene. El front desplegado funciona igual antes y después.
-- Aditiva y no breaking. Idempotente.

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
  v_pendientes    text;
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

  -- El nombre se resuelve UNA vez y se guarda: los tres mensajes de abajo lo
  -- necesitan, y repetir la subconsulta dentro de cada `raise` fue lo que hizo
  -- ilegible la versión anterior.
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
    -- ¿El producto figura en el pedido, aunque sea ya completo?
    select exists (
      select 1 from public.dispensation_request_items dri
      where dri.request_id = p_request_id and dri.medication_id = v_medication_id
    ) into v_en_pedido;

    -- ¿O figuraba, y alguien lo sustituyó? Es un caso real desde la 0076 y sin
    -- nombrarlo la farmacéutica busca en la estantería una caja que el pedido
    -- ya no pide.
    select exists (
      select 1 from public.dispensation_request_items dri
      where dri.request_id = p_request_id
        and dri.substituted_from_medication_id = v_medication_id
    ) into v_sustituido;

    -- Qué falta de verdad. Hasta tres nombres: con más, el error se vuelve un
    -- párrafo y deja de leerse de un vistazo mientras se pasan cajas.
    select string_agg(t.name, ' · ') into v_pendientes
    from (
      select m.name
      from public.dispensation_request_items dri
      join public.medications m on m.id = dri.medication_id
      where dri.request_id = p_request_id and dri.scanned_units < dri.quantity
      order by m.name
      limit 3
    ) t;

    if not v_en_pedido then
      if v_sustituido then
        raise exception '% fue sustituido en este pedido, así que ya no se escanea. Falta %',
          v_med_name, coalesce(v_pendientes, 'nada: está todo escaneado')
          using errcode = 'check_violation';
      end if;
      -- EL CASO DEL REPORTE. Nombra el producto que se pasó, dice que no
      -- pertenece a este pedido y a continuación qué sí hay que buscar.
      raise exception '% no figura en este pedido. Revisá la caja. Falta %',
        v_med_name, coalesce(v_pendientes, 'nada: está todo escaneado')
        using errcode = 'check_violation';
    end if;

    if v_pendientes is null then
      raise exception 'Este pedido ya tiene todas sus unidades escaneadas'
        using errcode = 'check_violation';
    end if;

    -- Figura y está completo: el error más frecuente del mostrador, pasar dos
    -- veces la misma caja.
    raise exception '% ya tiene sus unidades escaneadas. Falta %', v_med_name, v_pendientes
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
  'Confirma UNA unidad del renglón que corresponde al código escaneado (0075). Desde la 0080 distingue en el error si el producto no figura en el pedido, si fue sustituido o si ya está completo: los tres se leían como "ya tiene sus unidades escaneadas" y mandaban a buscar un escaneo que nunca existió.';
