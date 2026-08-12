-- ============================================================================
-- Spira · Limpieza de los datos de prueba `TEST-IP`  (one-off, NO es migración)
-- ----------------------------------------------------------------------------
-- Borra EXACTAMENTE lo que cuelga del protocolo con `code = 'TEST-IP'`, armado
-- para verificar la dispensación de producto en investigación (jornadas del
-- 2026-08-10 y 2026-08-11). Todo el script está anclado a ese único código: si
-- el protocolo no existe, cada sentencia toca CERO filas y no pasa nada.
--
-- NO ES UNA MIGRACIÓN: no lleva número, no va en `migrations/` y no se registra
-- en el índice de `supabase/README.md`. Es un script de datos, de una sola vez,
-- al lado de `_reset_dev.sql`.
--
-- ⚠️ ESTO ES PRODUCCIÓN. Correr los pasos EN ORDEN, uno por vez, leyendo el
--    resultado de cada uno antes de seguir. El editor SQL de Supabase muestra
--    solo el resultado de la ÚLTIMA sentencia, por eso cada paso es una unidad
--    que se pega sola.
--
-- Red de seguridad: casi todo lo que se borra tiene trigger de auditoría, así
-- que el `before_data` de protocolos, pacientes, enrolamientos, visitas,
-- medicación asignada, pedidos y dispensaciones queda en `audit_log`
-- (recuperable). Dos cosas NO vuelven, y conviene saberlo antes de apretar:
--   · las filas de `dispensation_ip_documents` (la 0071 no les puso trigger de
--     auditoría: eran inmutables, así que no se contempló el borrado);
--   · los archivos del bucket. Por eso van últimos, recién con la base limpia.
--
-- Lo que este script NO toca, a propósito:
--   · `medications` / `drugs` — el catálogo es GLOBAL desde la 0032. Donepecilo
--     10 mg se ASIGNÓ al paciente de prueba; el medicamento en sí es del
--     catálogo compartido y se queda. Se borra la asignación, no el producto.
--   · `stock_movements` — audit trail de ANMAT, insert-only, nunca se borra.
--     El PASO 1 lo cuenta: si diera > 0 habría que decidirlo aparte (no debería,
--     TEST-IP nunca tuvo stock de base ni recepción de IP).
--   · `audit_log` — inmutable, y es justamente el respaldo de este borrado.
-- ============================================================================


-- ============================================================================
-- PASO 1 · INVENTARIO (solo lectura). Pegar y correr SOLO esto primero.
-- ----------------------------------------------------------------------------
-- Devuelve una fila por concepto: qué es, el detalle y cuántas filas. Antes de
-- seguir hay que mirar tres cosas:
--   a) que el protocolo sea UNO solo y el paciente sea el de prueba;
--   b) que las tres filas de GUARDA den 0 (si alguna da > 0, PARAR y avisar);
--   c) ANOTAR el `id` del protocolo: es el nombre de la carpeta del bucket
--      `ip-docs` que hay que borrar en el PASO 3.
-- ============================================================================

