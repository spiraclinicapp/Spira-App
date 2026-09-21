-- ============================================================================
-- 0141 · Estudios en Farmacia, PR 3: las dispensaciones
--
-- Plan: docs/plan-estudios-en-farmacia.md (PR 3). La base es de la 0139 (tabla, interruptor, funciones
-- de alcance) y la 0140 (stock y D6); este archivo la usa y suma dos funciones de alcance nuevas.
--
-- ── QUÉ HACE ──
-- Lleva el recorte por estudio a los pedidos de dispensación y sus renglones, las dispensaciones y sus
-- ítems, la medicación asignada al paciente, las constancias de IP, las habilitaciones, y las dos tablas
-- de Coordinación que Farmacia lee (track_dispensations y patient_timeline).
--
-- ── LO DIFÍCIL DE ESTA PR: LAS DISPENSACIONES SON COMPARTIDAS ──
-- El pedido lo crea Coordinación desde la visita y lo ejecuta Farmacia. Casi todas las policies y la
-- mitad de los RPC autorizan por DOS caminos: Farmacia, y gerencia o Coordinación. D4 manda que el
-- recorte sea del MÓDULO: alguien con los dos módulos y Farmacia acotada tiene que seguir pidiendo
-- medicación para un estudio que coordina. Por eso:
--   · en las policies, el alcance se suma SÓLO a la cláusula de Farmacia, y la de Coordinación
--     (coordina_visita / is_assigned_coordinator) queda letra por letra;
--   · en los RPC hay dos tipos de guarda —ver la sección 3—, y ninguna toca el camino de Coordinación.
--
-- ── ADITIVA Y NO BREAKING ──
-- Mientras nadie esté acotado no cambia una sola fila ni una sola respuesta. El front no cambia.
-- ⚠️ Va DESPUÉS de la 0140 (usa pharma_alcanza_protocolo con la regla D6 que puso esa).
--
-- ⚠️ REGLA OPERATIVA, la de siempre: NO acotar a nadie en prod hasta que esté aplicada la migración de
-- la PR 4 (reposición y estadísticas).
--
-- APLICAR: a mano en el SQL Editor de Supabase (rol postgres), DESPUÉS de la 0140. IDEMPOTENTE.
-- Registrar en supabase/README.md al confirmarse en prod.
-- ============================================================================


-- 1 · Funciones de alcance ------------------------------------------------------------------------

-- 1.1 · pharma_alcanza_solicitud, con el protocolo resuelto por la visita cuando la fila no lo tiene.
-- Misma firma que en la 0139: create or replace la reemplaza sin dejar sobrecargas.
--
-- POR QUÉ: dispensation_requests.protocol_id lo desnormalizó la 0071 con un backfill, y el propio
-- attach_ip_document (0071) lo lee como coalesce(r.protocol_id, e.protocol_id): una fila vieja puede
-- tenerlo en null. Con la regla D6 de la 0140 (protocolo null = no es de ningún estudio = lo ve todo
-- Farmacia), un pedido con ese null quedaría a la vista de todo acotado — y un pedido SIEMPRE es de un
-- estudio: nace de la visita de un paciente. El null ahí es un dato roto, no "de nadie".
-- La cadena pedido → visita → inscripción resuelve siempre: dispensation_requests.visit_id y
-- patient_visits.enrollment_id son not null desde la 0002, y enrollments.protocol_id también. Por eso
-- los joins son inner y el coalesce nunca llega a null.
create or replace function public.pharma_alcanza_solicitud(p_request_id uuid)
returns boolean language sql security definer stable
set search_path = pg_catalog, public as $fn$
  select public.pharma_sin_recorte() or exists (
    select 1
      from public.dispensation_requests dr
      join public.patient_visits pv on pv.id = dr.visit_id
      join public.enrollments e     on e.id  = pv.enrollment_id
     where dr.id = p_request_id
       and public.pharma_alcanza_protocolo(coalesce(dr.protocol_id, e.protocol_id)));
$fn$;

-- 1.2 · ¿Alcanza esta VISITA? Para track_dispensations y patient_timeline, que cuelgan de la visita, y
-- para los RPC que reciben un p_visit_id. Farmacia no puede leer patient_visits (0006:162), pero esta
-- función es security definer y sí: resuelve el protocolo por la inscripción, sin exponer la visita.
create or replace function public.pharma_alcanza_visita(p_visit_id uuid)
returns boolean language sql security definer stable
set search_path = pg_catalog, public as $fn$
  select public.pharma_sin_recorte() or exists (
    select 1
      from public.patient_visits pv
      join public.enrollments e on e.id = pv.enrollment_id
     where pv.id = p_visit_id
       and public.pharma_alcanza_protocolo(e.protocol_id));
$fn$;

comment on function public.pharma_alcanza_visita is
  'Alcance de Farmacia sobre una visita, por el protocolo de su inscripcion. NO comprueba el modulo ni '
  'el nivel: se SUMA a la condicion de la policy o del RPC. 0141.';

-- 1.3 · ¿Alcanza esta INSCRIPCIÓN? Para patient_medications y los RPC que reciben un p_enrollment_id.
create or replace function public.pharma_alcanza_inscripcion(p_enrollment_id uuid)
returns boolean language sql security definer stable
set search_path = pg_catalog, public as $fn$
  select public.pharma_sin_recorte() or exists (
    select 1 from public.enrollments e
     where e.id = p_enrollment_id
       and public.pharma_alcanza_protocolo(e.protocol_id));
$fn$;

comment on function public.pharma_alcanza_inscripcion is
  'Alcance de Farmacia sobre una inscripcion, por su protocolo. NO comprueba el modulo ni el nivel: se '
  'SUMA a la condicion de la policy o del RPC. 0141.';

grant execute on function public.pharma_alcanza_visita(uuid)      to authenticated;
grant execute on function public.pharma_alcanza_inscripcion(uuid) to authenticated;


-- 2 · El recorte: dieciocho policies --------------------------------------------------------------
-- `alter policy`: conserva comando y roles, cambia sólo la expresión. Cada una es la VIVA (0006, 0009,
-- 0023, 0050, 0071, 0124) con el alcance SUMADO a la cláusula de Farmacia. Las cláusulas de gerencia,
-- contable y Coordinación quedan como estaban, afuera del and.

-- 2.1 · dispensation_requests (viva: 0006 y 0009)
alter policy "ver solicitudes" on public.dispensation_requests
  using (
    public.has_module('gerencia')
    or (public.has_module('pharma') and public.pharma_alcanza_solicitud(id))
    or public.coordina_visita(visit_id)
  );
alter policy "pharma atiende solicitud" on public.dispensation_requests
  using      ((public.has_min_role('pharma', 'operator') and public.pharma_alcanza_solicitud(id))
              or public.has_module('gerencia'))
  with check ((public.has_min_role('pharma', 'operator') and public.pharma_alcanza_solicitud(id))
              or public.has_module('gerencia'));

-- 2.2 · dispensation_request_items (viva: 0006)
alter policy "ver items solicitud" on public.dispensation_request_items
  using (
    public.has_module('gerencia')
    or (public.has_module('pharma') and public.pharma_alcanza_solicitud(request_id))
    or exists (select 1 from public.dispensation_requests dr
               where dr.id = dispensation_request_items.request_id and public.coordina_visita(dr.visit_id))
  );

-- 2.3 · dispensations (viva: 0006 y 0009)
alter policy "ver dispensaciones" on public.dispensations
  using (
    (public.has_module('pharma') and public.pharma_alcanza_solicitud(request_id))
    or public.has_module('contable') or public.has_module('gerencia')
    or exists (select 1 from public.dispensation_requests dr
               where dr.id = dispensations.request_id and public.coordina_visita(dr.visit_id))
  );
alter policy "pharma ejecuta dispensaciones" on public.dispensations
  with check (public.has_min_role('pharma', 'operator') and executed_by = auth.uid()
              and public.pharma_alcanza_solicitud(request_id));
alter policy "pharma actualiza dispensaciones" on public.dispensations
  using      (public.has_min_role('pharma', 'operator') and public.pharma_alcanza_solicitud(request_id))
  with check (public.has_min_role('pharma', 'operator') and public.pharma_alcanza_solicitud(request_id));

-- 2.4 · dispensation_items (viva: 0006 y 0009)
alter policy "ver items dispensacion" on public.dispensation_items
  using (
    (public.has_module('pharma') and public.pharma_alcanza_dispensacion(dispensation_id))
    or public.has_module('contable') or public.has_module('gerencia')
    or exists (select 1 from public.dispensations d
               join public.dispensation_requests dr on dr.id = d.request_id
               where d.id = dispensation_items.dispensation_id and public.coordina_visita(dr.visit_id))
  );
alter policy "pharma inserta items dispensacion" on public.dispensation_items
  with check (public.has_min_role('pharma', 'operator') and public.pharma_alcanza_dispensacion(dispensation_id));
alter policy "pharma edita items pre-entrega" on public.dispensation_items
  using (public.has_min_role('pharma', 'operator') and public.pharma_alcanza_dispensacion(dispensation_id) and exists (
    select 1 from public.dispensations d where d.id = dispensation_items.dispensation_id and d.status <> 'entregada'))
  with check (public.has_min_role('pharma', 'operator') and public.pharma_alcanza_dispensacion(dispensation_id) and exists (
    select 1 from public.dispensations d where d.id = dispensation_items.dispensation_id and d.status <> 'entregada'));
alter policy "borrar items dispensacion" on public.dispensation_items
  using (
    public.has_module('gerencia')
    or (public.has_min_role('pharma', 'operator') and public.pharma_alcanza_dispensacion(dispensation_id) and exists (
      select 1 from public.dispensations d where d.id = dispensation_items.dispensation_id and d.status <> 'entregada'))
  );

-- 2.5 · patient_medications (viva: 0050)
alter policy "ver medicación asignada" on public.patient_medications
  using (
    (public.has_module('pharma') and public.pharma_alcanza_inscripcion(enrollment_id))
    or public.has_module('gerencia')
    or exists (select 1 from public.enrollments e
               where e.id = patient_medications.enrollment_id
                 and public.is_assigned_coordinator(e.protocol_id))
  );
alter policy "pharma asigna medicación" on public.patient_medications
  with check (public.has_min_role('pharma','operator') and public.pharma_alcanza_inscripcion(enrollment_id));
alter policy "pharma modifica medicación" on public.patient_medications
  using      (public.has_min_role('pharma','operator') and public.pharma_alcanza_inscripcion(enrollment_id))
  with check (public.has_min_role('pharma','operator') and public.pharma_alcanza_inscripcion(enrollment_id));

-- 2.6 · dispensation_ip_documents (viva: 0071)
alter policy "ver constancias de IP" on public.dispensation_ip_documents
  using (
    (public.has_min_role('pharma','viewer') and public.pharma_alcanza_solicitud(request_id))
    or public.has_module('gerencia')
    or exists (select 1 from public.dispensation_requests r
               where r.id = dispensation_ip_documents.request_id and public.coordina_visita(r.visit_id))
  );

-- 2.7 · dispensation_habilitaciones (viva: 0124)
alter policy "ver habilitaciones" on public.dispensation_habilitaciones
  using (
    (public.has_min_role('pharma', 'viewer') and public.pharma_alcanza_solicitud(request_id))
    or public.has_module('gerencia')
    or exists (select 1 from public.dispensation_requests r
               where r.id = dispensation_habilitaciones.request_id and public.coordina_visita(r.visit_id))
  );

-- 2.8 · track_dispensations (viva: 0023) — tabla de Coordinación que Farmacia lee.
alter policy "ver track_dispensations" on public.track_dispensations
  using (
    public.has_module('gerencia')
    or (public.has_module('pharma') and public.pharma_alcanza_visita(patient_visit_id))
    or public.has_module('contable')
    or public.coordina_visita(patient_visit_id)
  );

-- 2.9 · patient_timeline (viva: 0006 y 0009) — idem.
alter policy "ver timeline" on public.patient_timeline
  using (
    public.has_module('gerencia')
    or (public.has_module('pharma') and public.pharma_alcanza_visita(visit_id))
    or public.coordina_visita(visit_id)
  );
alter policy "track/pharma registran eventos" on public.patient_timeline
  with check (
    actor_id = auth.uid() and (
      public.has_module('gerencia')
      or (public.has_min_role('pharma', 'operator') and public.pharma_alcanza_visita(visit_id))
      or (public.has_min_role('track', 'operator') and public.coordina_visita(visit_id)))
  );


