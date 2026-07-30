/** Motivos de derivación al médico (chips). Catálogo acotado a propósito para poder reportarlo
 *  (migración 0047). Fuente de verdad ÚNICA: la usan VisitDetail, DoctorRequest y —para el tono—
 *  MotivoChip. */
export const MOTIVOS = ['Evento adverso', 'Síntomas reportados', 'Laboratorio fuera de rango', 'Consulta clínica', 'Otro'] as const
