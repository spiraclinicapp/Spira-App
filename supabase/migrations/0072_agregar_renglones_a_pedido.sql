-- Spira · Migración 0072 — Agregar renglones a un pedido de dispensación YA EXISTENTE.
-- Aplicar A MANO en el SQL Editor (como postgres), después de la 0071. IDEMPOTENTE.
--
-- POR QUÉ EXISTE. La decisión de diseño de la dispensación de IP (0071) es UN SOLO PEDIDO POR
-- VISITA: la medicación concomitante y la constancia del producto en investigación viajan juntas y
-- salen en UN solo comprobante. La regla que la UI le promete al coordinador es "el primero que
-- actúa crea el pedido, el segundo se suma al mismo".
--
-- Esa regla era cierta en UN SOLO SENTIDO. Adjuntar la constancia reusa el pedido abierto si ya
-- existe (y lo crea si no hay), pero agregar medicación no tenía CÓMO sumarse: la única puerta era
-- `create_dispensation_request`, que siempre crea un pedido nuevo. O sea que en el orden
-- constancia → medicación —que es el orden natural en una visita de protocolo, donde el IP es lo que
-- la visita entrega por cronograma y la concomitante se acuerda después, ya con el paciente en el
-- centro— la visita terminaba con DOS pedidos: dos tarjetas en el tablero de Farmacia, dos
-- comprobantes para el mismo paciente el mismo día, y la farmacéutica adivinando cuál es cuál y si
-- el segundo anula al primero. En un sistema auditable eso no es una molestia de UI: son dos notas
-- fuente para un hecho único. Sin esta función, "un solo pedido por visita" es mentira en uno de los
-- dos órdenes posibles. Esta es la puerta que faltaba.
--
-- ⚠️ Recordatorio heredado de la 0071: NUNCA escribir dos signos peso pegados dentro de un
--    comentario de un archivo .sql. El editor SQL de Supabase rastrea el dollar-quoting SIN ignorar
--    los comentarios, así que uno suelto le invierte la paridad, deja de reconocer los cuerpos de
--    función y los parte por sus `;` internos — con un error desconcertante y lejanísimo del
--    comentario culpable. Costó una tarde el 2026-08-10.
-- ============================================================================

-- Un solo `drop` alcanza para la idempotencia: la función es nueva, no hay firma vieja en prod de la
-- que despegarse (a diferencia de la 0071 §8/§9, que sí tenían que dropear las dos).
drop function if exists public.add_dispensation_items(uuid, jsonb);

