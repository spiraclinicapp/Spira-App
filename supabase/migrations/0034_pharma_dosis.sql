-- Spira · Migración 0034 — Pharma: dosis del medicamento (campo propio)
-- ----------------------------------------------------------------------------
-- La dosis / concentración (ej. '100 mcg', '160/4,5 mcg') vivía pegada al nombre. La separamos a
-- un campo propio para registrarla como dato y ofrecerla por desplegable en el alta. El `name`
-- sigue compuesto (comercial + dosis) para no romper los desplegables que muestran el nombre.
--
-- IDEMPOTENTE. Aplicar a mano en el SQL Editor (como postgres), después de la 0033.
-- ============================================================================

-- 1 · Campo dosis (opcional) -------------------------------------------------
alter table public.medications add column if not exists dosis text;
comment on column public.medications.dosis is 'Dosis / concentración (ej. 100 mcg). Opcional; el name la incluye para mostrar. 0034.';

-- 2 · create_medication acepta la dosis (cambia la firma → drop + recreate; default null compat) ---
drop function if exists public.create_medication(uuid, text, text, integer, text, uuid);
create or replace function public.create_medication(
  p_drug_id uuid, p_name text, p_unit text, p_low_stock_threshold integer default 5,
  p_gtin text default null, p_laboratorio_id uuid default null, p_dosis text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.has_min_role('pharma','leader') then raise exception 'Sin permiso para crear medicamentos' using errcode = '42501'; end if;
  insert into public.medications (drug_id, name, unit, low_stock_threshold, laboratorio_id, dosis, created_by)
  values (p_drug_id, p_name, p_unit, p_low_stock_threshold, p_laboratorio_id,
          nullif(btrim(coalesce(p_dosis, '')), ''), auth.uid())
  returning id into v_id;
  if p_gtin is not null and btrim(p_gtin) <> '' then
    insert into public.medication_codes (medication_id, code, code_type) values (v_id, btrim(p_gtin), 'ean13');
  end if;
  return v_id;
end;
$$;
comment on function public.create_medication is 'Alta de medicamento global (+ GTIN, laboratorio y dosis opcionales). pharma leader+. SECURITY DEFINER. 0034.';

grant execute on function
  public.create_medication(uuid, text, text, integer, text, uuid, text)
  to authenticated;
