-- Spira · Limpieza de todo lo anterior a la carga de la prueba real — 2 · APLICAR
-- ============================================================================
-- GENERADO por supabase/scripts/limpieza-prueba-real/generar.mjs. No editar a mano.
--
-- Decisión del Director (2026-09-15): se borra todo lo anterior a la carga salvo la configuración y el catálogo
-- de medicamentos, incluida su auditoría. Detalle de qué queda y qué se va: cabecera del generador.
--
-- ORDEN:
--   0. Bajar un backup en el dashboard (Database › Backups): lo que sigue no tiene vuelta desde la app.
--   1. 1-simular.sql → leer el informe (sale como «error» a propósito).
--   2. 2-aplicar.sql
--   3. Storage › bucket ip-docs → borrar TODOS los archivos (constancias y recetas de lo que se borró).
--
-- APLICA. Un único bloque do: o entra entero o no entra nada. Correrlo de nuevo no borra nada más de la carga.
-- ============================================================================

do $limpieza$
declare
  v_aplicar    boolean := true;
  v_esperado   jsonb := '{"222714":8,"ACT18301":8,"CKJX839D12302":48,"LTS17231":8}'::jsonb;
  v_borrar     text[] := array['EFC18244', 'EFC18419', 'PROT-A', 'PROT-B']::text[];
  v_vaciar     text[] := array['dispensation_ip_documents', 'dispensation_items', 'stock_movements', 'dispensations', 'dispensation_request_items', 'dispensation_habilitaciones', 'dispensation_requests', 'ambulatory_dispensations', 'ip_units', 'reception_items', 'medication_lots', 'medication_receptions', 'reposicion_pedidos', 'dispensation_daily_counters', 'visit_comments', 'visit_procedure_reports_ready', 'report_status_history', 'report_status', 'alert_dismissals', 'visit_procedure_completions', 'visit_ip_closures', 'patient_timeline', 'checklist_report_ready', 'checklist_completions', 'checklist_items', 'track_dispensations', 'task_assignees', 'tasks', 'agenda_notes', 'protocol_alerts', 'feedback']::text[];
  v_estudios   text[];
  v_corte      timestamptz;
  v_tabla      text;
  v_pendientes text[];
  v_quedan     text[];
  v_progreso   boolean;
  v_n          bigint;
  v_x          record;
  v_txt        text;
  v_informe    text;
