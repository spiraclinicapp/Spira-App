-- ============================================================================
-- 0140 · Estudios en Farmacia, PR 2: el stock y la recepción
--
-- Plan: docs/plan-estudios-en-farmacia.md (PR 2). La base del recorte —la tabla, el interruptor y
-- las funciones pharma_alcanza_*— es de la 0139; este archivo sólo la usa.
--
-- ── QUÉ HACE ──
-- Lleva el recorte por estudio a los lotes, las recepciones y sus renglones, los movimientos de
-- stock, las unidades de IP y las salidas ambulatorias. Tres piezas:
--
--   1. La regla de lo que NO es de ningún estudio (D6, decisión del Director del 2026-09-21): el
--      stock ambulatorio —lotes y recepciones con protocol_id null, la medicación general de la
--      farmacia— lo ve TODO Farmacia, esté acotado o no. El recorte es por estudio, y eso no es de
--      ninguno. Se resuelve en la función madre y no policy por policy.
--   2. Trece policies, con la transformación de siempre: se SUMA el alcance a la condición que ya
--      tenían, nunca la reemplaza. Siete comprueban NIVEL (has_min_role) desde la 0009.
--   3. Guarda en los siete RPC security definer que ESCRIBEN sobre estas tablas. Saltean la RLS, así
--      que sin guarda alguien acotado podría ajustar, anular o trasladar stock de un estudio que no
--      ve. Cada cuerpo es el VIVO, copiado tal cual por script, más cuatro líneas al principio.
--
-- ── LO QUE QUEDA AFUERA A PROPÓSITO ──
--   · Las ocho vistas que leen estas tablas (v_medication_stock, v_medication_lots_detail, v_ip_stock,
--     v_ambulatory_dispensations, v_pharma_history y las tres v_pharma_report_*) son TODAS
--     security_invoker: heredan el recorte de las tablas sin tocarlas.
--   · Los RPC que sólo LEEN y también saltean la RLS: stock_de_la_visita, alternativas_sustitucion,
--     candidatos_otro (dispensaciones → PR 3) y pedidos_por_recibir, reposicion_del_periodo
--     (reposición → PR 4). Hasta esas PRs, por ahí se sigue viendo el stock de un estudio oculto:
--     es el recorte parcial de la regla operativa de abajo.
--   · Los tres triggers que escriben stock (apply_reception_stock, apply_dispensation_stock,
--     check_dispensation_item_protocol) no llevan guarda: corren adentro de un RPC ya guardado o de
--     una escritura directa que ya pasó por la RLS.
--   · "gerencia elimina lotes" y "gerencia borra IP": sólo gerencia, que no se recorta.
--
-- ── ADITIVA Y NO BREAKING ──
-- Mientras nadie esté acotado no cambia una sola fila ni una sola respuesta: pharma_sin_recorte()
-- devuelve true para todos y corta antes de mirar nada. El front no necesita cambios.
--
-- ⚠️ REGLA OPERATIVA, la misma de la 0139: NO acotar a nadie en prod hasta que esté aplicada la
-- migración de la PR 4.
--
-- APLICAR: a mano en el SQL Editor de Supabase (rol postgres), DESPUÉS de la 0139. IDEMPOTENTE.
-- Registrar en supabase/README.md al confirmarse en prod.
-- ============================================================================


-- 1 · Lo que no es de ningún estudio lo ve todo Farmacia (D6) ------------------------------------
-- Dos funciones de la 0139, con la MISMA firma (create or replace las reemplaza sin dejar sobrecargas)
-- y un único cambio cada una:
--
--   · pharma_alcanza_protocolo(null) pasa a dar true. Hoy ninguna policy le pasa un null: las de la
--     0139 lo llaman con protocols.id o enrollments.protocol_id, que nunca lo son. Los nulls llegan
--     recién con esta migración, por los lotes y las recepciones ambulatorias.
--   · pharma_alcanza_lote(null) también: un movimiento de stock sin lote (stock_movements.lot_id es
--     nullable, "ajuste_manual puede no tener lote", 0002) no se puede atribuir a ningún estudio.
--     Ojo que un id de lote INEXISTENTE sigue dando false para quien está acotado: null es "no hay
--     lote", un id inventado es otra cosa.
create or replace function public.pharma_alcanza_protocolo(proto_id uuid)
returns boolean language sql security definer stable
set search_path = pg_catalog, public as $fn$
  select public.pharma_sin_recorte()
      or proto_id is null
      or exists (
           select 1 from public.pharma_protocol_access a
            where a.user_id = auth.uid() and a.protocol_id = proto_id);
$fn$;

comment on function public.pharma_alcanza_protocolo is
  'Alcance por protocolo en Farmacia. NO comprueba el modulo ni el nivel: se SUMA a la condicion '
  'que la policy ya tenia, nunca la reemplaza. Lo que no es de ningun estudio (protocol_id null: '
  'el stock ambulatorio) lo alcanza todo Farmacia (D6, 0140). 0139, 0140.';

create or replace function public.pharma_alcanza_lote(p_lot_id uuid)
returns boolean language sql security definer stable
set search_path = pg_catalog, public as $fn$
  select public.pharma_sin_recorte()
      or p_lot_id is null
      or exists (
           select 1 from public.medication_lots l
            where l.id = p_lot_id and public.pharma_alcanza_protocolo(l.protocol_id));
$fn$;


