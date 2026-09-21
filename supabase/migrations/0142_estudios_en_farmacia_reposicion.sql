-- ============================================================================
-- 0142 · Estudios en Farmacia, PR 4: la reposición, las constancias y el barrido final
--
-- Plan: docs/plan-estudios-en-farmacia.md (PR 4). Es la ÚLTIMA: con esta migración aplicada —después
-- de la 0140 y la 0141— el recorte por estudio queda completo en toda Farmacia.
--
-- ── QUÉ HACE ──
--   1. Una función de alcance para los ARCHIVOS del bucket ip-docs (constancias de IP y recetas).
--   2. Las dos policies de lectura de los pedidos de medicación y sus renglones.
--   3. Las dos policies del bucket ip-docs en storage.objects. Hasta hoy le abrían CUALQUIER archivo
--      del bucket a toda Farmacia: con un list() se veían todas las rutas y se bajaba la constancia de
--      un estudio oculto. Es el único agujero que no estaba en `public`, y por eso ningún barrido del
--      schema lo veía.
--   4. Guarda en seis RPC de Farmacia que escriben (los cinco de reposición y la asignación de un
--      medicamento a un protocolo, que la RLS de la 0139 no alcanzaba porque es security definer) y
--      en uno que lee (quién coordina un estudio).
--   5. Filtro en los dos RPC que devuelven datos de VARIOS estudios a la vez: pedidos_por_recibir (sin
--      parámetros) y reposicion_del_periodo (con el protocolo opcional). A esos no les alcanza una
--      guarda: se les recorta el resultado con UNA condición en el CTE del que cuelga todo lo demás.
--
-- ── EL BARRIDO FINAL ──
-- Hecho por script sobre las definiciones VIVAS de todo el schema (cada objeto por su último evento).
-- Queda en el repo como scripts/check-alcance-farmacia.mjs: sin esta migración falla con los 13 huecos
-- que cierra; con ella pasa. Lo que encontró:
--   · Policies que nombran a Farmacia: todas llevan pharma_alcanza_* salvo las 17 de las diez tablas
--     de catálogo global y ajustes que la 0139 declaró excepción (medications, drugs, medication_codes,
--     laboratorios, laboratorio_codes, farmacia_ajustes, report_definitions, report_platforms,
--     visit_definitions, procedures). Con esta migración, CERO pendientes.
--   · Vistas: 24 vivas. Las 19 que leen datos de estudios, TODAS security_invoker: ninguna se saltea
--     la RLS. La única sin él es v_team_roster (0109), el padrón de personas, a propósito y sin estudios.
--   · Funciones security definer que Farmacia puede llamar sin guarda: sólo el catálogo global
--     (create_drug, create_laboratorio, create_medication) y farmaceuticas_disponibles, que devuelve
--     personas. El resto lleva guarda o filtro (0140, 0141 y ésta).
--   · Funciones security definer sin chequeo de rol que toquen datos de estudios: sólo coordina_visita,
--     que devuelve un booleano sobre quien la llama.
--
-- ── ADITIVA Y NO BREAKING ──
-- Mientras nadie esté acotado no cambia una sola fila ni una sola respuesta. El front no cambia.
--
-- ✅ REGLA OPERATIVA: la de "no acotar a nadie" se LEVANTA recién con las tres aplicadas, 0140, 0141 y
-- 0142, y con la verificación del bucket del pie de este archivo mirada a ojo.
--
-- APLICAR: a mano en el SQL Editor de Supabase (rol postgres), DESPUÉS de la 0141. IDEMPOTENTE.
-- Registrar en supabase/README.md al confirmarse en prod.
-- ============================================================================


-- 1 · Alcance de un ARCHIVO del bucket ip-docs ----------------------------------------------------
-- El protocolo viaja en el PRINCIPIO de la ruta: el front sube a `{protocolo}/{pedido}/…` (constancias)
-- y a `{protocolo}/habilitaciones/…` (recetas), y ip_doc_protocol (0071) lo lee de ahí.
--
-- POR QUÉ NO ALCANZA pharma_alcanza_protocolo(ip_doc_protocol(name)): ip_doc_protocol devuelve null si la
-- ruta no empieza con un uuid, y con la regla D6 de la 0140 un null es "de ningún estudio" y lo ve todo
-- Farmacia. En este bucket TODO archivo es de un estudio —así se construyen las rutas—, así que una ruta
-- sin protocolo es un archivo roto, no uno "de nadie": a quien está acotado no se le abre. Para quien no
-- lo está no cambia nada (pharma_sin_recorte corta antes).
create or replace function public.pharma_alcanza_archivo_ip(p_name text)
returns boolean language sql security definer stable
set search_path = pg_catalog, public as $fn$
  select public.pharma_sin_recorte()
      or (public.ip_doc_protocol(p_name) is not null
          and public.pharma_alcanza_protocolo(public.ip_doc_protocol(p_name)));
