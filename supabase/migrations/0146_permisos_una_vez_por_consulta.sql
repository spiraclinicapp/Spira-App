-- Spira · Migración 0146 — Los permisos se preguntan una vez por consulta, no una vez por fila
--
-- POR QUÉ. Pendientes tardaba 1,1–2,6 s en cargar (medido el 2026-09-28 con la sesión del Director):
-- la consulta de visitas en alerta corría en 96 ms como administrador y en 700–1.000 ms con sesión.
-- La diferencia era toda de la RLS. Las policies llamaban a has_module(), has_min_role(),
-- coordina_visita() y compañía UNA VEZ POR FILA y por cada tabla que cruza una vista
-- security_invoker. Son funciones security definer con search_path propio: Postgres no las puede
-- expandir en línea, así que cada llamada es una mini-consulta. Con 1.061 visitas y vistas que
-- cruzan seis o siete tablas, eso es lo que tardaba. Y crece con el histórico, no con los pendientes.
--
-- QUÉ CAMBIA: SÓLO CUÁNTAS VECES SE PREGUNTA, NUNCA QUIÉN VE QUÉ. Cuatro reescrituras, todas
-- equivalencias:
--
--   1 · Lo que no depende de la fila —has_module('x'), has_role(…), has_min_role(…), auth.uid()—
--       va envuelto en `(select …)`. Postgres lo calcula una vez (InitPlan) y reusa el resultado.
--       Es el patrón que recomienda Supabase para la RLS.
--   2 · pharma_alcanza_X(col) → `(select pharma_sin_recorte()) or pharma_alcanza_X(col)`. Las diez
--       funciones de alcance EMPIEZAN con `pharma_sin_recorte() or …` (0139–0142), así que sumarlo
--       afuera no cambia el resultado, y para quien no está acotado —hoy, todo Farmacia— corta ahí
--       sin llamar a la función por fila.
--   3 · coordina_visita(col) → `col in (select visitas_que_coordino())`, e
--       is_assigned_coordinator(col) → `col in (select protocolos_que_coordino())`. El conjunto se
--       arma una vez por consulta en lugar de preguntar por cada fila. Con col NULL la función daba
--       false y el `in` da NULL: ninguna policy usa NOT, así que para filtrar son lo mismo.
--   4 · Los `exists (… protocol_coordinators pc … pc.user_id = auth.uid())` escritos en línea
--       (patient_visits, patients, visit_comments, checklist_templates, protocol_activities,
--       visit_definitions) → pertenencia a los mismos conjuntos. El exists en línea corría con la
--       RLS de quien consulta sobre enrollments y protocol_coordinators, pero la fila de
--       protocol_coordinators que exige es la PROPIA —siempre visible— y la inscripción de un
--       protocolo que la persona coordina también lo es, así que el resultado es el mismo.
--
-- CÓMO SE GENERÓ Y CÓMO SE PROBÓ. Las expresiones NO salen de releer las migraciones: salen del
-- texto VIGENTE en prod (pg_policies, exportado por el Director el 2026-09-28) y pasan por las
-- cuatro reglas de arriba con un script. Las 145 migraciones corridas en PGlite dan EXACTAMENTE esas
-- mismas 136 policies (comando, roles y texto). Sobre esa base, con datos sintéticos en las 55
-- tablas tocadas y doce perfiles (gerencia; dos coordinadoras; líder y admin de Coordinación;
-- Farmacia sin recorte, acotada a un estudio y acotada a ninguno; contable; sin módulos; una cuenta
-- de Coordinación + Farmacia acotada; sin sesión):
--   · cada expresión vieja contra la nueva, fila por fila: 1.944 comparaciones, cero diferencias;
--   · lo que cada perfil ve en cada tabla con RLS y en siete vistas (v_track_visits,
--     v_patient_visits, v_procedure_report_alerts, v_ip_delivery_alerts, v_visit_procedures,
--     v_protocol_report_status, v_visit_ip_status), antes y después: 816 fotos, cero diferencias;
--   · control negativo: cambiar a propósito un conjunto en una sola policy lo detecta en las cuatro
--     cuentas de coordinación.
-- Con ~1.000 visitas, las consultas de Pendientes y de la semana bajan entre 2 y 4 veces para
-- gerencia, coordinación y Farmacia (en PGlite; prod tiene sus propios números).
--
-- AFUERA, a propósito:
--   · storage.objects (las dos del bucket ip-docs): la tabla es de supabase_storage_admin, y la 0071
--     y la 0142 ya tuvieron que esquivar eso con un bloque de excepción. Es un bucket chico.
--   · tasks / task_assignees (ve_tarea): dependen de la fila de verdad y las tablas son chicas.
--   · Las tres que cuelgan de patient_visits con un exists sin coordinadores (visit_added_procedures,
--     visit_pending_procedures, visit_ip_closures): heredan la mejora de patient_visits sin tocarlas,
--     y reescribirlas duplicaría su regla acá.
--
-- ORDEN DE DESPLIEGUE: es aditiva y no cambia lo que el front pide → se aplica cuando se quiera, sin
-- deploy. Se puede volver a correr entera: cada alter policy deja la misma expresión.
--
-- 129 policies reescritas con alter policy: conserva nombre, comando y roles; cambia sólo la
-- expresión.


-- 1 · Los conjuntos, una vez por consulta ------------------------------------------------------------
-- security definer, igual que coordina_visita / is_assigned_coordinator (0006): leen las tablas sin
-- pasar por su propia RLS —si no, patient_visits se preguntaría a sí misma— y sólo devuelven lo que la
-- persona ya coordina, que es justo lo que las funciones viejas contestaban de a una fila.

create or replace function public.protocolos_que_coordino()
returns setof uuid language sql security definer stable rows 20
set search_path = pg_catalog, public as $fn$
  select pc.protocol_id from public.protocol_coordinators pc where pc.user_id = auth.uid();
$fn$;

create or replace function public.inscripciones_que_coordino()
returns setof uuid language sql security definer stable rows 200
set search_path = pg_catalog, public as $fn$
  select e.id
    from public.enrollments e
    join public.protocol_coordinators pc on pc.protocol_id = e.protocol_id
   where pc.user_id = auth.uid();
$fn$;

create or replace function public.pacientes_que_coordino()
returns setof uuid language sql security definer stable rows 200
set search_path = pg_catalog, public as $fn$
  select e.patient_id
    from public.enrollments e
    join public.protocol_coordinators pc on pc.protocol_id = e.protocol_id
   where pc.user_id = auth.uid();
$fn$;

