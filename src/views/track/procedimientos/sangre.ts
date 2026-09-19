// «Lleva sangre» por procedimiento del estudio (migración 0134). Reglas puras con test: el mapeo
// entre el editor y la base, y la cuenta de lo que falta definir. Plan: `docs/plan-resumen-de-visita.md`
// (D3, D19).
//
// TRES valores y no dos, a propósito (D3): `true` / `false` / `null` = sin definir. La columna nace
// sin default, así que todo lo cargado antes de la 0134 arranca sin definir. Si arrancara en `false`,
// la agenda del día diría «Sin sangre» en todas las visitas sin que nadie lo hubiera afirmado — y en
// una agenda clínica eso se lee como un hecho (ayuno, tubos, courier).

/** Los tres valores del editor. Texto y no booleano: el `SegmentedControl` trabaja con strings. */
export type OpcionSangre = 'si' | 'no' | 'sin_definir'

/** Las opciones del editor, en orden. «Sin definir» va último: es la salida, no una respuesta. */
export const OPCIONES_SANGRE: readonly { value: OpcionSangre; label: string }[] = [
  { value: 'si', label: 'Sí' },
  { value: 'no', label: 'No' },
  { value: 'sin_definir', label: 'Sin definir' },
]

/** De la base al editor. `undefined` (una fila que no trae la columna) se lee como sin definir. */
export function opcionDeSangre(v: boolean | null | undefined): OpcionSangre {
  if (v === true) return 'si'
  if (v === false) return 'no'
  return 'sin_definir'
}

/** Del editor a la base. */
export function sangreDeOpcion(o: OpcionSangre): boolean | null {
  if (o === 'si') return true
  if (o === 'no') return false
  return null
}

/**
 * Cuántos procedimientos del estudio todavía no dicen si llevan sangre.
 *
 * Es el número que decide cuándo puede salir la agenda con la gota (D19): el rediseño de Visitas del
 * día no se despliega hasta que da cero en los protocolos en uso. Un «no» cuenta como definido —es
 * una afirmación, no una ausencia—.
 */
export function sinDefinirSangre(procs: readonly { draws_blood: boolean | null }[]): number {
  return procs.filter((p) => p.draws_blood === null).length
}

/** Cómo se dice en la lista del estudio. */
export function rotuloSangre(v: boolean | null): string {
  if (v === true) return 'Lleva sangre'
  if (v === false) return 'No lleva sangre'
  return 'Sangre sin definir'
}