$fn$;

comment on function public.pharma_alcanza_archivo_ip is
  'Alcance de Farmacia sobre un archivo del bucket ip-docs, por el protocolo del principio de su ruta. '
  'Una ruta sin protocolo NO se abre a quien esta acotado (no es "de ningun estudio": es un archivo '
  'roto). NO comprueba el modulo ni el nivel. 0142.';

grant execute on function public.pharma_alcanza_archivo_ip(text) to authenticated;


-- 2 · Los pedidos de medicación (viva: 0128) --------------------------------------------------------
-- Sólo tienen policy de lectura: se escriben únicamente por los RPC de la sección 4.
alter policy "ver pedidos de medicacion" on public.pedidos_medicacion
  using ((public.has_min_role('pharma', 'viewer') and public.pharma_alcanza_protocolo(protocol_id))
         or public.has_module('gerencia'));
alter policy "ver renglones de pedidos de medicacion" on public.pedido_medicacion_items
  using ((public.has_min_role('pharma', 'viewer') and public.pharma_alcanza_pedido(pedido_id))
         or public.has_module('gerencia'));


-- 3 · El bucket ip-docs (viva: 0071) -----------------------------------------------------------------
-- Mismo molde que la 0071, y por el mismo motivo: storage.objects es de supabase_storage_admin y
-- `create policy` ahí puede devolver 42501. El bloque `do` con manejador absorbe el fallo y AVISA, y el
-- resto del archivo entra igual. La cláusula de Coordinación (is_assigned_coordinator) queda como estaba.
--
-- ⚠️ EL "Success" NO PRUEBA NADA. La prueba es la consulta de verificación del pie del archivo.
do $$
begin
  drop policy if exists "ip docs lectura" on storage.objects;
  create policy "ip docs lectura" on storage.objects for select using (
    bucket_id = 'ip-docs' and (
      (public.has_min_role('pharma','viewer') and public.pharma_alcanza_archivo_ip(name))
      or public.has_module('gerencia')
      or public.is_assigned_coordinator(public.ip_doc_protocol(name))
    )
  );

  drop policy if exists "ip docs alta" on storage.objects;
  create policy "ip docs alta" on storage.objects for insert with check (
    bucket_id = 'ip-docs' and (
      (public.has_min_role('pharma','operator') and public.pharma_alcanza_archivo_ip(name))
      or public.is_assigned_coordinator(public.ip_doc_protocol(name))
    )
  );
exception when insufficient_privilege then
  raise notice 'PENDIENTE A MANO: no se pudieron reemplazar las policies del bucket ip-docs (%). El resto de la 0142 se aplicó igual. Hay que editarlas desde Storage → Policies con las expresiones de la sección 3 de este archivo.', sqlerrm;
end $$;


-- 4 · Guardas y filtros de los nueve RPC --------------------------------------------------------------
-- Cuerpos VIVOS extraídos por script de su migración, con UNA edición cada uno —verificada por
-- comparador—:
--   · GUARDA: cuatro líneas después del begin. Seis de Farmacia (sin excepciones) y
--     list_protocol_coordinators, que autoriza también a gerencia (MIXTO: ese camino pasa).
--   · FILTRO: una condición en el CTE del que cuelga todo el resultado. El script exige que el lugar
--     aparezca una sola vez en el cuerpo.

-- 3.1 · emitir_pedido_medicacion (FARMACIA) — cuerpo vivo de la 0133.
create or replace function public.emitir_pedido_medicacion(
  p_protocol_id  uuid,
  p_desde        date,
  p_hasta        date,
  p_emitido_el   date,
  p_renglones    jsonb,
  p_intento      uuid default null,
  p_ultimo_visto integer default null
)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_id       uuid;
  v_numero   integer;
  v_protocol uuid;
  v_anulado  timestamptz;
  v_nombre   text;
  v_r        jsonb;
  v_otro     integer;
  v_hoy      date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