create or replace function public.visitas_que_coordino()
returns setof uuid language sql security definer stable rows 1000
set search_path = pg_catalog, public as $fn$
  select pv.id
    from public.patient_visits pv
    join public.enrollments e            on e.id = pv.enrollment_id
    join public.protocol_coordinators pc on pc.protocol_id = e.protocol_id
   where pc.user_id = auth.uid();
$fn$;

comment on function public.protocolos_que_coordino() is
  'Protocolos que coordina quien consulta. Para las policies: `col in (select …)` se arma una vez por consulta; is_assigned_coordinator(col) preguntaba por fila. 0146.';
comment on function public.inscripciones_que_coordino() is
  'Inscripciones de los protocolos que coordina quien consulta. Para las policies (una vez por consulta). 0146.';
comment on function public.pacientes_que_coordino() is
  'Pacientes inscriptos en algún protocolo que coordina quien consulta. Para las policies (una vez por consulta). 0146.';
comment on function public.visitas_que_coordino() is
  'Visitas de los protocolos que coordina quien consulta. Para las policies: reemplaza a coordina_visita(col), que preguntaba por fila. 0146.';

revoke all on function public.protocolos_que_coordino()    from public, anon;
revoke all on function public.inscripciones_que_coordino() from public, anon;
revoke all on function public.pacientes_que_coordino()     from public, anon;
revoke all on function public.visitas_que_coordino()       from public, anon;
grant execute on function public.protocolos_que_coordino()    to authenticated;
grant execute on function public.inscripciones_que_coordino() to authenticated;
grant execute on function public.pacientes_que_coordino()     to authenticated;
grant execute on function public.visitas_que_coordino()       to authenticated;


-- 2 · Las policies ----------------------------------------------------------------------------------

-- agenda_notes
alter policy "edita notas propias" on public.agenda_notes
  using (((user_id = ( SELECT auth.uid())) AND ( SELECT public.has_min_role('track'::spira_module, 'operator'::module_role))))
  with check (((user_id = ( SELECT auth.uid())) AND ( SELECT public.has_min_role('track'::spira_module, 'operator'::module_role))));
alter policy "track crea notas" on public.agenda_notes
  with check ((( SELECT public.has_min_role('track'::spira_module, 'operator'::module_role)) AND (user_id = ( SELECT auth.uid()))));
alter policy "ver notas agenda" on public.agenda_notes
  using ((( SELECT public.has_module('track'::spira_module)) OR ( SELECT public.has_module('gerencia'::spira_module))));

-- alert_dismissals
alter policy "track descarta alerta" on public.alert_dismissals
  with check (((dismissed_by = ( SELECT auth.uid())) AND (( SELECT public.has_module('gerencia'::spira_module)) OR (visit_id IN ( SELECT public.visitas_que_coordino())))));
alter policy "track restaura alerta" on public.alert_dismissals
  using ((( SELECT public.has_module('gerencia'::spira_module)) OR (visit_id IN ( SELECT public.visitas_que_coordino()))));
alter policy "ver descartes" on public.alert_dismissals
  using ((( SELECT public.has_module('gerencia'::spira_module)) OR (visit_id IN ( SELECT public.visitas_que_coordino()))));

-- ambulatory_dispensations
alter policy "pharma ve las salidas ambulatorias" on public.ambulatory_dispensations
  using (((( SELECT public.has_module('pharma'::spira_module)) AND (( SELECT public.pharma_sin_recorte()) OR public.pharma_alcanza_lote(lot_id))) OR ( SELECT public.has_module('gerencia'::spira_module))));

-- audit_log
alter policy "gerencia ve auditoria" on public.audit_log
  using (( SELECT public.has_module('gerencia'::spira_module)));

-- checklist_completions
alter policy "track completa items" on public.checklist_completions
  with check (((completed_by = ( SELECT auth.uid())) AND (( SELECT public.has_module('gerencia'::spira_module)) OR (( SELECT public.has_min_role('track'::spira_module, 'operator'::module_role)) AND (EXISTS ( SELECT 1 FROM checklist_items ci WHERE ((ci.id = checklist_completions.item_id) AND (ci.visit_id IN ( SELECT public.visitas_que_coordino())))))))));
alter policy "track descompleta items" on public.checklist_completions
  using ((( SELECT public.has_module('gerencia'::spira_module)) OR (EXISTS ( SELECT 1 FROM checklist_items ci WHERE ((ci.id = checklist_completions.item_id) AND (ci.visit_id IN ( SELECT public.visitas_que_coordino())))))));
alter policy "ver completions" on public.checklist_completions
  using ((( SELECT public.has_module('gerencia'::spira_module)) OR (EXISTS ( SELECT 1 FROM checklist_items ci WHERE ((ci.id = checklist_completions.item_id) AND (ci.visit_id IN ( SELECT public.visitas_que_coordino())))))));

-- checklist_items
alter policy "gerencia borra checklist_items" on public.checklist_items
  using (( SELECT public.has_module('gerencia'::spira_module)));
alter policy "track edita checklist_items" on public.checklist_items
  using ((( SELECT public.has_module('gerencia'::spira_module)) OR (( SELECT public.has_min_role('track'::spira_module, 'operator'::module_role)) AND (visit_id IN ( SELECT public.visitas_que_coordino())))))
  with check ((( SELECT public.has_module('gerencia'::spira_module)) OR (( SELECT public.has_min_role('track'::spira_module, 'operator'::module_role)) AND (visit_id IN ( SELECT public.visitas_que_coordino())))));
alter policy "track inserta checklist_items" on public.checklist_items
  with check ((( SELECT public.has_module('gerencia'::spira_module)) OR (( SELECT public.has_min_role('track'::spira_module, 'operator'::module_role)) AND (visit_id IN ( SELECT public.visitas_que_coordino())))));
alter policy "ver checklist_items" on public.checklist_items
  using ((( SELECT public.has_module('gerencia'::spira_module)) OR (visit_id IN ( SELECT public.visitas_que_coordino()))));

-- checklist_report_ready
alter policy "track marca report_ready" on public.checklist_report_ready
  with check (((ready_by = ( SELECT auth.uid())) AND (( SELECT public.has_module('gerencia'::spira_module)) OR (EXISTS ( SELECT 1 FROM checklist_items ci WHERE ((ci.id = checklist_report_ready.item_id) AND (ci.visit_id IN ( SELECT public.visitas_que_coordino()))))))));
