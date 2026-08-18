-- ============================================================================
-- 0088 — Anular recepción: cerrar la salida del guard (review de la 0087)
--
-- La 0087 YA ESTÁ APLICADA EN PROD y es inmutable: todo lo de acá es `create or replace` sobre
-- las dos funciones que trajo, en un archivo nuevo. Un review posterior a esa migración encontró
-- cuatro cosas para cerrar antes de dar la feature por terminada:
--
-- 1) EL GUARD ERA DE UNA SOLA MANO. `guard_reception_void` (0087) bloqueaba la ENTRADA a
--    'anulada' pero dejaba la SALIDA abierta. El mismo PATCH directo que motivó el guard,
--    aplicado al revés —
--      PATCH /medication_receptions?id=eq.X  { "status": "verificada" }
--    — no dispara el guard (new.status no es 'anulada'), no viola
--    medication_receptions_anulada_chk (sólo restringe filas anuladas), pero SÍ dispara
--    trg_apply_reception_stock (0003:97): su condición es `new.status = 'verificada' and
--    old.status is distinct from 'verificada'`, y 'anulada' IS DISTINCT FROM 'verificada'. El
--    stock se vuelve a ingresar y queda un segundo movimiento 'recepcion' en positivo — neto en
--    el libro +Q, −Q, +Q, con la fila 'verificada' pero voided_at/voided_by_name/void_reason
--    llenos: un registro que se contradice a sí mismo y que ninguna constraint prohíbe. La
--    cabecera de la 0087 (líneas 39-41) afirma que esto no puede pasar ("una anulada no se puede
--    re-verificar, de modo que el stock no puede re-ingresarse") — cierto por la RPC
--    (verify_reception sólo acepta 'pendiente'), falso por el PATCH directo, que no pasa por
--    verify_reception.
--
--    Arreglo: dos cláusulas nuevas en `guard_reception_void`, en el espíritu de
--    `guard_dispensation_immutable` (0073) — que ya tiene la mitad de no-reversión para
--    dispensations—, aplicado acá a medication_receptions:
--      · Salir de 'anulada' hacia cualquier otro estado → excepción, SIEMPRE (no depende del
--        rol: ni siquiera void_reception reabre una anulada — corta de entrada si v_status ya es
--        'anulada', §2 más abajo —, así que no existe un camino legítimo que lo necesite).
--      · Con la fila ya anulada, cambiar void_reason, voided_at o voided_by → excepción, también
--        SIEMPRE (void_reception los escribe una única vez, al anular, y nunca los vuelve a
--        tocar). Cierra de paso un minor que estaba anotado aparte.
--
-- 2) UN ERRCODE QUE LA CAPA DE TRADUCCIÓN SE COME. El caso "el lote ya no existe" usaba
--    errcode = 'foreign_key_violation' (23503). `pharmaErrorMessage`
--    (src/data/pharma/errors.ts) traduce 23503 a un genérico fijo ("El registro referenciado no
--    existe o ya no está disponible.") y el número de lote —lo único accionable— nunca llega a
--    la pantalla. 23514 (check_violation), en cambio, deja pasar el texto de la base tal cual.
--    Además es lo que corresponde semánticamente: no hay una FK rota, hay un estado de la base
--    que no permite la operación.
--
-- 3) DOS MENSAJES QUE ATRIBUÍAN UNA CAUSA QUE LA FUNCIÓN NO VERIFICÓ. Los bloqueos de la 0087
--    terminaban en "Ya se dispensaron unidades de ese lote." y "Ya se dispensaron kits que
--    dependen de ella." La validación mide CUÁNTO QUEDA, no POR QUÉ falta: el faltante puede
--    venir de un adjust_stock negativo (existe desde la 0032), de otra recepción anulada antes,
--    o —en IP, donde la cuenta es por protocolo (v_ip_stock, 0071 §10) y no por recepción— de
--    kits que salieron por otra recepción o por una entrega. Se prueba en QA: el bloqueo puede
--    dispararse con un ajuste manual de por medio y el cartel decía "ya se dispensaron unidades",
--    falso en ese caso. La primera oración de cada mensaje —la de los números— es impecable y
--    accionable y no se toca; sólo se reemplaza la atribución.
--
-- 4) FALTABA EL BLOQUE DE VERIFICACIÓN POSTERIOR (0068/0069/0071/0072 sí lo traen). Acá importa
--    más que en ninguna: el mecanismo del guard —distinguir el camino legítimo por current_user—
--    es NUEVO en este repo. Si void_reception no quedara con owner postgres y SECURITY DEFINER,
--    se bloquearía a sí misma en su propio UPDATE final contra el guard recién reescrito, y la
--    feature nacería muerta con un 42501 que el front lee "No tenés permiso para esta acción" —
--    el mensaje que menos ayuda a diagnosticar que el problema es el owner de la función.
--
-- No cambia ninguna firma (void_reception sigue siendo (uuid, text); create or replace no
-- reemplaza si la firma cambia — dejaría una sobrecarga vieja viva y silenciosa, la trampa de la
-- 0056/0058), no agrega columnas ni toca ningún select del front: no es breaking, se puede
-- aplicar en cualquier momento respecto de un deploy.
--
-- APLICAR A MANO en el SQL Editor de Supabase (rol postgres), DESPUÉS de la 0087. IDEMPOTENTE.
--
-- ⚠️ Recordatorio heredado de la 0071/0072/0073: NUNCA escribir dos signos peso pegados dentro de
--    un comentario de este archivo. El editor SQL de Supabase rastrea el dollar-quoting SIN
--    ignorar los comentarios, así que uno suelto le invierte la paridad, deja de reconocer los
--    cuerpos de función y los parte por sus punto y coma internos, con un error desconcertante y
--    lejanísimo del comentario culpable.
-- ============================================================================


