-- Spira · Migración 0151 — Corregir una entrega, fase 2: Farmacia corrige renglones y kits.
-- Spec: docs/superpowers/specs/2026-10-04-corregir-entrega-design.md (D2, D4, D5, D6, fase 2).
--
-- APLICAR A MANO en el SQL Editor de Supabase (rol postgres), DESPUÉS de la 0150 —en otra corrida: el
-- valor nuevo del enum tiene que estar committeado—. IDEMPOTENTE: reintentar es volver a correr el
-- archivo entero.
--
-- ⚠️ ADITIVA → VA **ANTES** DEL DEPLOY DEL FRONT. El front desplegado sigue andando con esto:
--    · la función nueva no la llama nadie todavía;
--    · las dos guardas y los dos chequeos de la 0050 se recrean con el MISMO comportamiento salvo
--      dentro de la corrección (la marca `spira.correccion_entrega`, que sólo prende la función nueva);
--    · v_pharma_report_items conserva columnas y orden; sólo suma el tipo nuevo, que hoy no existe en
--      ninguna fila, así que da lo mismo que antes;
--    · reposicion_del_periodo conserva la firma y la forma del resultado; ídem.
--
-- ⚠️ NUNCA dos signos peso pegados dentro de un comentario (ver CLAUDE.md, 0071).
--
-- QUÉ HACE. El LÍDER de Farmacia (D2) corrige una entrega ya hecha: la cantidad, el lote, quitar un
-- renglón, agregar uno que faltó registrar, y los kits de IP. Todo en UNA llamada con UN motivo, y en
-- una transacción: o entra la corrección entera o no entra nada.
--
-- CÓMO (D5: no se reescribe, se asienta).
--   · El stock se compensa en el libro con `correccion_entrega` (0150), por la DIFERENCIA, contra el
--     lote: lo registrado de más vuelve, lo que faltó se descuenta (con el control de stock de siempre).
--   · Los renglones de la entrega (`dispensation_items`) Y los del pedido (`dispensation_request_items`)
--     quedan con lo que se entregó de verdad: el comprobante, la facturación, el saldo de una indicación
--     en partes y el contexto de la visita leen los renglones, no el libro. Corregir sólo el libro los
--     dejaría mostrando lo viejo.
--   · Cada cambio deja una fila en `dispensation_corrections` (0149) con el antes, el después, el motivo
--     y quién. Es lo que el comprobante muestra como «Corregida».
--   · NO toca `dispensation_requests`: un update ahí dispara `trg_requests_updated_at` y mueve el pedido
--     a la columna «Entregadas» de hoy en el tablero.
--
-- LA MARCA `spira.correccion_entrega`. Tres candados de la base dicen «esto no se toca después de
-- entregar», y para una corrección con motivo y asiento tienen que ceder:
--   · guard_dispensation_immutable (0119) no deja cambiar `ip_kits` de una entregada;
--   · check_request_item_protocol y check_dispensation_item_protocol (0050) exigen la medicación del
--     paciente ACTIVA. Después de entregar, la habilitada con receta se desactiva (0124) y un paciente
--     que terminó el estudio no tiene ninguna activa: la corrección fallaría justo en el caso típico.
-- La función prende la marca con `set_config(..., true)`, que dura sólo su transacción. Los chequeos de
-- protocolo (el medicamento es del estudio, el lote es del estudio) NO ceden: ésos valen siempre.
-- Ningún cliente puede prender la marca por su cuenta: PostgREST no expone `set_config` ni deja correr
-- un SET. La guarda de kits pide además `current_user = 'postgres'` (la función), como la 0088.
--
-- Registrar en supabase/README.md al confirmarse en prod.
-- ============================================================================


-- 1 · El cambio de lote también es una corrección con nombre propio -----------------------------
alter table public.dispensation_corrections drop constraint if exists dc_tipo_chk;
alter table public.dispensation_corrections add constraint dc_tipo_chk check (
  tipo in ('constancia', 'kits_ip', 'renglon_cantidad', 'renglon_lote', 'renglon_alta', 'renglon_baja')
);


-- 2 · guard_dispensation_immutable — cuerpo de la 0119 + la excepción de la corrección ------------
create or replace function public.guard_dispensation_immutable()
returns trigger language plpgsql as $fn$
begin
  if new.executed_by is distinct from old.executed_by
     or new.request_id is distinct from old.request_id
     or new.correlative_number is distinct from old.correlative_number then
    raise exception 'No se pueden modificar executed_by/request_id/correlative_number de una dispensación';
  end if;

  if old.status = 'entregada' and new.status is distinct from 'entregada' then
    raise exception 'No se puede revertir una dispensación ya entregada';
  end if;

  if old.status = 'entregada' then
    -- 0151: los kits se corrigen SÓLO desde corregir_entrega_farmacia, que asienta el cambio.
    if new.ip_kits is distinct from old.ip_kits
       and not (current_user = 'postgres'
                and coalesce(current_setting('spira.correccion_entrega', true), '') = 'on') then
      raise exception 'No se pueden corregir los kits de IP de una dispensación ya entregada'
        using errcode = 'check_violation';
    end if;
    if new.delivered_at is distinct from old.delivered_at then
      raise exception 'No se puede cambiar la fecha de entrega de una dispensación ya entregada'
        using errcode = 'check_violation';
    end if;
    -- 0119: quién entregó también es el papel.
    if new.delivered_by is distinct from old.delivered_by
       or new.delivered_by_name is distinct from old.delivered_by_name then
      raise exception 'No se puede cambiar quién entregó una dispensación ya entregada'
        using errcode = 'check_violation';
    end if;
  end if;

  return new;
