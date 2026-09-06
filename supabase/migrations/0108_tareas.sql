-- ============================================================================
-- 0108 · Tareas: el submódulo `Inicio › Tareas` deja de estar vacío
--
-- Plan: docs/plan-tareas.md (pieza 5). Nueve decisiones tomadas con el Director.
--
-- Dos tablas, una función de visibilidad, RLS de lectura, auditoría y cuatro RPC.
--
-- ── TRES COSAS DE ESTE ARCHIVO QUE NO SON EL DEFAULT DE LA APP, LAS TRES A PROPÓSITO ──
--
-- 1 · LAS FK DEL VÍNCULO VAN `on delete set null`, NO `restrict`. El grafo de esta app es casi
--     todo restrict, pero acá restrict haría que UNA TAREA BLOQUEE EL BORRADO DE UN PACIENTE:
--     delete_patient (0024) borra enrollments y patients directo, así que fallaría con un error
--     de FK crudo — y el mensaje sereno que esa función ya prepara para el caso de Farmacia no
--     lo cubriría. Con set null la tarea sobrevive sin su vínculo, que es lo correcto: es el
--     pendiente de una persona, no un dato del paciente.
--
-- 2 · GERENCIA NO VE LAS TAREAS AJENAS. Es lo contrario de lo que hace el resto de la app. Una
--     lista personal de pendientes que el jefe puede leer deja de usarse a los tres días, y
--     entonces la feature no sirve para lo que fue pedida. Las tareas NO son un registro
--     clínico: lo que se audita es que existieron y quién las tocó, no su contenido para todos.
--
-- 3 · NO HAY GATE DE MÓDULO. Tareas vive en `inicio`, que todos tienen por definición del shell
--     y que ni siquiera es valor del enum `spira_module`. Pedir un módulo dejaría a Farmacia
--     afuera, y "reponer las heladeras" no es de ningún estudio.
--
-- ── EL PUNTO FINO: LA RECURSIÓN DE LA RLS ──
-- La policy de `tasks` necesita mirar `task_assignees` (¿estoy asignado?) y la de
-- `task_assignees` necesita mirar `tasks` (¿puedo ver esta tarea?). Escritas así, Postgres corta
-- con "infinite recursion detected in policy for relation". Se resuelve con `public.ve_tarea`,
-- SECURITY DEFINER: corre como dueña, saltea la RLS de las dos tablas y no vuelve a entrar por
-- la puerta que la llamó. Es el mismo patrón que `coordina_visita` y `has_module`.
--
-- ── EL "HECHA" VIVE EN DOS LUGARES SEGÚN EL MODO, y hay un check que lo hace cumplir ──
-- `cualquiera` = el hecho es UNO (tasks.completed_at). `cada_uno` = el hecho es DE CADA PERSONA
-- (task_assignees.completed_at), que es lo que permite el "2 de 4". Sin el check, las dos
-- columnas podrían llenarse a la vez y habría dos verdades sobre la misma tarea.
--
-- ADITIVA y NO BREAKING: tablas y funciones nuevas, no toca nada existente. Va ANTES del front.
-- APLICAR: a mano en el SQL Editor de Supabase (rol postgres), DESPUÉS de la 0107. IDEMPOTENTE.
-- Registrar en supabase/README.md al confirmarse en prod.
-- ============================================================================

-- 1 · Las tablas ---------------------------------------------------------------------------
create table if not exists public.tasks (
  id                uuid primary key default uuid_generate_v4(),
  title             text not null check (btrim(title) <> ''),
  detail            text,
  -- Vencimiento. Nullable: una tarea sin fecha es una tarea válida ("cuando pueda").
  due_date          date,
  -- La "duración estimada" del handoff. Nullable y en minutos, que es la unidad en la que
  -- alguien piensa un pendiente ("veinte minutos"), no en horas decimales.
  estimated_minutes integer check (estimated_minutes is null or estimated_minutes > 0),
  -- Cómo se cierra, elegido al crearla. Texto con check y no enum: sumar una forma más no puede
  -- costar un `alter type ... add value` en su propio archivo (la trampa de la 0053).
  completion_mode   text not null default 'cada_uno'
                      check (completion_mode in ('cualquiera', 'cada_uno')),
  -- Cierre de `cualquiera`. En `cada_uno` queda NULL y el hecho vive en task_assignees.
  completed_at      timestamptz,
  completed_by      uuid references public.users(id),
  -- Vínculo OPCIONAL. Ver la nota 1 de la cabecera sobre el `set null`.
  patient_id        uuid references public.patients(id)       on delete set null,
  visit_id          uuid references public.patient_visits(id) on delete set null,
  protocol_id       uuid references public.protocols(id)      on delete set null,
  created_by        uuid not null default auth.uid() references public.users(id),
  -- Snapshot del nombre: la RLS de `users` sólo deja ver la fila propia, así que un join
  -- ocultaría el autor para todos los demás. Mismo criterio que author_name (0048).
  created_by_name   text not null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz,
  -- El cierre de `cualquiera` es un solo hecho: o está completo o no empezó.
  constraint tasks_cierre_completo_chk
    check ((completed_at is null) = (completed_by is null)),
  -- Y sólo existe en ese modo. Sin esto, las dos columnas de "hecha" podrían llenarse a la vez.
  constraint tasks_cierre_segun_modo_chk
    check (completion_mode = 'cualquiera' or completed_at is null)
);

