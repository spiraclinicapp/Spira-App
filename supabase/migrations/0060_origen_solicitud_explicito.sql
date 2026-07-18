-- 0060 · Dispensación · el origen de la solicitud se declara, no se adivina
-- ============================================================================
-- Corrige el enfoque de la 0059. Ahí el módulo de origen se INFERÍA de los roles
-- del usuario: si tenía rol de Track sobre esa visita, se anotaba 'track'; si no,
-- 'pharma'. El QA logueado del 2026-07-18 mostró que eso está mal.
--
-- El usuario de prueba tiene admin en los cinco módulos, así que un alta hecha
-- desde el botón "Nueva dispensación" de Pharma quedó registrada como
-- "Coordinación". Y no es un artefacto del usuario de QA: en un centro chico es
-- normal que la misma persona tenga varios sombreros.
--
-- EL PUNTO: el rol dice qué PODÉS hacer, no DESDE DÓNDE lo hiciste. La misma
-- persona, con los mismos roles, hace exactamente la misma llamada desde el panel
-- de la visita en Track o desde el alta manual en Pharma. Ninguna inferencia
-- server-side puede distinguir esos dos casos, porque la diferencia no está en el
-- usuario: está en la pantalla.
--
-- Por eso el origen pasa a ser un PARÁMETRO que el cliente declara. Y como un
-- parámetro que viene del cliente no es confiable por sí solo, se valida: solo se
-- acepta 'pharma' de quien tiene rol de Pharma, y 'track' de quien tiene la authz
-- de Track sobre esa visita. Declarar no es lo mismo que poder.
--
-- El default es 'track' para que la llamada de tres argumentos que hace hoy el
-- panel de Track siga funcionando sin cambios.
-- ============================================================================

-- Drop de la versión de 3 argumentos: agregar el parámetro con `create or replace`
-- crearía una SOBRECARGA (dos funciones conviviendo) en vez de reemplazarla, y
-- PostgREST tendría que elegir entre las dos.
drop function if exists public.create_dispensation_request(uuid, jsonb, text);

create function public.create_dispensation_request(
  p_visit_id uuid,
  p_items    jsonb,
  p_notes    text default null,
  p_origen   text default 'track')
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_request_id uuid;
  v_item       jsonb;
  v_dispenses  boolean;
  v_puede_track boolean;
  v_puede_pharma boolean;
begin
  if auth.uid() is null then raise exception 'No autenticado' using errcode = '42501'; end if;

  if p_origen is null or p_origen not in ('track','pharma') then
    raise exception 'Origen de solicitud inválido' using errcode = 'check_violation';
  end if;

  -- authz de Track espeja la RLS de "track crea solicitudes" (0009): admin ve cualquier
  -- visita; operator solo las que coordina. coordina_visita "pelado" dejaría entrar a un
  -- viewer coordinador.
  v_puede_track := public.has_module('gerencia')
                   or public.has_min_role('track','admin')
                   or (public.has_min_role('track','operator') and public.coordina_visita(p_visit_id));
  v_puede_pharma := public.has_min_role('pharma','operator');

  if not (v_puede_track or v_puede_pharma) then
    raise exception 'No tenés permiso para solicitar dispensación de esta visita' using errcode = '42501';
  end if;

  -- El origen se declara, pero hay que poder respaldarlo: nadie registra una solicitud
  -- como venida de un módulo en el que no puede operar.
  if p_origen = 'pharma' and not v_puede_pharma then
    raise exception 'No podés registrar una solicitud como alta de farmacia' using errcode = '42501';
  end if;
  if p_origen = 'track' and not v_puede_track then
    raise exception 'No podés registrar una solicitud como pedido de coordinación' using errcode = '42501';
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
       nullif(btrim(coalesce(p_notes,'')),''), p_origen)
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
revoke all on function public.create_dispensation_request(uuid, jsonb, text, text) from public;
grant execute on function public.create_dispensation_request(uuid, jsonb, text, text) to authenticated;