end;
$fn$;

comment on function public.guard_dispensation_immutable() is
  'Inmutabilidad de la dispensación: identidad (executed_by/request_id/correlative_number), no-reversión del estado, y una vez entregada ip_kits (salvo corregir_entrega_farmacia, 0151), delivered_at (0073), delivered_by y delivered_by_name (0119).';


-- 3 · Los chequeos de la 0050 — cuerpos verbatim + la excepción de la corrección -------------------
create or replace function public.check_request_item_protocol()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_protocol_id uuid; v_enrollment_id uuid;
begin
  select e.protocol_id, e.id into v_protocol_id, v_enrollment_id
  from public.dispensation_requests dr
  join public.patient_visits pv on pv.id = dr.visit_id
  join public.enrollments e     on e.id  = pv.enrollment_id
  where dr.id = new.request_id;
  if not exists (select 1 from public.protocol_medications pm
                 where pm.medication_id = new.medication_id and pm.protocol_id = v_protocol_id) then
    raise exception 'Medicamento % no está asignado al protocolo % de la solicitud',
      new.medication_id, v_protocol_id using errcode = 'check_violation';
  end if;
  -- 0151: corregir una entrega ya hecha registra lo que SE DIO; la habilitación vigente hoy no cambia
  -- ese hecho (la de una receta se desactiva al terminar el pedido, 0124).
  if coalesce(current_setting('spira.correccion_entrega', true), '') = 'on' then
    return new;
  end if;
  -- (0050) tiene que estar habilitado ESPECÍFICAMENTE para este paciente (medicación asignada activa)
  if not exists (select 1 from public.patient_medications pmed
                 where pmed.enrollment_id = v_enrollment_id
                   and pmed.medication_id = new.medication_id
                   and pmed.active) then
    raise exception 'Medicamento % no está habilitado para este paciente (medicación asignada)',
      new.medication_id using errcode = 'check_violation';
  end if;
  return new;
end; $$;

create or replace function public.check_dispensation_item_protocol()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_protocol_id uuid; v_lot_protocol uuid; v_request_id uuid; v_enrollment_id uuid;
begin
  select e.protocol_id, d.request_id, e.id into v_protocol_id, v_request_id, v_enrollment_id
  from public.dispensations d
  join public.dispensation_requests dr on dr.id = d.request_id
  join public.patient_visits pv on pv.id = dr.visit_id
  join public.enrollments e     on e.id  = pv.enrollment_id
  where d.id = new.dispensation_id;
  select protocol_id into v_lot_protocol from public.medication_lots where id = new.lot_id;
  if v_lot_protocol is distinct from v_protocol_id then
    raise exception 'El lote % (protocolo %) no corresponde al protocolo % de la dispensación',
      new.lot_id, v_lot_protocol, v_protocol_id using errcode = 'check_violation';
  end if;
  -- (0050) el medicamento entregado debe figurar en los ítems de la solicitud
  if not exists (select 1 from public.dispensation_request_items dri
                 where dri.request_id = v_request_id and dri.medication_id = new.medication_id) then
    raise exception 'Medicamento % no figura en la solicitud vinculada',
      new.medication_id using errcode = 'check_violation';
  end if;
  -- 0151: ver check_request_item_protocol.
  if coalesce(current_setting('spira.correccion_entrega', true), '') = 'on' then
    return new;
  end if;
  -- (0050) la medicación debe SEGUIR habilitada al entregar: si Pharma la deshabilitó entre el
  -- pedido y la entrega, se bloquea (decisión clínica: no dispensar algo marcado deshabilitado).
  if not exists (select 1 from public.patient_medications pmed
                 where pmed.enrollment_id = v_enrollment_id
                   and pmed.medication_id = new.medication_id
                   and pmed.active) then
    raise exception 'Medicamento % ya no está habilitado para este paciente (fue deshabilitado)',
      new.medication_id using errcode = 'check_violation';
  end if;
  return new;
end; $$;