alter policy "track reabre report_ready" on public.checklist_report_ready
  using ((( SELECT public.has_module('gerencia'::spira_module)) OR (EXISTS ( SELECT 1 FROM checklist_items ci WHERE ((ci.id = checklist_report_ready.item_id) AND (ci.visit_id IN ( SELECT public.visitas_que_coordino())))))));
alter policy "ver report_ready" on public.checklist_report_ready
  using ((( SELECT public.has_module('gerencia'::spira_module)) OR (EXISTS ( SELECT 1 FROM checklist_items ci WHERE ((ci.id = checklist_report_ready.item_id) AND (ci.visit_id IN ( SELECT public.visitas_que_coordino())))))));

-- checklist_template_items
alter policy "lideres items plantilla" on public.checklist_template_items
  using ((( SELECT public.has_module('gerencia'::spira_module)) OR ( SELECT public.has_min_role('track'::spira_module, 'admin'::module_role)) OR (EXISTS ( SELECT 1 FROM checklist_templates t WHERE ((t.id = checklist_template_items.template_id) AND (t.protocol_id IS NOT NULL) AND ( SELECT public.has_min_role('track'::spira_module, 'operator'::module_role)) AND (t.protocol_id IN ( SELECT public.protocolos_que_coordino())))))))
  with check ((( SELECT public.has_module('gerencia'::spira_module)) OR ( SELECT public.has_min_role('track'::spira_module, 'admin'::module_role)) OR (EXISTS ( SELECT 1 FROM checklist_templates t WHERE ((t.id = checklist_template_items.template_id) AND (t.protocol_id IS NOT NULL) AND ( SELECT public.has_min_role('track'::spira_module, 'operator'::module_role)) AND (t.protocol_id IN ( SELECT public.protocolos_que_coordino())))))));
alter policy "ver items plantilla" on public.checklist_template_items
  using ((( SELECT public.has_module('gerencia'::spira_module)) OR (( SELECT public.has_module('track'::spira_module)) AND (EXISTS ( SELECT 1 FROM checklist_templates t WHERE ((t.id = checklist_template_items.template_id) AND ((t.protocol_id IS NULL) OR (t.protocol_id IN ( SELECT public.protocolos_que_coordino())))))))));

-- checklist_templates
alter policy "lideres plantillas" on public.checklist_templates
  using ((( SELECT public.has_module('gerencia'::spira_module)) OR ( SELECT public.has_min_role('track'::spira_module, 'admin'::module_role)) OR ((protocol_id IS NOT NULL) AND ( SELECT public.has_min_role('track'::spira_module, 'operator'::module_role)) AND (protocol_id IN ( SELECT public.protocolos_que_coordino())))))
  with check ((( SELECT public.has_module('gerencia'::spira_module)) OR ( SELECT public.has_min_role('track'::spira_module, 'admin'::module_role)) OR ((protocol_id IS NOT NULL) AND ( SELECT public.has_min_role('track'::spira_module, 'operator'::module_role)) AND (protocol_id IN ( SELECT public.protocolos_que_coordino())))));
alter policy "ver plantillas" on public.checklist_templates
  using ((( SELECT public.has_module('gerencia'::spira_module)) OR (protocol_id IS NULL) OR (protocol_id IN ( SELECT public.protocolos_que_coordino()))));

-- dispensation_habilitaciones
alter policy "ver habilitaciones" on public.dispensation_habilitaciones
  using (((( SELECT public.has_min_role('pharma'::spira_module, 'viewer'::module_role)) AND (( SELECT public.pharma_sin_recorte()) OR public.pharma_alcanza_solicitud(request_id))) OR ( SELECT public.has_module('gerencia'::spira_module)) OR (EXISTS ( SELECT 1 FROM dispensation_requests r WHERE ((r.id = dispensation_habilitaciones.request_id) AND (r.visit_id IN ( SELECT public.visitas_que_coordino())))))));

-- dispensation_ip_documents
alter policy "ver constancias de IP" on public.dispensation_ip_documents
  using (((( SELECT public.has_min_role('pharma'::spira_module, 'viewer'::module_role)) AND (( SELECT public.pharma_sin_recorte()) OR public.pharma_alcanza_solicitud(request_id))) OR ( SELECT public.has_module('gerencia'::spira_module)) OR (EXISTS ( SELECT 1 FROM dispensation_requests r WHERE ((r.id = dispensation_ip_documents.request_id) AND (r.visit_id IN ( SELECT public.visitas_que_coordino())))))));

-- dispensation_items
alter policy "borrar items dispensacion" on public.dispensation_items
  using ((( SELECT public.has_module('gerencia'::spira_module)) OR (( SELECT public.has_min_role('pharma'::spira_module, 'operator'::module_role)) AND (( SELECT public.pharma_sin_recorte()) OR public.pharma_alcanza_dispensacion(dispensation_id)) AND (EXISTS ( SELECT 1 FROM dispensations d WHERE ((d.id = dispensation_items.dispensation_id) AND (d.status <> 'entregada'::dispensation_status)))))));
alter policy "pharma edita items pre-entrega" on public.dispensation_items
  using ((( SELECT public.has_min_role('pharma'::spira_module, 'operator'::module_role)) AND (( SELECT public.pharma_sin_recorte()) OR public.pharma_alcanza_dispensacion(dispensation_id)) AND (EXISTS ( SELECT 1 FROM dispensations d WHERE ((d.id = dispensation_items.dispensation_id) AND (d.status <> 'entregada'::dispensation_status))))))
  with check ((( SELECT public.has_min_role('pharma'::spira_module, 'operator'::module_role)) AND (( SELECT public.pharma_sin_recorte()) OR public.pharma_alcanza_dispensacion(dispensation_id)) AND (EXISTS ( SELECT 1 FROM dispensations d WHERE ((d.id = dispensation_items.dispensation_id) AND (d.status <> 'entregada'::dispensation_status))))));
alter policy "pharma inserta items dispensacion" on public.dispensation_items
  with check ((( SELECT public.has_min_role('pharma'::spira_module, 'operator'::module_role)) AND (( SELECT public.pharma_sin_recorte()) OR public.pharma_alcanza_dispensacion(dispensation_id))));
alter policy "ver items dispensacion" on public.dispensation_items
  using (((( SELECT public.has_module('pharma'::spira_module)) AND (( SELECT public.pharma_sin_recorte()) OR public.pharma_alcanza_dispensacion(dispensation_id))) OR ( SELECT public.has_module('contable'::spira_module)) OR ( SELECT public.has_module('gerencia'::spira_module)) OR (EXISTS ( SELECT 1 FROM (dispensations d JOIN dispensation_requests dr ON ((dr.id = d.request_id))) WHERE ((d.id = dispensation_items.dispensation_id) AND (dr.visit_id IN ( SELECT public.visitas_que_coordino())))))));

