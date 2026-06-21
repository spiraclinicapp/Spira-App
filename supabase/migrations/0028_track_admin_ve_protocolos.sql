-- Spira · Migración 0028 — track-admin ve todos los protocolos
-- ----------------------------------------------------------------------------
-- La policy SELECT de protocols (0006 "ver protocolos asignados") gateaba con
-- has_role('track','leader') = rol EXACTO, así que un track-admin (rol 'admin',
-- por ENCIMA de leader en la escalera) NO veía ningún protocolo y nunca llegaba
-- a la pestaña "Cronograma" que 0026/0027 sí lo autorizan a gestionar (gerencia
-- o track-admin). Sumamos una rama has_min_role('track','admin') a la SELECT para
-- alinear la VISIBILIDAD de protocols con quién puede gestionar el cronograma.
-- Es puramente ADITIVO (un OR más): no restringe a ningún rol existente.
--
-- ALCANCE (importante): habilita SOLO ver la fila de protocols. patients /
-- enrollments / patient_visits siguen scopeados a gerencia o coordinadora
-- asignada — la pestaña "Pacientes" y los KPIs quedan vacíos para un track-admin
-- no asignado (la RLS filtra en silencio). El conteo de impacto del borrado ya no
-- depende de esa RLS: va por count_deletable_visits (SECURITY DEFINER, 0027).
-- Si se quisiera que track-admin vea datos de paciente, es una decisión aparte
-- (sumar la rama admin a las SELECT de patients/enrollments/patient_visits).
-- ============================================================================
drop policy if exists "ver protocolos asignados" on public.protocols;
create policy "ver protocolos asignados" on public.protocols for select using (
  public.has_module('gerencia')
  or public.is_assigned_coordinator(id)
  or public.has_role('track','leader')
  or public.has_min_role('track','admin')
  or public.has_module('pharma')
  or public.has_module('contable')
);

notify pgrst, 'reload schema';