create function public.add_dispensation_items(p_request_id uuid, p_items jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_status       request_status;
  v_visit_id     uuid;
  v_off          boolean;
  v_dispenses    boolean;
  v_item         jsonb;
  v_puede_track  boolean;
  v_puede_pharma boolean;
begin
  if auth.uid() is null then raise exception 'No autenticado' using errcode = '42501'; end if;

  -- Se lee el pedido junto con su visita para tener a mano las dos cosas que hacen falta y que NO
  -- viven en la solicitud: a quién le corresponde coordinarla (authz) y si el cronograma dice que la
  -- visita entrega medicación. `for update of dr` lockea SOLO la solicitud —el join es para leer, no
  -- para bloquear la agenda— y cierra la carrera con `start_dispensation_preparation`: sin el lock,
  -- Farmacia podría tomar el pedido entre el chequeo de estado y el insert de los renglones, y la
  -- medicación aparecería en un cajón que la farmacéutica ya dio por completo. Mismo patrón que
  -- `attach_ip_document` (0071 §7). `visit_definitions` va con LEFT JOIN: una visita libre no tiene
  -- definición y eso no es un error (igual que en `create_dispensation_request`).
  select dr.status, dr.visit_id, dr.off_schedule, coalesce(vd.dispenses, false)
    into v_status, v_visit_id, v_off, v_dispenses
    from public.dispensation_requests dr
    join public.patient_visits pv on pv.id = dr.visit_id
    left join public.visit_definitions vd on vd.id = pv.visit_def_id
   where dr.id = p_request_id
   for update of dr;
  if not found then
    raise exception 'No se encontró la solicitud' using errcode = '23503';
  end if;

  -- Authz VERBATIM de `create_dispensation_request` (0071 §8), con la visita que sale del pedido en
  -- vez de venir por parámetro. Espeja la RLS de "track crea solicitudes" (0009): admin ve cualquier
  -- visita, operator solo las que coordina, y `coordina_visita` "pelado" dejaría entrar a un viewer
  -- coordinador. No se inventa un criterio nuevo a propósito: agregar un renglón a un pedido abierto
  -- es exactamente el mismo acto que crearlo con ese renglón adentro, así que tiene que pedir
  -- exactamente los mismos permisos — si acá fueran más laxos, bastaría con crear el pedido vacío
  -- por un lado y llenarlo por el otro.
  v_puede_track := public.has_module('gerencia')
                   or public.has_min_role('track','admin')
                   or (public.has_min_role('track','operator') and public.coordina_visita(v_visit_id));
  v_puede_pharma := public.has_min_role('pharma','operator');

  if not (v_puede_track or v_puede_pharma) then
    raise exception 'No tenés permiso para agregar medicación a esta solicitud' using errcode = '42501';
  end if;

  -- Solo con el pedido ABIERTO. Desde `preparando` en adelante el cajón ya está armado —y en la
  -- ventana `lista` el comprobante ya salió con su correlativo sellado (0071 §7 documenta por qué el
  -- status del pedido no alcanza para saberlo)—, así que sumarle un renglón dejaría medicación
  -- pedida por fuera del papel que se imprimió. El mensaje nombra la salida real, que no es técnica:
  -- Farmacia cancela la preparación y vuelve a tomarlo.
  if v_status = 'preparando' then
    raise exception 'Farmacia ya está preparando este pedido: no se le puede agregar medicación. Pedile que cancele la preparación para sumarla.'
      using errcode = 'check_violation';
  end if;
  if v_status <> 'solicitada' then
    raise exception 'Este pedido ya está cerrado (%): no se le puede agregar medicación.', v_status
      using errcode = 'check_violation';
  end if;

  -- La FORMA de p_items, con el mismo criterio que `create_dispensation_request`: se adelanta al
  -- bucle porque `jsonb_array_length` sobre un jsonb que no sea array revienta con un error crudo en
  -- vez del mensaje sereno. Acá la lista VACÍA sí es un error (a diferencia de la creación, donde el
  -- pedido sin renglones es el caso típico del IP solo): esta función existe para agregar algo, y un
  -- "agregué cero renglones" que devuelve éxito es de la familia de mentiras que este sistema no se
  -- puede permitir.
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'La solicitud tiene ítems con un formato inválido' using errcode = 'check_violation';
  end if;
  if jsonb_array_length(p_items) = 0 then
    raise exception 'No hay medicación para agregar' using errcode = 'check_violation';
  end if;

  -- El candado del cronograma, también verbatim: la visita tiene que entregar medicación, salvo que
  -- el pedido sea una dispensación FUERA DE CRONOGRAMA (ahí el motivo ya salteó esa validación al
  -- crearse y no corresponde volver a exigirla). Sin este bloque quedaría abierto el desvío obvio:
  -- crear un pedido de IP solo en una visita que no entrega concomitante —que la 0071 permite— y
  -- después llenarlo de renglones por esta puerta, salteando el `dispenses` que la creación sí exige.
  if not v_off and not v_dispenses then
    raise exception 'Esta visita no entrega medicación' using errcode = 'check_violation';
  end if;

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
      values (p_request_id, (v_item->>'medication_id')::uuid, (v_item->>'quantity')::integer);
    -- trg check_request_item_protocol valida asignación de protocolo + patient_medications: el
    -- medicamento tiene que estar habilitado y activo para ESTE paciente. No se duplica acá.
  end loop;
end; $$;

comment on function public.add_dispensation_items(uuid, jsonb) is
  'Agrega renglones de medicación a un pedido de dispensación abierto (solicitada). Es la contraparte
   de attach_ip_document: sin ella, la regla "un solo pedido por visita" solo se cumplía cuando la
   medicación se cargaba primero, y el orden constancia → medicación dejaba dos pedidos y dos
   comprobantes para la misma visita. Misma authz y mismas validaciones que
   create_dispensation_request. 0072.';

revoke all on function public.add_dispensation_items(uuid, jsonb) from public;
grant execute on function public.add_dispensation_items(uuid, jsonb) to authenticated;


-- ============================================================================
-- VERIFICACIÓN POSTERIOR (correr después de aplicar):
--
--   -- 1. La función quedó ÚNICA (sin sobrecarga colgada, que dejaría a PostgREST entre dos):
--   --    select proname, pg_get_function_identity_arguments(oid), prosecdef from pg_proc
--   --     where proname = 'add_dispensation_items';
--   --    → exactamente una fila, `(p_request_id uuid, p_items jsonb)` y prosecdef = true.
--   -- 2. Los privilegios quedaron como el resto de las RPC del módulo (nada para public/anon):
--   --    select grantee, privilege_type from information_schema.routine_privileges
--   --     where routine_name = 'add_dispensation_items';
--   --    → `authenticated` con EXECUTE (y el owner). Ni `public` ni `anon`.
--   -- 3. Esta migración NO toca datos: no hay backfill, no hay DDL sobre tablas ni vistas. Ninguna
--   --    solicitud, dispensación ni visita cambia de estado al aplicarla.
-- ============================================================================
