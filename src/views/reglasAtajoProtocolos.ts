/**
 * Las reglas del atajo de tarjetas de protocolo (Pendientes y Stock), sin React.
 *
 * Están aparte porque fallan EN SILENCIO: si la pista contara mal, la pantalla diría «1 de 3
 * protocolos» sobre una lista vacía y se vería igual de prolija. Es lo que pasaba con un protocolo
 * enfocado que se quedaba sin pendientes: su tarjeta desaparecía, el filtro seguía en la URL y la
 * pista contaba `seleccionados.length` sin cruzarlo con las tarjetas (crítica de diseño, 2026-10-03).
 */

export interface EstadoDelAtajo {
  /** Los elegidos que tienen tarjeta: los que se ven marcados. */
  vigentes: string[]
  /** Los elegidos SIN tarjeta: siguen filtrando, pero no hay nada en la tira que lo diga. */
  huerfanos: string[]
}

export function estadoDelAtajo(conTarjeta: readonly string[], seleccionados: readonly string[]): EstadoDelAtajo {
  const hay = new Set(conTarjeta)
  return {
    vigentes: seleccionados.filter((id) => hay.has(id)),
    huerfanos: seleccionados.filter((id) => !hay.has(id)),
  }
}

/**
 * La pista a la derecha del título. Sin nada elegido enseña el gesto; con algo elegido dice cuántos
 * protocolos —con la unidad, porque 40 px más abajo hay otro «6 de 30» que cuenta pendientes—.
 * null cuando lo único elegido es huérfano: ahí habla el aviso, y «0 de 3 protocolos» no ayuda.
 */
export function pistaDelAtajo(conTarjeta: number, e: EstadoDelAtajo, objeto: 'lista' | 'tabla'): string | null {
  if (e.vigentes.length === 0) return e.huerfanos.length === 0 ? `Elegí uno para enfocar la ${objeto} de abajo` : null
  return `${e.vigentes.length} de ${conTarjeta} ${conTarjeta === 1 ? 'protocolo' : 'protocolos'}`
}

/**
 * «ACT18301 ya no tiene pendientes», «ACT18301 y 222714 ya no tienen pendientes». Sin soltar el
 * filtro por su cuenta: cambiaría lo que se ve sin avisar, y el «Ver todos» queda al lado.
 * `codigos` trae null cuando el catálogo todavía no cargó: se nombra igual, sin el código.
 */
export function avisoDeHuerfanos(codigos: readonly (string | null)[], sinNada: { uno: string; varios: string }): string | null {
  if (codigos.length === 0) return null
  const conocidos = codigos.filter((c): c is string => c != null)
  const anonimos = codigos.length - conocidos.length
  const nombres = [
    ...conocidos,
    ...(anonimos === 0 ? [] : [anonimos === 1 ? (conocidos.length ? 'otro protocolo elegido' : 'un protocolo elegido') : `${anonimos} protocolos elegidos`]),
  ]
  const lista = new Intl.ListFormat('es', { type: 'conjunction' }).format(nombres)
  const texto = `${lista} ${codigos.length === 1 ? sinNada.uno : sinNada.varios}`
  return texto.charAt(0).toUpperCase() + texto.slice(1)
}

/**
 * El pie de cada tarjeta. Tocar una tarjeta SUMA (Director, 2026-10-03: se queda aditivo), así que
 * con algo ya elegido «Ver sólo este» mentía: mostraba los dos. Ahí dice lo que hace.
 */
export function pieDeTarjeta(sel: boolean, haySeleccion: boolean): 'Enfocado' | 'Sumar' | 'Ver sólo este' {
  if (sel) return 'Enfocado'
  return haySeleccion ? 'Sumar' : 'Ver sólo este'
}