comment on table public.tasks is
  'Pendientes propios de cada persona (Inicio > Tareas). Se asignan a una o varias personas. '
  'El "hecha" vive acá cuando completion_mode = ''cualquiera'' y en task_assignees cuando es '
  '''cada_uno''. Gerencia NO ve las tareas ajenas: no son un registro clínico. 0108.';
comment on column public.tasks.completion_mode is
  '''cualquiera'': la cierra uno y queda cerrada para todos. ''cada_uno'': cada asignado cierra '
  'la suya y la pantalla muestra el avance. Se elige al crearla. 0108.';

create table if not exists public.task_assignees (
  task_id      uuid not null references public.tasks(id) on delete cascade,
  user_id      uuid not null references public.users(id) on delete cascade,
  user_name    text not null,               -- snapshot, mismo motivo que created_by_name
  completed_at timestamptz,                 -- sólo para completion_mode = 'cada_uno'
  primary key (task_id, user_id)
);

comment on table public.task_assignees is
  'A quién le toca cada tarea. Más de una fila = tarea GRUPAL, y eso es lo que habilita que un '
  'asignado la edite (ver update_task). La condición se lee de la CANTIDAD de filas y no de un '
  'campo aparte, para que no puedan quedar en desacuerdo. 0108.';

-- Las tres consultas de la pantalla: mis tareas, las de una tarea, y el vencimiento.
create index if not exists ix_task_assignees_user on public.task_assignees (user_id);
create index if not exists ix_tasks_created_by    on public.tasks (created_by);
create index if not exists ix_tasks_due_date      on public.tasks (due_date) where completed_at is null;

-- 2 · Quién ve una tarea --------------------------------------------------------------------
-- SECURITY DEFINER para cortar la recursión de la RLS (ver la cabecera). STABLE porque sólo lee
-- y así el planner la puede cachear dentro de la misma sentencia.
create or replace function public.ve_tarea(p_task_id uuid)
returns boolean language sql security definer stable set search_path = pg_catalog, public as $ve$
  select exists (
    select 1 from public.tasks t
     where t.id = p_task_id
       and (t.created_by = auth.uid()
            or exists (select 1 from public.task_assignees ta
                        where ta.task_id = t.id and ta.user_id = auth.uid()))
  );
$ve$;

comment on function public.ve_tarea(uuid) is
  'Si el usuario actual es autor o asignado de la tarea. SECURITY DEFINER para que las policies '
  'de tasks y task_assignees no se llamen entre sí (recursión infinita). 0108.';

revoke all   on function public.ve_tarea(uuid) from anon, public;
grant execute on function public.ve_tarea(uuid) to authenticated;

-- 3 · RLS: sólo lectura por policy; TODA escritura pasa por los RPC ------------------------
-- No se abren policies de insert/update/delete a propósito: cada escritura tiene una regla que
-- una policy no expresa bien (crear toca dos tablas y tiene que ser atómico; editar depende de
-- la CANTIDAD de asignados). Con las reglas en los RPC hay un solo lugar donde leerlas.
alter table public.tasks           enable row level security;
alter table public.task_assignees  enable row level security;

drop policy if exists "ver mis tareas" on public.tasks;
create policy "ver mis tareas" on public.tasks for select using (public.ve_tarea(tasks.id));