-- 1 · guard_reception_void — la regla completa, no sólo lo nuevo -----------------------------
-- Se reescribe ENTERA (no se "agrega" nada), mismo criterio que guard_dispensation_immutable
-- (0073): que el archivo muestre la regla completa y nadie tenga que leer dos migraciones para
-- saber qué protege. El trigger trg_guard_reception_void (0087) ya está creado sobre esta
-- función y sigue apuntando a ella después del create or replace — no hay que tocarlo (DROP +
-- CREATE sólo hace falta si cambia el nombre, el evento o la tabla del trigger, y acá no cambia
-- nada de eso).
create or replace function public.guard_reception_void()
returns trigger language plpgsql as $$
begin
  -- (1) Entrada a 'anulada': sólo por void_reception. Igual que en la 0087 — current_user es
  -- 'postgres' mientras corre una función SECURITY DEFINER con ese owner, sin importar qué rol
  -- la invocó (auth.uid() sigue siendo el usuario real; current_user es quien manda en los
  -- checks de privilegio). Un PATCH de PostgREST siempre corre como el rol del JWT del cliente
  -- (authenticated), nunca como postgres.
  if new.status = 'anulada' and old.status is distinct from 'anulada' and current_user <> 'postgres' then
    raise exception
      'La anulación de una recepción se hace desde la app: revierte el stock y deja el registro. No se puede marcar "anulada" directamente.'
      using errcode = '42501';
  end if;

  -- (2) Salida de 'anulada': NO TIENE camino legítimo, así que se bloquea siempre, sin la
  -- excepción por current_user que sí tiene la cláusula (1). Ni siquiera void_reception la
  -- necesita: corta de entrada si la recepción ya está anulada (§2 de la función, más abajo),
  -- nunca llega a un UPDATE que la reabra. Una anulada es un documento cerrado — el camino para
  -- un error de carga es cargar una recepción nueva, no reabrir la vieja.
  if old.status = 'anulada' and new.status is distinct from 'anulada' then
    raise exception
      'Una recepción anulada es un documento cerrado: no se puede reabrir ni revertir. Si fue un error de carga, cargá una recepción nueva.'
      using errcode = '42501';
  end if;

  -- (3) Con la fila ya anulada, los datos de la anulación quedan sellados. Tampoco tiene camino
  -- legítimo: void_reception escribe void_reason/voided_at/voided_by una única vez, al anular, y
  -- nunca los vuelve a tocar (si la fila ya está anulada, la función corta antes de llegar al
  -- UPDATE final). Sin esto, un PATCH directo podía dejar la anulación con motivo o autoría
  -- distintos de los que realmente pasaron, sin que ninguna otra regla lo notara.
  -- voided_by_name entra en la misma bolsa aunque sea "sólo presentación": es el nombre
  -- desnormalizado que la pantalla muestra —la RLS de users no deja joinear el real (0085)—, así
  -- que es lo ÚNICO que un auditor lee. Dejarlo editable permitía cambiar quién figura como autor
  -- de la anulación sin tocar voided_by, y la fila quedaba mintiendo con el uuid correcto al lado.
  if old.status = 'anulada' and (
       new.void_reason    is distinct from old.void_reason
    or new.voided_at      is distinct from old.voided_at
    or new.voided_by      is distinct from old.voided_by
    or new.voided_by_name is distinct from old.voided_by_name
  ) then
    raise exception
      'Los datos de una anulación ya registrada (motivo, fecha, quién la hizo) no se pueden modificar.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

comment on function public.guard_reception_void() is
  'Guard de medication_receptions con TRES reglas, las tres pensadas contra un PATCH directo de
   PostgREST (la policy de la tabla es for all, operator+): (1) nadie salvo void_reception —que
   corre como current_user = postgres por ser SECURITY DEFINER con ese owner— puede marcar una
   fila "anulada"; (2) ninguna fila "anulada" puede salir de ese estado — no existe una reversión
   legítima, ni siquiera void_reception la intenta; (3) con la fila ya anulada,
   void_reason/voided_at/voided_by quedan sellados. (1) depende de current_user; (2) y (3) se
   aplican siempre, porque no hay ningún camino legítimo que las necesite. 0087 + 0088.';


