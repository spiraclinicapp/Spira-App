-- 0075 · Dispensación · el escaneo pasa a contar UNIDADES, y la constancia se marca impresa
-- ============================================================================
-- REQUIERE la 0074 aplicada.
--
-- Viene del handoff "Dispensación · paso a paso B" (design_handoff_dispensacion_pasoapaso/).
--
-- QUÉ CAMBIA, EN UNA LÍNEA: hasta acá una pasada del lector confirmaba un RENGLÓN
-- entero; desde acá confirma UNA UNIDAD.
--
--   antes:  renglón "Ibuprofeno × 3 u."  ──1 pasada──►  confirmado
--   ahora:  renglón "Ibuprofeno × 3 u."  ──3 pasadas──►  confirmado
--                                          1/3 → 2/3 → 3/3
--
-- Es lo que la farmacéutica hace de verdad con la caja en la mano: pasa el lector
-- por cada envase. Con el modelo viejo, un renglón de tres unidades se daba por
-- confirmado habiendo pasado una sola caja por el lector, y las otras dos salían
-- del mostrador sin que nada las hubiera verificado.
--
-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ POR QUÉ scanned_at NO SE BORRA                                            │
-- │                                                                           │
-- │ scanned_at deja de ser el conteo pero sigue siendo un dato: cuándo fue la  │
-- │ ÚLTIMA pasada, y scanned_by quién la hizo. Eso viaja al audit_log y no se  │
-- │ tira. El conteo se muda a scanned_units.                                   │
-- │                                                                           │
-- │ INVARIANTE (lo fija una constraint más abajo):                             │
-- │     scanned_units > 0  ⟺  scanned_at is not null                           │
-- │                                                                           │
-- │ Sin esa constraint, cancelar una preparación limpiaba scanned_at y dejaba  │
-- │ scanned_units intacto: el pedido volvía a la cola mostrando "6/6 escaneado"│
-- │ sobre medicación que nadie había vuelto a tocar. Silencioso y clínico.     │
-- │ Con ella, cualquier camino futuro que se olvide del conteo falla FUERTE    │
-- │ (23514) en vez de mentir bajito.                                           │
-- └──────────────────────────────────────────────────────────────────────────┘
--
-- ADEMÁS: la constancia del producto en investigación pasa a poder marcarse como
-- IMPRESA, y eso bloquea el avance. Ojo con lo que ese dato significa — está
-- explicado en el §3 de esta migración, y NO es "el papel salió de la impresora".
--
-- ORDEN DE APLICACIÓN: esta migración va ANTES del deploy del front, al revés de
-- la regla general de CLAUDE.md §3. El motivo está en el plan
-- (docs/plan-dispensacion-orden-y-claridad.md §4): esta migración es ADITIVA y el
-- front viejo no pide ninguna de sus columnas nuevas, así que no se rompe con
-- ella aplicada. El que no funciona sin ella es el front NUEVO, que sí las pide.
-- La regla de "front primero" existe para el caso contrario (la base empieza a
-- emitir algo que el código viejo no entiende), que fue lo de la 0068.
-- ============================================================================


-- 1 · El conteo por unidad ---------------------------------------------------
alter table public.dispensation_request_items
  add column if not exists scanned_units integer not null default 0;

-- Backfill ANTES de la constraint (CLAUDE.md: prever los datos legacy).
-- Fiel a lo que el dato viejo significaba: hasta acá scanned_at sellado quería
-- decir "este renglón está confirmado entero", o sea sus `quantity` unidades.
-- Deja las preparaciones EN VUELO con su progreso intacto: una farmacéutica que
-- tenía 2 de 3 renglones escaneados cuando se aplica esto no pierde nada.
update public.dispensation_request_items
  set scanned_units = quantity
  where scanned_at is not null and scanned_units = 0;

comment on column public.dispensation_request_items.scanned_units is
  'Unidades confirmadas con el lector. Una pasada = una unidad (0075). Antes de la 0075 el escaneo era por renglón y esto se backfilleó a quantity donde scanned_at estaba sellado.';

comment on column public.dispensation_request_items.scanned_at is
  'Cuándo fue la ÚLTIMA pasada del lector sobre este renglón. NULL = ninguna. Desde la 0075 ya NO es el conteo (eso es scanned_units); queda como rastro de cuándo y, con scanned_by, de quién.';

-- El invariante del recuadro de arriba. Se agrega DESPUÉS del backfill, si no las
-- filas viejas (scanned_at sellado, scanned_units todavía en 0) la violarían.
alter table public.dispensation_request_items
  drop constraint if exists dri_conteo_coherente_con_pasada;
