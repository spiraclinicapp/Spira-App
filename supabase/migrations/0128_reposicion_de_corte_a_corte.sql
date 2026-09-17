-- Spira · Migración 0128 — Reposición de corte a corte: día de corte, pedidos de medicación y recepción
-- de un pedido.
-- Spec: docs/superpowers/specs/2026-09-16-reposicion-submodulo-design.md (R4, R8-R11, R13).
-- Plan: docs/superpowers/plans/2026-09-16-reposicion-parte-1-modelo-y-base.md.
--
-- APLICAR A MANO en el SQL Editor de Supabase (rol postgres), DESPUÉS de la 0127.
-- IDEMPOTENTE: reintentar es volver a correr el archivo entero.
--
-- ✅ ADITIVA → VA **ANTES** DEL DEPLOY DEL FRONT. Nada de esto rompe lo que el front desplegado pide:
--    · farmacia_ajustes.dia_corte es nueva y nullable (el front pide demora_compra_dias por nombre);
--    · dos tablas nuevas que ningún front consulta;
--    · medication_receptions.pedido_id, nullable. Su FK NO deja ambiguo ningún embed actual (buscado en
--      src el 2026-09-16): los dos embeds desde medication_receptions son protocol:protocols(code) e
--      items:reception_items(...) (src/data/pharma/receptions.ts), y pedidos_medicacion no referencia a
--      medication_receptions ni a reception_items, así que no es un puente entre ninguno de los dos;
--    · create_reception suma p_pedido_id con default null AL FINAL. El front desplegado la llama por
--      nombre con cinco argumentos y resuelve a la nueva por el default. La firma vieja se BORRA antes:
--      create or replace con otra firma deja una sobrecarga viva y PostgREST contestaría PGRST203
--      (ambigua) a la llamada vieja. Entre el drop y el create no hay transacción que abarque las dos
--      (el editor no comparte sesión): si el create fallara, Recepción queda sin función hasta volver a
--      correr el archivo. Por eso se probó entera en PGlite antes de pasarla;
--    · insumos_de_reposicion y reposicion_pedidos (0125), que usa la card de Estadísticas, NO se tocan:
--      se borran en la 0129, DESPUÉS del deploy del front.
--
-- ⚠️ NUNCA dos signos peso pegados dentro de un comentario (ver CLAUDE.md, 0071).
--
-- Registrar en supabase/README.md al confirmarse en prod.
-- ============================================================================


-- 1 · El día de corte (R4) -----------------------------------------------------------------------
-- Se escribe con update directo de operator: la policy y el trigger que sella al autor ya existen (0125).
alter table public.farmacia_ajustes
  add column if not exists dia_corte integer;
alter table public.farmacia_ajustes drop constraint if exists farmacia_ajustes_dia_corte_chk;
alter table public.farmacia_ajustes add constraint farmacia_ajustes_dia_corte_chk
  check (dia_corte is null or dia_corte between 1 and 31);

comment on column public.farmacia_ajustes.dia_corte is
  'Día del mes en que corta el período de reposición (R4). En un mes sin ese día, corta el último (lo resuelve src/data/pharma/periodoDeCorte.ts). NULL = sin cargar: la pantalla lo pide. 0128.';


-- 2 · Pedidos de medicación (R8, R9) -------------------------------------------------------------
-- Número correlativo y legible, como el folio de las recepciones (0085): el uuid no se puede dictar
-- por teléfono ni escribir en una hoja. Un pedido rechazado a mitad de camino consume un número: los
-- huecos en la numeración no significan nada.
create sequence if not exists public.pedidos_medicacion_numero_seq;

create table if not exists public.pedidos_medicacion (
  id                 uuid primary key default gen_random_uuid(),
  numero             integer not null unique default nextval('public.pedidos_medicacion_numero_seq'),
  protocol_id        uuid not null references public.protocols(id) on delete restrict,
  periodo_desde      date not null,
  periodo_hasta      date not null,
  emitido_el         date not null,
  emitido_por        uuid not null references public.users(id) on delete restrict,
  emitido_por_nombre text,
  anulado_at         timestamptz,
  anulado_por_nombre text,
  anulado_motivo     text,
  created_at         timestamptz not null default now(),
  constraint pedidos_medicacion_periodo_chk check (periodo_desde <= periodo_hasta),
  constraint pedidos_medicacion_anulado_chk check (
    (anulado_at is null and anulado_motivo is null)
    or (anulado_at is not null and anulado_motivo in ('por_error', 'rehecho'))
  )
);
alter sequence public.pedidos_medicacion_numero_seq owned by public.pedidos_medicacion.numero;

comment on table public.pedidos_medicacion is
  'Pedido de medicación de un estudio, impreso con número (R8). periodo_desde/hasta = el período para el que se pidió. El estado se deduce de las recepciones con pedido_id. Sin escritura directa. 0128.';

create index if not exists pedidos_medicacion_protocol_idx on public.pedidos_medicacion (protocol_id);