-- dispensation_request_items
alter policy "gerencia elimina items solicitud" on public.dispensation_request_items
  using (( SELECT public.has_module('gerencia'::spira_module)));
alter policy "ver items solicitud" on public.dispensation_request_items
  using ((( SELECT public.has_module('gerencia'::spira_module)) OR (( SELECT public.has_module('pharma'::spira_module)) AND (( SELECT public.pharma_sin_recorte()) OR public.pharma_alcanza_solicitud(request_id))) OR (EXISTS ( SELECT 1 FROM dispensation_requests dr WHERE ((dr.id = dispensation_request_items.request_id) AND (dr.visit_id IN ( SELECT public.visitas_que_coordino())))))));

-- dispensation_requests
alter policy "gerencia elimina solicitud" on public.dispensation_requests
  using (( SELECT public.has_module('gerencia'::spira_module)));
alter policy "pharma atiende solicitud" on public.dispensation_requests
  using (((( SELECT public.has_min_role('pharma'::spira_module, 'operator'::module_role)) AND (( SELECT public.pharma_sin_recorte()) OR public.pharma_alcanza_solicitud(id))) OR ( SELECT public.has_module('gerencia'::spira_module))))
  with check (((( SELECT public.has_min_role('pharma'::spira_module, 'operator'::module_role)) AND (( SELECT public.pharma_sin_recorte()) OR public.pharma_alcanza_solicitud(id))) OR ( SELECT public.has_module('gerencia'::spira_module))));
alter policy "ver solicitudes" on public.dispensation_requests
  using ((( SELECT public.has_module('gerencia'::spira_module)) OR (( SELECT public.has_module('pharma'::spira_module)) AND (( SELECT public.pharma_sin_recorte()) OR public.pharma_alcanza_solicitud(id))) OR (visit_id IN ( SELECT public.visitas_que_coordino()))));

-- dispensations
alter policy "gerencia elimina dispensaciones" on public.dispensations
  using (( SELECT public.has_module('gerencia'::spira_module)));
alter policy "pharma actualiza dispensaciones" on public.dispensations
  using ((( SELECT public.has_min_role('pharma'::spira_module, 'operator'::module_role)) AND (( SELECT public.pharma_sin_recorte()) OR public.pharma_alcanza_solicitud(request_id))))
  with check ((( SELECT public.has_min_role('pharma'::spira_module, 'operator'::module_role)) AND (( SELECT public.pharma_sin_recorte()) OR public.pharma_alcanza_solicitud(request_id))));
alter policy "pharma ejecuta dispensaciones" on public.dispensations
  with check ((( SELECT public.has_min_role('pharma'::spira_module, 'operator'::module_role)) AND (executed_by = ( SELECT auth.uid())) AND (( SELECT public.pharma_sin_recorte()) OR public.pharma_alcanza_solicitud(request_id))));
alter policy "ver dispensaciones" on public.dispensations
  using (((( SELECT public.has_module('pharma'::spira_module)) AND (( SELECT public.pharma_sin_recorte()) OR public.pharma_alcanza_solicitud(request_id))) OR ( SELECT public.has_module('contable'::spira_module)) OR ( SELECT public.has_module('gerencia'::spira_module)) OR (EXISTS ( SELECT 1 FROM dispensation_requests dr WHERE ((dr.id = dispensations.request_id) AND (dr.visit_id IN ( SELECT public.visitas_que_coordino())))))));

-- drugs
alter policy "pharma leader administra drogas" on public.drugs
  using (( SELECT public.has_min_role('pharma'::spira_module, 'leader'::module_role)))
  with check (( SELECT public.has_min_role('pharma'::spira_module, 'leader'::module_role)));
alter policy "ver drogas" on public.drugs
  using ((( SELECT public.has_module('pharma'::spira_module)) OR ( SELECT public.has_module('gerencia'::spira_module)) OR ( SELECT public.has_module('contable'::spira_module)) OR ( SELECT public.has_module('track'::spira_module))));

-- enrollments
alter policy "coordinadoras editan enrolamiento" on public.enrollments
  using ((( SELECT public.has_module('gerencia'::spira_module)) OR (protocol_id IN ( SELECT public.protocolos_que_coordino()))))
  with check ((( SELECT public.has_module('gerencia'::spira_module)) OR (protocol_id IN ( SELECT public.protocolos_que_coordino()))));
alter policy "coordinadoras enrolan" on public.enrollments
  with check (((protocol_id IN ( SELECT public.protocolos_que_coordino())) AND ( SELECT public.has_min_role('track'::spira_module, 'operator'::module_role))));
alter policy "gerencia elimina enrolamiento" on public.enrollments
  using (( SELECT public.has_module('gerencia'::spira_module)));
alter policy "ver enrolamientos de mis protocolos" on public.enrollments
  using ((( SELECT public.has_module('gerencia'::spira_module)) OR (( SELECT public.has_module('pharma'::spira_module)) AND (( SELECT public.pharma_sin_recorte()) OR public.pharma_alcanza_protocolo(protocol_id))) OR (protocol_id IN ( SELECT public.protocolos_que_coordino()))));

-- farmacia_ajustes
alter policy "farmacia edita ajustes" on public.farmacia_ajustes
  using (( SELECT public.has_min_role('pharma'::spira_module, 'operator'::module_role)))
  with check (( SELECT public.has_min_role('pharma'::spira_module, 'operator'::module_role)));
alter policy "ver ajustes de farmacia" on public.farmacia_ajustes
  using ((( SELECT public.has_min_role('pharma'::spira_module, 'viewer'::module_role)) OR ( SELECT public.has_module('gerencia'::spira_module))));

-- feedback
alter policy "gerencia ve feedback" on public.feedback
  using (( SELECT public.has_module('gerencia'::spira_module)));

-- ip_units
alter policy "gerencia borra IP" on public.ip_units
  using (( SELECT public.has_module('gerencia'::spira_module)));
alter policy "pharma edita IP" on public.ip_units
  using ((( SELECT public.has_min_role('pharma'::spira_module, 'operator'::module_role)) AND (( SELECT public.pharma_sin_recorte()) OR public.pharma_alcanza_protocolo(protocol_id))))
  with check ((( SELECT public.has_min_role('pharma'::spira_module, 'operator'::module_role)) AND (( SELECT public.pharma_sin_recorte()) OR public.pharma_alcanza_protocolo(protocol_id))));
