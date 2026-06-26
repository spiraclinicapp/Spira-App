# Pharma Tajada 1a — Migración 0032 (catálogo global + stock por protocolo) · Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: usar superpowers:subagent-driven-development (recomendado) o superpowers:executing-plans para implementar este plan tarea por tarea. Los pasos usan checkbox (`- [ ]`).

**Goal:** Crear la migración `0032` que lleva el schema de Pharma al modelo de catálogo global + stock por protocolo + asignación explícita, dejando la base lista para construir la capa de datos y las vistas de la Tajada 1a.

**Architecture:** Se agregan 3 tablas (`drugs`, `protocol_medications`, `medication_codes`), se altera `medications` (global) y `medication_lots` (gana protocolo), se reescriben 3 trigger functions + 1 vista para mover la coherencia medicamento↔protocolo a la asignación y al lote, y se agregan 6 RPCs `SECURITY DEFINER`. Todo en un único archivo `supabase/migrations/0032_*.sql`, aplicado a mano en el dashboard (las tablas de Pharma están vacías en prod → sin backfill).

**Tech Stack:** PostgreSQL / Supabase (PostgREST + RLS + triggers plpgsql). Schema en SQL puro, fuente de verdad = archivos de migración.

**Spec:** [`docs/superpowers/specs/2026-06-24-pharma-1a-medicacion-farmacia-design.md`](../specs/2026-06-24-pharma-1a-medicacion-farmacia-design.md) (commit `b6fcd03`).

## Alcance de ESTE plan

Solo la **migración `0032`** (capa de base). NO incluye la capa de datos `src/data/pharma*.ts`, las vistas, ni el sembrado: esos van en planes siguientes, después de aplicar y verificar esta migración. Ver "Próximos planes" al final.

## Global Constraints (del proyecto, copiar verbatim)

- **Migraciones inmutables y numeradas.** Esta es la **`0032`** (la última aplicada es la 0031). Nunca editar ni renumerar una aplicada; todo cambio nuevo es un archivo nuevo.
- **No hay SQL programático a prod.** El schema se aplica **a mano en el dashboard de Supabase, en orden.** Correr como `postgres` (SQL Editor) para que las funciones `SECURITY DEFINER` tengan owner correcto.
- **Datos reales en prod.** Probar solo con registros prefijo `TEST-*` y borrar **exactamente** esos. Nunca borrado en lote por categoría.
- **Gate de verificación:** no hay suite de tests. Para la migración: aplica limpio + smoke SQL (insertar TEST-*, verificar triggers/constraints, borrar TEST-*). Para TS (planes siguientes): `npm run typecheck` + `npm run build`.
- **Pharma es CENTRAL** (ve todos los protocolos) — decisión de negocio (README §5). Las policies de pharma validan módulo/rol, no protocolo.
- **Coherencia se reubica** (no se pierde): de `medications.protocol_id` → a `protocol_medications` (asignación) + `medication_lots.protocol_id` (lote).

---

## File Structure

- **Create:** `supabase/migrations/0032_pharma_catalogo_global.sql` — toda la migración (DDL + triggers + vista + RLS + RPCs + índices), en orden de dependencias.
- **Modify:** `supabase/README.md` — agregar la fila `0032` a la tabla de "Orden de migraciones".
- **No se toca código TS en este plan.**

Orden interno del archivo `0032` (respeta dependencias): tablas nuevas → ALTER de tablas → reescritura de triggers → reescritura de vista → RLS + grants de las nuevas tablas → RPCs → índices → triggers de auditoría de las nuevas tablas.

---

### Task 1: Escribir la migración 0032 (archivo completo)

**Files:**
- Create: `supabase/migrations/0032_pharma_catalogo_global.sql`