drop trigger if exists trg_audit_pedidos_medicacion on public.pedidos_medicacion;
create trigger trg_audit_pedidos_medicacion
  after insert or update or delete on public.pedidos_medicacion
  for each row execute function public.audit_row();

alter table public.pedidos_medicacion enable row level security;
drop policy if exists "ver pedidos de medicacion" on public.pedidos_medicacion;
create policy "ver pedidos de medicacion" on public.pedidos_medicacion for select
  using (public.has_min_role('pharma', 'viewer') or public.has_module('gerencia'));

revoke all on public.pedidos_medicacion from anon;
revoke insert, update, delete, truncate on public.pedidos_medicacion from authenticated;
grant select on public.pedidos_medicacion to authenticated;


-- 3 · Renglones del pedido (R8, R11) -------------------------------------------------------------
-- calculado = lo que dio la cuenta al emitir (null si estaba sin cargar); pedido = lo que se pidió de
-- verdad. Lo recibido NO se guarda acá: se suma de las recepciones verificadas, así una recepción
-- anulada deja de contar sola.
create table if not exists public.pedido_medicacion_items (
  id                 uuid primary key default gen_random_uuid(),
  pedido_id          uuid not null references public.pedidos_medicacion(id) on delete restrict,
  medication_id      uuid not null references public.medications(id) on delete restrict,
  calculado          integer check (calculado is null or calculado >= 0),
  pedido             integer not null check (pedido > 0),
  cerrado_at         timestamptz,
  cerrado_por_nombre text,
  cerrado_motivo     text,
  constraint pedido_medicacion_items_unico unique (pedido_id, medication_id),
  constraint pedido_medicacion_items_cerrado_chk check (
    (cerrado_at is null and cerrado_motivo is null)
    or (cerrado_at is not null and cerrado_motivo in ('no_lo_tiene', 'discontinuado', 'no_hace_falta'))
  )
);

comment on table public.pedido_medicacion_items is
  'Renglones de un pedido de medicación: calculado (la cuenta al emitir) y pedido. cerrado_* = «No va a llegar» (R11). 0128.';

drop trigger if exists trg_audit_pedido_medicacion_items on public.pedido_medicacion_items;
create trigger trg_audit_pedido_medicacion_items
  after insert or update or delete on public.pedido_medicacion_items
  for each row execute function public.audit_row();

alter table public.pedido_medicacion_items enable row level security;
drop policy if exists "ver renglones de pedidos de medicacion" on public.pedido_medicacion_items;
create policy "ver renglones de pedidos de medicacion" on public.pedido_medicacion_items for select
  using (public.has_min_role('pharma', 'viewer') or public.has_module('gerencia'));

revoke all on public.pedido_medicacion_items from anon;
revoke insert, update, delete, truncate on public.pedido_medicacion_items from authenticated;
grant select on public.pedido_medicacion_items to authenticated;


-- 4 · La recepción sabe a qué pedido responde (R10) ----------------------------------------------
alter table public.medication_receptions
  add column if not exists pedido_id uuid references public.pedidos_medicacion(id) on delete restrict;
alter table public.medication_receptions drop constraint if exists medication_receptions_pedido_tipo_chk;
alter table public.medication_receptions add constraint medication_receptions_pedido_tipo_chk
  check (pedido_id is null or tipo = 'protocolo');
create index if not exists medication_receptions_pedido_idx
  on public.medication_receptions (pedido_id) where pedido_id is not null;

comment on column public.medication_receptions.pedido_id is
  'El pedido de medicación que se está recibiendo (R10). Sólo recepciones de protocolo. Que apunte a un
   pedido que existe, no está anulado y es del mismo estudio lo garantiza el trigger
   trg_validar_pedido_de_recepcion (sección 5) cuando quien escribe es current_user = postgres —una
   función SECURITY DEFINER de ese owner (create_reception) o el editor SQL—; para cualquier otro rol, el
   mismo trigger rechaza de entrada tocar esta columna (o tipo/protocol_id en una fila con pedido) antes de
   llegar a esa validación. create_reception nunca actualiza pedido_id, sólo lo pone al insertar. El
   trigger es BEFORE INSERT OR UPDATE: NO cubre un DELETE de la recepción ni un PATCH directo a
   reception_items, ambos permitidos por la policy for all de pharma (hueco previo, ver TODOS.md). 0128.';