begin
  -- 0142 · Alcance por estudio en Farmacia. Este RPC es SÓLO de Farmacia: la guarda es el alcance, sin
  -- excepciones. Va primero y no toca nada: a quien no está acotado pharma_sin_recorte() lo deja pasar
  -- antes de mirar una tabla, y el resto de la función corre igual que antes de esta migración.
  if not (
       public.pharma_alcanza_protocolo(p_protocol_id)) then
    raise exception 'No tenés acceso a este estudio.' using errcode = '42501';
  end if;

  if auth.uid() is null then raise exception 'No autenticado' using errcode = '42501'; end if;
  if not public.has_min_role('pharma', 'operator') then
    raise exception 'No tenés permiso para emitir pedidos' using errcode = '42501';
  end if;

  -- Un candado por estudio hasta el fin de la transacción, ANTES de todo lo que lee pedidos: la segunda de
  -- dos llamadas simultáneas espera a la primera y, al seguir, ya ve su pedido — sea el de su mismo intento
  -- (y lo devuelve) o uno de otra pantalla (y p_ultimo_visto lo frena).
  perform pg_advisory_xact_lock(hashtextextended('emitir_pedido_medicacion:' || p_protocol_id::text, 0));

  -- Un reintento del mismo «Armar pedido»: devuelve lo que ya quedó guardado, sin volver a validar (un
  -- reintento después de medianoche tiene que encontrar su pedido, no chocar con la fecha). Sólo si pide
  -- lo mismo: medicamento por medicamento, las mismas cantidades.
  if p_intento is not null then
    select pe.id, pe.numero, pe.protocol_id, pe.anulado_at into v_id, v_numero, v_protocol, v_anulado
      from public.pedidos_medicacion pe
     where pe.intento = p_intento;
    if found then
      if v_protocol <> p_protocol_id then
        raise exception 'Ese pedido ya se emitió para otro estudio' using errcode = '22023';
      end if;
      if v_anulado is not null then
        raise exception 'Ese pedido se anuló: cerrá esta ventana y armalo de nuevo' using errcode = '23514';
      end if;
      if exists (
        select 1
          from (select it.medication_id, it.pedido
                  from public.pedido_medicacion_items it
                 where it.pedido_id = v_id) guardado
          full join (select (r.value->>'medication_id')::uuid as medication_id, (r.value->>'pedido')::integer as pedido
                       from jsonb_array_elements(case when jsonb_typeof(p_renglones) = 'array' then p_renglones
                                                      else '[]'::jsonb end) r) llega
            on llega.medication_id = guardado.medication_id
         where guardado.medication_id is null
            or llega.medication_id is null
            or llega.pedido is distinct from guardado.pedido
      ) then
        raise exception 'Ese pedido ya quedó emitido con otras cantidades: fijate en la lista del estudio'
          using errcode = '22023';
      end if;
      return jsonb_build_object('id', v_id, 'numero', v_numero);
    end if;
  end if;

  if p_desde is null or p_hasta is null or p_desde > p_hasta then
    raise exception 'El período del pedido no es válido' using errcode = '22023';
  end if;
  if p_emitido_el is distinct from v_hoy then
    raise exception 'La pantalla quedó abierta desde otro día: recargala para emitir' using errcode = '22023';
  end if;
  if not exists (select 1 from public.protocols pr where pr.id = p_protocol_id and pr.status <> 'cerrado') then
    raise exception 'Ese estudio no existe o está cerrado' using errcode = 'P0002';
  end if;
  if p_renglones is null or jsonb_typeof(p_renglones) <> 'array' or jsonb_array_length(p_renglones) = 0 then
    raise exception 'El pedido está vacío' using errcode = '22023';
  end if;

  if p_ultimo_visto is not null then
    select max(pe.numero) into v_otro
      from public.pedidos_medicacion pe
     where pe.protocol_id = p_protocol_id
       and pe.anulado_at is null
       and pe.periodo_desde <= p_hasta
       and pe.periodo_hasta >= p_desde
       and pe.numero > p_ultimo_visto;
    if v_otro is not null then
      raise exception 'Ya hay un pedido para este período (Nº %): fijate en la lista del estudio', v_otro
        using errcode = '23514';
    end if;
  end if;

  select u.full_name into v_nombre from public.users u where u.id = auth.uid();

  begin
    insert into public.pedidos_medicacion (protocol_id, periodo_desde, periodo_hasta, emitido_el, emitido_por, emitido_por_nombre, intento)
    values (p_protocol_id, p_desde, p_hasta, p_emitido_el, auth.uid(), v_nombre, p_intento)
    returning id, numero into v_id, v_numero;
  exception when unique_violation then
    -- Red: con el candado de arriba, dos llamadas con el mismo intento y el mismo estudio ya no llegan
    -- juntas hasta acá (la segunda encuentra el pedido en la búsqueda del intento). Queda por las dudas:
    -- si otra guardó primero ese intento, se devuelve el suyo en vez de un error de clave duplicada.
    select pe.id, pe.numero into v_id, v_numero
      from public.pedidos_medicacion pe
     where pe.intento = p_intento;
    if v_id is null then raise; end if;
    return jsonb_build_object('id', v_id, 'numero', v_numero);
  end;

  for v_r in select value from jsonb_array_elements(p_renglones) loop
    if not exists (
      select 1 from public.protocol_medications pmx
       where pmx.protocol_id = p_protocol_id
         and pmx.medication_id = (v_r->>'medication_id')::uuid
    ) then
      raise exception 'Un medicamento del pedido no es de este estudio' using errcode = 'P0002';
    end if;
    if coalesce((v_r->>'pedido')::integer, 0) <= 0 then
      raise exception 'Cada renglón del pedido necesita una cantidad' using errcode = '22023';
    end if;
    insert into public.pedido_medicacion_items (pedido_id, medication_id, calculado, pedido)
    values (v_id, (v_r->>'medication_id')::uuid, (v_r->>'calculado')::integer, (v_r->>'pedido')::integer);
  end loop;

  return jsonb_build_object('id', v_id, 'numero', v_numero);