-- 4 · corregir_entrega_farmacia -----------------------------------------------------------------
-- `p_cambios` es una lista de cambios sobre los renglones de la entrega:
--   {"op": "cantidad", "item_id": …, "cantidad": n}          n ≥ 1 (para sacarlo, «quitar»)
--   {"op": "lote",     "item_id": …, "lot_id": …}            otro lote del mismo medicamento y estudio
--   {"op": "quitar",   "item_id": …}                          no se dio: vuelve todo al lote
--   {"op": "agregar",  "medication_id": …, "lot_id": …, "cantidad": n}   se dio y no se registró
-- `p_kits` null = los kits no se tocan. Devuelve cuántos cambios se asentaron.
create or replace function public.corregir_entrega_farmacia(
  p_dispensation_id uuid,
  p_cambios         jsonb,
  p_kits            int,
  p_motivo          text,
  p_motivo_texto    text default null)
returns int language plpgsql security definer set search_path = public as $$
declare
  v_request_id  uuid;
  v_status      dispensation_status;
  v_kits        int;
  v_protocol_id uuid;
  v_includes_ip boolean;
  v_texto       text := nullif(btrim(coalesce(p_motivo_texto, '')), '');
  v_razon       text;
  v_nombre      text;
  v_cambio      jsonb;
  v_op          text;
  v_cant        int;
  v_delta       int;
  v_item        public.dispensation_items%rowtype;
  v_lote        public.medication_lots%rowtype;
  v_viejo       public.medication_lots%rowtype;
  v_ri          public.dispensation_request_items%rowtype;
  v_med         uuid;
  v_med_nombre  text;
  v_disponibles int;
  v_n           int := 0;