with proto as (
  select id from public.protocols where code = 'TEST-IP'
), enrol as (
  select e.* from public.enrollments e where e.protocol_id in (select id from proto)
), visitas as (
  select pv.* from public.patient_visits pv where pv.enrollment_id in (select id from enrol)
), pedidos as (
  select r.* from public.dispensation_requests r
   where r.protocol_id in (select id from proto)
      or r.visit_id    in (select id from visitas)
)
select * from (
  select 1 as orden, 'Protocolo TEST-IP (este id = la carpeta del bucket)' as que,
         coalesce((select string_agg(p.id::text || '  ' || p.name, ' | ') from public.protocols p where p.code = 'TEST-IP'), '—') as detalle,
         (select count(*) from proto) as filas
  union all select 2, 'Pacientes enrolados en TEST-IP',
         coalesce((select string_agg(pa.full_name || ' (' || pa.code || ')', ' | ')
                     from public.patients pa where pa.id in (select patient_id from enrol)), '—'),
         (select count(distinct patient_id) from enrol)
  union all select 3, 'Enrolamientos', '—', (select count(*) from enrol)
  union all select 4, 'Visitas del paciente (patient_visits)', '—', (select count(*) from visitas)
  union all select 5, 'Cronograma (visit_definitions)',
         coalesce((select string_agg(vd.code, ', ' order by vd.code) from public.visit_definitions vd where vd.protocol_id in (select id from proto)), '—'),
         (select count(*) from public.visit_definitions where protocol_id in (select id from proto))
  union all select 6, 'Pedidos de dispensación', '—', (select count(*) from pedidos)
  union all select 7, 'Renglones de pedido', '—',
         (select count(*) from public.dispensation_request_items where request_id in (select id from pedidos))
  union all select 8, 'Dispensaciones ejecutadas (comprobantes)',
         coalesce((select string_agg('N° ' || d.correlative_number::text, ', ' order by d.correlative_number)
                     from public.dispensations d where d.request_id in (select id from pedidos)), '—'),
         (select count(*) from public.dispensations where request_id in (select id from pedidos))
  union all select 9, 'Renglones de dispensación', '—',
         (select count(*) from public.dispensation_items
           where dispensation_id in (select id from public.dispensations where request_id in (select id from pedidos)))
  union all select 10, 'Constancias de IP (filas + ruta en el bucket)',
         coalesce((select string_agg(doc.storage_path, ' | ' order by doc.uploaded_at)
                     from public.dispensation_ip_documents doc where doc.request_id in (select id from pedidos)), '—'),
         (select count(*) from public.dispensation_ip_documents where request_id in (select id from pedidos))
  union all select 11, 'Medicación asignada al paciente (patient_medications)',
         coalesce((select string_agg(m.name, ', ') from public.patient_medications pm
                     join public.medications m on m.id = pm.medication_id
                    where pm.enrollment_id in (select id from enrol)), '—'),
         (select count(*) from public.patient_medications where enrollment_id in (select id from enrol))
  union all select 12, 'Medicamentos habilitados al protocolo (protocol_medications, cae en cascada)',
         coalesce((select string_agg(m.name, ', ') from public.protocol_medications pm
                     join public.medications m on m.id = pm.medication_id
                    where pm.protocol_id in (select id from proto)), '—'),
         (select count(*) from public.protocol_medications where protocol_id in (select id from proto))
  union all select 13, 'Comentarios, procedimientos y timeline de esas visitas (cascada)', '—',
         (select (select count(*) from public.visit_comments               where visit_id in (select id from visitas))
               + (select count(*) from public.patient_timeline             where visit_id in (select id from visitas))
               + (select count(*) from public.visit_procedure_completions  where visit_id in (select id from visitas))
               + (select count(*) from public.track_dispensations          where patient_visit_id in (select id from visitas)))
  union all select 14, 'Archivos hoy en el bucket ip-docs (TODOS los protocolos)', '—',
         (select count(*) from storage.objects where bucket_id = 'ip-docs')

  -- ── GUARDAS: las tres tienen que dar 0 ──────────────────────────────────
  union all select 20, 'GUARDA · Pacientes de TEST-IP con OTRO enrolamiento (tiene que ser 0)',
         'si da > 0, ese paciente NO es de prueba: parar',
         (select count(*) from public.enrollments e2
           where e2.patient_id in (select patient_id from enrol)
             and e2.protocol_id not in (select id from proto))
  union all select 21, 'GUARDA · Recepciones / lotes / unidades de IP del protocolo (tiene que ser 0)',
         'bloquean el borrado del protocolo (FK restrict)',
         (select (select count(*) from public.medication_receptions where protocol_id in (select id from proto))
               + (select count(*) from public.medication_lots       where protocol_id in (select id from proto))
               + (select count(*) from public.ip_units              where protocol_id in (select id from proto)))
  union all select 22, 'GUARDA · Movimientos de stock de estas dispensaciones (tiene que ser 0)',
         'stock_movements es insert-only: si hay, se decide aparte',
         (select count(*) from public.stock_movements sm
           where sm.reference_type = 'dispensation'
             and sm.reference_id in (select id from public.dispensations where request_id in (select id from pedidos)))
) inventario
order by orden;


