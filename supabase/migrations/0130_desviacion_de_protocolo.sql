-- Spira · Migración 0130 — Track: documentar una desviación de protocolo
-- ============================================================================
-- Una ventana vencida NO tenía salida. Sale de la lista de dos maneras: cargando la visita
-- (y entonces deja de estar vencida) o DESCARTANDO la alerta (0070) con un motivo de catálogo
-- que dice "esto no correspondía". Ninguna de las dos dice lo que de verdad pasó, que es una
-- DESVIACIÓN DE PROTOCOLO. Nadie silencia un desvío clínico — así que nadie vaciaba la lista y
-- el sedimento crecía sin techo (medido el 2026-09-17 sobre los cuatro protocolos: 16 visitas
-- cierran ventana por mes, 231 en el año, y ninguna se va sola).
--
-- Esta migración agrega la salida honesta: documentar el desvío con motivo, detalle, autor y
-- fecha. NO cambia el estado de la visita ni borra nada — el hecho clínico sigue exactamente
-- donde estaba; lo que se agrega es el registro de por qué pasó, que es lo que un monitor pide.
--
-- CALCADA DE LA 0070 (descartes) en todo lo que comparte: RLS espejo de quién puede ver la
-- alerta, autor desnormalizado, auditoría con audit_row() y alta por RPC security definer que
-- calcula el ancla en el servidor. Se aparta en tres puntos, a propósito:
--   1. TABLA PROPIA y no un motivo más de alert_dismissals: el listado de desviaciones es un
--      entregable regulatorio, y sacarlo de una tabla llamada "descartes de alertas" es mentir
--      sobre qué es ese dato.
--   2. DETALLE OBLIGATORIO SIEMPRE (en la 0070 sólo lo exige el motivo "otro"). Un motivo de
--      catálogo solo no le alcanza a quien lea esto dentro de ocho meses, y ese lector es un
--      monitor.
--   3. Sólo documenta VENTANA VENCIDA. La visita que se hizo fuera de ventana es la misma
--      desviación clínica y hoy se escapa sin registro, pero entra por otro flujo y quedó fuera
--      de alcance por decisión del Director (ver TODOS.md, P2).
--
-- EL ANCLA (window_end) es el punto fino, igual que la huella de la 0070: sin ella, documentar
-- una vez taparía la visita PARA SIEMPRE, incluso si se reprograma y vence una ventana NUEVA.
-- Con el ancla, la desviación vale para esa ventana; si la visita vuelve a vencerse con otra,
-- es otro desvío y vuelve a pedir su documentación.
--
-- ADITIVA y NO BREAKING: no toca ninguna tabla ni vista existente. Ningún front desplegado
-- consulta esta tabla ni este RPC, así que va PRIMERO y el deploy del front después. Verificado
-- en el navegador el 2026-09-17 con el front nuevo y esta migración SIN aplicar: la consulta
-- falla con PGRST205 y las tres pantallas de alertas (Pendientes, la campana y el Resumen)
-- siguen enteras, porque ese error no se propaga.
-- APLICAR: a mano en el SQL Editor de Supabase (rol postgres), DESPUÉS de la 0128 (reposición de
-- corte a corte) y la 0129 (guarda de Recepción). La limpieza de Reposición tenía reservado este
-- número y pasa a uno posterior (Director, 2026-09-17): no depende de esta migración ni al revés,
-- y esa limpieza espera un deploy de Farmacia que todavía no pasó.
-- IDEMPOTENTE. Registrar en supabase/README.md al confirmarse en prod.
-- ============================================================================

