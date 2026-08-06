// Presets y etiquetas del circuito de reporte, compartidos entre Plantillas (checklist) y los
// procedimientos de la visita. `DEADLINE_OPTIONS`/`deadlineLabel` los usa solo Plantillas;
// `REPORT_ETA_OPTIONS`/`reportEtaLabel`, también el cuadro de procedimientos (0064).

/** Plazo del ítem (deadline_hours). 0 = al momento; check en DB: {0,48,168}. */
export const DEADLINE_OPTIONS: { value: number; label: string }[] = [
  { value: 0, label: 'Al momento' },
  { value: 48, label: '48 horas' },
  { value: 168, label: '7 días' },
]

/** deadline_hours → etiqueta humana. */
export function deadlineLabel(hours: number): string {
  return DEADLINE_OPTIONS.find((o) => o.value === hours)?.label ?? `${hours} h`
}

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