alter policy "pharma inserta IP" on public.ip_units
  with check ((( SELECT public.has_min_role('pharma'::spira_module, 'operator'::module_role)) AND (( SELECT public.pharma_sin_recorte()) OR public.pharma_alcanza_protocolo(protocol_id))));
alter policy "pharma/gerencia ven IP" on public.ip_units
  using (((( SELECT public.has_module('pharma'::spira_module)) AND (( SELECT public.pharma_sin_recorte()) OR public.pharma_alcanza_protocolo(protocol_id))) OR ( SELECT public.has_module('gerencia'::spira_module))));

-- laboratorio_codes
alter policy "pharma administra prefijos lab" on public.laboratorio_codes
  using (( SELECT public.has_min_role('pharma'::spira_module, 'operator'::module_role)))
  with check (( SELECT public.has_min_role('pharma'::spira_module, 'operator'::module_role)));
alter policy "ver prefijos lab" on public.laboratorio_codes
  using ((( SELECT public.has_module('pharma'::spira_module)) OR ( SELECT public.has_module('gerencia'::spira_module))));

-- laboratorios
alter policy "pharma administra laboratorios" on public.laboratorios
  using (( SELECT public.has_min_role('pharma'::spira_module, 'operator'::module_role)))
  with check (( SELECT public.has_min_role('pharma'::spira_module, 'operator'::module_role)));
alter policy "ver laboratorios" on public.laboratorios
  using ((( SELECT public.has_module('pharma'::spira_module)) OR ( SELECT public.has_module('gerencia'::spira_module)) OR ( SELECT public.has_module('contable'::spira_module))));

-- medication_codes
alter policy "pharma administra codigos" on public.medication_codes
  using (( SELECT public.has_min_role('pharma'::spira_module, 'operator'::module_role)))
  with check (( SELECT public.has_min_role('pharma'::spira_module, 'operator'::module_role)));
alter policy "ver codigos" on public.medication_codes
  using ((( SELECT public.has_module('pharma'::spira_module)) OR ( SELECT public.has_module('gerencia'::spira_module))));

-- medication_lots
alter policy "gerencia elimina lotes" on public.medication_lots
  using (( SELECT public.has_module('gerencia'::spira_module)));
alter policy "pharma edita lotes" on public.medication_lots
  using ((( SELECT public.has_min_role('pharma'::spira_module, 'operator'::module_role)) AND (( SELECT public.pharma_sin_recorte()) OR public.pharma_alcanza_protocolo(protocol_id))))
  with check ((( SELECT public.has_min_role('pharma'::spira_module, 'operator'::module_role)) AND (( SELECT public.pharma_sin_recorte()) OR public.pharma_alcanza_protocolo(protocol_id))));
alter policy "pharma inserta lotes" on public.medication_lots
  with check ((( SELECT public.has_min_role('pharma'::spira_module, 'operator'::module_role)) AND (( SELECT public.pharma_sin_recorte()) OR public.pharma_alcanza_protocolo(protocol_id))));
alter policy "ver lotes" on public.medication_lots
  using (((( SELECT public.has_module('pharma'::spira_module)) AND (( SELECT public.pharma_sin_recorte()) OR public.pharma_alcanza_protocolo(protocol_id))) OR ( SELECT public.has_module('gerencia'::spira_module)) OR ( SELECT public.has_module('contable'::spira_module))));

-- medication_receptions
alter policy "pharma administra recepciones" on public.medication_receptions
  using ((( SELECT public.has_min_role('pharma'::spira_module, 'operator'::module_role)) AND (( SELECT public.pharma_sin_recorte()) OR public.pharma_alcanza_protocolo(protocol_id))))
  with check ((( SELECT public.has_min_role('pharma'::spira_module, 'operator'::module_role)) AND (( SELECT public.pharma_sin_recorte()) OR public.pharma_alcanza_protocolo(protocol_id))));
alter policy "ver recepciones" on public.medication_receptions
  using (((( SELECT public.has_module('pharma'::spira_module)) AND (( SELECT public.pharma_sin_recorte()) OR public.pharma_alcanza_protocolo(protocol_id))) OR ( SELECT public.has_module('gerencia'::spira_module))));

-- medications
alter policy "gerencia elimina medicamentos" on public.medications
  using (( SELECT public.has_module('gerencia'::spira_module)));
alter policy "pharma/lider crean medicamentos" on public.medications
  with check (( SELECT public.has_min_role('pharma'::spira_module, 'leader'::module_role)));
alter policy "pharma/lider editan medicamentos" on public.medications
  using (( SELECT public.has_min_role('pharma'::spira_module, 'leader'::module_role)))
  with check (( SELECT public.has_min_role('pharma'::spira_module, 'leader'::module_role)));
alter policy "ver medicamentos" on public.medications
  using ((( SELECT public.has_module('pharma'::spira_module)) OR ( SELECT public.has_module('gerencia'::spira_module)) OR ( SELECT public.has_module('contable'::spira_module)) OR ( SELECT public.has_module('track'::spira_module))));

-- patient_medications
alter policy "gerencia elimina medicación" on public.patient_medications
  using (( SELECT public.has_module('gerencia'::spira_module)));
alter policy "pharma asigna medicación" on public.patient_medications
  with check ((( SELECT public.has_min_role('pharma'::spira_module, 'operator'::module_role)) AND (( SELECT public.pharma_sin_recorte()) OR public.pharma_alcanza_inscripcion(enrollment_id))));
alter policy "pharma modifica medicación" on public.patient_medications
  using ((( SELECT public.has_min_role('pharma'::spira_module, 'operator'::module_role)) AND (( SELECT public.pharma_sin_recorte()) OR public.pharma_alcanza_inscripcion(enrollment_id))))
  with check ((( SELECT public.has_min_role('pharma'::spira_module, 'operator'::module_role)) AND (( SELECT public.pharma_sin_recorte()) OR public.pharma_alcanza_inscripcion(enrollment_id))));
alter policy "ver medicación asignada" on public.patient_medications
  using (((( SELECT public.has_module('pharma'::spira_module)) AND (( SELECT public.pharma_sin_recorte()) OR public.pharma_alcanza_inscripcion(enrollment_id))) OR ( SELECT public.has_module('gerencia'::spira_module)) OR (EXISTS ( SELECT 1 FROM enrollments e WHERE ((e.id = patient_medications.enrollment_id) AND (e.protocol_id IN ( SELECT public.protocolos_que_coordino())))))));

