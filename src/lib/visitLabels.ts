/**
 * Etiquetas de tipo de visita — módulo PURO (sin Supabase ni efectos), para que
 * `lib/` (helpers puros) pueda usarlas sin acoplarse a la capa de datos. La capa
 * de datos (`data/visitEvents`) las re-exporta para compatibilidad.
 */

/** Tipo de visita (enum visit_kind, migración 0022). `programada` = del cuadro; el resto, sueltas. */
export type VisitKind = 'programada' | 'firma' | 'screening' | 'firma_screening' | 'randomizacion' | 'vnp' | 'retest'

/** Etiqueta legible por tipo (para tracker y selector). */
export const KIND_LABELS: Record<VisitKind, string> = {
  programada: 'Programada',
  firma: 'Firma',
  screening: 'Screening',
  firma_screening: 'Firma y Screening',
  randomizacion: 'Randomización',
  vnp: 'VNP',
  retest: 'Retest',
}

/** Etiqueta corta por tipo (para el tracker horizontal, columnas angostas). */
export const KIND_SHORT: Record<VisitKind, string> = {
  programada: '',
  firma: 'Firma',
  screening: 'Scr',
  firma_screening: 'F+S',
  randomizacion: 'Rando',
  vnp: 'VNP',
  retest: 'Retest',
}
