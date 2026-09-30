-- Spira · Medicación de LTS17231 copiada de ACT18301 — 1 · SIMULAR (no guarda nada)
-- ============================================================================
-- GENERADO por supabase/scripts/medicacion-lts-desde-act/generar.mjs. No editar a mano: el porqué de cada paso
-- está en la cabecera del generador.
--
-- Pedido del Director (2026-09-29): a los cinco pacientes activos de LTS17231 sin medicación, asignarles la
-- misma medicación de base que tienen en ACT18301 (mismo paciente, estudio nuevo).
--   032001520004 Octavio Fontana Toledo
--   032001520005 Rosa del Carmen Ríos
--   032001520006 Hugo Roberto Sarmiento
--   032001520007 Eva Pamela Gossuin
--   032001520008 Rony Oscar Reyes Yañes
--
-- ORDEN:
--   1. 1-simular.sql → leer el informe (sale como «error» a propósito: es la forma de deshacer todo).
--   2. 2-aplicar.sql → el mismo bloque, que esta vez guarda. Al final, un select de control.
--
-- SIMULA. Hace todo y lo deshace al final con raise exception: el mensaje ES el informe.
-- ============================================================================

do $medlts$
declare
  v_aplicar   boolean := false;
  v_destino   text    := 'LTS17231';
  v_origen    text    := 'ACT18301';
  v_ivrs      text[]  := array['032001520004', '032001520005', '032001520006', '032001520007', '032001520008'];
  v_proto_dst uuid;
  v_proto_org uuid;
  v_by        uuid;
  v_by_name   text;
  v_frenos    text;
  v_x         record;
  v_n         int;
  v_informe   text := '';
  v_asociados text;