begin
  if auth.uid() is null then raise exception 'No autenticado' using errcode = '42501'; end if;
  -- Alcance primero (0141), después el nivel: corregir reescribe stock, como ajustar o anular una
  -- recepción, y eso es del líder (D2).
  if not ((select public.pharma_sin_recorte()) or public.pharma_alcanza_dispensacion(p_dispensation_id)) then
    raise exception 'No tenés acceso a este estudio.' using errcode = '42501';
  end if;
  if not public.has_min_role('pharma', 'leader') then
    raise exception 'Sólo el líder de Farmacia puede corregir una entrega' using errcode = '42501';
  end if;
  if p_motivo is null or p_motivo not in
       ('cantidad_mal_registrada', 'medicamento_equivocado', 'falto_registrar', 'kits_mal_declarados', 'otro') then
    raise exception 'Elegí el motivo de la corrección' using errcode = 'check_violation';
  end if;
  if p_motivo = 'otro' and v_texto is null then
    raise exception 'Contá el motivo de la corrección' using errcode = 'check_violation';
  end if;

  -- El protocolo como lo resuelve attach_ip_document: el sellado en el pedido o, en un pedido anterior
  -- a la 0071, el de la inscripción de la visita.
  select d.request_id, d.status, d.ip_kits, coalesce(dr.protocol_id, e.protocol_id), dr.includes_ip
    into v_request_id, v_status, v_kits, v_protocol_id, v_includes_ip
  from public.dispensations d
  join public.dispensation_requests dr on dr.id = d.request_id
  join public.patient_visits pv        on pv.id = dr.visit_id
  join public.enrollments e            on e.id  = pv.enrollment_id
  where d.id = p_dispensation_id
  for update of d;

  if not found then
    raise exception 'No se encontró la entrega' using errcode = 'check_violation';
  end if;
  if v_status <> 'entregada' then
    raise exception 'Esta dispensación todavía no se entregó: se corrige desde la preparación' using errcode = 'check_violation';
  end if;
  if p_cambios is not null and jsonb_typeof(p_cambios) <> 'array' then
    raise exception 'Los cambios no tienen la forma esperada' using errcode = 'check_violation';
  end if;

  v_razon  := 'Corrección de entrega: ' || coalesce(v_texto, p_motivo);
  v_nombre := (select u.full_name from public.users u where u.id = auth.uid());
  perform set_config('spira.correccion_entrega', 'on', true);

  for v_cambio in select * from jsonb_array_elements(coalesce(p_cambios, '[]'::jsonb)) loop
    v_op := v_cambio->>'op';

    if v_op in ('cantidad', 'lote', 'quitar') then
      select * into v_item from public.dispensation_items
       where id = (v_cambio->>'item_id')::uuid and dispensation_id = p_dispensation_id
       for update;
      if not found then
        raise exception 'Un renglón de la corrección no es de esta entrega' using errcode = 'check_violation';
      end if;
      v_med_nombre := (select m.name from public.medications m where m.id = v_item.medication_id);
      select * into v_ri from public.dispensation_request_items
       where request_id = v_request_id and medication_id = v_item.medication_id
       for update;
    end if;

    if v_op = 'cantidad' then
      v_cant := (v_cambio->>'cantidad')::int;
      if v_cant is null or v_cant < 1 then
        raise exception 'La cantidad corregida de % tiene que ser 1 o más. Si no se dio, quitalo.', v_med_nombre
          using errcode = 'check_violation';
      end if;
      continue when v_cant = v_item.quantity;
      v_delta := v_item.quantity - v_cant;   -- positivo: vuelve al lote; negativo: sale del lote
      select * into v_lote from public.medication_lots where id = v_item.lot_id for update;
      if v_delta < 0 and v_lote.quantity_on_hand < -v_delta then
        raise exception 'No alcanza el stock del lote % de %: quedan %', v_lote.lot_number, v_med_nombre, v_lote.quantity_on_hand
          using errcode = 'check_violation';
      end if;
      update public.medication_lots set quantity_on_hand = quantity_on_hand + v_delta where id = v_lote.id;
      insert into public.stock_movements
        (medication_id, lot_id, movement_type, quantity_delta, reference_id, reference_type, reason, created_by)
      values (v_item.medication_id, v_lote.id, 'correccion_entrega', v_delta, p_dispensation_id, 'dispensation', v_razon, auth.uid());
      update public.dispensation_items set quantity = v_cant where id = v_item.id;
      -- El renglón del pedido dice lo entregado. Si iba en partes y ahora cubre lo indicado, ya no
      -- queda saldo: la indicación se completa (dri_indicado_coherente pide indicado ≥ cantidad).
      if v_ri.id is not null then
        update public.dispensation_request_items
           set quantity = v_cant,
               quantity_indicated = case when quantity_indicated is not null and quantity_indicated <= v_cant
                                         then null else quantity_indicated end
         where id = v_ri.id;
      end if;
      insert into public.dispensation_corrections
        (dispensation_id, request_id, tipo, antes, despues, motivo_codigo, motivo_texto, corrected_by, corrected_by_name)
      values (p_dispensation_id, v_request_id, 'renglon_cantidad',
        jsonb_build_object('medication_id', v_item.medication_id, 'medicamento', v_med_nombre,
                           'lot_id', v_lote.id, 'lote', v_lote.lot_number, 'cantidad', v_item.quantity),
        jsonb_build_object('medication_id', v_item.medication_id, 'medicamento', v_med_nombre,
                           'lot_id', v_lote.id, 'lote', v_lote.lot_number, 'cantidad', v_cant),
        p_motivo, v_texto, auth.uid(), v_nombre);

    elsif v_op = 'lote' then
      continue when (v_cambio->>'lot_id')::uuid = v_item.lot_id;
      select * into v_lote from public.medication_lots where id = (v_cambio->>'lot_id')::uuid for update;
      if not found or v_lote.medication_id <> v_item.medication_id
         or v_lote.protocol_id is distinct from v_protocol_id or v_lote.tipo <> 'protocolo' then
        raise exception 'El lote elegido no es de % en este estudio', v_med_nombre using errcode = 'check_violation';
      end if;
      if v_lote.quantity_on_hand < v_item.quantity then
        raise exception 'No alcanza el stock del lote % de %: quedan %', v_lote.lot_number, v_med_nombre, v_lote.quantity_on_hand
          using errcode = 'check_violation';
      end if;
      select * into v_viejo from public.medication_lots where id = v_item.lot_id for update;
      update public.medication_lots set quantity_on_hand = quantity_on_hand + v_item.quantity where id = v_viejo.id;
      update public.medication_lots set quantity_on_hand = quantity_on_hand - v_item.quantity where id = v_lote.id;
      insert into public.stock_movements
        (medication_id, lot_id, movement_type, quantity_delta, reference_id, reference_type, reason, created_by)
      values
        (v_item.medication_id, v_viejo.id, 'correccion_entrega',  v_item.quantity, p_dispensation_id, 'dispensation', v_razon, auth.uid()),
        (v_item.medication_id, v_lote.id,  'correccion_entrega', -v_item.quantity, p_dispensation_id, 'dispensation', v_razon, auth.uid());
      update public.dispensation_items
         set lot_id = v_lote.id, lot_number = v_lote.lot_number, expiry_date = v_lote.expiry_date
       where id = v_item.id;
      insert into public.dispensation_corrections
        (dispensation_id, request_id, tipo, antes, despues, motivo_codigo, motivo_texto, corrected_by, corrected_by_name)
      values (p_dispensation_id, v_request_id, 'renglon_lote',
        jsonb_build_object('medication_id', v_item.medication_id, 'medicamento', v_med_nombre,
                           'lot_id', v_viejo.id, 'lote', v_viejo.lot_number, 'cantidad', v_item.quantity),
        jsonb_build_object('medication_id', v_item.medication_id, 'medicamento', v_med_nombre,
                           'lot_id', v_lote.id, 'lote', v_lote.lot_number, 'cantidad', v_item.quantity),
        p_motivo, v_texto, auth.uid(), v_nombre);

    elsif v_op = 'quitar' then
      -- Un renglón con un saldo pedido después no se borra (0123: el saldo quedaría sin origen).
      if v_ri.id is not null and exists (
           select 1 from public.dispensation_request_items s where s.saldo_de_item_id = v_ri.id) then
        raise exception 'De % ya se pidió un saldo: corregí la cantidad en vez de quitarlo', v_med_nombre
          using errcode = 'check_violation';
      end if;
      select * into v_lote from public.medication_lots where id = v_item.lot_id for update;
      update public.medication_lots set quantity_on_hand = quantity_on_hand + v_item.quantity where id = v_lote.id;
      insert into public.stock_movements
        (medication_id, lot_id, movement_type, quantity_delta, reference_id, reference_type, reason, created_by)
      values (v_item.medication_id, v_lote.id, 'correccion_entrega', v_item.quantity, p_dispensation_id, 'dispensation', v_razon, auth.uid());
      delete from public.dispensation_items where id = v_item.id;
      if v_ri.id is not null then
        delete from public.dispensation_request_items where id = v_ri.id;
      end if;
      insert into public.dispensation_corrections
        (dispensation_id, request_id, tipo, antes, despues, motivo_codigo, motivo_texto, corrected_by, corrected_by_name)
      values (p_dispensation_id, v_request_id, 'renglon_baja',
        jsonb_build_object('medication_id', v_item.medication_id, 'medicamento', v_med_nombre,
                           'lot_id', v_lote.id, 'lote', v_lote.lot_number, 'cantidad', v_item.quantity),
        jsonb_build_object('medication_id', v_item.medication_id, 'medicamento', v_med_nombre, 'cantidad', 0),
        p_motivo, v_texto, auth.uid(), v_nombre);

    elsif v_op = 'agregar' then
      v_med  := (v_cambio->>'medication_id')::uuid;
      v_cant := (v_cambio->>'cantidad')::int;
      v_med_nombre := (select m.name from public.medications m where m.id = v_med);
      if v_med_nombre is null then
        raise exception 'El medicamento a agregar no existe' using errcode = 'check_violation';
      end if;
      if v_cant is null or v_cant < 1 then
        raise exception 'La cantidad de % tiene que ser 1 o más', v_med_nombre using errcode = 'check_violation';
      end if;
      if exists (select 1 from public.dispensation_items where dispensation_id = p_dispensation_id and medication_id = v_med) then
        raise exception '% ya está en la entrega: corregí su cantidad', v_med_nombre using errcode = 'check_violation';
      end if;
      select * into v_lote from public.medication_lots where id = (v_cambio->>'lot_id')::uuid for update;
      if not found or v_lote.medication_id <> v_med
         or v_lote.protocol_id is distinct from v_protocol_id or v_lote.tipo <> 'protocolo' then
        raise exception 'El lote elegido no es de % en este estudio', v_med_nombre using errcode = 'check_violation';
      end if;
      if v_lote.quantity_on_hand < v_cant then
        raise exception 'No alcanza el stock del lote % de %: quedan %', v_lote.lot_number, v_med_nombre, v_lote.quantity_on_hand
          using errcode = 'check_violation';
      end if;
      update public.medication_lots set quantity_on_hand = quantity_on_hand - v_cant where id = v_lote.id;
      insert into public.stock_movements
        (medication_id, lot_id, movement_type, quantity_delta, reference_id, reference_type, reason, created_by)
      values (v_med, v_lote.id, 'correccion_entrega', -v_cant, p_dispensation_id, 'dispensation', v_razon, auth.uid());
      -- Primero el renglón del pedido: check_dispensation_item_protocol exige que el medicamento figure
      -- en la solicitud. El chequeo del protocolo (que el medicamento sea del estudio) sigue valiendo.
      select * into v_ri from public.dispensation_request_items
       where request_id = v_request_id and medication_id = v_med for update;
      if v_ri.id is not null then
        update public.dispensation_request_items set quantity = v_cant, quantity_indicated = null where id = v_ri.id;
      else
        insert into public.dispensation_request_items (request_id, medication_id, quantity)
        values (v_request_id, v_med, v_cant);
      end if;
      insert into public.dispensation_items (dispensation_id, medication_id, lot_id, quantity, lot_number, expiry_date)
      values (p_dispensation_id, v_med, v_lote.id, v_cant, v_lote.lot_number, v_lote.expiry_date);
      insert into public.dispensation_corrections
        (dispensation_id, request_id, tipo, antes, despues, motivo_codigo, motivo_texto, corrected_by, corrected_by_name)
      values (p_dispensation_id, v_request_id, 'renglon_alta', null,
        jsonb_build_object('medication_id', v_med, 'medicamento', v_med_nombre,
                           'lot_id', v_lote.id, 'lote', v_lote.lot_number, 'cantidad', v_cant),
        p_motivo, v_texto, auth.uid(), v_nombre);

    else
      raise exception 'Cambio desconocido en la corrección' using errcode = 'check_violation';
    end if;

    v_n := v_n + 1;
  end loop;

  -- Los kits. El stock de IP no tiene libro: se DERIVA de los kits entregados (v_ip_stock, 0071), así
  -- que el cambio se controla contra lo disponible del estudio antes de aplicarlo.
  if p_kits is not null and p_kits is distinct from v_kits then
    if v_kits is null and not v_includes_ip then
      raise exception 'Esta entrega no llevó producto en investigación' using errcode = 'check_violation';
    end if;
    if p_kits < 1 then
      raise exception 'Los kits entregados tienen que ser 1 o más' using errcode = 'check_violation';
    end if;
    if p_kits > coalesce(v_kits, 0) then
      v_disponibles := coalesce((select s.kits_disponibles from public.v_ip_stock s where s.protocol_id = v_protocol_id), 0);
      if v_disponibles < p_kits - coalesce(v_kits, 0) then
        raise exception 'No alcanzan los kits de IP del estudio: quedan %', v_disponibles using errcode = 'check_violation';
      end if;
    end if;
    update public.dispensations set ip_kits = p_kits where id = p_dispensation_id;
    insert into public.dispensation_corrections
      (dispensation_id, request_id, tipo, antes, despues, motivo_codigo, motivo_texto, corrected_by, corrected_by_name)
    values (p_dispensation_id, v_request_id, 'kits_ip',
      jsonb_build_object('kits', v_kits), jsonb_build_object('kits', p_kits),
      p_motivo, v_texto, auth.uid(), v_nombre);
    v_n := v_n + 1;
  end if;

  if v_n = 0 then
    raise exception 'No hay cambios para guardar' using errcode = 'check_violation';
  end if;
  return v_n;
