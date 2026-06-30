/**
 * Traduce códigos de error de Postgres a mensajes serenos para el módulo Pharma.
 * Compartido por toda la capa de datos (DRY). Mismo criterio que los helpers
 * `*ErrorMessage` de `data/patients.ts` / `data/protocols.ts`.
 */
export function pharmaErrorMessage(code: string | undefined, raw: string): string {
  if (code === '23505') return 'Ya existe un registro con ese valor único (código o lote repetido).'
  if (code === '23502') return 'Faltan datos obligatorios. Revisá el formulario.'
  // 23514 (check_violation) tiene dos orígenes con calidad de mensaje opuesta: los
  // `raise exception ... using errcode = 'check_violation'` de las funciones/triggers de Pharma
  // (0003) traen texto claro y pensado para el operador ("Stock insuficiente en lote X (3
  // disponible, 5 requerido)", "El medicamento X no pertenece al protocolo Y de la recepción");
  // los CHECK crudos de tabla (quantity > 0, quantity_on_hand >= 0) dan el mensaje técnico de
  // Postgres, inútil para mostrar. PostgREST no expone `constraint` por separado, así que los
  // distinguimos por el texto: si es la violación cruda ("violates check constraint"), genérico;
  // si no, dejamos pasar el mensaje del DB —que es el caso esperado en la práctica—.
  if (code === '23514') {
    const generico = 'Un valor no es válido (cantidad o stock fuera de rango).'
    return /violates check constraint|viola la restricci[oó]n/i.test(raw) ? generico : raw || generico
  }
  if (code === '42501') return 'No tenés permiso para esta acción.'
  if (code === '23503') return 'El registro referenciado no existe o ya no está disponible.'
  return raw || 'No pudimos completar la acción. Probá de nuevo.'
}
