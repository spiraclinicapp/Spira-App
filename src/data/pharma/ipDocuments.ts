import { supabase } from '../../lib/supabase'
import { pharmaErrorMessage } from './errors'

/** Tope del bucket, repetido acá SOLO para avisar antes de subir. El límite de verdad lo impone
 *  el bucket server-side: una validación de JS se saltea, la del bucket no. */
export const IP_MAX_BYTES = 10 * 1024 * 1024

/** Mismos tipos que declara el bucket. El PDF va primero porque es el que sugerimos.
 *  HEIC/HEIF quedan afuera A PROPÓSITO (no es un olvido, no los vuelvas a agregar sin resolver
 *  esto primero): Chromium en Windows no los decodifica, así que una foto de iPhone subida así
 *  se guarda perfecto pero se ve —y se imprime— EN BLANCO, sin ningún error que avise. Para una
 *  constancia que es nota fuente regulatoria, es preferible rechazarla al subir con un mensaje
 *  claro que aceptarla y que falle en silencio recién al mirarla. */
export const IP_MIME_TYPES = [
  'application/pdf', 'image/jpeg', 'image/png', 'image/webp',
]

const BUCKET = 'ip-docs'

/** "148 KB" / "2,4 MB" — para mostrar el peso del archivo sin mentir con decimales de más. */
export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`
  return `${(n / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`
}

/** La extensión que corresponde al tipo, para no confiar en el nombre que trae el archivo. */
function extOf(file: File): string {
  const m = /\.([a-z0-9]{2,5})$/i.exec(file.name)
  if (m) return m[1].toLowerCase()
  return file.type === 'application/pdf' ? 'pdf' : 'bin'
}

/**
 * Sube la constancia y la registra. El orden es: el pedido YA existe → subir → registrar, porque
 * la ruta necesita el `request_id`. Si la subida falla, el pedido queda sin constancia: es un
 * estado legítimo, se muestra como tal y se reintenta. No se finge éxito.
 *
 * El protocolo va primero en la ruta porque es lo que la política de storage lee del path.
 */
export async function uploadIpDocument(
  requestId: string,
  protocolId: string,
  file: File,
): Promise<{ error: string | null; id?: string }> {
  if (file.size > IP_MAX_BYTES) {
    return { error: `El archivo pesa ${formatBytes(file.size)} y el máximo es 10 MB.` }
  }
  if (!IP_MIME_TYPES.includes(file.type)) {
    return { error: 'Formato no admitido. Se aceptan PDF, JPG, PNG y WEBP.' }
  }

  const path = `${protocolId}/${requestId}/${crypto.randomUUID()}.${extOf(file)}`
  const up = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: file.type,
    upsert: false,
  })
  if (up.error) {
    // El error de Storage no es un código de Postgres (no lo cubre `pharmaErrorMessage`) y viene
    // crudo del SDK, a veces en inglés: encabezamos con un texto sereno y sumamos el detalle
    // técnico solo si vino algo (aporta para soporte; si no hay nada, no inventamos relleno).
    const detalle = up.error.message?.trim()
    const base = 'No se pudo subir la constancia. Probá de nuevo en un momento.'
    return { error: detalle ? `${base} (${detalle})` : base }
  }

  const { data, error } = await supabase.rpc('attach_ip_document', {
    p_request_id: requestId,
    p_path: path,
    p_file_name: file.name,
    p_mime: file.type,
    p_size: file.size,
  })
  if (error) {
    // El objeto YA quedó subido al bucket. Si la RPC rechaza el registro (típico: la solicitud
    // pasó a un estado cerrado entre que se abrió el selector de archivo y se confirmó la subida,
    // algo que la RPC valida server-side), ese objeto se queda huérfano en el bucket para
    // siempre, sin ninguna fila que lo referencie y sin dueño. Lo borramos best-effort: si el
    // borrado en sí falla, no hay más margen de acción acá, y sobre todo NO debe pisar ni ocultar
    // el error de la RPC, que es el que le importa mostrar al usuario.
    try {
      await supabase.storage.from(BUCKET).remove([path])
    } catch {
      // Best-effort: si ni borrar sale, queda un huérfano para limpieza manual/futura; se prioriza
      // no enmascarar el error real devuelto más abajo.
    }
    return { error: pharmaErrorMessage(error.code, error.message) }
  }
  return { error: null, id: data as string }
}

/** URL firmada de vida corta para ver el archivo. Sesenta segundos alcanzan para abrirlo. */
export async function ipDocumentUrl(path: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60)
  if (error) return null
  return data?.signedUrl ?? null
}

/**
 * Abre la constancia entera en una pestaña nueva. Devuelve null si salió bien, o el mensaje a
 * mostrar si no.
 *
 * La pestaña se abre EN BLANCO antes del `await`: pasado ese punto ya no cuenta como gesto directo
 * del usuario y el navegador bloquea `window.open`. Que la función sea `async` no cambia nada —el
 * cuerpo corre sincrónico hasta el primer `await`—, pero el orden de estas dos líneas sí: invertirlas
 * rompe la apertura en todos los navegadores. Si la URL firmada no llega, no dejamos esa pestaña en
 * blanco flotando —sería fingir que se abrió algo que no se abrió—: se cierra y se avisa el error.
 *
 * SIN `'noopener'`, a propósito: por spec, `window.open(url, target, 'noopener')` devuelve SIEMPRE
 * `null` (no es una heurística de bloqueo, es el contrato documentado del navegador) — y sin la
 * referencia no hay cómo cerrarla en el camino de error ni navegarla en el feliz, así que la pestaña
 * en blanco quedaba flotando en TODOS los clics. El aislamiento que `'noopener'` da (que la pestaña
 * nueva no pueda tocar esta vía `window.opener`) se consigue igual pisando `opener` a mano apenas se
 * abre, sin perder el handle que todo este patrón necesita. No hay una segunda llamada a
 * `window.open`: si el propio navegador bloqueó la pestaña en blanco, no fingimos que se abrió algo.
 */
export async function openIpDocument(path: string): Promise<string | null> {
  const pestaña = window.open('', '_blank')
  if (pestaña) pestaña.opener = null
  const url = await ipDocumentUrl(path)
  if (!url) {
    pestaña?.close()
    return 'No se pudo abrir la constancia. Probá de nuevo en un momento.'
  }
  if (!pestaña) return 'El navegador bloqueó la pestaña nueva. Habilitá los pop-ups para este sitio.'
  pestaña.location.href = url
  return null
}

/**
 * Baja la constancia al disco con su nombre original. Devuelve null si salió bien, o el mensaje si no.
 *
 * Va por blob y no apuntando un `<a download>` directo a la URL firmada porque el atributo `download`
 * se IGNORA cuando el destino es otro origen (y Storage lo es): en vez de guardar el archivo, el
 * navegador navegaría la pestaña y sacaría a la farmacéutica de la app en medio de la preparación.
 * Con el blob el archivo ya está en nuestro origen y el nombre se respeta.
 */
export async function downloadIpDocument(path: string, fileName: string): Promise<string | null> {
  const url = await ipDocumentUrl(path)
  if (!url) return 'No se pudo abrir la constancia.'
  try {
    const res = await fetch(url)
    if (!res.ok) return 'No se pudo descargar la constancia.'
    const blobUrl = URL.createObjectURL(await res.blob())
    const a = document.createElement('a')
    a.href = blobUrl
    a.download = fileName
    document.body.appendChild(a)
    a.click()
    a.remove()
    // La revocación no puede ser inmediata: el navegador todavía está leyendo el blob para
    // escribirlo en disco. Un minuto es de sobra para 10 MB y no deja la memoria colgada.
    window.setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000)
    return null
  } catch {
    return 'No se pudo descargar la constancia. Probá con “Abrir en pestaña”.'
  }
}

/** Espera el `onload` real del iframe (o se rinde a los `timeoutMs`). Aparte de `printIpDocument`
 *  para que `frame` llegue como parámetro (siempre no-nulo) y no como variable capturada por el
 *  closure — así no hay que pelearse con el angostamiento de tipos de TypeScript. */
function waitForFrameLoad(frame: HTMLIFrameElement, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => resolve(false), timeoutMs)
    frame.onload = () => { window.clearTimeout(timer); resolve(true) }
  })
}

/**
 * Imprime la constancia en un clic. El truco es el blob: el archivo se baja y se sirve desde
 * NUESTRO origen, y recién ahí se puede llamar a `print()` sobre el iframe. Con la URL firmada a
 * pelo no se puede — es otro origen y el navegador bloquea el print() cruzado.
 *
 * Devuelve null si salió bien, o un mensaje si no. El llamador tiene que ofrecer igual la salida
 * de "abrir en pestaña": esto depende del navegador y no queremos que un fallo deje sin imprimir.
 */
export async function printIpDocument(path: string): Promise<string | null> {
  const url = await ipDocumentUrl(path)
  if (!url) return 'No se pudo abrir la constancia.'
  try {
    const res = await fetch(url)
    if (!res.ok) return 'No se pudo descargar la constancia para imprimirla.'
    const blobUrl = URL.createObjectURL(await res.blob())
    const frame = document.createElement('iframe')
    frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0'
    frame.src = blobUrl
    document.body.appendChild(frame)

    // Antes se devolvía éxito (`null`) apenas se montaba el iframe, sin esperar a que cargara de
    // verdad. Si el navegador no llegaba a renderizarlo (PDF corrupto, iframe bloqueado por algún
    // motivo), el llamador nunca se enteraba y no ofrecía el fallback de "abrir en pestaña" — y el
    // blob y el iframe quedaban montados en memoria para siempre, sin nadie que los limpie. Acá se
    // espera el evento real, con un tiempo de espera razonable.
    const cargo = await waitForFrameLoad(frame, 8_000)
    if (!cargo) {
      URL.revokeObjectURL(blobUrl)
      frame.remove()
      return 'No se pudo mostrar la constancia para imprimir. Probá con “Abrir en pestaña”.'
    }

    frame.contentWindow?.focus()
    frame.contentWindow?.print()

    // El diálogo de impresión REAL (elegir impresora, "Guardar como PDF" con el selector de
    // archivo del sistema) puede tardar bastante más que cualquier temporizador fijo, y revocar
    // el blob mientras el diálogo sigue abierto puede cortar la impresión — justo lo que se
    // quiere evitar. `afterprint`, en la ventana del iframe, dispara recién cuando el diálogo se
    // cierra, sea cual sea el tiempo que haya tardado la persona. El temporizador queda solo como
    // red de último recurso (por si `afterprint` no llega a disparar en algún navegador) con un
    // margen bien holgado para no interferir con una impresión en curso.
    const limpiar = () => { URL.revokeObjectURL(blobUrl); frame.remove() }
    frame.contentWindow?.addEventListener('afterprint', limpiar, { once: true })
    window.setTimeout(limpiar, 5 * 60_000)

    return null
  } catch {
    return 'No se pudo imprimir. Probá con “Abrir en pestaña”.'
  }
}