alter table public.dispensation_request_items
  add constraint dri_conteo_coherente_con_pasada check (
    scanned_units >= 0
    and scanned_units <= quantity
    and ((scanned_units = 0 and scanned_at is null) or (scanned_units > 0 and scanned_at is not null))
  );


-- 2 · La constancia se marca impresa -----------------------------------------
alter table public.dispensation_ip_documents
  add column if not exists printed_at timestamptz,
  add column if not exists printed_by uuid references public.users(id);

-- ¡LEER ESTO ANTES DE CONFIAR EN LA COLUMNA!
-- printed_at NO dice que el papel salió de la impresora. Ningún navegador puede
-- decir eso: window.print() abre el diálogo y el evento afterprint dispara cuando
-- el diálogo se cierra, haya impreso o haya cancelado. No existe API que lo
-- distinga.
-- Lo que esta columna registra es una ASERCIÓN de la persona: apretó Imprimir.
-- Por eso el nombre del comentario y el del audit_log dicen "marcó como impresa"
-- y no "imprimió". En un sistema auditable la diferencia entre lo que el sistema
-- OBSERVÓ y lo que alguien AFIRMÓ no se difumina.
comment on column public.dispensation_ip_documents.printed_at is
  'Cuándo se MARCÓ como impresa (la persona apretó Imprimir). NO es confirmación de que la impresora imprimió: el navegador no puede saberlo. Es una aserción de printed_by.';

comment on column public.dispensation_ip_documents.printed_by is
  'Quién afirmó haber impreso la constancia. Junto con printed_at es el par que se audita.';


