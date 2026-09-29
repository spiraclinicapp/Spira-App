-- Spira · Limpieza del stock de ENDURA (222714) — 1 · SIMULAR (no guarda nada)
-- ============================================================================
-- GENERADO por supabase/scripts/limpiar-stock-endura/generar.mjs. No editar a mano: el porqué de cada paso
-- está en la cabecera del generador.
--
-- Pedido del Director (2026-09-28): borrar el stock de ENDURA como si nunca se hubiera cargado —recepciones,
-- renglones, lotes, movimientos y unidades de IP— y la dispensación de prueba Nº 86 con todo su pedido. No se
-- tocan otras dispensaciones, salidas ambulatorias ni pedidos de reposición.
--
-- ORDEN:
--   1. 1-simular.sql → leer el informe (sale como «error» a propósito: es la forma de deshacer todo).
--   2. 2-aplicar.sql → un único bloque do: o entra entero o no entra nada. Al final, un select de control.
--   3. Storage › bucket ip-docs → borrar los archivos que lista el informe (si lista alguno).
--
-- SIMULA. Hace la limpieza completa y la deshace al final con raise exception: el mensaje ES el informe.
-- ============================================================================

do $limpieza$
declare
  v_aplicar      boolean := false;
  v_codigo       text    := '222714';
  v_disp_numeros int[]   := array[86];
  v_proto        uuid;
  v_nombre       text;
  v_frenos       text;
  v_foto         jsonb;
  v_n_rec        bigint;
  v_n_ren        bigint;
  v_n_lot        bigint;
  v_n_mov        bigint;
  v_n_ipu        bigint;
  v_n_disp       bigint;
  v_n_ped        bigint;
  v_n_doc        bigint;
  v_n_hab        bigint;
  v_n            bigint;
  v_informe      text;
