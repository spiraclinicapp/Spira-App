-- Spira · Migración 0043 — Pharma: clase / indicación del medicamento (campo propio)
-- Aplicar A MANO en el SQL Editor (como postgres), después de la 0042. IDEMPOTENTE.
-- ----------------------------------------------------------------------------
-- El formulario "Registrar medicación" (rediseño 7a) suma un campo Clase / Indicación
-- (ej. ICS/LABA, IMP de estudio). Es metadato del medicamento del catálogo global. Se guarda
-- como texto opcional y se ofrece por desplegable con buscador (valores distintos ya cargados).
-- ============================================================================

-- 1 · Campo clase (opcional) -------------------------------------------------
alter table public.medications add column if not exists clase text;
comment on column public.medications.clase is 'Clase / indicación (ej. ICS/LABA, IMP de estudio). Opcional. 0043.';

-- 2 · create_medication acepta la clase (cambia la firma → drop + recreate; default null compat) --
drop function if exists public.create_medication(uuid, text, text, integer, text, uuid, text);
create or replace function public.create_medication(
  p_drug_id uuid, p_name text, p_unit text, p_low_stock_threshold integer default 5,
  p_gtin text default null, p_laboratorio_id uuid default null, p_dosis text default null,
  p_clase text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.has_min_role('pharma','leader') then raise exception 'Sin permiso para crear medicamentos' using errcode = '42501'; end if;
  insert into public.medications (drug_id, name, unit, low_stock_threshold, laboratorio_id, dosis, clase, created_by)
  values (p_drug_id, p_name, p_unit, p_low_stock_threshold, p_laboratorio_id,
          nullif(btrim(coalesce(p_dosis, '')), ''), nullif(btrim(coalesce(p_clase, '')), ''), auth.uid())
  returning id into v_id;
  if p_gtin is not null and btrim(p_gtin) <> '' then
    insert into public.medication_codes (medication_id, code, code_type) values (v_id, btrim(p_gtin), 'ean13');
  end if;
  return v_id;
end;
$$;
comment on function public.create_medication is 'Alta de medicamento global (+ GTIN, laboratorio, dosis y clase opcionales). pharma leader+. SECURITY DEFINER. 0043.';

grant execute on function
  public.create_medication(uuid, text, text, integer, text, uuid, text, text)
  to authenticated;
