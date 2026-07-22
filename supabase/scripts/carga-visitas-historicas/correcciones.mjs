// correcciones.mjs — overrides explícitos confirmados por el Director (2026-07-21).
// Clave = `${protocolo}|${ivrs}|${visitaCol}` (o `${protocolo}|${ivrs}` para el enrollment).
// Sin PII (IVRS = código sin nombre, apto para el repo). Auditable: cada override queda a la vista.

// Typos de año en la fecha real (la real quedó un año adelantada). NO se toca …320002/V9
// (cruce legítimo de fin de año, no es typo).
export const CORRECCIONES_FECHA_REAL = {
  'CEREN-2|032000320001|V6': '2025-11-25',
  'CEREN-2|032000320001|V7': '2025-12-04',
  'CEREN-2|032000320001|V8': '2025-12-16',
  'CEREN-2|032000320001|V9': '2025-12-30',
  'CEREN-2|032000320003|V3': '2025-12-29',
}

// Fecha de ancla (estimada de la visita ancla) donde el Excel la traía ilegible.
// LTS …520010: la V1 venía "22 /127026"; fecha correcta confirmada = 22/12/2026.
export const CORRECCIONES_ANCLA = {
  'LTS 17231|032001520010|V1': '2026-12-22',
}

// Notas de texto que estaban en la columna Fecha Real (la visita no se hizo): se guardan como
// nota de la visita, no como fecha.
export const NOTAS_VISITA = {
  'CEREN-2|032000320001|V4': 'Saltea por vacaciones',
  'ACT18301|032001500001|V18': 'Paciente pasa a LTS 17231 el 18/06/2026 (rollover)',
}

// Estado del enrollment cuando no es 'activo'. THESEUS …740008 = falla de screening (solo V1):
// se carga inactivo (su V1 sí se carga como visita atendida).
export const ENROLLMENT_STATUS = {
  'THESEUS|032000740008': 'inactivo',
}
