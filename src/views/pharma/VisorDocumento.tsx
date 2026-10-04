import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { CSSProperties, ReactNode } from 'react'
import { Icon } from '../../components/Icon'
import { downloadIpDocument, ipDocumentUrl, openIpDocument } from '../../data/pharma'

/** Lo que el visor necesita de un archivo del bucket `ip-docs`: la constancia del IP o una receta. */
export interface DocumentoAVer {
  storagePath: string
  nombre: string
  /** El tipo, si se sabe. Si no, se deduce de la extensión de la ruta (`uploadIpDocument` la pone). */
  mime?: string | null
  /** La línea de debajo del nombre (peso, cuándo se cargó). */
  meta?: ReactNode
}

/** PDF o imagen. La ruta siempre termina en la extensión que `extOf` le puso al subir. */
function esPdf(d: DocumentoAVer): boolean {
  if (d.mime) return d.mime === 'application/pdf'
  return /\.pdf$/i.test(d.storagePath)
}

/**
 * «Ver» un documento SIN salir de Spira: la constancia del IP o una receta, en una ventana encima de
 * lo que se estaba mirando (Director, 2026-10-04). Hasta acá «Ver» abría una pestaña nueva con la
 * URL firmada, y leer el papel era irse de la visita.
 *
 * NO es el `VisorConstancia` de Farmacia: aquél es una herramienta de preparación (zoom, «Imprimir»
 * que sella la aserción de impresión) anclada al cajón. Éste es para LEER: el PDF va con el visor
 * nativo del navegador y su barra —zoom, girar, imprimir— porque es lo que ya sabe hacer, y las
 * salidas de siempre («Abrir en pestaña», «Descargar») quedan a mano en el encabezado.
 *
 * PORTALEADO a `document.body`, y por tres motivos que ya costaron caro:
 *   · el detalle de visita y el cajón tienen `backdrop-filter`, que vuelve relativo a ELLOS a
 *     cualquier `position: fixed` de adentro: montado ahí, el visor aterrizaba recortado;
 *   · el portal corta el DOM pero no el árbol de React: los `mousedown`/`click` del visor llegarían
 *     por React al backdrop de la visita o del cajón y los cerrarían. Se cortan en la raíz;
 *   · el Esc: la visita y el cajón escuchan `keydown` en `document` y el cajón cierra con cualquier
 *     Esc. Acá se escucha en CAPTURA y se frena la propagación: con el visor abierto el teclado es
 *     suyo, y Esc cierra sólo el visor (ni las flechas navegan la lista de visitas de abajo, ni el
 *     Tab lo agarra la trampa de foco del cajón).
 */