-- 5 · Trigger: la recepción no puede saltear la validación de su pedido (R9, R10) -----------------
-- La policy "pharma administra recepciones" (0006:247, aflojada a operator+ en 0009:153) es `for all`
-- sobre medication_receptions: antes de este trigger, la única validación del pedido vivía DENTRO de
-- create_reception, así que un operator podía saltearla enteras con un PATCH/POST directo de PostgREST:
--   · PATCH … {"pedido_id": null} a una recepción ya recibida, y DESPUÉS anular ese pedido — el guard de
--     anular_pedido_medicacion sólo mira medication_receptions.pedido_id (mr.status <> 'anulada'), y con
--     pedido_id en null esa recepción deja de contar. Rompe R9.
--   · POST/PATCH con pedido_id de un pedido anulado, de otro estudio, o un UPDATE que le cambia el
--     protocol_id/tipo a una recepción que ya tiene pedido. Rompe R10: lo recibido suma en el pedido
--     equivocado y la compra sale mal.
-- Va DESPUÉS de que existan pedidos_medicacion (sección 2) y medication_receptions.pedido_id (sección 4):
-- lee la primera columna por columna y valida la segunda — pero no en cada INSERT/UPDATE: sólo en el
-- INSERT, o en el UPDATE que cambia pedido_id, tipo o protocol_id (v_toca_pedido, más abajo).
--
-- Lo que este trigger NO cubre (hueco previo a esta rama, ver TODOS.md): un DELETE directo de
-- medication_receptions, y la escritura directa de reception_items — las dos las permite la misma policy
-- for all de pharma (medication_receptions: 0006:247/0009:153; reception_items: 0006:249/0009:155), y
-- ninguna dispara este trigger, que es BEFORE INSERT OR UPDATE sólo sobre medication_receptions (sección
-- 4). Borrar la recepción no revierte el stock: los lotes que la verificación ya escribió no son de
-- reception_items y quedan como estaban. Lo que SÍ arrastra es el pedido: reception_items cae en CASCADE
-- (0002:262), así que recibido/sin_verificar bajan solos, el pedido vuelve a figurar con faltante —sube
-- «ya pedido, sin recibir» en la boleta y la compra calculada sale más corta— y anular_pedido_medicacion,
-- que sólo mira si queda una recepción no anulada de ese pedido, deja de verla: el pedido se puede anular
-- con el stock ya puesto en el estante. Y un PATCH a reception_items.quantity de una recepción verificada
-- con pedido cambia lo recibido de ese pedido —y con eso la compra— sin que create_reception ni este
-- trigger se enteren.
--
-- SIN SECURITY DEFINER, a propósito: con SECURITY DEFINER, current_user adentro de la función sería
-- SIEMPRE el owner (postgres) sin importar quién disparó el INSERT/UPDATE real, y la distinción por
-- current_user de más abajo dejaría de significar nada — la misma trampa que guard_reception_void
-- (0087/0088) evita quedándose sin SECURITY DEFINER.
--
-- Y la distinción por current_user tiene que pasar ANTES de tocar pedidos_medicacion, no después: un
-- SELECT … FOR SHARE (o FOR UPDATE) exige privilegio UPDATE sobre la tabla que lockea, no sólo SELECT —
-- así son los locking clauses en Postgres, no es una particularidad de esta migración. La sección 2 le
-- revoca insert/update/delete/truncate a authenticated sobre pedidos_medicacion y le deja sólo select;
-- si un operator hiciera un PATCH directo con pedido_id no nulo y el trigger intentara el FOR SHARE antes
-- de mirar el rol, PostgreSQL rechazaría ESE SELECT con «permission denied for table pedidos_medicacion»
-- (42501, genérico) — falla cerrado igual, pero por un error de Postgres en inglés en vez del mensaje de
-- dominio en castellano que esta migración se toma el trabajo de dar en todos los demás casos. Por eso el
-- chequeo por rol es la PRIMERA rama de la función y el FOR SHARE queda dentro de la rama
-- current_user = 'postgres': a ese punto no sólo llegan create_reception (SECURITY DEFINER, corre como su
-- owner) y el editor SQL — también verify_reception y void_reception (0087, reemplazada en 0113), que son
-- SECURITY DEFINER del mismo owner, y cualquier otra función así que se agregue después: current_user
-- adentro de una SECURITY DEFINER es siempre el dueño, no quien la llamó. Lo que las saca sin lockear no
-- es el rol, es v_toca_pedido (más abajo): da false para un UPDATE que no toca pedido_id/tipo/protocol_id
-- —lo único que le importa a esta función—, que es el caso de esas dos: verify_reception escribe status y
-- verified_by_name (0085:132); void_reception escribe status, voided_at, voided_by, voided_by_name y
-- void_reason. Ninguna toca las tres columnas del pedido, así que ninguna llega al FOR SHARE. Y postgres es DUEÑO de
-- pedidos_medicacion —los dueños de tabla tienen todos los privilegios sobre ella sin necesitar GRANT—,
-- así que el FOR SHARE, cuando sí se llega (create_reception insertando, o un UPDATE de pedido_id/
-- tipo/protocol_id desde el editor SQL), nunca choca con un permiso.
--
-- v_toca_pedido decide si hace falta re-lockear/re-validar: sólo cuando cambia pedido_id, tipo o
-- protocol_id (o es un INSERT). Un UPDATE que sólo toca status/notes/lo que sea —incluida la verificación
-- (verify_reception) o la anulación de base (void_reception, 0087/0113), ambas SECURITY DEFINER— no tiene
-- por qué volver a pedir el pedido: si ese pedido se anuló DESPUÉS de que esta recepción (también anulada)
-- quedó asociada, revalidar en cada UPDATE posterior lo rechazaría para siempre por algo que ya no depende
-- de esta fila.
create or replace function public.validar_pedido_de_recepcion()
returns trigger language plpgsql set search_path = public as $fn$
declare
  v_pedido_protocol uuid;
  v_pedido_anulado  timestamptz;
  v_toca_pedido     boolean;