begin
  select p.id, p.name into v_proto, v_nombre from public.protocols p where p.code = v_codigo;
  if v_proto is null then
    raise exception 'No existe un protocolo con código %. No se tocó nada.', v_codigo;
  end if;

  -- 0 · Qué es de ENDURA, y qué es de la prueba ----------------------------------------------------------
  drop table if exists _rec;
  drop table if exists _lot;
  drop table if exists _disp;
  drop table if exists _ped;
  drop table if exists _hab;
  drop table if exists _mov;
  create temp table _rec on commit drop as
    select r.id from public.medication_receptions r where r.protocol_id = v_proto;
  create temp table _lot on commit drop as
    select l.id from public.medication_lots l where l.protocol_id = v_proto;
  create temp table _disp on commit drop as
    select d.id from public.dispensations d where d.correlative_number = any (v_disp_numeros);
  create temp table _ped on commit drop as
    select distinct d.request_id as id from public.dispensations d where d.id in (select id from _disp);
  create temp table _hab on commit drop as
    select h.id from public.dispensation_habilitaciones h where h.request_id in (select id from _ped);
  create temp table _mov on commit drop as
    select m.id from public.stock_movements m
     where m.lot_id in (select id from _lot)
        or (m.reference_type = 'reception' and m.reference_id in (select id from _rec))
        or (m.reference_type = 'dispensation' and m.reference_id in (select id from _disp));

  select count(*) into v_n_rec from _rec;
  select count(*) into v_n_ren from public.reception_items ri where ri.reception_id in (select id from _rec);
  select count(*) into v_n_lot from _lot;
  select count(*) into v_n_mov from _mov;
  select count(*) into v_n_ipu from public.ip_units u
   where u.protocol_id = v_proto or u.reception_id in (select id from _rec);
  select count(*) into v_n_disp from _disp;
  select count(*) into v_n_ped from _ped;
  select count(*) into v_n_doc from public.dispensation_ip_documents x where x.request_id in (select id from _ped);
  select count(*) into v_n_hab from _hab;

  if v_n_rec + v_n_lot + v_n_mov + v_n_ipu + v_n_disp = 0 then
    raise exception 'No hay stock de % (%) para borrar ni queda la dispensación de prueba: no se tocó nada.',
      v_codigo, v_nombre;
  end if;

  -- La dispensación de prueba tiene que ser de ENDURA. Si falta, es que ya se borró: sólo se sigue si
  -- tampoco queda el stock que la frenaba (lo mira el freno de abajo).
  if exists (select 1 from public.dispensation_requests dr
              where dr.id in (select id from _ped) and dr.protocol_id is distinct from v_proto) then
    raise exception 'La dispensación Nº % no es de % (%). No se tocó nada.', v_disp_numeros, v_codigo, v_nombre;
  end if;

  -- 1 · Frenos: se miran todos antes de tocar una fila ----------------------------------------------------
  select string_agg(f, E'\n') into v_frenos from (
    select format('· Dispensación Nº %s (%s): salió %s de %s, lote %s.',
                  d.correlative_number, d.status, di.quantity, md.name, l.lot_number) as f
      from public.dispensation_items di
      join public.dispensations d on d.id = di.dispensation_id
      join public.medication_lots l on l.id = di.lot_id
      join public.medications md on md.id = di.medication_id
     where di.lot_id in (select id from _lot)
       and di.dispensation_id not in (select id from _disp)
    union all
    select format('· Salida ambulatoria del %s: %s de %s, lote %s.',
                  to_char(a.created_at at time zone 'America/Argentina/Buenos_Aires', 'DD/MM/YYYY'),
                  a.quantity, md.name, l.lot_number)
      from public.ambulatory_dispensations a
      join public.medication_lots l on l.id = a.lot_id
      join public.medications md on md.id = a.medication_id
     where a.lot_id in (select id from _lot)
    union all
    select format('· Kits de IP entregados por otras dispensaciones: %s, en %s dispensaciones.', sum(d.ip_kits), count(*))
      from public.dispensations d
      join public.dispensation_requests dr on dr.id = d.request_id
     where dr.protocol_id = v_proto and d.ip_kits is not null and d.status = 'entregada'
       and d.id not in (select id from _disp)
    having count(*) > 0
    union all
    select format('· Unidad de IP %s ya dispensada.', u.kit_number)
      from public.ip_units u
     where (u.protocol_id = v_proto or u.reception_id in (select id from _rec))
       and (u.status = 'dispensada' or u.dispensed_visit_id is not null or u.dispensed_to_enrollment_id is not null)
    union all
    select format('· Traslado de stock con otro ámbito (%s de %s, lote %s).',
                  m.quantity_delta, md.name, coalesce(l.lot_number, 'sin lote'))
      from public.stock_movements m
      join public.medications md on md.id = m.medication_id
      left join public.medication_lots l on l.id = m.lot_id
     where m.reference_type = 'reasignacion'
       and m.id not in (select id from _mov)
       and m.reference_id in (select m2.reference_id from public.stock_movements m2
                               where m2.id in (select id from _mov) and m2.reference_type = 'reasignacion')
    union all
    select format('· El pedido de la dispensación de prueba tiene otra dispensación (Nº %s, %s).', d.correlative_number, d.status)
      from public.dispensations d
     where d.request_id in (select id from _ped) and d.id not in (select id from _disp)
    union all
    select '· Un renglón de otro pedido completa el saldo de un renglón del pedido de prueba.'
      from public.dispensation_request_items x
     where x.request_id not in (select id from _ped)
       and x.saldo_de_item_id in (select i.id from public.dispensation_request_items i where i.request_id in (select id from _ped))
    union all
    select '· Una habilitación de otro pedido apunta al pedido de prueba (saldo o receta reusada).'
      from public.dispensation_habilitaciones h
     where h.request_id not in (select id from _ped)
       and (h.origen_habilitacion_id in (select id from _hab)
            or h.saldo_de_item_id in (select i.id from public.dispensation_request_items i where i.request_id in (select id from _ped)))
    union all
    select '· Otra visita tiene el IP cerrado como «entregado en otra visita» apuntando a la dispensación de prueba.'
      from public.visit_ip_closures c
     where c.dispensation_id in (select id from _disp)
  ) frenos;

  if v_frenos is not null then
    raise exception E'NO SE TOCÓ NADA. El stock de % (%) tiene cosas que no se pueden borrar «como si nunca se hubiera cargado» sin tocar lo ya entregado:\n%\n\nPasale este mensaje a Claude para decidir qué hacer con estos casos.',
      v_codigo, v_nombre, v_frenos;
  end if;

  -- 2 · La foto de lo que se borra, antes de borrarlo -------------------------------------------------------
  select jsonb_build_object(
    'motivo', 'Limpieza del stock de ' || v_codigo || ' pedida por el Director el 2026-09-28: se borra como si nunca se hubiera cargado, con la dispensación de prueba Nº ' || array_to_string(v_disp_numeros, ', ') || ' y su pedido.',
    'protocolo', jsonb_build_object('id', v_proto, 'code', v_codigo, 'name', v_nombre),
    'medication_receptions', coalesce((select jsonb_agg(to_jsonb(r)) from public.medication_receptions r where r.id in (select id from _rec)), '[]'::jsonb),
    'reception_items', coalesce((select jsonb_agg(to_jsonb(ri)) from public.reception_items ri where ri.reception_id in (select id from _rec)), '[]'::jsonb),
    'medication_lots', coalesce((select jsonb_agg(to_jsonb(l)) from public.medication_lots l where l.id in (select id from _lot)), '[]'::jsonb),
    'stock_movements', coalesce((select jsonb_agg(to_jsonb(m)) from public.stock_movements m where m.id in (select id from _mov)), '[]'::jsonb),
    'ip_units', coalesce((select jsonb_agg(to_jsonb(u)) from public.ip_units u where u.protocol_id = v_proto or u.reception_id in (select id from _rec)), '[]'::jsonb),
    'dispensations', coalesce((select jsonb_agg(to_jsonb(d)) from public.dispensations d where d.id in (select id from _disp)), '[]'::jsonb),
    'dispensation_items', coalesce((select jsonb_agg(to_jsonb(di)) from public.dispensation_items di where di.dispensation_id in (select id from _disp)), '[]'::jsonb),
    'dispensation_requests', coalesce((select jsonb_agg(to_jsonb(dr)) from public.dispensation_requests dr where dr.id in (select id from _ped)), '[]'::jsonb),
    'dispensation_request_items', coalesce((select jsonb_agg(to_jsonb(i)) from public.dispensation_request_items i where i.request_id in (select id from _ped)), '[]'::jsonb),
    'dispensation_ip_documents', coalesce((select jsonb_agg(to_jsonb(x)) from public.dispensation_ip_documents x where x.request_id in (select id from _ped)), '[]'::jsonb),
    'dispensation_habilitaciones', coalesce((select jsonb_agg(to_jsonb(h)) from public.dispensation_habilitaciones h where h.id in (select id from _hab)), '[]'::jsonb)
  ) into v_foto;

  -- El informe se arma ANTES de borrar: después no queda de dónde sacar los nombres.
  select concat_ws(E'\n',
    case when v_aplicar then 'LIMPIEZA APLICADA.' else 'SIMULACIÓN — NO SE BORRÓ NADA. Si el informe está bien, corré 2-aplicar.sql.' end,
    format('Protocolo %s · %s', v_codigo, v_nombre),
    '',
    format('Se borran: %s recepciones (%s renglones), %s lotes, %s movimientos de stock, %s unidades de IP; %s dispensaciones de prueba con %s pedidos, %s constancias de IP y %s habilitaciones.',
           v_n_rec, v_n_ren, v_n_lot, v_n_mov, v_n_ipu, v_n_disp, v_n_ped, v_n_doc, v_n_hab),
    '',
    '== Dispensación de prueba y su pedido ==',
    coalesce((select string_agg(format('· Nº %s%s · %s · %s (%s) · visita %s del %s · pedido %s, hecho por %s el %s%s',
                                       d.correlative_number, coalesce(' · ' || d.dispensation_code, ''), d.status,
                                       pa.full_name, coalesce('IVRS ' || e.ivrs_code, pa.code), coalesce(vd.code, vd.name, '?'),
                                       to_char(coalesce(pv.real_date, pv.estimated_date), 'DD/MM/YYYY'),
                                       dr.status, coalesce(u.full_name, '?'),
                                       to_char(dr.created_at at time zone 'America/Argentina/Buenos_Aires', 'DD/MM/YYYY HH24:MI'),
                                       case when d.ip_kits is not null then format(' · %s kits de IP', d.ip_kits) else '' end),
                                E'\n' order by d.correlative_number)
                from public.dispensations d
                join public.dispensation_requests dr on dr.id = d.request_id
                join public.patient_visits pv on pv.id = dr.visit_id
                join public.enrollments e on e.id = pv.enrollment_id
                join public.patients pa on pa.id = e.patient_id
                left join public.visit_definitions vd on vd.id = pv.visit_def_id
                left join public.users u on u.id = dr.requested_by
               where d.id in (select id from _disp)), '(ya no está)'),
    coalesce((select string_agg(format('    %s de %s, lote %s', di.quantity, md.name, di.lot_number), E'\n' order by md.name)
                from public.dispensation_items di join public.medications md on md.id = di.medication_id
               where di.dispensation_id in (select id from _disp)), null),
    '',
    '== Recepciones ==',
    coalesce((select string_agg(format('· Folio %s · %s · %s · %s%s',
                                       r.folio, r.tipo, to_char(r.reception_date, 'DD/MM/YYYY'), r.status,
                                       case when r.tipo = 'investigacion' then format(' · %s kits', r.total_kits) else '' end),
                                E'\n' order by r.reception_date, r.folio)
                from public.medication_receptions r where r.id in (select id from _rec)), '(ninguna)'),
    '',
    '== Lotes (existencia actual) ==',
    coalesce((select string_agg(format('· %s · lote %s · vence %s · %s en existencia',
                                       md.name, l.lot_number, coalesce(to_char(l.expiry_date, 'DD/MM/YYYY'), 's/f'), l.quantity_on_hand),
                                E'\n' order by md.name, l.lot_number)
                from public.medication_lots l join public.medications md on md.id = l.medication_id
               where l.id in (select id from _lot)), '(ninguno)'),
    '',
    '== Pedidos de reposición que vuelven a figurar sin recibir ==',
    coalesce((select string_agg(format('· Pedido Nº %s', pm.numero), E'\n' order by pm.numero)
                from public.pedidos_medicacion pm
               where pm.id in (select r.pedido_id from public.medication_receptions r where r.id in (select id from _rec))),
             '(ninguno)'),
    '',
    '== Archivos para borrar a mano en Storage › ip-docs ==',
    coalesce((select string_agg('· ' || p, E'\n' order by p) from (
                select x.storage_path as p from public.dispensation_ip_documents x where x.request_id in (select id from _ped)
                union
                select h.receta_path from public.dispensation_habilitaciones h where h.id in (select id from _hab)) arch),
             '(ninguno)')
  ) into v_informe;

  insert into public.audit_log (actor_id, action, entity_type, entity_id, before_data, after_data, db_role)
  values (null, 'DELETE', 'limpieza_stock_protocolo', v_proto, v_foto || jsonb_build_object('informe', v_informe), null, session_user);

  -- 3 · Borrar, en el orden de las FKs ----------------------------------------------------------------------
  -- Movimientos primero: su FK a medication_lots es restrict (0002). Después la dispensación de prueba (sus
  -- renglones, que apuntan a los lotes con restrict, caen en cascada) y su pedido, las unidades de IP
  -- (restrict a la recepción, 0037), las recepciones (los renglones caen en cascada) y al final los lotes.
  delete from public.stock_movements m where m.id in (select id from _mov);
  get diagnostics v_n = row_count;
  if v_n <> v_n_mov then raise exception 'Se borraron % movimientos y eran %. No se tocó nada.', v_n, v_n_mov; end if;

  delete from public.dispensations d where d.id in (select id from _disp);
  get diagnostics v_n = row_count;
  if v_n <> v_n_disp then raise exception 'Se borraron % dispensaciones y eran %. No se tocó nada.', v_n, v_n_disp; end if;

  delete from public.dispensation_ip_documents x where x.request_id in (select id from _ped);
  get diagnostics v_n = row_count;
  if v_n <> v_n_doc then raise exception 'Se borraron % constancias de IP y eran %. No se tocó nada.', v_n, v_n_doc; end if;

  delete from public.dispensation_habilitaciones h where h.id in (select id from _hab);
  get diagnostics v_n = row_count;
  if v_n <> v_n_hab then raise exception 'Se borraron % habilitaciones y eran %. No se tocó nada.', v_n, v_n_hab; end if;

  delete from public.dispensation_requests dr where dr.id in (select id from _ped);
  get diagnostics v_n = row_count;
  if v_n <> v_n_ped then raise exception 'Se borraron % pedidos y eran %. No se tocó nada.', v_n, v_n_ped; end if;

  delete from public.ip_units u where u.protocol_id = v_proto or u.reception_id in (select id from _rec);
  get diagnostics v_n = row_count;
  if v_n <> v_n_ipu then raise exception 'Se borraron % unidades de IP y eran %. No se tocó nada.', v_n, v_n_ipu; end if;

  delete from public.medication_receptions r where r.id in (select id from _rec);
  get diagnostics v_n = row_count;
  if v_n <> v_n_rec then raise exception 'Se borraron % recepciones y eran %. No se tocó nada.', v_n, v_n_rec; end if;

  delete from public.medication_lots l where l.id in (select id from _lot);
  get diagnostics v_n = row_count;
  if v_n <> v_n_lot then raise exception 'Se borraron % lotes y eran %. No se tocó nada.', v_n, v_n_lot; end if;

  -- 4 · Controles: si algo de esto no da, se deshace todo ---------------------------------------------------
  if exists (select 1 from public.medication_receptions r where r.protocol_id = v_proto)
     or exists (select 1 from public.reception_items ri where ri.reception_id in (select id from _rec))
     or exists (select 1 from public.medication_lots l where l.protocol_id = v_proto)
     or exists (select 1 from public.v_ip_stock s where s.protocol_id = v_proto)
     or exists (select 1 from public.dispensations d where d.correlative_number = any (v_disp_numeros))
     or exists (select 1 from public.dispensation_requests dr where dr.id in (select id from _ped)) then
    raise exception 'Quedó stock de % o la dispensación de prueba después de borrar. No se tocó nada.', v_codigo;
  end if;

  if not v_aplicar then
    raise exception '%', v_informe;
  end if;
end
$limpieza$;