drop policy if exists "ver asignados de mis tareas" on public.task_assignees;
create policy "ver asignados de mis tareas" on public.task_assignees for select using (
  public.ve_tarea(task_assignees.task_id));

revoke all on public.tasks          from anon, authenticated;
revoke all on public.task_assignees from anon, authenticated;
grant select on public.tasks          to authenticated;
grant select on public.task_assignees to authenticated;

-- Auditoría sobre `tasks` y no sobre `task_assignees`: los cambios de asignados son parte de la
-- misma operación (crear o reasignar) y auditarlos aparte dejaría dos filas por gesto.
drop trigger if exists trg_audit_tasks on public.tasks;
create trigger trg_audit_tasks after insert or update or delete
  on public.tasks for each row execute function public.audit_row();

-- 4 · Crear ---------------------------------------------------------------------------------
-- `p_replicar` es lo que separa una tarea GRUPAL de N tareas independientes: con true se inserta
-- una tarea por asignado, cada una con su único asignado, y cada persona queda autora de la
-- suya. No hace falta nada en el schema — es el mismo alta ejecutado N veces.
--
-- Sin asignados = tarea personal: se asigna a quien la crea. Es el caso más común y no tiene por
-- qué obligar a elegirse a uno mismo en una lista.
--
-- CUALQUIERA LE PUEDE ASIGNAR A CUALQUIERA (decisión del Director): es una lista de pendientes,
-- no un permiso. Acotarlo después es una condición más acá, no una migración.
create or replace function public.create_task(
  p_title             text,
  p_assignees         uuid[] default null,
  p_completion_mode   text   default 'cada_uno',
  p_detail            text   default null,
  p_due_date          date   default null,
  p_estimated_minutes integer default null,
  p_patient_id        uuid   default null,
  p_visit_id          uuid   default null,
  p_protocol_id       uuid   default null,
  p_replicar          boolean default false
) returns uuid[]
language plpgsql security definer set search_path = pg_catalog, public as $fn$
declare
  v_yo       uuid := auth.uid();
  v_mi_nom   text;
  v_dest     uuid[];
  v_uno      uuid;
  v_task     uuid;
  v_ids      uuid[] := '{}';
begin
  if v_yo is null then raise exception 'No autenticado' using errcode = '42501'; end if;
  if btrim(coalesce(p_title, '')) = '' then
    raise exception 'La tarea necesita un título' using errcode = '23502';
  end if;
  if p_completion_mode not in ('cualquiera', 'cada_uno') then
    raise exception 'Forma de cierre desconocida' using errcode = '22023';
  end if;

  -- Sin asignados, la tarea es para quien la crea.
  v_dest := coalesce(nullif(p_assignees, '{}'::uuid[]), array[v_yo]);

  -- Que existan de verdad: un id inventado insertaría una tarea que nadie puede ver.
  -- Se califica u.id siempre (los nombres sueltos compiten con las variables locales en
  -- PL/pgSQL — el error de 0056 y 0058, dos veces el mismo).
  if exists (select 1 from unnest(v_dest) d(id)
              where not exists (select 1 from public.users u where u.id = d.id)) then
    raise exception 'Alguna de las personas elegidas ya no existe' using errcode = '23503';
  end if;

  select u.full_name into v_mi_nom from public.users u where u.id = v_yo;

  if p_replicar then
    -- N tareas independientes, una por persona.
    foreach v_uno in array v_dest loop
      insert into public.tasks
        (title, detail, due_date, estimated_minutes, completion_mode,
         patient_id, visit_id, protocol_id, created_by, created_by_name)
      values
        (btrim(p_title), nullif(btrim(coalesce(p_detail, '')), ''), p_due_date, p_estimated_minutes,
         p_completion_mode, p_patient_id, p_visit_id, p_protocol_id, v_yo, coalesce(v_mi_nom, 'Usuario'))
      returning id into v_task;

      insert into public.task_assignees (task_id, user_id, user_name)
      select v_task, u.id, coalesce(u.full_name, 'Usuario') from public.users u where u.id = v_uno;

      v_ids := v_ids || v_task;
    end loop;
  else
    -- Una sola tarea con todos los asignados.
    insert into public.tasks
      (title, detail, due_date, estimated_minutes, completion_mode,
       patient_id, visit_id, protocol_id, created_by, created_by_name)
    values
      (btrim(p_title), nullif(btrim(coalesce(p_detail, '')), ''), p_due_date, p_estimated_minutes,
       p_completion_mode, p_patient_id, p_visit_id, p_protocol_id, v_yo, coalesce(v_mi_nom, 'Usuario'))
    returning id into v_task;

    insert into public.task_assignees (task_id, user_id, user_name)
    select v_task, u.id, coalesce(u.full_name, 'Usuario') from public.users u where u.id = any (v_dest);

    v_ids := array[v_task];
  end if;

  return v_ids;
