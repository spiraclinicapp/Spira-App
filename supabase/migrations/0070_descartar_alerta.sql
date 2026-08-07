-- Spira · Migración 0070 — Track: descartar una alerta (auditable)
-- ============================================================================
-- Una alerta NO es una fila: es estado CALCULADO. Las de visita salen del `computed_status`
-- de v_track_visits (0068/0069) y las de reporte salen de v_procedure_report_alerts (0064).
-- No hay nada que borrar. Así que "descartar" no borra: PERSISTE EL DESCARTE —quién, cuándo
-- y por qué se archivó el aviso— y el front deja de listarlo. La condición clínica sigue
-- exactamente donde estaba; lo que se silencia es el aviso, y queda trazado. Es la única
-- forma compatible con ANMAT/ICH-GCP: en un sistema auditable no se hace desaparecer un
-- indicio, se registra quién decidió no atenderlo.
--
--   1. alert_dismissals: el descarte, con motivo de CATÁLOGO (no texto libre) y una huella
--      de la condición al momento de archivarla.
--   2. RLS espejo de la lectura de la alerta + auditoría con audit_row().
--   3. dismiss_alert(): RPC que calcula la huella EN EL SERVIDOR y valida que la alerta
--      exista de verdad. Restaurar = delete directo (lo gobierna la RLS).
--
-- LA HUELLA (status + anchor) es el punto fino: sin ella, descartar "ventana vencida" de una
-- visita la escondería PARA SIEMPRE, incluso si más adelante se reprograma y vence una ventana
-- NUEVA. Eso sería un peligro regulatorio real: un vencimiento oculto. Con la huella, el
-- descarte vale solo mientras la condición sea la misma; si cambia la ventana o el estado,
-- la alerta vuelve a aparecer sola.
--
-- SIN VISTAS NUEVAS a propósito: una vista de alertas vigentes tendría que hacer `select v.*`
-- sobre v_track_visits y quedaría con el juego de columnas CONGELADO (el problema que ya
-- arrastran v_patient_visits/v_track_visits, que hay que recrear a mano en cada cambio). El
-- filtrado lo hace el front con las filas de esta tabla, que la RLS ya scopea. Una alerta
-- descartada no es un secreto: es una que ese mismo usuario podía ver.
--
-- ADITIVA y NO BREAKING: no toca ninguna tabla ni vista existente, así que el front desplegado
-- sigue funcionando igual mientras esta migración esté aplicada y el deploy nuevo no.
-- APLICAR: a mano en el SQL Editor de Supabase (rol postgres), DESPUÉS de la 0069. IDEMPOTENTE.
-- Registrar en supabase/README.md al confirmarse en prod.
-- ============================================================================

-- 1 · El descarte -------------------------------------------------------------------------
create table if not exists public.alert_dismissals (
  id            uuid primary key default uuid_generate_v4(),
  -- Qué clase de alerta se archiva. Texto con check y no enum: un enum nuevo obligaría a
  -- `alter type ... add value` en su propio archivo (la trampa de 0053) para sumar una clase.
  kind          text not null check (kind in ('visita', 'reporte_procedimiento')),
  visit_id      uuid not null references public.patient_visits(id) on delete cascade,
  -- Solo para 'reporte_procedimiento': el procedimiento realizado cuyo reporte está vencido.
  completion_id uuid references public.visit_procedure_completions(id) on delete cascade,
  -- Huella de la condición al archivar (la calcula el RPC, no el cliente).
  status        text,
  anchor        timestamptz not null default '-infinity',
  -- Motivo de catálogo: el error del operador es riesgo regulatorio, no detalle de UX.
  reason        text not null check (reason in (
                  'resuelta_fuera_del_sistema', 'visita_reprogramada',
                  'no_aplica', 'cargada_por_error', 'otro')),
  detail        text,
  -- dismissed_by = FK estable (quién, para auditoría). El NOMBRE va desnormalizado por el mismo
  -- motivo que author_name en 0048: la RLS de `users` solo deja ver la fila propia, así que un
  -- join ocultaría en silencio quién archivó la alerta para todo el que no sea gerencia. Y en un
  -- sistema auditable el snapshot es lo correcto: queda el puesto DE ENTONCES.
  dismissed_by      uuid not null default auth.uid() references public.users(id),
  dismissed_by_name text not null,
  dismissed_by_role text not null,
  dismissed_at      timestamptz not null default now(),
  -- completion_id va si y solo si es una alerta de reporte.
  constraint alert_dismissals_kind_chk
    check ((completion_id is not null) = (kind = 'reporte_procedimiento')),
  -- "Otro" sin explicación no dice nada: si el motivo es otro, el detalle es obligatorio.
  constraint alert_dismissals_detalle_chk
    check (reason <> 'otro' or btrim(coalesce(detail, '')) <> '')
);

comment on table public.alert_dismissals is
  'Alertas archivadas por un usuario (no borradas: las alertas son estado calculado). Guarda '
  'motivo de catálogo, autor, fecha y una huella (status+anchor) de la condición: si la '
  'condición cambia, el descarte deja de aplicar y la alerta reaparece. 0070.';
comment on column public.alert_dismissals.status is
  'computed_status de la visita al descartar (solo kind=''visita''). Parte de la huella. 0070.';
