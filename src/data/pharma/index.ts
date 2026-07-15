/**
 * Barrel del módulo de datos de Pharma. Las vistas importan desde `data/pharma`.
 * El módulo depende SOLO de primitivas del Core (`lib/supabase`, `lib/useSupabaseQuery`);
 * para portarlo, ver el "Contrato del Core" en el plan de la capa de datos.
 */
export * from './drugs'
export * from './medications'
export * from './stock'
export * from './receptions'
export * from './laboratorios'
export * from './ipStock'
export * from './coordinators'
export * from './patientMedications'
export * from './dispensations'
