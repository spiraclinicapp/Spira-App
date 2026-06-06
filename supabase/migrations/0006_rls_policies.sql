-- Spira · Migración 0006 — RLS: enable + helpers + policies

-- ============================================================================
-- 13 · ROW LEVEL SECURITY
-- ============================================================================

alter table public.users                      enable row level security;
alter table public.user_module_roles          enable row level security;
alter table public.protocols                  enable row level security;
alter table public.protocol_coordinators      enable row level security;
alter table public.protocol_activities        enable row level security;
alter table public.patients                   enable row level security;
alter table public.enrollments                enable row level security;
alter table public.visit_definitions          enable row level security;
alter table public.patient_visits             enable row level security;
alter table public.checklist_templates        enable row level security;
alter table public.checklist_template_items   enable row level security;
alter table public.checklist_items            enable row level security;
alter table public.checklist_completions      enable row level security;
alter table public.agenda_notes               enable row level security;
alter table public.patient_timeline           enable row level security;
alter table public.medications                enable row level security;
alter table public.medication_lots            enable row level security;
alter table public.medication_receptions      enable row level security;
alter table public.reception_items            enable row level security;
alter table public.dispensation_requests      enable row level security;
alter table public.dispensation_request_items enable row level security;
alter table public.dispensations              enable row level security;
alter table public.dispensation_items         enable row level security;
alter table public.stock_movements            enable row level security;
alter table public.protocol_alerts            enable row level security;
alter table public.audit_log                  enable row level security;


-- ── Helpers de RLS (SECURITY DEFINER con search_path fijo) ──────────────────
create or replace function public.has_module(mod spira_module)
returns boolean language sql security definer stable
set search_path = pg_catalog, public as $$
  select exists (select 1 from public.user_module_roles
                 where user_id = auth.uid() and module = mod);
$$;

create or replace function public.has_role(mod spira_module, rol module_role)
returns boolean language sql security definer stable
set search_path = pg_catalog, public as $$
  select exists (select 1 from public.user_module_roles
                 where user_id = auth.uid() and module = mod and role = rol);
$$;

create or replace function public.is_assigned_coordinator(proto_id uuid)
returns boolean language sql security definer stable
set search_path = pg_catalog, public as $$
  select exists (select 1 from public.protocol_coordinators
                 where protocol_id = proto_id and user_id = auth.uid());
$$;

-- ¿El usuario coordina el protocolo al que pertenece esta VISITA? (scoping transitivo)
create or replace function public.coordina_visita(v_visit_id uuid)
returns boolean language sql security definer stable
set search_path = pg_catalog, public as $$
  select exists (
    select 1 from public.patient_visits pv
    join public.enrollments e            on e.id = pv.enrollment_id
    join public.protocol_coordinators pc on pc.protocol_id = e.protocol_id
    where pv.id = v_visit_id and pc.user_id = auth.uid()
  );
$$;

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ NOTA DE DISEÑO · PHARMA CENTRAL                                           ║
-- ║ La farmacia es CENTRAL: una sola, atiende TODOS los protocolos. Por eso   ║
-- ║ las policies de pharma/contable validan solo módulo (ven todos los        ║
-- ║ protocolos) — es INTENCIONAL, no un agujero. El aislamiento por protocolo ║
-- ║ aplica al lado TRACK (coordinadoras) vía protocol_coordinators /          ║
-- ║ public.coordina_visita. Si algún día la farmacia se segrega por sponsor,    ║
-- ║ crear pharma_assignments(user_id, protocol_id) y scopear las policies     ║
-- ║ pharma igual que las de track.                                            ║
-- ╚══════════════════════════════════════════════════════════════════════════╝


-- ── users ───────────────────────────────────────────────────────────────────
create policy "perfil propio: ver"    on public.users for select using (id = auth.uid() or public.has_module('gerencia'));
create policy "perfil propio: editar" on public.users for update using (id = auth.uid()) with check (id = auth.uid());

-- ── user_module_roles ───────────────────────────────────────────────────────
create policy "ver roles propios o gerencia" on public.user_module_roles for select
  using (user_id = auth.uid() or public.has_module('gerencia'));
create policy "gerencia administra roles" on public.user_module_roles for all
  using (public.has_module('gerencia')) with check (public.has_module('gerencia'));

-- ── protocols ───────────────────────────────────────────────────────────────
create policy "ver protocolos asignados" on public.protocols for select using (
  public.has_module('gerencia')
  or public.is_assigned_coordinator(id)
  or public.has_role('track','leader')
  or public.has_module('pharma')
  or public.has_module('contable')
);
create policy "lideres crean protocolos" on public.protocols for insert with check (public.has_role('track','leader'));
create policy "lideres editan protocolos" on public.protocols for update using (public.has_role('track','leader')) with check (public.has_role('track','leader'));
create policy "gerencia elimina protocolos" on public.protocols for delete using (public.has_module('gerencia'));