-- 3 · RPC · marcar la constancia como impresa --------------------------------
create or replace function public.mark_ip_document_printed(p_document_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_request_id uuid; v_superseded timestamptz;
begin
  if auth.uid() is null then raise exception 'No autenticado' using errcode = '42501'; end if;
  if not public.has_min_role('pharma','operator') then
    raise exception 'Solo Pharma (operador) puede marcar la constancia como impresa' using errcode = '42501';
  end if;

  select d.request_id, d.superseded_at into v_request_id, v_superseded
  from public.dispensation_ip_documents d
  where d.id = p_document_id
  for update;
  if not found then raise exception 'Constancia inexistente' using errcode = '23503'; end if;

  -- Marcar una constancia REEMPLAZADA satisfaría el bloqueo con el papel equivocado:
  -- el que se entrega es el vigente.
  if v_superseded is not null then
    raise exception 'Esa constancia fue reemplazada por una nueva. Imprimí la vigente.'
      using errcode = 'check_violation';
  end if;

  -- Idempotente: volver a imprimir no reescribe quién fue el primero en marcarla.
  -- El botón cambia a "Imprimir de nuevo" y se puede apretar las veces que haga
  -- falta (se traba el papel, sale mal); eso no es un hecho auditable nuevo.
  update public.dispensation_ip_documents
    set printed_at = coalesce(printed_at, now()),
        printed_by = coalesce(printed_by, auth.uid())
    where id = p_document_id;
end; $$;
revoke all on function public.mark_ip_document_printed(uuid) from public;
grant execute on function public.mark_ip_document_printed(uuid) to authenticated;


-- 4 · RPC · escanear, ahora de a una unidad ----------------------------------
-- Basada en la de la 0054 (única definición previa). Cambia el criterio de
-- "renglón pendiente" y el incremento; el resto se conserva.
create or replace function public.scan_dispensation_item(p_request_id uuid, p_code text)
returns table (item_id uuid, medication_name text, remaining integer)
language plpgsql security definer set search_path = public as $$
declare
  v_status        request_status;
  v_medication_id uuid;
  v_item_id       uuid;
  v_pending_name  text;
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

  -- Pendiente ahora es "le faltan UNIDADES", no "no tiene scanned_at".
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
    -- Mensaje nominativo: decir QUÉ se escaneó y QUÉ falta ahorra el "¿y ahora qué?".
    select m.name into v_pending_name
    from public.dispensation_request_items dri
    join public.medications m on m.id = dri.medication_id
    where dri.request_id = p_request_id and dri.scanned_units < dri.quantity
    limit 1;

    if v_pending_name is null then
      raise exception 'Todas las unidades de esta solicitud ya están escaneadas'
        using errcode = 'check_violation';
    end if;

    -- Nombra cuántas unidades tenía el renglón que se quiso pasar de más: el error
    -- más frecuente del mostrador es pasar dos veces la misma caja.
    raise exception '% ya tiene sus unidades escaneadas. Falta %',
      (select m.name from public.medications m where m.id = v_medication_id), v_pending_name
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
           (select m.name from public.medications m where m.id = v_medication_id),
           -- `remaining` pasa a contar UNIDADES pendientes de todo el pedido.
           -- El front viejo solo pregunta si es 0, y cero sigue queriendo decir
           -- "no falta nada": por eso este cambio no lo rompe.
           (select coalesce(sum(dri.quantity - dri.scanned_units), 0)::integer
              from public.dispensation_request_items dri
             where dri.request_id = p_request_id);
end; $$;
revoke all on function public.scan_dispensation_item(uuid, text) from public;
grant execute on function public.scan_dispensation_item(uuid, text) to authenticated;


-- 5 · RPC · deshacer -----------------------------------------------------------
-- Por defecto vuelve el renglón a CERO, que es lo que hace el botón "Cancelar"
-- del handoff (§5.4: aparece en la tarjeta completa y "devuelve el contador a 0").
--
-- p_unidades queda para restar de a una sin volver a empezar. Tiene default, así
-- que la llamada de un argumento del front desplegado sigue siendo válida — no
-- hace falta coordinar el deploy con esta migración.
--
-- ⚠ EL DROP DE ABAJO NO ES OPCIONAL. Agregar un parámetro CAMBIA LA FIRMA, y
-- `create or replace function` con firma distinta no reemplaza nada: crea una
-- SOBRECARGA y deja viva la de un solo argumento (0054). Postgres resuelve una
-- llamada de un argumento con la coincidencia exacta, o sea la vieja — la que
-- limpia scanned_at sin tocar scanned_units. Eso viola la constraint del §1 y
-- cada "deshacer" en producción moriría con un 23514 incomprensible.
drop function if exists public.unscan_dispensation_item(uuid);

create or replace function public.unscan_dispensation_item(p_item_id uuid, p_unidades integer default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_status request_status; v_units integer;
begin
  if auth.uid() is null then raise exception 'No autenticado' using errcode = '42501'; end if;
  if not public.has_min_role('pharma','operator') then
    raise exception 'Solo Pharma (operador) puede modificar el escaneo' using errcode = '42501';
  end if;

  select dr.status, dri.scanned_units into v_status, v_units
  from public.dispensation_request_items dri
  join public.dispensation_requests dr on dr.id = dri.request_id
  where dri.id = p_item_id
  for update of dr, dri;
  if not found then raise exception 'Renglón inexistente' using errcode = '23503'; end if;
  if v_status <> 'preparando' then
    raise exception 'Solo se puede corregir el escaneo mientras se prepara (estado actual: %)', v_status
      using errcode = 'check_violation';
  end if;

  -- greatest(...,0) es la guarda de piso: sin ella, restar de un renglón en 0 lo
  -- deja en -1, el dial dibuja una fracción negativa y la constraint del §1 tira
  -- un 23514 que no le dice nada a nadie.
  v_units := case
    when p_unidades is null then 0
    else greatest(v_units - p_unidades, 0)
  end;

  update public.dispensation_request_items dri
    set scanned_units = v_units,
        -- El invariante manda: sin unidades no puede quedar rastro de pasada.
        scanned_at = case when v_units = 0 then null else dri.scanned_at end,
        scanned_by = case when v_units = 0 then null else dri.scanned_by end
    where dri.id = p_item_id;
end; $$;
revoke all on function public.unscan_dispensation_item(uuid, integer) from public;
grant execute on function public.unscan_dispensation_item(uuid, integer) to authenticated;


-- 6 · Cancelar y rechazar también ponen el conteo en cero ----------------------
-- Se reescriben ENTERAS desde su última versión (0057), no parcheadas: son las
-- dos que limpian scanned_at, y dejarlas sin tocar haría que la constraint del §1
-- les tire 23514 en producción la próxima vez que alguien cancele.
create or replace function public.cancel_dispensation_preparation(p_request_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_status request_status; v_disp_id uuid; v_disp_status dispensation_status;
begin
  if auth.uid() is null then raise exception 'No autenticado' using errcode = '42501'; end if;
  if not public.has_min_role('pharma','operator') then
    raise exception 'Solo Pharma (operador) puede cancelar una preparación' using errcode = '42501';
  end if;

  select dr.status into v_status
  from public.dispensation_requests dr where dr.id = p_request_id for update;
  if not found then raise exception 'Solicitud inexistente' using errcode = '23503'; end if;
  if v_status <> 'preparando' then
    raise exception 'Esta solicitud no está en preparación (estado actual: %)', v_status
      using errcode = 'check_violation';
  end if;

  select d.id, d.status into v_disp_id, v_disp_status
  from public.dispensations d
  where d.request_id = p_request_id and d.status in ('en_preparacion','lista')
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
    delete from public.dispensation_items di where di.dispensation_id = v_disp_id;
  end if;

  update public.dispensation_request_items dri
    set scanned_at = null, scanned_by = null, scanned_units = 0   -- ← 0075
    where dri.request_id = p_request_id;

  update public.dispensation_requests dr
    set status = 'solicitada', prepared_by = null, preparation_started_at = null
    where dr.id = p_request_id;
end; $$;
revoke all on function public.cancel_dispensation_preparation(uuid) from public;
grant execute on function public.cancel_dispensation_preparation(uuid) to authenticated;


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

  select dr.status into v_status
  from public.dispensation_requests dr where dr.id = p_request_id for update;
  if not found then raise exception 'Solicitud inexistente' using errcode = '23503'; end if;
  if v_status not in ('solicitada','preparando') then
    raise exception 'Solo se puede rechazar una solicitud pendiente o en preparación (estado actual: %)', v_status
      using errcode = 'check_violation';
  end if;

  select d.id, d.status into v_disp_id, v_disp_status
  from public.dispensations d
  where d.request_id = p_request_id and d.status in ('en_preparacion','lista')
  for update;

  if found then
    update public.dispensations
      set status = 'en_preparacion', dispensation_code = null, daily_number = null
      where id = v_disp_id;
    delete from public.dispensation_items di where di.dispensation_id = v_disp_id;
  end if;

  update public.dispensation_request_items dri
    set scanned_at = null, scanned_by = null, scanned_units = 0   -- ← 0075
    where dri.request_id = p_request_id;

  update public.dispensation_requests dr
    set status = 'rechazada', rejection_reason = btrim(p_reason)
    where dr.id = p_request_id;
end; $$;
revoke all on function public.reject_dispensation_request(uuid, text) from public;
grant execute on function public.reject_dispensation_request(uuid, text) to authenticated;


-- 7 · Marcar lista: el candado pasa a ser por unidad + la constancia impresa ---
-- Reescrita desde su ÚLTIMA versión, que es la de la 0071 (no la de la 0054):
-- pasó por 0054 → 0056 (ambigüedad del returns table) → 0058 (alias de
-- dispensation_id) → 0071 (constancia, correlativo diario, pedido vacío). Partir
-- de una versión vieja habría borrado esos cuatro arreglos.
-- Los ÚNICOS cambios respecto de la 0071 son el bloque de pendientes y el de la
-- constancia impresa; todo lo demás es idéntico.
create or replace function public.mark_dispensation_ready(p_request_id uuid)
returns table (dispensation_id uuid, correlative_number integer, dispensation_code text)
language plpgsql security definer set search_path = public as $$
declare
  v_status      request_status;
  v_protocol_id uuid;
  v_pending     integer;
  v_disp_id     uuid;
  v_corr        integer;
  v_code        text;
  v_daily       integer;
  v_item        record;
  v_lot         record;
begin
  if auth.uid() is null then raise exception 'No autenticado' using errcode = '42501'; end if;
  if not public.has_min_role('pharma','operator') then
    raise exception 'Solo Pharma (operador) puede marcar lista una dispensación' using errcode = '42501';
  end if;

  select dr.status, e.protocol_id
    into v_status, v_protocol_id
  from public.dispensation_requests dr
  join public.patient_visits pv on pv.id = dr.visit_id
  join public.enrollments e     on e.id  = pv.enrollment_id
  where dr.id = p_request_id
  for update of dr;
  if not found then raise exception 'Solicitud inexistente' using errcode = '23503'; end if;
  if v_status <> 'preparando' then
    raise exception 'Esta solicitud no está en preparación (estado actual: %)', v_status
      using errcode = 'check_violation';
  end if;

  -- ── CAMBIO 0075: el candado cuenta UNIDADES, no renglones ──────────────────
  -- Con el conteo por renglón, un pedido de "Ibuprofeno × 3" pasaba este control
  -- habiendo pasado UNA caja por el lector.
  select coalesce(sum(dri.quantity - dri.scanned_units), 0)::integer into v_pending
  from public.dispensation_request_items dri
  where dri.request_id = p_request_id;
  if v_pending > 0 then
    raise exception 'Faltan % unidades por escanear', v_pending using errcode = 'check_violation';
  end if;

  if (select r.includes_ip from public.dispensation_requests r where r.id = p_request_id) then
    -- Con IP, no se emite comprobante sin constancia: el papel que la farmacéutica imprime y
    -- entrega junto con la medicación tiene que existir antes de que exista el comprobante.
    if not exists (
      select 1 from public.dispensation_ip_documents d
      where d.request_id = p_request_id and d.superseded_at is null
    ) then
      raise exception 'Falta la constancia del producto en investigación' using errcode = 'check_violation';
    end if;

    -- ── CAMBIO 0075: además de existir, tiene que estar marcada como impresa ──
    -- Existir y estar impresa son dos cosas distintas: el papel se entrega EN MANO
    -- junto con la medicación, así que un PDF cargado y nunca impreso deja salir la
    -- dispensación sin su constancia física.
    -- Recordar qué significa printed_at (§2): es una aserción de la farmacéutica,
    -- no una confirmación de la impresora.
    if not exists (
      select 1 from public.dispensation_ip_documents d
      where d.request_id = p_request_id and d.superseded_at is null and d.printed_at is not null
    ) then
      raise exception 'Falta imprimir la constancia del producto en investigación'
        using errcode = 'check_violation';
    end if;
  end if;

  -- El espejo del bloque de arriba: pedido SIN renglones y SIN IP, o sea sin nada que dispensar.
  if not exists (select 1 from public.dispensation_request_items i where i.request_id = p_request_id)
     and not (select r.includes_ip from public.dispensation_requests r where r.id = p_request_id) then
    raise exception 'Este pedido no tiene medicación cargada ni constancia de producto en investigación: no hay nada que dispensar. Adjuntá la constancia del IRT o cargá la medicación.'
      using errcode = 'check_violation';
  end if;

  -- Reusar la dispensación si ya existe. Conserva el correlativo (numeración legal
  -- sin huecos); el código puede venir en null si se liberó al cancelar (0057), y en
  -- ese caso se sella de nuevo más abajo con quien dispensa ahora.
  select d.id, d.correlative_number, d.dispensation_code
    into v_disp_id, v_corr, v_code
  from public.dispensations d
  where d.request_id = p_request_id and d.status = 'en_preparacion'
  for update;

  if not found then
    insert into public.dispensations (request_id, executed_by, status)
      values (p_request_id, auth.uid(), 'en_preparacion')
      returning dispensations.id, dispensations.correlative_number
      into v_disp_id, v_corr;
  else
    -- ALIAS EXPLÍCITO (fix 0058): sin `di.`, `dispensation_id` choca con la variable
    -- de salida homónima del returns table.
    delete from public.dispensation_items di where di.dispensation_id = v_disp_id;
  end if;

  -- Sellar el código solo si no lo tiene (primera vez, o se liberó al cancelar).
  if v_code is null then
    insert into public.dispensation_daily_counters (day, last_number)
      values (current_date, 1)
      on conflict (day) do update
        set last_number = public.dispensation_daily_counters.last_number + 1
      returning last_number into v_daily;

    v_code := 'D-' || v_daily
           || '-' || to_char(current_date, 'DDMMYY')
           || '-' || public.user_initials(auth.uid());

    update public.dispensations
      set daily_number = v_daily, dispensation_code = v_code
      where id = v_disp_id;
  end if;

  for v_item in
    select medication_id, sum(quantity)::integer as quantity
    from public.dispensation_request_items
    where request_id = p_request_id
    group by medication_id
  loop
    -- FEFO: el lote que vence antes, del protocolo, no vencido, con stock suficiente. Lock del lote.
    select ml.id, ml.lot_number, ml.expiry_date into v_lot
    from public.medication_lots ml
    where ml.medication_id = v_item.medication_id
      and ml.protocol_id   = v_protocol_id
      and ml.quantity_on_hand >= v_item.quantity
      and (ml.expiry_date is null or ml.expiry_date >= current_date)
    order by ml.expiry_date asc nulls last, ml.created_at asc, ml.lot_number asc  -- desempate determinístico/auditable
    limit 1
    for update of ml;

    if not found then
      raise exception 'No hay stock suficiente en un solo lote para el medicamento % (cantidad %). Reducí la cantidad (la partición entre lotes llega en v1.1).',
        v_item.medication_id, v_item.quantity using errcode = 'check_violation';
    end if;

    insert into public.dispensation_items
      (dispensation_id, medication_id, lot_id, quantity, lot_number, expiry_date)
    values
      (v_disp_id, v_item.medication_id, v_lot.id, v_item.quantity, v_lot.lot_number, v_lot.expiry_date);
  end loop;

  update public.dispensations set status = 'lista' where id = v_disp_id;

  return query select v_disp_id, v_corr, v_code;
end; $$;
revoke all on function public.mark_dispensation_ready(uuid) from public;
grant execute on function public.mark_dispensation_ready(uuid) to authenticated;
