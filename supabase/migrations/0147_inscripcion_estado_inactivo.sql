-- 0147 · Inscripción · el estado "inactivo"
-- ============================================================================
-- APLICAR SOLA Y PRIMERO, antes de la 0148.
--
-- Postgres no deja usar un valor de enum recién agregado dentro de la misma transacción que lo crea
-- ("unsafe use of new value of enum type"). Mismo motivo y misma forma que la 0053.
--
-- QUÉ ES "inactivo" (Director, 2026-09-29): una inscripción cargada que todavía NO empezó y tampoco
-- está cerrada. Nació con los rollover de ACT18301 a LTS17231: las personas ya figuran en el estudio
-- nuevo con su IVRS, pero el sitio las va a dar de alta más adelante. No es screening (no están en
-- evaluación) ni un cierre (no hay motivo clínico, y cerrar borra las visitas futuras). No suma en
-- Reposición ni cuenta como «en curso»; se pasa a activo desde la ficha con «Activar participación».
--
-- ADITIVA: ningún front pide este valor hasta que alguien lo ponga, y sólo lo pone la 0148. Se aplica
-- antes del deploy.
-- ============================================================================

alter type public.enrollment_status add value if not exists 'inactivo';

-- Verificación · debe listar: screening, activo, completado, discontinuado, inactivo
--   select unnest(enum_range(null::public.enrollment_status));