begin
  select p.id into v_proto_dst from public.protocols p where p.code = v_destino;
  select p.id into v_proto_org from public.protocols p where p.code = v_origen;
  if v_proto_dst is null or v_proto_org is null then
    raise exception 'No encuentro los estudios % y %. No se cambió nada.', v_destino, v_origen;
  end if;

  select u.id, u.full_name into v_by, v_by_name
  from public.users u join public.user_module_roles r on r.user_id = u.id
  where r.module = 'gerencia' order by u.created_at limit 1;
  if v_by is null then raise exception 'No hay un usuario de gerencia a quién atribuir la carga. No se cambió nada.'; end if;

  -- Frenos: cada IVRS tiene que existir en el destino, vivo, y la persona tiene que tener medicación en el origen.
  select string_agg(format('%s: %s', q.ivrs, q.motivo), E'\n' order by q.ivrs) into v_frenos
  from (
    select i.ivrs,
           case
             when d.id is null then 'no hay inscripción en ' || v_destino
             when d.status not in ('screening', 'activo') then 'la inscripción en ' || v_destino || ' está ' || d.status
             when o.id is null then 'no tiene inscripción en ' || v_origen
             when not exists (select 1 from public.patient_medications pm
                              where pm.enrollment_id = o.id and pm.active and pm.habilitacion_id is null)
               then 'no tiene medicación de base activa en ' || v_origen
           end as motivo
    from unnest(v_ivrs) as i(ivrs)
    left join public.enrollments d on d.protocol_id = v_proto_dst and d.ivrs_code = i.ivrs
    left join public.enrollments o on o.protocol_id = v_proto_org and o.patient_id = d.patient_id
  ) q
  where q.motivo is not null;
  if v_frenos is not null then
    raise exception E'Frenado, no se cambió nada:\n%', v_frenos;
  end if;

  -- Los medicamentos que hace falta asociar a LTS17231 antes de asignarlos (sólo de las que se van a copiar).
  select string_agg(distinct md.name, ', ' order by md.name) into v_asociados
  from unnest(v_ivrs) as i(ivrs)
  join public.enrollments d on d.protocol_id = v_proto_dst and d.ivrs_code = i.ivrs
  join public.enrollments o on o.protocol_id = v_proto_org and o.patient_id = d.patient_id
  join public.patient_medications pm on pm.enrollment_id = o.id and pm.active and pm.habilitacion_id is null
  join public.medications md on md.id = pm.medication_id
  where not exists (select 1 from public.patient_medications x
                    where x.enrollment_id = d.id and x.active and x.habilitacion_id is null)
    and not exists (select 1 from public.protocol_medications pr
                    where pr.protocol_id = v_proto_dst and pr.medication_id = pm.medication_id);

  insert into public.protocol_medications (protocol_id, medication_id)
  select distinct v_proto_dst, pm.medication_id
  from unnest(v_ivrs) as i(ivrs)
  join public.enrollments d on d.protocol_id = v_proto_dst and d.ivrs_code = i.ivrs
  join public.enrollments o on o.protocol_id = v_proto_org and o.patient_id = d.patient_id
  join public.patient_medications pm on pm.enrollment_id = o.id and pm.active and pm.habilitacion_id is null
  where not exists (select 1 from public.patient_medications x
                    where x.enrollment_id = d.id and x.active and x.habilitacion_id is null)
  on conflict (protocol_id, medication_id) do nothing;

  -- Una por una, para que el informe diga qué le tocó a cada persona.
  for v_x in
    select i.ivrs, pa.full_name, d.id as dst, o.id as org, o.ivrs_code as ivrs_org,
           exists (select 1 from public.patient_medications x
                   where x.enrollment_id = d.id and x.active and x.habilitacion_id is null) as ya_tenia
    from unnest(v_ivrs) as i(ivrs)
    join public.enrollments d on d.protocol_id = v_proto_dst and d.ivrs_code = i.ivrs
    join public.enrollments o on o.protocol_id = v_proto_org and o.patient_id = d.patient_id
    join public.patients pa   on pa.id = d.patient_id
    order by pa.full_name
  loop
    if v_x.ya_tenia then
      v_informe := v_informe || format(E'\n· %s (%s): ya tenía medicación en %s, no se toca.', v_x.full_name, v_x.ivrs, v_destino);
      continue;
    end if;

    -- Si hubiera una fila inactiva del mismo medicamento (única por inscripción y medicamento), se reactiva.
    insert into public.patient_medications (enrollment_id, medication_id, assigned_by, active, notes)
    select v_x.dst, pm.medication_id, v_by, true,
           format('Copiada de %s (IVRS %s) el 2026-09-29: mismo paciente, estudio nuevo.', v_origen, v_x.ivrs_org)
    from public.patient_medications pm
    where pm.enrollment_id = v_x.org and pm.active and pm.habilitacion_id is null
    on conflict (enrollment_id, medication_id) do update set active = true, habilitacion_id = null;
    get diagnostics v_n = row_count;

    v_informe := v_informe || format(E'\n· %s (%s): %s medicamento%s — %s', v_x.full_name, v_x.ivrs, v_n,
      case when v_n = 1 then '' else 's' end,
      (select string_agg(md.name, ', ' order by md.name)
         from public.patient_medications pm join public.medications md on md.id = pm.medication_id
        where pm.enrollment_id = v_x.dst and pm.active and pm.habilitacion_id is null));
  end loop;

  v_informe := format(E'%s: medicación copiada de %s (autor: %s).%s', v_destino, v_origen, v_by_name, v_informe)
    || case when v_asociados is null then E'\n\nNo hizo falta asociar ningún medicamento nuevo a ' || v_destino || '.'
            else E'\n\nSe asocian a ' || v_destino || ' (Reposición los va a mostrar «sin cargar»): ' || v_asociados end;

  if not v_aplicar then
    raise exception E'SIMULACRO — no se guardó nada. Esto es lo que haría 2-aplicar.sql:\n\n%', v_informe;
  end if;
  raise notice '%', v_informe;
end
$medlts$;