end;
$fn$;

-- 3.2 · anular_pedido_medicacion (FARMACIA) — cuerpo vivo de la 0128.
create or replace function public.anular_pedido_medicacion(p_pedido_id uuid, p_motivo text)
returns void language plpgsql security definer set search_path = public as $fn$
declare
  v_anulado timestamptz;
  v_nombre  text;
begin
  -- 0142 · Alcance por estudio en Farmacia. Este RPC es SÓLO de Farmacia: la guarda es el alcance, sin
  -- excepciones. Va primero y no toca nada: a quien no está acotado pharma_sin_recorte() lo deja pasar
  -- antes de mirar una tabla, y el resto de la función corre igual que antes de esta migración.
  if not (
       public.pharma_alcanza_pedido(p_pedido_id)) then
    raise exception 'No tenés acceso a este estudio.' using errcode = '42501';
  end if;

  if auth.uid() is null then raise exception 'No autenticado' using errcode = '42501'; end if;
  if not public.has_min_role('pharma', 'operator') then
    raise exception 'No tenés permiso para anular pedidos' using errcode = '42501';
  end if;
  if p_motivo is null or p_motivo not in ('por_error', 'rehecho') then
    raise exception 'Elegí un motivo para anular' using errcode = '22023';
  end if;

  select pe.anulado_at into v_anulado from public.pedidos_medicacion pe where pe.id = p_pedido_id for update;
  if not found then
    raise exception 'Ese pedido ya no está' using errcode = 'P0002';
  end if;
  if v_anulado is not null then
    raise exception 'Ese pedido ya está anulado' using errcode = '23514';
  end if;
  if exists (select 1 from public.medication_receptions mr where mr.pedido_id = p_pedido_id and mr.status <> 'anulada') then
    raise exception 'Este pedido ya tiene recepciones: no se puede anular' using errcode = '23514';
  end if;

  select u.full_name into v_nombre from public.users u where u.id = auth.uid();
  update public.pedidos_medicacion pe
     set anulado_at = now(), anulado_por_nombre = v_nombre, anulado_motivo = p_motivo
   where pe.id = p_pedido_id;
end;
$fn$;

-- 3.3 · cerrar_faltante_pedido (FARMACIA) — cuerpo vivo de la 0133.
create or replace function public.cerrar_faltante_pedido(p_item_id uuid, p_motivo text)
returns void language plpgsql security definer set search_path = public as $fn$
declare
  v_item          public.pedido_medicacion_items%rowtype;
  v_anulado       timestamptz;
  v_recibido      integer;
  v_sin_verificar integer;
  v_nombre        text;