-- 2 · El recorte: trece policies -------------------------------------------------------------------
-- `alter policy` y no drop + create: conserva el comando (select / insert / update / all) y los roles
-- de cada una tal como están, y sólo cambia la expresión. Cada expresión nueva es la VIVA —las de
-- escritura son las que dejó la 0009, que cambió has_module por has_min_role— más el alcance.
--
-- La cláusula de gerencia (y la de contable, módulo sin construir) queda AFUERA del and.

-- 2.1 · medication_lots — el alcance va por su propio protocol_id (null = ambulatoria = lo ve).
alter policy "ver lotes" on public.medication_lots
  using ((public.has_module('pharma') and public.pharma_alcanza_protocolo(protocol_id))
         or public.has_module('gerencia') or public.has_module('contable'));
alter policy "pharma inserta lotes" on public.medication_lots
  with check (public.has_min_role('pharma', 'operator') and public.pharma_alcanza_protocolo(protocol_id));
alter policy "pharma edita lotes" on public.medication_lots
  using      (public.has_min_role('pharma', 'operator') and public.pharma_alcanza_protocolo(protocol_id))
  with check (public.has_min_role('pharma', 'operator') and public.pharma_alcanza_protocolo(protocol_id));

-- 2.2 · medication_receptions — por su protocol_id (null sólo en las ambulatorias, CHECK de la 0035).
alter policy "ver recepciones" on public.medication_receptions
  using ((public.has_module('pharma') and public.pharma_alcanza_protocolo(protocol_id))
         or public.has_module('gerencia'));
alter policy "pharma administra recepciones" on public.medication_receptions
  using      (public.has_min_role('pharma', 'operator') and public.pharma_alcanza_protocolo(protocol_id))
  with check (public.has_min_role('pharma', 'operator') and public.pharma_alcanza_protocolo(protocol_id));

-- 2.3 · reception_items — por la recepción a la que pertenecen.
alter policy "ver items recepcion" on public.reception_items
  using ((public.has_module('pharma') and public.pharma_alcanza_recepcion(reception_id))
         or public.has_module('gerencia'));
alter policy "pharma administra items recepcion" on public.reception_items
  using      (public.has_min_role('pharma', 'operator') and public.pharma_alcanza_recepcion(reception_id))
  with check (public.has_min_role('pharma', 'operator') and public.pharma_alcanza_recepcion(reception_id));

-- 2.4 · stock_movements — por el lote (sin lote = no es de ningún estudio = lo ve).
alter policy "ver movimientos stock" on public.stock_movements
  using ((public.has_module('pharma') and public.pharma_alcanza_lote(lot_id))
         or public.has_module('contable') or public.has_module('gerencia'));
alter policy "pharma inserta movimientos" on public.stock_movements
  with check (public.has_min_role('pharma', 'operator') and public.pharma_alcanza_lote(lot_id));

-- 2.5 · ip_units — por su protocol_id (not null desde la 0037: el IP siempre es de un estudio).
alter policy "pharma/gerencia ven IP" on public.ip_units
  using ((public.has_module('pharma') and public.pharma_alcanza_protocolo(protocol_id))
         or public.has_module('gerencia'));
alter policy "pharma inserta IP" on public.ip_units
  with check (public.has_min_role('pharma', 'operator') and public.pharma_alcanza_protocolo(protocol_id));
alter policy "pharma edita IP" on public.ip_units
  using      (public.has_min_role('pharma', 'operator') and public.pharma_alcanza_protocolo(protocol_id))
  with check (public.has_min_role('pharma', 'operator') and public.pharma_alcanza_protocolo(protocol_id));

-- 2.6 · ambulatory_dispensations — por el lote del que salió.
alter policy "pharma ve las salidas ambulatorias" on public.ambulatory_dispensations
  using ((public.has_module('pharma') and public.pharma_alcanza_lote(lot_id))
         or public.has_module('gerencia'));


-- 3 · Las guardas de los siete RPC que escriben -----------------------------------------------------
-- Security definer: la RLS de arriba NO los alcanza. Cada uno se reemplaza con su cuerpo VIVO —el de
-- la migración que se nombra en su renglón—, copiado por script sin tocar una línea, más la guarda
-- insertada después del begin. `create or replace` con la firma idéntica: no quedan sobrecargas, y los
-- grants y los comentarios de cada función se conservan (van por el OID, que no cambia).
--
-- La guarda va PRIMERO, antes incluso del chequeo de nivel. Para quien no está acotado no cambia nada.
-- Para quien sí lo está, un id que no alcanza —de otro estudio, o inexistente— responde lo mismo, "No
-- tenés acceso a este estudio.": no revela si el lote o la recepción existen.
--
-- LA GUARDA NO EXCEPTÚA A GERENCIA, y es a propósito. Las policies de LECTURA sí la dejan afuera del
-- and —gerencia ve todo el centro—, pero ver no es operar: las de ESCRITURA sobre el stock nunca
-- tuvieron cláusula de gerencia (0006, 0009), y estos RPC piden nivel de Farmacia antes que nada.
-- Operar el stock es de Farmacia, y respeta el alcance de Farmacia. Sólo muerde a quien tiene las dos
-- cosas —gerencia y Farmacia acotada—, que no es un caso de uso sino, como mucho, una prueba.

