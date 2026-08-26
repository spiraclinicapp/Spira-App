/**
 * La frase que explica por qué una cuenta no se puede eliminar.
 *
 * Vive APARTE de `AccionesDeCuenta.tsx` para poder testearse: ese archivo importa `data/team`, que
 * arrastra el cliente de Supabase, que toca `window` — nada de eso se puede montar en un test de
 * node. Es el mismo motivo por el que `prefsModel.ts` está separado de `prefs.tsx`: la parte que
 * puede fallar en silencio se saca a un archivo con datos y funciones puras, y nada más.
 */

/* Nombres en castellano de las tablas que más aparecen, para explicar por qué una cuenta no se
   puede eliminar. NO pretende ser exhaustiva y no hace falta que lo sea: `user_activity_summary`
   recorre el catálogo, así que puede devolver una tabla que no esté acá — para eso está el
   "y N registros más" de abajo. Una lista que se cree completa envejece peor que una que sabe que
   no lo es. */
const NOMBRE_DE_TABLA: Record<string, [string, string]> = {
  patient_visits: ['visita', 'visitas'],
  visit_procedures: ['procedimiento', 'procedimientos'],
  dispensations: ['dispensación', 'dispensaciones'],
  dispensation_requests: ['pedido de medicación', 'pedidos de medicación'],
  dispensation_items: ['renglón dispensado', 'renglones dispensados'],
  medication_receptions: ['recepción', 'recepciones'],
  stock_movements: ['movimiento de stock', 'movimientos de stock'],
  patients: ['paciente registrado', 'pacientes registrados'],
  enrollments: ['enrolamiento', 'enrolamientos'],
  visit_comments: ['comentario', 'comentarios'],
  checklist_completions: ['ítem de checklist', 'ítems de checklist'],
  patient_timeline: ['evento de historia clínica', 'eventos de historia clínica'],
  audit_log: ['acción auditada', 'acciones auditadas'],
}

function contar(tabla: string, n: number): string {
  const nombres = NOMBRE_DE_TABLA[tabla]
  if (!nombres) return ''
  return `${n} ${n === 1 ? nombres[0] : nombres[1]}`
}

/**
 * "34 visitas, 12 dispensaciones y 3 registros más" — de mayor a menor, con las tres más grandes.
 *
 * Se enumeran sólo tres a propósito: la frase existe para que se entienda POR QUÉ no se puede
 * borrar, no para inventariar la cuenta. Con siete tablas encadenadas nadie la lee.
 */
export function resumirActividad(referencias: Record<string, number>): string {
  const ordenadas = Object.entries(referencias).sort((a, b) => b[1] - a[1])
  const nombradas: string[] = []
  let resto = 0

  for (const [tabla, n] of ordenadas) {
    const texto = nombradas.length < 3 ? contar(tabla, n) : ''
    if (texto) nombradas.push(texto)
    else resto += n
  }

  if (nombradas.length === 0) return `${resto} registro${resto === 1 ? '' : 's'}`
  const cola = resto > 0 ? [`${resto} registro${resto === 1 ? '' : 's'} más`] : []
  const partes = [...nombradas, ...cola]
  if (partes.length === 1) return partes[0]
  return `${partes.slice(0, -1).join(', ')} y ${partes[partes.length - 1]}`
}
