import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { Icon } from '../../../components/Icon'
import type { IpDocumentRow } from '../../../data/pharma'
import { constanciaImpresa, ipDocumentUrl } from '../../../data/pharma'

/**
 * La constancia del IRT, en su tarjeta del paso de preparación.
 *
 * Dos estados con la misma forma, porque es el mismo documento: pendiente de imprimir (tinte
 * petróleo, ícono de alerta) e impresa (tinte teal, ícono de matraz). Lo que cambia es el rótulo y
 * qué botón manda.
 *
 * La MINIATURA es clickeable entera, no solo el botón "Ver": pasar el mouse por la imagen de un
 * documento y que no pase nada es exactamente la affordance que falta. El cursor `zoom-in` y el velo
 * al hover lo dicen antes del clic.
 */
export function TarjetaConstancia({ doc, onVer }: {
  doc: IpDocumentRow
  onVer: () => void
}) {
  const [url, setUrl] = useState<string | null>(null)
  const [sobre, setSobre] = useState(false)

  useEffect(() => {
    let vivo = true
    setUrl(null)
    ipDocumentUrl(doc.storage_path).then((u) => { if (vivo) setUrl(u) })
    return () => { vivo = false }
  }, [doc.storage_path])

  const impresa = constanciaImpresa(doc)
  const esPdf = doc.mime_type === 'application/pdf'

  return (
    <div style={{ ...tarjeta, ...(impresa ? tarjetaOk : tarjetaPendiente) }}>
      <button
        type="button"
        onClick={onVer}
        onMouseEnter={() => setSobre(true)}
        onMouseLeave={() => setSobre(false)}
        onFocus={() => setSobre(true)}
        onBlur={() => setSobre(false)}
        aria-label={`Ver la constancia ${doc.file_name}`}
        className="spira-no-press"
        style={{
          ...miniatura,
          // El borde va en LONGHANDS porque el hover le cambia el color. Mezclarlo con la abreviada
          // deja el borde negro al salir del estado (ver CLAUDE.md, §Convenciones).
          borderColor: sobre ? 'var(--spira-primary)' : 'var(--spira-line-2)',
        }}
      >
        {url === null ? null : esPdf ? (
          <iframe
            src={`${url}#toolbar=0&navpanes=0&view=FitH`} title={doc.file_name}
            // Sin `pointerEvents: none` el clic cae DENTRO del iframe (documento aparte, sus clics
            // no burbujean) y el botón no se entera nunca.
            style={{ width: 620, height: 800, border: 0, transform: 'scale(0.1)', transformOrigin: 'top left', pointerEvents: 'none' }}
          />
        ) : (
          <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top' }} />
        )}

        <span style={{ ...velo, opacity: sobre ? 1 : 0 }} aria-hidden>
          <Icon name="maximize" size={16} color="#fff" stroke={2} />
        </span>
      </button>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={titulo}>
          {impresa
            ? <Icon name="flask" size={15} color="var(--spira-track)" />
            : <Icon name="alert" size={15} color="var(--spira-primary-deep)" stroke={2} />}
          {impresa ? 'Constancia del IRT impresa' : 'Falta imprimir la constancia del IRT'}
        </div>
        <div style={subtitulo} title={doc.file_name}>{doc.file_name}</div>

        {/* Un solo botón: el visor tiene adentro Imprimir, Descargar y el zoom. Repetir acá tres
            botones que el visor ya ofrece era la fila de acciones vieja, y con 480px de ancho
            competía con el campo de escaneo por el mismo espacio. */}
        <button type="button" onClick={onVer} style={{ ...verBtn, ...(impresa ? {} : verBtnPri) }}>
          <Icon name="eye" size={14} color={impresa ? 'var(--spira-ink)' : 'var(--spira-on-accent)'} />
          {impresa ? 'Ver la constancia' : 'Abrir e imprimir'}
        </button>
      </div>
    </div>
  )
}

const tarjeta: CSSProperties = {
  display: 'flex', gap: 13, padding: '13px 14px', borderRadius: 12, alignItems: 'center',
  borderWidth: 1, borderStyle: 'solid',
}

const tarjetaPendiente: CSSProperties = {
  background: 'rgba(15, 95, 87, 0.09)', borderColor: 'rgba(15, 95, 87, 0.30)',
}

const tarjetaOk: CSSProperties = {
  background: 'rgba(46, 125, 116, 0.08)', borderColor: 'rgba(46, 125, 116, 0.26)',
}

const miniatura: CSSProperties = {
  position: 'relative', flex: '0 0 auto', width: 62, height: 80, borderRadius: 5,
  overflow: 'hidden', background: 'var(--spira-white)', padding: 0,
  borderWidth: 1, borderStyle: 'solid',
  boxShadow: '0 2px 6px rgba(20, 48, 46, 0.10)', cursor: 'zoom-in',
  transition: 'border-color 0.14s var(--spira-ease-out)',
}

const velo: CSSProperties = {
  position: 'absolute', inset: 0, display: 'grid', placeItems: 'center',
  background: 'rgba(20, 48, 46, 0.42)', transition: 'opacity 0.14s',
}

const titulo: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 7, fontSize: 13.5, fontWeight: 600,
  color: 'var(--spira-ink)',
}

const subtitulo: CSSProperties = {
  fontSize: 11.5, color: 'var(--spira-muted)', marginTop: 2,
  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
}

const verBtn: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 7, marginTop: 9,
  height: 32, padding: '0 12px', borderRadius: 8,
  borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--spira-line-2)',
  background: 'var(--spira-white)', color: 'var(--spira-ink)',
  fontFamily: 'var(--spira-font-text)', fontWeight: 600, fontSize: 12.5, cursor: 'pointer',
}

const verBtnPri: CSSProperties = {
  background: 'var(--spira-primary)', borderColor: 'var(--spira-primary)',
  color: 'var(--spira-on-accent)',
}