begin
  -- 0142 · Alcance por estudio en Farmacia. Este RPC es SÓLO de Farmacia: la guarda es el alcance, sin
  -- excepciones. Va primero y no toca nada: a quien no está acotado pharma_sin_recorte() lo deja pasar
  -- antes de mirar una tabla, y el resto de la función corre igual que antes de esta migración.
  if not (
       public.pharma_alcanza_pedido((select it.pedido_id from public.pedido_medicacion_items it where it.id = p_item_id))) then
    raise exception 'No tenés acceso a este estudio.' using errcode = '42501';
  end if;

  if auth.uid() is null then raise exception 'No autenticado' using errcode = '42501'; end if;
  if not public.has_min_role('pharma', 'operator') then
    raise exception 'No tenés permiso para cerrar lo que falta de un pedido' using errcode = '42501';
  end if;
  if p_motivo is null or p_motivo not in ('no_lo_tiene', 'discontinuado', 'no_hace_falta') then
    raise exception 'Elegí un motivo' using errcode = '22023';
  end if;

  select * into v_item from public.pedido_medicacion_items it where it.id = p_item_id for update;
  if not found then
    raise exception 'Ese renglón ya no está' using errcode = 'P0002';
  end if;
  -- for share: mismo criterio que el resto de las funciones que leen un pedido antes de decidir (0128,
  -- secciones 5 y 7) — serializa contra anular_pedido_medicacion, que lo toma for update.
  select pe.anulado_at into v_anulado from public.pedidos_medicacion pe where pe.id = v_item.pedido_id for share;
  if v_anulado is not null then
    raise exception 'Ese pedido está anulado' using errcode = '23514';
  end if;
  if v_item.cerrado_at is not null then
    raise exception 'Lo que falta de ese renglón ya está cerrado' using errcode = '23514';
  end if;

  select coalesce(sum(ri.quantity) filter (where mr.status = 'verificada'), 0)::integer,
         coalesce(sum(ri.quantity) filter (where mr.status = 'pendiente'), 0)::integer
    into v_recibido, v_sin_verificar
    from public.reception_items ri
    join public.medication_receptions mr on mr.id = ri.reception_id
   where mr.pedido_id = v_item.pedido_id
     and ri.medication_id = v_item.medication_id;
  if v_recibido >= v_item.pedido then
    raise exception 'Ese renglón ya se recibió entero' using errcode = '23514';
  end if;
  if v_sin_verificar > 0 then
    raise exception 'Ese renglón tiene una recepción sin verificar: verificala o anulala antes' using errcode = '23514';
  end if;

  select u.full_name into v_nombre from public.users u where u.id = auth.uid();
  update public.pedido_medicacion_items it
     set cerrado_at = now(), cerrado_por_nombre = v_nombre, cerrado_motivo = p_motivo
   where it.id = p_item_id;
end;
$fn$;

-- 3.4 · reabrir_faltante_pedido (FARMACIA) — cuerpo vivo de la 0133.
create or replace function public.reabrir_faltante_pedido(p_item_id uuid)
returns void language plpgsql security definer set search_path = public as $fn$
declare
  v_item    public.pedido_medicacion_items%rowtype;
  v_anulado timestamptz;
begin
  -- 0142 · Alcance por estudio en Farmacia. Este RPC es SÓLO de Farmacia: la guarda es el alcance, sin
  -- excepciones. Va primero y no toca nada: a quien no está acotado pharma_sin_recorte() lo deja pasar
  -- antes de mirar una tabla, y el resto de la función corre igual que antes de esta migración.
  if not (
       public.pharma_alcanza_pedido((select it.pedido_id from public.pedido_medicacion_items it where it.id = p_item_id))) then
    raise exception 'No tenés acceso a este estudio.' using errcode = '42501';
  end if;

  if auth.uid() is null then raise exception 'No autenticado' using errcode = '42501'; end if;
  if not public.has_min_role('pharma', 'operator') then
    raise exception 'No tenés permiso para reabrir lo que falta de un pedido' using errcode = '42501';
  end if;

  select * into v_item from public.pedido_medicacion_items it where it.id = p_item_id for update;
  if not found then
    raise exception 'Ese renglón ya no está' using errcode = 'P0002';
  end if;
  -- for share: mismo criterio que cerrar_faltante_pedido (0128) — serializa contra anular_pedido_medicacion.
  select pe.anulado_at into v_anulado from public.pedidos_medicacion pe where pe.id = v_item.pedido_id for share;
  if v_anulado is not null then
    raise exception 'Ese pedido está anulado' using errcode = '23514';
  end if;
  if v_item.cerrado_at is null then
    raise exception 'Ese renglón no estaba cerrado' using errcode = '23514';
  end if;

  update public.pedido_medicacion_items it
     set cerrado_at = null, cerrado_por_nombre = null, cerrado_motivo = null
   where it.id = p_item_id;