**Interfaces (lo que produce, que consumen los planes de datos/vistas):**
- Tablas: `drugs(id, name)`, `protocol_medications(id, protocol_id, medication_id)`, `medication_codes(id, medication_id, code, code_type)`.
- `medications` ahora: `(id, drug_id, name, unit, low_stock_threshold, created_by, created_at, updated_at)` — **sin `protocol_id`**.
- `medication_lots` ahora: `(id, medication_id, protocol_id, lot_number, expiry_date, quantity_on_hand, ...)`, unique `(medication_id, protocol_id, lot_number)`.
- Vista `v_medication_stock(medication_id, protocol_id, name, unit, low_stock_threshold, total_stock, is_low_stock)`.
- RPCs: `create_drug(p_name text) → uuid`; `create_medication(p_drug_id uuid, p_name text, p_unit text, p_low_stock_threshold int default 5, p_gtin text default null) → uuid`; `assign_medication_to_protocol(p_protocol_id uuid, p_medication_id uuid) → void`; `create_reception(p_protocol_id uuid, p_reception_date date, p_notes text, p_items jsonb) → uuid` (items: `[{medication_id, lot_number, expiry_date, quantity}]`); `verify_reception(p_reception_id uuid) → void`; `adjust_stock(p_lot_id uuid, p_quantity_delta int, p_reason text) → void`.

- [ ] **Step 1 — Verificar dos nombres del schema actual** (no asumir):

Run en el SQL Editor (o `\d` local):
```sql
-- (a) nombre real del unique(medication_id, lot_number) de medication_lots
select conname from pg_constraint
 where conrelid = 'public.medication_lots'::regclass and contype = 'u';
-- (b) valores del enum de movimientos de stock (¿incluye 'ajuste_manual'?)
select enumlabel from pg_enum where enumtypid = 'public.stock_movement_type'::regtype order by enumsortorder;
```
Expected: un constraint tipo `medication_lots_medication_id_lot_number_key` (anotá el nombre real). Y la lista de labels de `stock_movement_type`. **Si NO aparece `ajuste_manual`**, agregar al inicio de la migración: `alter type public.stock_movement_type add value if not exists 'ajuste_manual';` (en su propia transacción; `ADD VALUE` no corre dentro de un bloque con uso inmediato del valor en la misma tx).

- [ ] **Step 2 — Escribir el encabezado + tablas nuevas:**

```sql
-- Spira · Migración 0032 — Pharma: catálogo global + stock por protocolo + asignación explícita
-- Revierte medications.protocol_id (catálogo global, único por GTIN); el protocolo vive en
-- el stock (medication_lots) y en protocol_medications. Tablas de Pharma vacías en prod → sin backfill.

-- 1 · Principio activo (global)
create table public.drugs (
  id         uuid primary key default uuid_generate_v4(),
  name       text not null unique,
  created_at timestamptz not null default now()
);
comment on table public.drugs is 'Principio activo / monodroga. Catálogo global, transversal a protocolos.';

-- 2 · Asignación protocolo ↔ medicamento (allow-list; ancla de coherencia)
create table public.protocol_medications (
  id            uuid primary key default uuid_generate_v4(),
  protocol_id   uuid not null references public.protocols(id) on delete cascade,
  medication_id uuid not null references public.medications(id) on delete restrict,
  created_at    timestamptz not null default now(),
  unique (protocol_id, medication_id)
);
comment on table public.protocol_medications is 'Qué medicamentos usa cada protocolo. Allow-list; reubica la coherencia que estaba en medications.protocol_id.';

-- 3 · Mapeo código de barras → medicamento (GTIN único global)
create table public.medication_codes (
  id            uuid primary key default uuid_generate_v4(),
  medication_id uuid not null references public.medications(id) on delete cascade,
  code          text not null unique,
  code_type     text not null default 'ean13' check (code_type in ('ean13','gs1','interno')),
  created_at    timestamptz not null default now()
);
comment on table public.medication_codes is 'Código de barras (GTIN/EAN/interno) → medicamento. code único global: un GTIN = un producto.';
```

- [ ] **Step 3 — ALTER `medications` (global):**

```sql
alter table public.medications add column drug_id uuid references public.drugs(id) on delete restrict;
drop index if exists public.idx_medications_protocol;          -- de la 0005
alter table public.medications drop column protocol_id;        -- queda global
```

- [ ] **Step 4 — ALTER `medication_lots` (gana protocolo):**

```sql
alter table public.medication_lots add column protocol_id uuid not null references public.protocols(id) on delete restrict;
-- usar el nombre REAL del Step 1; si difiere, reemplazar acá:
alter table public.medication_lots drop constraint medication_lots_medication_id_lot_number_key;
alter table public.medication_lots add constraint medication_lots_med_proto_lot_key unique (medication_id, protocol_id, lot_number);
-- el unique (id, medication_id) que soporta los FK compuestos se mantiene intacto.
```
(La tabla está vacía → `add column ... not null` no falla.)

