-- Spira · Migración 0038 — Pharma: Producto de Investigación (IP) por INGRESO MACRO (cantidad).
-- Aplicar A MANO en el SQL Editor (como postgres), después de la 0037. IDEMPOTENTE.
-- ============================================================================
-- CAMBIO DE MODELO (definición del Director Médico):
--   El IP se recibe MACRO por cargamento (una carga = una cantidad total), NO kit por kit.
--   La trazabilidad por kit la provee el sponsor/IRT; Spira no la duplica ("sin paralelismo").
--   → El IP pasa a llevarse por CANTIDAD por protocolo. La tabla ip_units (0037, por unidad)
--     queda DORMIDA (no se usa; no se dropea por regla de datos reales — ver §5).
--   Alcance: solo el ámbito 'investigacion'. La recepción de base (protocolo/ambulatoria) NO cambia.
-- ============================================================================

-- 1 · Columnas macro en medication_receptions (solo se completan en tipo='investigacion').
alter table public.medication_receptions
  add column if not exists coordinator_id   uuid references public.users(id) on delete restrict,
  add column if not exists temperature_ok    boolean,
  add column if not exists total_kits        integer,
  add column if not exists kit_range_from    text,
  add column if not exists kit_range_to      text,
  add column if not exists storage_location  text,
  add column if not exists docs_signed       boolean,
  add column if not exists irt_notified      boolean,
  add column if not exists started_at        timestamptz;

comment on column public.medication_receptions.coordinator_id  is 'Coordinador responsable del control cruzado (IP macro, 0038).';
comment on column public.medication_receptions.temperature_ok  is 'Control de temperatura OK al recibir. Una recepción con excursión NO se crea (se bloquea). 0038.';
comment on column public.medication_receptions.total_kits      is 'Cantidad total de kits del cargamento (IP macro). 0038.';
comment on column public.medication_receptions.storage_location is 'Destino físico: heladera | estante | ambiente (IP macro). 0038.';
comment on column public.medication_receptions.started_at      is 'Inicio administrativo del proceso de recepción (IP macro). 0038.';

-- Checks idempotentes (add-if-not-exists vía pg_constraint).
-- total_kits: si viene, positivo. NO se exige NOT NULL para IP acá porque puede haber recepciones
-- de IP VIEJAS (modelo por-unidad 0037) con total_kits NULL; esas quedan toleradas (y se excluyen del
-- stock nuevo en v_ip_stock, ver §4). La obligatoriedad de total_kits>0 en las recepciones MACRO
-- nuevas la garantiza el RPC create_ip_reception (§3).
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'medication_receptions_total_kits_chk') then
    alter table public.medication_receptions
      add constraint medication_receptions_total_kits_chk
      check (total_kits is null or total_kits > 0);
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'medication_receptions_storage_location_chk') then
    alter table public.medication_receptions
      add constraint medication_receptions_storage_location_chk
      check (storage_location is null or storage_location in ('heladera','estante','ambiente'));
  end if;
end $$;

-- 2 · Baja del modelo por-unidad: la vista de stock por unidad y el RPC de alta por unidad.
--     (Objetos sin datos; seguros de dropear. La TABLA ip_units NO se dropea — ver §5.)
drop view if exists public.v_ip_units;
drop function if exists public.create_ip_reception(uuid, date, text, jsonb);

