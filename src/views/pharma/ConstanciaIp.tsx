import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { Icon } from '../../components/Icon'
import { formatBytes, IP_MIME_TYPES, ipDocumentUrl } from '../../data/pharma'
import type { IpDocumentRow } from '../../data/pharma'
import { formatDateTimeAR } from '../../lib/dates'

/**
 * Zona de carga de la constancia. Sugiere el PDF sin prohibir la imagen: el PDF impreso del IRT
 * gana por mérito propio —pesa 10× menos, se imprime nítido y se puede buscar—, no por regla.
 *
 * Es un `<button>`, no un `<div onClick>`: así el levante de ~1px al hover lo da GRATIS la
 * micro-interacción global de `tokens.css` (que solo mira `button`/`a[href]`/`[role='button']`) y
 * el foco por teclado también sale solo — nada de escribirlo a mano con `onMouseEnter`, que es
 * justo la regla de la casa. El único estado que sí necesita JS es "hay un archivo arrastrándose
 * encima" (`over`): eso no tiene equivalente en CSS puro —`:hover` no es confiable durante un drag
 * nativo del sistema operativo—, así que ahí sí se empuja el mismo transform/sombra a mano, sobre
 * las mismas dos propiedades que ya anima `.spira-card-link` (no hay conflicto de shorthand/longhand
 * como el del borde: acá nunca se toca `border`, que queda fijo en el `style` de abajo).
 *
 * `accept` sale de `IP_MIME_TYPES` (no una lista repetida a mano): esa constante es la que también
 * usa `uploadIpDocument` para el rechazo server-side, así que el input nunca puede quedar
 * desincronizado con lo que el backend realmente admite. HEIC/HEIF NO están —Chromium en Windows
 * no los decodifica, así que una foto de iPhone se subiría bien pero se vería y se imprimiría en
 * blanco sin ningún error—, ver el comentario en `data/pharma/ipDocuments.ts`.
 */
export function ConstanciaDropzone({ accent, busy, onFile }: {
  accent: string
  busy: boolean
  onFile: (f: File) => void
}) {
  const input = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)
  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => !busy && input.current?.click()}
      onDragOver={(e) => { e.preventDefault(); if (!busy) setOver(true) }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault(); setOver(false)
        const f = e.dataTransfer.files?.[0]
        if (f && !busy) onFile(f)
      }}
      className="spira-card-link"
      style={{
        display: 'block', width: '100%',
        border: '1px dashed var(--spira-line-2)', borderRadius: 12, background: 'var(--spira-white)',
        padding: '17px 14px', textAlign: 'center', cursor: busy ? 'default' : 'pointer',
        opacity: busy ? 0.6 : 1, transform: over ? 'translateY(-1px)' : undefined,
        boxShadow: over ? 'var(--spira-shadow-sm)' : undefined,
      }}
    >
      <input
        ref={input} type="file" hidden disabled={busy}
        accept={IP_MIME_TYPES.join(',')}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = '' }}
      />
      <Icon name="upload" size={20} color={accent} stroke={1.7} />
      <div style={{ fontSize: 13, fontWeight: 600, marginTop: 7 }}>
        {busy ? 'Subiendo…' : <>Arrastrá la constancia o <span style={{ color: accent, textDecoration: 'underline', textUnderlineOffset: 2 }}>elegí un archivo</span></>}
      </div>
      <div style={{ fontSize: 11.5, color: 'var(--spira-ink-soft)', marginTop: 3 }}>
        Preferentemente el PDF · hasta 10&nbsp;MB
      </div>
    </button>
  )
}

/**
 * Vista de la constancia. Reemplaza al botón "Ver": la constancia tiene cuatro datos y entran en
 * 140px — si hay que hacer clic para ver algo que cabe, el clic sobra.
 *
 * Sin librerías: `<iframe>` para PDF y `<img>` para imagen, contra la URL firmada. La alternativa
 * (pdf.js dibujando la miniatura en un canvas) son ~350 KB comprimidos por una imagen que el
 * navegador ya sabe dibujar solo.
 */