export function VisorDocumento({ doc, onClose }: { doc: DocumentoAVer; onClose: () => void }) {
  const [url, setUrl] = useState<string | null>(null)
  const [fallo, setFallo] = useState(false)
  const [busy, setBusy] = useState<'abrir' | 'descargar' | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const cerrarRef = useRef<HTMLButtonElement>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    let vivo = true
    setUrl(null); setFallo(false)
    ipDocumentUrl(doc.storagePath).then((u) => {
      if (!vivo) return
      if (u) setUrl(u)
      else setFallo(true)
    })
    return () => { vivo = false }
  }, [doc.storagePath])

  // Una sola vez al montar: si dependiera de `onClose` (que llega como flecha nueva en cada render),
  // el foco volvería al ✕ con cada redibujo del padre.
  useEffect(() => {
    const previo = document.activeElement as HTMLElement | null
    const onKey = (e: KeyboardEvent) => {
      e.stopPropagation()
      if (e.key === 'Escape') { e.preventDefault(); onCloseRef.current() }
    }
    document.addEventListener('keydown', onKey, true)
    cerrarRef.current?.focus()
    return () => {
      document.removeEventListener('keydown', onKey, true)
      // El foco vuelve al «Ver» que lo abrió, si sigue en pantalla.
      if (previo && previo.isConnected) previo.focus()
    }
  }, [])

  const correr = async (cual: 'abrir' | 'descargar', fn: () => Promise<string | null>) => {
    if (busy) return
    setBusy(cual); setErr(null)
    const msg = await fn()
    setBusy(null); setErr(msg)
  }

  const pdf = esPdf(doc)

  return createPortal(
    <div
      style={backdrop} role="presentation"
      onMouseDown={(e) => { e.stopPropagation(); if (e.target === e.currentTarget) onClose() }}
      onClick={(e) => e.stopPropagation()}
    >
      <div style={card} role="dialog" aria-modal="true" aria-label={`Documento ${doc.nombre}`}>
        <div style={encabezado}>
          <span style={{ width: 34, height: 34, flex: '0 0 auto', borderRadius: 9, background: 'var(--spira-surface)', display: 'grid', placeItems: 'center' }}>
            <Icon name="fileText" size={18} color="var(--spira-ink-soft)" stroke={1.9} />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={titulo} title={doc.nombre}>{doc.nombre}</div>
            {doc.meta && <div style={{ fontSize: 12, color: 'var(--spira-muted)', marginTop: 2 }}>{doc.meta}</div>}
          </div>
          <button
            type="button" className="spira-enlace-sobrio spira-no-press" disabled={busy !== null}
            onClick={() => void correr('abrir', () => openIpDocument(doc.storagePath))}
          >
            <Icon name="externalLink" size={13} />
            {busy === 'abrir' ? 'Abriendo…' : 'Abrir en pestaña'}
          </button>
          <button
            type="button" className="spira-enlace-sobrio spira-no-press" disabled={busy !== null}
            onClick={() => void correr('descargar', () => downloadIpDocument(doc.storagePath, doc.nombre))}
          >
            <Icon name="download" size={13} />
            {busy === 'descargar' ? 'Bajando…' : 'Descargar'}
          </button>
          <button ref={cerrarRef} type="button" onClick={onClose} aria-label="Cerrar" title="Cerrar (Esc)" style={cerrarBtn}>
            <Icon name="x" size={18} color="var(--spira-muted)" />
          </button>
        </div>

        {err && <div role="alert" style={errStyle}>{err}</div>}

        <div style={cuerpo}>
          {fallo ? (
            <div style={aviso}>No se pudo abrir el documento. Probá de nuevo en un momento.</div>
          ) : url === null ? (
            <div style={aviso}>Cargando el documento…</div>
          ) : pdf ? (
            // Sin el panel de miniaturas (`navpanes=0`): una constancia es una hoja, y la columna de
            // miniaturas le comía un cuarto del ancho. La barra del visor sí queda: zoom, girar, imprimir.
            <iframe src={`${url}#navpanes=0&view=FitH`} title={doc.nombre} style={{ width: '100%', height: '100%', border: 0, display: 'block' }} />
          ) : (
            // `contain` y centrada: el papel entero, sin recortes (un recorte puede dejar afuera el
            // número de kit o la firma).
            <img src={url} alt={doc.nombre} style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }} />
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}

/* —— estilos ——
   El vocabulario de `Modal` (backdrop cálido + blur, card de papel, encabezado sereno), en grande: es
   para leer una hoja A4. `--spira-z-dialog` para quedar arriba de la visita y del cajón (los dos en
   `--spira-z-drawer`). */
const backdrop: CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(20, 48, 46, 0.42)', backdropFilter: 'blur(2px)',
  display: 'grid', placeItems: 'center', zIndex: 'var(--spira-z-dialog)', padding: 24,
  animation: 'spOverlayIn .16s ease both',
}

const card: CSSProperties = {
  width: 'min(920px, 100%)', height: 'calc(100vh - 48px)',
  background: 'var(--spira-white)', border: '1px solid var(--spira-line)', borderRadius: 16,
  boxShadow: 'var(--spira-shadow-md)', display: 'flex', flexDirection: 'column', overflow: 'hidden',
}

const encabezado: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px 14px 20px', flex: '0 0 auto',
  borderBottom: '1px solid var(--spira-line)',
}

const titulo: CSSProperties = {
  fontSize: 15, fontWeight: 700, color: 'var(--spira-ink)',
  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
}

const cerrarBtn: CSSProperties = {
  width: 32, height: 32, border: 'none', borderRadius: 8, background: 'transparent', cursor: 'pointer',
  display: 'grid', placeItems: 'center', flex: '0 0 auto',
}

const cuerpo: CSSProperties = { flex: 1, minHeight: 0, background: 'var(--spira-surface)' }

const aviso: CSSProperties = {
  display: 'grid', placeItems: 'center', height: '100%', fontSize: 13, color: 'var(--spira-muted)',
}

const errStyle: CSSProperties = {
  padding: '8px 20px', fontSize: 12, color: 'var(--spira-acc-deep-danger)', flex: '0 0 auto',
  borderBottom: '1px solid var(--spira-line)',
}