begin
  v_toca_pedido := (tg_op = 'INSERT')
    or new.pedido_id is distinct from old.pedido_id
    or new.tipo is distinct from old.tipo
    or new.protocol_id is distinct from old.protocol_id;

  if current_user <> 'postgres' then
    -- INSERT directo con pedido: sólo create_reception inserta con pedido_id, y corre SECURITY DEFINER
    -- (current_user = postgres) — cualquier otro INSERT con pedido_id no nulo es un POST directo.
    if tg_op = 'INSERT' and new.pedido_id is not null then
      raise exception 'Una recepción con pedido se carga desde Recepción: no se puede insertar directamente con un pedido asociado.'
        using errcode = '42501';
    end if;

    -- UPDATE sobre una fila CON pedido (antes o después) que le cambie pedido_id, tipo o protocol_id.
    -- Errcode 42501, no check_violation: esto no es un dato inválido —el pedido nuevo podría hasta ser
    -- válido—, es una cuestión de POR QUÉ CAMINO se hace, igual que guard_reception_void (0087/0088)
    -- usa 42501 para «esto se hace desde la app, no con un PATCH directo».
    if tg_op = 'UPDATE' and (old.pedido_id is not null or new.pedido_id is not null) and (
         new.pedido_id  is distinct from old.pedido_id
      or new.tipo        is distinct from old.tipo
      or new.protocol_id is distinct from old.protocol_id
    ) then
      raise exception 'El pedido de una recepción no se cambia por fuera de Recepción.'
        using errcode = '42501';
    end if;

    -- Ninguna de las dos ramas de arriba: no hay pedido de por medio, o el UPDATE no toca ninguna de las
    -- tres columnas (por ejemplo, notes). No hace falta validar nada más — y sobre todo, NO se llega al
    -- FOR SHARE de más abajo, que es justamente lo que este bloque existe para evitar.
    return new;
  end if;

  -- A partir de acá, current_user = 'postgres': create_reception, el editor SQL, o cualquier otra función
  -- SECURITY DEFINER del owner (verify_reception y void_reception incluidas) — para éstas v_toca_pedido da
  -- false, porque ninguna de las dos toca pedido_id/tipo/protocol_id (aunque sí escriben otras columnas:
  -- verify_reception status/verified_by_name, void_reception status/voided_at/voided_by/voided_by_name/
  -- void_reason), así que llegan hasta acá y salen por el if de abajo sin lockear ni validar nada.
  if v_toca_pedido and new.pedido_id is not null then
    -- for share: serializa contra el for update de anular_pedido_medicacion (antes lo sostenía
    -- create_reception; ahora lo sostiene este trigger, que es el único punto de entrada real).
    select pe.protocol_id, pe.anulado_at into v_pedido_protocol, v_pedido_anulado
      from public.pedidos_medicacion pe where pe.id = new.pedido_id for share;
    if not found then
      raise exception 'Ese pedido ya no está' using errcode = 'P0002';
    end if;
    if v_pedido_anulado is not null then
      raise exception 'Ese pedido está anulado: no se puede recibir' using errcode = 'check_violation';
    end if;
    if new.tipo <> 'protocolo' or v_pedido_protocol is distinct from new.protocol_id then
      raise exception 'La recepción tiene que ser del mismo estudio que el pedido' using errcode = 'check_violation';
    end if;
  end if;

  return new;
end;
$fn$;
revoke all on function public.validar_pedido_de_recepcion() from public;

comment on function public.validar_pedido_de_recepcion() is
  'Guarda medication_receptions.pedido_id, pero sólo valida en el INSERT o en el UPDATE que cambia
   pedido_id/tipo/protocol_id (v_toca_pedido) — no en cada INSERT/UPDATE. Primero, por rol: si current_user
   no es postgres (un PATCH/POST directo, no una función del owner), rechaza de entrada un INSERT con
   pedido_id no nulo o un UPDATE que le cambie pedido_id/tipo/protocol_id a una fila con pedido — ANTES de
   tocar pedidos_medicacion, porque el FOR SHARE de la validación de abajo exige privilegio UPDATE sobre
   esa tabla, que authenticated no tiene (sólo select), y fallaría con un permission denied genérico en vez
   del mensaje de dominio. Si current_user = postgres (create_reception, el editor SQL, o cualquier otra
   SECURITY DEFINER del owner como verify_reception/void_reception) y la fila toca su pedido (INSERT, o
   cambia pedido_id/tipo/protocol_id), valida con lock: el pedido existe, no está anulado, y la recepción
   es del mismo estudio (tipo protocolo, mismo protocol_id). Un UPDATE de esas mismas SECURITY DEFINER que
   no toca esas columnas (verify_reception, void_reception) no re-lockea ni revalida: sale por
   v_toca_pedido = false. NO cubre un DELETE de la recepción ni la escritura directa de reception_items
   (hueco previo, permitido por la policy for all de pharma — ver TODOS.md). R9, R10. 0128.';