-- ── protocol_coordinators ───────────────────────────────────────────────────
create policy "ver asignaciones" on public.protocol_coordinators for select
  using (user_id = auth.uid() or public.has_role('track','leader') or public.has_module('gerencia'));
create policy "lideres asignan" on public.protocol_coordinators for all
  using (public.has_role('track','leader')) with check (public.has_role('track','leader'));

-- ── protocol_activities / visit_definitions (config de protocolo) ───────────
-- SELECT scopeado por protocolo para track; pharma central + gerencia ven todo.
create policy "ver config protocolo (activities)" on public.protocol_activities for select using (
  public.has_module('gerencia') or public.has_module('pharma')
  or exists (select 1 from public.protocol_coordinators pc
             where pc.protocol_id = protocol_activities.protocol_id and pc.user_id = auth.uid())
);
create policy "lideres editan activities" on public.protocol_activities for all
  using (public.has_role('track','leader')) with check (public.has_role('track','leader'));

create policy "ver visit_definitions" on public.visit_definitions for select using (
  public.has_module('gerencia') or public.has_module('pharma')
  or exists (select 1 from public.protocol_coordinators pc
             where pc.protocol_id = visit_definitions.protocol_id and pc.user_id = auth.uid())
);
create policy "lideres editan visit_definitions" on public.visit_definitions for all
  using (public.has_role('track','leader')) with check (public.has_role('track','leader'));

-- ── patients ────────────────────────────────────────────────────────────────
create policy "ver pacientes de mis protocolos" on public.patients for select using (
  public.has_module('gerencia')
  or public.has_module('pharma')   -- farmacia central: ve el paciente para resolver la dispensación
  or exists (
    select 1 from public.enrollments e
    join public.protocol_coordinators pc on pc.protocol_id = e.protocol_id
    where e.patient_id = patients.id and pc.user_id = auth.uid()
  )
);
create policy "track crea pacientes" on public.patients for insert with check (public.has_module('track'));
create policy "track edita pacientes propios" on public.patients for update
  using (
    public.has_module('gerencia') or exists (
      select 1 from public.enrollments e
      join public.protocol_coordinators pc on pc.protocol_id = e.protocol_id
      where e.patient_id = patients.id and pc.user_id = auth.uid()))
  with check (
    public.has_module('gerencia') or exists (
      select 1 from public.enrollments e
      join public.protocol_coordinators pc on pc.protocol_id = e.protocol_id
      where e.patient_id = patients.id and pc.user_id = auth.uid()));
create policy "gerencia elimina pacientes" on public.patients for delete using (public.has_module('gerencia'));

-- ── enrollments ─────────────────────────────────────────────────────────────
create policy "ver enrolamientos de mis protocolos" on public.enrollments for select
  using (public.has_module('gerencia') or public.is_assigned_coordinator(protocol_id));
create policy "coordinadoras enrolan" on public.enrollments for insert
  with check (public.is_assigned_coordinator(protocol_id));
create policy "coordinadoras editan enrolamiento" on public.enrollments for update
  using (public.is_assigned_coordinator(protocol_id))
  with check (public.is_assigned_coordinator(protocol_id));   -- + guard_enrollment_immutable congela campos sensibles
create policy "gerencia elimina enrolamiento" on public.enrollments for delete using (public.has_module('gerencia'));

-- ── patient_visits ──────────────────────────────────────────────────────────
create policy "ver visitas de mis protocolos" on public.patient_visits for select using (
  public.has_module('gerencia')
  or exists (
    select 1 from public.enrollments e
    join public.protocol_coordinators pc on pc.protocol_id = e.protocol_id
    where e.id = patient_visits.enrollment_id and pc.user_id = auth.uid()
  )
);
create policy "track modifica visitas propias" on public.patient_visits for update
  using (public.has_module('gerencia') or exists (
    select 1 from public.enrollments e
    join public.protocol_coordinators pc on pc.protocol_id = e.protocol_id
    where e.id = patient_visits.enrollment_id and pc.user_id = auth.uid()))
  with check (public.has_module('gerencia') or exists (
    select 1 from public.enrollments e
    join public.protocol_coordinators pc on pc.protocol_id = e.protocol_id
    where e.id = patient_visits.enrollment_id and pc.user_id = auth.uid()));

