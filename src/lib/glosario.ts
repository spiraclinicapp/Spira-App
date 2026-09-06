import type { VisitStatus } from '../data/visits'

/**
 * El glosario de la jerga del centro: qué quiere decir cada término que la app da por sabido.
 *
 * POR QUÉ EXISTE. La crítica de diseño del 2026-09-06 puntuó "Ayuda y documentación" en 1 de 4, y
 * el hallazgo era literal: ni una sola palabra explicada en ninguna de las dos pantallas
 * principales. VNP, IVRS, ventana, adherencia, W12, "Pendiente vencido" — cero `title`, cero
 * tooltip, cero nota al pie. Una coordinadora con años en el centro no los necesita; una que entra
 * el lunes no tiene de dónde sacarlos, y en un entorno regulado adivinar el significado de un
 * rótulo es exactamente el error de operador que el principio 2 del producto busca evitar.
 *
 * TODO EL TEXTO VIVE ACÁ, EN UN SOLO ARCHIVO, y eso es a propósito: son definiciones de dominio que
 * el Director tiene que poder leer y corregir de una sentada, sin perseguirlas por seis vistas. Si
 * mañana la Fundación decide que "adherencia" se mide distinto, se corrige en un lugar.
 *
 * CÓMO SE ESCRIBEN. Una oración, en castellano rioplatense, que diga QUÉ ES — no cómo se usa la
 * pantalla. Sin jerga nueva adentro de la explicación (explicar "IVRS" con "randomización" no
 * ayuda a quien tampoco sabe qué es randomizar). Y sin afirmaciones clínicas o regulatorias que
 * este código no pueda respaldar: describen lo que Spira muestra, no lo que dice el protocolo.
 */

/** Términos generales del vocabulario del centro. */
export const GLOSARIO = {
  ivrs: 'IVRS: el número con el que el sistema del sponsor identifica a este paciente dentro del protocolo. El nombre es de este centro; el IVRS es del estudio.',
  protocolo: 'El código del estudio clínico al que pertenece esta visita. Un paciente puede estar enrolado en más de uno.',
  ventana: 'La ventana es el rango de fechas en el que la visita puede hacerse. Fuera de ese rango, la visita queda registrada como un desvío del cronograma.',
  adherencia: 'Qué porcentaje de las visitas previstas del cronograma ya se realizaron.',
  ventanasPorVencer: 'Cuántas visitas tienen su ventana venciendo en los próximos 7 días. Son las que conviene agendar primero.',
  visitasRealizadas: 'Cuántas visitas del cronograma ya se hicieron, sobre el total previsto para los pacientes de este protocolo.',
  pacientesEnrolados: 'Cuántos pacientes están enrolados en este protocolo, y cuántos de ellos siguen activos.',
  semana: 'La semana del cronograma, contada desde la randomización: W0 es la randomización, W4 son cuatro semanas después.',
  dia: 'El día del cronograma antes de la randomización, contado hacia atrás: el Día -28 es cuatro semanas antes de randomizar.',
  numeroDeVisita: 'Cuántas veces vino el paciente hasta acá, contando todas las visitas: las del cronograma y las sueltas.',
  reportePendiente: 'Un reporte de un procedimiento que ya se hizo y todavía no se cargó. El plazo empieza a correr cuando el procedimiento se marca realizado.',
} as const

export type ClaveGlosario = keyof typeof GLOSARIO

/**
 * Qué es cada tipo de visita SUELTA (las que no están en el cronograma del protocolo).
 *
 * Va por `VisitKind`, pero se busca por el texto que se muestra: los rótulos cortos ("Scr",
 * "Rando", "F+S") son los más opacos de la app y son justo los que se dibujan en las columnas
 * angostas, donde no entra nada más.
 */
export const GLOSARIO_TIPOS: Record<string, string> = {
  vnp: 'VNP — visita no programada: no estaba en el cronograma del protocolo y se registra cuando ocurre.',
  screening: 'Screening: la evaluación previa, donde se revisa si el paciente cumple las condiciones para entrar al estudio.',
  firma: 'Firma: la visita en la que el paciente firma el consentimiento informado.',
  firma_screening: 'Firma y Screening: las dos cosas en la misma visita — se firma el consentimiento y se hace la evaluación previa.',
  randomizacion: 'Randomización: la visita en la que el paciente queda asignado a una rama del estudio. Es el punto cero del cronograma.',
  retest: 'Retest: se repite un estudio o análisis cuyo resultado hay que volver a confirmar.',
}

/**
 * Qué significa cada estado clínico de una visita.
 *
 * Las claves son las mismas de `VISIT_STATES`, y el `Record` es CERRADO sobre `VisitStatus` a
 * propósito: agregar un estado a la base y olvidarse de explicarlo pasa a ser un error de
 * compilación en vez de un chip que nadie entiende. Es el mismo criterio que ya usa el registry de
 * vistas.
 */
export const GLOSARIO_ESTADOS: Record<VisitStatus, string> = {
  /* `futura` ya no se emite pero sigue en el enum de Postgres (ver `VISIT_STATES`): comparte el
     texto con `proxima` porque comparte la cara. */
  futura: 'La visita todavía no ocurrió y está dentro de lo esperado.',
  proxima: 'La visita todavía no ocurrió y está dentro de lo esperado.',
  en_atencion: 'El paciente está en el centro ahora mismo.',
  realizada: 'La visita se hizo, pero todavía queda algo por cerrar.',
  completa: 'La visita se hizo y no queda nada pendiente de ella.',
  item_vencido: 'La visita se hizo, pero algo suyo —un reporte, un procedimiento— pasó su fecha límite sin cerrarse.',
  ventana_vencida: 'Pasó la última fecha en la que esta visita podía hacerse y no se hizo.',
  por_reprogramar: 'El paciente no vino y la visita hay que volver a agendarla.',
}

/**
 * La ayuda de un rótulo de tipo de visita, buscando por el TEXTO que está en pantalla ("VNP",
 * "Rando", "Scr", "F+S"…) en vez de por la clave del enum.
 *
 * Existe porque el que dibuja el rótulo casi siempre tiene el string ya resuelto —`visitTitle()`
 * devuelve texto— y no el `kind`. Devuelve `undefined` para las programadas y para cualquier cosa
 * que no sea uno de los rótulos conocidos, que es lo correcto: un `title` que aparece sobre algo
 * que no lo necesita es ruido.
 */
const POR_ROTULO: Record<string, string> = {
  VNP: GLOSARIO_TIPOS.vnp,
  Scr: GLOSARIO_TIPOS.screening,
  Screening: GLOSARIO_TIPOS.screening,
  Firma: GLOSARIO_TIPOS.firma,
  'F+S': GLOSARIO_TIPOS.firma_screening,
  'Firma y Screening': GLOSARIO_TIPOS.firma_screening,
  Rando: GLOSARIO_TIPOS.randomizacion,
  Randomización: GLOSARIO_TIPOS.randomizacion,
  Retest: GLOSARIO_TIPOS.retest,
}

export function ayudaDeRotulo(rotulo: string | null | undefined): string | undefined {
  if (!rotulo) return undefined
  return POR_ROTULO[rotulo.trim()]
}