drop trigger if exists trg_validar_pedido_de_recepcion on public.medication_receptions;
create trigger trg_validar_pedido_de_recepcion
  before insert or update on public.medication_receptions
  for each row execute function public.validar_pedido_de_recepcion();


-- 6 · emitir_pedido_medicacion (R8) --------------------------------------------------------------
-- Todo el pedido en una llamada: cabecera y renglones entran juntos o no entra nada.
-- p_desde/p_hasta: el período para el que se pide. p_emitido_el: el día en hora AR (lo manda el front).
-- p_renglones: [{ "medication_id": uuid, "calculado": int | null, "pedido": int }, …]
create or replace function public.emitir_pedido_medicacion(
  p_protocol_id uuid,
  p_desde       date,
  p_hasta       date,
  p_emitido_el  date,
  p_renglones   jsonb
)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_id     uuid;
  v_numero integer;
  v_nombre text;
  v_r      jsonb;
  v_hoy    date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
begin
  if auth.uid() is null then raise exception 'No autenticado' using errcode = '42501'; end if;
  if not public.has_min_role('pharma', 'operator') then
    raise exception 'No tenés permiso para emitir pedidos' using errcode = '42501';
  end if;
  if p_desde is null or p_hasta is null or p_desde > p_hasta then
    raise exception 'El período del pedido no es válido' using errcode = '22023';
  end if;
  if p_emitido_el is null or p_emitido_el > v_hoy then
    raise exception 'La fecha del pedido no puede ser futura' using errcode = '22023';
  end if;
  if not exists (select 1 from public.protocols pr where pr.id = p_protocol_id and pr.status <> 'cerrado') then
    raise exception 'Ese estudio no existe o está cerrado' using errcode = 'P0002';
  end if;
  if p_renglones is null or jsonb_typeof(p_renglones) <> 'array' or jsonb_array_length(p_renglones) = 0 then
    raise exception 'El pedido está vacío' using errcode = '22023';
  end if;

  select u.full_name into v_nombre from public.users u where u.id = auth.uid();

  insert into public.pedidos_medicacion (protocol_id, periodo_desde, periodo_hasta, emitido_el, emitido_por, emitido_por_nombre)
  values (p_protocol_id, p_desde, p_hasta, p_emitido_el, auth.uid(), v_nombre)
  returning id, numero into v_id, v_numero;

  for v_r in select value from jsonb_array_elements(p_renglones) loop
    if not exists (
      select 1 from public.protocol_medications pmx
       where pmx.protocol_id = p_protocol_id
         and pmx.medication_id = (v_r->>'medication_id')::uuid
    ) then
      raise exception 'Un medicamento del pedido no es de este estudio' using errcode = 'P0002';
    end if;
    if coalesce((v_r->>'pedido')::integer, 0) <= 0 then
      raise exception 'Cada renglón del pedido necesita una cantidad' using errcode = '22023';
    end if;
    insert into public.pedido_medicacion_items (pedido_id, medication_id, calculado, pedido)
    values (v_id, (v_r->>'medication_id')::uuid, (v_r->>'calculado')::integer, (v_r->>'pedido')::integer);
  end loop;

  return jsonb_build_object('id', v_id, 'numero', v_numero);
end;
$fn$;
revoke all on function public.emitir_pedido_medicacion(uuid, date, date, date, jsonb) from public;
grant execute on function public.emitir_pedido_medicacion(uuid, date, date, date, jsonb) to authenticated;


-- 7 · anular_pedido_medicacion (R9) --------------------------------------------------------------
-- Sólo sin recepciones (salvo anuladas): lo que ya entró al estante tiene que poder rastrearse a su pedido.
-- El for update serializa contra trg_validar_pedido_de_recepcion (sección 5), que toma el pedido for share.
create or replace function public.anular_pedido_medicacion(p_pedido_id uuid, p_motivo text)
returns void language plpgsql security definer set search_path = public as $fn$
declare
  v_anulado timestamptz;
  v_nombre  text;
begin
  if auth.uid() is null then raise exception 'No autenticado' using errcode = '42501'; end if;
  if not public.has_min_role('pharma', 'operator') then
    raise exception 'No tenés permiso para anular pedidos' using errcode = '42501';
  end if;
  if p_motivo is null or p_motivo not in ('por_error', 'rehecho') then
    raise exception 'Elegí un motivo para anular' using errcode = '22023';
  end if;

  select pe.anulado_at into v_anulado from public.pedidos_medicacion pe where pe.id = p_pedido_id for update;
  if not found then
    raise exception 'Ese pedido ya no está' using errcode = 'P0002';
  end if;
  if v_anulado is not null then
    raise exception 'Ese pedido ya está anulado' using errcode = '23514';
  end if;
  if exists (select 1 from public.medication_receptions mr where mr.pedido_id = p_pedido_id and mr.status <> 'anulada') then
    raise exception 'Este pedido ya tiene recepciones: no se puede anular' using errcode = '23514';
  end if;

  select u.full_name into v_nombre from public.users u where u.id = auth.uid();
  update public.pedidos_medicacion pe
     set anulado_at = now(), anulado_por_nombre = v_nombre, anulado_motivo = p_motivo
   where pe.id = p_pedido_id;