export function ConstanciaVista({ doc, size, accent, onReemplazar }: {
  doc: IpDocumentRow
  size: 'chica' | 'grande'
  accent: string
  onReemplazar?: () => void
}) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let vivo = true
    ipDocumentUrl(doc.storage_path).then((u) => { if (vivo) setUrl(u) })
    return () => { vivo = false }
  }, [doc.storage_path])

  const [ampliarError, setAmpliarError] = useState<string | null>(null)

  /**
   * Abre la constancia ENTERA en una pestaña nueva (solo hace falta en "chica": ahí el
   * previsualizador recorta a 140px y esto es la única forma de ver el resto).
   *
   * La pestaña se abre EN BLANCO antes del `await`: pasado ese punto ya no cuenta como gesto
   * directo del usuario y el navegador bloquea `window.open`. Si la URL firmada no llega, no
   * dejamos esa pestaña en blanco flotando —eso sería fingir que se abrió algo que no se abrió—:
   * se cierra y se avisa el error. Si el propio navegador bloqueó la pestaña en blanco (`pestaña`
   * sale `null`), se reintenta una vez ya con la URL final, que sí suele pasar el filtro de
   * algunos bloqueadores al venir con destino real.
   */
  async function verEntero() {
    setAmpliarError(null)
    const pestaña = window.open('', '_blank', 'noopener')
    const u = await ipDocumentUrl(doc.storage_path)
    if (!u) {
      pestaña?.close()
      setAmpliarError('No se pudo abrir la constancia. Probá de nuevo en un momento.')
      return
    }
    if (pestaña) pestaña.location.href = u
    else window.open(u, '_blank', 'noopener')
  }

  const alto = size === 'grande' ? 348 : 140
  const esPdf = doc.mime_type === 'application/pdf'

  return (
    <div>
      <div style={{ position: 'relative', height: alto, borderRadius: 12, overflow: 'hidden', border: '1px solid var(--spira-line)', background: 'var(--spira-white)' }}>
        {url === null ? (
          <div style={{ display: 'grid', placeItems: 'center', height: '100%', fontSize: 12.5, color: 'var(--spira-muted)' }}>Cargando la constancia…</div>
        ) : esPdf ? (
          <iframe src={`${url}#toolbar=0&navpanes=0&view=FitH`} title={doc.file_name} style={{ width: '100%', height: '100%', border: 0 }} />
        ) : (
          <img src={url} alt={doc.file_name} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top' }} />
        )}
        {/* Degradé de pie SOLO en "chica": ahí la primera plana viene recortada a 140px y el borde
           inferior corta contenido a la mitad; el degradé avisa "esto sigue" Y le da fondo de
           contraste al botón "Ampliar" de abajo (un botón blanco flotando directo sobre el
           documento, sin degradé, se pierde contra una plana también blanca). En "grande" (348px,
           Farmacia) el documento entra completo: ni el degradé ni "Ampliar" hacen falta ahí, por
           eso los dos comparten el mismo `size === 'chica'`. */}
        {size === 'chica' && (
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 46, background: 'linear-gradient(to bottom, transparent, var(--spira-white))', pointerEvents: 'none' }} />
        )}
        {/* "Ampliar": la única forma de ver la constancia completa en "chica" (el recorte a 140px
           es a propósito, pero recortar sin dar forma de ver el resto sería un callejón sin
           salida). Es un <button> real a propósito, no un <div onClick>: el levante de ~1px al
           hover sale GRATIS de la micro-interacción global de tokens.css, así que acá no hace
           falta (ni corresponde) escribir ningún :hover a mano. */}
        {size === 'chica' && (
          <button
            type="button"
            onClick={verEntero}
            style={{
              position: 'absolute', right: 9, bottom: 9, height: 28, padding: '0 10px', borderRadius: 8,
              border: '1px solid var(--spira-line)', background: 'var(--spira-white)', cursor: 'pointer',
              fontFamily: 'var(--spira-font-text)', fontWeight: 600, fontSize: 12, color: 'var(--spira-ink)',
              display: 'inline-flex', alignItems: 'center', gap: 6, boxShadow: 'var(--spira-shadow-sm)',
            }}
          >
            <Icon name="maximize" size={13} stroke={1.9} />
            Ampliar
          </button>
        )}
      </div>
      {ampliarError && (
        <div style={{ fontSize: 11.5, color: 'var(--spira-danger)', marginTop: 6 }} role="alert">{ampliarError}</div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginTop: 9, padding: '10px 12px', border: '1px solid var(--spira-line)', borderRadius: 12, background: 'var(--spira-white)' }}>
        <span style={{ flex: '0 0 auto', width: 32, height: 32, borderRadius: 9, background: `${accent}1F`, display: 'grid', placeItems: 'center' }}>
          <Icon name="fileText" size={16} color={accent} />
        </span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: 'block', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{doc.file_name}</span>
          {/* Peso + cuándo se subió: la constancia es nota fuente regulatoria, así que el cuándo
             importa tanto como el peso. `formatDateTimeAR` porque `uploaded_at` es un timestamptz
             (no una fecha pura `YYYY-MM-DD`) — es el mismo helper que ya usan los vecinos para
             timestamps absolutos ("Entregada el…" en PanelEntregada, el pie del comprobante). */}
          <span style={{ display: 'block', fontSize: 11.5, color: 'var(--spira-ink-soft)', marginTop: 1 }}>
            {formatBytes(doc.size_bytes)} · subido {formatDateTimeAR(doc.uploaded_at)}
          </span>
        </span>
        {onReemplazar && (
          <button type="button" onClick={onReemplazar} style={miniBtn}>Reemplazar</button>
        )}
      </div>
    </div>
  )
}

const miniBtn: CSSProperties = {
  height: 30, padding: '0 11px', borderRadius: 9, border: '1px solid var(--spira-line-2)',
  background: 'var(--spira-white)', cursor: 'pointer', fontFamily: 'var(--spira-font-text)',
  fontWeight: 600, fontSize: 12.5, color: 'var(--spira-ink)', flex: '0 0 auto',
}
