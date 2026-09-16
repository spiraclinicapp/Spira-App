-- Spira · Fase 0 de «la baja es por estudio» — corregir lo que ya pasó en producción
-- ============================================================================
-- El 2026-09-16 02:38 UTC se dieron de baja tres pacientes desde ACT18301 usando
-- «Editar paciente › Estado › Inactivo». Esa columna es de la PERSONA, así que los tres
-- aparecieron dados de baja también en LTS17231, que es la extensión de ACT y tiene a las
-- mismas personas inscriptas.
--
-- Los tres NO abandonaron: completaron ACT y pasaron a la extensión. O sea que hay dos cosas
-- que corregir, no una: el estado de la persona (estaba mal) y el de la inscripción a ACT18301
-- (nunca se cerró).
--
-- Los ids salen del `audit_log` y van escritos uno por uno. NO se filtra por
-- `status = 'inactivo'`: eso barrería también bajas legítimas anteriores.
--
-- SÓLO TOCA: patients.status de esos 3 ids, y enrollments.status de sus inscripciones a ACT18301.
-- NO toca visitas, ni LTS17231, ni ningún otro paciente.
--
-- APLICAR: a mano en el SQL Editor de Supabase. IDEMPOTENTE (correrlo dos veces deja lo mismo).
-- Las sentencias NO comparten sesión ni transacción en ese editor: por eso todo va en un único
-- bloque `do`, y por eso cada consulta de control repite su propia lista de ids.
-- ============================================================================

do $fase0$
declare
  v_ids uuid[] := array[
    'a9265265-9be4-4c18-88c1-6ca9a08d6e24',  -- Ricardo Lucio Aguero
    '852f9d61-6b08-4154-9284-ef78cf8f3e90',  -- Andres Muñoz Pampillon
    'd0c14b37-6d9f-40ea-b6b3-64704220ac99'   -- Maria Julieta Calderon
  ];
  v_act uuid;
  v_n   int;
begin
  select p.id into v_act from public.protocols p where p.code = 'ACT18301';
  if v_act is null then
    raise exception 'No encontré el protocolo ACT18301. No se cambió nada.';
  end if;

  -- 1 · La persona vuelve a estar en seguimiento. El `where status` evita escribir (y dejar una
  --     fila en audit_log) si alguien ya la corrigió a mano.
  update public.patients
     set status = 'activo'
   where id = any (v_ids)
     and status <> 'activo';
  get diagnostics v_n = row_count;
  raise notice 'Pacientes devueltos a activo: %', v_n;

  -- 2 · La inscripción a ACT18301 queda CERRADA como corresponde: completaron y pasaron a la
  --     extensión. `completado` y no `discontinuado`: no abandonaron, y en una app auditable esa
  --     diferencia es el dato.
  update public.enrollments e
     set status = 'completado'
   where e.patient_id = any (v_ids)
     and e.protocol_id = v_act
     and e.status not in ('completado', 'discontinuado');
  get diagnostics v_n = row_count;
  raise notice 'Inscripciones a ACT18301 marcadas completadas: %', v_n;
end
$fase0$;


-- Control 1 · Los tres, con TODAS sus inscripciones. Esperado: persona «activo», ACT18301
--             «completado», LTS17231 como estuviera (activo).
select pa.full_name as paciente, pa.status as persona,
       p.code as estudio, e.status as inscripcion
from public.patients pa
join public.enrollments e on e.patient_id = pa.id
join public.protocols p   on p.id = e.protocol_id
where pa.id in ('a9265265-9be4-4c18-88c1-6ca9a08d6e24',
                '852f9d61-6b08-4154-9284-ef78cf8f3e90',
                'd0c14b37-6d9f-40ea-b6b3-64704220ac99')
order by pa.full_name, p.code;


-- Control 2 · Qué visitas futuras sin atender les quedan en ACT18301. NO se borran acá: el borrado
--             lo hace `close_enrollment` (0127) con el número a la vista. Esto es para saber de
--             cuántas estamos hablando antes de que exista el botón.
select pa.full_name as paciente,
       count(*) filter (where pv.window_end >= current_date) as futuras,
       count(*) filter (where pv.window_end <  current_date) as vencidas
from public.patient_visits pv
join public.enrollments e on e.id = pv.enrollment_id
join public.patients   pa on pa.id = e.patient_id
join public.protocols   p on p.id = e.protocol_id
where pa.id in ('a9265265-9be4-4c18-88c1-6ca9a08d6e24',
                '852f9d61-6b08-4154-9284-ef78cf8f3e90',
                'd0c14b37-6d9f-40ea-b6b3-64704220ac99')
  and p.code = 'ACT18301'
  and pv.real_date is null
group by pa.full_name
order by pa.full_name;