-- 2 · void_reception — mismo comportamiento, dos mensajes corregidos -------------------------
-- Firma idéntica a la 0087: (p_reception_id uuid, p_reason text). Se reproduce la función
-- entera porque create or replace lo exige; los únicos cambios de contenido están marcados
-- "0088" en los comentarios de abajo.
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
          raise exception
            'No se puede anular: del lote % quedan % unidades y esta recepción ingresó %. Puede haber salidas posteriores de ese lote (dispensaciones o ajustes).',
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
  'Anula una recepción con motivo obligatorio. Pendiente → sella. Verificada de base → valida que el ingreso siga intacto, resta los lotes y escribe el compensatorio anulacion_recepcion. Verificada de IP → sólo estado (su stock lo deriva v_ip_stock). Bloquea si ya se dispensó. pharma leader+. SECURITY DEFINER. 0087. 0088: errcode del lote inexistente (check_violation, no foreign_key_violation) y las dos atribuciones de causa, ya no afirman "ya se dispensó" — la validación mide cuánto queda, no por qué falta.';

-- No hace falta re-otorgar el EXECUTE: create or replace conserva los privilegios existentes
-- (grant execute ... to authenticated de la 0087 sigue en pie).


-- ============================================================================
-- VERIFICACIÓN POSTERIOR · lo que de verdad prueba algo (correr después de aplicar):
--
--   -- 1. LO MÁS IMPORTANTE DE ESTA MIGRACIÓN: owner y SECURITY DEFINER de las dos funciones.
--   --    void_reception tiene que quedar con owner postgres y SECURITY DEFINER (prosecdef = t):
--   --    si no, su propio UPDATE final corre con el rol de quien la llamó (por ejemplo
--   --    authenticated) en vez de con postgres, y ESE UPDATE dispara el guard recién reescrito
--   --    (regla 1: sólo postgres puede entrar a 'anulada') — la función se bloquearía a sí
--   --    misma con un 42501 que en el front se lee "No tenés permiso para esta acción", el
--   --    mensaje que menos ayuda a diagnosticar que el problema es el owner de la función.
--   --    guard_reception_void, al revés, tiene que quedar SIN SECURITY DEFINER (prosecdef = f):
--   --    si lo tuviera, correría siempre como su propio owner y current_user adentro sería
--   --    SIEMPRE 'postgres' sin importar quién disparó el UPDATE real — la regla 1 (current_user
--   --    <> 'postgres') dejaría de significar nada y el guard quedaría anulado de fábrica, sin
--   --    ningún error que lo delate.
--   --    select p.proname, r.rolname as owner, p.prosecdef as security_definer
--   --      from pg_proc p join pg_roles r on r.oid = p.proowner
--   --     where p.proname in ('void_reception', 'guard_reception_void')
--   --     order by p.proname;
--   --    → esperado, DOS filas:
--   --      guard_reception_void | postgres | f
--   --      void_reception       | postgres | t
--   --    (el owner de guard_reception_void es postgres porque quien aplica la migración en el SQL
--   --    Editor corre como postgres — no es funcionalmente necesario para la regla del guard,
--   --    pero es lo esperable y confirma que no quedó con un owner raro).
--   --
--   -- 2. Ninguna sobrecarga colgada (create or replace no reemplaza si cambia la firma; acá no
--   --    debería haber cambiado, pero verificarlo es gratis y es la trampa de la 0056/0058):
--   --    select proname, pg_get_function_identity_arguments(oid) from pg_proc
--   --     where proname in ('void_reception', 'guard_reception_void');
--   --    → exactamente una fila por nombre: void_reception con (p_reception_id uuid, p_reason
--   --      text), guard_reception_void sin argumentos (es un trigger).
--   --
--   -- 3. El trigger sigue enganchado a la función reescrita y habilitado (create or replace no
--   --    lo toca, pero confirma que nadie lo deshabilitó por separado):
--   --    select tgname, tgenabled, tgfoid::regproc as function from pg_trigger
--   --     where tgrelid = 'public.medication_receptions'::regclass and not tgisinternal
--   --       and tgname = 'trg_guard_reception_void';
--   --    → una fila, tgenabled = 'O', function = guard_reception_void.
--   --
--   -- 4. La salida ahora está cerrada. Sin id a mano —apunta solo a la anulada más reciente si
--   --    existe, así que es SEGURO correrlo tal cual, sin placeholders—:
--   --    update public.medication_receptions set status = 'verificada'
--   --     where id = (select id from public.medication_receptions where status = 'anulada'
--   --                  order by voided_at desc limit 1);
--   --    → si YA hay alguna anulada: tiene que FALLAR con 42501 ("Una recepción anulada es un
--   --      documento cerrado..."), sin aplicarse y sin volver a mover stock.
--   --    → si TODAVÍA no hay ninguna (la 0087 se aplicó recién): el subselect da NULL y el UPDATE
--   --      no toca ninguna fila ("UPDATE 0") — no prueba nada, no es un error. Repetir este paso
--   --      el día que exista la primera anulación real; mientras tanto, los chequeos 1-3
--   --      (catálogo, no dependen de datos) alcanzan para confirmar que la migración quedó bien
--   --      aplicada.
-- ============================================================================