-- ── checklists ──────────────────────────────────────────────────────────────
-- plantilla global (protocol_id NULL) visible a todo track; las de protocolo, scopeadas.
create policy "ver plantillas" on public.checklist_templates for select using (
  public.has_module('gerencia') or protocol_id is null
  or exists (select 1 from public.protocol_coordinators pc
             where pc.protocol_id = checklist_templates.protocol_id and pc.user_id = auth.uid())
);
create policy "lideres plantillas" on public.checklist_templates for all using (public.has_role('track','leader')) with check (public.has_role('track','leader'));
create policy "ver items plantilla" on public.checklist_template_items for select using (public.has_module('track') or public.has_module('gerencia'));
create policy "lideres items plantilla" on public.checklist_template_items for all using (public.has_role('track','leader')) with check (public.has_role('track','leader'));

-- checklist_items / completions: scopeados por el protocolo de la visita (public.coordina_visita).
create policy "ver checklist_items" on public.checklist_items for select
  using (public.has_module('gerencia') or public.coordina_visita(visit_id));
create policy "track inserta checklist_items" on public.checklist_items for insert
  with check (public.has_module('gerencia') or public.coordina_visita(visit_id));
create policy "track edita checklist_items" on public.checklist_items for update
  using (public.has_module('gerencia') or public.coordina_visita(visit_id))
  with check (public.has_module('gerencia') or public.coordina_visita(visit_id));
create policy "gerencia borra checklist_items" on public.checklist_items for delete
  using (public.has_module('gerencia'));

create policy "ver completions" on public.checklist_completions for select using (
  public.has_module('gerencia') or exists (
    select 1 from public.checklist_items ci
    where ci.id = checklist_completions.item_id and public.coordina_visita(ci.visit_id))
);
create policy "track completa items" on public.checklist_completions for insert with check (
  completed_by = auth.uid() and (
    public.has_module('gerencia') or exists (
      select 1 from public.checklist_items ci
      where ci.id = checklist_completions.item_id and public.coordina_visita(ci.visit_id)))
);

-- ── agenda_notes ────────────────────────────────────────────────────────────
create policy "ver notas agenda" on public.agenda_notes for select using (public.has_module('track') or public.has_module('gerencia'));
create policy "track crea notas"  on public.agenda_notes for insert with check (public.has_module('track') and user_id = auth.uid());
create policy "edita notas propias" on public.agenda_notes for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ── patient_timeline (insert-only, sin update/delete) ───────────────────────
create policy "ver timeline" on public.patient_timeline for select using (
  public.has_module('gerencia') or public.has_module('pharma')   -- farmacia central
  or public.coordina_visita(visit_id)                          -- track scopeado por protocolo
);
create policy "track/pharma registran eventos" on public.patient_timeline for insert with check (
  actor_id = auth.uid() and (                                -- anti-spoofing del actor
    public.has_module('gerencia') or public.has_module('pharma')
    or (public.has_module('track') and public.coordina_visita(visit_id)))
);

-- ── medications / lots ──────────────────────────────────────────────────────
create policy "ver medicamentos" on public.medications for select
  using (public.has_module('pharma') or public.has_module('gerencia') or public.has_module('contable'));
create policy "pharma/lider crean medicamentos" on public.medications for insert
  with check (public.has_role('pharma','leader') or public.has_role('track','leader'));
create policy "pharma/lider editan medicamentos" on public.medications for update
  using (public.has_role('pharma','leader') or public.has_role('track','leader'))
  with check (public.has_role('pharma','leader') or public.has_role('track','leader'));

create policy "ver lotes" on public.medication_lots for select
  using (public.has_module('pharma') or public.has_module('gerencia') or public.has_module('contable'));
create policy "pharma inserta lotes"   on public.medication_lots for insert with check (public.has_module('pharma'));
create policy "pharma edita lotes"     on public.medication_lots for update using (public.has_module('pharma')) with check (public.has_module('pharma'));
create policy "gerencia elimina lotes" on public.medication_lots for delete using (public.has_module('gerencia'));

-- ── recepciones ─────────────────────────────────────────────────────────────
create policy "ver recepciones" on public.medication_receptions for select using (public.has_module('pharma') or public.has_module('gerencia'));
create policy "pharma administra recepciones" on public.medication_receptions for all using (public.has_module('pharma')) with check (public.has_module('pharma'));
create policy "ver items recepcion" on public.reception_items for select using (public.has_module('pharma') or public.has_module('gerencia'));
create policy "pharma administra items recepcion" on public.reception_items for all using (public.has_module('pharma')) with check (public.has_module('pharma'));

