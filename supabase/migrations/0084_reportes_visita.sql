-- Spira · Migración 0084 — El código de la visita, en el detalle de Reportes.
-- Aplicar A MANO en el SQL Editor (como postgres), después de la 0083. IDEMPOTENTE.
--
-- QUÉ HABILITA: la columna "Visita" de la tabla de detalle y de la hoja impresa de
-- dispensaciones. Pedido del Director: saber a qué visita del protocolo corresponde cada
-- entrega, que es el contexto que la farmacéutica usa para ubicarla.
--
-- POR QUÉ HACE FALTA UNA MIGRACIÓN PARA UNA COLUMNA DE TEXTO. Es el mismo muro de siempre: el
-- código de la visita vive en `visit_definitions`, y el único camino hasta ahí desde un pedido
-- pasa por `patient_visits`, sobre la que Farmacia NO tiene policy de select (0006:162). En una
-- vista `security_invoker` ese join no da error: la RLS filtra en silencio y se lleva puesta la
-- fila entera. Tercera vez que aparece —protocolo en la 0071, enrolamiento en la 0082, visita
-- acá— y se resuelve igual: el dato que la vista necesita viaja en la fila.
--
-- ES UN SNAPSHOT, Y ESO ES LO CORRECTO. `visit_definitions.code` se puede editar desde la
-- gestión del cronograma (0026). Guardar el código DE ENTONCES es lo que corresponde en un
-- sistema auditable: el reporte de julio tiene que seguir diciendo lo que decía en julio, no lo
-- que el cuadro de actividades diga hoy. Mismo criterio que `visit_comments.author_name` (0048)
-- y `patient_visits.coordinator_name` (0065).
--
-- ADITIVA: columna nullable y una columna nueva al final de la vista. El front desplegado la
-- ignora, así que va ANTES del deploy.
-- ============================================================================


-- 1 · La columna.
alter table public.dispensation_requests
  add column if not exists visit_code text;

comment on column public.dispensation_requests.visit_code is
  'Código de la visita (visit_definitions.code, o el nombre si no tiene código), sellado al crear
   el pedido. Snapshot a propósito: el cuadro de actividades se puede editar y el reporte de un
   período tiene que seguir diciendo lo que decía entonces. Farmacia no puede leer patient_visits,
   así que sin esta columna la vista de Reportes no tendría por dónde llegar. 0084.';


-- 2 · Backfill, con el trigger de `updated_at` APAGADO.
--     Mismo motivo que en la 0071 y la 0082: `trg_requests_updated_at` (0003:29) sella
--     `updated_at = now()` en cada update, y el tablero y el historial de Farmacia ordenan por
--     esa columna. Un backfill con el trigger vivo arrastraría el histórico entero al día de la
--     migración. El apagado es transaccional: si algo falla, el trigger vuelve solo.
alter table public.dispensation_requests disable trigger trg_requests_updated_at;

update public.dispensation_requests dr
   set visit_code = coalesce(vd.code, vd.name)
  from public.patient_visits pv
  join public.visit_definitions vd on vd.id = pv.visit_def_id
 where pv.id = dr.visit_id
   and dr.visit_code is null;          -- idempotente: en la segunda corrida no toca ninguna fila

alter table public.dispensation_requests enable trigger trg_requests_updated_at;


-- 3 · El trigger de sellado ahora sella TRES columnas.
--     `create or replace` sin cambio de firma, así que reemplaza de verdad (no deja una
--     sobrecarga viva). El trigger `trg_seal_request_scope` de la 0082 no se toca: sigue
--     apuntando a esta misma función.
--
--     `coalesce(vd.code, vd.name)`: el código es NULLABLE en `visit_definitions` ("V1", "CT1" son
--     display corto y pueden faltar), pero el nombre no. Antes de mostrar un guion, mostramos el
--     nombre de la visita, que es información de verdad.
create or replace function public.seal_request_scope()
returns trigger language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_enrollment_id uuid; v_protocol_id uuid; v_visit_code text;
begin
  if new.enrollment_id is null or new.protocol_id is null or new.visit_code is null then
    select pv.enrollment_id, e.protocol_id, coalesce(vd.code, vd.name)
      into v_enrollment_id, v_protocol_id, v_visit_code
      from public.patient_visits pv
      join public.enrollments e        on e.id  = pv.enrollment_id
      join public.visit_definitions vd on vd.id = pv.visit_def_id
     where pv.id = new.visit_id;
    -- Si la visita no existe, las columnas quedan en null y el insert muere un instante después
    -- en la FK de `visit_id`: acá no hace falta (ni conviene) un mensaje propio.
    new.enrollment_id := coalesce(new.enrollment_id, v_enrollment_id);
    new.protocol_id   := coalesce(new.protocol_id,   v_protocol_id);
    new.visit_code    := coalesce(new.visit_code,    v_visit_code);
  end if;
  return new;
