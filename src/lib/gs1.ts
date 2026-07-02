/**
 * Parser puro de DataMatrix GS1: descompone la cadena que emite el lector 2D en sus
 * Application Identifiers (AIs). Sin dependencias, sin estado.
 *
 * ⚠️ NO se usa para el Producto de Investigación (IP). El IP pasó a ingreso MACRO por cantidad
 * (0038): ya no se escanea kit por kit; la trazabilidad por kit la lleva el sponsor/IRT.
 *
 * Queda reservado para el escaneo de medicación COMERCIAL (Tajada 1b), donde el DataMatrix sí
 * trae GTIN + lote + vto en AIs. Ojo: los AIs de longitud FIJA (01 GTIN=14, 17 vto=6) vienen
 * pegados al siguiente AI; solo los de longitud VARIABLE (10 lote, 21 serial) terminan en el
 * separador FNC1 (GS, \x1d) o en fin de string. El lector 2D debe emitir FNC1.
 */
export interface Gs1Parsed {
  ais: Record<string, string>
  gtin?: string
  kitNumber?: string
  lotNumber?: string
  expiryDate?: string // YYYY-MM-DD
  isGs1: boolean
}

const GS = '\x1d' // FNC1 / Group Separator
// Longitud fija (en dígitos) de los AIs de interés. Los que no están acá son de longitud variable.
const FIXED_LEN: Record<string, number> = { '01': 14, '17': 6, '11': 6, '15': 6, '13': 6 }

/** YYMMDD → YYYY-MM-DD. DD=00 = fin de mes. Año con ventana de pivote ±50 respecto del actual. */
function gs1Date(yymmdd: string): string | undefined {
  if (!/^\d{6}$/.test(yymmdd)) return undefined
  const yy = Number(yymmdd.slice(0, 2))
  const mm = Number(yymmdd.slice(2, 4))
  let dd = Number(yymmdd.slice(4, 6))
  const nowYY = new Date().getFullYear() % 100
  // Pivote: si yy está más de 50 años adelante del actual, es del siglo pasado.
  const century = yy - nowYY > 50 ? 1900 : 2000
  const year = century + yy
  if (mm < 1 || mm > 12) return undefined
  if (dd === 0) dd = new Date(year, mm, 0).getDate() // último día del mes
  const p = (n: number) => String(n).padStart(2, '0')
  return `${year}-${p(mm)}-${p(dd)}`
}

export function parseGs1(raw: string): Gs1Parsed {
  const s = (raw ?? '').trim()
  const ais: Record<string, string> = {}
  let i = 0
  let matched = false
  while (i < s.length) {
    if (s[i] === GS) { i++; continue }
    const ai2 = s.slice(i, i + 2)
    const len = FIXED_LEN[ai2]
    if (len !== undefined) {
      const value = s.slice(i + 2, i + 2 + len)
      if (value.length < len) break // truncado; cortamos sin romper
      ais[ai2] = value
      i += 2 + len
      matched = true
    } else if (ai2 === '10' || ai2 === '21') {
      // Longitud variable: hasta el próximo FNC1 o fin de string.
      let end = s.indexOf(GS, i + 2)
      if (end === -1) end = s.length
      ais[ai2] = s.slice(i + 2, end)
      i = end
      matched = true
    } else {
      // AI desconocido o cadena que no es GS1 (ej. EAN-13 pelado): no seguimos parseando.
      break
    }
  }
  const gtin = ais['01']
  const lotNumber = ais['10'] || undefined
  const expiryDate = ais['17'] ? gs1Date(ais['17']) : undefined
  const kitNumber = ais['21'] || undefined // ⚠️ supuesto: el N° de kit viene en el serial (21)
  // matched se pone en true recién al agregar un AI a `ais`, así que ya implica ais no vacío.
  return { ais, gtin, kitNumber, lotNumber, expiryDate, isGs1: matched }
}
