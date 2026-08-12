-- 0076 · Dispensación · sustituir un renglón por un equivalente
-- ============================================================================
-- REQUIERE la 0075 aplicada.
--
-- Del handoff "Dispensación · paso a paso B" §5.5: en el mostrador, la caja que
-- vino no siempre es la del renglón. Otra presentación del MISMO fármaco sirve,
-- y hoy la única salida es cancelar la preparación entera.
--
-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ EL CHOQUE QUE ESTA MIGRACIÓN TIENE QUE ATRAVESAR                          │
-- │                                                                           │
-- │ El handoff propone: alternativas = mismo fármaco + hay stock.              │
-- │ La base exige (0050:87 y :122, trigger check_request_item_protocol):       │
-- │   · el medicamento asignado al PROTOCOLO (protocol_medications), y         │
-- │   · habilitado y ACTIVO para ESE PACIENTE (patient_medications).           │
-- │                                                                           │
-- │ Y patient_medications suele tener UNA presentación por droga y paciente,   │
-- │ así que la alternativa que ofrece el handoff es justo la que el trigger    │
-- │ rechaza. Aplicado tal cual, el botón "Usar este" fallaba el primer día.    │
-- │                                                                           │
-- │ RESOLUCIÓN (decisión del Director): el candado NO se afloja. Sustituir     │
-- │ HABILITA la alternativa en patient_medications dentro de la MISMA          │
-- │ transacción, con su motivo, y las dos escrituras caen juntas en el         │
-- │ audit_log. Sigue siendo imposible dispensar algo no habilitado; lo que     │
-- │ cambia es que habilitar pasa a ser un acto explícito y auditado, hecho por │
-- │ quien la RLS ya autoriza (policy "pharma asigna medicación", 0050:149).    │
-- └──────────────────────────────────────────────────────────────────────────┘
--
-- QUÉ CUENTA COMO EQUIVALENTE (la regla vive acá y en un solo lugar; la lee
-- tanto la función que ofrece las alternativas como la que sustituye):
--
--   mismo drug_id            ← otra droga NO es una sustitución, es otra receta
--   misma dosis              ← otra concentración requiere autorización del IP
--   asignado al protocolo    ← si no, lo frena check_patient_med_protocol
--   con stock no vencido     ← ofrecer algo que el FEFO no va a encontrar es
--                              mandar a la farmacéutica a un callejón
--
-- Las de otra concentración SÍ se listan, marcadas como bloqueadas y con su
-- motivo: esconderlas haría que la farmacéutica busque un equivalente que está
-- ahí y no aparece. Verlo y entender por qué no se puede es información; no
-- verlo es un misterio.
-- ============================================================================


-- 1 · El rastro de la sustitución en el renglón --------------------------------
-- Sin esto la sustitución sería invisible: la fila mostraría el medicamento
-- nuevo como si hubiera sido el pedido desde el principio.
alter table public.dispensation_request_items
  add column if not exists substituted_from_medication_id uuid references public.medications(id),
  add column if not exists substitution_reason text,
  add column if not exists substituted_at timestamptz,
  add column if not exists substituted_by uuid references public.users(id);

comment on column public.dispensation_request_items.substituted_from_medication_id is
  'Qué medicamento se había pedido antes de sustituir (0076). NULL = el renglón es el original. Es lo que hace visible la sustitución en la fila y en la trazabilidad.';

comment on column public.dispensation_request_items.substitution_reason is
  'Motivo de la sustitución. OPCIONAL por ahora: el handoff (§14) deja abierto si debe ser obligatorio. Volverlo obligatorio es un check, no un rediseño.';


-- 2 · Las alternativas de un renglón -------------------------------------------
-- Va por RPC y no por consulta del cliente para que la regla de "qué es
-- equivalente" viva en UN lugar: si el front la reconstruyera con sus propios
-- filtros, ofrecería cosas que la función de abajo después rechaza.
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
revoke all on function public.alternativas_sustitucion(uuid) from public;
grant execute on function public.alternativas_sustitucion(uuid) to authenticated;


-- 3 · Sustituir ----------------------------------------------------------------
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
revoke all on function public.substitute_dispensation_item(uuid, uuid, text) from public;
grant execute on function public.substitute_dispensation_item(uuid, uuid, text) to authenticated;
