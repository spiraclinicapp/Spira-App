import { resolveShortId, shortId } from '../lib/router'
import type { PatientRow } from '../data/patients'
import type { ProtocolRow } from '../data/protocols'

/* El mismo tipo Nav que ya usaba la vista; ahora se deriva del path de la URL en vez de un useState. */
export type Nav =
  | { mode: 'list' }
  | { mode: 'all' }
  | { mode: 'protocol'; protocolId: string }
  | { mode: 'patient'; protocolId: string; patientId: string }

/**
 * Los segmentos de la URL → posición interna de la vista.
 *
 * Acepta el código legible Y el uuid: una URL vieja con uuid tiene que seguir andando cuando ese
 * paciente recibe su IVRS más adelante (que es lo que le pasa a TODO paciente de screening).
 * `null` = el path apunta a algo que no está entre las filas visibles → la vista muestra "no se
 * encontró", que es lo mismo que ve quien no tiene permiso: distinguirlos filtraría qué existe.
 */
export function navDesdePath(path: string[], protocolos: ProtocolRow[], pacientes: PatientRow[]): Nav | null {
  if (path.length === 0) return { mode: 'list' }
  if (path[0] === 'todos') return { mode: 'all' }

  const protocolo = protocolos.find((p) => p.code === path[0]) ?? resolveShortId(protocolos, path[0])
  if (!protocolo) return null
  if (path.length === 1) return { mode: 'protocol', protocolId: protocolo.id }

  const token = path[1]
  const paciente =
    pacientes.find((p) => p.code === token) ??
    resolveShortId(pacientes, token.startsWith('p-') ? token.slice(2) : token)
  if (!paciente) return null

  return { mode: 'patient', protocolId: protocolo.id, patientId: paciente.id }
}

/**
 * Posición interna → segmentos de la URL. Se ESCRIBE siempre el legible: el código del protocolo, y
 * el IVRS del paciente si lo tiene. Sin IVRS va `p-` + los 8 primeros del uuid — el prefijo evita que
 * se confunda con un IVRS, que es numérico.
 */
export function pathDesdeNav(nav: Nav, protocolos: ProtocolRow[], pacientes: PatientRow[]): string[] {
  if (nav.mode === 'list') return []
  if (nav.mode === 'all') return ['todos']

  const protocolo = protocolos.find((p) => p.id === nav.protocolId)
  const segProtocolo = protocolo?.code ?? shortId(nav.protocolId)
  if (nav.mode === 'protocol') return [segProtocolo]

  const paciente = pacientes.find((p) => p.id === nav.patientId)
  const segPaciente = paciente?.code ?? `p-${shortId(nav.patientId)}`
  return [segProtocolo, segPaciente]
}