end;
$fn$;

-- 3.5 · configurar_reposicion (FARMACIA) — cuerpo vivo de la 0125.
create or replace function public.configurar_reposicion(
  p_protocol_medication_id uuid,
  p_modo                   text,
  p_envases_por_mes        integer,
  p_stock_fijo             integer
)
returns void language plpgsql security definer set search_path = public as $fn$
begin
  -- 0142 · Alcance por estudio en Farmacia. Este RPC es SÓLO de Farmacia: la guarda es el alcance, sin
  -- excepciones. Va primero y no toca nada: a quien no está acotado pharma_sin_recorte() lo deja pasar
  -- antes de mirar una tabla, y el resto de la función corre igual que antes de esta migración.
  if not (
       public.pharma_alcanza_protocolo((select pmx.protocol_id from public.protocol_medications pmx where pmx.id = p_protocol_medication_id))) then
    raise exception 'No tenés acceso a este estudio.' using errcode = '42501';
  end if;

  if auth.uid() is null then raise exception 'No autenticado' using errcode = '42501'; end if;
  if not public.has_min_role('pharma', 'operator') then
    raise exception 'No tenés permiso para cambiar cómo se repone' using errcode = '42501';
  end if;
  if p_modo is not null and p_modo not in ('mensual', 'a_demanda', 'no_se_compra') then
    raise exception 'Modo de reposición inválido' using errcode = '22023';
  end if;

  update public.protocol_medications pmx
     set reposicion_modo = p_modo,
         envases_por_mes = case when p_modo = 'mensual' then p_envases_por_mes end,
         stock_fijo      = case when p_modo = 'a_demanda' then p_stock_fijo end
   where pmx.id = p_protocol_medication_id;
  if not found then
    raise exception 'Ese medicamento ya no está en el estudio' using errcode = 'P0002';
  end if;
end;
$fn$;

