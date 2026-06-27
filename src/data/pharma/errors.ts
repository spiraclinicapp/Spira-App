/**
 * Traduce códigos de error de Postgres a mensajes serenos para el módulo Pharma.
 * Compartido por toda la capa de datos (DRY). Mismo criterio que los helpers
 * `*ErrorMessage` de `data/patients.ts` / `data/protocols.ts`.
 */
export function pharmaErrorMessage(code: string | undefined, raw: string): string {
  if (code === '23505') return 'Ya existe un registro con ese valor único (código o lote repetido).'
  if (code === '23502') return 'Faltan datos obligatorios. Revisá el formulario.'
  if (code === '23514') return 'Un valor no es válido (cantidad o stock fuera de rango).'
  if (code === '42501') return 'No tenés permiso para esta acción.'
  if (code === '23503') return 'El registro referenciado no existe o ya no está disponible.'
  return raw || 'No pudimos completar la acción. Probá de nuevo.'
}
