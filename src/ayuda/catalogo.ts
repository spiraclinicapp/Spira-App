import { normalizar } from '../lib/texto'
import type { Tutorial } from './tutoriales'
import type { ModuloAyuda } from './reglas'

/* ============================================================================
   Reglas de los tutoriales en video: cuáles están publicados, quién los ve, dónde se ofrecen, de dónde se
   bajan y cómo se nombran. Plan: docs/plan-tutoriales.md (D9, DD5, DD8b-d).

   PURAS Y CON TEST porque fallan en silencio: un tutorial que no aparece no se ve "roto", simplemente no
   está; una URL mal armada da un video que no carga sólo en prod; y un «1:20» que dice 1:19 en la píldora y
   1:20 en el reproductor es la clase de detalle que hace dudar de todo lo demás.
   ============================================================================ */

export interface Capitulo { inicioMs: number; titulo: string }

/** Lo que escribe la fábrica por tutorial, en `tutoriales.meta.json` (`tutoriales/lib/grabar.ts`, `escribirMeta`). */
export interface MetaTutorial {
  /** Hash corto del mp4: va en la ruta de Storage, así un video regrabado nunca choca con la caché del viejo. */
  version: string
  duracionMs: number
  capitulos: Capitulo[]
  /** Lo que dice la voz, paso por paso: la alternativa al medio (WCAG 1.2.x). */
  transcripcion: string[]
}

export type Meta = Record<string, MetaTutorial | undefined>

export interface Publicado extends Tutorial { meta: MetaTutorial }

/** Los del catálogo que tienen un video grabado (versión y duración en el meta), en el orden del catálogo. */
export function publicados(catalogo: readonly Tutorial[], meta: Meta): Publicado[] {
  return catalogo.flatMap((t) => {
    const m = meta[t.id]
    return m && m.version.trim() !== '' && m.duracionMs > 0 ? [{ ...t, meta: m }] : []
  })
}

/** Los que ve el usuario: los generales y los de sus módulos (como las preguntas: texto del repo, sin RLS). */
export function visiblesPara(lista: readonly Publicado[], isAllowed: (moduleKey: string) => boolean): Publicado[] {
  return lista.filter((t) => t.modulo === 'general' || isAllowed(t.modulo))
}

/** El tutorial que se ofrece en la pantalla `"<modulo>/<sub>"` (la píldora del título), o null. */
export function tutorialDeLaVista(visibles: readonly Publicado[], moduleKey: string, subKey: string): Publicado | null {
  return visibles.find((t) => t.vista === `${moduleKey}/${subKey}`) ?? null
}

/** Los del alcance del panel: los del módulo y los generales; `null` = todos. */
export function tutorialesDelAlcance(visibles: readonly Publicado[], modulo: ModuloAyuda | null): Publicado[] {
  return modulo ? visibles.filter((t) => t.modulo === modulo || t.modulo === 'general') : [...visibles]
}

/** Con texto, como las preguntas: en todo lo visible, por título, resumen, descripción y lo que dice la voz. */
export function buscarTutoriales(visibles: readonly Publicado[], termino: string): Publicado[] {
  const t = normalizar(termino.trim())
  if (!t) return [...visibles]
  return visibles.filter((x) =>
    [x.titulo, x.resumen, x.descripcion, ...x.meta.transcripcion].some((campo) => normalizar(campo).includes(t)))
}

/** El que sigue en la lista (el orden de un curso), o null si es el último. */
export function siguienteDe(visibles: readonly Publicado[], id: string): Publicado | null {
  const i = visibles.findIndex((t) => t.id === id)
  return i >= 0 && i < visibles.length - 1 ? visibles[i + 1] : null
}

/* —— Storage —— */

/**
 * La carpeta pública de los tutoriales, en el MISMO proyecto de Supabase que usa la app: en prod, el bucket de
 * prod (D9); en el demo, el del demo. Así no hace falta otra variable de entorno que pueda quedar apuntando a
 * otro lado.
 */
export function baseDeTutoriales(supabaseUrl: string): string {
  return `${supabaseUrl.replace(/\/+$/, '')}/storage/v1/object/public/tutoriales`
}

export type ArchivoTutorial = 'video.mp4' | 'subtitulos.vtt' | 'poster.jpg'

/** `<base>/<id>/<versión>/<archivo>`: la ruta que deja la fábrica en `tutoriales/salida/`. */
export function urlDelTutorial(base: string, t: { id: string; meta: { version: string } }, archivo: ArchivoTutorial): string {
  return `${base}/${encodeURIComponent(t.id)}/${encodeURIComponent(t.meta.version)}/${archivo}`
}

/**
 * Por qué no cargó un video, según la respuesta que dé el archivo pedido de nuevo (`null` = ni respondió).
 * El `<video>` no dice el status HTTP de su error, y los dos casos piden mensajes distintos: «todavía no está
 * disponible» no se arregla reintentando (la versión del meta no se subió a Storage), «sin conexión» sí.
 * Storage contesta 400 —no 404— a un objeto que no existe en un bucket público: los dos cuentan como «no está».
 */
export function motivoDelError(status: number | null): 'noDisponible' | 'sinRed' {
  return status === 400 || status === 404 ? 'noDisponible' : 'sinRed'
}

/* —— Tiempos —— */

/**
 * Segundos enteros TRUNCADOS, como los muestra el reproductor nativo: un video de 15,56 s dice «0:15» en sus
 * controles, y la píldora tiene que decir lo mismo (redondeando decía «0:16»; QA de T5).
 */
function segundos(ms: number): number {
  return Math.max(0, Math.floor(ms / 1000))
}

/** «1:20», «0:45». Para la píldora, el chip del póster y los capítulos. */
export function duracionCorta(ms: number): string {
  const s = segundos(ms)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** «1 minuto 20 segundos»: el nombre accesible del play (un lector lee «1:20» como «uno dos puntos veinte»). */
export function duracionHablada(ms: number): string {
  const s = segundos(ms)
  const min = Math.floor(s / 60)
  const seg = s % 60
  const partes = [
    min ? `${min} ${min === 1 ? 'minuto' : 'minutos'}` : '',
    seg || !min ? `${seg} ${seg === 1 ? 'segundo' : 'segundos'}` : '',
  ]
  return partes.filter(Boolean).join(' ')
}

/** El capítulo que se está viendo en `ms`: el último que ya empezó. -1 si todavía no empezó ninguno. */
export function capituloActual(capitulos: readonly Capitulo[], ms: number): number {
  let actual = -1
  capitulos.forEach((c, i) => { if (c.inicioMs <= ms) actual = i })
  return actual
}

/** Cuánto del capítulo `i` ya se vio (0 a 1): la barrita del capítulo actual. */
export function progresoDelCapitulo(capitulos: readonly Capitulo[], i: number, ms: number, duracionMs: number): number {
  if (i < 0 || i >= capitulos.length) return 0
  const inicio = capitulos[i].inicioMs
  const fin = i + 1 < capitulos.length ? capitulos[i + 1].inicioMs : duracionMs
  return fin > inicio ? Math.min(1, Math.max(0, (ms - inicio) / (fin - inicio))) : 1
}