end; $$;

comment on function public.seal_request_scope() is
  'Sella dispensation_requests.enrollment_id, .protocol_id y .visit_code desde la visita cuando el
   insert no los trae (p. ej. una escritura directa por la policy de Track, sin pasar por el RPC).
   Sin esto, una fila sin sellar desaparece de las vistas de Reportes o sale sin contexto.
   0082, ampliado en 0084.';


-- 4 · La vista de renglones suma la columna.
--     Se recrea entera (drop + create) y no con `create or replace`: es el patrón del repo y
--     evita la trampa de que `create or replace view` sólo admite AGREGAR columnas al final y
--     falla de formas raras si algo más cambió. Nadie más depende de esta vista.
drop view if exists public.v_pharma_report_items;
create view public.v_pharma_report_items with (security_invoker = true) as
select
  d.id                                  as dispensation_id,
  d.correlative_number,
  d.dispensation_code,
  d.delivered_at,
  -- Fecha LOCAL. Sin esto una entrega de las 21:30 cae al día siguiente y la serie diaria
  -- queda corrida. Mismo criterio que v_patient_visits (0004:30) y el resto del repo.
  (d.delivered_at at time zone 'America/Argentina/Buenos_Aires')::date as fecha,
  d.ip_kits,                            -- por DISPENSACIÓN: sumarlo sobre las filas duplica
  greatest(0, round(extract(epoch from (d.delivered_at - d.created_at)) / 60))::int
                                        as minutos_hasta_entrega,
  coalesce(sol.unidades, 0)             as unidades_solicitadas,
  dr.id                                 as request_id,
  dr.protocol_id,
  pr.code                               as protocol_code,
  pr.name                               as protocol_name,
  pr.sponsor,
  dr.visit_code,                        -- 0084
  dr.enrollment_id,
  e.patient_id,
  pa.code                               as patient_code,
  pa.full_name                          as patient_name,
  mov.medication_id,
  m.name                                as medication_name,
  coalesce(mov.unidades, 0)             as unidades
from public.dispensations d
join public.dispensation_requests dr on dr.id = d.request_id
left join public.protocols   pr on pr.id = dr.protocol_id
left join public.enrollments e  on e.id  = dr.enrollment_id
left join public.patients    pa on pa.id = e.patient_id
left join lateral (
  select sum(dri.quantity)::int as unidades
    from public.dispensation_request_items dri
   where dri.request_id = dr.id
) sol on true
left join lateral (
  select sm.medication_id, sum(-sm.quantity_delta)::int as unidades
    from public.stock_movements sm
   where sm.reference_type = 'dispensation'
     and sm.reference_id   = d.id
     and sm.movement_type  = 'dispensacion'
   group by sm.medication_id
) mov on true
left join public.medications m on m.id = mov.medication_id
where d.status = 'entregada'
  and d.delivered_at is not null;

comment on view public.v_pharma_report_items is
  'Hecho base de Reportes de Farmacia: una fila por (dispensación entregada x medicamento).
   Unidades desde stock_movements (libro insert-only). ip_kits es POR DISPENSACIÓN: sumarlo sobre
   estas filas duplica los kits de toda dispensación con más de un medicamento. No joinea
   patient_visits a propósito (Farmacia no puede leerla): llega al paciente por enrollment_id y a
   la visita por visit_code, los dos sellados en la fila del pedido. security_invoker. 0083 + 0084.';

revoke all on public.v_pharma_report_items from anon;
grant select on public.v_pharma_report_items to authenticated;
revoke insert, update, delete, truncate, references, trigger on public.v_pharma_report_items from authenticated;


notify pgrst, 'reload schema';


-- 5 · Verificación (correr después, en sentencias aparte).
--
--   -- a) Ningún pedido con visita puede quedar sin código. Tiene que dar 0.
--   select count(*) as pedidos_sin_visita
--     from public.dispensation_requests where visit_code is null;
--
--   -- b) La columna llegó a la vista y trae contenido.
--   select visit_code, count(*) as filas
--     from public.v_pharma_report_items
--    group by visit_code order by filas desc;
