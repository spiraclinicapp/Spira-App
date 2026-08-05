-- Spira · Migración 0066 — Estados clínicos nuevos: "Siendo atendido" y "Por reprogramar"
-- ============================================================================
-- VA SOLO EN ESTE ARCHIVO, A PROPÓSITO. Postgres no deja usar un valor de enum recién agregado
-- en la misma transacción que lo crea, así que la vista que los emite vive en la 0068 y se aplica
-- DESPUÉS de esta. Mismo motivo que la 0053.
--
--   en_atencion      → el paciente está hoy en el centro y no se cerró la atención.
--   por_reprogramar  → alguien marcó "No vino" y la visita todavía no tiene fecha nueva.
-- ============================================================================

alter type public.visit_status add value if not exists 'en_atencion';
alter type public.visit_status add value if not exists 'por_reprogramar';

-- Verificación · debe listar: futura, proxima, realizada, completa, item_vencido, ventana_vencida, en_atencion, por_reprogramar
--   select unnest(enum_range(null::public.visit_status));
