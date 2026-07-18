-- 0059 · Dispensación · Pharma puede originar solicitudes (alta manual)
-- ============================================================================
-- Fase 2 del rediseño del tablero: el botón "Nueva dispensación" del handoff.
-- Hasta acá solo Track (o gerencia) podía crear una solicitud; la farmacéutica
-- solo resolvía lo que le llegaba.
--
-- DOS COSAS, y la segunda es la que importa de verdad:
--
-- 1 · La authz de `create_dispensation_request` suma a Pharma operator+.
--     No es escalada de privilegios: Pharma ya ve todas las solicitudes de todos
--     los protocolos y ya puede resolverlas. Lo único que gana es originarlas.
--     El candado de dominio no se toca: `check_request_item_protocol` sigue
--     exigiendo que el medicamento esté habilitado y ACTIVO para ese paciente,
--     y `visit_definitions.dispenses` sigue siendo obligatorio. El alta manual
--     no es una puerta lateral, es la misma puerta con otra llave.
--
-- 2 · Se registra DE QUÉ MÓDULO salió la solicitud.
--     El cajón mostraba "Coordinación" hardcodeado y el comprobante lo derivaba
--     de `source`, que vale 'manual' para todas las filas desde la 0050. Hoy es
--     una etiqueta fija e inofensiva; en cuanto Pharma pueda crear, pasa a ser
--     FALSA: diría "Coordinación" en algo que originó la farmacéutica, incluido
--     el comprobante impreso que se sella, se firma y va a la carpeta.
--
--     Se resuelve con un dato, no con una inferencia: la RPC anota el módulo al
--     crear. No se reusa `dispensation_source` ('ivrs'|'base'|'manual') porque
--     eso describe de dónde salieron los DATOS del pedido, no quién lo originó;
--     mezclar las dos cosas en un enum ya poblado obligaría además a un ALTER
--     TYPE aparte (ver 0053).
-- ============================================================================


-- 1 · De qué módulo salió la solicitud ----------------------------------------
alter table public.dispensation_requests
  add column if not exists requested_by_module text
    check (requested_by_module in ('track', 'pharma'));

comment on column public.dispensation_requests.requested_by_module is
  'Módulo que originó la solicitud: track (Coordinación) o pharma (alta manual en farmacia). Lo escribe create_dispensation_request. 0059.';

-- Backfill seguro: hasta esta migración, Pharma NO podía crear solicitudes (la
-- authz de 0050:177-180 solo admitía gerencia / track). Toda fila preexistente
-- salió de Coordinación por construcción, así que esto no inventa nada.
update public.dispensation_requests
  set requested_by_module = 'track'
  where requested_by_module is null;