-- 3 · Las guardas de los veintinueve RPC -----------------------------------------------------------
-- Security definer: la RLS de arriba no los alcanza. Cada uno se reemplaza con su cuerpo VIVO, extraído
-- por script de su migración y comparado byte a byte, más la guarda después del begin. Firma idéntica:
-- sin sobrecargas, y grants y comentarios conservados.
--
-- DOS TIPOS DE GUARDA, según por dónde autoriza cada RPC:
--   · FARMACIA (15): el cuerpo sólo deja pasar a Farmacia. La guarda es el alcance, sin excepciones —ni
--     para gerencia, igual que en la 0140: ver es de gerencia, operar la dispensación es de Farmacia—.
--   · MIXTO (14): el cuerpo autoriza también por gerencia o Coordinación. La guarda deja pasar ESE camino,
--     copiado del chequeo del propio cuerpo, y sólo corta a quien entra ÚNICAMENTE por Farmacia a un
--     estudio fuera de su alcance. Así una coordinadora con Farmacia acotada sigue pidiendo medicación
--     para su estudio (D4). La guarda nunca AUTORIZA nada: quien no pasa el chequeo de abajo tampoco
--     pasa por ella, porque sin rol de Farmacia pharma_sin_recorte() es true y el cuerpo decide.
--
-- Quedan SIN guarda, a propósito:
--   · cancel_dispensation_request, close_visit_ip, close_enrollment, dispense: sólo Coordinación.
--   · farmaceuticas_disponibles: devuelve personas, no datos de un estudio.
--   · Los triggers (apply_dispensation_stock, cerrar_habilitaciones_del_pedido, check_*_protocol,
--     validate_dispensation_request_status): corren adentro de un RPC ya guardado o de una escritura que
--     pasó por la RLS.
--   · alta_pedido_interna y alta_renglon_pedido: sin execute para authenticated (0124); sólo los llama
--     create_dispensation_request, que sí tiene guarda.

-- 3.1 · alternativas_sustitucion (FARMACIA).
create or replace function public.alternativas_sustitucion(p_item_id uuid)
returns table (
  medication_id  uuid,
  nombre         text,
  dosis          text,
  presentacion   text,
  stock          integer,
  bloqueada      boolean,
  motivo         text
)
language plpgsql security definer set search_path = public as $$
declare
  v_protocol_id uuid;
  v_drug_id     uuid;
  v_dosis       text;
  v_med_actual  uuid;
begin
  -- 0141 · Alcance por estudio en Farmacia. Este RPC es SÓLO de Farmacia: la guarda es el alcance, sin
  -- excepciones. Va primero y no toca nada: a quien no está acotado pharma_sin_recorte() lo deja pasar
  -- antes de mirar una tabla, y el resto de la función corre igual que antes de esta migración.
  if not (
       public.pharma_alcanza_solicitud((select dri.request_id from public.dispensation_request_items dri where dri.id = p_item_id))) then
    raise exception 'No tenés acceso a este estudio.' using errcode = '42501';
  end if;

  if auth.uid() is null then raise exception 'No autenticado' using errcode = '42501'; end if;
  if not public.has_min_role('pharma','operator') then
    raise exception 'Solo Pharma (operador) puede ver alternativas' using errcode = '42501';
  end if;

  -- Todo calificado con alias: un `returns table` cuyos nombres de salida chocan con columnas sin
  -- calificar ya rompió dos migraciones seguidas (0056 y 0058).
  select e.protocol_id, m.drug_id, m.dosis, dri.medication_id
    into v_protocol_id, v_drug_id, v_dosis, v_med_actual
  from public.dispensation_request_items dri
  join public.dispensation_requests dr on dr.id = dri.request_id
  join public.patient_visits pv        on pv.id = dr.visit_id
  join public.enrollments e            on e.id  = pv.enrollment_id
  join public.medications m            on m.id  = dri.medication_id
  where dri.id = p_item_id;

  if not found then raise exception 'Renglón inexistente' using errcode = '23503'; end if;

  -- Sin droga cargada no hay forma de saber qué es equivalente. Devolver la lista vacía es la
  -- respuesta honesta; el front dice por qué.
  if v_drug_id is null then return; end if;

  return query
  select
    m.id,
    m.name,
    m.dosis,
    m.unit,
    coalesce((
      select sum(ml.quantity_on_hand)::integer
      from public.medication_lots ml
      where ml.medication_id = m.id
        and ml.protocol_id = v_protocol_id
        and (ml.expiry_date is null or ml.expiry_date >= current_date)
    ), 0),
    -- Otra concentración: se muestra, no se puede usar.
    (m.dosis is distinct from v_dosis),
    case when m.dosis is distinct from v_dosis
         then 'Otra concentración · requiere autorización del investigador principal'
         else null
    end
  from public.medications m
  join public.protocol_medications pm
    on pm.medication_id = m.id and pm.protocol_id = v_protocol_id
  where m.drug_id = v_drug_id
    and m.id <> v_med_actual
  order by (m.dosis is distinct from v_dosis) asc, m.name asc;
end; $$;

-- 3.2 · assign_patient_medication (FARMACIA).
create or replace function public.assign_patient_medication(
  p_enrollment_id uuid,
  p_medication_id uuid,
  p_notes text,
  p_confirm_new_to_protocol boolean default false
) returns table(id uuid, needs_confirmation boolean)
language plpgsql security definer set search_path = public as $$
declare
  v_protocol_id uuid;
  v_new_id uuid;
  v_associated boolean;
begin
  -- 0141 · Alcance por estudio en Farmacia. Este RPC es SÓLO de Farmacia: la guarda es el alcance, sin
  -- excepciones. Va primero y no toca nada: a quien no está acotado pharma_sin_recorte() lo deja pasar
  -- antes de mirar una tabla, y el resto de la función corre igual que antes de esta migración.
  if not (
       public.pharma_alcanza_inscripcion(p_enrollment_id)) then
    raise exception 'No tenés acceso a este estudio.' using errcode = '42501';
  end if;

  if not public.has_min_role('pharma','operator') then
    raise exception 'Sin permiso para asignar medicación' using errcode = '42501';
  end if;

  select e.protocol_id into v_protocol_id from public.enrollments e where e.id = p_enrollment_id;

  select exists(
    select 1 from public.protocol_medications pm
    where pm.protocol_id = v_protocol_id and pm.medication_id = p_medication_id
  ) into v_associated;

  if not v_associated and not p_confirm_new_to_protocol then
    return query select null::uuid, true;
    return;
  end if;

  if not v_associated then
    -- Mismo patrón que apply_reception_stock / create_reception (0040): asociar en vez de rechazar,
    -- pero acá SOLO después de confirmación explícita del usuario (no automático como al recibir).
    insert into public.protocol_medications (protocol_id, medication_id)
    values (v_protocol_id, p_medication_id)
    on conflict (protocol_id, medication_id) do nothing;
  end if;

  insert into public.patient_medications (enrollment_id, medication_id, notes)
  values (p_enrollment_id, p_medication_id, p_notes)
  returning patient_medications.id into v_new_id;

  return query select v_new_id, false;
end;
$$;