begin
  select array_agg(k) into v_estudios from jsonb_object_keys(v_esperado) as k;

  -- 0 · Precondiciones: todo lo que puede frenar se mira antes de tocar una fila ---------------------------
  create temp table _carga on commit drop as
    select e.id as enrollment_id, e.patient_id, p.code as protocolo
    from public.enrollments e join public.protocols p on p.id = e.protocol_id
    where p.code = any (v_estudios) and e.ivrs_code is not null;

  for v_x in
    select k.protocolo, (v_esperado ->> k.protocolo)::int as esperado,
           (select count(*) from _carga c where c.protocolo = k.protocolo) as hay
    from unnest(v_estudios) as k(protocolo)
  loop
    if v_x.hay <> v_x.esperado then
      raise exception '% tiene % inscripciones de la carga y tenían que ser %. No se borró nada.', v_x.protocolo, v_x.hay, v_x.esperado;
    end if;
  end loop;

  select count(distinct patient_id) into v_n from _carga;
  if v_n <> 64 then
    raise exception 'La carga tiene % personas y tenían que ser 64. No se borró nada.', v_n;
  end if;

  -- El corte de la auditoría es el momento de la carga: toda la carga corrió en una transacción, así que sus
  -- inscripciones nuevas comparten el mismo created_at, y su auditoría el mismo occurred_at.
  select min(e.created_at) into v_corte
  from public.enrollments e join public.protocols p on p.id = e.protocol_id
  where p.code = 'CKJX839D12302';
  if v_corte is null or v_corte < '2026-09-14' or v_corte > now() then
    raise exception 'No pude fijar el momento de la carga (%). No se borró nada.', v_corte;
  end if;

  -- Conteo de TODAS las tablas de public antes, para el informe.
  create temp table _conteo (tabla text primary key, antes bigint, despues bigint) on commit drop;
  for v_x in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
             where n.nspname = 'public' and c.relkind in ('r', 'p') order by c.relname
  loop
    execute format('select count(*) from public.%I', v_x.relname) into v_n;
    insert into _conteo (tabla, antes) values (v_x.relname, v_n);
  end loop;

  create temp table _reseteo (orden serial, que text, filas bigint) on commit drop;


  -- 1 · Apagar los triggers de usuario (auditoría, guardas, sellos) de todas las tablas de public ------------
  -- Se guardan los que estaban prendidos para prender EXACTAMENTE esos al final. Los de FK (tgisinternal)
  -- no se tocan: son los que hacen las cascadas.
  create temp table _trigger on commit drop as
    select c.relname, t.tgname
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p') and not t.tgisinternal and t.tgenabled <> 'D';
  for v_x in select * from _trigger loop
    execute format('alter table public.%I disable trigger %I', v_x.relname, v_x.tgname);
  end loop;


  -- 2 · Vaciar lo operativo -----------------------------------------------------------------------------------
  -- Sin orden fijo: se intenta cada tabla y la que choca con una FK se reintenta en la vuelta siguiente, cuando
  -- ya se vació la que la referenciaba. Si una vuelta entera no avanza, hay un ciclo y se frena todo.
  select coalesce(array_agg(t), '{}') into v_pendientes from unnest(v_vaciar) as t where to_regclass(format('public.%I', t)) is not null;
  loop
    exit when cardinality(v_pendientes) = 0;
    v_quedan := '{}';
    v_progreso := false;
    foreach v_tabla in array v_pendientes loop
      begin
        execute format('delete from public.%I', v_tabla);
        v_progreso := true;
      exception when foreign_key_violation then
        v_quedan := v_quedan || v_tabla;
      end;
    end loop;
    exit when cardinality(v_quedan) = 0;
    if not v_progreso then
      raise exception 'No pude vaciar % (se referencian entre sí). No se borró nada.', v_quedan;
    end if;
    v_pendientes := v_quedan;
  end loop;


  -- 3 · Lo que no es de la carga ------------------------------------------------------------------------------
  delete from public.patient_medications pm
  where pm.enrollment_id not in (select enrollment_id from _carga);

  -- Las visitas cuelgan de la inscripción en cascada.
  delete from public.enrollments e
  where e.id not in (select enrollment_id from _carga);

  delete from public.patients pa
  where not exists (select 1 from public.enrollments e where e.patient_id = pa.id);

  -- Con su configuración en cascada: cronograma, procedimientos y reportes, accesos, medicamentos del estudio.
  delete from public.protocols p where p.code = any (v_borrar);


  -- 4 · Los 72 de la carga, exactamente como los dejó la carga -------------------------------------------------
  delete from public.patient_visits pv
  where pv.enrollment_id in (select enrollment_id from _carga) and pv.kind <> 'programada';
  get diagnostics v_n = row_count;
  insert into _reseteo (que, filas) values ('visitas sueltas (VNP, retest) de la carga borradas', v_n);

  -- Una visita realizada queda con llegada 09:00 y fin de atención 10:00 de su día, que es lo que puso la carga;
  -- una pendiente, sin nada. Se va todo sello anterior: atención, coordinador, médico, ausencia, IP.
  update public.patient_visits pv
     set arrived_at       = case when pv.real_date is not null then (pv.real_date + time '09:00') at time zone 'America/Argentina/Buenos_Aires' end,
         ready_at         = case when pv.real_date is not null then (pv.real_date + time '10:00') at time zone 'America/Argentina/Buenos_Aires' end,
         left_at          = null,
         attended_at      = null,
         coordinator_id   = null,
         coordinator_name = null,
         doctor_seen_at   = null,
         doctor_motivo    = null,
         wants_doctor     = false,
         wants_doctor_at  = null,
         doctor_marked_by = null,
         no_show_at       = null,
         no_show_by       = null,
         treating_physician = null,
         lleva_ip         = null,
         notes            = case when position('Fecha real provisoria: igual a la estimada. El listado del sitio no tiene registro de esta visita (carga del 2026-09-14).' in coalesce(pv.notes, '')) > 0 then 'Fecha real provisoria: igual a la estimada. El listado del sitio no tiene registro de esta visita (carga del 2026-09-14).' end
   where pv.enrollment_id in (select enrollment_id from _carga)
     -- Sólo las que no están ya así: correrlo dos veces no reescribe nada.
     and (pv.left_at is not null or pv.attended_at is not null or pv.coordinator_id is not null or pv.coordinator_name is not null
          or pv.doctor_seen_at is not null or pv.doctor_motivo is not null or pv.wants_doctor or pv.wants_doctor_at is not null
          or pv.doctor_marked_by is not null or pv.no_show_at is not null or pv.no_show_by is not null
          or pv.treating_physician is not null or pv.lleva_ip is not null
          or pv.ready_at is distinct from case when pv.real_date is not null then (pv.real_date + time '10:00') at time zone 'America/Argentina/Buenos_Aires' end
          or pv.arrived_at is distinct from case when pv.real_date is not null then (pv.real_date + time '09:00') at time zone 'America/Argentina/Buenos_Aires' end
          or pv.notes is distinct from case when position('Fecha real provisoria: igual a la estimada. El listado del sitio no tiene registro de esta visita (carga del 2026-09-14).' in coalesce(pv.notes, '')) > 0 then 'Fecha real provisoria: igual a la estimada. El listado del sitio no tiene registro de esta visita (carga del 2026-09-14).' end);
  get diagnostics v_n = row_count;
  insert into _reseteo (que, filas) values ('visitas de la carga devueltas al estado del Excel', v_n);

  update public.enrollments e
     set notes = case when position('[fallo] Screen fail' in coalesce(e.notes, '')) > 0 then '[fallo] Screen fail' end
   where e.id in (select enrollment_id from _carga)
     and e.notes is distinct from case when position('[fallo] Screen fail' in coalesce(e.notes, '')) > 0 then '[fallo] Screen fail' end;
  get diagnostics v_n = row_count;
  insert into _reseteo (que, filas) values ('notas de inscripción anteriores quitadas', v_n);

  update public.patient_medications pm
     set envases_por_mes = null, habilitacion_id = null
   where pm.envases_por_mes is not null or pm.habilitacion_id is not null;
  get diagnostics v_n = row_count;
  insert into _reseteo (que, filas) values ('medicaciones con excepción de reposición o habilitación quitadas', v_n);


  -- 5 · Configuración de reposición inventada del QA ----------------------------------------------------------
  update public.protocol_medications
     set reposicion_modo = null, envases_por_mes = null, stock_fijo = null
   where reposicion_modo is not null or envases_por_mes is not null or stock_fijo is not null;
  get diagnostics v_n = row_count;
  insert into _reseteo (que, filas) values ('medicamentos de estudio con reposición configurada, vaciados', v_n);

  update public.farmacia_ajustes set demora_compra_dias = null, updated_by = null
   where demora_compra_dias is not null or updated_by is not null;
  get diagnostics v_n = row_count;
  insert into _reseteo (que, filas) values ('demora de compra vaciada', v_n);


  -- 6 · Auditoría anterior a la carga ---------------------------------------------------------------------------
  delete from public.audit_log where occurred_at < v_corte;


  -- 7 · Prender de nuevo exactamente los triggers que estaban prendidos ----------------------------------------
  for v_x in select * from _trigger loop
    execute format('alter table public.%I enable trigger %I', v_x.relname, v_x.tgname);
  end loop;


  -- 8 · Controles: si algo de esto no da, se deshace todo -------------------------------------------------------
  select count(*) into v_n from public.enrollments;
  if v_n <> (select count(*) from _carga) then
    raise exception 'Quedaron % inscripciones y tenían que ser %. No se borró nada.', v_n, (select count(*) from _carga);
  end if;
  select count(*) into v_n from public.patients;
  if v_n <> 64 then
    raise exception 'Quedaron % pacientes y tenían que ser 64. No se borró nada.', v_n;
  end if;
  select count(*) into v_n from public.protocols where code = any (v_borrar);
  if v_n > 0 then raise exception 'Quedaron protocolos por borrar. No se borró nada.'; end if;
  select count(*) into v_n from public.protocols;
  if v_n <> cardinality(v_estudios) then
    raise exception 'Quedaron % protocolos y tenían que ser % (los de la prueba). No se borró nada.', v_n, cardinality(v_estudios);
  end if;


  -- 9 · Informe -------------------------------------------------------------------------------------------------
  for v_x in select tabla from _conteo loop
    execute format('select count(*) from public.%I', v_x.tabla) into v_n;
    update _conteo set despues = v_n where tabla = v_x.tabla;
  end loop;

  select concat_ws(E'\n',
    case when v_aplicar then 'LIMPIEZA APLICADA.' else 'SIMULACIÓN — NO SE BORRÓ NADA. Si el informe está bien, corré 2-aplicar.sql.' end,
    'Corte de la auditoría (momento de la carga): ' || to_char(v_corte at time zone 'America/Argentina/Buenos_Aires', 'DD/MM/YYYY HH24:MI:SS'),
    '',
    '== Tablas que cambian (antes → después) ==',
    coalesce((select string_agg(format('%s: %s → %s', tabla, antes, despues), E'\n' order by tabla) from _conteo where antes <> despues), '(ninguna)'),
    '',
    '== Los 72 de la carga, devueltos al Excel ==',
    (select string_agg(format('%s: %s', que, filas), E'\n' order by orden) from _reseteo),
    '',
    '== Tablas que quedan con datos ==',
    coalesce((select string_agg(format('%s: %s', tabla, despues), ' · ' order by tabla) from _conteo where despues > 0), '(ninguna)'),
    '',
    '== Archivos en Storage (se borran a mano, paso 3) ==',
    coalesce((select string_agg(format('%s: %s archivos', bucket_id, n), ' · ') from (select bucket_id, count(*) as n from storage.objects group by bucket_id) b), '(ninguno)')
  ) into v_informe;

  if not v_aplicar then
    raise exception '%', v_informe;
  end if;
end
$limpieza$;

-- Control: lo que queda en cada tabla con datos.
select c.relname as tabla, (xpath('/row/n/text()', query_to_xml(format('select count(*) as n from public.%I', c.relname), false, true, '')))[1]::text::bigint as filas
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind in ('r', 'p')
order by filas desc, tabla;