-- 2 · La RPC acepta a Pharma y anota el módulo --------------------------------
create or replace function public.create_dispensation_request(
  p_visit_id uuid, p_items jsonb, p_notes text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_request_id uuid;
  v_item       jsonb;
  v_dispenses  boolean;
  v_es_pharma  boolean;
  v_modulo     text;
begin
  if auth.uid() is null then raise exception 'No autenticado' using errcode = '42501'; end if;

  -- Pharma operator+ puede originar (alta manual en el mostrador). Se evalúa primero
  -- para poder etiquetar el módulo correctamente más abajo.
  v_es_pharma := public.has_min_role('pharma','operator');

  -- authz de Track espeja la RLS de "track crea solicitudes" (0009): admin ve cualquier
  -- visita; operator solo las que coordina. coordina_visita "pelado" dejaría entrar a un
  -- viewer coordinador.
  if not (v_es_pharma
          or public.has_module('gerencia') or public.has_min_role('track','admin')
          or (public.has_min_role('track','operator') and public.coordina_visita(p_visit_id))) then
    raise exception 'No tenés permiso para solicitar dispensación de esta visita' using errcode = '42501';
  end if;

  -- Quién la originó de verdad. Pharma gana solo si NO es también coordinadora de esa
  -- visita: si la persona tiene los dos sombreros y está trabajando sobre una visita que
  -- coordina, la solicitud es de Coordinación. Ante la duda, el módulo desde el que se
  -- puede actuar sobre ESA visita manda.
  if v_es_pharma
     and not (public.has_min_role('track','operator') and public.coordina_visita(p_visit_id))
     and not public.has_min_role('track','admin') then
    v_modulo := 'pharma';
  else
    v_modulo := 'track';
  end if;

  select coalesce(vd.dispenses, false) into v_dispenses
    from public.patient_visits pv
    left join public.visit_definitions vd on vd.id = pv.visit_def_id
    where pv.id = p_visit_id;
  if not found then
    raise exception 'Visita inexistente' using errcode = '23503';
  end if;
  if not coalesce(v_dispenses, false) then
    raise exception 'Esta visita no entrega medicación' using errcode = 'check_violation';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'La solicitud no tiene ítems' using errcode = 'check_violation';
  end if;

  insert into public.dispensation_requests
      (visit_id, requested_by, status, source, notes, requested_by_module)
    values
      (p_visit_id, auth.uid(), 'solicitada', 'manual',
       nullif(btrim(coalesce(p_notes,'')),''), v_modulo)
    returning id into v_request_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    -- validar forma ANTES del cast: una key ausente daría NULL y el check de cantidad no
    -- dispararía, cayendo en un 23502 crudo en vez del mensaje sereno.
    if jsonb_typeof(v_item) <> 'object'
       or nullif(btrim(coalesce(v_item->>'medication_id','')),'') is null
       or nullif(btrim(coalesce(v_item->>'quantity','')),'') is null then
      raise exception 'Cada ítem necesita medicamento y cantidad' using errcode = 'check_violation';
    end if;
    if (v_item->>'quantity')::integer <= 0 then
      raise exception 'La cantidad debe ser mayor a cero' using errcode = 'check_violation';
    end if;
    insert into public.dispensation_request_items (request_id, medication_id, quantity)
      values (v_request_id, (v_item->>'medication_id')::uuid, (v_item->>'quantity')::integer);
    -- trg check_request_item_protocol valida asignación de protocolo + patient_medications
  end loop;

  return v_request_id;
end; $$;
revoke all on function public.create_dispensation_request(uuid, jsonb, text) from public;
grant execute on function public.create_dispensation_request(uuid, jsonb, text) to authenticated;


-- 3 · Visitas que pueden recibir una dispensación manual -----------------------
-- Para el desplegable del alta manual: las visitas dispensadoras de un paciente que
-- todavía no tienen una solicitud viva. Va como RPC y no como select directo porque
-- Pharma no tiene RLS de lectura sobre `patient_visits` de todos los protocolos
-- (Track se aísla por protocolo; Pharma es central). Mismo candado que el resto del
-- módulo: pharma operator+ o gerencia.
create or replace function public.visitas_dispensables(p_enrollment_id uuid)
returns table (
  visit_id     uuid,
  visit_name   text,
  visit_date   date,
  ya_solicitada boolean
)
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'No autenticado' using errcode = '42501'; end if;
  if not (public.has_min_role('pharma','operator') or public.has_module('gerencia')) then
    raise exception 'Sin permiso para ver las visitas de este paciente' using errcode = '42501';
  end if;

  return query
    select pv.id,
           coalesce(vd.name, 'Visita'),
           coalesce(pv.real_date, pv.estimated_date),
           exists (
             select 1 from public.dispensation_requests dr
             where dr.visit_id = pv.id
               and dr.status in ('solicitada','preparando')
           )
    from public.patient_visits pv
    join public.visit_definitions vd on vd.id = pv.visit_def_id
    where pv.enrollment_id = p_enrollment_id
      and coalesce(vd.dispenses, false) = true
    order by coalesce(pv.real_date, pv.estimated_date) desc nulls last;
end; $$;
revoke all on function public.visitas_dispensables(uuid) from public;
grant execute on function public.visitas_dispensables(uuid) to authenticated;