- [ ] **Step 5 — Reescribir `apply_reception_stock`** (lote hereda protocolo; valida asignación; upsert con el nuevo unique):

```sql
create or replace function public.apply_reception_stock()
returns trigger language plpgsql security definer set search_path = public as $$
declare r record; v_lot_id uuid;
begin
  if new.status = 'verificada' and old.status is distinct from 'verificada' then
    for r in select * from public.reception_items where reception_id = new.id loop
      if not exists (select 1 from public.protocol_medications pm
                     where pm.medication_id = r.medication_id and pm.protocol_id = new.protocol_id) then
        raise exception 'El medicamento % no está asignado al protocolo % de la recepción',
          r.medication_id, new.protocol_id using errcode = 'check_violation';
      end if;
      insert into public.medication_lots (medication_id, protocol_id, lot_number, expiry_date, quantity_on_hand)
      values (r.medication_id, new.protocol_id, r.lot_number, r.expiry_date, r.quantity)
      on conflict (medication_id, protocol_id, lot_number) do update
        set quantity_on_hand = medication_lots.quantity_on_hand + excluded.quantity,
            expiry_date       = coalesce(medication_lots.expiry_date, excluded.expiry_date)
      returning id into v_lot_id;
      insert into public.stock_movements
        (medication_id, lot_id, movement_type, quantity_delta, reference_id, reference_type, created_by)
      values
        (r.medication_id, v_lot_id, 'recepcion', r.quantity, new.id, 'reception',
         coalesce(new.verified_by, new.received_by));
    end loop;
  end if;
  return new;
end;
$$;
```

- [ ] **Step 6 — Reescribir las dos coherencias** (request → por asignación; dispensación → por lote):

```sql
create or replace function public.check_request_item_protocol()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_protocol_id uuid;
begin
  select e.protocol_id into v_protocol_id
  from public.dispensation_requests dr
  join public.patient_visits pv on pv.id = dr.visit_id
  join public.enrollments e     on e.id  = pv.enrollment_id
  where dr.id = new.request_id;
  if not exists (select 1 from public.protocol_medications pm
                 where pm.medication_id = new.medication_id and pm.protocol_id = v_protocol_id) then
    raise exception 'Medicamento % no está asignado al protocolo % de la solicitud',
      new.medication_id, v_protocol_id using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create or replace function public.check_dispensation_item_protocol()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_protocol_id uuid; v_lot_protocol uuid;
begin
  select e.protocol_id into v_protocol_id
  from public.dispensations d
  join public.dispensation_requests dr on dr.id = d.request_id
  join public.patient_visits pv on pv.id = dr.visit_id
  join public.enrollments e     on e.id  = pv.enrollment_id
  where d.id = new.dispensation_id;
  select protocol_id into v_lot_protocol from public.medication_lots where id = new.lot_id;
  if v_lot_protocol is distinct from v_protocol_id then
    raise exception 'El lote % (protocolo %) no corresponde al protocolo % de la dispensación',
      new.lot_id, v_lot_protocol, v_protocol_id using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
```
(Los triggers `trg_apply_reception_stock`, `trg_check_request_item_protocol`, `trg_check_dispensation_item_protocol` ya existen; `create or replace function` actualiza el cuerpo sin recrearlos.)

- [ ] **Step 7 — Reescribir `v_medication_stock`** (por medicamento+protocolo, basada en la asignación para mostrar también stock cero):

```sql
create or replace view public.v_medication_stock
with (security_invoker = true) as
select
  m.id                                       as medication_id,
  pm.protocol_id,
  m.name,
  m.unit,
  m.low_stock_threshold,
  coalesce(sum(ml.quantity_on_hand), 0)      as total_stock,
  coalesce(sum(ml.quantity_on_hand), 0) <= m.low_stock_threshold as is_low_stock
from public.protocol_medications pm
join public.medications m on m.id = pm.medication_id
left join public.medication_lots ml
  on ml.medication_id = pm.medication_id and ml.protocol_id = pm.protocol_id
group by m.id, pm.protocol_id;
comment on view public.v_medication_stock is 'Stock por (medicamento, protocolo) sobre la asignación; total = suma de lotes de ese protocolo + flag de stock bajo.';
```