-- patient_timeline
alter policy "track/pharma registran eventos" on public.patient_timeline
  with check (((actor_id = ( SELECT auth.uid())) AND (( SELECT public.has_module('gerencia'::spira_module)) OR (( SELECT public.has_min_role('pharma'::spira_module, 'operator'::module_role)) AND (( SELECT public.pharma_sin_recorte()) OR public.pharma_alcanza_visita(visit_id))) OR (( SELECT public.has_min_role('track'::spira_module, 'operator'::module_role)) AND (visit_id IN ( SELECT public.visitas_que_coordino()))))));
alter policy "ver timeline" on public.patient_timeline
  using ((( SELECT public.has_module('gerencia'::spira_module)) OR (( SELECT public.has_module('pharma'::spira_module)) AND (( SELECT public.pharma_sin_recorte()) OR public.pharma_alcanza_visita(visit_id))) OR (visit_id IN ( SELECT public.visitas_que_coordino()))));

-- patient_visits
alter policy "track borra visitas sueltas" on public.patient_visits
  using (((kind <> 'programada'::visit_kind) AND (kind <> 'randomizacion'::visit_kind) AND (( SELECT public.has_module('gerencia'::spira_module)) OR (( SELECT public.has_min_role('track'::spira_module, 'operator'::module_role)) AND (enrollment_id IN ( SELECT public.inscripciones_que_coordino()))))));
alter policy "track modifica visitas propias" on public.patient_visits
  using ((( SELECT public.has_module('gerencia'::spira_module)) OR (( SELECT public.has_min_role('track'::spira_module, 'operator'::module_role)) AND (enrollment_id IN ( SELECT public.inscripciones_que_coordino())))))
  with check ((( SELECT public.has_module('gerencia'::spira_module)) OR (( SELECT public.has_min_role('track'::spira_module, 'operator'::module_role)) AND (enrollment_id IN ( SELECT public.inscripciones_que_coordino())))));
alter policy "ver visitas de mis protocolos" on public.patient_visits
  using ((( SELECT public.has_module('gerencia'::spira_module)) OR (enrollment_id IN ( SELECT public.inscripciones_que_coordino()))));

-- patients
alter policy "gerencia elimina pacientes" on public.patients
  using (( SELECT public.has_module('gerencia'::spira_module)));
alter policy "track crea pacientes" on public.patients
  with check (( SELECT public.has_min_role('track'::spira_module, 'operator'::module_role)));
alter policy "track edita pacientes propios" on public.patients
  using ((( SELECT public.has_module('gerencia'::spira_module)) OR (( SELECT public.has_min_role('track'::spira_module, 'operator'::module_role)) AND (id IN ( SELECT public.pacientes_que_coordino())))))
  with check ((( SELECT public.has_module('gerencia'::spira_module)) OR (( SELECT public.has_min_role('track'::spira_module, 'operator'::module_role)) AND (id IN ( SELECT public.pacientes_que_coordino())))));
alter policy "ver pacientes de mis protocolos" on public.patients
  using ((( SELECT public.has_module('gerencia'::spira_module)) OR (( SELECT public.has_module('pharma'::spira_module)) AND (( SELECT public.pharma_sin_recorte()) OR public.pharma_alcanza_paciente(id))) OR (id IN ( SELECT public.pacientes_que_coordino()))));

-- pedido_medicacion_items
alter policy "ver renglones de pedidos de medicacion" on public.pedido_medicacion_items
  using (((( SELECT public.has_min_role('pharma'::spira_module, 'viewer'::module_role)) AND (( SELECT public.pharma_sin_recorte()) OR public.pharma_alcanza_pedido(pedido_id))) OR ( SELECT public.has_module('gerencia'::spira_module))));

-- pedidos_medicacion
alter policy "ver pedidos de medicacion" on public.pedidos_medicacion
  using (((( SELECT public.has_min_role('pharma'::spira_module, 'viewer'::module_role)) AND (( SELECT public.pharma_sin_recorte()) OR public.pharma_alcanza_protocolo(protocol_id))) OR ( SELECT public.has_module('gerencia'::spira_module))));

-- pharma_protocol_access
alter policy "ver alcance de farmacia" on public.pharma_protocol_access
  using (((user_id = ( SELECT auth.uid())) OR ( SELECT public.has_module('gerencia'::spira_module))));

-- procedures
alter policy "editar procedures" on public.procedures
  using ((( SELECT public.has_module('gerencia'::spira_module)) OR ( SELECT public.has_min_role('track'::spira_module, 'leader'::module_role))))
  with check ((( SELECT public.has_module('gerencia'::spira_module)) OR ( SELECT public.has_min_role('track'::spira_module, 'leader'::module_role))));
alter policy "ver procedures" on public.procedures
  using ((( SELECT public.has_module('track'::spira_module)) OR ( SELECT public.has_module('pharma'::spira_module)) OR ( SELECT public.has_module('gerencia'::spira_module))));

-- protocol_activities
alter policy "lideres editan activities" on public.protocol_activities
  using (( SELECT public.has_min_role('track'::spira_module, 'operator'::module_role)))
  with check (( SELECT public.has_min_role('track'::spira_module, 'operator'::module_role)));
alter policy "ver config protocolo (activities)" on public.protocol_activities
  using ((( SELECT public.has_module('gerencia'::spira_module)) OR (( SELECT public.has_module('pharma'::spira_module)) AND (( SELECT public.pharma_sin_recorte()) OR public.pharma_alcanza_protocolo(protocol_id))) OR (protocol_id IN ( SELECT public.protocolos_que_coordino()))));

-- protocol_alerts
alter policy "lideres administran alertas" on public.protocol_alerts
  using ((( SELECT public.has_role('track'::spira_module, 'leader'::module_role)) OR (( SELECT public.has_role('pharma'::spira_module, 'leader'::module_role)) AND (( SELECT public.pharma_sin_recorte()) OR public.pharma_alcanza_protocolo(protocol_id)))))
  with check ((( SELECT public.has_role('track'::spira_module, 'leader'::module_role)) OR (( SELECT public.has_role('pharma'::spira_module, 'leader'::module_role)) AND (( SELECT public.pharma_sin_recorte()) OR public.pharma_alcanza_protocolo(protocol_id)))));
alter policy "ver alertas" on public.protocol_alerts
  using ((( SELECT public.has_module('track'::spira_module)) OR (( SELECT public.has_module('pharma'::spira_module)) AND (( SELECT public.pharma_sin_recorte()) OR public.pharma_alcanza_protocolo(protocol_id))) OR ( SELECT public.has_module('gerencia'::spira_module))));

