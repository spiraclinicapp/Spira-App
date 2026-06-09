-- Spira · Migración 0010 — Pharma puede LEER enrollments (read-only)
--
-- Contexto: la app unifica Pacientes dentro de Protocolos. Pharma es central y necesita
-- ver la relación protocolo<->paciente (vía enrollments) para que el conteo por protocolo
-- y el drill-down funcionen en la UI. La policy de SELECT de enrollments (migración 0006)
-- solo contemplaba gerencia y la coordinadora asignada; acá se suma pharma.
--
-- Pharma sigue SIN poder insertar/editar/borrar enrollments: no está en las policies de
-- INSERT/UPDATE/DELETE. Este cambio amplía ÚNICAMENTE la lectura. Reusa los helpers
-- security-definer ya definidos en 0006 (has_module, is_assigned_coordinator).

alter policy "ver enrolamientos de mis protocolos" on public.enrollments
  using (
    public.has_module('gerencia')
    or public.has_module('pharma')
    or public.is_assigned_coordinator(protocol_id)
  );
