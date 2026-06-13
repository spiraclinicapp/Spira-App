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

-- Cierra un hueco PREEXISTENTE (de 0006): la lectura de ítems de plantilla estaba
-- abierta a todo track sin scoping por protocolo (`has_module('track')`), mientras
-- que la lectura de la fila template (`ver plantillas`) sí scopeaba. Un viewer de
-- track podía leer los ítems de la plantilla de cualquier protocolo ajeno vía
-- PostgREST. Se alinea con `ver plantillas`: global (protocol_id null) visible a
-- todo track; las de protocolo, solo a la coordinadora asignada. Admin/gerencia
-- conservan acceso por el `using` de "lideres items plantilla" (OR de policies en
-- SELECT). El trigger materialize_checklist es SECURITY DEFINER → no se ve afectado.
alter policy "ver items plantilla" on public.checklist_template_items
  using (
    public.has_module('gerencia')
    or (
      public.has_module('track')
      and exists (
        select 1 from public.checklist_templates t
        where t.id = checklist_template_items.template_id
          and (t.protocol_id is null or public.is_assigned_coordinator(t.protocol_id))
      )
    )
  );