end;
$fn$;
revoke all on function public.anular_pedido_medicacion(uuid, text) from public;
grant execute on function public.anular_pedido_medicacion(uuid, text) to authenticated;


-- 8 · cerrar_faltante_pedido: «No va a llegar» (R11) ---------------------------------------------
create or replace function public.cerrar_faltante_pedido(p_item_id uuid, p_motivo text)
returns void language plpgsql security definer set search_path = public as $fn$
declare
  v_item     public.pedido_medicacion_items%rowtype;
  v_anulado  timestamptz;
  v_recibido integer;
  v_nombre   text;
begin
  if auth.uid() is null then raise exception 'No autenticado' using errcode = '42501'; end if;
  if not public.has_min_role('pharma', 'operator') then
    raise exception 'No tenés permiso para cerrar lo que falta de un pedido' using errcode = '42501';
  end if;
  if p_motivo is null or p_motivo not in ('no_lo_tiene', 'discontinuado', 'no_hace_falta') then
    raise exception 'Elegí un motivo' using errcode = '22023';
  end if;

  select * into v_item from public.pedido_medicacion_items it where it.id = p_item_id for update;
  if not found then
    raise exception 'Ese renglón ya no está' using errcode = 'P0002';
  end if;
  -- for share: mismo criterio que el resto de las funciones que leen un pedido antes de decidir (sección
  -- 5 y 7) — serializa contra anular_pedido_medicacion, que lo toma for update.
  select pe.anulado_at into v_anulado from public.pedidos_medicacion pe where pe.id = v_item.pedido_id for share;
  if v_anulado is not null then
    raise exception 'Ese pedido está anulado' using errcode = '23514';
  end if;
  if v_item.cerrado_at is not null then
    raise exception 'Lo que falta de ese renglón ya está cerrado' using errcode = '23514';
  end if;

  select coalesce(sum(ri.quantity), 0)::integer into v_recibido
    from public.reception_items ri
    join public.medication_receptions mr on mr.id = ri.reception_id
   where mr.pedido_id = v_item.pedido_id
     and mr.status = 'verificada'
     and ri.medication_id = v_item.medication_id;
  if v_recibido >= v_item.pedido then
    raise exception 'Ese renglón ya se recibió entero' using errcode = '23514';
  end if;

  select u.full_name into v_nombre from public.users u where u.id = auth.uid();
  update public.pedido_medicacion_items it
     set cerrado_at = now(), cerrado_por_nombre = v_nombre, cerrado_motivo = p_motivo
   where it.id = p_item_id;
end;
$fn$;
revoke all on function public.cerrar_faltante_pedido(uuid, text) from public;
grant execute on function public.cerrar_faltante_pedido(uuid, text) to authenticated;


-- 9 · create_reception con pedido (R10) ----------------------------------------------------------
-- Cuerpo de la 0040 sin cambios, más la columna pedido_id en el insert. La validación del pedido (existe,
-- no anulado, mismo estudio) YA NO vive acá: la hace trg_validar_pedido_de_recepcion (sección 5) sobre
-- medication_receptions, así que también cubre un INSERT/UPDATE directo de PostgREST por fuera de esta
-- función — que es exactamente lo que esta función, sola, no podía cubrir.
drop function if exists public.create_reception(public.reception_kind, uuid, date, text, jsonb);

create or replace function public.create_reception(
  p_tipo           public.reception_kind,
  p_protocol_id    uuid,
  p_reception_date date,
  p_notes          text,
  p_items          jsonb,
  p_pedido_id      uuid default null
)
returns uuid language plpgsql security definer set search_path = public as $fn$
declare
  v_id   uuid;
  v_item jsonb;
begin
  if not public.has_min_role('pharma','leader') then raise exception 'Sin permiso para crear recepciones' using errcode = '42501'; end if;
  if (p_tipo = 'ambulatoria') <> (p_protocol_id is null) then
    raise exception 'El tipo % es incompatible con el protocolo indicado', p_tipo using errcode = 'check_violation';
  end if;

  insert into public.medication_receptions (tipo, protocol_id, received_by, reception_date, status, notes, pedido_id)
  values (p_tipo, p_protocol_id, auth.uid(), p_reception_date, 'pendiente', p_notes, p_pedido_id)
  returning id into v_id;
  for v_item in select * from jsonb_array_elements(p_items) loop
    -- Asignación = consecuencia de recibir (0040): si no estaba asociado, se asocia acá.
    -- Ambulatoria (protocol_id null) no asocia.
    if p_protocol_id is not null then
      insert into public.protocol_medications (protocol_id, medication_id)
      values (p_protocol_id, (v_item->>'medication_id')::uuid)
      on conflict (protocol_id, medication_id) do nothing;
    end if;
    insert into public.reception_items (reception_id, medication_id, lot_number, expiry_date, quantity)
    values (v_id, (v_item->>'medication_id')::uuid, v_item->>'lot_number',
            nullif(v_item->>'expiry_date','')::date, (v_item->>'quantity')::integer);
  end loop;
  return v_id;
