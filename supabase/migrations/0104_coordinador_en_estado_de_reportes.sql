-- ============================================================================
-- 0104 · Coordinador en el estado de reportes
--
-- QUÉ HACE: agrega dos columnas al final de `v_protocol_report_status` (0090)
--   · coordinator_id
--   · coordinator_name
--
-- PARA QUÉ: el Resumen de Coordinación pasa a abrir filtrado a lo de cada quien ("Lo mío"), y para
-- la tarjeta de Reportes pendientes "mío" significa las visitas que YO atendí. Las otras tres
-- tarjetas ya pueden decidirlo solas: las alertas y las próximas visitas salen de `v_track_visits`,
-- que expone el coordinador desde la 0065, y las dispensaciones tienen `requested_by` en su tabla.
-- Ésta era la única fuente sin el dato.
--
-- DE DÓNDE SALEN LOS DATOS: las dos columnas ya viven en `patient_visits` (0065) y la vista ya tiene
-- esa tabla joineada como `pv`. No se crea ni se backfillea nada: esto sólo las PROYECTA. Una visita
-- sin coordinador asignado devuelve null, que es la verdad — el front lo trata como "de nadie" y
-- nunca como "mía" (ver `views/resumen/ambito.ts`).
--
-- CREATE OR REPLACE Y NO DROP + CREATE: el select de la 0090 tiene las columnas EXPLÍCITAS, sin
-- ningún `*` re-expandido, así que las dos nuevas van al final sin correr el orden anterior — que es
-- el único cambio que `replace` acepta. (Es lo que obligó a la 0102 a hacer drop+create y lo que la
-- 0103 sí pudo evitar.) Se prefiere porque no deja ninguna ventana con la vista inexistente y porque
-- `replace` no pierde los grants, cosa que un drop sí haría.
--
-- EL `with (security_invoker = true)` SE REPITE, Y NO ES DECORATIVO: es lo que hace que la RLS de
-- las tablas de abajo filtre por usuario. Una vista sin eso corre con los permisos de su dueño, y
-- entonces CUALQUIERA vería los reportes de TODOS los protocolos. Esa fuga no se ve mirando la
-- pantalla, porque se ve MÁS dato y no menos.
--
-- QUÉ MÁS LEE ESTA VISTA, verificado antes de tocarla:
--   · el front, con `select('*')` en tres puntos de `src/data/reportStatus.ts` (:92, :110, :179) —
--     recibir dos campos de más es inofensivo: el tipo de TypeScript no los declara hasta usarlos;
--   · ninguna otra vista ni función SQL cuelga de ella.
--
-- ORDEN DE DESPLIEGUE: ADITIVA → esta migración va PRIMERO y el front después. Ningún front
-- desplegado pide estas columnas, así que el que no funciona sin ella es el código nuevo.
--
-- APLICAR A MANO en el SQL Editor de Supabase (rol postgres), DESPUÉS de la 0103. IDEMPOTENTE.
-- Registrar en supabase/README.md al confirmarse en prod.
-- ============================================================================

create or replace view public.v_protocol_report_status with (security_invoker = true) as
select
  pv.id as visit_id,
  rd.id                as report_definition_id,
  rd.name              as report_name,
  rd.platform,
  rd.link,
  rd.eta_hours,
  rd.notes,
  rd.sort_order,
  pa.procedure_id,
  p.name               as procedure_name,
  p.code               as procedure_code,
  p.category           as procedure_category,
  pa.suggested_order   as procedure_order,
  vpc.completed_at,
  (vpc.id is not null)                                as completed,
  (pv.real_date is not null or vpc.id is not null)    as visita_iniciada,
  case when rd.eta_hours is null or vpc.completed_at is null then null
       else vpc.completed_at + (rd.eta_hours * interval '1 hour') end as due_at,
  coalesce(rs.stage, 'pendiente') as stage,
  rs.id                as report_status_id,
  rs.updated_at,
  rs.updated_by_name,
  e.protocol_id,
  e.patient_id,
  pv.visit_def_id,
  pr.code              as protocol_code,
  pac.code             as patient_code,
  pac.full_name        as patient_name,
  vd.code              as visit_code,
  vd.name              as visit_name,
  vd.sort_order        as visit_sort_order,
  (select count(*) from public.report_status_history h where h.report_status_id = rs.id) as history_count,
  -- ── 0104: las dos nuevas, al final para no alterar el orden anterior ──
  pv.coordinator_id,
  pv.coordinator_name
from public.patient_visits pv
join public.enrollments e             on e.id  = pv.enrollment_id
join public.protocol_activities pa    on pa.visit_def_id = pv.visit_def_id
join public.protocol_procedures pp    on pp.protocol_id = e.protocol_id and pp.procedure_id = pa.procedure_id
join public.report_definitions rd     on rd.protocol_procedure_id = pp.id
join public.procedures p              on p.id  = pa.procedure_id
join public.protocols pr              on pr.id = e.protocol_id
join public.patients pac              on pac.id = e.patient_id
left join public.visit_definitions vd on vd.id = pv.visit_def_id
left join public.visit_procedure_completions vpc
       on vpc.visit_id = pv.id and vpc.procedure_id = pa.procedure_id
left join public.report_status rs     on rs.visit_id = pv.id and rs.report_definition_id = rd.id;

comment on view public.v_protocol_report_status is
  'Una fila por reporte de una visita realizada: definición + etapa + vencimiento + paciente/visita desnormalizados. Alimenta el tablero de Reportes pendientes. 0090; ampliada por la 0104 con coordinator_id/coordinator_name, para que el Resumen pueda filtrar a "las visitas que yo atendí". La RLS sigue siendo la de las tablas de abajo (security_invoker).';

-- Los grants se repiten por prolijidad: `create or replace view` NO los pierde, pero un drop+create
-- sí, y este bloque tiene que seguir siendo correcto si algún día alguien lo convierte en uno.
revoke all on public.v_protocol_report_status from anon;
grant select on public.v_protocol_report_status to authenticated;
revoke insert, update, delete, truncate, references, trigger on public.v_protocol_report_status from authenticated;
