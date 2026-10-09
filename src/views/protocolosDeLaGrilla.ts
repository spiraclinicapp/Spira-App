/**
 * ┌─ Qué protocolos lista Coordinación › Estudios y pacientes ──────────────────────────────────────┐
 *
 * LOS ESTUDIOS CUYOS PACIENTES VES. Ni uno más.
 *
 * Hasta el 2026-10-09 la grilla tenía un alternador «Mis estudios / Todos». «Todos» abría los
 * protocolos que la RLS deja ver, y ahí estaba el problema: a jefatura la policy de protocolos (0028)
 * le muestra todos, pero la de pacientes (0006) sólo los de sus estudios asignados. Las tarjetas
 * ajenas decían «0 pacientes» —AIRLYMPUS, VICTORION— y el cero no era un dato, era falta de acceso.
 * En una app auditable eso es un número inventado. El alternador ya había nacido para esconder ese
 * mismo cero (2026-09-15); sólo lo había mudado de lugar. Decisión del Director tras la critique:
 * sacar «Todos» de acá. Los estudios ajenos se gestionan (datos y cronograma) desde
 * Ajustes › Estudios del centro, que no cuenta pacientes.
 *
 * La regla es la MISMA que la RLS de `enrollments` ("ver enrolamientos de mis protocolos", 0146):
 * gerencia ve los pacientes de todos; el resto, los de `protocolos_que_coordino()`. Así el conteo de
 * cada tarjeta es siempre un número real. Farmacia no pasa por acá (`veTodos`): sus protocolos y sus
 * pacientes salen del mismo alcance (`pharma_alcanza_protocolo`), así que no tiene ceros falsos.
 *
 * VIVE APARTE Y PURA porque falla en silencio: invertida, la grilla se dibuja prolija con los estudios
 * de otro, o esconde los propios.
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 */

/**
 * Los protocolos de la grilla.
 *
 * `veTodos` = quien ve los pacientes de todos los estudios (gerencia), o una vista que no es la de
 * Coordinación. Si no, sólo los asignados. Un asignado que no está en `protocolos` (un estudio
 * borrado) no inventa una tarjeta: se filtra la lista, no se recorre el `Set`.
 */
export function protocolosDeLaGrilla<P extends { id: string }>(
  protocolos: P[],
  { veTodos, misProtocolos }: { veTodos: boolean; misProtocolos: Set<string> },
): P[] {
  if (veTodos) return protocolos
  return protocolos.filter((p) => misProtocolos.has(p.id))
}

/**
 * ¿Esta persona ve los pacientes de este estudio? Es la pregunta de cada tarjeta y del tablero de un
 * protocolo abierto por URL o desde el buscador: un estudio ajeno se puede abrir —para editarlo o
 * armarle el cronograma—, pero su tablero no puede decir «Sin pacientes» cuando lo que pasa es que no
 * te toca verlos.
 */
export function veSusPacientes(
  protocolId: string,
  { veTodos, misProtocolos }: { veTodos: boolean; misProtocolos: Set<string> },
): boolean {
  return veTodos || misProtocolos.has(protocolId)
}