-- protocol_coordinators
alter policy "lideres asignan" on public.protocol_coordinators
  using (( SELECT public.has_min_role('track'::spira_module, 'leader'::module_role)))
  with check (( SELECT public.has_min_role('track'::spira_module, 'leader'::module_role)));
alter policy "ver asignaciones" on public.protocol_coordinators
  using (((user_id = ( SELECT auth.uid())) OR ( SELECT public.has_role('track'::spira_module, 'leader'::module_role)) OR ( SELECT public.has_module('gerencia'::spira_module))));

-- protocol_deviations
alter policy "track corrige desviacion" on public.protocol_deviations
  using ((( SELECT public.has_module('gerencia'::spira_module)) OR (visit_id IN ( SELECT public.visitas_que_coordino()))));
alter policy "track documenta desviacion" on public.protocol_deviations
  with check (((recorded_by = ( SELECT auth.uid())) AND (( SELECT public.has_module('gerencia'::spira_module)) OR (visit_id IN ( SELECT public.visitas_que_coordino())))));
alter policy "ver desviaciones" on public.protocol_deviations
  using ((( SELECT public.has_module('gerencia'::spira_module)) OR (visit_id IN ( SELECT public.visitas_que_coordino()))));

-- protocol_medications
alter policy "pharma leader asigna" on public.protocol_medications
  using ((( SELECT public.has_min_role('pharma'::spira_module, 'leader'::module_role)) AND (( SELECT public.pharma_sin_recorte()) OR public.pharma_alcanza_protocolo(protocol_id))))
  with check ((( SELECT public.has_min_role('pharma'::spira_module, 'leader'::module_role)) AND (( SELECT public.pharma_sin_recorte()) OR public.pharma_alcanza_protocolo(protocol_id))));
alter policy "ver asignacion" on public.protocol_medications
  using (((( SELECT public.has_module('pharma'::spira_module)) AND (( SELECT public.pharma_sin_recorte()) OR public.pharma_alcanza_protocolo(protocol_id))) OR ( SELECT public.has_module('gerencia'::spira_module))));

-- protocol_procedures
alter policy "editar procedimientos del estudio" on public.protocol_procedures
  using ((( SELECT public.has_module('gerencia'::spira_module)) OR ( SELECT public.has_min_role('track'::spira_module, 'operator'::module_role))))
  with check ((( SELECT public.has_module('gerencia'::spira_module)) OR ( SELECT public.has_min_role('track'::spira_module, 'operator'::module_role))));
alter policy "ver procedimientos del estudio" on public.protocol_procedures
  using ((( SELECT public.has_module('track'::spira_module)) OR (( SELECT public.has_module('pharma'::spira_module)) AND (( SELECT public.pharma_sin_recorte()) OR public.pharma_alcanza_protocolo(protocol_id))) OR ( SELECT public.has_module('gerencia'::spira_module))));

-- protocols
alter policy "gerencia elimina protocolos" on public.protocols
  using (( SELECT public.has_module('gerencia'::spira_module)));
alter policy "lideres crean protocolos" on public.protocols
  with check (( SELECT public.has_min_role('track'::spira_module, 'operator'::module_role)));
alter policy "lideres editan protocolos" on public.protocols
  using (( SELECT public.has_min_role('track'::spira_module, 'operator'::module_role)))
  with check (( SELECT public.has_min_role('track'::spira_module, 'operator'::module_role)));
alter policy "ver protocolos asignados" on public.protocols
  using ((( SELECT public.has_module('gerencia'::spira_module)) OR (id IN ( SELECT public.protocolos_que_coordino())) OR ( SELECT public.has_role('track'::spira_module, 'leader'::module_role)) OR ( SELECT public.has_min_role('track'::spira_module, 'admin'::module_role)) OR (( SELECT public.has_module('pharma'::spira_module)) AND (( SELECT public.pharma_sin_recorte()) OR public.pharma_alcanza_protocolo(id))) OR ( SELECT public.has_module('contable'::spira_module))));

-- reception_items
alter policy "pharma administra items recepcion" on public.reception_items
  using ((( SELECT public.has_min_role('pharma'::spira_module, 'operator'::module_role)) AND (( SELECT public.pharma_sin_recorte()) OR public.pharma_alcanza_recepcion(reception_id))))
  with check ((( SELECT public.has_min_role('pharma'::spira_module, 'operator'::module_role)) AND (( SELECT public.pharma_sin_recorte()) OR public.pharma_alcanza_recepcion(reception_id))));
alter policy "ver items recepcion" on public.reception_items
  using (((( SELECT public.has_module('pharma'::spira_module)) AND (( SELECT public.pharma_sin_recorte()) OR public.pharma_alcanza_recepcion(reception_id))) OR ( SELECT public.has_module('gerencia'::spira_module))));

-- report_definitions
alter policy "editar definiciones de reporte" on public.report_definitions
  using ((( SELECT public.has_module('gerencia'::spira_module)) OR ( SELECT public.has_min_role('track'::spira_module, 'operator'::module_role))))
  with check ((( SELECT public.has_module('gerencia'::spira_module)) OR ( SELECT public.has_min_role('track'::spira_module, 'operator'::module_role))));
alter policy "ver definiciones de reporte" on public.report_definitions
  using ((( SELECT public.has_module('track'::spira_module)) OR ( SELECT public.has_module('pharma'::spira_module)) OR ( SELECT public.has_module('gerencia'::spira_module))));

-- report_platforms
alter policy "editar plataformas" on public.report_platforms
  using ((( SELECT public.has_module('gerencia'::spira_module)) OR ( SELECT public.has_min_role('track'::spira_module, 'leader'::module_role))))
  with check ((( SELECT public.has_module('gerencia'::spira_module)) OR ( SELECT public.has_min_role('track'::spira_module, 'leader'::module_role))));
alter policy "ver plataformas" on public.report_platforms
  using ((( SELECT public.has_module('track'::spira_module)) OR ( SELECT public.has_module('pharma'::spira_module)) OR ( SELECT public.has_module('gerencia'::spira_module))));

-- report_status
alter policy "ver estado de reporte" on public.report_status
  using ((( SELECT public.has_module('gerencia'::spira_module)) OR (visit_id IN ( SELECT public.visitas_que_coordino()))));

-- report_status_history
alter policy "ver historial de reporte" on public.report_status_history
  using ((EXISTS ( SELECT 1 FROM report_status rs WHERE ((rs.id = report_status_history.report_status_id) AND (( SELECT public.has_module('gerencia'::spira_module)) OR (rs.visit_id IN ( SELECT public.visitas_que_coordino())))))));