-- 3.6 · assign_medication_to_protocol (FARMACIA) — cuerpo vivo de la 0032.
create or replace function public.assign_medication_to_protocol(p_protocol_id uuid, p_medication_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  -- 0142 · Alcance por estudio en Farmacia. Este RPC es SÓLO de Farmacia: la guarda es el alcance, sin
  -- excepciones. Va primero y no toca nada: a quien no está acotado pharma_sin_recorte() lo deja pasar
  -- antes de mirar una tabla, y el resto de la función corre igual que antes de esta migración.
  if not (
       public.pharma_alcanza_protocolo(p_protocol_id)) then
    raise exception 'No tenés acceso a este estudio.' using errcode = '42501';
  end if;

  if not public.has_min_role('pharma','leader') then raise exception 'Sin permiso para asignar medicamentos a protocolos' using errcode = '42501'; end if;
  insert into public.protocol_medications (protocol_id, medication_id)
  values (p_protocol_id, p_medication_id)
  on conflict (protocol_id, medication_id) do nothing;
end;
$$;

-- 3.7 · list_protocol_coordinators (MIXTO) — cuerpo vivo de la 0038.
create or replace function public.list_protocol_coordinators(p_protocol_id uuid)
returns table (id uuid, full_name text)
language plpgsql security definer set search_path = public stable as $$
begin
  -- 0142 · Alcance por estudio en Farmacia. Este RPC autoriza también por gerencia: la guarda deja pasar
  -- ese camino —el mismo del chequeo de abajo— y sólo corta a quien entra únicamente por Farmacia a un
  -- estudio fuera de su alcance. Para quien no está acotado no cambia nada.
  if not (
       public.has_module('gerencia')
       or public.pharma_alcanza_protocolo(p_protocol_id)) then
    raise exception 'No tenés acceso a este estudio.' using errcode = '42501';
  end if;

  if not (public.has_module('pharma') or public.has_module('gerencia')) then
    raise exception 'Sin permiso' using errcode = '42501';
  end if;
  return query
    select u.id, u.full_name
      from public.protocol_coordinators pc
      join public.users u on u.id = pc.user_id
     where pc.protocol_id = p_protocol_id and u.is_active
     order by u.full_name;
end;
$$;

-- 3.8 · pedidos_por_recibir (FILTRO) — cuerpo vivo de la 0133.
create or replace function public.pedidos_por_recibir()
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare
  v_resultado jsonb;
begin
  if auth.uid() is null then raise exception 'No autenticado' using errcode = '42501'; end if;
  if not public.has_min_role('pharma', 'viewer') then
    raise exception 'No tenés permiso para ver los pedidos' using errcode = '42501';
  end if;

  with
  items as (
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
      join public.pedidos_medicacion pe on pe.id = it.pedido_id
      join public.medications m on m.id = it.medication_id
     where pe.anulado_at is null
       -- 0142 · alcance por estudio: TODO el resultado cuelga de este CTE (pedidos, estudios, renglones
       -- y recepciones salen de `items`), así que esta condición recorta todo lo demás.
       and public.pharma_alcanza_protocolo(pe.protocol_id)
  ),
  pedidos as (
    select pe.id, pe.numero, pe.protocol_id, pe.periodo_desde, pe.periodo_hasta, pe.emitido_el,
           pe.emitido_por_nombre, pe.anulado_at, pe.anulado_por_nombre, pe.anulado_motivo
      from public.pedidos_medicacion pe
     where exists (
       select 1 from items i
        where i.pedido_id = pe.id and i.cerrado_at is null and i.recibido < i.pedido)
  ),
  estudios as (
    select pr.id, pr.code, pr.name
      from public.protocols pr
     where pr.id in (select p.protocol_id from pedidos p)
  ),
  recepciones as (
    select mr.id, mr.pedido_id, mr.folio, mr.reception_date, mr.status::text as status, mr.verified_by_name,
           coalesce((select sum(ri.quantity) from public.reception_items ri where ri.reception_id = mr.id), 0)::integer as envases,
           coalesce((select array_agg(distinct ri.medication_id) from public.reception_items ri
                      where ri.reception_id = mr.id), '{}') as medication_ids
      from public.medication_receptions mr
     where mr.pedido_id in (select p.id from pedidos p)
       and mr.status in ('pendiente', 'verificada')
  )
  select jsonb_build_object(
    'estudios',     coalesce((select jsonb_agg(to_jsonb(x)) from estudios x), '[]'::jsonb),
    'pedidos',      coalesce((select jsonb_agg(to_jsonb(x)) from pedidos x), '[]'::jsonb),
    'pedido_items', coalesce((select jsonb_agg(to_jsonb(x)) from items x where x.pedido_id in (select p.id from pedidos p)), '[]'::jsonb),
    'recepciones',  coalesce((select jsonb_agg(to_jsonb(x)) from recepciones x), '[]'::jsonb)
  ) into v_resultado;

  return v_resultado;
end;
$fn$;

-- 3.9 · reposicion_del_periodo (FILTRO) — cuerpo vivo de la 0133.
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
       and mv.movement_type in ('dispensacion', 'devolucion')
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
             where mv.movement_type in ('dispensacion', 'devolucion') and mv.dia <= p_hasta), 0)::integer as salio,
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


-- 5 · Verificación del bucket (MIRARLA) ----------------------------------------------------------------
-- Va ÚLTIMA a propósito: el editor de Supabase muestra el resultado de la última sentencia.
-- Tiene que devolver EXACTAMENTE dos filas, "ip docs alta" e "ip docs lectura", las dos con
-- pharma_alcanza_archivo_ip en su expresión.
--   · Si aparece una fila más: es una policy del bucket creada a mano con otro nombre. En Postgres las
--     policies se combinan con OR, así que una vieja sin recorte seguiría abriendo todos los archivos.
--     Hay que borrarla —o recortarla igual— antes de acotar a nadie.
--   · Si "ip docs lectura" no dice pharma_alcanza_archivo_ip: el bloque de la sección 3 no pudo, y
--     hay que hacerlo desde Storage → Policies.
select policyname,
       cmd,
       (coalesce(qual, '') || coalesce(with_check, '')) like '%pharma_alcanza_archivo_ip%' as recortada
  from pg_policies
 where schemaname = 'storage' and tablename = 'objects'
   and (coalesce(qual, '') || coalesce(with_check, '')) like '%ip-docs%'
 order by policyname;