-- 1 · La desviación -----------------------------------------------------------------------
create table if not exists public.protocol_deviations (
  -- La columna `id` NO es opcional aunque la PK pudiera ser otra: audit_row() (0003) hace
  -- `case when tg_op = 'DELETE' then old.id else new.id end`, y Postgres resuelve `old.id` al
  -- PLANIFICAR, sin importar por qué rama vaya a pasar. Sin `id`, la primera escritura revienta
  -- con 42703 señalando el cuerpo de audit_row y no esta tabla (pasó con la 0111).
  id       uuid primary key default gen_random_uuid(),
  visit_id uuid not null references public.patient_visits(id) on delete cascade,
  -- El window_end de la ventana que se venció. `date` y no timestamptz: es el mismo tipo que
  -- patient_visits.window_end, y compararlos con casteos de por medio es cómo se cuelan los
  -- errores de borde de día.
  anchor   date not null,
  -- Motivo de catálogo. Texto con check y no enum, por el mismo motivo que la 0070: un enum
  -- nuevo obligaría a `alter type ... add value` en su propio archivo (la trampa de la 0053)
  -- para sumar un motivo. Los seis valores están duplicados en src/data/deviationModel.ts; si
  -- se desincronizan, esta constraint levanta 23514 y el front muestra "El motivo no es válido"
  -- — falla RUIDOSA, que es lo que se quiere de una duplicación inevitable.
  reason   text not null check (reason in (
             'no_concurrio', 'pidio_otra_fecha', 'motivo_clinico',
             'centro_no_pudo', 'cronograma_mal_generado', 'otro')),
  -- OBLIGATORIO, y con check de no-vacío: un motivo de catálogo solo no explica nada dentro de
  -- ocho meses. Acá está la diferencia con alert_dismissals.detail, que es nullable.
  detail   text not null check (btrim(detail) <> ''),
  -- Autor: FK estable para la auditoría + nombre y puesto DESNORMALIZADOS, mismo motivo que
  -- author_name en la 0048 y dismissed_by_name en la 0070 — la RLS de `users` sólo deja ver la
  -- fila propia, así que un join ocultaría en silencio quién documentó el desvío para todo el
  -- que no sea gerencia. Y el snapshot es lo correcto en un sistema auditable: queda el puesto
  -- DE ENTONCES.
  recorded_by      uuid not null default auth.uid() references public.users(id),
  recorded_by_name text not null,
  recorded_by_role text not null,
  recorded_at      timestamptz not null default now()
);

comment on table public.protocol_deviations is
  'Desviaciones de protocolo documentadas sobre una visita que no se hizo dentro de su ventana. '
  'No cambia el estado de la visita ni borra nada: agrega el porqué, con autor y fecha. El ancla '
  '(window_end) hace que valga para ESA ventana: si la visita se reprograma y vuelve a vencerse, '
  'es otro desvío. 0130.';
comment on column public.protocol_deviations.anchor is
  'window_end de la ventana que se venció. Parte de la identidad del desvío. 0130.';
comment on column public.protocol_deviations.detail is
  'Explicación obligatoria (check de no-vacío). A diferencia de alert_dismissals.detail, acá se '
  'exige siempre: el lector de esto, meses después, es un monitor. 0130.';

-- Una desviación por visita y ventana.
create unique index if not exists ux_protocol_deviation_visita
  on public.protocol_deviations (visit_id, anchor);
create index if not exists ix_protocol_deviation_visit
  on public.protocol_deviations (visit_id);

-- 2 · RLS: espejo de quién puede VER la alerta (mismo criterio que la 0070) ----------------
alter table public.protocol_deviations enable row level security;

drop policy if exists "ver desviaciones" on public.protocol_deviations;
create policy "ver desviaciones" on public.protocol_deviations for select using (
  public.has_module('gerencia') or public.coordina_visita(visit_id));

-- El insert real pasa por el RPC (SECURITY DEFINER); la policy es la red de seguridad si alguna
-- vez se inserta directo, y deja el `recorded_by` clavado al que escribe.
drop policy if exists "track documenta desviacion" on public.protocol_deviations;
create policy "track documenta desviacion" on public.protocol_deviations for insert with check (
  recorded_by = auth.uid() and (public.has_module('gerencia') or public.coordina_visita(visit_id)));

