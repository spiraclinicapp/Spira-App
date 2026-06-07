-- Spira · Migración 0009 — Niveles de rol estrictos (escalera viewer<operator<leader<admin)
-- ----------------------------------------------------------------------------
-- MODELO:
--   viewer   → solo lectura.
--   operator → opera y configura su módulo. En track: pacientes, visitas,
--              checklists, protocolos, esquemas de visita, plantillas (todo).
--              En pharma: dispensa, stock, recepciones, lotes.
--   leader   → todo lo de operator + el CATÁLOGO de medicación (medications) en pharma.
--   gerencia → roles, auditoría y TODOS los borrados (eliminar protocolos/registros).
--
-- Carve-out de seguridad: asignar coordinadores a protocolos (protocol_coordinators)
-- queda en leader (no operator) — controla QUIÉN ve QUÉ; un operator no debe
-- auto-asignarse scope.
-- ============================================================================


-- ── Helpers: escalera de niveles ────────────────────────────────────────────
create or replace function public.role_rank(r module_role)
returns int language sql immutable
set search_path = pg_catalog, public as $$
  select case r
    when 'viewer'   then 1
    when 'operator' then 2
    when 'leader'   then 3
    when 'admin'    then 4
  end;
$$;

-- ¿El usuario tiene en `mod` un nivel >= `min_role`?
create or replace function public.has_min_role(mod spira_module, min_role module_role)
returns boolean language sql security definer stable
set search_path = pg_catalog, public as $$
  select exists (
    select 1 from public.user_module_roles umr
    where umr.user_id = auth.uid()
      and umr.module = mod
      and public.role_rank(umr.role) >= public.role_rank(min_role)
  );
$$;


-- ============================================================================
-- TRACK · operativo + config → operator (viewer excluido de escribir)
-- ============================================================================

alter policy "track crea pacientes" on public.patients
  with check (public.has_min_role('track', 'operator'));

alter policy "track edita pacientes propios" on public.patients
  using (
    public.has_module('gerencia') or (public.has_min_role('track', 'operator') and exists (
      select 1 from public.enrollments e
      join public.protocol_coordinators pc on pc.protocol_id = e.protocol_id
      where e.patient_id = patients.id and pc.user_id = auth.uid()))
  )
  with check (
    public.has_module('gerencia') or (public.has_min_role('track', 'operator') and exists (
      select 1 from public.enrollments e
      join public.protocol_coordinators pc on pc.protocol_id = e.protocol_id
      where e.patient_id = patients.id and pc.user_id = auth.uid()))
  );

alter policy "coordinadoras enrolan" on public.enrollments
  with check (public.is_assigned_coordinator(protocol_id) and public.has_min_role('track', 'operator'));

alter policy "coordinadoras editan enrolamiento" on public.enrollments
  using (public.is_assigned_coordinator(protocol_id) and public.has_min_role('track', 'operator'))
  with check (public.is_assigned_coordinator(protocol_id) and public.has_min_role('track', 'operator'));

alter policy "track modifica visitas propias" on public.patient_visits
  using (
    public.has_module('gerencia') or (public.has_min_role('track', 'operator') and exists (
      select 1 from public.enrollments e
      join public.protocol_coordinators pc on pc.protocol_id = e.protocol_id
      where e.id = patient_visits.enrollment_id and pc.user_id = auth.uid()))
  )
  with check (
    public.has_module('gerencia') or (public.has_min_role('track', 'operator') and exists (
      select 1 from public.enrollments e
      join public.protocol_coordinators pc on pc.protocol_id = e.protocol_id
      where e.id = patient_visits.enrollment_id and pc.user_id = auth.uid()))
  );

-- protocolos: crear/editar = operator (operator y leader hacen lo mismo); borrar = gerencia (sin cambio)
alter policy "lideres crean protocolos" on public.protocols
  with check (public.has_min_role('track', 'operator'));
alter policy "lideres editan protocolos" on public.protocols
  using (public.has_min_role('track', 'operator')) with check (public.has_min_role('track', 'operator'));

-- esquemas de visita, plantillas, actividades → operator (manejo completo)
alter policy "lideres editan visit_definitions" on public.visit_definitions
  using (public.has_min_role('track', 'operator')) with check (public.has_min_role('track', 'operator'));
alter policy "lideres editan activities" on public.protocol_activities
  using (public.has_min_role('track', 'operator')) with check (public.has_min_role('track', 'operator'));
alter policy "lideres plantillas" on public.checklist_templates
  using (public.has_min_role('track', 'operator')) with check (public.has_min_role('track', 'operator'));
alter policy "lideres items plantilla" on public.checklist_template_items
  using (public.has_min_role('track', 'operator')) with check (public.has_min_role('track', 'operator'));

-- CARVE-OUT: asignar coordinadores a protocolos queda en LEADER (control de acceso)
alter policy "lideres asignan" on public.protocol_coordinators
  using (public.has_min_role('track', 'leader')) with check (public.has_min_role('track', 'leader'));

alter policy "track inserta checklist_items" on public.checklist_items
  with check (public.has_module('gerencia') or (public.has_min_role('track', 'operator') and public.coordina_visita(visit_id)));
alter policy "track edita checklist_items" on public.checklist_items
  using (public.has_module('gerencia') or (public.has_min_role('track', 'operator') and public.coordina_visita(visit_id)))
  with check (public.has_module('gerencia') or (public.has_min_role('track', 'operator') and public.coordina_visita(visit_id)));