-- ============================================================================
-- PASO 2 · EL BORRADO. Pegar y correr TODO este bloque de una vez.
-- ----------------------------------------------------------------------------
-- ⚠️ SIN TABLAS TEMPORALES, y no es una preferencia de estilo: en el editor SQL
--    de Supabase las sentencias NO comparten sesión. Una `create temporary
--    table` en la sentencia 1 ya no existe en la 2 y el bloque muere con
--    `42P01: relation "tmp_..." does not exist`. Comprobado el 2026-08-11.
--
--    Corolario incómodo: TAMPOCO hay una transacción que abarque el bloque, así
--    que un error en el medio deja lo anterior ya borrado, sin rollback que lo
--    salve. Lo que sí hay es que cada sentencia es idempotente y el orden es
--    correcto: si algo falla, se arregla la causa y se vuelve a correr el bloque
--    ENTERO — las que ya hicieron su trabajo tocan cero filas la segunda vez.
--
-- El orden lo dictan las FK `on delete restrict`, que son las que no se
-- cascadean solas:
--   constancias → dispensaciones → pedidos → medicación asignada →
--   enrolamientos → paciente → protocolo.
--
-- Cada sentencia se ancla sola a `protocols.code = 'TEST-IP'`: si el protocolo
-- no existiera, todas las subconsultas quedan vacías y el bloque no toca nada.
-- ============================================================================

-- El `with` que abre las sentencias 1 a 3 busca los pedidos por los DOS
-- caminos: la columna desnormalizada que sembró la 0071 y la cadena
-- visita → enrolamiento → protocolo. Si alguno hubiera quedado con
-- `protocol_id` en null, la segunda vía lo alcanza igual. Va repetido en cada
-- sentencia porque no hay sesión compartida donde guardarlo una sola vez.

-- 1 · Constancias de IP. Referencian el pedido con `restrict`, así que van primero.
--     Se borra solo la FILA; el archivo del bucket sale en el PASO 3.
with pedidos as (
  select r.id from public.dispensation_requests r
   where r.protocol_id in (select id from public.protocols where code = 'TEST-IP')
      or r.visit_id    in (select pv.id from public.patient_visits pv
                             join public.enrollments e on e.id = pv.enrollment_id
                            where e.protocol_id in (select id from public.protocols where code = 'TEST-IP'))
)
delete from public.dispensation_ip_documents
 where request_id in (select id from pedidos);

-- 2 · Dispensaciones ejecutadas. `dispensation_items` cae en cascada.
with pedidos as (
  select r.id from public.dispensation_requests r
   where r.protocol_id in (select id from public.protocols where code = 'TEST-IP')
      or r.visit_id    in (select pv.id from public.patient_visits pv
                             join public.enrollments e on e.id = pv.enrollment_id
                            where e.protocol_id in (select id from public.protocols where code = 'TEST-IP'))
)
delete from public.dispensations
 where request_id in (select id from pedidos);

-- 3 · Pedidos. `dispensation_request_items` cae en cascada.
delete from public.dispensation_requests r
 where r.protocol_id in (select id from public.protocols where code = 'TEST-IP')
    or r.visit_id    in (select pv.id from public.patient_visits pv
                           join public.enrollments e on e.id = pv.enrollment_id
                          where e.protocol_id in (select id from public.protocols where code = 'TEST-IP'));

-- 4 · Medicación asignada al paciente (el Donepecilo 10 mg del pedido mixto).
--     Referencia el enrolamiento con `restrict`: va antes que los enrolamientos.
delete from public.patient_medications
 where enrollment_id in (select e.id from public.enrollments e
                          where e.protocol_id in (select id from public.protocols where code = 'TEST-IP'));

-- 5 · Enrolamientos. En cascada se llevan las visitas y todo lo que cuelga de
--     ellas: timeline, comentarios, procedimientos, checklist, dispensaciones
--     de Track y alertas descartadas.
delete from public.enrollments
 where protocol_id in (select id from public.protocols where code = 'TEST-IP');