- [ ] **Step 8 — RLS + grants de las 3 tablas nuevas** (pharma central; catálogo lo administra leader, códigos operator):

```sql
alter table public.drugs                enable row level security;
alter table public.protocol_medications enable row level security;
alter table public.medication_codes     enable row level security;

create policy "ver drogas" on public.drugs for select
  using (public.has_module('pharma') or public.has_module('gerencia') or public.has_module('contable'));
create policy "pharma leader administra drogas" on public.drugs for all
  using (public.has_min_role('pharma','leader')) with check (public.has_min_role('pharma','leader'));

create policy "ver asignacion" on public.protocol_medications for select
  using (public.has_module('pharma') or public.has_module('gerencia'));
create policy "pharma leader asigna" on public.protocol_medications for all
  using (public.has_min_role('pharma','leader')) with check (public.has_min_role('pharma','leader'));

create policy "ver codigos" on public.medication_codes for select
  using (public.has_module('pharma') or public.has_module('gerencia'));
create policy "pharma administra codigos" on public.medication_codes for all
  using (public.has_min_role('pharma','operator')) with check (public.has_min_role('pharma','operator'));

-- Grants a authenticated, igual que el resto de las tablas (ver 0007_realtime_grants.sql):
grant select, insert, update, delete on public.drugs, public.protocol_medications, public.medication_codes to authenticated;
```
(Verificar contra `0007` el patrón exacto de grants; PostgREST necesita el grant aunque la RLS filtre.)

- [ ] **Step 9 — RPCs (`SECURITY DEFINER`, authz a mano):**

```sql
create or replace function public.create_drug(p_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.has_min_role('pharma','leader') then raise exception 'Sin permiso' using errcode='42501'; end if;
  insert into public.drugs (name) values (btrim(p_name)) returning id into v_id; return v_id;
end; $$;

create or replace function public.create_medication(
  p_drug_id uuid, p_name text, p_unit text, p_low_stock_threshold integer default 5, p_gtin text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.has_min_role('pharma','leader') then raise exception 'Sin permiso' using errcode='42501'; end if;
  insert into public.medications (drug_id, name, unit, low_stock_threshold, created_by)
  values (p_drug_id, p_name, p_unit, p_low_stock_threshold, auth.uid()) returning id into v_id;
  if p_gtin is not null and btrim(p_gtin) <> '' then
    insert into public.medication_codes (medication_id, code, code_type) values (v_id, btrim(p_gtin), 'ean13');
  end if;
  return v_id;
end; $$;

create or replace function public.assign_medication_to_protocol(p_protocol_id uuid, p_medication_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.has_min_role('pharma','leader') then raise exception 'Sin permiso' using errcode='42501'; end if;
  insert into public.protocol_medications (protocol_id, medication_id)
  values (p_protocol_id, p_medication_id) on conflict (protocol_id, medication_id) do nothing;
end; $$;

create or replace function public.create_reception(
  p_protocol_id uuid, p_reception_date date, p_notes text, p_items jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_item jsonb;
begin
  if not public.has_min_role('pharma','leader') then raise exception 'Sin permiso' using errcode='42501'; end if;
  insert into public.medication_receptions (protocol_id, received_by, reception_date, status, notes)
  values (p_protocol_id, auth.uid(), p_reception_date, 'pendiente', p_notes) returning id into v_id;
  for v_item in select * from jsonb_array_elements(p_items) loop
    if not exists (select 1 from public.protocol_medications pm
                   where pm.medication_id = (v_item->>'medication_id')::uuid and pm.protocol_id = p_protocol_id) then
      raise exception 'Medicamento % no asignado al protocolo', v_item->>'medication_id' using errcode='check_violation';
    end if;
    insert into public.reception_items (reception_id, medication_id, lot_number, expiry_date, quantity)
    values (v_id, (v_item->>'medication_id')::uuid, v_item->>'lot_number',
            nullif(v_item->>'expiry_date','')::date, (v_item->>'quantity')::integer);
  end loop;
  return v_id;
end; $$;

create or replace function public.verify_reception(p_reception_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_status reception_status;
begin
  if not public.has_min_role('pharma','leader') then raise exception 'Sin permiso' using errcode='42501'; end if;
  select status into v_status from public.medication_receptions where id = p_reception_id for update;
  if v_status is null then raise exception 'Recepción inexistente' using errcode='foreign_key_violation'; end if;
  if v_status <> 'pendiente' then raise exception 'La recepción no está pendiente (está %)', v_status using errcode='check_violation'; end if;
  update public.medication_receptions set status = 'verificada' where id = p_reception_id;
end; $$;

create or replace function public.adjust_stock(p_lot_id uuid, p_quantity_delta integer, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare v_med uuid; v_stock integer;
begin
  if not public.has_min_role('pharma','leader') then raise exception 'Sin permiso' using errcode='42501'; end if;
  if p_reason is null or btrim(p_reason) = '' then raise exception 'El ajuste requiere motivo' using errcode='check_violation'; end if;
  select medication_id, quantity_on_hand into v_med, v_stock from public.medication_lots where id = p_lot_id for update;
  if v_med is null then raise exception 'Lote inexistente' using errcode='foreign_key_violation'; end if;
  if v_stock + p_quantity_delta < 0 then raise exception 'El ajuste dejaría stock negativo (% disp, % ajuste)', v_stock, p_quantity_delta using errcode='check_violation'; end if;
  update public.medication_lots set quantity_on_hand = quantity_on_hand + p_quantity_delta where id = p_lot_id;
  insert into public.stock_movements (medication_id, lot_id, movement_type, quantity_delta, reference_type, reason, created_by)
  values (v_med, p_lot_id, 'ajuste_manual', p_quantity_delta, 'ajuste_manual', p_reason, auth.uid());
end; $$;

grant execute on function public.create_drug(text), public.create_medication(uuid,text,text,integer,text),
  public.assign_medication_to_protocol(uuid,uuid), public.create_reception(uuid,date,text,jsonb),
  public.verify_reception(uuid), public.adjust_stock(uuid,integer,text) to authenticated;
```

