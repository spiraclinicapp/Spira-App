-- Spira · Migración 0083 — Las vistas de Reportes de Farmacia.
-- Aplicar A MANO en el SQL Editor (como postgres), después de la 0082. IDEMPOTENTE.
--
-- QUÉ HABILITA: la pantalla Farmacia › Reportes (hoy cae al Placeholder).
--
-- ADITIVA: crea vistas nuevas y un índice; no toca ninguna tabla ni ninguna vista existente.
-- Por eso va ANTES del deploy del front (regla del CLAUDE.md: lo aditivo primero, porque el
-- que no funciona sin la migración es el front nuevo). Tampoco agrega ninguna FK, así que no
-- puede disparar el PGRST201 de la 0076 sobre los embeds sin calificar del front.
--
-- ── LAS TRES DECISIONES QUE EXPLICAN LA FORMA DE ESTAS VISTAS ─────────────────────────────
--
-- 1 · NINGUNA JOINEA `patient_visits`. Farmacia no tiene policy de select sobre esa tabla
--     (0006:162) y estas vistas son `security_invoker`, así que el join filtraría en silencio
--     y devolvería CERO filas: la pantalla mostraría todo en cero, para siempre, sin un error.
--     Llegan al paciente y al protocolo por `dispensation_requests.enrollment_id` / `.protocol_id`,
--     desnormalizados en la 0082 y la 0071 justamente para esto.
--
-- 2 · LAS UNIDADES SALEN DEL LIBRO, no de los renglones. `stock_movements` es insert-only y es
--     lo que REALMENTE salió del estante; `dispensation_items` se borra en los caminos de
--     cancelación y reversión (0054, 0055, 0057, 0058, 0071). Para lo entregado hoy coinciden
--     —`entregada` es irreversible desde la 0073—, pero el libro es la fuente que no depende de
--     esa coincidencia.
--
-- 3 · KITS Y UNIDADES NO SE SUMAN. El producto de investigación entra por
--     `medication_receptions.total_kits` (0038) y sale por `dispensations.ip_kits` (0071), en
--     KITS, sin lote y sin pasar por `stock_movements`. Un kit no es un comprimido: su
--     composición la declara el sponsor y Spira no la reinterpreta (principio de la 0038). Por eso
--     `ip_kits` viaja como columna aparte y NUNCA entra en `unidades`.
--     OJO AL USARLA: `ip_kits` es por DISPENSACIÓN, y la vista de renglones tiene una fila por
--     (dispensación × medicamento). Sumar la columna sobre las filas DUPLICA los kits de toda
--     dispensación con más de un medicamento. Hay que sumarla sobre dispensaciones DISTINTAS.
-- ============================================================================


-- 1 · Índice para el salto del libro a la dispensación.
--     `stock_movements.reference_id` no es FK y no tenía índice (0005:22-23 sólo cubre
--     `medication_id` y `created_at`), así que el join de la vista de renglones lo necesita.
--     Parcial: sólo las filas de dispensación, que son las únicas que la vista mira.
create index if not exists idx_stock_movements_dispensation
  on public.stock_movements (reference_id)
  where reference_type = 'dispensation' and movement_type = 'dispensacion';


-- 2 · LA VISTA DE RENGLONES — el hecho base del reporte.
--     Grano: una fila por (dispensación entregada × medicamento). El `left join lateral` es
--     deliberado: una dispensación de SOLO producto de investigación no tiene ningún movimiento
--     de stock, así que sin el LEFT no aparecería y sus kits no se contarían. Esas filas salen
--     con `medication_id` en null y `unidades` en 0.
--
--     De acá el front deriva TODO el eje de unidades sin volver a consultar: la serie diaria
--     (agrupando por fecha), el total, las tablas por protocolo y por medicamento, y los conteos
--     de dispensaciones y pacientes distintos (contando ids distintos, no sumando filas).
--     Un solo snapshot alimenta la pantalla y las catorce hojas impresas, así que papel y
--     pantalla no pueden divergir aunque alguien entregue medicación mientras tanto.
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
  d.ip_kits,                            -- por DISPENSACIÓN: ver la advertencia de la cabecera
  -- Minutos entre que la farmacéutica abrió la dispensación y el retiro. Se llama "hasta la
  -- entrega" y no "de preparación" porque incluye la espera del paciente: no hay marca de
  -- "lista" separada, así que medir sólo la preparación exigiría una columna que no existe.
  -- El nombre dice lo que el número es.
  greatest(0, round(extract(epoch from (d.delivered_at - d.created_at)) / 60))::int
                                        as minutos_hasta_entrega,
  -- Lo que Coordinación PIDIÓ para este pedido, para el cumplimiento. También por PEDIDO, no por
  -- renglón: misma trampa que ip_kits, se suma sobre dispensaciones distintas.
  coalesce(sol.unidades, 0)             as unidades_solicitadas,
  dr.id                                 as request_id,
  dr.protocol_id,
  pr.code                               as protocol_code,
  pr.name                               as protocol_name,
  pr.sponsor,
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
  -- Un renglón por medicamento, ya sumado sobre los lotes: la partición entre lotes no existe
  -- en v1 (0050) pero la suma la deja lista para cuando exista, sin cambiar el grano.
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
   patient_visits a propósito (Farmacia no puede leerla): llega al paciente por enrollment_id.
   security_invoker. 0083.';

revoke all on public.v_pharma_report_items from anon;
grant select on public.v_pharma_report_items to authenticated;
revoke insert, update, delete, truncate, references, trigger on public.v_pharma_report_items from authenticated;


