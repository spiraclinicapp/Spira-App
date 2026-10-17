import { normalizar } from '../lib/texto'

/* ============================================================================
   El texto de la Ayuda en pedazos: lo que va resaltado por la búsqueda y lo que va como rótulo de botón. Plan:
   docs/plan-ayuda-manual.md (A18) y el handoff, §2 «Búsqueda» y §3 «Nombres de botones».

   PURO Y CON TEST porque falla en silencio de una manera concreta: la búsqueda NO distingue tildes ni mayúsculas
   (`normalizar`), y normalizar puede cambiar el largo del texto. Con la tilde escrita como un solo carácter («ó»,
   lo común) el largo no cambia; con la letra y el acento como dos caracteres («o» + acento suelto, lo que deja
   un texto pegado desde una Mac) sí, y cortar el original con las posiciones del texto normalizado marca un
   pedazo corrido sin que nadie lo vea roto: se ve «raro». Por eso se lleva un mapa de posiciones. (La prueba de
   mutación del 2026-10-18 lo confirmó: sin el mapa, sólo falla el caso del acento suelto.)

   Devuelve pedazos y no HTML: la vista los dibuja con React, sin `innerHTML`.
   ============================================================================ */

export interface Pedazo {
  texto: string
  /** Coincide con lo que se buscó: va con `<mark>`. */
  marcado: boolean
  /** Iba entre «»: es texto que aparece tal cual en pantalla (un botón, un estado, una opción). Va como rótulo. */
  rotulo: boolean
}

/** El texto partido en lo que coincide con `termino` y lo que no, sin distinguir tildes ni mayúsculas. */
export function resaltar(texto: string, termino: string): { texto: string; marcado: boolean }[] {
  const buscado = normalizar(termino.trim())
  if (!texto) return []
  if (!buscado) return [{ texto, marcado: false }]

  /* `plano` es `texto` normalizado; `origen[i]` dice de qué posición de `texto` salió la unidad `i` de `plano`. */
  let plano = ''
  const origen: number[] = []
  for (let i = 0; i < texto.length;) {
    const caracter = String.fromCodePoint(texto.codePointAt(i)!)
    const normal = normalizar(caracter)
    for (let k = 0; k < normal.length; k++) { plano += normal[k]; origen.push(i) }
    i += caracter.length
  }

  const pedazos: { texto: string; marcado: boolean }[] = []
  let corte = 0
  for (let desde = 0, k = plano.indexOf(buscado); k !== -1; k = plano.indexOf(buscado, desde)) {
    const inicio = origen[k]
    /* El fin es donde empieza lo que sigue, así una tilde suelta (letra + acento combinado) queda adentro. */
    const fin = k + buscado.length < origen.length ? origen[k + buscado.length] : texto.length
    if (inicio > corte) pedazos.push({ texto: texto.slice(corte, inicio), marcado: false })
    pedazos.push({ texto: texto.slice(inicio, fin), marcado: true })
    corte = fin
    desde = k + buscado.length
  }
  if (corte < texto.length) pedazos.push({ texto: texto.slice(corte), marcado: false })
  return pedazos
}

/**
 * Lo que va entre «» sale como rótulo, sin las comillas. Convención del contenido de la Ayuda (A18): «» es
 * texto que aparece tal cual en pantalla. Una « sin cerrar queda como está: es texto, no un rótulo roto.
 */
export function conRotulos(texto: string): { texto: string; rotulo: boolean }[] {
  const pedazos: { texto: string; rotulo: boolean }[] = []
  let corte = 0
  for (const m of texto.matchAll(/«([^«»]+)»/g)) {
    const inicio = m.index!
    if (inicio > corte) pedazos.push({ texto: texto.slice(corte, inicio), rotulo: false })
    pedazos.push({ texto: m[1], rotulo: true })
    corte = inicio + m[0].length
  }
  if (corte < texto.length) pedazos.push({ texto: texto.slice(corte), rotulo: false })
  return pedazos
}

/**
 * Las dos cosas juntas, que es lo que dibuja la Ayuda: rótulos, y adentro y afuera de ellos lo buscado
 * resaltado. Una coincidencia que cruza el borde de un rótulo («botón «Prep» + «arar»») no se resalta: la
 * búsqueda igual la encuentra, sólo no la marca.
 */
export function pedazosDeAyuda(texto: string, termino = ''): Pedazo[] {
  return conRotulos(texto).flatMap(({ texto: t, rotulo }) =>
    resaltar(t, termino).map((r) => ({ ...r, rotulo })))
}
