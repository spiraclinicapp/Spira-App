-- ============================================================================
-- 0085 — Recepción: folio legible y nombre de quien verifica
--
-- Las dos columnas que el reskin de Recepción (handoff "2c") muestra en la card y que hoy no
-- existen en ningún lado. Ver docs/plan-recepcion-reskin-2c.md, decisiones D1 y D2.
--
--   1. medication_receptions.folio — entero correlativo, legible y dictable. Hoy una recepción
--      solo se identifica por su uuid, que no sirve para hablar por teléfono ni para que un
--      monitor la pida por número. Secuencia + backfill de las existentes por orden de carga
--      (created_at): reception_date se repite y además es retroactivo, así que no ordena.
--
--   2. medication_receptions.verified_by_name — snapshot del nombre, NO un join a users.
--      La policy de users es `id = auth.uid() or has_module('gerencia')` (0006:82), así que la
--      farmacéutica vería su propio nombre y NULL en todo lo que verificó otra persona. Es el
--      cuarto lugar donde muerde el mismo muro y se resuelve como las tres anteriores
--      (author_name en 0048, coordinator_name en 0065, las tres columnas de 0082/0084).
--      Lo escribe verify_reception, que ya es SECURITY DEFINER y sí puede leer users.
--
-- Sellado en el momento del hecho, a propósito: si alguien cambia su nombre después, el registro
-- sigue diciendo quién ingresó ese stock ese día. Es lo que corresponde a un dato auditable.
--
-- ORDEN DE DESPLIEGUE: esta migración va PRIMERO, antes del front. Es puramente ADITIVA — dos
-- columnas escalares que ningún front desplegado consulta —, así que el que no funciona sin ella
-- es el código nuevo. NO agrega ninguna FK, de modo que no toca ningún embed de PostgREST
-- (el incidente de la 0076).
--
-- APLICAR A MANO en el SQL Editor de Supabase (rol postgres), en orden, DESPUÉS de la 0084.
-- IDEMPOTENTE: cada sentencia se puede repetir. Registrar en supabase/README.md al confirmarse.
-- ============================================================================


-- 1 · Folio ------------------------------------------------------------------

create sequence if not exists public.medication_reception_folio_seq;

alter table public.medication_receptions add column if not exists folio integer;

comment on column public.medication_receptions.folio is
  'Número correlativo y legible de la recepción (se muestra como "Nº 1043"). Identificador para hablar, dictar y auditar; el uuid no sirve para eso. 0085.';


-- Backfill de las existentes. Numera SOLO las que están sin folio, continuando desde el máximo
-- ya asignado, y en orden de carga. Repetir el bloque no las renumera: sin filas en null, el
-- update no toca nada.
with base as (
  select coalesce(max(r.folio), 0) as desde
    from public.medication_receptions r
),
pendientes as (
  select r.id, row_number() over (order by r.created_at, r.id) as rn
    from public.medication_receptions r
   where r.folio is null
)
update public.medication_receptions r
   set folio = base.desde + pendientes.rn
  from base, pendientes
 where r.id = pendientes.id;


-- La secuencia arranca donde terminó el backfill. is_called en false ⇒ el próximo nextval
-- devuelve EXACTAMENTE este número (con la tabla vacía, el 1).
select setval(
  'public.medication_reception_folio_seq',
  coalesce((select max(r.folio) from public.medication_receptions r), 0) + 1,
  false
);

alter table public.medication_receptions
  alter column folio set default nextval('public.medication_reception_folio_seq');

alter table public.medication_receptions alter column folio set not null;

-- Ligar la secuencia a la columna: si algún día se borra la columna, la secuencia se va con ella.
alter sequence public.medication_reception_folio_seq
  owned by public.medication_receptions.folio;

create unique index if not exists ux_medication_receptions_folio
  on public.medication_receptions (folio);


-- 2 · Nombre de quien verifica ------------------------------------------------

alter table public.medication_receptions add column if not exists verified_by_name text;

comment on column public.medication_receptions.verified_by_name is
  'Snapshot del nombre de quien verificó (la RLS de users oculta las filas ajenas → no se puede joinear; lo escribe verify_reception, que es SECURITY DEFINER). null = todavía sin verificar. 0085.';


-- Backfill de las ya verificadas. Corre como owner en el editor SQL, así que la RLS de users
-- no aplica acá y sí resuelve todos los nombres.
update public.medication_receptions r
   set verified_by_name = u.full_name
  from public.users u
 where u.id = r.verified_by
   and r.verified_by_name is null;


-- 3 · verify_reception resuelve el nombre al sellar ---------------------------
-- MISMA FIRMA que la 0032: create or replace la reemplaza de verdad. Si le agregáramos un
-- parámetro quedaría una sobrecarga viva y las llamadas de un solo argumento seguirían yendo a
-- la función vieja, en silencio.
create or replace function public.verify_reception(p_reception_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_status reception_status;
  v_name   text;
begin
  if not public.has_min_role('pharma','leader') then
    raise exception 'Sin permiso para verificar recepciones' using errcode = '42501';
  end if;

  select r.status into v_status
    from public.medication_receptions r
   where r.id = p_reception_id
     for update;

  if v_status is null then
    raise exception 'Recepción % inexistente', p_reception_id using errcode = 'foreign_key_violation';
  end if;
  if v_status <> 'pendiente' then
    raise exception 'La recepción % no está pendiente (está %)', p_reception_id, v_status
      using errcode = 'check_violation';
  end if;

  -- El que verifica es siempre el usuario actual (el trigger sella verified_by con auth.uid()),
  -- así que alcanza con resolver su propio nombre. Columnas calificadas: en plpgsql un nombre
  -- suelto puede resolverse contra una variable en vez de contra la columna (trampas 0056/0058).
  select u.full_name into v_name
    from public.users u
   where u.id = auth.uid();

  update public.medication_receptions
     set status           = 'verificada',
         verified_by_name = v_name
   where id = p_reception_id;
  -- los triggers set_reception_verified (sella verified_by/verified_at) + apply_reception_stock
  -- (ingresa el stock) hacen el resto, igual que antes
end;
$$;

comment on function public.verify_reception is
  'Verifica una recepción pendiente (una sola vez) → los triggers ingresan stock. Sella el nombre de quien verifica (0085). pharma leader+. SECURITY DEFINER. 0032.';
