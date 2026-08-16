-- Spira · Harness de verificación de Reportes (migraciones 0082 y 0083).
-- Correr en el SQL Editor DESPUÉS de aplicar las dos migraciones, ANTES de desplegar el front.
--
-- ES DE SOLO LECTURA. No crea ni borra una sola fila: verifica contra los datos que ya hay.
-- Es a propósito — el harness de la 0050 sembraba datos, y en esta base eso es riesgo puro
-- (regla dura del CLAUDE.md). Todo lo que hay que responder acá se puede responder mirando.
--
-- QUÉ VERIFICA Y POR QUÉ. La pregunta que ninguna pantalla puede contestar: si la farmacéutica
-- ve TODO lo que tiene que ver. La RLS filtra en SILENCIO, así que "veo datos" no prueba nada:
-- puede estar viendo la mitad. Y el usuario de QA tiene los cinco módulos, con lo cual tampoco
-- sirve para probarlo desde la app.
--
-- CADA SENTENCIA VA SOLA. El editor de Supabase no comparte sesión ni transacción entre las
-- sentencias de un bloque, así que se corren de a una y se lee el resultado de cada una.
-- ============================================================================


-- ── 1 · ¿Quedó alguna solicitud sin enrolamiento? ────────────────────────────
--    Tiene que dar 0. Cualquier otra cosa significa que el backfill de la 0082 no cubrió todo
--    y esas dispensaciones van a faltar en el reporte, sin ningún error a la vista.

select count(*) as pedidos_sin_enrolamiento
  from public.dispensation_requests
 where enrollment_id is null;


-- ── 2 · ¿El trigger de sellado quedó vivo y el viejo se fue? ─────────────────
--    Tiene que devolver exactamente UNA fila: trg_seal_request_scope.
--    Si aparece también trg_seal_request_protocol, la 0082 se aplicó a medias.

select tgname
  from pg_trigger
 where tgrelid = 'public.dispensation_requests'::regclass
   and tgname like 'trg_seal_request%'
   and not tgisinternal;


-- ── 3 · ¿La vista ve lo mismo que el libro? ──────────────────────────────────
--    Las dos columnas tienen que dar el MISMO número.
--
--    OJO CON LA FORMA DE ESTA CONSULTA, porque la primera versión estaba mal y dio un falso
--    positivo la primera vez que se corrió en prod (2026-08-16: 3 contra 7, y parecía un bug de
--    la vista). Comparaba contra TODOS los movimientos de tipo 'dispensacion', y eso no puede
--    cerrar en una base que alguna vez tuvo una reversión: el libro guarda la salida de toda
--    dispensación que llegó a 'entregada' aunque después se haya revertido —queda compensada con
--    una 'devolucion'— y guarda también las de dispensaciones que YA NO EXISTEN, porque
--    `reference_id` no es foreign key y un borrado en cascada del paciente se lleva la fila y deja
--    el movimiento huérfano. Eso último es correcto: el libro es inmutable, no se borra.
--    La vista, bien, sólo cuenta lo que HOY está entregado.
--
--    La comparación correcta acota el libro a las dispensaciones que siguen entregadas.

select
  (select coalesce(sum(unidades), 0) from public.v_pharma_report_items)          as segun_la_vista,
  (select coalesce(sum(-sm.quantity_delta), 0)
     from public.stock_movements sm
     join public.dispensations d on d.id = sm.reference_id
    where sm.movement_type  = 'dispensacion'
      and sm.reference_type = 'dispensation'
      and d.status = 'entregada')                                               as segun_el_libro;


-- ── 3.b · Salud del libro: ¿salió stock que no volvió y no está entregado? ───
--    No es del reporte, es de la base, pero se descubre acá y conviene mirarlo. Debería dar cero
--    filas. Cada fila es una dispensación cuyo movimiento de stock no está explicado por una
--    entrega vigente: o se revirtió sin compensar, o su fila ya no existe.
--    Corrida el 2026-08-16 devolvió UNA fila: una dispensación inexistente con 2 unidades de
--    salida y 1 de devolución, o sea 1 unidad que salió del estante y nunca volvió.

select
  sm.reference_id,
  d.correlative_number,
  coalesce(d.status::text, 'LA FILA YA NO EXISTE')                              as estado,
  sum(case when sm.movement_type = 'dispensacion' then -sm.quantity_delta else 0 end) as salio,
  sum(case when sm.movement_type = 'devolucion'   then  sm.quantity_delta else 0 end) as volvio