-- stock_movements
alter policy "pharma inserta movimientos" on public.stock_movements
  with check ((( SELECT public.has_min_role('pharma'::spira_module, 'operator'::module_role)) AND (( SELECT public.pharma_sin_recorte()) OR public.pharma_alcanza_lote(lot_id))));
alter policy "ver movimientos stock" on public.stock_movements
  using (((( SELECT public.has_module('pharma'::spira_module)) AND (( SELECT public.pharma_sin_recorte()) OR public.pharma_alcanza_lote(lot_id))) OR ( SELECT public.has_module('contable'::spira_module)) OR ( SELECT public.has_module('gerencia'::spira_module))));

-- track_dispensations
alter policy "gerencia elimina track_dispensations" on public.track_dispensations
  using (( SELECT public.has_module('gerencia'::spira_module)));
alter policy "track inserta track_dispensations" on public.track_dispensations
  with check (((dispensed_by = ( SELECT auth.uid())) AND (( SELECT public.has_module('gerencia'::spira_module)) OR (( SELECT public.has_min_role('track'::spira_module, 'operator'::module_role)) AND (patient_visit_id IN ( SELECT public.visitas_que_coordino()))))));
alter policy "ver track_dispensations" on public.track_dispensations
  using ((( SELECT public.has_module('gerencia'::spira_module)) OR (( SELECT public.has_module('pharma'::spira_module)) AND (( SELECT public.pharma_sin_recorte()) OR public.pharma_alcanza_visita(patient_visit_id))) OR ( SELECT public.has_module('contable'::spira_module)) OR (patient_visit_id IN ( SELECT public.visitas_que_coordino()))));

-- user_module_roles
alter policy "gerencia administra roles" on public.user_module_roles
  using (( SELECT public.has_module('gerencia'::spira_module)))
  with check (( SELECT public.has_module('gerencia'::spira_module)));
alter policy "ver roles propios o gerencia" on public.user_module_roles
  using (((user_id = ( SELECT auth.uid())) OR ( SELECT public.has_module('gerencia'::spira_module))));

-- user_preferences
alter policy "preferencias propias" on public.user_preferences
  using ((user_id = ( SELECT auth.uid())))
  with check ((user_id = ( SELECT auth.uid())));

-- users
alter policy "perfil propio: ver" on public.users
  using (((id = ( SELECT auth.uid())) OR ( SELECT public.has_module('gerencia'::spira_module))));

-- visit_comments
alter policy "ver comentarios de visitas visibles" on public.visit_comments
  using ((( SELECT public.has_module('gerencia'::spira_module)) OR (visit_id IN ( SELECT public.visitas_que_coordino()))));

-- visit_definitions
alter policy "gestiona visit_definitions (insert)" on public.visit_definitions
  with check ((( SELECT public.has_module('gerencia'::spira_module)) OR ( SELECT public.has_min_role('track'::spira_module, 'admin'::module_role))));
alter policy "gestiona visit_definitions (update)" on public.visit_definitions
  using ((( SELECT public.has_module('gerencia'::spira_module)) OR ( SELECT public.has_min_role('track'::spira_module, 'admin'::module_role))))
  with check ((( SELECT public.has_module('gerencia'::spira_module)) OR ( SELECT public.has_min_role('track'::spira_module, 'admin'::module_role))));
alter policy "track-admin ve visit_definitions" on public.visit_definitions
  using (( SELECT public.has_min_role('track'::spira_module, 'admin'::module_role)));
alter policy "ver visit_definitions" on public.visit_definitions
  using ((( SELECT public.has_module('gerencia'::spira_module)) OR ( SELECT public.has_module('pharma'::spira_module)) OR (protocol_id IN ( SELECT public.protocolos_que_coordino()))));

-- visit_procedure_completions
alter policy "track destilda procedimiento" on public.visit_procedure_completions
  using ((( SELECT public.has_module('gerencia'::spira_module)) OR (visit_id IN ( SELECT public.visitas_que_coordino()))));
alter policy "track tilda procedimiento" on public.visit_procedure_completions
  with check (((completed_by = ( SELECT auth.uid())) AND (( SELECT public.has_module('gerencia'::spira_module)) OR (visit_id IN ( SELECT public.visitas_que_coordino())))));
alter policy "ver procedimiento realizado" on public.visit_procedure_completions
  using ((( SELECT public.has_module('gerencia'::spira_module)) OR (visit_id IN ( SELECT public.visitas_que_coordino()))));

-- visit_procedure_reports_ready
alter policy "track marca reporte procedimiento" on public.visit_procedure_reports_ready
  with check (((ready_by = ( SELECT auth.uid())) AND (( SELECT public.has_module('gerencia'::spira_module)) OR (visit_id IN ( SELECT public.visitas_que_coordino())))));
alter policy "track reabre reporte procedimiento" on public.visit_procedure_reports_ready
  using ((( SELECT public.has_module('gerencia'::spira_module)) OR (visit_id IN ( SELECT public.visitas_que_coordino()))));
alter policy "ver reporte procedimiento" on public.visit_procedure_reports_ready
  using ((( SELECT public.has_module('gerencia'::spira_module)) OR (visit_id IN ( SELECT public.visitas_que_coordino()))));

notify pgrst, 'reload schema';


-- 3 · Sonda (se mira) -------------------------------------------------------------------------------
-- Tiene que dar  sin_envolver = 0 · por_fila = 0 · funciones = 4.
--   sin_envolver: policies de public que todavía llaman has_module / has_role / has_min_role /
--                 auth.uid() SIN el (select …) — o sea, una por fila. Postgres muestra el envuelto
--                 como "( SELECT has_module(…) AS has_module)": por eso se busca lo que NO viene
--                 después de "SELECT ".
--   por_fila:     policies de public que todavía llaman coordina_visita / is_assigned_coordinator.
--   funciones:    las cuatro nuevas.
-- Un número distinto quiere decir que algo no tomó: no sacar conclusiones de la velocidad sin mirarla.
select
  (select count(*) from pg_policies
    where schemaname = 'public'
      and coalesce(qual, '') || ' ' || coalesce(with_check, '')
          ~ '(?<!SELECT )(has_module|has_role|has_min_role|auth\.uid)\(')             as sin_envolver,
  (select count(*) from pg_policies
    where schemaname = 'public'
      and coalesce(qual, '') || ' ' || coalesce(with_check, '')
          ~ '(coordina_visita|is_assigned_coordinator)\(')                             as por_fila,
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('protocolos_que_coordino', 'inscripciones_que_coordino',
                        'pacientes_que_coordino', 'visitas_que_coordino'))              as funciones;
