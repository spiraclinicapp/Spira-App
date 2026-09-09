-- ============================================================================
-- 0117 — El historial de Farmacia, en UNA sola lista
--
-- Plan: docs/superpowers/plans/2026-09-08-salida-ambulatoria-revision-panel.md (D6')
-- Revisa: docs/superpowers/specs/2026-09-08-dispensacion-ambulatoria-design.md (D6)
--
-- POR QUÉ NO SE INTERCALA EN EL FRONT. La 0116 dejó las salidas ambulatorias en un bloque
-- "Últimas salidas" al pie de Stock, aparte del historial de Dispensaciones. Mudarlas al
-- historial parece un problema de presentación y no lo es, por dos razones de transporte:
--
--   1 · El historial está PAGINADO DEL LADO DEL SERVIDOR (`useDispensationHistory`: `.range()`
--       + "Cargar más"). Con dos fuentes paginadas por separado, una salida vieja aparecería
--       recién después de cargar la página 2 — o sea, en el lugar equivocado del orden
--       cronológico. Es un defecto invisible con cinco filas de prueba y evidente con mil.
--   2 · Sus filtros son por PROTOCOLO y por CÓDIGO DE PACIENTE, y una salida ambulatoria no
--       tiene ninguno de los dos.
--
-- Así que las dos fuentes se unen ACÁ, donde el `order by` y el `limit` son de verdad.
--
-- ES UNA VISTA DE PRESENTACIÓN, NO DE DETALLE. Devuelve exactamente lo que el renglón dibuja y
-- nada más: el detalle lo sigue trayendo el cajón por id (`useDispensationRequest` para las de
-- protocolo, `v_ambulatory_dispensations` para las ambulatorias). Por eso no reproduce los
-- embeds anidados de `dispensation_requests` — renglones, escaneos, constancias del IRT: eso es
-- el cajón, y traerlo por fila haría cuarenta veces el trabajo para dibujar una lista.
--
-- LA RAMA DE PROTOCOLO NO CAMBIA DE COMPORTAMIENTO, y es el riesgo principal de esta tanda:
-- `HistorialPorDias` es código en producción que funciona. Cada columna de esa rama reproduce
-- literalmente lo que el front venía calculando (ver los comentarios de cada una).
--
-- ADITIVA: la vista es nueva y ningún front desplegado la consulta. Va ANTES del deploy —
-- el que no funciona sin ella es el front nuevo (ver `migracion-primero-cuando-es-aditiva`).
-- APLICAR: a mano en el SQL Editor de Supabase (rol postgres), DESPUÉS de la 0116. IDEMPOTENTE.
-- Registrar en supabase/README.md al confirmarse en prod.
-- ============================================================================


-- 1 · El índice que la ordenación necesita -----------------------------------------------------
-- El historial ordena y acota por `updated_at` desde la 0054, y nunca tuvo índice: hasta hoy
-- Postgres resolvía cada página con un sort de la tabla entera. Con el `union all` esa
-- ordenación pasa a hacerse dos veces (una por rama) antes del merge, así que el sort de más
-- se paga en cada "Cargar más". `ambulatory_dispensations` ya trae el suyo (0116:75).
create index if not exists idx_dispensation_requests_updated
  on public.dispensation_requests (updated_at desc);


-- 2 · La vista unida ---------------------------------------------------------------------------
-- security_invoker: la RLS de cada tabla decide quién ve qué, y no hace falta una segunda regla.
-- Es lo que mantiene el aislamiento por protocolo de Coordinación y la centralidad de Farmacia
-- exactamente donde estaban.
create or replace view public.v_pharma_history
with (security_invoker = true) as

-- ── Rama 1 · las dispensaciones de protocolo ─────────────────────────────────────────────────
-- LOS JOINS SON INNER A PROPÓSITO, y reproducen el `!inner` que el front ya mandaba en
-- `HISTORY_COLS`: una solicitud cuyo paciente o protocolo no se puede leer se EXCLUYE en vez de
-- venir con el embed en null, que dejaría la página llena de huecos y haría contar filas que no
-- se muestran. El inner cae sobre `enrollments`, `patients` y `protocols` —que Farmacia SÍ lee
-- (0010, 0006:130, 0006:96)— y NUNCA sobre `patient_visits`, que le está cerrada (0006:162) y
-- que en su momento le vació el historial entero sin un solo error.
select 'protocolo'::text                as tipo,
       r.id,
       -- `updated_at` y no `created_at`: una solicitud de ayer entregada hoy pertenece al día en
       -- que se trabajó. Es el mismo criterio con el que el front venía agrupando por día.
       r.updated_at                     as ordenado_por,
       d.dispensation_code              as codigo,
       d.correlative_number             as correlativo,
       pa.full_name                     as destinatario,
       pa.id                            as destinatario_id,
       pa.code                          as destinatario_ref,
       -- El IVRS OTRA VEZ, y no es redundancia: `destinatario_ref` es para MOSTRAR (del otro lado
       -- del union lleva un documento) y ésta es para FILTRAR. Con una sola columna, el `ilike`
       -- del buscador de pacientes matchearía el DNI de una salida ambulatoria — un falso
       -- positivo silencioso. Con ésta en null, la ambulatoria queda afuera sola.
       pa.code                          as paciente_codigo,
       pr.code                          as protocol_code,
       pr.id                            as protocol_id,
       -- El front hacía `items.map(i => i.medication.name).join(', ')`. Se ordena por nombre
       -- —el embed de PostgREST no garantizaba ningún orden— y se coalesce a '' porque un pedido
       -- de IP solo no tiene renglones y hoy muestra la cadena vacía, no un hueco.
       coalesce(it.nombres, '')         as medicamentos,
       -- `totalUnits(r)`: la suma de lo PEDIDO (`dispensation_request_items.quantity`). NO sale
       -- del libro de stock: en una rechazada no hay asiento, y en una con sustitución el número
       -- sería otro. Cambiar de fuente cambiaría el número que la farmacéutica ya conoce.
       coalesce(it.unidades, 0)::integer as unidades,
       -- Los DOS estados crudos, sin traducir. El badge distingue "lista para retirar" de
       -- "entregada" —que en `request_status` son ambas `atendida`— y esa regla ya vive en
       -- `badgeOf` (`dispensaciones/estados.ts`), testeada. Armarla acá en un `case` de plpgsql
       -- la duplicaría, y nada obligaría a completar el `case` cuando aparezca un estado nuevo.
       r.status::text                   as estado_solicitud,
       d.status::text                   as estado_dispensacion,
       null::text                       as autorizado_por
  from public.dispensation_requests r
  join public.enrollments e  on e.id  = r.enrollment_id
  join public.patients    pa on pa.id = e.patient_id
  join public.protocols   pr on pr.id = r.protocol_id
  -- LATERAL y no un `group by` sobre el join: agregar los renglones arriba obligaría a agrupar
  -- por las quince columnas del select, y cualquier columna que se sume después tendría que
  -- acordarse de entrar al `group by`. Acá el agregado queda encerrado donde pertenece.
  left join lateral (
    select string_agg(m.name, ', ' order by m.name) as nombres,
           sum(i.quantity)                          as unidades
      from public.dispensation_request_items i
      join public.medications m on m.id = i.medication_id
     where i.request_id = r.id
  ) it on true
  -- `activeDispensation(r)` en SQL. Hay 0 o 1 por pedido (el front toma `dispensations[0]`),
  -- pero la tabla NO tiene unique sobre `request_id` (0002:300), así que un join a secas podría
  -- DUPLICAR la fila del historial si alguna vez hubiera dos. El lateral con `limit 1` lo
  -- impide por construcción y se queda con la más reciente, que es la vigente.
  left join lateral (
    select dd.dispensation_code, dd.correlative_number, dd.status
      from public.dispensations dd
     where dd.request_id = r.id
     order by dd.created_at desc, dd.correlative_number desc
     limit 1
  ) d on true

union all

-- ── Rama 2 · las salidas ambulatorias ────────────────────────────────────────────────────────
-- Sin protocolo y sin paciente, que es literalmente el caso: se le entregó a alguien que no
-- figura en ningún lado. Los nulos de `protocol_code` y `paciente_codigo` son los que dejan
-- estas filas afuera de los dos filtros, y eso es lo correcto: si preguntás "qué pasó en
-- PROT-A", una entrega a alguien que no es paciente de nada no forma parte de esa respuesta.
--
-- `destinatario_id` va en null porque NO HAY FICHA QUE ABRIR. El front lo usa para decidir si
-- el nombre es un link: sin ficha, va en tinta y sin link — un link que no lleva a ningún lado
-- es peor que texto plano.
select 'ambulatoria'::text,
       ad.id,
       -- `created_at` y no `updated_at`: la tabla es INMUTABLE (0116, sin policies de update),
       -- así que la fecha en que pasó es la única que tiene y no puede desincronizarse.
       ad.created_at,
       null::text,
       null::integer,
       ad.recipient_name,
       null::uuid,
       ad.recipient_document,
       null::text,
       null::text,
       null::uuid,
       m.name,
       ad.quantity,
       -- Sin estado: nace entregada y no tiene otro. El front pone el badge por el `tipo`, sin
       -- inventarle un `request_status` que esta tabla no tiene — que sería decir que pasó por
       -- un flujo de cuatro estados que nunca existió para ella.
       null::text,
       null::text,
       ad.authorized_by_name
  from public.ambulatory_dispensations ad
  join public.medications m on m.id = ad.medication_id;

comment on view public.v_pharma_history is
  'El historial de Farmacia con las dos fuentes unidas y ordenables por el servidor: las
   dispensaciones de protocolo (dispensation_requests) y las salidas ambulatorias
   (ambulatory_dispensations). Forma de PRESENTACIÓN: devuelve lo que el renglón dibuja, el
   detalle lo trae el cajón por id. protocol_code y paciente_codigo van NULL en las ambulatorias,
   que es lo que las deja afuera de los dos filtros. 0117.';

revoke all on public.v_pharma_history from anon;
grant select on public.v_pharma_history to authenticated;
revoke insert, update, delete, truncate, references, trigger
  on public.v_pharma_history from authenticated;

notify pgrst, 'reload schema';
