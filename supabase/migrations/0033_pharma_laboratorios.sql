-- Spira · Migración 0033 — Pharma: laboratorios + autodetección por prefijo de código de barra
-- ----------------------------------------------------------------------------
-- Suma el LABORATORIO al catálogo de medicación. El laboratorio se necesita firme para la
-- dispensación (decidir por droga/marca). No hay fuente gratis con el laboratorio en bloque, pero
-- el GTIN lo lleva escondido: el prefijo de empresa GS1 (después del 779 de Argentina) identifica
-- al laboratorio. Lo aprendemos on-demand, igual que medication_codes: un prefijo → un laboratorio.
--
-- IDEMPOTENTE (if not exists + guardas). Aplicar a mano en el SQL Editor (como postgres), después
-- de la 0032. ORDEN: tablas nuevas → ALTER medications(add laboratorio_id) → RLS/grants → RPCs
-- (create_laboratorio + redefinir create_medication) → índices/auditoría.
-- ============================================================================

-- 1 · Laboratorio / titular (catálogo global) --------------------------------
create table if not exists public.laboratorios (
  id         uuid primary key default uuid_generate_v4(),
  name       text not null unique,
  created_at timestamptz not null default now()
);
comment on table public.laboratorios is 'Laboratorio / titular del medicamento. Catálogo global, transversal a protocolos. 0033.';

-- 2 · medications gana laboratorio_id (opcional: se completa al alta o se aprende) ----
alter table public.medications add column if not exists laboratorio_id uuid references public.laboratorios(id) on delete set null;

-- 3 · Prefijo de código de barra → laboratorio (autodetección; espejo de medication_codes) ----
create table if not exists public.laboratorio_codes (
  id             uuid primary key default uuid_generate_v4(),
  prefix         text not null unique,
  laboratorio_id uuid not null references public.laboratorios(id) on delete cascade,
  created_at     timestamptz not null default now()
);
comment on table public.laboratorio_codes is 'Prefijo de empresa GS1 (inicio del GTIN) → laboratorio. Se aprende al escanear. prefix único. 0033.';


-- 4 · RLS + grants (espejo de medication_codes: ven pharma/gerencia/contable; administra operator+)
alter table public.laboratorios     enable row level security;
alter table public.laboratorio_codes enable row level security;

drop policy if exists "ver laboratorios" on public.laboratorios;
create policy "ver laboratorios" on public.laboratorios for select
  using (public.has_module('pharma') or public.has_module('gerencia') or public.has_module('contable'));
drop policy if exists "pharma administra laboratorios" on public.laboratorios;
create policy "pharma administra laboratorios" on public.laboratorios for all
  using (public.has_min_role('pharma','operator')) with check (public.has_min_role('pharma','operator'));

drop policy if exists "ver prefijos lab" on public.laboratorio_codes;
create policy "ver prefijos lab" on public.laboratorio_codes for select
  using (public.has_module('pharma') or public.has_module('gerencia'));
drop policy if exists "pharma administra prefijos lab" on public.laboratorio_codes;
create policy "pharma administra prefijos lab" on public.laboratorio_codes for all
  using (public.has_min_role('pharma','operator')) with check (public.has_min_role('pharma','operator'));

grant select, insert, update, delete on public.laboratorios      to authenticated;
grant select, insert, update, delete on public.laboratorio_codes to authenticated;


-- 5 · RPCs -------------------------------------------------------------------
create or replace function public.create_laboratorio(p_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.has_min_role('pharma','operator') then raise exception 'Sin permiso para crear laboratorios' using errcode = '42501'; end if;
  insert into public.laboratorios (name) values (btrim(p_name)) returning id into v_id;
  return v_id;
end;
$$;
comment on function public.create_laboratorio is 'Alta de laboratorio (titular) global. pharma operator+. SECURITY DEFINER. 0033.';

-- Redefinir create_medication para aceptar p_laboratorio_id (cambia la firma → drop + recreate).
-- El default null la mantiene compatible: una llamada con 5 args sigue funcionando.
drop function if exists public.create_medication(uuid, text, text, integer, text);
create or replace function public.create_medication(
  p_drug_id uuid, p_name text, p_unit text, p_low_stock_threshold integer default 5,
  p_gtin text default null, p_laboratorio_id uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.has_min_role('pharma','leader') then raise exception 'Sin permiso para crear medicamentos' using errcode = '42501'; end if;
  insert into public.medications (drug_id, name, unit, low_stock_threshold, laboratorio_id, created_by)
  values (p_drug_id, p_name, p_unit, p_low_stock_threshold, p_laboratorio_id, auth.uid())
  returning id into v_id;
  if p_gtin is not null and btrim(p_gtin) <> '' then
    insert into public.medication_codes (medication_id, code, code_type) values (v_id, btrim(p_gtin), 'ean13');
  end if;
  return v_id;
end;
$$;
comment on function public.create_medication is 'Alta de medicamento global (+ GTIN + laboratorio opcionales). pharma leader+. SECURITY DEFINER. 0033.';

grant execute on function
  public.create_laboratorio(text),
  public.create_medication(uuid, text, text, integer, text, uuid)
  to authenticated;


-- 6 · Índices + auditoría ----------------------------------------------------
create index if not exists idx_medications_laboratorio       on public.medications(laboratorio_id);
create index if not exists idx_laboratorio_codes_laboratorio on public.laboratorio_codes(laboratorio_id);

drop trigger if exists trg_audit_laboratorios on public.laboratorios;
create trigger trg_audit_laboratorios
  after insert or update or delete on public.laboratorios
  for each row execute function public.audit_row();

drop trigger if exists trg_audit_laboratorio_codes on public.laboratorio_codes;
create trigger trg_audit_laboratorio_codes
  after insert or update or delete on public.laboratorio_codes
  for each row execute function public.audit_row();
