-- 0019 · Gerencia puede editar el enrolamiento (médico tratante)
--
-- La policy de UPDATE de `enrollments` sólo permitía a la coordinadora asignada del
-- protocolo, así que gerencia —que sí edita `patients`— no podía cambiar el médico
-- tratante (único campo mutable del enrolamiento) y recibía "No tenés permiso para
-- editar el médico de este paciente".
--
-- Se alinea con el resto del esquema, donde gerencia ya está contemplada:
--   · enrollments SELECT  → has_module('gerencia') or is_assigned_coordinator(...)
--   · enrollments DELETE  → has_module('gerencia')
--   · patients   UPDATE   → has_module('gerencia') or (coordinadora asignada)
--
-- Seguridad: el trigger `guard_enrollment_immutable` sigue congelando
-- patient_id / protocol_id / enrolled_by / enrollment_date, así que gerencia
-- (igual que la coordinadora) sólo puede modificar `treating_physician`. Todo
-- cambio queda auditado por el trigger genérico de auditoría.
--
-- Idempotente: drop policy if exists + create (sirve como migración y como
-- script de paste en el SQL Editor).

drop policy if exists "coordinadoras editan enrolamiento" on public.enrollments;
create policy "coordinadoras editan enrolamiento" on public.enrollments for update
  using (public.has_module('gerencia') or public.is_assigned_coordinator(protocol_id))
  with check (public.has_module('gerencia') or public.is_assigned_coordinator(protocol_id));

notify pgrst, 'reload schema';
