import { diaMes, sumarDias } from './reposicionModel'

/**
 * ┌─ El período de corte a corte (docs/superpowers/specs/2026-09-16-reposicion-submodulo-design.md, R4) ─┐
 *
 * Como el resumen de la tarjeta de crédito: Farmacia carga UN día de corte (p. ej. el 28) y el período va
 * del día siguiente al corte anterior hasta el día de corte, inclusive. Lo que pasa después del corte es
 * del período siguiente.
 *
 *   corte 28:   29/08 ────────────── 28/09 │ 29/09 ────────────── 28/10
 *                       P0 (en curso)      │   P1 (el que se compra)
 *
 * Si el día cargado no existe en un mes (29, 30 o 31), el corte de ese mes es su último día: con corte 31,
 * febrero corta el 28 (el 29 en bisiesto) y abril el 30. Sin esa regla, un «31/02» pasa por `Date` como
 * «03/03» y el período de marzo arranca tres días tarde, sin ningún error a la vista.
 *
 * Fechas `YYYY-MM-DD` y SIN zona horaria: el «hoy» lo pone el llamador en hora AR (CI corre en UTC).
 * └────────────────────────────────────────────────────────────────────────────────────────────────────┘
 */

export interface Periodo {
  /** Primer día, inclusive. */
  desde: string
  /** Día de corte, inclusive. */
  hasta: string
}

const pad = (n: number) => String(n).padStart(2, '0')

/** Último día del mes (`mes` de 1 a 12). */
export function ultimoDiaDelMes(anio: number, mes: number): number {
  return new Date(Date.UTC(anio, mes, 0)).getUTCDate()
}

/** El día de corte de un mes, recortado a su último día. `mes` de 1 a 12; admite 0 y 13 para cruzar el año. */
export function corteDelMes(anio: number, mes: number, diaCorte: number): string {
  const total = anio * 12 + (mes - 1)
  const y = Math.floor(total / 12)
  const m = (total % 12) + 1
  return `${y}-${pad(m)}-${pad(Math.min(diaCorte, ultimoDiaDelMes(y, m)))}`
}

/** El período que contiene a `hoy`. */
export function periodoDe(hoy: string, diaCorte: number): Periodo {
  const [y, m] = hoy.split('-').map(Number)
  const corteEste = corteDelMes(y, m, diaCorte)
  if (hoy <= corteEste) return { desde: sumarDias(corteDelMes(y, m - 1, diaCorte), 1), hasta: corteEste }
  return { desde: sumarDias(corteEste, 1), hasta: corteDelMes(y, m + 1, diaCorte) }
}

/** El período que empieza el día después del corte de `p`. */
export function periodoSiguiente(p: Periodo, diaCorte: number): Periodo {
  return periodoDe(sumarDias(p.hasta, 1), diaCorte)
}

/** El período que termina el día antes de que empiece `p`. */
export function periodoAnterior(p: Periodo, diaCorte: number): Periodo {
  return periodoDe(sumarDias(p.desde, -1), diaCorte)
}

export function enCurso(p: Periodo, hoy: string): boolean {
  return p.desde <= hoy && hoy <= p.hasta
}

const diaUTC = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}

/** Días que faltan para el corte (0 el mismo día del corte). */
export function diasHastaElCorte(hoy: string, p: Periodo): number {
  return Math.round((diaUTC(p.hasta) - diaUTC(hoy)) / 86_400_000)
}

/** `29/08 → 28/09`. */
export function textoPeriodo(p: Periodo): string {
  return `${diaMes(p.desde)} → ${diaMes(p.hasta)}`
}

/** Lo que acepta la columna `farmacia_ajustes.dia_corte` (0128). */
export function esDiaDeCorteValido(n: number): boolean {
  return Number.isInteger(n) && n >= 1 && n <= 31
}