-- 6 · El paciente de prueba. Sin sesión compartida no se puede sellar de
--     antemano la lista de ids, así que el candado ya no es "estuvo enrolado en
--     TEST-IP" —para cuando corre esta sentencia, ese vínculo ya no existe—
--     sino la conjunción de dos hechos: el nombre empieza con `TEST-IP` Y no le
--     queda ningún enrolamiento en ningún protocolo. Un paciente real no cumple
--     ninguna de las dos.
--     El prefijo va COMPLETO (`TEST-IP`, no `TEST`) para no barrer de paso a un
--     huérfano de otra sesión de prueba: la consigna es borrar lo que cuelga de
--     este protocolo, nada más.
--     Que el nombre mande tiene un riesgo: si el paciente de prueba NO se
--     llamara así, acá no lo toca y queda huérfano — por eso la verificación de
--     abajo LISTA por nombre a todos los pacientes sin enrolamiento en vez de
--     contarlos, que es la única forma de que ese caso no pase inadvertido.
delete from public.patients p
 where p.full_name like 'TEST-IP%'
   and not exists (select 1 from public.enrollments e where e.patient_id = p.id);

-- 7 · El protocolo. En cascada: cronograma, actividades, coordinadores,
--     alertas y los medicamentos habilitados.
delete from public.protocols where code = 'TEST-IP';

-- Verificación. La fila 2 LISTA por nombre —no cuenta— a todos los pacientes
-- que quedaron sin ningún enrolamiento: es el único lugar donde se vería que el
-- candado por nombre del delete 6 no enganchó. Un `count` de los que se llaman
-- TEST no sirve, porque si el de prueba NO se llama así, el delete no lo tocó Y
-- el count tampoco lo ve: daría 0 estando mal. Puede haber ahí pacientes reales
-- dados de alta y todavía no enrolados; por eso se leen los nombres.
-- Las filas 1 y 4 tienen que dar 0; la 3 no (ver el comentario que la precede).
-- La 5 todavía no baja: tiene que seguir igual que en el PASO 1, porque los
-- archivos se borran a mano en el PASO 3.
select 'protocolo TEST-IP' as que, '—' as detalle, count(*) as quedan
  from public.protocols where code = 'TEST-IP'
union all select 'pacientes sin NINGÚN enrolamiento — leé los nombres: no tiene que quedar ninguno de prueba',
       coalesce((select string_agg(p.full_name || ' (' || p.code || ')', ' | ' order by p.full_name)
                   from public.patients p
                  where not exists (select 1 from public.enrollments e where e.patient_id = p.id)), '—'),
       (select count(*) from public.patients p
         where not exists (select 1 from public.enrollments e where e.patient_id = p.id))
-- OJO con esta fila: NO tiene que dar 0. Cuenta TODAS las constancias de la
-- base, y hay de protocolos reales (2 al correr esto el 2026-08-11). Las de
-- TEST-IP no pueden sobrevivir a este punto —las FK `restrict` habrían frenado
-- el borrado en vez de dejarlo pasar—, así que lo que quede acá es ajeno.
union all select 'constancias de IP en total (incluye protocolos reales: NO es 0)', '—',
       count(*) from public.dispensation_ip_documents
union all select 'pedidos de dispensación con protocol_id en null', '—',
       count(*) from public.dispensation_requests where protocol_id is null
union all select 'archivos todavía en el bucket ip-docs (van en el PASO 3)', '—',
       count(*) from storage.objects where bucket_id = 'ip-docs';