-- ── dispensation_requests (Track crea scopeado, Pharma central atiende) ─────
create policy "ver solicitudes" on public.dispensation_requests for select using (
  public.has_module('gerencia') or public.has_module('pharma')   -- farmacia central
  or public.coordina_visita(visit_id)                          -- track scopeado por protocolo
);
create policy "track crea solicitudes" on public.dispensation_requests for insert with check (
  public.has_module('track') and requested_by = auth.uid() and public.coordina_visita(visit_id)
);
create policy "pharma atiende solicitud" on public.dispensation_requests for update
  using (public.has_module('pharma') or public.has_module('gerencia'))
  with check (public.has_module('pharma') or public.has_module('gerencia'));
create policy "track gestiona solicitud propia" on public.dispensation_requests for update
  using (public.coordina_visita(visit_id)) with check (public.coordina_visita(visit_id));
create policy "gerencia elimina solicitud" on public.dispensation_requests for delete using (public.has_module('gerencia'));

create policy "ver items solicitud" on public.dispensation_request_items for select using (
  public.has_module('gerencia') or public.has_module('pharma')
  or exists (select 1 from public.dispensation_requests dr
             where dr.id = dispensation_request_items.request_id and public.coordina_visita(dr.visit_id))
);
create policy "track administra items solicitud" on public.dispensation_request_items for all
  using (exists (select 1 from public.dispensation_requests dr
                 where dr.id = dispensation_request_items.request_id and public.coordina_visita(dr.visit_id)))
  with check (exists (select 1 from public.dispensation_requests dr
                 where dr.id = dispensation_request_items.request_id and public.coordina_visita(dr.visit_id)));
create policy "gerencia elimina items solicitud" on public.dispensation_request_items for delete using (public.has_module('gerencia'));

-- ── dispensations (Pharma central ejecuta; Track ve lo de sus protocolos) ───
create policy "ver dispensaciones" on public.dispensations for select using (
  public.has_module('pharma') or public.has_module('contable') or public.has_module('gerencia')   -- centrales
  or exists (select 1 from public.dispensation_requests dr
             where dr.id = dispensations.request_id and public.coordina_visita(dr.visit_id))  -- track scopeado
);
create policy "pharma ejecuta dispensaciones" on public.dispensations for insert
  with check (public.has_module('pharma') and executed_by = auth.uid());
create policy "pharma actualiza dispensaciones" on public.dispensations for update
  using (public.has_module('pharma')) with check (public.has_module('pharma'));   -- + guard_dispensation_immutable
create policy "gerencia elimina dispensaciones" on public.dispensations for delete using (public.has_module('gerencia'));

create policy "ver items dispensacion" on public.dispensation_items for select using (
  public.has_module('pharma') or public.has_module('contable') or public.has_module('gerencia')
  or exists (select 1 from public.dispensations d
             join public.dispensation_requests dr on dr.id = d.request_id
             where d.id = dispensation_items.dispensation_id and public.coordina_visita(dr.visit_id))
);
create policy "pharma inserta items dispensacion" on public.dispensation_items for insert with check (public.has_module('pharma'));
create policy "pharma edita items pre-entrega" on public.dispensation_items for update
  using (public.has_module('pharma') and exists (
    select 1 from public.dispensations d where d.id = dispensation_items.dispensation_id and d.status <> 'entregada'))
  with check (public.has_module('pharma') and exists (
    select 1 from public.dispensations d where d.id = dispensation_items.dispensation_id and d.status <> 'entregada'));
create policy "borrar items dispensacion" on public.dispensation_items for delete using (
  public.has_module('gerencia')
  or (public.has_module('pharma') and exists (
       select 1 from public.dispensations d where d.id = dispensation_items.dispensation_id and d.status <> 'entregada'))
);

-- ── stock_movements (inmutable: solo select + insert) ───────────────────────
create policy "ver movimientos stock" on public.stock_movements for select
  using (public.has_module('pharma') or public.has_module('contable') or public.has_module('gerencia'));
create policy "pharma inserta movimientos" on public.stock_movements for insert with check (public.has_module('pharma'));

-- ── protocol_alerts ─────────────────────────────────────────────────────────
create policy "ver alertas" on public.protocol_alerts for select
  using (public.has_module('track') or public.has_module('pharma') or public.has_module('gerencia'));
create policy "lideres administran alertas" on public.protocol_alerts for all
  using (public.has_role('track','leader') or public.has_role('pharma','leader'))
  with check (public.has_role('track','leader') or public.has_role('pharma','leader'));

-- ── audit_log (solo lectura para gerencia; lo escribe el trigger) ──────────
create policy "gerencia ve auditoria" on public.audit_log for select using (public.has_module('gerencia'));