end $fn$;

-- 5 · Marcar hecha (y deshacer) -------------------------------------------------------------
-- NADIE MARCA HECHA LA PARTE DE OTRO. En `cada_uno` cada quien cierra la suya y hay que estar
-- asignado; en `cualquiera` cerrar es cerrar LA TAREA, así que alcanza con verla (el autor
-- también puede, aunque no se haya asignado).
create or replace function public.set_task_done(p_task_id uuid, p_done boolean default true)
returns void
language plpgsql security definer set search_path = pg_catalog, public as $fn$
declare
  v_yo    uuid := auth.uid();
  v_modo  text;
begin
  if v_yo is null then raise exception 'No autenticado' using errcode = '42501'; end if;
  if not public.ve_tarea(p_task_id) then
    raise exception 'No tenés permiso' using errcode = '42501';
  end if;

  select t.completion_mode into v_modo from public.tasks t where t.id = p_task_id;
  if v_modo is null then raise exception 'Esa tarea ya no existe' using errcode = '23503'; end if;

  if v_modo = 'cualquiera' then
    update public.tasks t
       set completed_at = case when p_done then now() else null end,
           completed_by = case when p_done then v_yo else null end,
           updated_at   = now()
     where t.id = p_task_id;
  else
    update public.task_assignees ta
       set completed_at = case when p_done then now() else null end
     where ta.task_id = p_task_id and ta.user_id = v_yo;
    if not found then
      raise exception 'Esa tarea no está asignada a vos' using errcode = '42501';
    end if;
  end if;
end $fn$;

-- 6 · Editar ---------------------------------------------------------------------------------
-- LA REGLA DE EDICIÓN (decisión del Director):
--   · el AUTOR puede todo;
--   · un asignado en una tarea INDIVIDUAL sólo puede marcarla hecha — es un ENCARGO, y cambiarle
--     el título o la fecha sería cambiar lo que le pidieron;
--   · un asignado en una tarea GRUPAL también la puede editar — es trabajo compartido.
-- "Grupal" se lee de la CANTIDAD de asignados, no de un campo: un campo podría quedar en
-- desacuerdo con la lista y habría dos verdades.
--
-- REASIGNAR ES SÓLO DEL AUTOR, incluso en una grupal: cambiar a quién le toca no es editar el
-- contenido. `p_assignees` NULL deja la lista como está; un arreglo la reemplaza entera.
--
-- Cada parámetro NULL deja su columna como está, salvo los que se limpian a propósito con
-- `p_limpiar` — sin eso no habría forma de sacarle la fecha a una tarea que ya la tiene.
create or replace function public.update_task(
  p_task_id           uuid,
  p_title             text    default null,
  p_detail            text    default null,
  p_due_date          date    default null,
  p_estimated_minutes integer default null,
  p_assignees         uuid[]  default null,
  p_limpiar           text[]  default null
) returns void
language plpgsql security definer set search_path = pg_catalog, public as $fn$
declare
  v_yo      uuid := auth.uid();
  v_autor   uuid;
  v_n       integer;
  v_asig    boolean;