-- ============================================================================
-- PASO 3 · LOS ARCHIVOS DEL BUCKET (a mano, en el dashboard)
-- ----------------------------------------------------------------------------
-- ⚠️ EL BUCKET NO ES SOLO DE TEST-IP. La primera versión de este archivo daba
--    por sentado que sí ("TEST-IP fue el único que subió") y era una suposición,
--    no un dato: al correr el PASO 2 quedaron 2 constancias registradas y 7
--    archivos, contra las 4 de TEST-IP. Las 2 filas que sobreviven son de
--    pedidos de protocolos REALES —no pueden ser de TEST-IP, porque las FK
--    `restrict` de `dispensation_ip_documents.request_id` y de
--    `dispensation_requests.protocol_id` habrían hecho fallar el borrado en vez
--    de dejarlo pasar— y NO SE TOCAN. Y 4 + 2 = 6 sobre 7 archivos: hay al menos
--    uno sin fila que lo registre, probablemente un huérfano de una subida cuyo
--    `attach_ip_document` falló (`uploadIpDocument` lo borra best-effort, y ese
--    borrado también puede fallar).
--
-- Por eso el paso arranca identificando cada archivo en vez de borrar por
-- carpeta. La consulta cruza `storage.objects` contra la tabla y contra
-- `protocols` usando `ip_doc_protocol()`, el helper que la propia 0071 escribió
-- para leer el id del protocolo del prefijo de la ruta (devuelve null si el
-- nombre no empieza con un uuid, así que no se rompe con rutas raras).
--
-- Cómo leer el resultado: **TEST-IP ya no existe**, así que sus archivos son
-- exactamente los que muestran `protocolo` sin resolver. Ésos son los que se
-- borran. Cualquier fila con un `protocolo` real se queda, esté registrada o
-- huérfana: un huérfano de un protocolo real es evidencia de otra cosa y se
-- decide aparte, no de arrastre.
--
-- Al correrlo el 2026-08-11 dieron 5 archivos de TEST-IP, no 4. No falta ni
-- sobra nada: dos comparten la carpeta del mismo pedido con 12 segundos de
-- diferencia — son el reemplazo de constancia, que deja viva la reemplazada
-- (índice parcial `dispensation_ip_documents_vigente_uq`, 0071). O sea que "4
-- constancias" contaba filas vigentes y el bucket guarda una más. Los otros 2
-- archivos son de ACT18301, registrados y vigentes: no se tocan.
-- ============================================================================

select o.name,
       coalesce(p.code, '⚠️ sin protocolo (TEST-IP borrado) → BORRAR') as protocolo,
       case when d.id is null              then 'huérfano: ningún registro lo referencia'
            when d.superseded_at is not null then 'registrado, reemplazado'
            else                                 'registrado, VIGENTE' end as estado,
       (o.metadata->>'size')::bigint as bytes,
       o.created_at
  from storage.objects o
  left join public.dispensation_ip_documents d on d.storage_path = o.name
  left join public.protocols p on p.id = public.ip_doc_protocol(o.name)
 where o.bucket_id = 'ip-docs'
 order by protocolo nulls first, o.created_at;

-- Recién con esa lista a la vista:
--   Dashboard → Storage → bucket `ip-docs` → la carpeta cuyo nombre es el `id`
--   del protocolo TEST-IP (el que imprimió la fila 1 del PASO 1) → borrar sus
--   archivos. Se hace por la UI y no por SQL: sacar la fila de `storage.objects`
--   a mano deja el archivo huérfano en el backend de storage, que es peor que
--   dejarlo. La UI borra la fila Y el archivo.
--
-- Al terminar, volver a correr la consulta de arriba: no tiene que quedar
-- ninguna fila con el protocolo en null.


-- ============================================================================
-- PASO 4 · LOS RESTOS DE LA PRUEBA SOBRE **ACT18301** (protocolo REAL)
-- ----------------------------------------------------------------------------
-- Apareció mirando el bucket: además de TEST-IP, el portón de Storage se corrió
-- también sobre ACT18301, y dejó dos pedidos de prueba sobre la visita del
-- 2026-08-10 de una paciente REAL. Confirmado por el Director el 2026-08-11.
--
-- Qué son, exactamente:
--   · dos `dispensation_requests` en `cancelada`, `off_schedule = true` con
--     motivo "Otro", creadas 20:08 y 20:12 del 2026-08-11;
--   · con la MISMA constancia adjunta las dos veces — un PDF llamado
--     "Metabase - Reporte Pip Fundacion Scherbovsky (1).pdf", que es lo que
--     terminó de delatarlas: no es una constancia del IRT;
--   · una de ellas con la dispensación **N° 13** en `en_preparacion`.
--
-- Por qué se puede borrar sin tocar stock: el descuento ocurre en la transición
-- `en_preparacion → lista` (0054 §3.1) y el 13 nunca pasó de `en_preparacion`.
-- No hay `stock_movements` que lo referencien — la sentencia 0 lo verifica.
--
-- Por qué NO estaba a la vista: el tablero de Farmacia filtra los pedidos por
-- `status in ('solicitada','preparando')` y `cancelada` no entra. Era basura
-- inerte, no un pedido fantasma en la pantalla de la farmacéutica.
--
-- ⚠️ ACT18301 ES UN PROTOCOLO REAL, CON PEDIDOS REALES. Por eso el alcance NO se
--    deriva del protocolo: se fija con los DOS ids de pedido, literales, que es
--    lo único que no puede ampliarse solo. Y se fija ANTES de borrar nada,
--    porque la definición "los que tienen constancia" se autodestruye: la
--    sentencia 1 borra justamente las constancias, y las sentencias 2 y 3 se
--    quedarían sin conjunto.
--
-- El comprobante 13 deja un hueco en el correlativo. No es nuevo: el 12 era de
-- TEST-IP y ya se fue en el PASO 2. Ninguno de los dos fue un comprobante real.
-- ============================================================================

