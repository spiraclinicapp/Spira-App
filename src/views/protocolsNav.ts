import { resolveCode, resolveShortId, shortId } from '../lib/router'
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
 * El paciente, además, tiene que estar ENROLADO en el protocolo del path: el IVRS es único
 * globalmente, así que encontrarlo no alcanza (ver el chequeo de más abajo, es el corazón de esta
 * función).
 * También rechaza los segmentos que sobran: como mucho dos (protocolo y paciente), o uno solo
 * cuando el primero es `todos` — el spec (§8) pide la pantalla serena ante una ruta que no existe,
 * no que la cola sobrante se ignore en silencio.
 * `null` = el path apunta a algo que no está entre las filas visibles → la vista muestra "no se
 * encontró", que es lo mismo que ve quien no tiene permiso: distinguirlos filtraría qué existe.
 */
export function navDesdePath(path: string[], protocolos: ProtocolRow[], pacientes: PatientRow[]): Nav | null {
  if (path.length === 0) return { mode: 'list' }
  if (path[0] === 'todos') return path.length === 1 ? { mode: 'all' } : null
  if (path.length > 2) return null

  /* `resolveCode` ya resuelve el match exacto primero y recién si no hay cae a ignorar mayúsculas
     (y sólo si el resultado es único) — el orden código → short id que ya regía acá no cambia,
     sólo se vuelve tolerante a la caja en el primer paso. Se dicta por teléfono: quien escribe la
     URL no tiene por qué respetar cómo quedó guardado el código. */
  const protocolo = resolveCode(protocolos, path[0], (p) => p.code) ?? resolveShortId(protocolos, path[0])
  if (!protocolo) return null
  if (path.length === 1) return { mode: 'protocol', protocolId: protocolo.id }

  const token = path[1]
  const paciente =
    resolveCode(pacientes, token, (p) => p.code) ??
    resolveShortId(pacientes, token.startsWith('p-') ? token.slice(2) : token)
  if (!paciente) return null

  /* El IVRS identifica GLOBALMENTE (es `unique` en la base), así que encontrar al paciente no
     alcanza: hay que exigir que pertenezca al protocolo del path. Sin esto, /A/<ivrs-de-B> abre la
     ficha de B con el encabezado de A — cronograma vacío, enrolamiento ausente y, peor, el card de
     alertas mostrando las de su protocolo real. En una app auditable eso es contexto fabricado. */
  if (!paciente.enrollments.some((e) => e.protocol?.id === protocolo.id)) return null

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

/**
 * A qué posición de esta vista lleva "abrir la ficha del paciente X".
 *
 * La ficha necesita un protocolo de CONTEXTO —el cronograma, las visitas y la adherencia son del
 * enrolamiento, no de la persona—, y un paciente puede estar en varios. De ahí las dos entradas:
 *
 * - `protocolIdPedido` lo trae quien te mandó acá cuando lo sabe: las quince pantallas de nombre +
 *   IVRS muestran el protocolo en la MISMA fila que el nombre, así que no hay por qué adivinarlo.
 *   Sin esto, abrir la ficha desde una alerta de alguien enrolado en dos ensayos mostraba el
 *   cronograma del otro: la pantalla queda perfecta y el dato es de otro protocolo.
 * - Sin él —el buscador global, que resuelve una persona y no un enrolamiento— cae al enrolamiento
 *   primario, que es el mismo criterio que usa "Todos los pacientes".
 *
 * Un `protocolIdPedido` que el paciente NO tiene se ignora y cae a la heurística: abrir la ficha
 * bajo un protocolo ajeno sería peor que abrirla bajo el primario. Mismo criterio que
 * `resolveShortId` ante un empate — nunca se elige un destino al azar.
 */
export function resolverFichaDestino(
  patient: PatientRow | undefined,
  protocolIdPedido?: string,
): Nav | null {
  if (!patient) return null
  const propios = patient.enrollments.filter((e) => e.protocol != null)
  const pedido = protocolIdPedido
    ? propios.find((e) => e.protocol!.id === protocolIdPedido)
    : undefined
  const protocolId = (pedido ?? propios[0])?.protocol?.id ?? null
  /* Sin protocolo visible no hay ficha que abrir, pero al menos lo dejamos en "Todos los
     pacientes" —donde sí figura—, no en la grilla de protocolos, que sería desconcertante. */
  return protocolId ? { mode: 'patient', protocolId, patientId: patient.id } : { mode: 'all' }
}
