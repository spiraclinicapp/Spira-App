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
  /**
   * La función o la columna no existen todavía en la base.
   *
   * Pasa en la ventana entre desplegar el front y aplicar su migración, y el mensaje crudo es lo
   * peor que le puede llegar a la farmacéutica: viene en INGLÉS y nombra objetos del schema
   * ("Could not find the function public.dispensation_audit_trail in the schema cache",
   * "column ... does not exist"). No es un error de ella ni algo que pueda resolver reintentando,
   * así que el texto lo dice y nombra a quién avisarle.
   *
   * `42883` es el código de Postgres; `PGRST202` el de PostgREST cuando ni siquiera encuentra la
   * función para llamarla. Los dos significan lo mismo para quien está mirando la pantalla.
   *
   * `PGRST205` es el mismo caso una tabla más allá: PostgREST no encuentra la TABLA o la VISTA.
   * Lo sumó Reportes (0083), que lee de tres vistas nuevas; sin esto, la farmacéutica que abre la
   * pantalla antes de que se aplique la migración lee "Could not find the table
   * 'public.v_pharma_report_items' in the schema cache".
   */
  if (code === '42883' || code === 'PGRST202' || code === '42703' || code === 'PGRST205') {
    return 'Esta función todavía no está disponible en el servidor. Avisale al equipo técnico: falta aplicar una actualización de la base.'
  }
  return raw || 'No pudimos completar la acción. Probá de nuevo.'
}