-- 0 · CONTROL PREVIO. Tiene que devolver EXACTAMENTE 2 filas, las dos con
--     `cancelada`, `constancias = 1` y la paciente esperada. Si devuelve otra
--     cosa —o menos de 2— alguno de los ids está mal transcripto: PARAR.
--     La última columna tiene que decir 0 en las dos.
select r.id, r.status, r.off_schedule_reason, pa.full_name as paciente,
       (select count(*) from public.dispensation_ip_documents d where d.request_id = r.id) as constancias,
       (select count(*) from public.dispensations di where di.request_id = r.id)            as dispensaciones,
       (select count(*) from public.stock_movements sm
         where sm.reference_type = 'dispensation'
           and sm.reference_id in (select di.id from public.dispensations di where di.request_id = r.id)) as movimientos_de_stock
  from public.dispensation_requests r
  join public.patient_visits pv on pv.id = r.visit_id
  join public.enrollments e     on e.id = pv.enrollment_id
  join public.patients pa       on pa.id = e.patient_id
 where r.id in ('be135ee1-14c0-4e55-9de8-0e1aeb8813ee',
                'e2482fe1-65dc-4a55-b186-b022d2fc576c');

-- 1 · Las dos constancias. Sin trigger de auditoría: esto no vuelve.
delete from public.dispensation_ip_documents
 where request_id in ('be135ee1-14c0-4e55-9de8-0e1aeb8813ee',
                      'e2482fe1-65dc-4a55-b186-b022d2fc576c');

-- 2 · La dispensación N° 13. `dispensation_items` cae en cascada. Auditada.
delete from public.dispensations
 where request_id in ('be135ee1-14c0-4e55-9de8-0e1aeb8813ee',
                      'e2482fe1-65dc-4a55-b186-b022d2fc576c');

-- 3 · Los dos pedidos. `dispensation_request_items` cae en cascada. Auditados.
delete from public.dispensation_requests
 where id in ('be135ee1-14c0-4e55-9de8-0e1aeb8813ee',
              'e2482fe1-65dc-4a55-b186-b022d2fc576c');

-- Verificación: las tres filas en 0, y la cuarta cuenta lo que sigue vivo de
-- ACT18301, que tiene que ser el trabajo real del protocolo y no cero.
select 'pedidos de la prueba' as que, count(*) as quedan
  from public.dispensation_requests
 where id in ('be135ee1-14c0-4e55-9de8-0e1aeb8813ee',
              'e2482fe1-65dc-4a55-b186-b022d2fc576c')
union all select 'constancias en toda la base', count(*) from public.dispensation_ip_documents
union all select 'archivos en el bucket ip-docs', count(*)
  from storage.objects where bucket_id = 'ip-docs'
union all select 'pedidos REALES de ACT18301 que siguen vivos (NO tiene que ser 0)', count(*)
  from public.dispensation_requests
 where protocol_id in (select id from public.protocols where code = 'ACT18301');

-- Y después, los dos archivos: Storage → `ip-docs` → carpeta
-- 860f5912-190b-458a-9ec0-618ffcd51790 (ACT18301) → borrar las DOS subcarpetas
-- de esos pedidos, no la carpeta del protocolo: si algún día ACT18301 sube una
-- constancia de verdad, va a vivir bajo ese mismo prefijo.