-- 3 · LA VISTA DE RECEPCIONES — el otro lado del balance.
--     Grano: una fila por recepción verificada. Las de protocolo y ambulatoria traen unidades y
--     lotes desde `reception_items`; las de investigación traen `total_kits` y NO pasan por
--     `reception_items` (ingreso macro de la 0038), así que salen con 0 unidades y sus kits en
--     la columna propia. Misma regla que la salida: no se suman entre sí.
drop view if exists public.v_pharma_report_receptions;
create view public.v_pharma_report_receptions with (security_invoker = true) as
select
  mr.id                                 as reception_id,
  mr.reception_date                     as fecha,
  mr.tipo,
  mr.status,
  mr.protocol_id,
  pr.code                               as protocol_code,
  mr.total_kits,                        -- sólo tipo 'investigacion'
  coalesce(it.unidades, 0)              as unidades,
  coalesce(it.lotes, 0)                 as lotes
from public.medication_receptions mr
left join public.protocols pr on pr.id = mr.protocol_id
left join lateral (
  select sum(ri.quantity)::int as unidades, count(distinct ri.lot_number)::int as lotes
    from public.reception_items ri
   where ri.reception_id = mr.id
) it on true
where mr.status = 'verificada';

comment on view public.v_pharma_report_receptions is
  'Ingresos verificados del período para Reportes de Farmacia. Las recepciones de investigación
   traen total_kits y cero unidades (ingreso macro, 0038): kits y unidades no se suman entre sí.
   security_invoker. 0083.';

revoke all on public.v_pharma_report_receptions from anon;
grant select on public.v_pharma_report_receptions to authenticated;
revoke insert, update, delete, truncate, references, trigger on public.v_pharma_report_receptions from authenticated;


-- 4 · LA VISTA DE PEDIDOS RECHAZADOS O CANCELADOS.
--     Va aparte y cuenta PEDIDOS, nunca unidades: los renglones de un pedido cancelado se borran
--     (0054:330 y siguientes), así que las unidades involucradas ya no existen en ningún lado.
--     Informar "unidades rechazadas" sería inventar un número.
drop view if exists public.v_pharma_report_rejected;
create view public.v_pharma_report_rejected with (security_invoker = true) as
select
  dr.id                                 as request_id,
  (dr.updated_at at time zone 'America/Argentina/Buenos_Aires')::date as fecha,
  dr.status,
  dr.rejection_reason,
  dr.protocol_id,
  pr.code                               as protocol_code
from public.dispensation_requests dr
left join public.protocols pr on pr.id = dr.protocol_id
where dr.status in ('rechazada', 'cancelada');

comment on view public.v_pharma_report_rejected is
  'Pedidos rechazados o cancelados del período. Cuenta PEDIDOS, no unidades: los renglones se
   borran al cancelar (0054), así que las unidades ya no existen. security_invoker. 0083.';

revoke all on public.v_pharma_report_rejected from anon;
grant select on public.v_pharma_report_rejected to authenticated;
revoke insert, update, delete, truncate, references, trigger on public.v_pharma_report_rejected from authenticated;


-- 4.b · STOCK VENCIDO SIN USAR.
--     No es un dato del PERÍODO sino del día de hoy: un lote vencido lo está ahora, no "durante
--     julio". Por eso va en su propia vista y el rótulo en pantalla lo dice.
drop view if exists public.v_pharma_report_expired;
create view public.v_pharma_report_expired with (security_invoker = true) as
select
  ml.id                                 as lot_id,
  ml.medication_id,
  m.name                                as medication_name,
  ml.lot_number,
  ml.expiry_date,
  ml.protocol_id,
  pr.code                               as protocol_code,
  ml.quantity_on_hand                   as unidades
from public.medication_lots ml
join public.medications m on m.id = ml.medication_id
left join public.protocols pr on pr.id = ml.protocol_id
where ml.expiry_date is not null
  and ml.expiry_date < current_date
  and ml.quantity_on_hand > 0;

comment on view public.v_pharma_report_expired is
  'Lotes vencidos que todavía tienen stock: medicación inmovilizada. Es un corte AL DÍA DE HOY, no
   del período del reporte. security_invoker. 0083.';

revoke all on public.v_pharma_report_expired from anon;
grant select on public.v_pharma_report_expired to authenticated;
revoke insert, update, delete, truncate, references, trigger on public.v_pharma_report_expired from authenticated;


notify pgrst, 'reload schema';


-- 5 · Verificación (correr después, en sentencias aparte).
--
--   -- a) La vista ve exactamente lo mismo que el libro. Sin recorte de fechas a propósito: la
--   --    vista fecha por `delivered_at` y el libro por su propio `created_at`, y aunque los dos
--   --    se sellan en la misma transacción, un recorte podría partirlos en el borde de medianoche
--   --    y hacer fallar la verificación sin que haya nada mal. Sobre el total no hay borde.
--   --    Tiene que dar la misma cifra en las dos columnas.
--   select
--     (select coalesce(sum(unidades), 0) from public.v_pharma_report_items)      as segun_la_vista,
--     (select coalesce(sum(-sm.quantity_delta), 0) from public.stock_movements sm
--       where sm.movement_type = 'dispensacion')                                 as segun_el_libro;
--
--   -- b) Ninguna fila entregada puede quedar sin paciente ni sin protocolo.
--   select count(*) as filas_sin_alcance
--     from public.v_pharma_report_items
--    where enrollment_id is null or protocol_id is null;