- [ ] **Step 10 — Índices + auditoría de las nuevas tablas:**

```sql
create index idx_medications_drug             on public.medications(drug_id);
create index idx_medication_lots_protocol     on public.medication_lots(protocol_id);
create index idx_protocol_medications_protocol on public.protocol_medications(protocol_id);
create index idx_medication_codes_medication  on public.medication_codes(medication_id);

create trigger trg_audit_protocol_medications after insert or update or delete
  on public.protocol_medications for each row execute function public.audit_row();
```
(El `medications` ya tiene `trg_audit_medications`. `drugs`/`medication_codes` son catálogo de referencia; auditarlos es opcional, no se incluye.)

- [ ] **Step 11 — Actualizar el índice de migraciones:**

Agregar a la tabla de `supabase/README.md` (después de la fila 0031):
```markdown
| 0032 | `pharma_catalogo_global.sql` | Pharma 1a: `medications` global (drop `protocol_id`, + `drug_id`→`drugs`), stock por protocolo (`medication_lots.protocol_id` + nuevo unique), `protocol_medications` (asignación), `medication_codes` (GTIN); reescribe `apply_reception_stock`/`check_*_item_protocol`/`v_medication_stock`; RPCs `create_drug`/`create_medication`/`assign_medication_to_protocol`/`create_reception`/`verify_reception`/`adjust_stock` |
```

---

### Task 2: Aplicar la migración en prod (a mano) y smoke-test

**Files:** ninguno (operación de dashboard).

**Interfaces:** Consume el archivo `0032` de Task 1.

- [ ] **Step 1 — Aplicar.** Pegar y ejecutar `0032_pharma_catalogo_global.sql` completo en el SQL Editor del dashboard (como `postgres`), después de la 0031. Expected: sin errores.