begin
  if v_yo is null then raise exception 'No autenticado' using errcode = '42501'; end if;

  select t.created_by into v_autor from public.tasks t where t.id = p_task_id;
  if v_autor is null then raise exception 'Esa tarea ya no existe' using errcode = '23503'; end if;

  select count(*) into v_n from public.task_assignees ta where ta.task_id = p_task_id;
  select exists (select 1 from public.task_assignees ta
                  where ta.task_id = p_task_id and ta.user_id = v_yo) into v_asig;

  if not (v_autor = v_yo or (v_asig and v_n > 1)) then
    raise exception 'Sólo podés marcarla como hecha: esta tarea te la asignó otra persona'
      using errcode = '42501';
  end if;

  if p_assignees is not null and v_autor <> v_yo then
    raise exception 'Sólo quien creó la tarea puede cambiar a quién le toca' using errcode = '42501';
  end if;
  if p_title is not null and btrim(p_title) = '' then
    raise exception 'La tarea necesita un título' using errcode = '23502';
  end if;

  update public.tasks t
     set title             = coalesce(nullif(btrim(coalesce(p_title, '')), ''), t.title),
         detail            = case when 'detail' = any (coalesce(p_limpiar, '{}')) then null
                                  else coalesce(nullif(btrim(coalesce(p_detail, '')), ''), t.detail) end,
         due_date          = case when 'due_date' = any (coalesce(p_limpiar, '{}')) then null
                                  else coalesce(p_due_date, t.due_date) end,
         estimated_minutes = case when 'estimated_minutes' = any (coalesce(p_limpiar, '{}')) then null
                                  else coalesce(p_estimated_minutes, t.estimated_minutes) end,
         updated_at        = now()
   where t.id = p_task_id;

  if p_assignees is not null then
    if p_assignees = '{}'::uuid[] then
      raise exception 'La tarea tiene que estar asignada a alguien' using errcode = '23502';
    end if;
    if exists (select 1 from unnest(p_assignees) d(id)
                where not exists (select 1 from public.users u where u.id = d.id)) then
      raise exception 'Alguna de las personas elegidas ya no existe' using errcode = '23503';
    end if;
    -- SE TOCA SÓLO LA DIFERENCIA, en dos sentencias, y NO se borra todo para reinsertar.
    -- Borrar y reinsertar la misma clave primaria en UNA sentencia con CTE no funciona: las CTE
    -- que modifican datos comparten snapshot y no ven los efectos de las otras, así que el insert
    -- choca con las filas que el delete todavía no retiró (`duplicate key`). Y lo dispararía el
    -- caso más común: reasignar conservando a alguien.
    -- Tocar sólo la diferencia además CONSERVA el avance solo: a quien sigue asignado no se le
    -- toca la fila, así que su `completed_at` no se pierde ni hay que copiarlo a mano.
    -- (Las dos sentencias comparten transacción porque están dentro de la función; la advertencia
    -- de CLAUDE.md sobre sesiones que no se comparten es para el editor SQL, no para acá.)
    delete from public.task_assignees ta
     where ta.task_id = p_task_id and not (ta.user_id = any (p_assignees));

    insert into public.task_assignees (task_id, user_id, user_name)
    select p_task_id, u.id, coalesce(u.full_name, 'Usuario')
      from public.users u
     where u.id = any (p_assignees)
       and not exists (select 1 from public.task_assignees ta
                        where ta.task_id = p_task_id and ta.user_id = u.id);
  end if;
end $fn$;

-- 7 · Borrar ---------------------------------------------------------------------------------
-- Sólo el autor. Un asignado que no la quiere la marca hecha; borrar la tarea de otro sería
-- sacarle el pendiente de la lista sin que se entere. La cascada se lleva los asignados y el
-- audit_log guarda el delete con su `before`, así que la tarea que existió queda registrada.
create or replace function public.delete_task(p_task_id uuid)
returns void
language plpgsql security definer set search_path = pg_catalog, public as $fn$
declare
  v_yo    uuid := auth.uid();
  v_autor uuid;
begin
  if v_yo is null then raise exception 'No autenticado' using errcode = '42501'; end if;
  select t.created_by into v_autor from public.tasks t where t.id = p_task_id;
  if v_autor is null then raise exception 'Esa tarea ya no existe' using errcode = '23503'; end if;
  if v_autor <> v_yo then
    raise exception 'Sólo quien creó la tarea puede eliminarla' using errcode = '42501';
  end if;
  delete from public.tasks t where t.id = p_task_id;
end $fn$;

-- 8 · Permisos de los RPC --------------------------------------------------------------------
revoke all   on function public.create_task(text, uuid[], text, text, date, integer, uuid, uuid, uuid, boolean) from anon, public;
grant execute on function public.create_task(text, uuid[], text, text, date, integer, uuid, uuid, uuid, boolean) to authenticated;
revoke all   on function public.set_task_done(uuid, boolean) from anon, public;
grant execute on function public.set_task_done(uuid, boolean) to authenticated;
revoke all   on function public.update_task(uuid, text, text, date, integer, uuid[], text[]) from anon, public;
grant execute on function public.update_task(uuid, text, text, date, integer, uuid[], text[]) to authenticated;
revoke all   on function public.delete_task(uuid) from anon, public;
grant execute on function public.delete_task(uuid) to authenticated;