end;
$$;

revoke all on function public.corregir_entrega_farmacia(uuid, jsonb, int, text, text) from public, anon;
grant execute on function public.corregir_entrega_farmacia(uuid, jsonb, int, text, text) to authenticated;


-- 5 · v_pharma_report_items — copia verbatim de la 0126 + el tipo nuevo ----------------------------
-- Las unidades de una entrega son su `dispensacion` MÁS sus correcciones: una corrección de 5 a 3
-- asienta +2, y la suma da 3. `having` saca el medicamento que se quitó entero (quedaría en 0 unidades,
-- como si se hubiera entregado y no). Se repite el `with (security_invoker = true)`: un
-- `create or replace view` sin él lo pierde.
create or replace view public.v_pharma_report_items with (security_invoker = true) as
select
  d.id                                  as dispensation_id,
  d.correlative_number,
  d.dispensation_code,
  d.delivered_at,
  -- Fecha LOCAL. Sin esto una entrega de las 21:30 cae al día siguiente y la serie diaria
  -- queda corrida. Mismo criterio que v_patient_visits (0004:30) y el resto del repo.
  (d.delivered_at at time zone 'America/Argentina/Buenos_Aires')::date as fecha,
  d.ip_kits,                            -- por DISPENSACIÓN: sumarlo sobre las filas duplica
  greatest(0, round(extract(epoch from (d.delivered_at - d.created_at)) / 60))::int
                                        as minutos_hasta_entrega,
  coalesce(sol.unidades, 0)             as unidades_solicitadas,
  dr.id                                 as request_id,
  dr.protocol_id,
  pr.code                               as protocol_code,
  pr.name                               as protocol_name,
  pr.sponsor,
  dr.visit_code,                        -- 0084
  dr.enrollment_id,
  e.patient_id,
  coalesce(e.ivrs_code, pa.code)                               as patient_code,
  pa.full_name                          as patient_name,
  mov.medication_id,
  m.name                                as medication_name,
  coalesce(mov.unidades, 0)             as unidades
