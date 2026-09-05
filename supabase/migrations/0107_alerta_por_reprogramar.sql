-- ============================================================================
-- 0107 · "Por reprogramar" pasa a ser una clase de alerta descartable
--
-- Plan: docs/plan-pendientes-clase-de-alerta.md (pieza 3).
--
-- QUÉ CAMBIA, Y ES LO ÚNICO: la función dismiss_alert. Ni tablas, ni vistas, ni tipos, ni checks.
-- El estado 'por_reprogramar' ya existe en el enum visit_status desde la 0066 y v_patient_visits ya
-- lo emite (rama 3 del case, 0102). Lo único que impedía archivar esas alertas era la validación de
-- esta función, que sólo aceptaba dos estados.
--
-- LA HUELLA ES EL PUNTO FINO, igual que en la 0070 que la introdujo. El descarte guarda
-- (status, anchor) para valer SÓLO mientras la condición sea la misma; si cambia, la alerta vuelve
-- sola. Para 'ventana_vencida' el ancla es window_end y describe la condición. Para
-- 'por_reprogramar' NO SIRVE: esa alerta existe justamente porque la ventana todavía NO venció, así
-- que window_end está en el FUTURO y no dice nada de lo que se archivó. Lo que define esa condición
-- es a qué cita no vino el paciente, o sea estimated_date.
--
-- Por eso el ancla pasa a elegirse POR ESTADO. Es retrocompatible sin tocar una fila: todos los
-- descartes ya guardados son de tipo 'visita' con status 'ventana_vencida', y siguen leyéndose
-- contra window_end exactamente como antes.
--
-- CONSECUENCIA BUSCADA: si una visita archivada como "no vino" deja vencer su ventana, pasa a
-- 'ventana_vencida', la huella deja de coincidir y la alerta REAPARECE, ahora en rojo. Es correcto
-- —la situación empeoró— y es la dirección segura: una alerta que vuelve molesta, una que se
-- esconde es el peligro regulatorio que la 0070 nombra.
--
-- NO SE FILTRA POR enrollment_status, y se decidió a conciencia (Director, 2026-09-05): un "no
-- vino" de un paciente discontinuado va a alertar para siempre, y la salida correcta es que alguien
-- lo ARCHIVE con motivo y autor —que es lo que esta función habilita— y no que una regla lo
-- esconda. En una lista con descarte auditable, esconder por regla es lo peor de los dos.
--
-- CREATE OR REPLACE Y NO DROP + CREATE: la firma no cambia (text, uuid, text, uuid, text) y ningún
-- parámetro se renombra, así que no hay 'cannot change name of input parameter' ni queda una
-- sobrecarga viva resolviendo llamadas viejas en silencio (la trampa que sí obligó al drop en la
-- 0092). El cuerpo es el de la 0092 verbatim salvo las tres líneas señaladas.
--
-- ADITIVA y NO BREAKING: el front desplegado no la nota (nunca manda 'por_reprogramar'), así que va
-- ANTES del front. Si se aplicara después, la lista mostraría los "no vino" pero archivarlos
-- fallaría con "Esa visita no está en alerta" — degradado, no roto.
-- APLICAR: a mano en el SQL Editor de Supabase (rol postgres), DESPUÉS de la 0106. IDEMPOTENTE.
-- Registrar en supabase/README.md al confirmarse en prod.
-- ============================================================================

create or replace function public.dismiss_alert(
  p_kind                 text,
  p_visit_id             uuid,
  p_reason               text,
  p_report_definition_id uuid default null,
  p_detail               text default null
) returns uuid
language plpgsql security definer set search_path = pg_catalog, public as $fn$
declare
  v_status         text;
  v_window_end     date;
  v_estimated_date date;   -- 0107: el ancla de 'por_reprogramar'
  v_due            timestamptz;
  v_anchor         timestamptz;
  v_name           text;
  v_role           text;
  v_id             uuid;
begin
  if auth.uid() is null then raise exception 'No autenticado' using errcode = '42501'; end if;
  if not (public.has_module('gerencia') or public.coordina_visita(p_visit_id)) then
    raise exception 'No tenés permiso' using errcode = '42501';
  end if;
  if p_kind not in ('visita', 'reporte_procedimiento') then
    raise exception 'Tipo de alerta desconocido' using errcode = '22023';
  end if;

  if p_kind = 'visita' then
    if p_report_definition_id is not null then
      raise exception 'Una alerta de visita no lleva reporte' using errcode = '22023';
    end if;
    -- Calificamos tv.* siempre: en PL/pgSQL los nombres sueltos compiten con las variables
    -- locales (el error de 0056 y 0058, dos veces el mismo).
    select tv.computed_status, tv.window_end, tv.estimated_date
      into v_status, v_window_end, v_estimated_date
      from public.v_track_visits tv
     where tv.id = p_visit_id;
    if v_status is null then
      raise exception 'Visita inexistente' using errcode = '23503';
    end if;
    -- 0107: entra 'por_reprogramar'.
    if v_status not in ('ventana_vencida', 'item_vencido', 'por_reprogramar') then
      raise exception 'Esa visita no está en alerta' using errcode = 'check_violation';
    end if;
    -- 0107: el ancla, por estado. Ver la cabecera.
    v_anchor := case
      when v_status = 'por_reprogramar'
        then coalesce(v_estimated_date::timestamptz, '-infinity'::timestamptz)
      else   coalesce(v_window_end::timestamptz,     '-infinity'::timestamptz)
    end;
  else
    if p_report_definition_id is null then
      raise exception 'Falta el reporte de la alerta' using errcode = '23502';
    end if;
    select ra.report_due_at
      into v_due
      from public.v_procedure_report_alerts ra
     where ra.report_definition_id = p_report_definition_id
       and ra.visit_id             = p_visit_id;
    if v_due is null then
      raise exception 'Ese reporte no está en alerta' using errcode = 'check_violation';
    end if;
    v_status := null;
    v_anchor := v_due;
  end if;

  -- Snapshot de quién archiva: su propia fila de users (siempre visible para él; además esto es
  -- SECURITY DEFINER). Mismo criterio que add_visit_comment en 0048.
  select u.full_name, coalesce(nullif(btrim(u.puesto), ''), 'Equipo')
    into v_name, v_role
    from public.users u where u.id = auth.uid();

  insert into public.alert_dismissals
    (kind, visit_id, report_definition_id, status, anchor, reason, detail,
     dismissed_by, dismissed_by_name, dismissed_by_role)
  values
    (p_kind, p_visit_id, p_report_definition_id, v_status, v_anchor, p_reason,
     nullif(btrim(coalesce(p_detail, '')), ''), auth.uid(),
     coalesce(v_name, 'Usuario'), coalesce(v_role, 'Equipo'))
  returning id into v_id;

  return v_id;
end $fn$;

comment on function public.dismiss_alert(text, uuid, text, uuid, text) is
  'Archiva una alerta vigente con motivo de catálogo. Calcula la huella (status+anchor) en el '
  'servidor para que un descarte no pueda tapar una alerta futura. Las de visita cubren '
  'ventana_vencida, item_vencido y por_reprogramar (0107); el ancla es window_end salvo en '
  'por_reprogramar, donde es estimated_date. Las de reporte se identifican por '
  '(visit_id, report_definition_id) desde la 0092. Authz: gerencia o coordinador de la visita.';

revoke all   on function public.dismiss_alert(text, uuid, text, uuid, text) from anon, public;
grant execute on function public.dismiss_alert(text, uuid, text, uuid, text) to authenticated;
