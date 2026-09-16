-- Spira · PASO 0 — Renumerar los IVRS de LTS17231 — 1 · SIMULAR (no guarda nada)
-- ============================================================================
-- GENERADO por supabase/scripts/renumerar-lts17231/generar.mjs. No editar a mano.
--
-- ORDEN EN PROD:
--   1. out/1-simular.sql de ACÁ  → leer el informe (sale como «error» a propósito: es el deshacer)
--   2. out/2-aplicar.sql de ACÁ
--   3. pacientes-prueba-real/out/1-simular.sql y 2-aplicar.sql
--   4. entregas-y-procedimientos/out/1-simular.sql y 2-aplicar.sql
--
-- SIMULA. Hace el cambio y lo deshace al final con raise exception: el mensaje ES el informe.
--
-- QUÉ HACE: le cambia el ivrs_code a seis inscripciones de LTS17231, y nada más. A cada paciente lo
-- encuentra por su IVRS de ACT18301, que no cambió; el número viejo se usa sólo como control.
--
-- ⚠️ NUNCA dos signos peso pegados dentro de un comentario (ver CLAUDE.md, 0071).
-- ============================================================================

do $renum$
declare
  v_aplicar boolean := false;
  v_mapa    jsonb := '[{"ancla":"032001500005","viejo":"032001520005","nuevo":"032001520003"},{"ancla":"032001500006","viejo":"032001520006","nuevo":"032001520004"},{"ancla":"032001500007","viejo":"032001520007","nuevo":"032001520005"},{"ancla":"032001500008","viejo":"032001520008","nuevo":"032001520006"},{"ancla":"032001500009","viejo":"032001520009","nuevo":"032001520007"},{"ancla":"032001500010","viejo":"032001520010","nuevo":"032001520008"}]'::jsonb;
  v_lts     uuid;
  v_act     uuid;
  v_m       record;
  v_pid     uuid;
  v_nombre  text;
  v_actual  text;
  v_otro    text;
  v_n       int;
  v_informe text;
begin
  select id into v_lts from public.protocols where code = 'LTS17231';
  select id into v_act from public.protocols where code = 'ACT18301';
  if v_lts is null or v_act is null then
    raise exception 'Falta LTS17231 o ACT18301 en protocols. No se cambió nada.';
  end if;

  create temp table _linea (n serial, texto text) on commit drop;

  for v_m in select * from jsonb_to_recordset(v_mapa) as x(ancla text, viejo text, nuevo text)
  loop
    -- El paciente, por su inscripción de ACT18301 (la que no se renumera).
    select e.patient_id, pa.full_name into v_pid, v_nombre
    from public.enrollments e
    join public.patients pa on pa.id = e.patient_id
    where e.protocol_id = v_act and e.ivrs_code = v_m.ancla;
    if v_pid is null then
      raise exception 'No encontré en ACT18301 al paciente con IVRS %. No se cambió nada.', v_m.ancla;
    end if;

    -- Su inscripción de LTS17231.
    select e.ivrs_code into v_actual
    from public.enrollments e where e.protocol_id = v_lts and e.patient_id = v_pid;
    if not found then
      raise exception '% (ACT18301 %) no tiene inscripción en LTS17231. No se cambió nada.', v_nombre, v_m.ancla;
    end if;

    if v_actual = v_m.nuevo then
      insert into _linea (texto) values (format('%s · ya estaba en %s', v_nombre, v_m.nuevo));
      continue;
    end if;

    -- El número viejo es CONTROL, no identidad: si prod dice otra cosa, algo no es lo que creemos.
    if v_actual is distinct from v_m.viejo then
      raise exception '% tiene en LTS17231 el IVRS «%», y esperaba «%» (o el nuevo «%»). No se cambió nada.',
        v_nombre, coalesce(v_actual, 'sin IVRS'), v_m.viejo, v_m.nuevo;
    end if;

    -- El número nuevo no puede estar ocupado por otro. No hay índice único sobre ivrs_code, así que este
    -- chequeo es la única red: sin él, dos inscripciones del mismo estudio podrían quedar con el mismo IVRS.
    select pa.full_name into v_otro
    from public.enrollments e join public.patients pa on pa.id = e.patient_id
    where e.protocol_id = v_lts and e.ivrs_code = v_m.nuevo and e.patient_id <> v_pid;
    if v_otro is not null then
      raise exception 'No puedo darle % a %: ese IVRS de LTS17231 ya es de %. No se cambió nada.',
        v_m.nuevo, v_nombre, v_otro;
    end if;

    update public.enrollments set ivrs_code = v_m.nuevo
    where protocol_id = v_lts and patient_id = v_pid;
    insert into _linea (texto) values (format('%s · %s → %s', v_nombre, v_m.viejo, v_m.nuevo));
  end loop;

  -- Control final: ningún IVRS repetido dentro de LTS17231.
  select count(*) into v_n from (
    select e.ivrs_code from public.enrollments e
    where e.protocol_id = v_lts and e.ivrs_code is not null
    group by e.ivrs_code having count(*) > 1) d;
  if v_n > 0 then
    raise exception 'Quedaron % IVRS repetidos en LTS17231. No se cambió nada.', v_n;
  end if;

  select concat_ws(E'\n',
    case when v_aplicar then 'RENUMERACIÓN APLICADA.' else 'SIMULACIÓN — NO SE GUARDÓ NADA. Si el informe está bien, corré out/2-aplicar.sql.' end,
    '',
    '== Inscripciones de LTS17231 ==',
    coalesce((select string_agg(texto, E'\n' order by n) from _linea), '(ninguna)'),
    '',
    '== Cómo queda LTS17231 ==',
    (select string_agg(format('%s · %s (%s)', e.ivrs_code, pa.full_name, e.status), E'\n' order by e.ivrs_code)
     from public.enrollments e join public.patients pa on pa.id = e.patient_id where e.protocol_id = v_lts)
  ) into v_informe;

  if not v_aplicar then
    raise exception '%', v_informe;
  end if;
end
$renum$;
