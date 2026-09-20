/**
 * ┌─ El día y la semana de una visita del cuadro ──────────────────────────────────────────────┐
 *
 * En la base hay UN solo número: `offset_days`, los días desde la randomización en los que cae la
 * visita según el cuadro del protocolo. Pero el protocolo se escribe en semanas y la coordinadora
 * piensa en semanas, así que el formulario muestra el mismo número de las dos maneras y ata las
 * dos casillas: completás una y la otra se calcula. La semana NO se guarda — es el día dicho en
 * otra unidad.
 *
 * Y el NOMBRE de la visita no entra acá. Hasta el 2026-09-20 el nombre ERA la semana ("W48",
 * derivado y bloqueado); ahora es texto libre, porque lo van a querer personalizar y tiene que
 * poderse (decisión del Director). Lo único que queda del nombre en este archivo es la PROPUESTA
 * por etapa, que es una cortesía al elegir "Screening" o "Randomización", no una imposición.
 *
 * POR QUÉ ES PURO Y CON TEST. Un atajo entre dos casillas falla en silencio de tres maneras, y en
 * las tres la pantalla se dibuja perfecta:
 *
 *  1. **Queda al revés.** Multiplicar donde había que dividir da un número plausible (semana 2352
 *     en vez de 48) que nadie mira dos veces hasta que se generan las visitas de un paciente.
 *  2. **Rebota.** Si las dos direcciones se disparan con el VALOR y no con la edición, escribir el
 *     día 335 pone semana 48 y la semana 48 devuelve el día a 336: el campo se corrige solo a tus
 *     espaldas. Acá cada función es una sola dirección y ninguna se llama a sí misma.
 *  3. **Borra la otra casilla.** Mientras retipeás, la casilla que estás editando pasa por vacía y
 *     por inválida. Si en esos estados escribiéramos en la otra, se vaciaría sola. Por eso las dos
 *     direcciones devuelven `null` —no tocar— salvo que lo escrito sea un entero de verdad.
 *
 * El criterio de qué se testea y qué no está en `src/views/pharma/dispensaciones/estados.test.ts`.
 * └────────────────────────────────────────────────────────────────────────────────────────────┘
 */

/* Una sola "etapa de la visita" de dominio que deriva role + date_mode, en vez de exponer los dos
   enums crudos (que permitirían combinaciones sin sentido como "screening automática").
   screening/randomización son siempre pre-rando (libres). */
export type Etapa = 'screening' | 'randomizacion' | 'tratamiento' | 'manual'

/** Los días que tiene una semana del protocolo. Nombrado para que la división no sea un 7 suelto. */
const DIAS_POR_SEMANA = 7

/** El entero que hay escrito en una casilla, o null si lo que hay no es uno (vacío incluido). */
function entero(v: string): number | null {
  if (v.trim() === '') return null
  const n = Number(v)
  return Number.isInteger(n) ? n : null
}

/**
 * Qué semana queda al editar el DÍA. `null` = no tocar la casilla de al lado, que es el caso de
 * todos los estados de paso: vacía, un signo menos solo, un decimal a medio escribir.
 * Redondea: el día 335 es la semana 48, aunque 48 no vuelva a dar 335.
 */
export function semanaTrasCambiarDia(dia: string): string | null {
  const n = entero(dia)
  return n === null ? null : String(Math.round(n / DIAS_POR_SEMANA))
}

/** Qué día queda al editar la SEMANA. `null` = no tocar. Es una multiplicación exacta, sin redondeo. */
export function diaTrasCambiarSemana(semana: string): string | null {
  const n = entero(semana)
  return n === null ? null : String(n * DIAS_POR_SEMANA)
}

/**
 * La semana con la que ABRE el formulario, calculada del día que trae la fila. Es la misma cuenta
 * que `semanaTrasCambiarDia`, pero acá el "no tocar" se convierte en casilla vacía: al abrir no hay
 * nada que preservar.
 */
export function semanaInicial(dia: string): string {
  return semanaTrasCambiarDia(dia) ?? ''
}

/**
 * El nombre que la app PROPONE para cada etapa. Tratamiento y "otra manual" no proponen nada: ahí
 * el nombre es enteramente del usuario (antes tratamiento imponía la semana, y es justo lo que se
 * vino a soltar).
 */
export function propuestaDeEtapa(etapa: Etapa): string {
  if (etapa === 'screening') return 'Screening'
  if (etapa === 'randomizacion') return 'Randomización'
  return ''
}

/**
 * Qué nombre queda al cambiar de ETAPA. El nombre sigue a la propuesta nueva sólo si estaba vacío
 * o si era la propuesta de la etapa anterior — o sea, si nunca fue del usuario. Si lo escribió él,
 * se queda como está aunque la etapa ya no le corresponda: corregirlo es decisión suya.
 */
export function nombreTrasCambiarEtapa(nombre: string, anterior: Etapa, nueva: Etapa): string {
  const eraDeLaApp = nombre.trim() === '' || nombre === propuestaDeEtapa(anterior)
  return eraDeLaApp ? propuestaDeEtapa(nueva) : nombre
}