-- SIN policy de UPDATE, y CON delete: un registro auditable no se edita. Si alguien documentó
-- con el motivo equivocado, se borra y se vuelve a documentar — y el audit_log muestra las dos
-- decisiones en vez de una sobrescrita. Es el mismo criterio que la 0070 usa para restaurar.
drop policy if exists "track corrige desviacion" on public.protocol_deviations;
create policy "track corrige desviacion" on public.protocol_deviations for delete using (
  public.has_module('gerencia') or public.coordina_visita(visit_id));

revoke all on public.protocol_deviations from anon;
grant select, insert, delete on public.protocol_deviations to authenticated;

drop trigger if exists trg_audit_protocol_deviations on public.protocol_deviations;
create trigger trg_audit_protocol_deviations after insert or update or delete
  on public.protocol_deviations for each row execute function public.audit_row();

-- 3 · RPC: documentar ----------------------------------------------------------------------
-- El ancla se calcula ACÁ y no en el cliente: un anchor falseado podría tapar una ventana
-- futura. Y valida que la visita esté DE VERDAD con la ventana vencida — no se documenta un
-- desvío que no ocurrió. Authz espejo de la lectura, como dismiss_alert.
create or replace function public.record_protocol_deviation(
  p_visit_id uuid,
  p_reason   text,
  p_detail   text
) returns uuid
language plpgsql security definer set search_path = pg_catalog, public as $fn$
declare
  v_status     text;
  v_window_end date;
  v_name       text;
  v_role       text;
  v_id         uuid;
begin
  if auth.uid() is null then raise exception 'No autenticado' using errcode = '42501'; end if;
  if not (public.has_module('gerencia') or public.coordina_visita(p_visit_id)) then
    raise exception 'No tenés permiso' using errcode = '42501';
  end if;
  if btrim(coalesce(p_detail, '')) = '' then
    raise exception 'Falta la explicación' using errcode = '23502';
  end if;

  -- Calificamos tv.* siempre: en PL/pgSQL los nombres sueltos compiten con las variables
  -- locales (el error de la 0056 y la 0058, dos veces el mismo).
  select tv.computed_status, tv.window_end
    into v_status, v_window_end
    from public.v_track_visits tv
   where tv.id = p_visit_id;

  if v_status is null then
    raise exception 'Visita inexistente' using errcode = '23503';
  end if;
  if v_status <> 'ventana_vencida' then
    raise exception 'Esa visita no tiene la ventana vencida' using errcode = 'check_violation';
  end if;
  -- No debería pasar (la vista calcula ventana_vencida comparando contra window_end, así que una
  -- vencida siempre lo tiene), pero el ancla es not null y preferimos el error nombrado antes que
  -- un 23502 crudo saliendo del insert.
  if v_window_end is null then
    raise exception 'Esa visita no tiene ventana definida' using errcode = '23502';
  end if;

  -- Snapshot de quién documenta: su propia fila de users (siempre visible para él; además esto
  -- es SECURITY DEFINER). Mismo criterio que add_visit_comment en la 0048.
  select u.full_name, coalesce(nullif(btrim(u.puesto), ''), 'Equipo')
    into v_name, v_role
    from public.users u where u.id = auth.uid();

  insert into public.protocol_deviations
    (visit_id, anchor, reason, detail, recorded_by, recorded_by_name, recorded_by_role)
  values
    (p_visit_id, v_window_end, p_reason, btrim(p_detail), auth.uid(),
     coalesce(v_name, 'Usuario'), coalesce(v_role, 'Equipo'))
  returning id into v_id;

  return v_id;
end $fn$;

comment on function public.record_protocol_deviation(uuid, text, text) is
  'Documenta una desviación de protocolo sobre una visita con la ventana vencida. Calcula el '
  'ancla (window_end) en el servidor para que un registro no pueda tapar una ventana futura. '
  'Authz: gerencia o coordinador de la visita. 0130.';

revoke all on function public.record_protocol_deviation(uuid, text, text) from anon, public;
grant execute on function public.record_protocol_deviation(uuid, text, text) to authenticated;
