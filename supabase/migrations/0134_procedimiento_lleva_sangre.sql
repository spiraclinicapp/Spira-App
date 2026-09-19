-- Spira · Migración 0134 — Coordinación: «lleva sangre» por procedimiento del estudio
-- ============================================================================
-- Plan: docs/plan-resumen-de-visita.md (PR 1; decisiones D3, D18 y D19).
--
-- La lista de Visitas del día va a mostrar si la visita lleva extracción de sangre, para preparar
-- tubos, ayuno y courier sin abrir cada visita. El dato no existía: el catálogo sólo tiene categoría,
-- y «Laboratorio» no alcanza (hay laboratorios de orina, y extracciones fuera de esa categoría).
--
-- Va en protocol_procedures y no en procedures: es POR ESTUDIO, como los reportes (0089). El mismo
-- procedimiento del catálogo global puede llevar sangre en un protocolo y no en otro.
--
-- TRES valores, a propósito (D3): true / false / NULL = sin definir. SIN default y SIN backfill: lo ya
-- cargado arranca sin definir, y la app no dibuja la gota hasta que alguien lo define desde el editor
-- del estudio (queda en el audit_log con su autor). Un default false haría decir «Sin sangre» a todas
-- las visitas del día sin que nadie lo hubiera afirmado.
--
-- RLS y auditoría: nada nuevo. La política «editar procedimientos del estudio» (0089) es FOR ALL para
-- gerencia y track-operator, y trg_audit_protocol_procedures ya registra el UPDATE (la tabla tiene id).
--
-- ORDEN DE DESPLIEGUE: esta migración va PRIMERO y el front después. Es puramente aditiva: ningún
-- front desplegado pide la columna; el que no funciona sin ella es el front nuevo, que la lee en el
-- cuadro de procedimientos del estudio.
--
-- APLICAR: a mano en el SQL Editor de Supabase, DESPUÉS de la 0133. IDEMPOTENTE: se puede correr de
-- nuevo entera. Registrar en supabase/README.md al confirmarse en prod.
-- ============================================================================

alter table public.protocol_procedures
  add column if not exists draws_blood boolean;

comment on column public.protocol_procedures.draws_blood is
  'Si el procedimiento lleva extracción de sangre EN ESTE ESTUDIO. NULL = sin definir: la app no dibuja la gota. 0134.';

-- PostgREST guarda el schema en caché: sin esto la API no ve la columna nueva hasta que se recargue.
notify pgrst, 'reload schema';

-- Sonda: tiene que devolver UNA fila → draws_blood | boolean | YES
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'protocol_procedures' and column_name = 'draws_blood';