-- 3.3 · cancel_dispensation_preparation (FARMACIA).
create or replace function public.cancel_dispensation_preparation(p_request_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_status request_status; v_disp_id uuid; v_disp_status dispensation_status;
begin
  -- 0141 · Alcance por estudio en Farmacia. Este RPC es SÓLO de Farmacia: la guarda es el alcance, sin
  -- excepciones. Va primero y no toca nada: a quien no está acotado pharma_sin_recorte() lo deja pasar
  -- antes de mirar una tabla, y el resto de la función corre igual que antes de esta migración.
  if not (
       public.pharma_alcanza_solicitud(p_request_id)) then
    raise exception 'No tenés acceso a este estudio.' using errcode = '42501';
  end if;

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

-- 3.4 · deliver_dispensation (FARMACIA).  El cuerpo vivo decía `create function`: acá pasa a `create or replace` (única diferencia).
create or replace function public.deliver_dispensation(p_dispensation_id uuid, p_ip_kits integer default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_status dispensation_status; v_request_id uuid;
begin
  -- 0141 · Alcance por estudio en Farmacia. Este RPC es SÓLO de Farmacia: la guarda es el alcance, sin
  -- excepciones. Va primero y no toca nada: a quien no está acotado pharma_sin_recorte() lo deja pasar
  -- antes de mirar una tabla, y el resto de la función corre igual que antes de esta migración.
  if not (
       public.pharma_alcanza_dispensacion(p_dispensation_id)) then
    raise exception 'No tenés acceso a este estudio.' using errcode = '42501';
  end if;

  if auth.uid() is null then raise exception 'No autenticado' using errcode = '42501'; end if;
  if not public.has_min_role('pharma','operator') then
    raise exception 'Solo Pharma (operador) puede entregar' using errcode = '42501';
  end if;

  select status, request_id into v_status, v_request_id
  from public.dispensations where id = p_dispensation_id for update;
  if not found then raise exception 'Dispensación inexistente' using errcode = '23503'; end if;
  if v_status = 'entregada' then
    raise exception 'Esta dispensación ya fue entregada' using errcode = 'check_violation';
  end if;
  if v_status <> 'lista' then
    raise exception 'Solo se puede entregar una dispensación lista (estado actual: %)', v_status
      using errcode = 'check_violation';
  end if;

  if (select r.includes_ip
        from public.dispensation_requests r
        join public.dispensations d on d.request_id = r.id
       where d.id = p_dispensation_id) then
    if p_ip_kits is null or p_ip_kits < 1 then
      raise exception 'Indicá cuántos kits de producto en investigación se entregaron'
        using errcode = 'check_violation';
    end if;
    update public.dispensations set ip_kits = p_ip_kits where id = p_dispensation_id;
  end if;

  update public.dispensations set status = 'entregada' where id = p_dispensation_id;
  update public.dispensation_requests set status = 'atendida' where id = v_request_id;
end; $$;

-- 3.5 · habilitar_medicamento_pedido (FARMACIA).
create or replace function public.habilitar_medicamento_pedido(p_habilitacion_id uuid)
returns void language plpgsql security definer set search_path = public as $fn$
declare
  v_h          record;
  v_status     request_status;
  v_enrollment uuid;
  v_dispenses  boolean;
  v_item       jsonb;
begin
  -- 0141 · Alcance por estudio en Farmacia. Este RPC es SÓLO de Farmacia: la guarda es el alcance, sin
  -- excepciones. Va primero y no toca nada: a quien no está acotado pharma_sin_recorte() lo deja pasar
  -- antes de mirar una tabla, y el resto de la función corre igual que antes de esta migración.
  if not (
       public.pharma_alcanza_solicitud((select h.request_id from public.dispensation_habilitaciones h where h.id = p_habilitacion_id))) then
    raise exception 'No tenés acceso a este estudio.' using errcode = '42501';
  end if;

  if auth.uid() is null then raise exception 'No autenticado' using errcode = '42501'; end if;
  if not public.has_min_role('pharma','operator') then
    raise exception 'Sólo Farmacia (operador) puede habilitar un medicamento pedido' using errcode = '42501';
  end if;

  select h.id, h.request_id, h.medication_id, h.quantity, h.quantity_indicated, h.saldo_de_item_id, h.estado
    into v_h
    from public.dispensation_habilitaciones h
   where h.id = p_habilitacion_id;
  if not found then
    raise exception 'No se encontró el pedido de habilitación.' using errcode = '23503';
  end if;

  select dr.status, pv.enrollment_id, coalesce(vd.dispenses, false)
    into v_status, v_enrollment, v_dispenses
    from public.dispensation_requests dr
    join public.patient_visits pv on pv.id = dr.visit_id
    left join public.visit_definitions vd on vd.id = pv.visit_def_id
   where dr.id = v_h.request_id
   for update of dr;

  perform 1 from public.dispensation_habilitaciones h where h.id = p_habilitacion_id for update of h;

  if v_status <> 'preparando' then
    raise exception 'La habilitación se resuelve al preparar el pedido.' using errcode = 'check_violation';
  end if;
  if exists (select 1 from public.dispensations d
              where d.request_id = v_h.request_id and d.status in ('lista', 'entregada')) then
    raise exception 'El comprobante ya se emitió: cancelá la preparación para cambiar el pedido.'
      using errcode = 'check_violation';
  end if;
  if (select h.estado from public.dispensation_habilitaciones h where h.id = p_habilitacion_id) <> 'pendiente' then
    raise exception 'Esta habilitación ya se resolvió.' using errcode = 'check_violation';
  end if;

  -- La decisión va PRIMERO: así el saldo restante (que cuenta las pendientes) no se cuenta a sí mismo
  -- al sumar el renglón.
  update public.dispensation_habilitaciones h
     set estado = 'habilitada', decided_by = auth.uid(), decided_at = now(),
         decided_by_name = (select u.full_name from public.users u where u.id = auth.uid())
   where h.id = p_habilitacion_id;

  -- La habilitación. Si ya estaba activa (Farmacia la habilitó a mano mientras tanto), no se marca:
  -- la marca es lo que la vuelve a desactivar al terminar, y lo habilitado a mano queda habilitado.
  insert into public.patient_medications (enrollment_id, medication_id, active, notes, habilitacion_id)
    values (v_enrollment, v_h.medication_id, true, 'Habilitada por receta para una entrega', p_habilitacion_id)
  on conflict (enrollment_id, medication_id) do update
    set active = true,
        habilitacion_id = case when public.patient_medications.active
                               then public.patient_medications.habilitacion_id
                               else excluded.habilitacion_id end;

  -- El renglón, con las mismas validaciones de siempre (0123): guard de un renglón por medicamento,
  -- protocolo y habilitación (0050), y las reglas del saldo si lo es.
  v_item := jsonb_build_object('medication_id', v_h.medication_id, 'quantity', v_h.quantity);
  if v_h.quantity_indicated is not null then
    v_item := v_item || jsonb_build_object('quantity_indicated', v_h.quantity_indicated);
  end if;
  if v_h.saldo_de_item_id is not null then
    v_item := v_item || jsonb_build_object('saldo_de_item_id', v_h.saldo_de_item_id);
  end if;
  perform public.alta_renglon_pedido(v_h.request_id, v_item);

  update public.dispensation_habilitaciones h
     set item_id = (select dri.id from public.dispensation_request_items dri
                     where dri.request_id = v_h.request_id and dri.medication_id = v_h.medication_id)
   where h.id = p_habilitacion_id;

  if not v_dispenses then
    update public.dispensation_requests dr set base_sin_cronograma = true
     where dr.id = v_h.request_id and not dr.base_sin_cronograma;
  end if;
end;
$fn$;

-- 3.6 · mark_dispensation_ready (FARMACIA).
create or replace function public.mark_dispensation_ready(p_request_id uuid)
returns table (dispensation_id uuid, correlative_number integer, dispensation_code text)
language plpgsql security definer set search_path = public as $fn$
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
  v_habilitar   text;
begin
  -- 0141 · Alcance por estudio en Farmacia. Este RPC es SÓLO de Farmacia: la guarda es el alcance, sin
  -- excepciones. Va primero y no toca nada: a quien no está acotado pharma_sin_recorte() lo deja pasar
  -- antes de mirar una tabla, y el resto de la función corre igual que antes de esta migración.
  if not (
       public.pharma_alcanza_solicitud(p_request_id)) then
    raise exception 'No tenés acceso a este estudio.' using errcode = '42501';
  end if;

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

  -- ── 0124: lo que cambia el comprobante se resuelve antes de emitirlo (D22) ──
  select m.name into v_habilitar
    from public.dispensation_habilitaciones h
    join public.medications m on m.id = h.medication_id
   where h.request_id = p_request_id and h.estado = 'pendiente'
   order by h.requested_at
   limit 1;
  if v_habilitar is not null then
    raise exception 'Falta resolver la habilitación de %', v_habilitar using errcode = 'check_violation';
  end if;

  select coalesce(sum(dri.quantity - dri.scanned_units), 0)::integer into v_pending
  from public.dispensation_request_items dri
  where dri.request_id = p_request_id;
  if v_pending > 0 then
    raise exception 'Faltan % unidades por escanear', v_pending using errcode = 'check_violation';
  end if;

  if (select r.includes_ip from public.dispensation_requests r where r.id = p_request_id) then
    if not exists (
      select 1 from public.dispensation_ip_documents d
      where d.request_id = p_request_id and d.superseded_at is null
    ) then
      raise exception 'Falta la constancia del producto en investigación' using errcode = 'check_violation';
    end if;

    if not exists (
      select 1 from public.dispensation_ip_documents d
      where d.request_id = p_request_id and d.superseded_at is null and d.printed_at is not null
    ) then
      raise exception 'Falta imprimir la constancia del producto en investigación'
        using errcode = 'check_violation';
    end if;
  end if;

  if not exists (select 1 from public.dispensation_request_items i where i.request_id = p_request_id)
     and not (select r.includes_ip from public.dispensation_requests r where r.id = p_request_id) then
    raise exception 'Este pedido no tiene medicación cargada ni constancia de producto en investigación: no hay nada que dispensar. Adjuntá la constancia del IRT o cargá la medicación.'
      using errcode = 'check_violation';
  end if;

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
    delete from public.dispensation_items di where di.dispensation_id = v_disp_id;
  end if;

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
    select ml.id, ml.lot_number, ml.expiry_date into v_lot
    from public.medication_lots ml
    where ml.medication_id = v_item.medication_id
      and ml.protocol_id   = v_protocol_id
      and ml.quantity_on_hand >= v_item.quantity
      and (ml.expiry_date is null or ml.expiry_date >= current_date)
    order by ml.expiry_date asc nulls last, ml.created_at asc, ml.lot_number asc
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
end;
$fn$;

-- 3.7 · mark_ip_document_printed (FARMACIA).
create or replace function public.mark_ip_document_printed(p_document_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_request_id uuid; v_superseded timestamptz;
begin
  -- 0141 · Alcance por estudio en Farmacia. Este RPC es SÓLO de Farmacia: la guarda es el alcance, sin
  -- excepciones. Va primero y no toca nada: a quien no está acotado pharma_sin_recorte() lo deja pasar
  -- antes de mirar una tabla, y el resto de la función corre igual que antes de esta migración.
  if not (
       public.pharma_alcanza_solicitud((select d.request_id from public.dispensation_ip_documents d where d.id = p_document_id))) then
    raise exception 'No tenés acceso a este estudio.' using errcode = '42501';
  end if;

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

-- 3.8 · no_habilitar_medicamento_pedido (FARMACIA).
create or replace function public.no_habilitar_medicamento_pedido(
  p_habilitacion_id uuid,
  p_motivo          text,
  p_detalle         text default null)
returns void language plpgsql security definer set search_path = public as $fn$
declare
  v_h        record;
  v_status   request_status;
  v_ip       boolean;
  v_etiqueta text;
begin
  -- 0141 · Alcance por estudio en Farmacia. Este RPC es SÓLO de Farmacia: la guarda es el alcance, sin
  -- excepciones. Va primero y no toca nada: a quien no está acotado pharma_sin_recorte() lo deja pasar
  -- antes de mirar una tabla, y el resto de la función corre igual que antes de esta migración.
  if not (
       public.pharma_alcanza_solicitud((select h.request_id from public.dispensation_habilitaciones h where h.id = p_habilitacion_id))) then
    raise exception 'No tenés acceso a este estudio.' using errcode = '42501';
  end if;

  if auth.uid() is null then raise exception 'No autenticado' using errcode = '42501'; end if;
  if not public.has_min_role('pharma','operator') then
    raise exception 'Sólo Farmacia (operador) puede resolver un medicamento pedido' using errcode = '42501';
  end if;

  select h.id, h.request_id, h.estado, m.name as nombre
    into v_h
    from public.dispensation_habilitaciones h
    join public.medications m on m.id = h.medication_id
   where h.id = p_habilitacion_id;
  if not found then
    raise exception 'No se encontró el pedido de habilitación.' using errcode = '23503';
  end if;

  select dr.status, dr.includes_ip into v_status, v_ip
    from public.dispensation_requests dr
   where dr.id = v_h.request_id
   for update of dr;
  perform 1 from public.dispensation_habilitaciones h where h.id = p_habilitacion_id for update of h;

  if v_status <> 'preparando' then
    raise exception 'La habilitación se resuelve al preparar el pedido.' using errcode = 'check_violation';
  end if;
  if exists (select 1 from public.dispensations d
              where d.request_id = v_h.request_id and d.status in ('lista', 'entregada')) then
    raise exception 'El comprobante ya se emitió: cancelá la preparación para cambiar el pedido.'
      using errcode = 'check_violation';
  end if;
  if (select h.estado from public.dispensation_habilitaciones h where h.id = p_habilitacion_id) <> 'pendiente' then
    raise exception 'Esta habilitación ya se resolvió.' using errcode = 'check_violation';
  end if;

  v_etiqueta := case p_motivo
    when 'receta_ilegible' then 'Receta ilegible o incompleta'
    when 'receta_sin_firma' then 'Receta sin firma del médico'
    when 'no_corresponde'  then 'No corresponde a este paciente'
    when 'sin_stock'       then 'Sin stock en el protocolo'
    when 'otro'            then nullif(btrim(coalesce(p_detalle, '')), '')
  end;
  if v_etiqueta is null then
    raise exception 'Elegí un motivo (con «Otro motivo», contalo).' using errcode = 'check_violation';
  end if;

  update public.dispensation_habilitaciones h
     set estado = 'no_habilitada', motivo_codigo = p_motivo,
         motivo_texto = case when p_motivo = 'otro' then v_etiqueta else null end,
         decided_by = auth.uid(), decided_at = now(),
         decided_by_name = (select u.full_name from public.users u where u.id = auth.uid())
   where h.id = p_habilitacion_id;

  if not v_ip
     and not exists (select 1 from public.dispensation_request_items dri where dri.request_id = v_h.request_id)
     and not exists (select 1 from public.dispensation_habilitaciones h
                      where h.request_id = v_h.request_id and h.estado = 'pendiente') then
    perform public.reject_dispensation_request(v_h.request_id, 'No se habilitó ' || v_h.nombre || ': ' || v_etiqueta);
  end if;
end;
$fn$;

-- 3.9 · reassign_dispensation_preparation (FARMACIA).
create or replace function public.reassign_dispensation_preparation(
  p_request_id uuid,
  p_user_id    uuid
)
returns void language plpgsql security definer set search_path = public as $$
declare v_status request_status; v_actual uuid;
begin
  -- 0141 · Alcance por estudio en Farmacia. Este RPC es SÓLO de Farmacia: la guarda es el alcance, sin
  -- excepciones. Va primero y no toca nada: a quien no está acotado pharma_sin_recorte() lo deja pasar
  -- antes de mirar una tabla, y el resto de la función corre igual que antes de esta migración.
  if not (
       public.pharma_alcanza_solicitud(p_request_id)) then
    raise exception 'No tenés acceso a este estudio.' using errcode = '42501';
  end if;

  if auth.uid() is null then raise exception 'No autenticado' using errcode = '42501'; end if;
  if not public.has_min_role('pharma','operator') then
    raise exception 'Solo Pharma (operador) puede reasignar una preparación' using errcode = '42501';
  end if;

  select dr.status, dr.prepared_by into v_status, v_actual
  from public.dispensation_requests dr where dr.id = p_request_id for update;
  if not found then raise exception 'Solicitud inexistente' using errcode = '23503'; end if;

  -- Solo mientras se prepara. Desde 'lista' el comprobante ya salió sellado con las iniciales de
  -- quien lo preparó (`dispensation_code`, 0055): cambiar de responsable después dejaría el papel
  -- impreso nombrando a una persona y la base a otra.
  if v_status <> 'preparando' then
    raise exception 'Solo se puede reasignar una preparación en curso (estado actual: %)', v_status
      using errcode = 'check_violation';
  end if;

  if p_user_id = v_actual then
    raise exception 'Esa preparación ya está asignada a esa persona' using errcode = 'check_violation';
  end if;

  -- Quien recibe tiene que PODER prepararla. Sin este control, reasignar a alguien de otro módulo
  -- dejaría el pedido en manos de quien no lo puede ni abrir, y en el tablero figuraría trabajado
  -- por alguien que no lo va a tocar nunca.
  if not exists (
    select 1 from public.user_module_roles umr
    where umr.user_id = p_user_id
      and umr.module = 'pharma'
      and umr.role in ('operator','leader','admin')
  ) then
    raise exception 'Esa persona no puede preparar dispensaciones' using errcode = 'check_violation';
  end if;

  update public.dispensation_requests dr
    set prepared_by = p_user_id
    where dr.id = p_request_id;
end; $$;

-- 3.10 · reject_dispensation_request (FARMACIA).
create or replace function public.reject_dispensation_request(p_request_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare v_status request_status; v_disp_id uuid; v_disp_status dispensation_status;
begin
  -- 0141 · Alcance por estudio en Farmacia. Este RPC es SÓLO de Farmacia: la guarda es el alcance, sin
  -- excepciones. Va primero y no toca nada: a quien no está acotado pharma_sin_recorte() lo deja pasar
  -- antes de mirar una tabla, y el resto de la función corre igual que antes de esta migración.
  if not (
       public.pharma_alcanza_solicitud(p_request_id)) then
    raise exception 'No tenés acceso a este estudio.' using errcode = '42501';
  end if;

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

-- 3.11 · resolve_dispensation (FARMACIA).
create or replace function public.resolve_dispensation(p_request_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_status      request_status;
  v_protocol_id uuid;
  v_dispensation_id uuid;
  v_item        record;
  v_lot         record;
begin
  -- 0141 · Alcance por estudio en Farmacia. Este RPC es SÓLO de Farmacia: la guarda es el alcance, sin
  -- excepciones. Va primero y no toca nada: a quien no está acotado pharma_sin_recorte() lo deja pasar
  -- antes de mirar una tabla, y el resto de la función corre igual que antes de esta migración.
  if not (
       public.pharma_alcanza_solicitud(p_request_id)) then
    raise exception 'No tenés acceso a este estudio.' using errcode = '42501';
  end if;

  if auth.uid() is null then raise exception 'No autenticado' using errcode = '42501'; end if;
  if not public.has_min_role('pharma','operator') then                -- viewer = solo lectura, no dispensa
    raise exception 'Solo Pharma (operador) puede resolver dispensaciones' using errcode = '42501';
  end if;

  -- lock la solicitud + resolver su protocolo
  select dr.status, e.protocol_id into v_status, v_protocol_id
  from public.dispensation_requests dr
  join public.patient_visits pv on pv.id = dr.visit_id
  join public.enrollments e     on e.id  = pv.enrollment_id
  where dr.id = p_request_id
  for update of dr;
  if not found then raise exception 'Solicitud inexistente' using errcode = '23503'; end if;
  if v_status <> 'solicitada' then
    raise exception 'Esta solicitud ya fue % (no está pendiente)', v_status using errcode = 'check_violation';
  end if;

  insert into public.dispensations (request_id, executed_by, status)
    values (p_request_id, auth.uid(), 'en_preparacion')
    returning id into v_dispensation_id;

  -- un renglón por medicamento (agrego cantidades por si la solicitud repite el mismo)
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
      (v_dispensation_id, v_item.medication_id, v_lot.id, v_item.quantity, v_lot.lot_number, v_lot.expiry_date);
    -- trg check_dispensation_item_protocol valida lote↔protocolo + medicamento↔solicitud
  end loop;

  -- entregar (dispara el descuento de stock) + cerrar la solicitud
  update public.dispensations set status = 'entregada' where id = v_dispensation_id;
  update public.dispensation_requests set status = 'atendida' where id = p_request_id;

  return v_dispensation_id;
end; $$;

-- 3.12 · scan_dispensation_item (FARMACIA).
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
  -- 0141 · Alcance por estudio en Farmacia. Este RPC es SÓLO de Farmacia: la guarda es el alcance, sin
  -- excepciones. Va primero y no toca nada: a quien no está acotado pharma_sin_recorte() lo deja pasar
  -- antes de mirar una tabla, y el resto de la función corre igual que antes de esta migración.
  if not (
       public.pharma_alcanza_solicitud(p_request_id)) then
    raise exception 'No tenés acceso a este estudio.' using errcode = '42501';
  end if;

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

-- 3.13 · start_dispensation_preparation (FARMACIA).
create or replace function public.start_dispensation_preparation(p_request_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_status request_status; v_prepared_by uuid;
begin
  -- 0141 · Alcance por estudio en Farmacia. Este RPC es SÓLO de Farmacia: la guarda es el alcance, sin
  -- excepciones. Va primero y no toca nada: a quien no está acotado pharma_sin_recorte() lo deja pasar
  -- antes de mirar una tabla, y el resto de la función corre igual que antes de esta migración.
  if not (
       public.pharma_alcanza_solicitud(p_request_id)) then
    raise exception 'No tenés acceso a este estudio.' using errcode = '42501';
  end if;

  if auth.uid() is null then raise exception 'No autenticado' using errcode = '42501'; end if;
  if not public.has_min_role('pharma','operator') then
    raise exception 'Solo Pharma (operador) puede preparar dispensaciones' using errcode = '42501';
  end if;

  select status, prepared_by into v_status, v_prepared_by
  from public.dispensation_requests where id = p_request_id for update;
  if not found then raise exception 'Solicitud inexistente' using errcode = '23503'; end if;

  -- ya la está preparando otra persona: no se la robamos
  if v_status = 'preparando' and v_prepared_by is distinct from auth.uid() then
    raise exception 'Otra persona ya está preparando esta solicitud' using errcode = 'check_violation';
  end if;
  -- volver a entrar a la propia preparación es válido (reabrir el cajón)
  if v_status = 'preparando' then return; end if;

  if v_status <> 'solicitada' then
    raise exception 'Solo se puede preparar una solicitud pendiente (estado actual: %)', v_status
      using errcode = 'check_violation';
  end if;

  update public.dispensation_requests
    set status = 'preparando', prepared_by = auth.uid(), preparation_started_at = now()
    where id = p_request_id;
end; $$;

-- 3.14 · substitute_dispensation_item (FARMACIA).
create or replace function public.substitute_dispensation_item(
  p_item_id       uuid,
  p_medication_id uuid,
  p_reason        text default null
)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_request_id    uuid;
  v_status        request_status;
  v_enrollment_id uuid;
  v_protocol_id   uuid;
  v_med_actual    uuid;
  v_drug_actual   uuid;
  v_dosis_actual  text;
  v_drug_nuevo    uuid;
  v_dosis_nuevo   text;
  v_nombre_nuevo  text;
begin
  -- 0141 · Alcance por estudio en Farmacia. Este RPC es SÓLO de Farmacia: la guarda es el alcance, sin
  -- excepciones. Va primero y no toca nada: a quien no está acotado pharma_sin_recorte() lo deja pasar
  -- antes de mirar una tabla, y el resto de la función corre igual que antes de esta migración.
  if not (
       public.pharma_alcanza_solicitud((select dri.request_id from public.dispensation_request_items dri where dri.id = p_item_id))) then
    raise exception 'No tenés acceso a este estudio.' using errcode = '42501';
  end if;

  if auth.uid() is null then raise exception 'No autenticado' using errcode = '42501'; end if;
  if not public.has_min_role('pharma','operator') then
    raise exception 'Solo Pharma (operador) puede sustituir un renglón' using errcode = '42501';
  end if;

  select dr.id, dr.status, e.id, e.protocol_id, dri.medication_id, m.drug_id, m.dosis
    into v_request_id, v_status, v_enrollment_id, v_protocol_id, v_med_actual, v_drug_actual, v_dosis_actual
  from public.dispensation_request_items dri
  join public.dispensation_requests dr on dr.id = dri.request_id
  join public.patient_visits pv        on pv.id = dr.visit_id
  join public.enrollments e            on e.id  = pv.enrollment_id
  join public.medications m            on m.id  = dri.medication_id
  where dri.id = p_item_id
  for update of dr, dri;
  if not found then raise exception 'Renglón inexistente' using errcode = '23503'; end if;

  -- Solo mientras se prepara. Desde 'lista' el comprobante YA salió con su correlativo y el stock
  -- ya se descontó del lote viejo: cambiar el renglón dejaría el papel impreso hablando de una
  -- medicación que no es la que se entrega. El mensaje nombra la salida real.
  if v_status <> 'preparando' then
    raise exception 'Ya se emitió el comprobante de esta dispensación. Para cambiar un renglón, cancelá la preparación primero.'
      using errcode = 'check_violation';
  end if;

  if p_medication_id = v_med_actual then
    raise exception 'Ese es el mismo medicamento del renglón' using errcode = 'check_violation';
  end if;

  select m.drug_id, m.dosis, m.name into v_drug_nuevo, v_dosis_nuevo, v_nombre_nuevo
  from public.medications m where m.id = p_medication_id;
  if not found then raise exception 'Medicamento inexistente' using errcode = '23503'; end if;

  -- Las tres reglas de equivalencia, en el mismo orden en que las cuenta `alternativas_sustitucion`.
  if v_drug_actual is null or v_drug_nuevo is distinct from v_drug_actual then
    raise exception 'Solo se puede sustituir por otra presentación del mismo fármaco'
      using errcode = 'check_violation';
  end if;

  if v_dosis_nuevo is distinct from v_dosis_actual then
    raise exception 'Esa presentación es de otra concentración y requiere autorización del investigador principal'
      using errcode = 'check_violation';
  end if;

  if not exists (
    select 1 from public.protocol_medications pm
    where pm.medication_id = p_medication_id and pm.protocol_id = v_protocol_id
  ) then
    raise exception 'Ese medicamento no está asignado al protocolo del paciente'
      using errcode = 'check_violation';
  end if;

  -- LA HABILITACIÓN. Es el paso que hace que el trigger de la 0050 deje pasar el update de abajo.
  -- Un upsert y no un insert: la alternativa puede existir DESHABILITADA (se le dio de baja en algún
  -- momento), y ahí hay que reactivarla, no chocar contra el unique.
  insert into public.patient_medications (enrollment_id, medication_id, active, notes)
    values (
      v_enrollment_id, p_medication_id, true,
      'Habilitada al sustituir un renglón de dispensación' ||
        coalesce(' · ' || nullif(btrim(p_reason), ''), '')
    )
  -- Solo se reactiva. La nota existente NO se pisa: es el registro de por qué se habilitó la
  -- primera vez, y reescribirla borraría historia para contar la de hoy. El "por qué" de ESTA
  -- sustitución vive en el renglón (`substitution_reason`), que es donde corresponde.
  on conflict (enrollment_id, medication_id) do update
    set active = true;

  -- El conteo vuelve a CERO. Sin esto, las unidades ya escaneadas quedarían contadas contra un
  -- producto que ya no es ese: el dial diría 2/3 sobre medicación que nunca pasó por el lector.
  -- El invariante de la 0075 obliga además a limpiar scanned_at junto con el conteo.
  update public.dispensation_request_items dri
    set medication_id = p_medication_id,
        scanned_units = 0,
        scanned_at    = null,
        scanned_by    = null,
        substituted_from_medication_id = coalesce(dri.substituted_from_medication_id, v_med_actual),
        substitution_reason = nullif(btrim(coalesce(p_reason, '')), ''),
        substituted_at = now(),
        substituted_by = auth.uid()
    where dri.id = p_item_id;
end; $$;

-- 3.15 · unscan_dispensation_item (FARMACIA).
create or replace function public.unscan_dispensation_item(p_item_id uuid, p_unidades integer default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_status request_status; v_units integer;
begin
  -- 0141 · Alcance por estudio en Farmacia. Este RPC es SÓLO de Farmacia: la guarda es el alcance, sin
  -- excepciones. Va primero y no toca nada: a quien no está acotado pharma_sin_recorte() lo deja pasar
  -- antes de mirar una tabla, y el resto de la función corre igual que antes de esta migración.
  if not (
       public.pharma_alcanza_solicitud((select dri.request_id from public.dispensation_request_items dri where dri.id = p_item_id))) then
    raise exception 'No tenés acceso a este estudio.' using errcode = '42501';
  end if;

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

-- 3.16 · dispensation_audit_trail (MIXTO).
create or replace function public.dispensation_audit_trail(p_request_id uuid)
returns table (
  cuando   timestamptz,
  quien    text,
  entidad  text,
  accion   text,
  antes    jsonb,
  despues  jsonb
)
language plpgsql security definer set search_path = public as $fn$
declare v_disp_id uuid;
begin
  -- 0141 · Alcance por estudio en Farmacia. Este RPC autoriza también por gerencia o Coordinación: la
  -- guarda deja pasar ESE camino —el mismo del chequeo de abajo— y sólo corta a quien entra únicamente
  -- por Farmacia a un estudio fuera de su alcance (D4). Para quien no está acotado no cambia nada.
  if not (
       public.has_module('gerencia')
       or public.pharma_alcanza_solicitud(p_request_id)) then
    raise exception 'No tenés acceso a este estudio.' using errcode = '42501';
  end if;

  if auth.uid() is null then raise exception 'No autenticado' using errcode = '42501'; end if;
  if not (public.has_min_role('pharma','viewer') or public.has_min_role('gerencia','viewer')) then
    raise exception 'No tenés permiso para ver el historial de esta dispensación' using errcode = '42501';
  end if;

  select d.id into v_disp_id
  from public.dispensations d where d.request_id = p_request_id limit 1;

  return query
  select
    al.occurred_at,
    coalesce(u.full_name, case when al.actor_id is null then 'Sistema' else '—' end),
    al.entity_type,
    al.action,
    al.before_data,
    al.after_data
  from public.audit_log al
  left join public.users u on u.id = al.actor_id
  where (al.entity_type = 'dispensation_requests'      and al.entity_id = p_request_id)
     or (al.entity_type = 'dispensation_request_items'
         and coalesce(al.after_data, al.before_data)->>'request_id' = p_request_id::text)
     or (al.entity_type = 'dispensation_ip_documents'  and al.entity_id in (
           select d.id from public.dispensation_ip_documents d where d.request_id = p_request_id))
     or (v_disp_id is not null and al.entity_type = 'dispensations' and al.entity_id = v_disp_id)
     or (al.entity_type = 'dispensation_habilitaciones'
         and coalesce(al.after_data, al.before_data)->>'request_id' = p_request_id::text)
     or (al.entity_type = 'patient_medications'
         and (al.after_data->>'habilitacion_id' in (
                select h.id::text from public.dispensation_habilitaciones h where h.request_id = p_request_id)
              or al.before_data->>'habilitacion_id' in (
                select h.id::text from public.dispensation_habilitaciones h where h.request_id = p_request_id)))
  order by al.occurred_at desc
  limit 200;
end;
$fn$;

-- 3.17 · visitas_dispensables (MIXTO).  El cuerpo vivo decía `create function`: acá pasa a `create or replace` (única diferencia).
create or replace function public.visitas_dispensables(p_enrollment_id uuid)
returns table (
  visit_id      uuid,
  visit_code    text,
  visit_name    text,
  kind          visit_kind,
  visit_date    date,
  dispenses     boolean,
  dispenses_ip  boolean,
  ya_solicitada boolean
)
language plpgsql security definer set search_path = public as $$
begin
  -- 0141 · Alcance por estudio en Farmacia. Este RPC autoriza también por gerencia o Coordinación: la
  -- guarda deja pasar ESE camino —el mismo del chequeo de abajo— y sólo corta a quien entra únicamente
  -- por Farmacia a un estudio fuera de su alcance (D4). Para quien no está acotado no cambia nada.
  if not (
       public.has_module('gerencia')
       or public.pharma_alcanza_inscripcion(p_enrollment_id)) then
    raise exception 'No tenés acceso a este estudio.' using errcode = '42501';
  end if;

  if auth.uid() is null then
    raise exception 'No autenticado' using errcode = '42501';
  end if;
  -- Mismo candado que el resto del módulo, sin cambios respecto de la 0059: Pharma no tiene RLS
  -- de lectura sobre patient_visits de todos los protocolos (Track se aísla por protocolo,
  -- Pharma es central), así que la autorización vive server-side en esta función.
  if not (public.has_min_role('pharma', 'operator') or public.has_module('gerencia')) then
    raise exception 'Sin permiso para ver las visitas de este paciente' using errcode = '42501';
  end if;

  return query
    select pv.id,
           vd.code,
           vd.name,
           pv.kind,
           coalesce(pv.real_date, pv.estimated_date),
           coalesce(vd.dispenses, false),
           coalesce(vd.dispenses_ip, false),
           exists (
             select 1 from public.dispensation_requests dr
             where dr.visit_id = pv.id
               and dr.status in ('solicitada', 'preparando')
           )
    from public.patient_visits pv
    -- LEFT, no INNER: una visita suelta no tiene definición y eso no es un error, es su forma.
    left join public.visit_definitions vd on vd.id = pv.visit_def_id
    where pv.enrollment_id = p_enrollment_id
    -- Más reciente primero: en el mostrador, la visita que acaba de pasar es la candidata.
    order by coalesce(pv.real_date, pv.estimated_date) desc nulls last;
end; $$;

-- 3.18 · add_dispensation_items (MIXTO).
create or replace function public.add_dispensation_items(p_request_id uuid, p_items jsonb)
returns void language plpgsql security definer set search_path = public as $fn$
declare
  v_status       request_status;
  v_visit_id     uuid;
  v_dispenses    boolean;
  v_item         jsonb;
  v_puede_track  boolean;
  v_puede_pharma boolean;
begin
  -- 0141 · Alcance por estudio en Farmacia. Este RPC autoriza también por gerencia o Coordinación: la
  -- guarda deja pasar ESE camino —el mismo del chequeo de abajo— y sólo corta a quien entra únicamente
  -- por Farmacia a un estudio fuera de su alcance (D4). Para quien no está acotado no cambia nada.
  if not (
       public.has_module('gerencia')
       or public.has_min_role('track','admin')
       or (public.has_min_role('track','operator') and public.coordina_visita((select dr.visit_id from public.dispensation_requests dr where dr.id = p_request_id)))
       or public.pharma_alcanza_solicitud(p_request_id)) then
    raise exception 'No tenés acceso a este estudio.' using errcode = '42501';
  end if;

  if auth.uid() is null then raise exception 'No autenticado' using errcode = '42501'; end if;

  select dr.status, dr.visit_id, coalesce(vd.dispenses, false)
    into v_status, v_visit_id, v_dispenses
    from public.dispensation_requests dr
    join public.patient_visits pv on pv.id = dr.visit_id
    left join public.visit_definitions vd on vd.id = pv.visit_def_id
   where dr.id = p_request_id
   for update of dr;
  if not found then
    raise exception 'No se encontró la solicitud' using errcode = '23503';
  end if;

  v_puede_track := public.has_module('gerencia')
                   or public.has_min_role('track','admin')
                   or (public.has_min_role('track','operator') and public.coordina_visita(v_visit_id));
  v_puede_pharma := public.has_min_role('pharma','operator');

  if not (v_puede_track or v_puede_pharma) then
    raise exception 'No tenés permiso para agregar medicación a esta solicitud' using errcode = '42501';
  end if;

  if v_status = 'preparando' then
    raise exception 'Farmacia ya está preparando este pedido: no se le puede agregar medicación. Pedile que cancele la preparación para sumarla.'
      using errcode = 'check_violation';
  end if;
  if v_status <> 'solicitada' then
    raise exception 'Este pedido ya está cerrado (%): no se le puede agregar medicación.', v_status
      using errcode = 'check_violation';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'La solicitud tiene ítems con un formato inválido' using errcode = 'check_violation';
  end if;
  if jsonb_array_length(p_items) = 0 then
    raise exception 'No hay medicación para agregar' using errcode = 'check_violation';
  end if;

  if not v_dispenses then
    update public.dispensation_requests set base_sin_cronograma = true
     where id = p_request_id and not base_sin_cronograma;
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    perform public.alta_renglon_pedido(p_request_id, v_item);
  end loop;
end;
$fn$;

-- 3.19 · update_dispensation_item_quantity (MIXTO).
create or replace function public.update_dispensation_item_quantity(p_item_id uuid, p_quantity integer)
returns void language plpgsql security definer set search_path = public as $fn$
declare
  v_request_id uuid;
  v_status     request_status;
  v_visit_id   uuid;
  v_quien      text;
  v_indicado   integer;
  v_saldo_de   uuid;
  v_restante   integer;
begin
  -- 0141 · Alcance por estudio en Farmacia. Este RPC autoriza también por gerencia o Coordinación: la
  -- guarda deja pasar ESE camino —el mismo del chequeo de abajo— y sólo corta a quien entra únicamente
  -- por Farmacia a un estudio fuera de su alcance (D4). Para quien no está acotado no cambia nada.
  if not (
       public.has_module('gerencia')
       or public.has_min_role('track','admin')
       or (public.has_min_role('track','operator') and public.coordina_visita((select dr.visit_id from public.dispensation_requests dr where dr.id = (select dri.request_id from public.dispensation_request_items dri where dri.id = p_item_id))))
       or public.pharma_alcanza_solicitud((select dri.request_id from public.dispensation_request_items dri where dri.id = p_item_id))) then
    raise exception 'No tenés acceso a este estudio.' using errcode = '42501';
  end if;

  if auth.uid() is null then raise exception 'No autenticado' using errcode = '42501'; end if;

  select dr.id, dr.status, dr.visit_id, dr.prepared_by_name, dri.quantity_indicated, dri.saldo_de_item_id
    into v_request_id, v_status, v_visit_id, v_quien, v_indicado, v_saldo_de
    from public.dispensation_request_items dri
    join public.dispensation_requests dr on dr.id = dri.request_id
   where dri.id = p_item_id
   for update of dr;
  if not found then
    raise exception 'Ese medicamento ya no está en el pedido. Actualizá la tarjeta.' using errcode = '23503';
  end if;

  if not (public.has_module('gerencia')
          or public.has_min_role('track','admin')
          or (public.has_min_role('track','operator') and public.coordina_visita(v_visit_id))
          or public.has_min_role('pharma','operator')) then
    raise exception 'No tenés permiso para editar este pedido' using errcode = '42501';
  end if;

  if v_status = 'preparando' then
    raise exception 'Farmacia ya está preparando este pedido%: pedile que lo libere para cambiarlo.',
      coalesce(' (lo tiene ' || v_quien || ')', '') using errcode = 'check_violation';
  end if;
  if v_status <> 'solicitada' then
    raise exception 'Este pedido ya está cerrado: no se puede cambiar.' using errcode = 'check_violation';
  end if;

  if p_quantity is null or p_quantity <= 0 then
    raise exception 'La cantidad debe ser mayor a cero' using errcode = 'check_violation';
  end if;

  -- 0123 · En partes: lo que se entrega ahora no pasa lo indicado.
  if v_indicado is not null and p_quantity > v_indicado then
    raise exception 'Se indicaron % %: no se puede entregar más que eso.',
      v_indicado, case when v_indicado = 1 then 'envase' else 'envases' end using errcode = 'check_violation';
  end if;

  -- 0123 · Un saldo no pasa lo que queda, sin contarse a sí mismo (R2). Lock del original, como al pedirlo.
  if v_saldo_de is not null then
    perform 1 from public.dispensation_request_items o where o.id = v_saldo_de for update of o;
    v_restante := public.saldo_restante_de_indicacion(v_saldo_de, p_item_id);
    if p_quantity > v_restante then
      raise exception 'El saldo es de % %: no se puede pedir más.',
        greatest(v_restante, 0), case when v_restante = 1 then 'envase' else 'envases' end
        using errcode = 'check_violation';
    end if;
  end if;

  update public.dispensation_request_items dri set quantity = p_quantity where dri.id = p_item_id;
end;
$fn$;

-- 3.20 · remove_dispensation_item (MIXTO).
create or replace function public.remove_dispensation_item(p_item_id uuid)
returns void language plpgsql security definer set search_path = public as $fn$
declare
  v_request_id  uuid;
  v_status      request_status;
  v_visit_id    uuid;
  v_includes_ip boolean;
  v_quien       text;
  v_restantes   integer;
begin
  -- 0141 · Alcance por estudio en Farmacia. Este RPC autoriza también por gerencia o Coordinación: la
  -- guarda deja pasar ESE camino —el mismo del chequeo de abajo— y sólo corta a quien entra únicamente
  -- por Farmacia a un estudio fuera de su alcance (D4). Para quien no está acotado no cambia nada.
  if not (
       public.has_module('gerencia')
       or public.has_min_role('track','admin')
       or (public.has_min_role('track','operator') and public.coordina_visita((select dr.visit_id from public.dispensation_requests dr where dr.id = (select dri.request_id from public.dispensation_request_items dri where dri.id = p_item_id))))
       or public.pharma_alcanza_solicitud((select dri.request_id from public.dispensation_request_items dri where dri.id = p_item_id))) then
    raise exception 'No tenés acceso a este estudio.' using errcode = '42501';
  end if;

  if auth.uid() is null then raise exception 'No autenticado' using errcode = '42501'; end if;

  select dr.id, dr.status, dr.visit_id, dr.includes_ip, dr.prepared_by_name
    into v_request_id, v_status, v_visit_id, v_includes_ip, v_quien
    from public.dispensation_request_items dri
    join public.dispensation_requests dr on dr.id = dri.request_id
   where dri.id = p_item_id
   for update of dr;
  if not found then
    raise exception 'Ese medicamento ya no está en el pedido. Actualizá la tarjeta.' using errcode = '23503';
  end if;

  if not (public.has_module('gerencia')
          or public.has_min_role('track','admin')
          or (public.has_min_role('track','operator') and public.coordina_visita(v_visit_id))
          or public.has_min_role('pharma','operator')) then
    raise exception 'No tenés permiso para editar este pedido' using errcode = '42501';
  end if;

  if v_status = 'preparando' then
    raise exception 'Farmacia ya está preparando este pedido%: pedile que lo libere para cambiarlo.',
      coalesce(' (lo tiene ' || v_quien || ')', '') using errcode = 'check_violation';
  end if;
  if v_status <> 'solicitada' then
    raise exception 'Este pedido ya está cerrado: no se puede cambiar.' using errcode = 'check_violation';
  end if;

  select count(*) - 1 into v_restantes
    from public.dispensation_request_items dri where dri.request_id = v_request_id;
  if v_restantes = 0 and not v_includes_ip
     and not exists (select 1 from public.dispensation_habilitaciones h
                      where h.request_id = v_request_id and h.estado = 'pendiente') then
    raise exception 'Es el único medicamento del pedido: cancelá el pedido en lugar de quitarlo.'
      using errcode = 'check_violation';
  end if;

  delete from public.dispensation_request_items dri where dri.id = p_item_id;
end;
$fn$;

-- 3.21 · quitar_habilitacion (MIXTO).
create or replace function public.quitar_habilitacion(p_habilitacion_id uuid)
returns void language plpgsql security definer set search_path = public as $fn$
declare
  v_request_id  uuid;
  v_status      request_status;
  v_visit_id    uuid;
  v_includes_ip boolean;
  v_quien       text;
  v_estado      text;
begin
  -- 0141 · Alcance por estudio en Farmacia. Este RPC autoriza también por gerencia o Coordinación: la
  -- guarda deja pasar ESE camino —el mismo del chequeo de abajo— y sólo corta a quien entra únicamente
  -- por Farmacia a un estudio fuera de su alcance (D4). Para quien no está acotado no cambia nada.
  if not (
       public.has_module('gerencia')
       or public.has_min_role('track','admin')
       or (public.has_min_role('track','operator') and public.coordina_visita((select dr.visit_id from public.dispensation_requests dr where dr.id = (select h.request_id from public.dispensation_habilitaciones h where h.id = p_habilitacion_id))))
       or public.pharma_alcanza_solicitud((select h.request_id from public.dispensation_habilitaciones h where h.id = p_habilitacion_id))) then
    raise exception 'No tenés acceso a este estudio.' using errcode = '42501';
  end if;

  if auth.uid() is null then raise exception 'No autenticado' using errcode = '42501'; end if;

  select dr.id, dr.status, dr.visit_id, dr.includes_ip, dr.prepared_by_name, h.estado
    into v_request_id, v_status, v_visit_id, v_includes_ip, v_quien, v_estado
    from public.dispensation_habilitaciones h
    join public.dispensation_requests dr on dr.id = h.request_id
   where h.id = p_habilitacion_id
   for update of dr, h;
  if not found then
    raise exception 'Ese pedido de habilitación ya no está. Actualizá la tarjeta.' using errcode = '23503';
  end if;

  if not (public.has_module('gerencia')
          or public.has_min_role('track','admin')
          or (public.has_min_role('track','operator') and public.coordina_visita(v_visit_id))
          or public.has_min_role('pharma','operator')) then
    raise exception 'No tenés permiso para editar este pedido' using errcode = '42501';
  end if;

  if v_status = 'preparando' then
    raise exception 'Farmacia ya está preparando este pedido%: pedile que lo libere para cambiarlo.',
      coalesce(' (lo tiene ' || v_quien || ')', '') using errcode = 'check_violation';
  end if;
  if v_status <> 'solicitada' or v_estado <> 'pendiente' then
    raise exception 'Este pedido ya está cerrado: no se puede cambiar.' using errcode = 'check_violation';
  end if;

  if not v_includes_ip
     and not exists (select 1 from public.dispensation_request_items dri where dri.request_id = v_request_id)
     and not exists (select 1 from public.dispensation_habilitaciones h
                      where h.request_id = v_request_id and h.estado = 'pendiente' and h.id <> p_habilitacion_id) then
    raise exception 'Es lo único del pedido: cancelá el pedido en lugar de quitarlo.' using errcode = 'check_violation';
  end if;

  delete from public.dispensation_habilitaciones h where h.id = p_habilitacion_id;
end;
$fn$;

-- 3.22 · stock_de_la_visita (MIXTO).
create or replace function public.stock_de_la_visita(p_visit_id uuid)
returns table (
  medication_id      uuid,
  en_estante         integer,
  maximo_armable     integer,
  pedido_esta_visita integer,
  pedido_otras       integer
)
language plpgsql stable security definer set search_path = public as $fn$
declare
  v_protocol   uuid;
  v_enrollment uuid;
begin
  -- 0141 · Alcance por estudio en Farmacia. Este RPC autoriza también por gerencia o Coordinación: la
  -- guarda deja pasar ESE camino —el mismo del chequeo de abajo— y sólo corta a quien entra únicamente
  -- por Farmacia a un estudio fuera de su alcance (D4). Para quien no está acotado no cambia nada.
  if not (
       public.has_module('gerencia')
       or public.has_min_role('track','admin')
       or (public.has_min_role('track','operator') and public.coordina_visita(p_visit_id))
       or public.pharma_alcanza_visita(p_visit_id)) then
    raise exception 'No tenés acceso a este estudio.' using errcode = '42501';
  end if;

  if auth.uid() is null then raise exception 'No autenticado' using errcode = '42501'; end if;

  select e.protocol_id, e.id into v_protocol, v_enrollment
    from public.patient_visits pv
    join public.enrollments e on e.id = pv.enrollment_id
   where pv.id = p_visit_id;
  if not found then
    raise exception 'Visita inexistente' using errcode = '23503';
  end if;

  if not (public.has_module('gerencia')
          or public.has_min_role('track','admin')
          or (public.has_min_role('track','operator') and public.coordina_visita(p_visit_id))
          or public.has_min_role('pharma','viewer')) then
    raise exception 'No tenés permiso para ver el stock de esta visita' using errcode = '42501';
  end if;

  -- Todo calificado: en plpgsql los nombres del `returns table` compiten con las columnas sueltas
  -- (0056/0058, el mismo error dos veces).
  return query
  with meds as (
    select pm.medication_id as mid
      from public.patient_medications pm
     where pm.enrollment_id = v_enrollment and pm.active
  ),
  lotes as (
    select ml.medication_id as mid,
           sum(ml.quantity_on_hand) as total,
           max(ml.quantity_on_hand) as maximo
      from public.medication_lots ml
     where ml.protocol_id = v_protocol
       and ml.quantity_on_hand > 0
       and (ml.expiry_date is null or ml.expiry_date >= current_date)
     group by ml.medication_id
  ),
  pedidos as (
    select dri.medication_id as mid,
           sum(dri.quantity) filter (where dr.visit_id = p_visit_id)  as esta,
           sum(dri.quantity) filter (where dr.visit_id <> p_visit_id) as otras
      from public.dispensation_request_items dri
      join public.dispensation_requests dr on dr.id = dri.request_id
     where dr.protocol_id = v_protocol
       and dr.status in ('solicitada', 'preparando')
       and not exists (select 1 from public.dispensations d
                        where d.request_id = dr.id and d.status in ('lista', 'entregada'))
     group by dri.medication_id
  )
  select m.mid,
         coalesce(l.total, 0)::integer,
         coalesce(l.maximo, 0)::integer,
         coalesce(p.esta, 0)::integer,
         coalesce(p.otras, 0)::integer
    from meds m
    left join lotes l   on l.mid = m.mid
    left join pedidos p on p.mid = m.mid;
end;
$fn$;

-- 3.23 · contexto_dispensacion (MIXTO).  El cuerpo vivo decía `create function`: acá pasa a `create or replace` (única diferencia).
create or replace function public.contexto_dispensacion(p_visit_id uuid)
returns table (
  tipo            text,
  item_id         uuid,
  medication_id   uuid,
  medication_name text,
  dosis           text,
  unit            text,
  drug_id         uuid,
  drug_name       text,
  instante        timestamptz,
  protocol_code   text,
  visit_code      text,
  es_esta_visita  boolean,
  indicado        integer,
  entregado       integer,
  en_camino       integer,
  habilitado      boolean,
  ip_kits         integer,
  habilitacion_id uuid
)
language plpgsql stable security definer set search_path = public as $fn$
declare
  v_enrollment uuid;
  v_patient    uuid;
  v_desde      timestamptz := now() - interval '31 days';
begin
  -- 0141 · Alcance por estudio en Farmacia. Este RPC autoriza también por gerencia o Coordinación: la
  -- guarda deja pasar ESE camino —el mismo del chequeo de abajo— y sólo corta a quien entra únicamente
  -- por Farmacia a un estudio fuera de su alcance (D4). Para quien no está acotado no cambia nada.
  if not (
       public.has_module('gerencia')
       or public.has_min_role('track','admin')
       or (public.has_min_role('track','operator') and public.coordina_visita(p_visit_id))
       or public.pharma_alcanza_visita(p_visit_id)) then
    raise exception 'No tenés acceso a este estudio.' using errcode = '42501';
  end if;

  if auth.uid() is null then raise exception 'No autenticado' using errcode = '42501'; end if;

  select e.id, e.patient_id into v_enrollment, v_patient
    from public.patient_visits pv
    join public.enrollments e on e.id = pv.enrollment_id
   where pv.id = p_visit_id;
  if not found then
    raise exception 'Visita inexistente' using errcode = '23503';
  end if;

  if not (public.has_module('gerencia')
          or public.has_min_role('track','admin')
          or (public.has_min_role('track','operator') and public.coordina_visita(p_visit_id))
          or public.has_min_role('pharma','viewer')) then
    raise exception 'No tenés permiso para ver las entregas de esta visita' using errcode = '42501';
  end if;

  return query
  select distinct on (d.id, di.medication_id)
         'entrega'::text, null::uuid, di.medication_id, m.name, m.dosis, m.unit, m.drug_id, dg.name,
         d.delivered_at, pr.code, dr.visit_code, (dr.visit_id = p_visit_id),
         null::integer, null::integer, null::integer, null::boolean, null::integer, null::uuid
    from public.dispensations d
    join public.dispensation_items di   on di.dispensation_id = d.id
    join public.dispensation_requests dr on dr.id = d.request_id
    join public.patient_visits pv        on pv.id = dr.visit_id
    join public.enrollments e            on e.id = pv.enrollment_id
    join public.medications m            on m.id = di.medication_id
    left join public.drugs dg            on dg.id = m.drug_id
    left join public.protocols pr        on pr.id = e.protocol_id
   where e.patient_id = v_patient
     and d.status = 'entregada'
     and d.delivered_at >= v_desde

  union all

  select 'abierto'::text, dri.id, dri.medication_id, m.name, m.dosis, m.unit, m.drug_id, dg.name,
         dr.created_at, pr.code, dr.visit_code, false,
         null::integer, null::integer, null::integer, null::boolean, null::integer, null::uuid
    from public.dispensation_request_items dri
    join public.dispensation_requests dr on dr.id = dri.request_id
    join public.patient_visits pv        on pv.id = dr.visit_id
    join public.enrollments e            on e.id = pv.enrollment_id
    join public.medications m            on m.id = dri.medication_id
    left join public.drugs dg            on dg.id = m.drug_id
    left join public.protocols pr        on pr.id = e.protocol_id
   where e.patient_id = v_patient
     and dr.visit_id <> p_visit_id
     and dr.status in ('solicitada', 'preparando')

  union all

  select 'indicacion'::text, o.id, o.medication_id, m.name, m.dosis, m.unit, m.drug_id, dg.name,
         ent.ultima, pr.code, odr.visit_code, (odr.visit_id = p_visit_id),
         o.quantity_indicated, ent.total::integer, (coalesce(cam.total, 0) + coalesce(hcam.total, 0))::integer,
         exists (select 1 from public.patient_medications pm
                  where pm.enrollment_id = v_enrollment and pm.medication_id = o.medication_id and pm.active),
         null::integer,
         (select h.id from public.dispensation_habilitaciones h
           where h.item_id = o.id and h.estado = 'habilitada' and h.origen_habilitacion_id is null
           limit 1)
    from public.dispensation_request_items o
    join public.dispensation_requests odr on odr.id = o.request_id
    join public.patient_visits opv        on opv.id = odr.visit_id
    join public.enrollments e             on e.id = opv.enrollment_id
    join public.medications m             on m.id = o.medication_id
    left join public.drugs dg             on dg.id = m.drug_id
    left join public.protocols pr         on pr.id = e.protocol_id
    cross join lateral (
      select sum(x.quantity) as total, max(xd.delivered_at) as ultima
        from public.dispensation_request_items x
        join public.dispensations xd on xd.request_id = x.request_id and xd.status = 'entregada'
       where x.id = o.id or x.saldo_de_item_id = o.id
    ) ent
    left join lateral (
      select sum(y.quantity) as total
        from public.dispensation_request_items y
        join public.dispensation_requests ydr on ydr.id = y.request_id
       where y.saldo_de_item_id = o.id
         and ydr.status in ('solicitada', 'preparando')
    ) cam on true
    -- 0124: un saldo de un «Otro» pedido y todavía sin habilitar ya está en camino.
    left join lateral (
      select sum(hh.quantity) as total
        from public.dispensation_habilitaciones hh
        join public.dispensation_requests hdr on hdr.id = hh.request_id
       where hh.saldo_de_item_id = o.id
         and hh.estado = 'pendiente'
         and hdr.status in ('solicitada', 'preparando')
    ) hcam on true
   where opv.enrollment_id = v_enrollment
     and o.saldo_de_item_id is null
     and o.quantity_indicated is not null
     and exists (select 1 from public.dispensations od
                  where od.request_id = o.request_id and od.status = 'entregada')
     and o.quantity_indicated > coalesce(ent.total, 0)

  union all

  (select 'ip'::text, null::uuid, null::uuid, null::text, null::text, null::text, null::uuid, null::text,
          d.delivered_at, null::text, dr.visit_code, (dr.visit_id = p_visit_id),
          null::integer, null::integer, null::integer, null::boolean, d.ip_kits, null::uuid
     from public.dispensations d
     join public.dispensation_requests dr on dr.id = d.request_id
     join public.patient_visits pv        on pv.id = dr.visit_id
    where pv.enrollment_id = v_enrollment
      and dr.includes_ip
      and d.status = 'entregada'
      and d.ip_kits is not null
      and d.delivered_at >= v_desde
    order by d.delivered_at desc
    limit 1);
end;
$fn$;

-- 3.24 · create_dispensation_request (MIXTO).
create or replace function public.create_dispensation_request(
  p_visit_id uuid,
  p_items    jsonb,
  p_notes    text default null,
  p_origen   text default 'track',
  p_off_schedule_reason text default null)
returns uuid language plpgsql security definer set search_path = public as $fn$
declare
  v_request_id uuid;
  v_item       jsonb;
begin
  -- 0141 · Alcance por estudio en Farmacia. Este RPC autoriza también por gerencia o Coordinación: la
  -- guarda deja pasar ESE camino —el mismo del chequeo de abajo— y sólo corta a quien entra únicamente
  -- por Farmacia a un estudio fuera de su alcance (D4). Para quien no está acotado no cambia nada.
  if not (
       public.has_module('gerencia')
       or public.has_min_role('track','admin')
       or (public.has_min_role('track','operator') and public.coordina_visita(p_visit_id))
       or public.pharma_alcanza_visita(p_visit_id)) then
    raise exception 'No tenés acceso a este estudio.' using errcode = '42501';
  end if;

  if auth.uid() is null then raise exception 'No autenticado' using errcode = '42501'; end if;

  if p_items is not null and jsonb_typeof(p_items) <> 'array' then
    raise exception 'La solicitud tiene ítems con un formato inválido' using errcode = 'check_violation';
  end if;

  v_request_id := public.alta_pedido_interna(
    p_visit_id, p_notes, p_origen, p_off_schedule_reason,
    jsonb_array_length(coalesce(p_items, '[]'::jsonb)), false);

  for v_item in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    perform public.alta_renglon_pedido(v_request_id, v_item);
  end loop;

  return v_request_id;
end;
$fn$;

-- 3.25 · candidatos_otro (MIXTO).
create or replace function public.candidatos_otro(p_visit_id uuid)
returns table (
  medication_id  uuid,
  nombre         text,
  dosis          text,
  unit           text,
  en_estante     integer,
  maximo_armable integer
)
language plpgsql stable security definer set search_path = public as $fn$
declare
  v_protocol   uuid;
  v_enrollment uuid;
begin
  -- 0141 · Alcance por estudio en Farmacia. Este RPC autoriza también por gerencia o Coordinación: la
  -- guarda deja pasar ESE camino —el mismo del chequeo de abajo— y sólo corta a quien entra únicamente
  -- por Farmacia a un estudio fuera de su alcance (D4). Para quien no está acotado no cambia nada.
  if not (
       (public.has_min_role('track','operator') and public.coordina_visita(p_visit_id))
       or public.pharma_alcanza_visita(p_visit_id)) then
    raise exception 'No tenés acceso a este estudio.' using errcode = '42501';
  end if;

  if auth.uid() is null then raise exception 'No autenticado' using errcode = '42501'; end if;

  select e.protocol_id, e.id into v_protocol, v_enrollment
    from public.patient_visits pv
    join public.enrollments e on e.id = pv.enrollment_id
   where pv.id = p_visit_id;
  if not found then
    raise exception 'Visita inexistente' using errcode = '23503';
  end if;

  if not (public.has_min_role('pharma','operator')
          or (public.has_min_role('track','operator') and public.coordina_visita(p_visit_id))) then
    raise exception 'No tenés permiso para pedir otro medicamento en esta visita' using errcode = '42501';
  end if;

  -- Todo calificado: en plpgsql los nombres del `returns table` compiten con las columnas (0056/0058).
  return query
  with lotes as (
    select ml.medication_id as mid,
           sum(ml.quantity_on_hand) as total,
           max(ml.quantity_on_hand) as maximo
      from public.medication_lots ml
     where ml.protocol_id = v_protocol
       and ml.quantity_on_hand > 0
       and (ml.expiry_date is null or ml.expiry_date >= current_date)
     group by ml.medication_id
  )
  select m.id, m.name, m.dosis, m.unit, l.total::integer, l.maximo::integer
    from public.protocol_medications pm
    join public.medications m on m.id = pm.medication_id
    join lotes l              on l.mid = m.id
   where pm.protocol_id = v_protocol
     and not exists (select 1 from public.patient_medications pmed
                      where pmed.enrollment_id = v_enrollment
                        and pmed.medication_id = m.id
                        and pmed.active)
     and not exists (select 1 from public.dispensation_habilitaciones h
                       join public.dispensation_requests hdr on hdr.id = h.request_id
                       join public.patient_visits hpv        on hpv.id = hdr.visit_id
                      where hpv.enrollment_id = v_enrollment
                        and h.medication_id = m.id
                        and h.estado = 'pendiente'
                        and hdr.status in ('solicitada', 'preparando'))
   order by m.name;
end;
$fn$;

-- 3.26 · solicitar_habilitacion (MIXTO).
create or replace function public.solicitar_habilitacion(
  p_visit_id               uuid,
  p_request_id             uuid,
  p_medication_id          uuid,
  p_quantity               integer,
  p_quantity_indicated     integer,
  p_receta_path            text,
  p_receta_file_name       text,
  p_receta_mime            text,
  p_receta_size            integer,
  p_origen_habilitacion_id uuid default null,
  p_saldo_de_item_id       uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_protocol   uuid;
  v_enrollment uuid;
  v_origen     text;
  v_request    uuid;
  v_status     request_status;
  v_hab_id     uuid;
  v_orig       record;
  v_restante   integer;
  v_path       text;
  v_file       text;
  v_mime       text;
  v_size       integer;
  v_nombre     text;
begin
  -- 0141 · Alcance por estudio en Farmacia. Este RPC autoriza también por gerencia o Coordinación: la
  -- guarda deja pasar ESE camino —el mismo del chequeo de abajo— y sólo corta a quien entra únicamente
  -- por Farmacia a un estudio fuera de su alcance (D4). Para quien no está acotado no cambia nada.
  if not (
       (public.has_min_role('track','operator') and public.coordina_visita(p_visit_id))
       or public.pharma_alcanza_visita(p_visit_id)) then
    raise exception 'No tenés acceso a este estudio.' using errcode = '42501';
  end if;

  if auth.uid() is null then raise exception 'No autenticado' using errcode = '42501'; end if;

  select e.protocol_id, e.id into v_protocol, v_enrollment
    from public.patient_visits pv
    join public.enrollments e on e.id = pv.enrollment_id
   where pv.id = p_visit_id;
  if not found then
    raise exception 'Visita inexistente' using errcode = '23503';
  end if;

  -- Sólo quien puede subir la receta (R5). El origen del pedido se deduce: la coordinadora de la
  -- visita pide como Coordinación; si no, es Farmacia.
  if public.has_min_role('track','operator') and public.coordina_visita(p_visit_id) then
    v_origen := 'track';
  elsif public.has_min_role('pharma','operator') then
    v_origen := 'pharma';
  else
    raise exception 'No tenés permiso para pedir otro medicamento en esta visita' using errcode = '42501';
  end if;

  if p_quantity is null or p_quantity <= 0 then
    raise exception 'La cantidad debe ser mayor a cero' using errcode = 'check_violation';
  end if;
  if p_quantity_indicated is not null and p_quantity_indicated <= p_quantity then
    raise exception 'En partes, lo indicado tiene que ser más que lo que se entrega ahora.'
      using errcode = 'check_violation';
  end if;

  select m.name into v_nombre from public.medications m where m.id = p_medication_id;
  if not found then
    raise exception 'Medicamento inexistente' using errcode = '23503';
  end if;

  -- Un candidato de verdad (R12): del protocolo, no habilitado, sin otra habilitación pendiente.
  if not exists (select 1 from public.protocol_medications pm
                  where pm.protocol_id = v_protocol and pm.medication_id = p_medication_id) then
    raise exception '% no está en el catálogo de este protocolo.', v_nombre using errcode = 'check_violation';
  end if;
  if exists (select 1 from public.patient_medications pmed
              where pmed.enrollment_id = v_enrollment and pmed.medication_id = p_medication_id and pmed.active) then
    raise exception '% ya está habilitado para este paciente: pedilo desde la lista.', v_nombre
      using errcode = 'check_violation';
  end if;
  if exists (select 1 from public.dispensation_habilitaciones h
               join public.dispensation_requests hdr on hdr.id = h.request_id
               join public.patient_visits hpv        on hpv.id = hdr.visit_id
              where hpv.enrollment_id = v_enrollment
                and h.medication_id = p_medication_id
                and h.estado = 'pendiente'
                and hdr.status in ('solicitada', 'preparando')) then
    raise exception 'Ya hay un pedido de habilitación de % esperando a Farmacia.', v_nombre
      using errcode = 'check_violation';
  end if;

  if p_origen_habilitacion_id is null then
    -- Receta propia.
    if p_saldo_de_item_id is not null then
      raise exception 'Un saldo reusa la receta de la habilitación original.' using errcode = 'check_violation';
    end if;
    if nullif(btrim(coalesce(p_receta_file_name, '')), '') is null
       or p_receta_mime is null or p_receta_mime not in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp')
       or p_receta_size is null or p_receta_size <= 0 or p_receta_size > 10485760 then
      raise exception 'Falta la receta, o el archivo no es PDF, JPG, PNG o WEBP de hasta 10 MB.'
        using errcode = 'check_violation';
    end if;
    -- La forma EXACTA de la ruta y el protocolo de ESTA visita: la policy de Storage autoriza por el
    -- prefijo, y la receta tiene que quedar en la carpeta del estudio del paciente (mismo criterio que
    -- attach_ip_document, 0071).
    if p_receta_path is null
       or p_receta_path !~ ('^' || v_protocol::text
            || '/habilitaciones/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.][a-z0-9]{2,5}\Z') then
      raise exception 'La receta no corresponde al protocolo de esta visita.' using errcode = 'check_violation';
    end if;
    if not exists (select 1 from storage.objects so
                    where so.bucket_id = 'ip-docs' and so.name = p_receta_path) then
      raise exception 'No se encontró la receta subida. Probá de nuevo.' using errcode = 'check_violation';
    end if;
    if exists (select 1 from public.dispensation_habilitaciones h
                where h.receta_path = p_receta_path and h.origen_habilitacion_id is null) then
      raise exception 'Esa receta ya se usó en otro pedido.' using errcode = 'check_violation';
    end if;
    v_path := p_receta_path; v_file := btrim(p_receta_file_name); v_mime := p_receta_mime; v_size := p_receta_size;

  else
    -- Saldo de un «Otro» (R6): la habilitación original, ya aprobada, del mismo paciente y medicamento.
    if p_saldo_de_item_id is null or p_quantity_indicated is not null then
      raise exception 'El saldo se pide sobre el renglón original, sin indicación propia.' using errcode = 'check_violation';
    end if;

    select h.id, h.medication_id, h.estado, h.item_id, h.origen_habilitacion_id,
           h.receta_path, h.receta_file_name, h.receta_mime, h.receta_size,
           hpv.enrollment_id as enrollment_id
      into v_orig
      from public.dispensation_habilitaciones h
      join public.dispensation_requests hdr on hdr.id = h.request_id
      join public.patient_visits hpv        on hpv.id = hdr.visit_id
     where h.id = p_origen_habilitacion_id;
    if not found then
      raise exception 'No se encontró la habilitación original.' using errcode = '23503';
    end if;
    if v_orig.estado <> 'habilitada' or v_orig.origen_habilitacion_id is not null
       or v_orig.enrollment_id is distinct from v_enrollment
       or v_orig.medication_id is distinct from p_medication_id
       or v_orig.item_id is distinct from p_saldo_de_item_id then
      raise exception 'Ese saldo no corresponde a una habilitación aprobada de este paciente.'
        using errcode = 'check_violation';
    end if;

    -- Lock del renglón original: dos saldos de la misma indicación se ordenan acá (0123).
    perform 1 from public.dispensation_request_items o where o.id = p_saldo_de_item_id for update of o;
    if not exists (select 1 from public.dispensation_request_items o
                     join public.dispensations od on od.request_id = o.request_id and od.status = 'entregada'
                    where o.id = p_saldo_de_item_id and o.quantity_indicated is not null) then
      raise exception 'El saldo se puede pedir recién cuando se entregó la primera parte.' using errcode = 'check_violation';
    end if;
    v_restante := public.saldo_restante_de_indicacion(p_saldo_de_item_id, null);
    if v_restante <= 0 then
      raise exception 'Ese saldo ya está completo o ya está pedido.' using errcode = 'check_violation';
    end if;
    if p_quantity > v_restante then
      raise exception 'El saldo de % es de % %: no se puede pedir más.',
        v_nombre, v_restante, case when v_restante = 1 then 'envase' else 'envases' end
        using errcode = 'check_violation';
    end if;
    v_path := v_orig.receta_path; v_file := v_orig.receta_file_name; v_mime := v_orig.receta_mime; v_size := v_orig.receta_size;
  end if;

  -- El pedido: el indicado, si todavía acepta cambios; si no, uno nuevo con la habilitación adentro.
  if p_request_id is not null then
    select dr.status into v_status
      from public.dispensation_requests dr
     where dr.id = p_request_id and dr.visit_id = p_visit_id
     for update of dr;
    if found and v_status = 'solicitada' then
      v_request := p_request_id;
    end if;
  end if;
  if v_request is null then
    v_request := public.alta_pedido_interna(p_visit_id, null, v_origen, null, 0, true);
  end if;

  if exists (select 1 from public.dispensation_request_items dri
              where dri.request_id = v_request and dri.medication_id = p_medication_id) then
    raise exception '% ya está en el pedido.', v_nombre using errcode = 'check_violation';
  end if;

  insert into public.dispensation_habilitaciones
      (request_id, medication_id, quantity, quantity_indicated, saldo_de_item_id,
       receta_path, receta_file_name, receta_mime, receta_size, origen_habilitacion_id,
       requested_by, requested_by_name)
    values
      (v_request, p_medication_id, p_quantity, p_quantity_indicated, p_saldo_de_item_id,
       v_path, v_file, v_mime, v_size, p_origen_habilitacion_id,
       auth.uid(), (select u.full_name from public.users u where u.id = auth.uid()))
    returning id into v_hab_id;

  return jsonb_build_object('request_id', v_request, 'habilitacion_id', v_hab_id);
end;
$fn$;

-- 3.27 · attach_ip_document (MIXTO).
create or replace function public.attach_ip_document(
  p_request_id uuid,
  p_path       text,
  p_file_name  text,
  p_mime       text,
  p_size       int)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_status      request_status;
  v_includes_ip boolean;
  v_off         boolean;
  v_visit_id    uuid;
  v_protocol_id uuid;
  v_id          uuid;
begin
  -- 0141 · Alcance por estudio en Farmacia. Este RPC autoriza también por gerencia o Coordinación: la
  -- guarda deja pasar ESE camino —el mismo del chequeo de abajo— y sólo corta a quien entra únicamente
  -- por Farmacia a un estudio fuera de su alcance (D4). Para quien no está acotado no cambia nada.
  if not (
       public.coordina_visita((select dr.visit_id from public.dispensation_requests dr where dr.id = p_request_id))
       or public.pharma_alcanza_solicitud(p_request_id)) then
    raise exception 'No tenés acceso a este estudio.' using errcode = '42501';
  end if;

  -- Se joinea la cadena visita → enrolamiento para tener el protocolo aunque `r.protocol_id`
  -- venga en null (una fila insertada por fuera del RPC, vía la policy "track crea solicitudes").
  -- `for update of r` lockea SOLO la solicitud: el join es para leer, no para bloquear la agenda.
  select r.status, r.includes_ip, r.off_schedule, r.visit_id, coalesce(r.protocol_id, e.protocol_id)
    into v_status, v_includes_ip, v_off, v_visit_id, v_protocol_id
  from public.dispensation_requests r
  join public.patient_visits pv on pv.id = r.visit_id
  join public.enrollments e     on e.id  = pv.enrollment_id
  where r.id = p_request_id
  for update of r;

  if not found then
    raise exception 'No se encontró la solicitud' using errcode = 'check_violation';
  end if;
  if not (public.has_min_role('pharma','operator') or public.coordina_visita(v_visit_id)) then
    raise exception 'Sin permiso para adjuntar la constancia' using errcode = '42501';
  end if;
  -- Dos puertas para adjuntar, no una: el pedido ya sabe que lleva IP (lo dedujo del cronograma
  -- al crearse), O es una dispensación fuera de cronograma, donde el cronograma no dice nada y la
  -- constancia es JUSTAMENTE lo que declara que hay IP (decisión del Director, 2026-08-09: la
  -- excepción no implica IP). Lo que no se puede es adjuntar a un pedido de una visita que no
  -- dispensa IP y que tampoco es una excepción: ahí la constancia no tendría a qué referirse.
  if not v_includes_ip and not v_off then
    raise exception 'Esta solicitud no lleva producto en investigación' using errcode = 'check_violation';
  end if;
  if v_status not in ('solicitada','preparando') then
    raise exception 'La solicitud ya está cerrada: no se puede cambiar la constancia' using errcode = 'check_violation';
  end if;
  -- El estado del PEDIDO no alcanza para saber si el comprobante ya salió: `mark_dispensation_ready`
  -- deja la dispensación en 'lista' pero NO mueve el status de la solicitud, que sigue en
  -- 'preparando' hasta que la entrega la pasa a 'atendida'. O sea: hay una ventana en la que el
  -- pedido está abierto y el comprobante ya está emitido y el correlativo sellado. Sumarle IP ahí
  -- saltearía en silencio la regla "no se emite comprobante sin constancia" (§8.1) y dejaría en la
  -- auditoría un comprobante ANTERIOR a la nota fuente que lo justifica, que es exactamente lo que
  -- un sistema ANMAT / ICH-GCP no puede permitirse. Y hay un agravante mecánico: como no hay unique
  -- sobre `dispensations.request_id`, el reflejo obvio después de adjuntar ("marco lista de nuevo")
  -- no reusa la dispensación —el select de §8.1 busca una en 'en_preparacion' y la vigente está en
  -- 'lista'— sino que INSERTA UNA SEGUNDA, con correlativo nuevo y descuento de stock repetido.
  -- Se frena SOLO la rama que prende `includes_ip`: adjuntar o reemplazar la constancia de un
  -- pedido que YA era de IP tiene que seguir funcionando mientras el pedido esté abierto (la de
  -- §8.1 ya se exigió antes de emitir, así que ahí no se saltea nada).
  if not v_includes_ip and exists (
       select 1 from public.dispensations d
       where d.request_id = p_request_id and d.status in ('lista','entregada')
     ) then
    raise exception 'El comprobante de esta dispensación ya se emitió: no se le puede sumar producto en investigación. Si hay que incluirlo, Farmacia tiene que cancelar la preparación primero.'
      using errcode = 'check_violation';
  end if;
  -- El path tiene que caer en la carpeta del protocolo de ESTA visita. Sin este check, la policy
  -- de storage (que autoriza por el prefijo del path) y la nota fuente (que autoriza por el
  -- pedido) podrían apuntar a estudios distintos: un coordinador de dos protocolos subiría el
  -- archivo bajo el protocolo A y lo colgaría de un pedido del protocolo B, dejando la evidencia
  -- del paciente apuntando a otro estudio. En un sistema auditable eso es una nota fuente rota.
  if v_protocol_id is null or public.ip_doc_protocol(p_path) is distinct from v_protocol_id then
    raise exception 'La constancia no corresponde al protocolo de esta visita' using errcode = 'check_violation';
  end if;

  update public.dispensation_ip_documents
     set superseded_at = now()
   where request_id = p_request_id and superseded_at is null;

  insert into public.dispensation_ip_documents
    (request_id, storage_path, file_name, mime_type, size_bytes, uploaded_by)
  values (p_request_id, p_path, p_file_name, p_mime, p_size, auth.uid())
  returning id into v_id;

  -- Fuera de cronograma: la constancia es la declaración de que el pedido lleva IP. Recién acá
  -- `includes_ip` se prende, y con eso quedan activas las dos consecuencias aguas abajo — la
  -- exigencia de constancia en mark_dispensation_ready y la de kits en deliver_dispensation.
  -- Esta rama es la que custodia la guarda de arriba (misma condición): si el comprobante ya
  -- estuviera emitido, la función ya habría cortado y no se llega hasta acá.
  if not v_includes_ip then
    update public.dispensation_requests set includes_ip = true where id = p_request_id;
  end if;

  return v_id;
end;
$$;

-- 3.28 · registrar_vnp (MIXTO).
create or replace function public.registrar_vnp(
  p_enrollment_id uuid,
  p_date          date,
  p_notes         text default null
) returns uuid
language plpgsql security definer
set search_path = pg_catalog, public as $$
declare
  v_protocol uuid;
  v_visit    uuid;
begin
  -- 0141 · Alcance por estudio en Farmacia. Este RPC autoriza también por gerencia o Coordinación: la
  -- guarda deja pasar ESE camino —el mismo del chequeo de abajo— y sólo corta a quien entra únicamente
  -- por Farmacia a un estudio fuera de su alcance (D4). Para quien no está acotado no cambia nada.
  if not (
       public.has_module('gerencia')
       or public.has_min_role('track','admin')
       or (public.has_min_role('track','operator')
           and public.is_assigned_coordinator((select e.protocol_id from public.enrollments e where e.id = p_enrollment_id)))
       or public.pharma_alcanza_inscripcion(p_enrollment_id)) then
    raise exception 'No tenés acceso a este estudio.' using errcode = '42501';
  end if;

  if auth.uid() is null then
    raise exception 'No autenticado' using errcode = '42501';
  end if;
  if p_date is null then
    raise exception 'La fecha es obligatoria' using errcode = '23502';
  end if;

  select e.protocol_id into v_protocol
    from public.enrollments e
   where e.id = p_enrollment_id;
  if v_protocol is null then
    raise exception 'Enrolamiento inexistente' using errcode = '23503';
  end if;

  -- Farmacia se suma a los tres caminos que ya tenía register_visit_event. El orden pone a
  -- pharma primero porque es el llamador esperado de esta función; los otros tres están para
  -- que la coordinadora no pierda una capacidad que ya tenía si alguna vista la reusa.
  if not (public.has_min_role('pharma', 'operator')
          or public.has_module('gerencia')
          or public.has_min_role('track', 'admin')
          or (public.has_min_role('track', 'operator')
              and public.is_assigned_coordinator(v_protocol))) then
    raise exception 'No tenés permiso para registrar una visita de este paciente'
      using errcode = '42501';
  end if;

  -- La VNP es ilimitada y vale en las dos etapas (pre y post randomización): no hay singleton
  -- que chequear ni cutover del cuadro que la afecte. Es la razón por la que esta función puede
  -- ser corta sin estar incompleta — se puede comparar contra availableEventKinds
  -- (src/data/visitEvents.ts), que devuelve 'vnp' en sus tres ramas.
  insert into public.patient_visits (enrollment_id, kind, estimated_date, notes)
  values (p_enrollment_id, 'vnp', p_date, nullif(btrim(coalesce(p_notes, '')), ''))
  returning id into v_visit;

  return v_visit;
end; $$;

-- 3.29 · historial_medicacion_paciente (MIXTO).
create or replace function public.historial_medicacion_paciente(p_enrollment_id uuid)
returns table (
  occurred_at     timestamptz,
  action          text,          -- INSERT | UPDATE | DELETE (crudo; el front lo traduce)
  medication_name text,
  active_before   boolean,
  active_after    boolean,
  actor_name      text
)
language plpgsql security definer set search_path = public as $$
begin
  -- 0141 · Alcance por estudio en Farmacia. Este RPC autoriza también por gerencia o Coordinación: la
  -- guarda deja pasar ESE camino —el mismo del chequeo de abajo— y sólo corta a quien entra únicamente
  -- por Farmacia a un estudio fuera de su alcance (D4). Para quien no está acotado no cambia nada.
  if not (
       public.has_module('gerencia')
       or exists (select 1 from public.enrollments e
                   where e.id = p_enrollment_id and public.is_assigned_coordinator(e.protocol_id))
       or public.pharma_alcanza_inscripcion(p_enrollment_id)) then
    raise exception 'No tenés acceso a este estudio.' using errcode = '42501';
  end if;

  -- Autorización explícita (SECURITY DEFINER saltea la RLS, así que el candado va acá a mano):
  -- mismo alcance que la política "ver medicación asignada" de patient_medications (0050).
  if not (
    public.has_module('pharma') or public.has_module('gerencia')
    or exists (
      select 1 from public.enrollments e
      where e.id = p_enrollment_id
        and public.is_assigned_coordinator(e.protocol_id)
    )
  ) then
    raise exception 'Sin permiso para ver el historial de medicación' using errcode = '42501';
  end if;

  return query
    select
      a.occurred_at,
      a.action,
      m.name,
      (a.before_data ->> 'active')::boolean,
      (a.after_data  ->> 'active')::boolean,
      coalesce(u.full_name, 'Sistema')
    from public.audit_log a
    -- El medicamento y el enrolamiento salen del snapshot jsonb (after para INSERT/UPDATE, before
    -- para DELETE); coalesce cubre las tres operaciones.
    left join public.medications m
      on m.id = coalesce(a.after_data ->> 'medication_id', a.before_data ->> 'medication_id')::uuid
    left join public.users u on u.id = a.actor_id
    where a.entity_type = 'patient_medications'
      and coalesce(a.after_data ->> 'enrollment_id', a.before_data ->> 'enrollment_id') = p_enrollment_id::text
    order by a.occurred_at desc;
end;
$$;


notify pgrst, 'reload schema';