from public.dispensations d
join public.dispensation_requests dr on dr.id = d.request_id
left join public.protocols   pr on pr.id = dr.protocol_id
left join public.enrollments e  on e.id  = dr.enrollment_id
left join public.patients    pa on pa.id = e.patient_id
left join lateral (
  select sum(dri.quantity)::int as unidades
    from public.dispensation_request_items dri
   where dri.request_id = dr.id
) sol on true
left join lateral (
  select sm.medication_id, sum(-sm.quantity_delta)::int as unidades
    from public.stock_movements sm
   where sm.reference_type = 'dispensation'
     and sm.reference_id   = d.id
     and sm.movement_type  in ('dispensacion', 'correccion_entrega')   -- 0151
   group by sm.medication_id
  having sum(-sm.quantity_delta) <> 0                                  -- 0151
) mov on true
left join public.medications m on m.id = mov.medication_id
where d.status = 'entregada'
  and d.delivered_at is not null;

comment on view public.v_pharma_report_items is
  'patient_code = IVRS de la INSCRIPCIÓN (enrollments.ivrs_code, 0062), con fallback a patients.code para las filas legacy. 0126. Las unidades suman las correcciones de la entrega (0151).';


-- 6 · reposicion_del_periodo — copia verbatim de la 0142 + el tipo nuevo en dos lugares -----------
-- Una corrección mueve stock como una salida (o su vuelta): cuenta en «salió» y en lo retirado por el
-- paciente. Sin esto, entró + salió + ajustes dejaría de cerrar contra `desde_inicio`, que suma todo.
-- Se fecha el día de la CORRECCIÓN, no el de la entrega: es un libro, y así se lee cualquier asiento
-- compensatorio (igual que la anulación de una recepción).
create or replace function public.reposicion_del_periodo(
  p_desde       date,
  p_hasta       date,
  p_protocol_id uuid default null
)
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare
  v_resultado jsonb;
