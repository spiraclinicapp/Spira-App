-- ============================================================================
-- 0115 — El mostrador de Farmacia ve TODAS las visitas del paciente
--
-- Ver docs/superpowers/plans/2026-09-08-dispensacion-libre-vnp.md
--
-- ⚠️ ORDEN DE DESPLIEGUE — ESTA MIGRACIÓN VA **DESPUÉS** DEL DEPLOY DEL FRONT ⚠️
--
-- ESTADO AL LLEGAR ACÁ: la condición YA SE CUMPLIÓ. El archivo se mantuvo deliberadamente fuera
-- del repo hasta que el front estuvo en producción (PR #142 mergeada en main 0446775, deployment
-- de Vercel a Production en `success`, 2026-09-08). Se puede aplicar. El aviso queda escrito
-- porque explica por qué esta migración llegó en una PR aparte y un commit después que la 0114 —
-- si alguien lo lee como una advertencia pendiente, que mire la fecha de arriba.
--
-- Es BREAKING para el front desplegado: le muestra visitas que NO dispensan, y ese front no
-- sabe pedirlas con motivo (llama a create_dispensation_request con cuatro argumentos, sin
-- p_off_schedule_reason). La farmacéutica elegiría una y recibiría "Esta visita no entrega
-- medicación". No corrompe nada, pero es exactamente el patrón que ya mordió con la 0068
-- (2026-08-05) y la 0092 (2026-08-23), y el aviso adentro del .sql llega tarde: para cuando se
-- lee, el archivo ya se abrió para correrlo.
--
-- La otra mitad de esta tanda, la 0114 (registrar_vnp), es puramente ADITIVA y va AL REVÉS:
-- antes del deploy, porque el que no funciona sin ella es el front nuevo.
--
--   1 · aplicar 0114_registrar_vnp.sql
--   2 · desplegar el front
--   3 · aplicar ESTE archivo
--
-- ----------------------------------------------------------------------------
-- QUÉ CAMBIA Y POR QUÉ
--
-- La función (0059) filtraba `coalesce(vd.dispenses, false) = true` con un INNER JOIN contra
-- visit_definitions. Las dos cosas están mal para el caso que importa:
--
--   · El INNER JOIN borra TODA visita suelta. Una VNP nace con visit_def_id NULL
--     (register_visit_event, 0025:76), así que nunca tuvo definición contra la cual joinear.
--     La visita que representa "el paciente vino sin cita" era invisible para Farmacia.
--
--   · El filtro por `dispenses` es MÁS ESTRICTO QUE LA BASE que alimenta. Desde la 0071,
--     create_dispensation_request acepta cualquier visita mientras venga un motivo fuera de
--     cronograma — es lo que Coordinación hace desde el panel de la visita. El candado no
--     estaba en el modelo: estaba en la lista que se le mostraba a la farmacéutica.
--
-- Ahora la función devuelve TODAS las visitas del enrolamiento y le dice al front cuáles pide
-- con motivo (columnas `dispenses` / `dispenses_ip`). La decisión de exigirlo sigue siendo del
-- servidor: la base rechaza igual el pedido sin motivo. Esto solo evita que el front proponga
-- algo que la base va a rechazar.
--
-- POR QUÉ DEVUELVE `kind` Y NO UNA ETIQUETA YA ARMADA: armarla acá duplicaría KIND_LABELS
-- (src/lib/visitLabels.ts) en un `case` de plpgsql. Cuando se sume un visit_kind nuevo,
-- TypeScript obliga a completar el Record<VisitKind, string>; un `case` de SQL no obliga a nada
-- y cae al else, en silencio. El front la arma con `visitTitle`, el mismo helper de Coordinación.
--
-- DROP ANTES DEL CREATE, NO NEGOCIABLE: `create or replace` sobre un `returns table (...)` con
-- columnas nuevas falla con 42P13 (cannot change return type of existing function). No es el
-- caso de la 0113 (una sobrecarga viva por cambio de firma de parámetros): acá Postgres
-- directamente se niega.
--
-- TODO LO NO CALIFICADO ES UN NOMBRE DE `returns table`: dentro de plpgsql los OUT compiten con
-- las columnas (precedente 0056 y 0058, el mismo error dos veces). Cada referencia va con su
-- alias: pv.*, vd.*, dr.*.
--
-- APLICAR: a mano en el SQL Editor de Supabase (rol postgres). IDEMPOTENTE (drop if exists +
-- create). Registrar en supabase/README.md al confirmarse en prod.
-- ============================================================================

drop function if exists public.visitas_dispensables(uuid);

create function public.visitas_dispensables(p_enrollment_id uuid)
returns table (
  visit_id      uuid,
  visit_code    text,
  visit_name    text,
  kind          visit_kind,
  visit_date    date,
  dispenses     boolean,
  dispenses_ip  boolean,
  ya_solicitada boolean
)
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'No autenticado' using errcode = '42501';
  end if;
  -- Mismo candado que el resto del módulo, sin cambios respecto de la 0059: Pharma no tiene RLS
  -- de lectura sobre patient_visits de todos los protocolos (Track se aísla por protocolo,
  -- Pharma es central), así que la autorización vive server-side en esta función.
  if not (public.has_min_role('pharma', 'operator') or public.has_module('gerencia')) then
    raise exception 'Sin permiso para ver las visitas de este paciente' using errcode = '42501';
  end if;

  return query
    select pv.id,
           vd.code,
           vd.name,
           pv.kind,
           coalesce(pv.real_date, pv.estimated_date),
           coalesce(vd.dispenses, false),
           coalesce(vd.dispenses_ip, false),
           exists (
             select 1 from public.dispensation_requests dr
             where dr.visit_id = pv.id
               and dr.status in ('solicitada', 'preparando')
           )
    from public.patient_visits pv
    -- LEFT, no INNER: una visita suelta no tiene definición y eso no es un error, es su forma.
    left join public.visit_definitions vd on vd.id = pv.visit_def_id
    where pv.enrollment_id = p_enrollment_id
    -- Más reciente primero: en el mostrador, la visita que acaba de pasar es la candidata.
    order by coalesce(pv.real_date, pv.estimated_date) desc nulls last;
end; $$;

comment on function public.visitas_dispensables(uuid) is
  'Visitas de un enrolamiento para el alta manual de Farmacia. Devuelve TODAS (0115) con el flag
   dispenses, en vez de sólo las del cronograma que dispensan: la base ya acepta cualquier visita
   con un motivo fuera de cronograma (0071), y el filtro viejo escondía las VNP por un inner join.
   0059, ensanchada por 0115.';

revoke all on function public.visitas_dispensables(uuid) from public;
grant execute on function public.visitas_dispensables(uuid) to authenticated;

notify pgrst, 'reload schema';