from public.stock_movements sm
left join public.dispensations d on d.id = sm.reference_id
where sm.reference_type = 'dispensation'
  and sm.movement_type in ('dispensacion', 'devolucion')
group by sm.reference_id, d.correlative_number, d.status
having coalesce(d.status::text, '') <> 'entregada'
   and sum(case when sm.movement_type = 'dispensacion' then -sm.quantity_delta else 0 end)
     <> sum(case when sm.movement_type = 'devolucion'   then  sm.quantity_delta else 0 end);


-- ── 4 · ¿Alguna fila entregada quedó sin paciente o sin protocolo? ───────────
--    Tiene que dar 0. Si no, esas dispensaciones aparecen en el total pero no en las tablas
--    por protocolo, y los invariantes de la pantalla van a saltar (que es lo que corresponde).

select count(*) as filas_sin_alcance
  from public.v_pharma_report_items
 where enrollment_id is null or protocol_id is null;


-- ── 5 · LA PRUEBA QUE IMPORTA · ¿qué ve una farmacéutica sin gerencia? ───────
--    Simula el JWT de un usuario Pharma y cuenta lo que la vista le devuelve.
--
--    ANTES DE CORRERLA: reemplazá el uuid de abajo por el id real de una farmacéutica. Se saca
--    con la consulta del paso 5.a. Si el editor de Supabase no deja hacer `set local role`,
--    el paso 5.c da el mismo resultado por otro camino.

-- 5.a · Quién es quién. Anotá el id de una usuaria que tenga pharma y NO tenga gerencia.
select u.id, u.full_name,
       string_agg(umr.module::text || ':' || umr.role::text, ' · ' order by umr.module::text) as modulos,
       bool_or(umr.module = 'gerencia') as tiene_gerencia,
       bool_or(umr.module = 'track')    as tiene_coordinacion
  from public.user_module_roles umr
  join public.users u on u.id = umr.user_id
 group by u.id, u.full_name
having bool_or(umr.module = 'pharma')
 order by u.full_name;

-- 5.b · Con ese id, ejecutar como esa persona. Correr las TRES líneas juntas, de una vez:
--       el `set local` sólo vive dentro de su transacción.
--       Reemplazar el uuid por el del paso 5.a antes de correr.
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000000","role":"authenticated"}';
  select count(*)                          as filas_que_ve,
         coalesce(sum(unidades), 0)        as unidades_que_ve,
         count(distinct dispensation_id)   as dispensaciones_que_ve,
         count(distinct enrollment_id)     as pacientes_que_ve
    from public.v_pharma_report_items;
rollback;

-- 5.c · Lo mismo pero sin cambiar de rol, por si 5.b no se puede correr: cuenta lo que HAY.
--       El resultado de 5.b tiene que ser IDÉNTICO a éste. Si da menos, la RLS está
--       recortando y el reporte sale corto sin avisar.
select count(*)                        as filas_que_hay,
       coalesce(sum(unidades), 0)      as unidades_que_hay,
       count(distinct dispensation_id) as dispensaciones_que_hay,
       count(distinct enrollment_id)   as pacientes_que_hay
  from public.v_pharma_report_items;


-- ── 6 · Las otras tres vistas responden ──────────────────────────────────────
--    No verifica cifras, verifica que existan y sean legibles. Si alguna falla acá, el front
--    va a mostrar el cartel de "falta aplicar una actualización de la base".

select
  (select count(*) from public.v_pharma_report_receptions) as recepciones,
  (select count(*) from public.v_pharma_report_rejected)   as pedidos_rechazados,
  (select count(*) from public.v_pharma_report_expired)    as lotes_vencidos;


-- ── 7 · El corolario que hay que mirar igual ─────────────────────────────────
--    Fuera del alcance de estas migraciones, pero se descubrió armándolas:
--    `src/data/pharma/dispensations.ts:78` arma el historial con `patient_visits!inner`, y
--    Farmacia NO tiene policy de select sobre esa tabla. Si la farmacéutica real no tiene
--    también el módulo `track`, el historial de Dispensaciones está VACÍO hoy en producción.
--    La columna `tiene_coordinacion` del paso 5.a responde esto.