comment on column public.alert_dismissals.anchor is
  'Valor que define la condición al descartar: window_end para ''visita'', report_due_at para '
  '''reporte_procedimiento''. ''-infinity'' = la condición no tenía fecha. Parte de la huella. 0070.';

-- Un descarte por condición. Van con coalesce porque en un índice único los NULL son
-- distintos entre sí y se colarían duplicados.
create unique index if not exists ux_alert_dismissal_visita
  on public.alert_dismissals (visit_id, coalesce(status, ''), anchor) where kind = 'visita';
create unique index if not exists ux_alert_dismissal_reporte
  on public.alert_dismissals (completion_id) where kind = 'reporte_procedimiento';
create index if not exists ix_alert_dismissal_visit on public.alert_dismissals (visit_id);

-- 2 · RLS: espejo de quién puede VER la alerta (0064) --------------------------------------
alter table public.alert_dismissals enable row level security;

drop policy if exists "ver descartes" on public.alert_dismissals;
create policy "ver descartes" on public.alert_dismissals for select using (
  public.has_module('gerencia') or public.coordina_visita(visit_id));

-- El insert real pasa por el RPC (SECURITY DEFINER), pero la policy queda igual: es la red de
-- seguridad si alguna vez se inserta directo, y deja el `dismissed_by` clavado al que escribe.
drop policy if exists "track descarta alerta" on public.alert_dismissals;
create policy "track descarta alerta" on public.alert_dismissals for insert with check (
  dismissed_by = auth.uid() and (public.has_module('gerencia') or public.coordina_visita(visit_id)));

-- Restaurar = borrar el descarte. El audit_log guarda el delete, así que el ida y vuelta
-- queda trazado sin necesidad de columnas de "restaurado".
drop policy if exists "track restaura alerta" on public.alert_dismissals;
create policy "track restaura alerta" on public.alert_dismissals for delete using (
  public.has_module('gerencia') or public.coordina_visita(visit_id));

-- Sin policy de UPDATE a propósito: un descarte no se edita. Se restaura y se vuelve a hacer,
-- y así el audit_log muestra las dos decisiones en vez de una sobrescrita.

revoke all on public.alert_dismissals from anon;
grant select, insert, delete on public.alert_dismissals to authenticated;

drop trigger if exists trg_audit_alert_dismissals on public.alert_dismissals;
create trigger trg_audit_alert_dismissals after insert or update or delete
  on public.alert_dismissals for each row execute function public.audit_row();

-- 3 · RPC: descartar ------------------------------------------------------------------------
-- La huella se calcula ACÁ y no en el cliente: un anchor falseado podría tapar una alerta
-- futura. Además valida que la alerta esté vigente de verdad — no se archiva un aviso que no
-- existe. Authz espejo de la lectura (gerencia o coordinador de la visita), como mark_no_show.
create or replace function public.dismiss_alert(
  p_kind          text,
  p_visit_id      uuid,
  p_reason        text,
  p_completion_id uuid default null,
  p_detail        text default null
) returns uuid
language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  v_status     text;
  v_window_end date;
  v_due        timestamptz;
  v_anchor     timestamptz;
  v_name       text;
  v_role       text;
  v_id         uuid;
begin
  if auth.uid() is null then raise exception 'No autenticado' using errcode = '42501'; end if;
  if not (public.has_module('gerencia') or public.coordina_visita(p_visit_id)) then
    raise exception 'No tenés permiso' using errcode = '42501';
  end if;
  if p_kind not in ('visita', 'reporte_procedimiento') then
    raise exception 'Tipo de alerta desconocido' using errcode = '22023';
  end if;

  if p_kind = 'visita' then
    if p_completion_id is not null then
      raise exception 'Una alerta de visita no lleva procedimiento' using errcode = '22023';
    end if;
    -- Calificamos tv.* siempre: en PL/pgSQL los nombres sueltos compiten con las variables
    -- locales (el error de 0056 y 0058, dos veces el mismo).
    select tv.computed_status, tv.window_end
      into v_status, v_window_end
      from public.v_track_visits tv
     where tv.id = p_visit_id;
    if v_status is null then
      raise exception 'Visita inexistente' using errcode = '23503';
    end if;
    if v_status not in ('ventana_vencida', 'item_vencido') then
      raise exception 'Esa visita no está en alerta' using errcode = 'check_violation';
    end if;
    v_anchor := coalesce(v_window_end::timestamptz, '-infinity'::timestamptz);
  else
    if p_completion_id is null then
      raise exception 'Falta el procedimiento de la alerta' using errcode = '23502';
    end if;
    select ra.report_due_at
      into v_due
      from public.v_procedure_report_alerts ra
     where ra.completion_id = p_completion_id
       and ra.visit_id      = p_visit_id;
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
    (kind, visit_id, completion_id, status, anchor, reason, detail,
     dismissed_by, dismissed_by_name, dismissed_by_role)
  values
    (p_kind, p_visit_id, p_completion_id, v_status, v_anchor, p_reason,
     nullif(btrim(coalesce(p_detail, '')), ''), auth.uid(),
     coalesce(v_name, 'Usuario'), coalesce(v_role, 'Equipo'))
  returning id into v_id;

  return v_id;
end $$;

comment on function public.dismiss_alert(text, uuid, text, uuid, text) is
  'Archiva una alerta vigente con motivo de catálogo. Calcula la huella (status+anchor) en el '
  'servidor para que un descarte no pueda tapar una alerta futura. Authz: gerencia o '
  'coordinador de la visita. Restaurar = delete sobre alert_dismissals. 0070.';

revoke all on function public.dismiss_alert(text, uuid, text, uuid, text) from anon, public;
grant execute on function public.dismiss_alert(text, uuid, text, uuid, text) to authenticated;
