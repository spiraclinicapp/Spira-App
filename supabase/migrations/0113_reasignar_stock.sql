-- ============================================================================
-- 0113 — Stock: reasignar unidades de un lote a otro protocolo o a Ambulatoria
--
-- Hoy el stock entra por recepción y sale por dispensación o por adjust_stock. NO hay forma de
-- moverlo entre ámbitos: si llegó medicación a un estudio y hay que pasarla a otro (o al ámbito
-- ambulatorio), el único camino era un ajuste negativo acá y uno positivo allá, dos operaciones
-- sin relación entre sí que en el libro parecen una pérdida y una ganancia.
-- Ver docs/plan-reasignar-stock.md.
--
-- LO QUE NO SE HACE, Y ES LO IMPORTANTE (D del plan §"La regla dura"): NO se mueve la FILA del
-- lote con un `update medication_lots set protocol_id`. Eso corrompe la trazabilidad por tres
-- vías independientes:
--   1. check_dispensation_item_protocol (0032) garantiza AL INSERTAR que el protocolo del lote es
--      el de la dispensación. Mutar la fila rompe esa invariante para todas las filas históricas,
--      en silencio, sin que ningún trigger se entere.
--   2. void_reception (0087/0088) ubica el lote por (medication_id, lot_number, protocol_id de la
--      recepción). Movida la fila, la anulación falla con "El lote ya no existe", que es falso.
--   3. Un movimiento PARCIAL es imposible por definición con un update de fila.
-- En su lugar va el DOBLE ASIENTO: se descuenta del lote origen, se suma (o se crea) el lote
-- destino con el mismo número de lote y vencimiento, y se escriben DOS stock_movements con el
-- MISMO reference_id. La fila origen se queda para siempre, aunque quede en cero: es la que
-- sostiene el historial.
--
-- EL reference_id COMPARTIDO no es FK de nada (la columna nunca lo fue, 0002:334) y es lo que
-- hace que los dos asientos sean UN hecho. Sin él, reconstruir la transferencia obliga a machear
-- por hora + cantidad + texto del motivo.
--
-- INVESTIGACIÓN QUEDA AFUERA, y es estructural: desde la 0038 el IP se lleva MACRO por cantidad,
-- agregado desde las recepciones verificadas en v_ip_stock, y NO vive en medication_lots. No hay
-- lote que mover. El RPC lo rechaza con su nombre en vez de fallar por un camino raro.
--
-- ASIGNAR ES CONSECUENCIA DE MOVER, igual que la 0040 hizo con recibir: si el medicamento no
-- estaba en protocol_medications del destino, se asocia acá en vez de rechazar.
--
-- PERMISO: pharma leader+, el mismo que ajusta stock (0032) y el mismo que anula (0087). El
-- control es el registro (quién, cuándo, por qué), no el rango.
--
-- ⚠️ Recordatorio heredado de la 0071/0072/0073: NUNCA escribir dos signos peso pegados dentro de
--    un comentario de este archivo. El editor SQL de Supabase rastrea el dollar-quoting SIN
--    ignorar los comentarios, así que uno suelto le invierte la paridad, deja de reconocer los
--    cuerpos de función y los parte por sus punto y coma internos, con un error desconcertante y
--    lejanísimo del comentario culpable.
--
-- No agrega columnas ni toca ningún select del front, y void_reception conserva su firma
-- (p_reception_id uuid, p_reason text) — create or replace NO reemplaza si la firma cambia:
-- dejaría una sobrecarga vieja viva y silenciosa, la trampa de la 0056/0058. No es breaking.
--
-- APLICAR A MANO en el SQL Editor de Supabase (rol postgres), DESPUÉS de la 0112 (que crea el
-- valor de enum que este archivo usa). IDEMPOTENTE. Registrar en supabase/README.md al
-- confirmarse aplicada.
-- ============================================================================


