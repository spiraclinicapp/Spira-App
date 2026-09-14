/**
 * La línea de reposición de cada medicamento en «Editar medicación» (plan de reposición, D2 y D27).
 *
 *   situación                                          qué se lee                                     control
 *   inactiva                                           nada (no suma)                                 —
 *   habilitada para UNA entrega (habilitacion_id)      «Para una sola entrega: no suma en las compras»  ninguno (D27)
 *   el estudio no la cargó                             «Todavía no se cargó cómo se repone en el estudio» ninguno
 *   el estudio: no se compra                           «No se compra en el estudio»                    ninguno
 *   el estudio: a demanda                              «A demanda en el estudio: no se carga por paciente» ninguno
 *   el estudio: por mes, sin excepción                 «1 por mes, la del estudio»                     Cambiar
 *   el estudio: por mes, con excepción                 «2 por mes, sólo este paciente»                 Volver a la del estudio
 *
 * POR QUÉ ES PURO Y CON TEST. Ofrecer el control en una asignación con `habilitacion_id` no se ve mal:
 * funciona, y el trigger de la 0124 le borra en silencio la marca de «una entrega», así que el
 * «Otro medicamento» con receta queda habilitado para siempre. Y una excepción cargada en un estudio
 * a demanda se guardaría sin sumar nunca a nada.
 */

export type ModoEstudio = 'mensual' | 'a_demanda' | 'no_se_compra' | null

export interface ReposicionDelEstudio {
  medication_id: string
  reposicion_modo: ModoEstudio
  envases_por_mes: number | null
}

export interface AsignacionParaLinea {
  medication_id: string
  active: boolean
  habilitacion_id: string | null
  envases_por_mes: number | null
}

export type AccionExcepcion = 'cambiar' | 'volver' | null

export interface LineaReposicion {
  texto: string
  accion: AccionExcepcion
  /** La cantidad del estudio, para decirla al editar («El estudio dice 1»). */
  delEstudio: number | null
}

const porMes = (n: number) => `${n} por mes`

export function lineaDeReposicion(a: AsignacionParaLinea, estudio: readonly ReposicionDelEstudio[]): LineaReposicion | null {
  if (!a.active) return null
  if (a.habilitacion_id) return { texto: 'Para una sola entrega: no suma en las compras', accion: null, delEstudio: null }
  const e = estudio.find((x) => x.medication_id === a.medication_id)
  if (!e || e.reposicion_modo == null) return { texto: 'Todavía no se cargó cómo se repone en el estudio', accion: null, delEstudio: null }
  if (e.reposicion_modo === 'no_se_compra') return { texto: 'No se compra en el estudio', accion: null, delEstudio: null }
  if (e.reposicion_modo === 'a_demanda') return { texto: 'A demanda en el estudio: no se carga por paciente', accion: null, delEstudio: null }
  const delEstudio = e.envases_por_mes
  if (a.envases_por_mes != null) return { texto: `${porMes(a.envases_por_mes)}, sólo este paciente`, accion: 'volver', delEstudio }
  return { texto: `${porMes(delEstudio ?? 0)}, la del estudio`, accion: 'cambiar', delEstudio }
}