-- 3 · RPC create_ip_reception (firma MACRO): crea UNA recepción de IP ya finalizada.
--     El doble-check del wizard (documentación firmada + IRT) ES la verificación → se crea
--     directamente 'verificada' (sella verified_by/at). No inserta unidades. Atómico, leader+.
--     El stock NO necesita trigger: es la agregación de las recepciones verificadas (ver §4).
create or replace function public.create_ip_reception(
  p_protocol_id     uuid,
  p_coordinator_id  uuid,
  p_reception_date  date,
  p_total_kits      integer,
  p_kit_range_from  text,
  p_kit_range_to    text,
  p_storage_location text,
  p_started_at      timestamptz,
  p_notes           text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.has_min_role('pharma','leader') then
    raise exception 'Sin permiso para crear recepciones de investigación' using errcode = '42501';
  end if;
  if p_protocol_id is null then
    raise exception 'El Producto de Investigación requiere un protocolo' using errcode = 'check_violation';
  end if;
  if p_total_kits is null or p_total_kits <= 0 then
    raise exception 'La cantidad total de kits debe ser mayor a cero' using errcode = 'check_violation';
  end if;
  if p_storage_location is null or p_storage_location not in ('heladera','estante','ambiente') then
    raise exception 'Ubicación de almacenamiento inválida' using errcode = 'check_violation';
  end if;

  insert into public.medication_receptions (
    tipo, protocol_id, received_by, reception_date, status, verified_by, verified_at, notes,
    coordinator_id, temperature_ok, total_kits, kit_range_from, kit_range_to,
    storage_location, docs_signed, irt_notified, started_at)
  values (
    'investigacion', p_protocol_id, auth.uid(), p_reception_date, 'verificada', auth.uid(), now(), p_notes,
    p_coordinator_id, true, p_total_kits,
    nullif(btrim(coalesce(p_kit_range_from,'')),''), nullif(btrim(coalesce(p_kit_range_to,'')),''),
    p_storage_location, true, true, coalesce(p_started_at, now()))
  returning id into v_id;

  return v_id;
end;
$$;
grant execute on function public.create_ip_reception(
  uuid, uuid, date, integer, text, text, text, timestamptz, text) to authenticated;

-- 4 · Vista de stock del IP por CANTIDAD: total de kits recibidos por protocolo (recepciones
--     verificadas). La dispensación (Tajada 2) restará cuando exista. security_invoker → RLS del que consulta.
create or replace view public.v_ip_stock with (security_invoker = true) as
select
  r.protocol_id,
  p.code                       as protocol_code,
  p.name                       as protocol_name,
  count(*)::int                as recepciones,
  coalesce(sum(r.total_kits), 0)::int as total_kits
from public.medication_receptions r
join public.protocols p on p.id = r.protocol_id
-- total_kits not null excluye las recepciones de IP VIEJAS (modelo por-unidad, sin cantidad) para
-- que no ensucien el stock macro (aparecerían con recepciones>0 y total 0).
where r.tipo = 'investigacion' and r.status = 'verificada' and r.total_kits is not null
group by r.protocol_id, p.code, p.name;
comment on view public.v_ip_stock is 'Stock de IP por CANTIDAD: total de kits recibidos por protocolo (recepciones verificadas). La dispensación (Tajada 2) restará. 0038.';

-- 5 · Listado de coordinadores de un protocolo para el selector de la recepción IP.
--     SECURITY DEFINER porque la RLS de users/protocol_coordinators aísla a Track y no deja a
--     pharma leerlas directo (0006). Acá se expone SOLO id + nombre de los coordinadores del
--     protocolo, y solo a pharma/gerencia. No es dato sensible (personal del centro, no paciente).
create or replace function public.list_protocol_coordinators(p_protocol_id uuid)
returns table (id uuid, full_name text)
language plpgsql security definer set search_path = public stable as $$
begin
  if not (public.has_module('pharma') or public.has_module('gerencia')) then
    raise exception 'Sin permiso' using errcode = '42501';
  end if;
  return query
    select u.id, u.full_name
      from public.protocol_coordinators pc
      join public.users u on u.id = pc.user_id
     where pc.protocol_id = p_protocol_id and u.is_active
     order by u.full_name;
end;
$$;
grant execute on function public.list_protocol_coordinators(uuid) to authenticated;

-- 6 · ip_units queda DORMIDA (deprecada por el pivote a cantidad). NO se dropea: la tabla puede
--     tener FKs y la regla de datos reales manda no borrar a ciegas. Si se confirma vacía en prod,
--     se puede dropear en una migración posterior. La rama IP del trigger apply_reception_stock
--     (0037) queda inofensiva: las recepciones IP macro se crean directamente 'verificada' por INSERT,
--     así que el trigger AFTER UPDATE ni se dispara.
comment on table public.ip_units is 'DEPRECADA (0038): el IP pasó a ingreso macro por cantidad. Tabla dormida, sin uso. Ver v_ip_stock.';