-- 1 · stock_movements.reference_type acepta 'reasignacion' -----------------------------------
-- El check vive inline en la columna desde la 0002 (0002:334-335), así que Postgres le puso un
-- nombre autogenerado y no se adivina: se barre CUALQUIER check de la tabla cuya definición
-- mencione `reference_type`, que es el patrón de la 0097/0105/0106. Dropear por un nombre que no
-- coincide dejaría vivo el viejo, la migración pasaría "con éxito" y el valor nuevo seguiría
-- rebotando. El barrido es además lo que hace repetible al `add constraint` de abajo: se lleva
-- puesto el que creó la corrida anterior.
do $migracion$
declare
  c record;
begin
  for c in
    select con.conname
      from pg_constraint con
      join pg_class     rel on rel.oid = con.conrelid
      join pg_namespace ns  on ns.oid  = rel.relnamespace
     where ns.nspname  = 'public'
       and rel.relname = 'stock_movements'
       and con.contype = 'c'
       and pg_get_constraintdef(con.oid) ilike '%reference_type%'
  loop
    execute format('alter table public.stock_movements drop constraint %I', c.conname);
  end loop;
end
$migracion$;

alter table public.stock_movements
  add constraint stock_movements_reference_type_valido
  check (reference_type is null or reference_type in
         ('reception', 'dispensation', 'ajuste_manual', 'devolucion', 'vencimiento', 'reasignacion'));

comment on column public.stock_movements.reference_type is
  'Qué originó el movimiento: reception | dispensation | ajuste_manual | devolucion | vencimiento | reasignacion. En una reasignación, reference_id NO apunta a una entidad: es un uuid propio que comparten los dos asientos (salida y entrada) para que se lean como una sola transferencia. 0002, ampliado en 0113.';


-- 2 · reassign_lot_stock — el doble asiento ---------------------------------------------------
-- El destino viaja en DOS parámetros y se cruzan entre sí, igual que create_reception (0035 §5):
-- el tipo dice el ámbito y el protocolo lo acompaña. Con un solo `p_destino_protocol_id` nullable
-- no habría cómo distinguir "mové a Ambulatoria" de "me olvidé de mandar el protocolo", y la
-- diferencia entre esas dos es un lote entero en el estante equivocado.
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
  v_destino_st   protocol_status;
  v_ref          uuid := uuid_generate_v4();
  it             record;
begin
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

  select l.id into v_destino_lot
    from public.medication_lots l
   where l.medication_id = v_med
     and l.lot_number = v_lot_number
     and l.protocol_id is not distinct from p_destino_protocol_id;

  if v_destino_lot is null then
    -- El `tipo` se escribe LITERAL desde el parámetro, no se deduce del protocol_id: el CHECK de
    -- la 0035 ata los dos campos y un `case` que "calcula" el tipo es la clase de astucia que
    -- sobrevive hasta el día que aparezca un cuarto ámbito.
    insert into public.medication_lots
      (medication_id, protocol_id, tipo, lot_number, expiry_date, quantity_on_hand)
    values
      (v_med, p_destino_protocol_id, p_destino_tipo, v_lot_number, v_expiry, p_quantity)
    returning id into v_destino_lot;
  else
    -- Mismo criterio de vencimiento que el upsert de apply_reception_stock (0035/0040): el lote
    -- destino conserva el suyo y sólo lo toma del origen si no tenía ninguno.
    update public.medication_lots
       set quantity_on_hand = quantity_on_hand + p_quantity,
           expiry_date      = coalesce(expiry_date, v_expiry),
           updated_at       = now()
     where id = v_destino_lot;
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

comment on function public.reassign_lot_stock is
  'Mueve unidades de un lote a otro protocolo o al ámbito ambulatorio, por DOBLE ASIENTO: descuenta del lote origen, suma o crea el lote destino con el mismo número y vencimiento, y escribe dos stock_movements de tipo reasignacion con un reference_id compartido. Nunca cambia el protocol_id de una fila existente (rompería la trazabilidad de las dispensaciones históricas). Rechaza investigación (su stock no vive en medication_lots, 0038), el mismo ámbito de origen y los protocolos cerrados. Asignar el medicamento al protocolo destino es consecuencia de mover (0040). Motivo obligatorio. pharma leader+. SECURITY DEFINER. 0113.';