begin
  if auth.uid() is null then raise exception 'No autenticado' using errcode = '42501'; end if;
  if not (public.has_min_role('pharma', 'viewer') or public.has_module('gerencia')) then
    raise exception 'No tenés permiso para ver la reposición' using errcode = '42501';
  end if;
  if p_desde is null or p_hasta is null or p_desde > p_hasta then
    raise exception 'El período no es válido' using errcode = '22023';
  end if;

  with
  estudios as (
    select p.id, p.code, p.name, p.status::text as status
      from public.protocols p
     where p.status <> 'cerrado'
       and (p_protocol_id is null or p.id = p_protocol_id)
       -- 0142 · alcance por estudio: los nueve bloques del resultado cuelgan de `estudios`. Gerencia
       -- pasa entera, porque el chequeo de arriba la autoriza por su cuenta (MIXTO, igual que la 0141).
       and (public.has_module('gerencia') or public.pharma_alcanza_protocolo(p.id))
  ),
  -- Movimientos de protocolo con su día en hora AR. El protocolo sale del LOTE: stock_movements no lo
  -- tiene (D32). Un ajuste sin lote no se puede atribuir a un estudio y queda afuera.
  movs as (
    select ml.protocol_id, sm.medication_id, sm.movement_type, sm.quantity_delta, sm.reference_type,
           sm.reference_id,
           (sm.created_at at time zone 'America/Argentina/Buenos_Aires')::date as dia
      from public.stock_movements sm
      join public.medication_lots ml on ml.id = sm.lot_id
      join estudios es on es.id = ml.protocol_id
     where ml.tipo = 'protocolo'
  ),
  -- Lo dispensado por enrolamiento: «ya retiró» (D14), dicho del período.
  retiros as (
    select mv.medication_id, dr.enrollment_id, -mv.quantity_delta as neto, mv.dia
      from movs mv
      left join public.dispensations d on d.id = mv.reference_id
      left join public.dispensation_requests dr on dr.id = d.request_id
     where mv.reference_type = 'dispensation'
       and mv.movement_type in ('dispensacion', 'devolucion', 'correccion_entrega')   -- 0151
  ),
  renglones as (
    select pmx.id as protocol_medication_id, pmx.protocol_id, pmx.medication_id,
           m.name as medication_name, m.unit as presentacion, m.drug_id,
           pmx.reposicion_modo as modo, pmx.envases_por_mes, pmx.stock_fijo
      from public.protocol_medications pmx
      join estudios es on es.id = pmx.protocol_id
      join public.medications m on m.id = pmx.medication_id
  ),
  cronograma as (
    select pv.enrollment_id, max(pv.estimated_date) as ultima
      from public.patient_visits pv
      join public.visit_definitions vd on vd.id = pv.visit_def_id
      join public.enrollments e on e.id = pv.enrollment_id
      join estudios es on es.id = e.protocol_id
     where pv.kind = 'programada'
       and vd.date_mode = 'automatica'
     group by pv.enrollment_id
  ),
  pacientes as (
    select pm.id as patient_medication_id, pm.enrollment_id, e.protocol_id, pm.medication_id, m.drug_id,
           pa.full_name as patient_name, e.status::text as enrollment_status,
           pm.envases_por_mes, pm.habilitacion_id, pm.created_at as asignado_el,
           (cr.enrollment_id is not null) as tiene_cronograma, cr.ultima as ultima_programada,
           coalesce((select sum(rt.neto) from retiros rt
                      where rt.enrollment_id = pm.enrollment_id and rt.medication_id = pm.medication_id
                        and rt.dia between p_desde and p_hasta), 0)::integer as retirado_periodo,
           (select max(rt.dia) from retiros rt
             where rt.enrollment_id = pm.enrollment_id and rt.medication_id = pm.medication_id
               and rt.neto > 0) as ultimo_retiro
      from public.patient_medications pm
      join public.enrollments e on e.id = pm.enrollment_id
      join estudios es on es.id = e.protocol_id
      join public.patients pa on pa.id = e.patient_id
      join public.medications m on m.id = pm.medication_id
      left join cronograma cr on cr.enrollment_id = pm.enrollment_id
     where pm.active
  ),
  -- Vencidos incluidos: el libro cuenta lo físico y la boleta filtra lo vigente en TypeScript.
  lotes as (
    select ml.protocol_id, ml.medication_id, ml.lot_number, ml.expiry_date, ml.quantity_on_hand as quantity
      from public.medication_lots ml
      join estudios es on es.id = ml.protocol_id
     where ml.tipo = 'protocolo'
       and ml.quantity_on_hand > 0
  ),
  movimientos as (
    select mv.protocol_id, mv.medication_id,
           coalesce(sum(mv.quantity_delta) filter (
             where mv.movement_type in ('recepcion', 'anulacion_recepcion') and mv.dia <= p_hasta), 0)::integer as entro,
           coalesce(-sum(mv.quantity_delta) filter (
             where mv.movement_type in ('dispensacion', 'devolucion', 'correccion_entrega') and mv.dia <= p_hasta), 0)::integer as salio,   -- 0151
           coalesce(sum(mv.quantity_delta) filter (
             where mv.movement_type in ('ajuste_manual', 'reasignacion', 'vencimiento') and mv.dia <= p_hasta), 0)::integer as ajustes,
           coalesce(sum(mv.quantity_delta), 0)::integer as desde_inicio
      from movs mv
     where mv.dia >= p_desde
     group by mv.protocol_id, mv.medication_id
  ),
  pedidos as (
    select pe.id, pe.numero, pe.protocol_id, pe.periodo_desde, pe.periodo_hasta, pe.emitido_el,
           pe.emitido_por_nombre, pe.anulado_at, pe.anulado_por_nombre, pe.anulado_motivo
      from public.pedidos_medicacion pe
      join estudios es on es.id = pe.protocol_id
  ),
  pedido_items as (
    select it.id, it.pedido_id, it.medication_id, m.name as medication_name, m.unit as presentacion,
           it.calculado, it.pedido, it.cerrado_at, it.cerrado_por_nombre, it.cerrado_motivo,
           coalesce((select sum(ri.quantity) from public.reception_items ri
                       join public.medication_receptions mr on mr.id = ri.reception_id
                      where mr.pedido_id = it.pedido_id and mr.status = 'verificada'
                        and ri.medication_id = it.medication_id), 0)::integer as recibido,
           coalesce((select sum(ri.quantity) from public.reception_items ri
                       join public.medication_receptions mr on mr.id = ri.reception_id
                      where mr.pedido_id = it.pedido_id and mr.status = 'pendiente'
                        and ri.medication_id = it.medication_id), 0)::integer as sin_verificar
      from public.pedido_medicacion_items it
      join pedidos pe on pe.id = it.pedido_id
      join public.medications m on m.id = it.medication_id
  ),
  recepciones as (
    select mr.id, mr.pedido_id, mr.folio, mr.reception_date, mr.status::text as status, mr.verified_by_name,
           coalesce((select sum(ri.quantity) from public.reception_items ri where ri.reception_id = mr.id), 0)::integer as envases,
           coalesce((select array_agg(distinct ri.medication_id) from public.reception_items ri
                      where ri.reception_id = mr.id), '{}') as medication_ids
      from public.medication_receptions mr
      join pedidos pe on pe.id = mr.pedido_id
     where mr.status in ('pendiente', 'verificada')
  ),
  sin_medicacion as (
    select e.protocol_id, count(*)::integer as enrolamientos
      from public.enrollments e
      join estudios es on es.id = e.protocol_id
     where e.status in ('screening', 'activo')
       and not exists (
         select 1 from public.patient_medications pm
          where pm.enrollment_id = e.id and pm.active and pm.habilitacion_id is null)
     group by e.protocol_id
  )
  select jsonb_build_object(
    'estudios',       coalesce((select jsonb_agg(to_jsonb(x)) from estudios x), '[]'::jsonb),
    'renglones',      coalesce((select jsonb_agg(to_jsonb(x)) from renglones x), '[]'::jsonb),
    'pacientes',      coalesce((select jsonb_agg(to_jsonb(x)) from pacientes x), '[]'::jsonb),
    'lotes',          coalesce((select jsonb_agg(to_jsonb(x)) from lotes x), '[]'::jsonb),
    'movimientos',    coalesce((select jsonb_agg(to_jsonb(x)) from movimientos x), '[]'::jsonb),
    'pedidos',        coalesce((select jsonb_agg(to_jsonb(x)) from pedidos x), '[]'::jsonb),
    'pedido_items',   coalesce((select jsonb_agg(to_jsonb(x)) from pedido_items x), '[]'::jsonb),
    'recepciones',    coalesce((select jsonb_agg(to_jsonb(x)) from recepciones x), '[]'::jsonb),
    'sin_medicacion', coalesce((select jsonb_agg(to_jsonb(x)) from sin_medicacion x), '[]'::jsonb)
  ) into v_resultado;

  return v_resultado;
end;
$fn$;

notify pgrst, 'reload schema';


-- Verificación (correr aparte, después): tiene que devolver tres filas.
--   select proname from pg_proc where proname in ('corregir_entrega_farmacia', 'reposicion_del_periodo', 'guard_dispensation_immutable');
--   select reloptions from pg_class where relname = 'v_pharma_report_items';   -- tiene que decir {security_invoker=true}
