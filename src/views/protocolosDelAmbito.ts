import type { Ambito } from './resumen/ambito'

/**
 * ┌─ Qué protocolos lista Coordinación › Pacientes: "Mis estudios" o "Todos" ──────────────────────┐
 *
 * La grilla abre en los estudios que la persona tiene asignados (`protocol_coordinators`, lo que en
 * Ajustes se llama «Estudios que ve») y un alternador la abre a todos los que la RLS deja ver.
 * Decisión del Director (2026-09-15): un administrador de Coordinación ve TODOS los protocolos
 * —la policy "ver protocolos asignados" (0028) se lo permite para crear y gestionar cronogramas—,
 * pero sólo los pacientes de sus estudios (0006:152). Sin filtro, la grilla le mostraba ocho tarjetas
 * con cuatro en «0 pacientes», que se leían como estudios vacíos y no como estudios ajenos.
 *
 * ES LA MISMA IDEA QUE EL RESUMEN ("Lo mío" / "Todo", `resumen/ambito.ts`) y usa el mismo tipo y el
 * mismo `?ambito=` en la URL, así el que ya lo aprendió allá lo reconoce acá. "Mío" es la lectura
 * PROSPECTIVA de `esDeMisProtocolos`: qué me toca, no qué atendí — un protocolo no se atiende.
 *
 * VIVE APARTE Y PURA porque falla en silencio: invertida, la grilla se dibuja prolija con los estudios
 * de otro, o esconde los propios.
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 */

/**
 * Los protocolos del ámbito.
 *
 * QUIEN NO COORDINA NINGUNO ve todos, elija lo que elija: para gerencia o farmacia —que ven el centro
 * entero sin asignaciones— "Mis estudios" sería una grilla vacía que parece un error. Por el mismo
 * motivo el alternador no se dibuja para esa persona. El `Set` vacío también es lo que hay mientras
 * `useMyCoordinations` carga: la vista espera esa consulta antes de pintar, para que la grilla no
 * aparezca entera y se encoja un instante después.
 */
export function protocolosDelAmbito<P extends { id: string }>(
  protocolos: P[],
  ambito: Ambito,
  misProtocolos: Set<string>,
): P[] {
  if (ambito === 'todo' || misProtocolos.size === 0) return protocolos
  return protocolos.filter((p) => misProtocolos.has(p.id))
}
