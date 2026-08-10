import { supabase } from '../../lib/supabase'
import { pharmaErrorMessage } from './errors'

/** Tope del bucket, repetido acá SOLO para avisar antes de subir. El límite de verdad lo impone
 *  el bucket server-side: una validación de JS se saltea, la del bucket no. */
export const IP_MAX_BYTES = 10 * 1024 * 1024

/** Mismos tipos que declara el bucket. El PDF va primero porque es el que sugerimos. */
export const IP_MIME_TYPES = [
  'application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
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
    return { error: 'Formato no admitido. Se aceptan PDF, JPG, PNG, WEBP y HEIC.' }
  }

  const path = `${protocolId}/${requestId}/${crypto.randomUUID()}.${extOf(file)}`
  const up = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: file.type,
    upsert: false,
  })
  if (up.error) return { error: `No se pudo subir la constancia: ${up.error.message}` }

  const { data, error } = await supabase.rpc('attach_ip_document', {
    p_request_id: requestId,
    p_path: path,
    p_file_name: file.name,
    p_mime: file.type,
    p_size: file.size,
  })
  if (error) return { error: pharmaErrorMessage(error.code, error.message) }
  return { error: null, id: data as string }
}

/** URL firmada de vida corta para ver el archivo. Sesenta segundos alcanzan para abrirlo. */
export async function ipDocumentUrl(path: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60)
  if (error) return null
  return data?.signedUrl ?? null
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
    frame.onload = () => {
      frame.contentWindow?.focus()
      frame.contentWindow?.print()
      // El objeto vive hasta que el diálogo se cierra; limpiarlo antes cancela la impresión.
      window.setTimeout(() => { URL.revokeObjectURL(blobUrl); frame.remove() }, 60_000)
    }
    return null
  } catch {
    return 'No se pudo imprimir. Probá con “Abrir en pestaña”.'
  }
}
