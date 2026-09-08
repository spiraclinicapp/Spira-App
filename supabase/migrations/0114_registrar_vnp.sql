-- ============================================================================
-- 0114 — Farmacia puede registrar una VNP (para dispensar sin cronograma)
--
-- Ver docs/superpowers/plans/2026-09-08-dispensacion-libre-vnp.md
--
-- EL PROBLEMA: el mostrador de Farmacia no puede dispensar cuando el paciente vino sin cita.
-- La puerta para eso ya existe desde la 0071 (create_dispensation_request con un motivo fuera
-- de cronograma acepta cualquier visita), pero la visita tiene que EXISTIR, y la única función
-- que crea visitas sueltas es register_visit_event (0025/0030), cuya authz es:
--
--     has_module('gerencia') or has_min_role('track','admin')
--       or (has_min_role('track','operator') and is_assigned_coordinator(protocolo))
--
-- Farmacia no está en esa lista. O sea que un botón "Registrar VNP" en el mostrador devuelve
-- 42501 en la cara de la farmacéutica. Y NO se detecta probando: la cuenta de QA tiene los cinco
-- módulos, así que entra por gerencia y el botón le anda perfecto.
--
-- POR QUÉ UNA FUNCIÓN NUEVA Y NO UNA RAMA MÁS EN register_visit_event (decisión 1 del review):
-- esa función carga cinco bloques de reglas clínicas (singletons de firma/screening, exclusiones
-- entre ellas, cutover al cuadro, pre/post randomización, y el ancla del cronograma cuando la
-- visita es la randomización). Sumarle un llamador con otro perfil obliga a reevaluar las cinco
-- desde un punto de vista que nunca tuvieron, y un descuido ahí regresiona el flujo de
-- Coordinación, que hoy funciona. Esta función SOLO sabe hacer VNP: el kind va fijo en el
-- cuerpo, no como parámetro, así que no hay valor que falsear para colarse a randomizar.
--
-- Y por eso tampoco reusa register_visit_event por dentro: al ser SECURITY DEFINER anidada,
-- auth.uid() se conserva y el chequeo interno rechazaría igual. La duplicación de las diez
-- líneas de authz es deliberada.
--
-- NACE AGENDADA (estimated_date), no atendida, igual que register_visit_event desde la 0025.
-- Marcarla atendida (real_date) dispara la materialización del checklist, y eso es del
-- coordinador: Farmacia registra que el paciente vino a buscar medicación, no que se lo atendió.
--
-- SIN uuid_generate_v4() EN EL CUERPO: el id sale del DEFAULT de la columna, que Postgres
-- resolvió por OID al crear la tabla. Llamarla acá sin calificar el schema aplicaría en verde y
-- reventaría con 42883 en la primera llamada real (precedente: 0113, 2026-09-08).
--
-- ADITIVA: ningún front desplegado llama a esta función, así que el que no funciona sin ella es
-- el front NUEVO. Se aplica ANTES del deploy. (La otra mitad de esta tanda —la 0115, que
-- ensancha visitas_dispensables— es al revés: va DESPUÉS.)
--
-- APLICAR: a mano en el SQL Editor de Supabase (rol postgres). IDEMPOTENTE (create or replace).
-- Registrar en supabase/README.md al confirmarse en prod.
-- ============================================================================

create or replace function public.registrar_vnp(
  p_enrollment_id uuid,
  p_date          date,
  p_notes         text default null
) returns uuid
language plpgsql security definer
set search_path = pg_catalog, public as $$
declare
  v_protocol uuid;
  v_visit    uuid;
begin
  if auth.uid() is null then
    raise exception 'No autenticado' using errcode = '42501';
  end if;
  if p_date is null then
    raise exception 'La fecha es obligatoria' using errcode = '23502';
  end if;

  select e.protocol_id into v_protocol
    from public.enrollments e
   where e.id = p_enrollment_id;
  if v_protocol is null then
    raise exception 'Enrolamiento inexistente' using errcode = '23503';
  end if;

  -- Farmacia se suma a los tres caminos que ya tenía register_visit_event. El orden pone a
  -- pharma primero porque es el llamador esperado de esta función; los otros tres están para
  -- que la coordinadora no pierda una capacidad que ya tenía si alguna vista la reusa.
  if not (public.has_min_role('pharma', 'operator')
          or public.has_module('gerencia')
          or public.has_min_role('track', 'admin')
          or (public.has_min_role('track', 'operator')
              and public.is_assigned_coordinator(v_protocol))) then
    raise exception 'No tenés permiso para registrar una visita de este paciente'
      using errcode = '42501';
  end if;

  -- La VNP es ilimitada y vale en las dos etapas (pre y post randomización): no hay singleton
  -- que chequear ni cutover del cuadro que la afecte. Es la razón por la que esta función puede
  -- ser corta sin estar incompleta — se puede comparar contra availableEventKinds
  -- (src/data/visitEvents.ts), que devuelve 'vnp' en sus tres ramas.
  insert into public.patient_visits (enrollment_id, kind, estimated_date, notes)
  values (p_enrollment_id, 'vnp', p_date, nullif(btrim(coalesce(p_notes, '')), ''))
  returning id into v_visit;

  return v_visit;
end; $$;

comment on function public.registrar_vnp(uuid, date, text) is
  'Registra una visita no programada. Acotada a kind=vnp por diseño: es la única visita suelta
   que Farmacia necesita crear para dispensar fuera de cronograma, y la única que no tiene
   reglas de etapa. Authz: pharma operator+ / gerencia / track admin / track operator asignado.
   0114.';

revoke all on function public.registrar_vnp(uuid, date, text) from public;
grant execute on function public.registrar_vnp(uuid, date, text) to authenticated;

notify pgrst, 'reload schema';
