-- Spira · Migración 0039 — Pharma IP macro: unificar 'estante' en 'ambiente'.
-- Aplicar A MANO en el SQL Editor (como postgres), después de la 0038. IDEMPOTENTE.
-- Decisión del Director: 'estante' y 'temperatura ambiente' son lo mismo operativamente → una sola
-- opción de almacenamiento. Quedan: 'heladera' | 'ambiente'.
-- ============================================================================

-- 1 · Convertir cualquier 'estante' existente a 'ambiente' (defensivo; el flujo macro recién arranca).
update public.medication_receptions set storage_location = 'ambiente' where storage_location = 'estante';

-- 2 · CHECK de storage_location: ahora solo heladera | ambiente. drop-then-add = idempotente.
alter table public.medication_receptions drop constraint if exists medication_receptions_storage_location_chk;
alter table public.medication_receptions
  add constraint medication_receptions_storage_location_chk
  check (storage_location is null or storage_location in ('heladera','ambiente'));

-- 3 · RPC create_ip_reception: mismo cuerpo/firma que la 0038, con la validación de ubicación acotada
--     a heladera|ambiente. create or replace conserva el grant (firma idéntica); igual lo re-otorgamos.
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
  if p_storage_location is null or p_storage_location not in ('heladera','ambiente') then
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