grant execute on function
  public.reassign_lot_stock(uuid, public.reception_kind, uuid, integer, text)
  to authenticated;


-- 3 · void_reception — la misma función, con una causa más nombrada ---------------------------
-- Firma idéntica a la 0087/0088: (p_reception_id uuid, p_reason text). Se reproduce entera porque
-- create or replace lo exige; el ÚNICO cambio de contenido está marcado "0113" abajo.
--
-- El mensaje del faltante enumeraba las salidas posibles de un lote y desde este archivo hay una
-- tercera: la reasignación a otro ámbito. Es la más confusa de las tres, porque el stock no se
-- gastó — está en otro estante. Sin esta línea, la farmacéutica que reasigna y después intenta
-- anular sale a buscar una dispensación que no existe.
--
-- OJO con el `security definer` de la cabecera: sobre esta función cuelga el trigger de guard
-- guard_reception_void (0088), cuya regla 1 es `current_user <> 'postgres'`. Si el replace lo
-- pierde, el UPDATE final de la propia función dispara su propio guard y la anulación se
-- autobloquea con un 42501 que el front traduce a "No tenés permiso para esta acción".

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

comment on function public.void_reception is
  'Anula una recepción con motivo obligatorio. Pendiente → sella. Verificada de base → valida que el ingreso siga intacto, resta los lotes y escribe el compensatorio anulacion_recepcion. Verificada de IP → sólo estado (su stock lo deriva v_ip_stock). Bloquea si ya se dispensó. pharma leader+. SECURITY DEFINER. 0087. 0088: errcode del lote inexistente (check_violation, no foreign_key_violation) y las dos atribuciones de causa, ya no afirman "ya se dispensó" — la validación mide cuánto queda, no por qué falta. 0113: la lista de salidas posibles de un lote nombra también la reasignación a otro ámbito.';

-- No hace falta re-otorgar el EXECUTE: create or replace conserva los privilegios existentes
-- (grant execute ... to authenticated de la 0087 sigue en pie).


-- 4 · PostgREST tiene que enterarse del RPC nuevo --------------------------------------------
notify pgrst, 'reload schema';


-- ============================================================================
-- VERIFICACIÓN POSTERIOR · lo que de verdad prueba algo (correr después de aplicar):
--
--   -- 1. El valor de enum de la 0112 llegó, y el CHECK lo acepta.
--   select 'reasignacion'::public.stock_movement_type;
--   select pg_get_constraintdef(oid) from pg_constraint
--    where conname = 'stock_movements_reference_type_valido';
--
--   -- 2. El RPC existe con la firma completa, es SECURITY DEFINER y lo ejecuta authenticated.
--   select p.proname, p.prosecdef, pg_get_function_identity_arguments(p.oid)
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public' and p.proname = 'reassign_lot_stock';
--
--   -- 3. void_reception sigue siendo SECURITY DEFINER (prosecdef = t) y su guard NO lo es
--   --    (prosecdef = f). Si esto sale al revés, la anulación queda autobloqueada.
--   select p.proname, p.prosecdef, pg_get_userbyid(p.proowner) as owner
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public' and p.proname in ('void_reception', 'guard_reception_void');
--
--   -- 4. Un traslado de prueba, con un lote TEST-* PROPIO y nada más. Los dos asientos tienen
--   --    que salir con el MISMO reference_id, y las dos filas de lote sumar lo mismo que antes:
--   select lot_id, movement_type, quantity_delta, reference_id, reference_type, reason
--     from public.stock_movements
--    where movement_type = 'reasignacion'
--    order by created_at desc limit 4;
-- ============================================================================