end;
$fn$;
revoke all on function public.create_reception(public.reception_kind, uuid, date, text, jsonb, uuid) from public;
grant execute on function public.create_reception(public.reception_kind, uuid, date, text, jsonb, uuid) to authenticated;


-- 10 · reposicion_del_periodo: los datos crudos de la pantalla (D11, R3, R6) ----------------------
-- La FORMA del JSON es la de InsumosDelPeriodo en src/data/pharma/reposicionPeriodoModel.ts: si se
-- cambia una, se cambia la otra. SECURITY DEFINER porque Farmacia no tiene select sobre patient_visits
-- (0006:162): una vista security_invoker le devolvería cero pacientes sin ningún error.
-- Los bordes del período los manda el front en hora AR (current_date en Supabase es UTC), y los
-- movimientos se cortan por su día EN HORA AR: uno de las 23:30 del día de corte es de ese período.
-- Sin p_hoy: la función nunca lo necesitó —el corte lo hacen p_desde/p_hasta solos—, así que no está en
-- la firma (se sacó en el fix de review; nunca se aplicó con él, no hay firma vieja que conviva).
-- p_protocol_id null = todos los estudios no cerrados (la grilla); con valor = uno (la pantalla del estudio).
drop function if exists public.reposicion_del_periodo(date, date, date, uuid);

create or replace function public.reposicion_del_periodo(
  p_desde       date,
  p_hasta       date,
  p_protocol_id uuid default null
)
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare
  v_resultado jsonb;