-- 3.1 · adjust_stock — cuerpo vivo de la 0032, tal cual, más la guarda.
create or replace function public.adjust_stock(p_lot_id uuid, p_quantity_delta integer, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare v_med uuid; v_stock integer;
begin
  -- 0140 · Alcance por estudio en Farmacia. Va primero y no toca nada: a quien no está acotado
  -- (todo el mundo, mientras no se use el interruptor) pharma_sin_recorte() lo deja pasar antes de
  -- mirar una tabla, y el resto de la función corre exactamente igual que antes de esta migración.
  if not (public.pharma_alcanza_lote(p_lot_id)) then
    raise exception 'No tenés acceso a este estudio.' using errcode = '42501';
  end if;

  if not public.has_min_role('pharma','leader') then raise exception 'Sin permiso para ajustar stock' using errcode = '42501'; end if;
  if p_reason is null or btrim(p_reason) = '' then raise exception 'El ajuste manual requiere un motivo' using errcode = 'check_violation'; end if;
  select medication_id, quantity_on_hand into v_med, v_stock from public.medication_lots where id = p_lot_id for update;
  if v_med is null then raise exception 'Lote % inexistente', p_lot_id using errcode = 'foreign_key_violation'; end if;
  if v_stock + p_quantity_delta < 0 then
    raise exception 'El ajuste dejaría el stock por debajo de cero (% disponible, % ajuste)', v_stock, p_quantity_delta using errcode = 'check_violation';
  end if;
  update public.medication_lots set quantity_on_hand = quantity_on_hand + p_quantity_delta where id = p_lot_id;
  insert into public.stock_movements (medication_id, lot_id, movement_type, quantity_delta, reference_type, reason, created_by)
  values (v_med, p_lot_id, 'ajuste_manual', p_quantity_delta, 'ajuste_manual', p_reason, auth.uid());
end;
$$;

-- 3.2 · dispensar_ambulatoria — cuerpo vivo de la 0116, tal cual, más la guarda.
create or replace function public.dispensar_ambulatoria(
  p_lot_id             uuid,
  p_quantity           integer,
  p_recipient_name     text,
  p_recipient_document text,
  p_authorized_by      uuid,
  p_notes              text default null
) returns uuid
language plpgsql security definer
set search_path = pg_catalog, public as $fn$
declare
  v_med        uuid;
  v_protocol   uuid;
  v_disponible integer;
  v_autoriza   text;
  v_dispensa   text;
  v_id         uuid;
begin
  -- 0140 · Alcance por estudio en Farmacia. Va primero y no toca nada: a quien no está acotado
  -- (todo el mundo, mientras no se use el interruptor) pharma_sin_recorte() lo deja pasar antes de
  -- mirar una tabla, y el resto de la función corre exactamente igual que antes de esta migración.
  if not (public.pharma_alcanza_lote(p_lot_id)) then
    raise exception 'No tenés acceso a este estudio.' using errcode = '42501';
  end if;

  if auth.uid() is null then
    raise exception 'No autenticado' using errcode = '42501';
  end if;
  if not public.has_min_role('pharma', 'operator') then
    raise exception 'No tenés permiso para entregar medicación' using errcode = '42501';
  end if;
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'La cantidad tiene que ser mayor que cero' using errcode = 'check_violation';
  end if;
  if p_recipient_name is null or btrim(p_recipient_name) = '' then
    raise exception 'Poné el nombre de quien retira la medicación' using errcode = 'check_violation';
  end if;

  -- Quien autoriza tiene que ser una cuenta ACTIVA. El padrón que ve el front sólo ofrece activas
  -- (v_team_roster, 0109), pero el candado va donde no se puede saltear.
  select u.full_name into v_autoriza
    from public.users u
   where u.id = p_authorized_by and u.is_active;
  if v_autoriza is null then
    raise exception 'Quien autoriza no es una cuenta activa' using errcode = '23503';
  end if;

  select u.full_name into v_dispensa from public.users u where u.id = auth.uid();

  select ml.medication_id, ml.protocol_id, ml.quantity_on_hand
    into v_med, v_protocol, v_disponible
    from public.medication_lots ml
   where ml.id = p_lot_id
     for update;
  if not found then
    raise exception 'Ese lote no existe' using errcode = '23503';
  end if;

  -- El ámbito ambulatorio son los lotes con protocol_id NULL (0035). Entregar producto de un
  -- sponsor a alguien que no es su paciente sería un desvío: el candado va acá y no en la UI.
  if v_protocol is not null then
    raise exception 'Ese lote no es de la farmacia ambulatoria' using errcode = 'check_violation';
  end if;
  if v_disponible < p_quantity then
    raise exception 'Stock insuficiente en el lote (% disponible, % requerido)',
      v_disponible, p_quantity using errcode = 'check_violation';
  end if;

  insert into public.ambulatory_dispensations
      (medication_id, lot_id, quantity, recipient_name, recipient_document,
       authorized_by, authorized_by_name, dispensed_by, dispensed_by_name, notes)
    values
      (v_med, p_lot_id, p_quantity, btrim(p_recipient_name),
       nullif(btrim(coalesce(p_recipient_document, '')), ''),
       p_authorized_by, v_autoriza, auth.uid(), coalesce(v_dispensa, 'Farmacia'),
       nullif(btrim(coalesce(p_notes, '')), ''))
    returning id into v_id;

  update public.medication_lots
     set quantity_on_hand = quantity_on_hand - p_quantity,
         updated_at = now()
   where id = p_lot_id;

  -- quantity_delta NEGATIVO: es una salida. Si quedara positivo, una entrega SUMARÍA stock y el
  -- inventario se iría inflando sin que nada se viera mal en pantalla. No hay test de vitest que
  -- cubra esto (el proyecto no puede testear su propio SQL): se verifica en el QA.
  insert into public.stock_movements
      (medication_id, lot_id, movement_type, quantity_delta,
       reference_id, reference_type, reason, created_by)
    values
      (v_med, p_lot_id, 'dispensacion', -p_quantity,
       v_id, 'ambulatoria', 'Entrega ambulatoria a ' || btrim(p_recipient_name), auth.uid());

  return v_id;
end; $fn$;

-- 3.3 · reassign_lot_stock — cuerpo vivo de la 0113, tal cual, más la guarda.
create or replace function public.reassign_lot_stock(
  p_lot_id                 uuid,
  p_destino_tipo           public.reception_kind,
  p_destino_protocol_id    uuid,
  p_quantity               integer,
  p_reason                 text)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_med          uuid;
  v_tipo         reception_kind;
  v_protocol     uuid;
  v_lot_number   text;
  v_expiry       date;
  v_stock        integer;
  v_destino_lot  uuid;
  v_destino_tipo reception_kind;
  v_destino_st   protocol_status;
  -- gen_random_uuid() y NO uuid_generate_v4(), aunque el resto del schema use uuid-ossp: aquéllas
  -- son todas `default` de columna, que Postgres resuelve al hacer el DDL y guarda por OID, así que
  -- andan con cualquier search_path. Ésta es la primera llamada en RUNTIME, y esta función fija
  -- `set search_path = public` mientras las extensiones de Supabase viven en el schema
  -- `extensions`: sin calificar, la 0113 aplicaría EN VERDE (plpgsql no resuelve las llamadas al
  -- crear el cuerpo) y reventaría recién en la primera reasignación con `42883`, que
  -- pharmaErrorMessage traduce a "falta aplicar una actualización de la base" — mandando a buscar
  -- una migración que ya se aplicó. gen_random_uuid() está en pg_catalog desde PG13 y resuelve
  -- siempre, sin atar el archivo a dónde quedó instalada ninguna extensión.
  v_ref          uuid := gen_random_uuid();
  it             record;
begin
  -- 0140 · Alcance por estudio en Farmacia. Va primero y no toca nada: a quien no está acotado
  -- (todo el mundo, mientras no se use el interruptor) pharma_sin_recorte() lo deja pasar antes de
  -- mirar una tabla, y el resto de la función corre exactamente igual que antes de esta migración.
  if not (public.pharma_alcanza_lote(p_lot_id)
     and public.pharma_alcanza_protocolo(p_destino_protocol_id)) then
    raise exception 'No tenés acceso a este estudio.' using errcode = '42501';
  end if;

  if not public.has_min_role('pharma','leader') then
    raise exception 'Sin permiso para reasignar stock' using errcode = '42501';
  end if;

  -- Mismo criterio que adjust_stock (0032) y void_reception (0087): sin motivo no hay traslado.
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'La reasignación requiere un motivo' using errcode = 'check_violation';
  end if;

  if p_quantity is null or p_quantity <= 0 then
    raise exception 'La cantidad a reasignar tiene que ser mayor que cero' using errcode = 'check_violation';
  end if;

  -- El par tipo/protocolo, con el mismo cruce que create_reception (0035): es el CHECK
  -- medication_lots_tipo_protocol_chk expresado antes de tocar nada, para que el error sea una
  -- frase y no la violación cruda de una constraint.
  if (p_destino_tipo = 'ambulatoria') <> (p_destino_protocol_id is null) then
    raise exception 'El destino % es incompatible con el protocolo indicado', p_destino_tipo
      using errcode = 'check_violation';
  end if;

  if p_destino_tipo = 'investigacion' then
    raise exception 'El producto de investigación no se lleva por lotes: su stock sale de las recepciones. No hay lote que reasignar.'
      using errcode = 'check_violation';
  end if;

  -- Los campos que identifican al lote (medicamento, número, ámbito) no los cambia nadie: sólo se
  -- escriben quantity_on_hand y expiry_date. Por eso se pueden leer sin lock para saber QUÉ dos
  -- filas hay que bloquear; la cantidad se vuelve a leer más abajo, ya con el lock puesto.
  select l.medication_id, l.tipo, l.protocol_id, l.lot_number, l.expiry_date
    into v_med, v_tipo, v_protocol, v_lot_number, v_expiry
    from public.medication_lots l
   where l.id = p_lot_id;

  if v_med is null then
    raise exception 'El lote que querés reasignar ya no existe' using errcode = 'check_violation';
  end if;

  if v_tipo = 'investigacion' then
    raise exception 'El lote % es de investigación y no se reasigna por esta vía', v_lot_number
      using errcode = 'check_violation';
  end if;

  -- `is not distinct from` y no `=`: en ambulatoria los dos lados son NULL y `NULL = NULL` nunca
  -- es true, así que con `=` un traslado de Ambulatoria a Ambulatoria pasaría el guard, no movería
  -- una sola unidad y escribiría igual los dos asientos.
  if p_destino_protocol_id is not distinct from v_protocol then
    raise exception 'El lote % ya está en ese ámbito: elegí otro destino', v_lot_number
      using errcode = 'check_violation';
  end if;

  if p_destino_protocol_id is not null then
    select p.status into v_destino_st from public.protocols p where p.id = p_destino_protocol_id;
    if v_destino_st is null then
      raise exception 'El protocolo de destino no existe' using errcode = 'check_violation';
    end if;
    -- 'pausado' NO se bloquea: es un estudio vivo que está detenido, y mover medicación a él es
    -- exactamente lo que se hace cuando se reanuda. 'cerrado' sí: dejar entrar medicación a un
    -- estudio cerrado es un hallazgo de auditoría, no un descuido de la pantalla.
    if v_destino_st = 'cerrado' then
      raise exception 'El protocolo de destino está cerrado: no se le puede asignar medicación'
        using errcode = 'check_violation';
    end if;
  end if;

  -- LOCKS EN ORDEN DETERMINÍSTICO POR id. Son a lo sumo dos filas —el lote origen y el destino, si
  -- ya existe— y dos reasignaciones cruzadas (A→B y B→A a la vez) las tomarían en orden opuesto y
  -- deadlockearían. Se bloquean de a una, en el orden que impone el ORDER BY, que es el mismo
  -- recurso que usa void_reception (0088) en sus dos pasadas.
  for it in
    select l.id
      from public.medication_lots l
     where l.id = p_lot_id
        or (l.medication_id = v_med
            and l.lot_number = v_lot_number
            and l.protocol_id is not distinct from p_destino_protocol_id)
     order by l.id
  loop
    perform 1 from public.medication_lots where id = it.id for update;
  end loop;

  -- Recién ahora, con el lock puesto, la cantidad significa algo.
  select l.quantity_on_hand into v_stock from public.medication_lots l where l.id = p_lot_id;

  if v_stock < p_quantity then
    raise exception 'No se puede reasignar: del lote % quedan % unidades y estás moviendo %.',
      v_lot_number, v_stock, p_quantity using errcode = 'check_violation';
  end if;

  -- Asignar es CONSECUENCIA de mover, no un gate previo (misma decisión que la 0040 tomó para
  -- recibir). Si el medicamento no estaba en la allow-list del destino, se asocia acá.
  if p_destino_protocol_id is not null then
    insert into public.protocol_medications (protocol_id, medication_id)
    values (p_destino_protocol_id, v_med)
    on conflict (protocol_id, medication_id) do nothing;
  end if;

  update public.medication_lots
     set quantity_on_hand = quantity_on_hand - p_quantity,
         updated_at       = now()
   where id = p_lot_id;

  -- Un lote destino que existe y es de OTRO ámbito no se toca. El unique de la 0032 es
  -- (medication_id, protocol_id, lot_number) y no incluye el `tipo`, así que una fila legacy con
  -- tipo 'investigacion' ocuparía la misma clave: el upsert de abajo le sumaría las unidades y las
  -- dejaría dentro de un lote rotulado como IP, en silencio. Se corta acá con una frase.
  select l.tipo into v_destino_tipo
    from public.medication_lots l
   where l.medication_id = v_med
     and l.lot_number = v_lot_number
     and l.protocol_id is not distinct from p_destino_protocol_id;

  if v_destino_tipo is not null and v_destino_tipo <> p_destino_tipo then
    raise exception 'En el destino ya hay un lote % de tipo % y no se le pueden sumar unidades de tipo %',
      v_lot_number, v_destino_tipo, p_destino_tipo using errcode = 'check_violation';
  end if;

  -- UPSERT y no "buscar y después insertar": el loop de locks de arriba sólo puede bloquear filas
  -- que YA existen, así que cuando el lote destino todavía no existe nada impide que otra escritura
  -- concurrente —otra reasignación, o la verificación de una recepción con ese mismo lote— lo cree
  -- en el medio. Con SELECT+INSERT las dos verían "no existe" y la segunda moriría con `23505`, que
  -- pharmaErrorMessage muestra como "código o lote repetido": un mensaje sobre códigos en una
  -- pantalla donde no se cargó ninguno, y el traslado sin hacer. El índice resuelve la carrera, que
  -- es exactamente cómo la resuelve `apply_reception_stock` (0035 §4, 0040 §1).
  --
  -- Las dos ramas existen porque los índices son distintos: con protocolo manda el unique
  -- medication_lots_med_proto_lot_key (0032), y en ambulatoria el parcial
  -- medication_lots_ambulatoria_lot_key (0035), que los NULL del unique no cubren.
  --
  -- El `tipo` se escribe LITERAL desde el parámetro, no se deduce del protocol_id: el CHECK de la
  -- 0035 ata los dos campos y un `case` que "calcula" el tipo es la clase de astucia que sobrevive
  -- hasta el día que aparezca un cuarto ámbito. Y el vencimiento sigue el mismo criterio que la
  -- recepción: el lote destino conserva el suyo y sólo lo toma del origen si no tenía ninguno.
  if p_destino_protocol_id is not null then
    insert into public.medication_lots
      (medication_id, protocol_id, tipo, lot_number, expiry_date, quantity_on_hand)
    values
      (v_med, p_destino_protocol_id, 'protocolo', v_lot_number, v_expiry, p_quantity)
    on conflict (medication_id, protocol_id, lot_number) do update
      set quantity_on_hand = medication_lots.quantity_on_hand + excluded.quantity_on_hand,
          expiry_date      = coalesce(medication_lots.expiry_date, excluded.expiry_date),
          updated_at       = now()
    returning id into v_destino_lot;
  else
    insert into public.medication_lots
      (medication_id, protocol_id, tipo, lot_number, expiry_date, quantity_on_hand)
    values
      (v_med, null, 'ambulatoria', v_lot_number, v_expiry, p_quantity)
    on conflict (medication_id, lot_number) where protocol_id is null do update
      set quantity_on_hand = medication_lots.quantity_on_hand + excluded.quantity_on_hand,
          expiry_date      = coalesce(medication_lots.expiry_date, excluded.expiry_date),
          updated_at       = now()
    returning id into v_destino_lot;
  end if;

  -- Los DOS asientos, con el mismo reference_id: es lo único que los vuelve una transferencia y
  -- no dos ajustes sueltos.
  insert into public.stock_movements
    (medication_id, lot_id, movement_type, quantity_delta,
     reference_id, reference_type, reason, created_by)
  values
    (v_med, p_lot_id,       'reasignacion', -p_quantity, v_ref, 'reasignacion', p_reason, auth.uid()),
    (v_med, v_destino_lot,  'reasignacion',  p_quantity, v_ref, 'reasignacion', p_reason, auth.uid());
end;
$fn$;

-- 3.4 · create_reception — cuerpo vivo de la 0128, tal cual, más la guarda.
create or replace function public.create_reception(
  p_tipo           public.reception_kind,
  p_protocol_id    uuid,
  p_reception_date date,
  p_notes          text,
  p_items          jsonb,
  p_pedido_id      uuid default null
)
returns uuid language plpgsql security definer set search_path = public as $fn$
declare
  v_id   uuid;
  v_item jsonb;
begin
  -- 0140 · Alcance por estudio en Farmacia. Va primero y no toca nada: a quien no está acotado
  -- (todo el mundo, mientras no se use el interruptor) pharma_sin_recorte() lo deja pasar antes de
  -- mirar una tabla, y el resto de la función corre exactamente igual que antes de esta migración.
  if not (public.pharma_alcanza_protocolo(p_protocol_id)) then
    raise exception 'No tenés acceso a este estudio.' using errcode = '42501';
  end if;

  if not public.has_min_role('pharma','leader') then raise exception 'Sin permiso para crear recepciones' using errcode = '42501'; end if;
  if (p_tipo = 'ambulatoria') <> (p_protocol_id is null) then
    raise exception 'El tipo % es incompatible con el protocolo indicado', p_tipo using errcode = 'check_violation';
  end if;

  insert into public.medication_receptions (tipo, protocol_id, received_by, reception_date, status, notes, pedido_id)
  values (p_tipo, p_protocol_id, auth.uid(), p_reception_date, 'pendiente', p_notes, p_pedido_id)
  returning id into v_id;
  for v_item in select * from jsonb_array_elements(p_items) loop
    -- Asignación = consecuencia de recibir (0040): si no estaba asociado, se asocia acá.
    -- Ambulatoria (protocol_id null) no asocia.
    if p_protocol_id is not null then
      insert into public.protocol_medications (protocol_id, medication_id)
      values (p_protocol_id, (v_item->>'medication_id')::uuid)
      on conflict (protocol_id, medication_id) do nothing;
    end if;
    insert into public.reception_items (reception_id, medication_id, lot_number, expiry_date, quantity)
    values (v_id, (v_item->>'medication_id')::uuid, v_item->>'lot_number',
            nullif(v_item->>'expiry_date','')::date, (v_item->>'quantity')::integer);
  end loop;
  return v_id;
end;
$fn$;

-- 3.5 · create_ip_reception — cuerpo vivo de la 0039, tal cual, más la guarda.
create or replace function public.create_ip_reception(
  p_protocol_id     uuid,
  p_coordinator_id  uuid,
  p_reception_date  date,
  p_total_kits      integer,
  p_kit_range_from  text,
  p_kit_range_to    text,
  p_storage_location text,
  p_started_at      timestamptz,
  p_notes           text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  -- 0140 · Alcance por estudio en Farmacia. Va primero y no toca nada: a quien no está acotado
  -- (todo el mundo, mientras no se use el interruptor) pharma_sin_recorte() lo deja pasar antes de
  -- mirar una tabla, y el resto de la función corre exactamente igual que antes de esta migración.
  if not (public.pharma_alcanza_protocolo(p_protocol_id)) then
    raise exception 'No tenés acceso a este estudio.' using errcode = '42501';
  end if;

  if not public.has_min_role('pharma','leader') then
    raise exception 'Sin permiso para crear recepciones de investigación' using errcode = '42501';
  end if;
  if p_protocol_id is null then
    raise exception 'El Producto de Investigación requiere un protocolo' using errcode = 'check_violation';
  end if;
  if p_total_kits is null or p_total_kits <= 0 then
    raise exception 'La cantidad total de kits debe ser mayor a cero' using errcode = 'check_violation';
  end if;
  if p_storage_location is null or p_storage_location not in ('heladera','ambiente') then
    raise exception 'Ubicación de almacenamiento inválida' using errcode = 'check_violation';
  end if;

  insert into public.medication_receptions (
    tipo, protocol_id, received_by, reception_date, status, verified_by, verified_at, notes,
    coordinator_id, temperature_ok, total_kits, kit_range_from, kit_range_to,
    storage_location, docs_signed, irt_notified, started_at)
  values (
    'investigacion', p_protocol_id, auth.uid(), p_reception_date, 'verificada', auth.uid(), now(), p_notes,
    p_coordinator_id, true, p_total_kits,
    nullif(btrim(coalesce(p_kit_range_from,'')),''), nullif(btrim(coalesce(p_kit_range_to,'')),''),
    p_storage_location, true, true, coalesce(p_started_at, now()))
  returning id into v_id;

  return v_id;
end;
$$;

-- 3.6 · verify_reception — cuerpo vivo de la 0085, tal cual, más la guarda.
create or replace function public.verify_reception(p_reception_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_status reception_status;
  v_name   text;
begin
  -- 0140 · Alcance por estudio en Farmacia. Va primero y no toca nada: a quien no está acotado
  -- (todo el mundo, mientras no se use el interruptor) pharma_sin_recorte() lo deja pasar antes de
  -- mirar una tabla, y el resto de la función corre exactamente igual que antes de esta migración.
  if not (public.pharma_alcanza_recepcion(p_reception_id)) then
    raise exception 'No tenés acceso a este estudio.' using errcode = '42501';
  end if;

  if not public.has_min_role('pharma','leader') then
    raise exception 'Sin permiso para verificar recepciones' using errcode = '42501';
  end if;

  select r.status into v_status
    from public.medication_receptions r
   where r.id = p_reception_id
     for update;

  if v_status is null then
    raise exception 'Recepción % inexistente', p_reception_id using errcode = 'foreign_key_violation';
  end if;
  if v_status <> 'pendiente' then
    raise exception 'La recepción % no está pendiente (está %)', p_reception_id, v_status
      using errcode = 'check_violation';
  end if;

  -- El que verifica es siempre el usuario actual (el trigger sella verified_by con auth.uid()),
  -- así que alcanza con resolver su propio nombre. Columnas calificadas: en plpgsql un nombre
  -- suelto puede resolverse contra una variable en vez de contra la columna (trampas 0056/0058).
  select u.full_name into v_name
    from public.users u
   where u.id = auth.uid();

  update public.medication_receptions
     set status           = 'verificada',
         verified_by_name = v_name
   where id = p_reception_id;
  -- los triggers set_reception_verified (sella verified_by/verified_at) + apply_reception_stock
  -- (ingresa el stock) hacen el resto, igual que antes
end;
$$;

-- 3.7 · void_reception — cuerpo vivo de la 0113, tal cual, más la guarda.
create or replace function public.void_reception(p_reception_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $fn$
declare
  v_status    reception_status;
  v_tipo      reception_kind;
  v_protocol  uuid;
  v_kits      integer;
  v_recibido  integer;
  v_entregado integer;
  v_lot_id    uuid;
  v_en_lote   integer;
  v_name      text;
  it          record;
begin
  -- 0140 · Alcance por estudio en Farmacia. Va primero y no toca nada: a quien no está acotado
  -- (todo el mundo, mientras no se use el interruptor) pharma_sin_recorte() lo deja pasar antes de
  -- mirar una tabla, y el resto de la función corre exactamente igual que antes de esta migración.
  if not (public.pharma_alcanza_recepcion(p_reception_id)) then
    raise exception 'No tenés acceso a este estudio.' using errcode = '42501';
  end if;

  if not public.has_min_role('pharma','leader') then
    raise exception 'Sin permiso para anular recepciones' using errcode = '42501';
  end if;

  -- Mismo criterio que adjust_stock (0032): sin motivo no hay anulación.
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'La anulación requiere un motivo' using errcode = 'check_violation';
  end if;

  -- FOR UPDATE: lock anti-carrera con una verificación simultánea sobre la misma recepción.
  select r.status, r.tipo, r.protocol_id, r.total_kits
    into v_status, v_tipo, v_protocol, v_kits
    from public.medication_receptions r
   where r.id = p_reception_id
     for update;

  if v_status is null then
    raise exception 'Recepción % inexistente', p_reception_id using errcode = 'foreign_key_violation';
  end if;
  if v_status = 'anulada' then
    raise exception 'La recepción % ya está anulada', p_reception_id using errcode = 'check_violation';
  end if;

  -- Una PENDIENTE nunca tocó stock: se saltea todo esto y sólo se sella al final.
  if v_status = 'verificada' then

    if v_tipo = 'investigacion' then
      -- ── Rama IP ──────────────────────────────────────────────────────────────
      -- La rama se elige por TIPO y no por `total_kits is not null` a propósito: las recepciones
      -- IP viejas (modelo por-unidad, anterior a la 0038) tienen total_kits NULL y tampoco
      -- ingresaron nunca a medication_lots — la rama IP del trigger apply_reception_stock (0037)
      -- retorna temprano. Mandarlas al loop de renglones las haría fallar buscando lotes que no
      -- existen. Sin kits que descontar, anularlas es sólo cambiar el estado.
      if v_kits is not null then
        -- Las dos mitades de v_ip_stock (0071 §10), replicadas acá porque la vista es
        -- security_invoker y agrega POR PROTOCOLO, no por recepción.
        select coalesce(sum(r.total_kits), 0) into v_recibido
          from public.medication_receptions r
         where r.protocol_id = v_protocol and r.tipo = 'investigacion'
           and r.status = 'verificada' and r.total_kits is not null;

        select coalesce(sum(d.ip_kits), 0) into v_entregado
          from public.dispensations d
          join public.dispensation_requests dr on dr.id = d.request_id
         where dr.protocol_id = v_protocol and d.ip_kits is not null and d.status = 'entregada';

        if v_recibido - v_entregado < v_kits then
          -- 0088: la primera oración —los números— no se toca; la segunda ya no dice "ya se
          -- dispensaron kits que dependen de ella" porque la cuenta es por PROTOCOLO (v_ip_stock,
          -- 0071 §10), no por recepción: el faltante puede ser de una entrega, pero también de
          -- kits que salieron por otra recepción del mismo protocolo. Atribuir "dispensaron" es
          -- inventar una causa que la función no verificó.
          raise exception
            'No se puede anular: al protocolo le quedan % kits disponibles y esta recepción ingresó %. Puede haber salidas posteriores de kits del protocolo (entregas o kits de otras recepciones).',
            v_recibido - v_entregado, v_kits using errcode = 'check_violation';
        end if;
      end if;

    else
      -- ── Rama base (protocolo / ambulatoria) ─────────────────────────────────
      -- PASADA 1 · validar TODOS los renglones antes de mover un solo número.
      -- El lote se ubica por (medication_id, protocol_id, lot_number) porque reception_items no
      -- guarda lot_id. Ésa es la clave real desde la 0032 (medication_lots_med_proto_lot_key,
      -- 0032:74) — NO (medication_id, lot_number) como decía este comentario antes: ese unique lo
      -- dropeó la misma 0032 al volver global el catálogo (0032:55-68), así que hoy el mismo
      -- medicamento con el mismo lote de fábrica tiene UNA FILA POR PROTOCOLO. Para la rama
      -- ambulatoria hay además un índice único parcial aparte, medication_lots_ambulatoria_lot_key
      -- (0035:38), sobre (medication_id, lot_number) where protocol_id is null.
      -- `is not distinct from` y no `=`: en ambulatoria v_protocol es NULL y sus lotes tienen
      -- protocol_id is null; `= NULL` nunca matchea y dejaría el lote sin encontrar. No lo
      -- "simplifiques" a `=` — es exactamente el tipo de prolijidad que rompe la ambulatoria.
      -- El FOR UPDATE de acá sostiene el lock hasta el fin de la transacción, así que la pasada 2
      -- opera sobre lo mismo que se validó. El ORDER BY es orden determinístico de locks: sin él,
      -- dos anulaciones concurrentes que compartan lotes podrían tomarlos en orden distinto y
      -- deadlockear.
      for it in
        select i.medication_id, i.lot_number, i.quantity
          from public.reception_items i
         where i.reception_id = p_reception_id
         order by i.medication_id, i.lot_number
      loop
        select l.id, l.quantity_on_hand into v_lot_id, v_en_lote
          from public.medication_lots l
         where l.medication_id = it.medication_id and l.lot_number = it.lot_number
           and l.protocol_id is not distinct from v_protocol
           for update;

        if v_lot_id is null then
          -- 0088: errcode check_violation (23514) y no foreign_key_violation (23503) — no hay
          -- ninguna FK rota, hay un estado de la base que no permite la operación, y además
          -- pharmaErrorMessage (src/data/pharma/errors.ts) traduce 23503 a un genérico fijo que
          -- se come el número de lote; 23514 deja pasar este texto tal cual.
          raise exception 'El lote % ya no existe: no se puede revertir su ingreso', it.lot_number
            using errcode = 'check_violation';
        end if;
        if v_en_lote < it.quantity then
          -- 0088: misma lógica que la rama IP de arriba — la primera oración (los números) queda
          -- igual, la atribución ya no afirma "ya se dispensaron": el faltante puede venir de un
          -- adjust_stock negativo (0032) o de otra recepción anulada antes, no sólo de una
          -- dispensación.
          -- 0113: y ahora hay una tercera, la reasignación a otro ámbito, que es la más
          -- confusa de las tres porque el stock no se gastó: está en otro estante.
          raise exception
            'No se puede anular: del lote % quedan % unidades y esta recepción ingresó %. Puede haber salidas posteriores de ese lote (dispensaciones, ajustes o reasignaciones a otro ámbito).',
            it.lot_number, v_en_lote, it.quantity using errcode = 'check_violation';
        end if;
      end loop;

      -- PASADA 2 · aplicar. Mismo ORDER BY que la pasada 1 (locks en la misma secuencia) y misma
      -- condición de protocolo que la pasada 1 (ver comentario ahí) — se opera sobre el mismo lote
      -- que se validó.
      for it in
        select i.medication_id, i.lot_number, i.quantity
          from public.reception_items i
         where i.reception_id = p_reception_id
         order by i.medication_id, i.lot_number
      loop
        select l.id into v_lot_id
          from public.medication_lots l
         where l.medication_id = it.medication_id and l.lot_number = it.lot_number
           and l.protocol_id is not distinct from v_protocol;

        update public.medication_lots l
           set quantity_on_hand = l.quantity_on_hand - it.quantity,
               updated_at       = now()
         where l.id = v_lot_id;

        -- reference_type 'reception' + reference_id ya estaban permitidos por el check de la tabla
        -- (0002:335): el vínculo con la recepción, que es lo que hoy falta, no necesita ninguna
        -- columna nueva.
        insert into public.stock_movements
          (medication_id, lot_id, movement_type, quantity_delta,
           reference_id, reference_type, reason, created_by)
        values
          (it.medication_id, v_lot_id, 'anulacion_recepcion', -it.quantity,
           p_reception_id, 'reception', p_reason, auth.uid());
      end loop;
    end if;
  end if;

  -- El que anula es siempre el usuario actual, así que alcanza con resolver su propio nombre.
  select u.full_name into v_name
    from public.users u
   where u.id = auth.uid();

  update public.medication_receptions
     set status         = 'anulada',
         voided_at      = now(),
         voided_by      = auth.uid(),
         voided_by_name = v_name,
         void_reason    = p_reason
   where id = p_reception_id;
end;
$fn$;


notify pgrst, 'reload schema';
