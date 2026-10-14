/* ============================================================================
   Las reglas de `npm run tutoriales:publicar` (docs/plan-tutoriales.md, «Publicar»): QUÉ se sube al Storage de
   prod, con qué tipo y con qué cuenta.

   El límite de verdad lo pone la base: la 0157 deja a la cuenta dedicada SUBIR al bucket `tutoriales` y nada más.
   Esto es el segundo cerrojo, del lado del script: sólo arma una ruta si es exactamente `<id>/<versión>/<archivo>`
   de un tutorial. Puro y con test: si se afloja, nada se ve roto hasta que un video aterriza donde no debía.
   ============================================================================ */

export const BUCKET = 'tutoriales'

/** La cuenta de Auth dedicada a publicar (la nombra la 0157, `es_fabrica_de_tutoriales`). */
export const CUENTA = 'tutoriales@fabrica.spira'

/** Los tres archivos que deja la fábrica por versión, con el tipo que necesita el navegador para servirlos. */
export const ARCHIVOS = {
  'video.mp4': 'video/mp4',
  'subtitulos.vtt': 'text/vtt',
  'poster.jpg': 'image/jpeg',
}

/** La clave del objeto en el bucket, o un error si cualquier pieza no tiene la forma de un tutorial. */
export function claveDeObjeto(id, version, archivo) {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(String(id))) throw new Error(`Id de tutorial inválido: «${id}».`)
  if (!/^[0-9a-f]{8}$/.test(String(version))) throw new Error(`Versión inválida: «${version}» (son 8 caracteres hexadecimales, el hash del video).`)
  if (!Object.hasOwn(ARCHIVOS, archivo)) throw new Error(`Archivo que no se publica: «${archivo}».`)
  return `${id}/${version}/${archivo}`
}

/** La URL pública de un objeto ya subido (la que pide la app; `src/ayuda/catalogo.ts`, `urlDelTutorial`). */
export function urlPublica(ref, clave) {
  return `https://${ref}.supabase.co/storage/v1/object/public/${BUCKET}/${clave}`
}