begin
  if auth.uid() is null then raise exception 'No autenticado' using errcode = '42501'; end if;
  if not (public.has_min_role('pharma', 'viewer') or public.has_module('gerencia')) then
    raise exception 'No tenés permiso para ver la reposición' using errcode = '42501';
  end if;
  if p_desde is null or p_hasta is null or p_desde > p_hasta then
    raise exception 'El período no es válido' using errcode = '22023';
  end if;

  with
  estudios as (
    select p.id, p.code, p.name, p.status::text as status
      from public.protocols p
     where p.status <> 'cerrado'
       and (p_protocol_id is null or p.id = p_protocol_id)
  ),
  -- Movimientos de protocolo con su día en hora AR. El protocolo sale del LOTE: stock_movements no lo
  -- tiene (D32). Un ajuste sin lote no se puede atribuir a un estudio y queda afuera.
  movs as (
    select ml.protocol_id, sm.medication_id, sm.movement_type, sm.quantity_delta, sm.reference_type,
           sm.reference_id,
           (sm.created_at at time zone 'America/Argentina/Buenos_Aires')::date as dia
      from public.stock_movements sm
      join public.medication_lots ml on ml.id = sm.lot_id
      join estudios es on es.id = ml.protocol_id
     where ml.tipo = 'protocolo'
  ),
  -- Lo dispensado por enrolamiento: «ya retiró» (D14), dicho del período.
  retiros as (
    select mv.medication_id, dr.enrollment_id, -mv.quantity_delta as neto, mv.dia
      from movs mv
      left join public.dispensations d on d.id = mv.reference_id
      left join public.dispensation_requests dr on dr.id = d.request_id
     where mv.reference_type = 'dispensation'
       and mv.movement_type in ('dispensacion', 'devolucion')
  ),
  renglones as (
    select pmx.id as protocol_medication_id, pmx.protocol_id, pmx.medication_id,
           m.name as medication_name, m.unit as presentacion, m.drug_id,
           pmx.reposicion_modo as modo, pmx.envases_por_mes, pmx.stock_fijo
      from public.protocol_medications pmx
      join estudios es on es.id = pmx.protocol_id
      join public.medications m on m.id = pmx.medication_id
  ),
  cronograma as (
    select pv.enrollment_id, max(pv.estimated_date) as ultima
      from public.patient_visits pv
      join public.visit_definitions vd on vd.id = pv.visit_def_id
      join public.enrollments e on e.id = pv.enrollment_id
      join estudios es on es.id = e.protocol_id
     where pv.kind = 'programada'
       and vd.date_mode = 'automatica'
     group by pv.enrollment_id
  ),
  pacientes as (
    select pm.id as patient_medication_id, pm.enrollment_id, e.protocol_id, pm.medication_id, m.drug_id,
           pa.full_name as patient_name, e.status::text as enrollment_status,
           pm.envases_por_mes, pm.habilitacion_id, pm.created_at as asignado_el,
           (cr.enrollment_id is not null) as tiene_cronograma, cr.ultima as ultima_programada,
           coalesce((select sum(rt.neto) from retiros rt
                      where rt.enrollment_id = pm.enrollment_id and rt.medication_id = pm.medication_id
                        and rt.dia between p_desde and p_hasta), 0)::integer as retirado_periodo,
           (select max(rt.dia) from retiros rt
             where rt.enrollment_id = pm.enrollment_id and rt.medication_id = pm.medication_id
               and rt.neto > 0) as ultimo_retiro
      from public.patient_medications pm
      join public.enrollments e on e.id = pm.enrollment_id
      join estudios es on es.id = e.protocol_id
      join public.patients pa on pa.id = e.patient_id
      join public.medications m on m.id = pm.medication_id
      left join cronograma cr on cr.enrollment_id = pm.enrollment_id
     where pm.active
  ),
  -- Vencidos incluidos: el libro cuenta lo físico y la boleta filtra lo vigente en TypeScript.
  lotes as (
    select ml.protocol_id, ml.medication_id, ml.lot_number, ml.expiry_date, ml.quantity_on_hand as quantity
      from public.medication_lots ml
      join estudios es on es.id = ml.protocol_id
     where ml.tipo = 'protocolo'
       and ml.quantity_on_hand > 0
  ),
  movimientos as (
    select mv.protocol_id, mv.medication_id,
           coalesce(sum(mv.quantity_delta) filter (
             where mv.movement_type in ('recepcion', 'anulacion_recepcion') and mv.dia <= p_hasta), 0)::integer as entro,
           coalesce(-sum(mv.quantity_delta) filter (
             where mv.movement_type in ('dispensacion', 'devolucion') and mv.dia <= p_hasta), 0)::integer as salio,
           coalesce(sum(mv.quantity_delta) filter (
             where mv.movement_type in ('ajuste_manual', 'reasignacion', 'vencimiento') and mv.dia <= p_hasta), 0)::integer as ajustes,
           coalesce(sum(mv.quantity_delta), 0)::integer as desde_inicio
      from movs mv
     where mv.dia >= p_desde
     group by mv.protocol_id, mv.medication_id
  ),
  pedidos as (
    select pe.id, pe.numero, pe.protocol_id, pe.periodo_desde, pe.periodo_hasta, pe.emitido_el,
           pe.emitido_por_nombre, pe.anulado_at, pe.anulado_por_nombre, pe.anulado_motivo
      from public.pedidos_medicacion pe
      join estudios es on es.id = pe.protocol_id
  ),
  pedido_items as (
    select it.id, it.pedido_id, it.medication_id, m.name as medication_name, m.unit as presentacion,
           it.calculado, it.pedido, it.cerrado_at, it.cerrado_por_nombre, it.cerrado_motivo,
           coalesce((select sum(ri.quantity) from public.reception_items ri
                       join public.medication_receptions mr on mr.id = ri.reception_id
                      where mr.pedido_id = it.pedido_id and mr.status = 'verificada'
                        and ri.medication_id = it.medication_id), 0)::integer as recibido,
           coalesce((select sum(ri.quantity) from public.reception_items ri
                       join public.medication_receptions mr on mr.id = ri.reception_id
                      where mr.pedido_id = it.pedido_id and mr.status = 'pendiente'
                        and ri.medication_id = it.medication_id), 0)::integer as sin_verificar
      from public.pedido_medicacion_items it
      join pedidos pe on pe.id = it.pedido_id
      join public.medications m on m.id = it.medication_id
  ),
  sin_medicacion as (
    select e.protocol_id, count(*)::integer as enrolamientos
      from public.enrollments e
      join estudios es on es.id = e.protocol_id
     where e.status in ('screening', 'activo')
       and not exists (
         select 1 from public.patient_medications pm
          where pm.enrollment_id = e.id and pm.active and pm.habilitacion_id is null)
     group by e.protocol_id
  )
  select jsonb_build_object(
    'estudios',       coalesce((select jsonb_agg(to_jsonb(x)) from estudios x), '[]'::jsonb),
    'renglones',      coalesce((select jsonb_agg(to_jsonb(x)) from renglones x), '[]'::jsonb),
    'pacientes',      coalesce((select jsonb_agg(to_jsonb(x)) from pacientes x), '[]'::jsonb),
    'lotes',          coalesce((select jsonb_agg(to_jsonb(x)) from lotes x), '[]'::jsonb),
    'movimientos',    coalesce((select jsonb_agg(to_jsonb(x)) from movimientos x), '[]'::jsonb),
    'pedidos',        coalesce((select jsonb_agg(to_jsonb(x)) from pedidos x), '[]'::jsonb),
    'pedido_items',   coalesce((select jsonb_agg(to_jsonb(x)) from pedido_items x), '[]'::jsonb),
    'sin_medicacion', coalesce((select jsonb_agg(to_jsonb(x)) from sin_medicacion x), '[]'::jsonb)
  ) into v_resultado;

  return v_resultado;
end;
$fn$;
revoke all on function public.reposicion_del_periodo(date, date, uuid) from public;
grant execute on function public.reposicion_del_periodo(date, date, uuid) to authenticated;