alter policy "track completa items" on public.checklist_completions
  with check (
    completed_by = auth.uid() and (
      public.has_module('gerencia') or (public.has_min_role('track', 'operator') and exists (
        select 1 from public.checklist_items ci
        where ci.id = checklist_completions.item_id and public.coordina_visita(ci.visit_id))))
  );

alter policy "track crea notas" on public.agenda_notes
  with check (public.has_min_role('track', 'operator') and user_id = auth.uid());
alter policy "edita notas propias" on public.agenda_notes
  using (user_id = auth.uid() and public.has_min_role('track', 'operator'))
  with check (user_id = auth.uid() and public.has_min_role('track', 'operator'));

-- timeline: track operator (scopeado) o pharma operator o gerencia; actor fijo
alter policy "track/pharma registran eventos" on public.patient_timeline
  with check (
    actor_id = auth.uid() and (
      public.has_module('gerencia')
      or public.has_min_role('pharma', 'operator')
      or (public.has_min_role('track', 'operator') and public.coordina_visita(visit_id)))
  );


-- ============================================================================
-- PHARMA · operativo → operator · CATÁLOGO de medicación → leader
-- ============================================================================

-- catálogo de medicación = SOLO farmacéutica (pharma leader).
-- El ALTER reemplaza la condición COMPLETA de 0006 → elimina el branch track-leader
-- (un coordinador líder de track YA NO maneja el catálogo de medicación).
alter policy "pharma/lider crean medicamentos" on public.medications
  with check (public.has_min_role('pharma', 'leader'));
alter policy "pharma/lider editan medicamentos" on public.medications
  using (public.has_min_role('pharma', 'leader')) with check (public.has_min_role('pharma', 'leader'));
create policy "gerencia elimina medicamentos" on public.medications
  for delete using (public.has_module('gerencia'));

-- lotes, recepciones → operator
alter policy "pharma inserta lotes" on public.medication_lots
  with check (public.has_min_role('pharma', 'operator'));
alter policy "pharma edita lotes" on public.medication_lots
  using (public.has_min_role('pharma', 'operator')) with check (public.has_min_role('pharma', 'operator'));
alter policy "pharma administra recepciones" on public.medication_receptions
  using (public.has_min_role('pharma', 'operator')) with check (public.has_min_role('pharma', 'operator'));
alter policy "pharma administra items recepcion" on public.reception_items
  using (public.has_min_role('pharma', 'operator')) with check (public.has_min_role('pharma', 'operator'));

-- dispensación: track operator solicita (scopeado) · pharma operator ejecuta
alter policy "track crea solicitudes" on public.dispensation_requests
  with check (public.has_min_role('track', 'operator') and requested_by = auth.uid() and public.coordina_visita(visit_id));
alter policy "pharma atiende solicitud" on public.dispensation_requests
  using (public.has_min_role('pharma', 'operator') or public.has_module('gerencia'))
  with check (public.has_min_role('pharma', 'operator') or public.has_module('gerencia'));
alter policy "track gestiona solicitud propia" on public.dispensation_requests
  using (public.has_min_role('track', 'operator') and public.coordina_visita(visit_id))
  with check (public.has_min_role('track', 'operator') and public.coordina_visita(visit_id));

alter policy "track administra items solicitud" on public.dispensation_request_items
  using (public.has_min_role('track', 'operator') and exists (
    select 1 from public.dispensation_requests dr
    where dr.id = dispensation_request_items.request_id and public.coordina_visita(dr.visit_id)))
  with check (public.has_min_role('track', 'operator') and exists (
    select 1 from public.dispensation_requests dr
    where dr.id = dispensation_request_items.request_id and public.coordina_visita(dr.visit_id)));

alter policy "pharma ejecuta dispensaciones" on public.dispensations
  with check (public.has_min_role('pharma', 'operator') and executed_by = auth.uid());
alter policy "pharma actualiza dispensaciones" on public.dispensations
  using (public.has_min_role('pharma', 'operator')) with check (public.has_min_role('pharma', 'operator'));

alter policy "pharma inserta items dispensacion" on public.dispensation_items
  with check (public.has_min_role('pharma', 'operator'));
alter policy "pharma edita items pre-entrega" on public.dispensation_items
  using (public.has_min_role('pharma', 'operator') and exists (
    select 1 from public.dispensations d where d.id = dispensation_items.dispensation_id and d.status <> 'entregada'))
  with check (public.has_min_role('pharma', 'operator') and exists (
    select 1 from public.dispensations d where d.id = dispensation_items.dispensation_id and d.status <> 'entregada'));
alter policy "borrar items dispensacion" on public.dispensation_items
  using (
    public.has_module('gerencia')
    or (public.has_min_role('pharma', 'operator') and exists (
      select 1 from public.dispensations d where d.id = dispensation_items.dispensation_id and d.status <> 'entregada'))
  );

alter policy "pharma inserta movimientos" on public.stock_movements
  with check (public.has_min_role('pharma', 'operator'));


-- ============================================================================
-- ALERTAS · config operativa (umbrales de stock bajo / vencimiento) → operator.
-- NO es control de acceso (no decide quién ve qué), por eso NO va al carve-out
-- de leader como protocol_coordinators. Es configuración del módulo → operator.
-- ============================================================================
alter policy "lideres administran alertas" on public.protocol_alerts
  using (public.has_min_role('track', 'operator') or public.has_min_role('pharma', 'operator'))
  with check (public.has_min_role('track', 'operator') or public.has_min_role('pharma', 'operator'));
