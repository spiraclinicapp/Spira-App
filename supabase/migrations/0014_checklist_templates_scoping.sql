-- Spira · Migración 0014 — Scoping de escritura de plantillas de checklist
-- ----------------------------------------------------------------------------
-- Hasta acá (0009), CUALQUIER operator de track podía editar la plantilla
-- global y la de cualquier protocolo. Eso contradice el modelo de Track:
--   · plantilla GLOBAL (protocol_id null): solo track admin (o gerencia)
--   · plantilla POR PROTOCOLO: la coordinadora ASIGNADA (operator+),
--     además de track admin / gerencia
-- La lectura no cambia ("ver plantillas" / "ver items plantilla", de 0006).
-- Mismo patrón ALTER POLICY que 0009.
-- ============================================================================

alter policy "lideres plantillas" on public.checklist_templates
  using (
    public.has_module('gerencia')
    or public.has_min_role('track', 'admin')
    or (checklist_templates.protocol_id is not null
        and public.has_min_role('track', 'operator')
        and public.is_assigned_coordinator(checklist_templates.protocol_id))
  )
  with check (
    public.has_module('gerencia')
    or public.has_min_role('track', 'admin')
    or (checklist_templates.protocol_id is not null
        and public.has_min_role('track', 'operator')
        and public.is_assigned_coordinator(checklist_templates.protocol_id))
  );

alter policy "lideres items plantilla" on public.checklist_template_items
  using (
    public.has_module('gerencia')
    or public.has_min_role('track', 'admin')
    or exists (
      select 1 from public.checklist_templates t
      where t.id = checklist_template_items.template_id
        and t.protocol_id is not null
        and public.has_min_role('track', 'operator')
        and public.is_assigned_coordinator(t.protocol_id)
    )
  )
  with check (
    public.has_module('gerencia')
    or public.has_min_role('track', 'admin')
    or exists (
      select 1 from public.checklist_templates t
      where t.id = checklist_template_items.template_id
        and t.protocol_id is not null
        and public.has_min_role('track', 'operator')
        and public.is_assigned_coordinator(t.protocol_id)
    )
  );
