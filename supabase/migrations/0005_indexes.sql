-- Spira · Migración 0005 — Índices

-- ============================================================================
-- 12 · ÍNDICES (solo los de uso frecuente real)
-- ============================================================================
create index idx_user_module_roles_user     on public.user_module_roles(user_id);
create index idx_protocol_coordinators_user  on public.protocol_coordinators(user_id);
create index idx_enrollments_patient         on public.enrollments(patient_id);
create index idx_enrollments_protocol        on public.enrollments(protocol_id);
create index idx_patient_visits_enrollment   on public.patient_visits(enrollment_id);
create index idx_patient_visits_estimated    on public.patient_visits(estimated_date);
create index idx_patient_visits_window_end   on public.patient_visits(window_end);
create index idx_checklist_items_visit       on public.checklist_items(visit_id);
create index idx_timeline_visit_time         on public.patient_timeline(visit_id, occurred_at);
create index idx_medications_protocol        on public.medications(protocol_id);
create index idx_medication_lots_medication  on public.medication_lots(medication_id);
create index idx_medication_lots_expiry      on public.medication_lots(expiry_date);
create index idx_request_visit               on public.dispensation_requests(visit_id);
create index idx_request_status              on public.dispensation_requests(status);
create index idx_dispensations_request       on public.dispensations(request_id);
create index idx_dispensations_status        on public.dispensations(status);
create index idx_stock_movements_medication  on public.stock_movements(medication_id);
create index idx_stock_movements_created     on public.stock_movements(created_at);
create index idx_audit_log_entity            on public.audit_log(entity_type, entity_id);
create index idx_audit_log_occurred          on public.audit_log(occurred_at);
