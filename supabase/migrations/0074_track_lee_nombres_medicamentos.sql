-- Spira · Migración 0074 — Coordinación puede leer el NOMBRE de los medicamentos.
-- Aplicar A MANO en el SQL Editor (como postgres), después de la 0073. IDEMPOTENTE.
--
-- POR QUÉ EXISTE. `medications` (0006) y `drugs` (0032) se leen solo desde pharma, gerencia y
-- contable. Track no. Y Track SÍ lee `patient_medications` (0050 deja ver al coordinador del
-- protocolo) y `dispensation_requests` con sus renglones (0006), así que la coordinadora ve las
-- filas pero el embed del medicamento le vuelve NULL: en la ficha del paciente, en los renglones del
-- pedido, en el historial y en el aviso de dispensación reciente, donde debería decir "Alvetide
-- 92/22 mcg" le dice "Medicamento".
--
-- Es un agujero viejo y silencioso: en el proyecto se detectó al portar la dispensación ("Fase 3
-- pendiente") y se venía arrastrando porque **el usuario de QA tiene los cinco módulos y por lo
-- tanto no lo reproduce**. Se confirmó el 2026-08-11 leyendo la policy, no la pantalla.
--
-- Se abre lo mínimo: **solo el SELECT**, y solo del catálogo. Ni stock, ni lotes, ni recepciones, ni
-- códigos de barras — nada de eso cambia de política. El catálogo no tiene datos de paciente; es la
-- lista de nombres comerciales y monodrogas con la que Coordinación ya trabaja hablando, y sin ella
-- la app le miente por omisión a la persona que tiene que reconocer qué se le entregó al paciente.
-- Las políticas de escritura quedan intactas: Track no da de alta ni edita el catálogo.
--
-- No toca datos y no cambia ninguna firma ni vista: no es breaking para el front desplegado y puede
-- aplicarse en cualquier orden respecto del deploy. El front ya degrada con "Medicamento" cuando el
-- embed viene null, así que antes y después de aplicarla funciona igual — mejor después.
--
-- ⚠️ Recordatorio heredado de la 0071/0072/0073: NUNCA escribir dos signos peso pegados dentro de un
--    comentario de un archivo .sql. El editor SQL de Supabase rastrea el dollar-quoting SIN ignorar
--    los comentarios, así que uno suelto le invierte la paridad, deja de reconocer los cuerpos de
--    función y los parte por sus `;` internos. Costó una tarde el 2026-08-10.
-- ============================================================================

-- 1 · Catálogo de medicamentos: se suma track al SELECT (mismo texto de la 0006, + track).
drop policy if exists "ver medicamentos" on public.medications;
create policy "ver medicamentos" on public.medications for select
  using (
    public.has_module('pharma')
    or public.has_module('gerencia')
    or public.has_module('contable')
    or public.has_module('track')
  );

-- 2 · Monodrogas: mismo criterio (la ficha del paciente embebe `drug:drugs(name)` para mostrar el
--     principio activo debajo del nombre comercial; sin esto esa línea queda vacía para Track).
drop policy if exists "ver drogas" on public.drugs;
create policy "ver drogas" on public.drugs for select
  using (
    public.has_module('pharma')
    or public.has_module('gerencia')
    or public.has_module('contable')
    or public.has_module('track')
  );

comment on table public.medications is
  'Catálogo global de medicamentos. Lectura: pharma / gerencia / contable / track (0074 — Track '
  'necesita el nombre para no mostrar "Medicamento" genérico en la ficha, el pedido y el historial). '
  'Escritura: solo pharma/track leader, sin cambios.';
