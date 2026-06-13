/**
 * Exportación CSV client-side (sin dependencias). Para reportes que el usuario
 * descarga; NO se manda nada al servidor.
 */

/** Escapa un valor para CSV (comillas dobles si tiene coma, comilla o salto). */
function cell(value: unknown): string {
  const s = value === null || value === undefined ? '' : String(value)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** Arma un CSV desde encabezados + filas (arrays de celdas). Antepone BOM para Excel. */
export function toCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers.map(cell).join(','), ...rows.map((r) => r.map(cell).join(','))]
  return '﻿' + lines.join('\r\n')
}

/** Dispara la descarga de un archivo CSV en el navegador. */
export function downloadCsv(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
