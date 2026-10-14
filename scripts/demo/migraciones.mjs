// Qué migraciones faltan aplicar en el demo. Puro (recibe nombres, no lee disco): lo testea el vitest de la app.
//
// La fuente de verdad es la misma que en prod: `supabase/migrations/NNNN_*.sql`, en orden (CLAUDE.md, regla 3).
// El demo lleva su propio registro en `demo.migraciones` (prod no lo tiene: ahí se aplican a mano).

/** Los archivos de migración en orden, validando la numeración contigua (como `check-migraciones.mjs`). */
export function ordenarMigraciones(nombres) {
  const archivos = nombres.filter((f) => /^\d{4}_.+\.sql$/.test(f)).sort()
  archivos.forEach((f, i) => {
    const esperado = String(i + 1).padStart(4, '0')
    if (f.slice(0, 4) !== esperado) throw new Error(`Numeración rota: esperaba ${esperado} y encontré ${f}.`)
  })
  return archivos
}

/**
 * Las que faltan, en orden. Si el registro tiene una que ya no está en el repo, o hay un hueco (aplicada la 0010
 * pero no la 0009), el demo quedó en un estado que el reset tiene que resolver: no se adivina.
 */
export function pendientes(todas, aplicadas) {
  const hechas = new Set(aplicadas)
  const fantasmas = [...hechas].filter((a) => !todas.includes(a))
  if (fantasmas.length) throw new Error(`El demo tiene aplicadas migraciones que no están en el repo: ${fantasmas.join(', ')}. Corré \`npm run demo:resetear\`.`)
  const faltan = todas.filter((m) => !hechas.has(m))
  const primeraFaltante = todas.indexOf(faltan[0])
  if (faltan.length && todas.slice(primeraFaltante).some((m) => hechas.has(m))) {
    throw new Error(`Hay un hueco en las migraciones del demo (falta ${faltan[0]} pero hay posteriores aplicadas). Corré \`npm run demo:resetear\`.`)
  }
  return faltan
}
