// Presets y etiquetas del circuito de reporte, que hoy usa el cuadro de procedimientos de la visita
// (0064). Nació con el checklist clínico —de ahí el nombre del archivo— y le sobrevivió: los plazos
// del ítem (`DEADLINE_OPTIONS`/`deadlineLabel`) se fueron con Plantillas el 2026-08-06.

/** Demora estimada del reporte (report_eta_hours). Dropdown, sin texto libre. Migración 0063. */
export const REPORT_ETA_OPTIONS: { value: number; label: string }[] = [
  { value: 24, label: '24 horas' },
  { value: 48, label: '48 horas (2 días)' },
  { value: 72, label: '72 horas (3 días)' },
  { value: 168, label: '7 días' },
  { value: 336, label: '14 días' },
  { value: 720, label: '30 días' },
]

/** report_eta_hours → etiqueta corta para píldoras ("~2 días" / "~48 h"). */
export function reportEtaLabel(hours: number): string {
  if (hours % 24 === 0) {
    const d = hours / 24
    return d === 1 ? '~1 día' : `~${d} días`
  }
  return `~${hours} h`
}