- [ ] **Step 2 — Smoke test con datos `TEST-*`.** Ejecutar (requiere un protocolo real existente; tomar uno o crear `TEST-PROTO`):
```sql
-- droga + medicamento global + GTIN
select public.create_drug('TEST-Bevacizumab') as drug_id \gset
select public.create_medication(:'drug_id', 'TEST-Bevacizumab 400mg', 'vial', 5, '7790000000017') as med_id \gset
-- asignar a un protocolo (reemplazar :proto por un protocols.id real)
select public.assign_medication_to_protocol(:'proto', :'med_id');
-- recepción + verificación → debe ingresar stock
select public.create_reception(:'proto', current_date, 'TEST', jsonb_build_array(
  jsonb_build_object('medication_id', :'med_id', 'lot_number','TEST-LOTE-1','expiry_date','2027-01-01','quantity',10))) as rec_id \gset
select public.verify_reception(:'rec_id');
-- verificar stock y movimiento
select * from public.v_medication_stock where medication_id = :'med_id';        -- total_stock = 10
select * from public.stock_movements where reference_id = :'rec_id';            -- 1 fila 'recepcion' +10
-- ajuste con motivo
select public.adjust_stock((select id from public.medication_lots where medication_id=:'med_id'), -3, 'TEST recuento');
select total_stock from public.v_medication_stock where medication_id = :'med_id'; -- 7
```
Expected: `total_stock` 10 → 7; un movimiento `recepcion` y uno `ajuste_manual`; `audit_log` con filas de `protocol_medications`.

- [ ] **Step 3 — Probar las guardas (deben fallar):**
```sql
select public.verify_reception(:'rec_id');                       -- ERROR: no está pendiente
select public.adjust_stock((select id from public.medication_lots where medication_id=:'med_id'), -999, 'x'); -- ERROR: stock negativo
-- recepción de un medicamento NO asignado → ERROR 'no asignado al protocolo'
```

- [ ] **Step 4 — Limpiar EXACTAMENTE los TEST-*:**
```sql
delete from public.medication_receptions where notes = 'TEST';   -- cascada a reception_items
delete from public.protocol_medications where medication_id = :'med_id';
delete from public.medication_lots where medication_id = :'med_id';
delete from public.medication_codes where medication_id = :'med_id';
delete from public.medications where id = :'med_id';
delete from public.drugs where id = :'drug_id';
-- stock_movements es inmutable (insert-only): las filas TEST quedan; documentarlo, no forzar borrado.
```
(Si se creó `TEST-PROTO`, borrarlo también. `stock_movements` no se borra por diseño ANMAT: dejar nota de que son de prueba.)

- [ ] **Step 5 — Commit del archivo de migración + README:**
```bash
git add supabase/migrations/0032_pharma_catalogo_global.sql supabase/README.md
git commit -m "feat(pharma): migración 0032 — catálogo global + stock por protocolo + RPCs 1a"
```

---

## Self-Review (hecho)

- **Cobertura de spec §3/§4:** `drugs`, `protocol_medications`, `medication_codes`, ALTER de `medications`/`medication_lots`, reescritura de los 3 triggers + vista, las 6 RPCs, RLS → todos tienen paso. ✔
- **Consistencia de tipos/nombres:** firmas de RPC del bloque "Interfaces" == las de Step 9; `v_medication_stock` expone `protocol_id` (lo consumirá la capa de datos). ✔
- **Riesgos marcados, no placeholders:** nombre real del unique (Step 1a), valor de enum `ajuste_manual` (Step 1b), patrón de grants vs 0007 (Step 8) — son verificaciones concretas contra objetos existentes, no "TODO". ✔
- **Huérfanos:** `medication_lots.protocol_id` NOT NULL es seguro porque la tabla está vacía (confirmado). ✔

## Próximos planes (NO en este)

1. **Capa de datos** `src/data/pharma*.ts`: hooks `useXxx` sobre `v_medication_stock` / `medications`+`drugs` / `medication_lots` / `protocol_medications` / recepciones / `medication_codes`; mutaciones por `supabase.rpc(...)` a las 6 RPCs; tipos a mano citando 0032; mensajes de error serenos. (Plan propio; gate `npm run typecheck`.)
2. **Vista `pharma/medicamentos`** (catálogo global + stock por protocolo + alta + ajuste; desplegables sobre texto libre).
3. **Vista `pharma/recepcion`** (espejo de Visitas) + **lectora** (escaneo EAN-13, autorellenado con memoria, asignar on-demand).
4. **Sembrado** en 3 capas: script de Node idempotente desde el Excel curado (drugs + medications + medication_codes + protocol_medications) + top 100-200 + on-demand.
