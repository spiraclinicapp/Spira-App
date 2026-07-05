-- Spira · Migración 0042 — Pharma: unicidad del catálogo (impedir medicamentos duplicados)
-- Aplicar A MANO en el SQL Editor (como postgres), después de la 0041.
-- ----------------------------------------------------------------------------
-- El catálogo global (medications) no tenía candado de unicidad: se podía crear DOS veces el mismo
-- medicamento (ej. "Lierbron 400/12 mcg" · "Polvo seco" duplicado). El front ya avisa antes de crear,
-- pero este índice es la garantía dura: a nivel base, es imposible duplicar ni por bug ni por dos altas
-- simultáneas. Clave: nombre normalizado (minúsculas, sin espacios de más en los extremos) + presentación.
--
-- ⚠️ PRE-REQUISITO — el índice NO se crea si ya hay duplicados. Antes de aplicar, detectalos y borrá los
--    sobrantes (dejá el que ya tiene código de barras). Consulta para encontrarlos:
--
--      select lower(btrim(name)) as clave, unit, count(*) as n, array_agg(id) as ids
--      from public.medications group by 1, 2 having count(*) > 1;
--
--    Para borrar un duplicado puntual (reemplazá el UUID por el que sobra):
--      delete from public.medications where id = '<uuid-del-duplicado>';
--    (No se puede borrar si tiene lotes/recepciones asociados; en ese caso, migrá el stock al que queda
--     o borralo desde el que no tenga movimientos. Ante la duda, no borres: preguntá.)
-- ============================================================================

create unique index if not exists medications_name_unit_key
  on public.medications (lower(btrim(name)), unit);

comment on index public.medications_name_unit_key is
  'Un medicamento por (nombre normalizado, presentación): impide duplicados exactos en el catálogo global. 0042.';
