-- Spira · Migración 0135 — Farmacia: el historial muestra y filtra por el IVRS de CADA estudio.
-- ============================================================================
-- El número de sujeto es POR ESTUDIO: `enrollments.ivrs_code` (0062), con `patients.code` —el del
-- estudio madre— como respaldo. La 0126 ya lo corrigió en seis vistas; `v_pharma_history` (0117)
-- quedó afuera y sigue armando las dos columnas con `pa.code`. En un paciente inscripto en dos
-- estudios eso muestra un número que no es el suyo en el estudio de esa fila: Calderon sale con
-- 032001500001 en una entrega de LTS17231, donde es 032001520001.
--
-- QUÉ CAMBIA, en la rama de protocolo del union:
--   · destinatario_ref  (lo que se MUESTRA)  → coalesce(e.ivrs_code, pa.code)
--   · paciente_codigo   (por lo que se FILTRA) → coalesce(e.ivrs_code, pa.code)
-- La rama ambulatoria no se toca: no tiene estudio ni paciente, y su referencia es el DOCUMENTO de
-- quien retiró. Ese es justamente el motivo de que las dos columnas existan por separado (0117).
--
-- APLICAR A MANO en el SQL Editor de Supabase (rol postgres), DESPUÉS de la 0134.
-- IDEMPOTENTE: reintentar es volver a correr el archivo entero.
--
-- ORDEN DE DESPLIEGUE: INDIFERENTE, y por una razón concreta. El front desplegado (PR #242) ya
-- corrige estas filas por su cuenta (`conIvrsDelEstudio`, con una lectura de `enrollments`): cuando
-- la vista devuelva el número bueno, esa corrección pasa a ser una operación que no cambia nada.
-- Lo que NO puede corregir el front es el filtro, que corre en el servidor: hasta que esto esté
-- aplicado, el buscador del historial encuentra por el número del estudio madre. Después de
-- aplicarla, el front que la usaba se puede simplificar (TODOS.md).
--
-- SIN CAMBIOS DE FORMA: mismas columnas, mismo orden, mismos tipos (`enrollments.ivrs_code` y
-- `patients.code` son los dos `text`), así que `create or replace view` la reemplaza sin dropearla
-- y nada que dependa de ella se entera. RLS y grants: los de siempre, repetidos acá porque el
-- archivo tiene que poder correrse solo.
-- ============================================================================


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
       -- El IVRS de ESTA inscripción (0062, 0135), con el del estudio madre de respaldo: el mismo
       -- `coalesce(e.ivrs_code, pa.code)` que la 0126 dejó en las otras vistas. El respaldo no es
       -- adorno: `ivrs_code` es nullable (pre-randomización, filas legacy), y sin él la lista
       -- pasaría de un número equivocado a un hueco, que es peor.
       coalesce(e.ivrs_code, pa.code)   as destinatario_ref,
       -- El IVRS OTRA VEZ, y no es redundancia: `destinatario_ref` es para MOSTRAR (del otro lado
       -- del union lleva un documento) y ésta es para FILTRAR. Con una sola columna, el `ilike`
       -- del buscador de pacientes matchearía el DNI de una salida ambulatoria — un falso
       -- positivo silencioso. Con ésta en null, la ambulatoria queda afuera sola.
       coalesce(e.ivrs_code, pa.code)   as paciente_codigo,
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
--
-- NO SE TOCA en la 0135: acá `destinatario_ref` es el DOCUMENTO de quien retiró, no un IVRS.
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
   que es lo que las deja afuera de los dos filtros. destinatario_ref y paciente_codigo llevan el
   IVRS de la inscripción, con patients.code de respaldo (0135). 0117, 0135.';

revoke all on public.v_pharma_history from anon;
grant select on public.v_pharma_history to authenticated;
revoke insert, update, delete, truncate, references, trigger
  on public.v_pharma_history from authenticated;

notify pgrst, 'reload schema';
