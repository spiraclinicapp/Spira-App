import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { Icon } from '../../../components/Icon'
import type { IpDocumentRow } from '../../../data/pharma'
import {
  constanciaImpresa, downloadIpDocument, formatBytes, ipDocumentUrl,
  markIpDocumentPrinted, printIpDocument,
} from '../../../data/pharma'
import { formatDateTimeAR } from '../../../lib/dates'

/** Límites y paso del zoom (handoff §7). `AJUSTE` es el valor al que vuelve el botón "Ajustar". */
const MIN = 0.4
const MAX = 1.6
const PASO = 0.15
const AJUSTE = 0.78

/** Redondea a 2 decimales: sumar 0.15 en punto flotante deja 0.9299999999999999 y el rótulo del
 *  nivel muestra basura al convertirlo a porcentaje. */
const limitar = (z: number) => Math.min(Math.max(Math.round(z * 100) / 100, MIN), MAX)

/**
 * El visor de la constancia: la plana grande, con zoom, sobre el cajón.
 *
 * SE ANCLA AL CAJÓN, NO AL VIEWPORT (`position: absolute` dentro del panel, que por eso lleva
 * `position: relative` en `chrome="propio"`). Es deliberado: tapa la dispensación que se está
 * preparando y deja ver que el tablero sigue detrás, así que se lee como "abrí el papel de ESTE
 * pedido" y no como "me fui a otra pantalla".
 *
 * Reemplaza a mostrar la plana entera de 348px incrustada en el panel. Aquella decisión existía para
 * no recortar el papel —un recorte puede dejar afuera el número de kit o la firma—, y ese motivo se
 * respeta mejor acá: la miniatura de la tarjeta se puede recortar sin culpa porque este visor muestra
 * el documento completo y encima con lupa. Lo que se ganó es el ancho: con el riel de 240px, al
 * trabajo le quedan 480 y una plana de 348 se los comía.
 *
 * "Imprimir" hace DOS cosas: manda el documento a la impresora y sella la aserción de que se imprimió
 * (`markIpDocumentPrinted`). Es el requisito #1 del riel.
 */
export function VisorConstancia({ doc, onClose, onImpresa }: {
  doc: IpDocumentRow
  onClose: () => void
  /** Avisa que hay que refrescar: el sello de impresión cambia el gate del pedido. */
  onImpresa: () => void
}) {
  const [url, setUrl] = useState<string | null>(null)
  const [zoom, setZoom] = useState(AJUSTE)
  const [busy, setBusy] = useState<'imprimir' | 'descargar' | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const cerrarRef = useRef<HTMLButtonElement>(null)

  const impresa = constanciaImpresa(doc)

  useEffect(() => {
    let vivo = true
    setUrl(null)
    ipDocumentUrl(doc.storage_path).then((u) => { if (vivo) setUrl(u) })
    return () => { vivo = false }
  }, [doc.storage_path])

  // Escape cierra el VISOR, no el cajón. Va en captura y corta el burbujeo para ganarle al listener
  // del Drawer: quien aprieta Escape con el visor abierto quiere volver a la preparación, no
  // perderla. El foco vuelve al campo de escaneo desde el `onClose` del padre.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      onClose()
    }
    document.addEventListener('keydown', onKey, true)
    cerrarRef.current?.focus()
    return () => document.removeEventListener('keydown', onKey, true)
  }, [onClose])

  const imprimir = async () => {
    if (busy) return
    setBusy('imprimir'); setErr(null)
    const msg = await printIpDocument(doc.storage_path)
    if (msg) { setBusy(null); setErr(msg); return }
    // El sello va DESPUÉS de que la impresión salió bien. Si el documento ni siquiera se pudo
    // mandar a la impresora, afirmar que se imprimió sería exactamente el dato inventado que este
    // sistema no puede permitirse.
    const sello = await markIpDocumentPrinted(doc.id)
    setBusy(null)
    if (sello.error) { setErr(sello.error); return }
    onImpresa()
  }

  const descargar = async () => {
    if (busy) return
    setBusy('descargar'); setErr(null)
    const msg = await downloadIpDocument(doc.storage_path, doc.file_name)
    setBusy(null); setErr(msg)
  }

  const esPdf = doc.mime_type === 'application/pdf'

  return (
    <div style={overlay} role="dialog" aria-modal="true" aria-label={`Constancia ${doc.file_name}`}>
      <div style={barra}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={nombre} title={doc.file_name}>{doc.file_name}</div>
          <div style={meta}>
            {formatBytes(doc.size_bytes)} · subido {formatDateTimeAR(doc.uploaded_at)}
          </div>
        </div>

        <div style={grupoZoom}>
          <button
            type="button" onClick={() => setZoom((z) => limitar(z - PASO))}
            disabled={zoom <= MIN} aria-label="Alejar" title="Alejar"
            style={{ ...zoomBtn, opacity: zoom <= MIN ? 0.4 : 1 }}
          >
            <Icon name="minus" size={14} />
          </button>
          <span className="spira-mono" style={nivel} aria-live="polite">{Math.round(zoom * 100)}%</span>
          <button
            type="button" onClick={() => setZoom((z) => limitar(z + PASO))}
            disabled={zoom >= MAX} aria-label="Acercar" title="Acercar"
            style={{ ...zoomBtn, opacity: zoom >= MAX ? 0.4 : 1 }}
          >
            <Icon name="plus" size={14} />
          </button>
        </div>

        <button type="button" onClick={() => setZoom(AJUSTE)} style={vbtn}>Ajustar</button>

        <button
          type="button" onClick={descargar} disabled={busy !== null}
          aria-label="Descargar" title="Descargar" style={{ ...vbtn, minWidth: 30, padding: '0 9px' }}
        >
          <Icon name="download" size={14} />
        </button>

        {/* Relleno mientras NO se marcó como impresa: es el requisito pendiente y tiene que
            destacarse. Una vez sellada baja a outline y cambia el rótulo. */}
        <button
          type="button" onClick={imprimir} disabled={busy !== null}
          style={{ ...vbtn, ...(impresa ? {} : vbtnSolido), opacity: busy ? 0.7 : 1 }}
        >
          <Icon name="printer" size={14} />
          {busy === 'imprimir' ? 'Preparando…' : impresa ? 'Imprimir de nuevo' : 'Imprimir'}
        </button>

        <button
          ref={cerrarRef} type="button" onClick={onClose}
          aria-label="Cerrar" title="Cerrar (Esc)" style={{ ...vbtn, minWidth: 30, padding: '0 9px' }}
        >
          <Icon name="x" size={14} />
        </button>
      </div>

      {err && <div style={errBar} role="alert">{err}</div>}

      <div style={scroll}>
        {url === null ? (
          <div style={{ color: 'var(--spira-paper)', fontSize: 13, margin: 'auto' }}>Cargando la constancia…</div>
        ) : (
          <div style={{ ...hoja, transform: `scale(${zoom})` }}>
            {esPdf ? (
              <iframe src={`${url}#toolbar=0&navpanes=0&view=FitH`} title={doc.file_name} style={marco} />
            ) : (
              <img src={url} alt={doc.file_name} style={{ width: '100%', display: 'block' }} />
            )}
          </div>
        )}
      </div>
    </div>
  )
}

const overlay: CSSProperties = {
  position: 'absolute', inset: 0, zIndex: 20,
  background: 'rgba(20, 48, 46, 0.62)', backdropFilter: 'blur(3px)',
  display: 'flex', flexDirection: 'column', animation: 'spOverlayIn 0.16s ease',
}

const barra: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 10, padding: '11px 16px',
  background: 'var(--spira-ink)', color: 'var(--spira-paper)', flex: '0 0 auto',
}

const nombre: CSSProperties = {
  fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
}

const meta: CSSProperties = { fontSize: 11.5, color: 'rgba(244, 241, 234, 0.6)', marginTop: 1 }

/** Botón de la barra oscura. Longhands en el borde: el estado sólido pisa `borderColor`. */
const vbtn: CSSProperties = {
  height: 30, padding: '0 9px', borderRadius: 8,
  borderWidth: 1, borderStyle: 'solid', borderColor: 'rgba(244, 241, 234, 0.22)',
  background: 'transparent', color: 'var(--spira-paper)',
  fontFamily: 'var(--spira-font-text)', fontWeight: 600, fontSize: 12.5,
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
  cursor: 'pointer', flex: '0 0 auto', whiteSpace: 'nowrap',
}

const vbtnSolido: CSSProperties = {
  background: 'var(--spira-primary)', borderColor: 'var(--spira-primary)',
}

const grupoZoom: CSSProperties = {
  display: 'flex', alignItems: 'center', flex: '0 0 auto',
  borderWidth: 1, borderStyle: 'solid', borderColor: 'rgba(244, 241, 234, 0.22)', borderRadius: 8,
}

const zoomBtn: CSSProperties = {
  width: 26, height: 26, border: 'none', background: 'transparent',
  color: 'var(--spira-paper)', cursor: 'pointer', display: 'grid', placeItems: 'center',
}

const nivel: CSSProperties = {
  fontSize: 11.5, minWidth: 42, textAlign: 'center', color: 'var(--spira-paper)',
}

const errBar: CSSProperties = {
  padding: '9px 16px', background: 'rgba(166, 72, 59, 0.92)', color: '#fff',
  fontSize: 12.5, flex: '0 0 auto',
}

const scroll: CSSProperties = {
  flex: 1, overflow: 'auto', padding: 22, display: 'flex', justifyContent: 'center',
}

/**
 * La hoja escalada. `transformOrigin: top center` para que al acercar crezca hacia abajo y no se
 * escape del contenedor por arriba, y `alignSelf: flex-start` para que arranque pegada al tope.
 */
const hoja: CSSProperties = {
  width: 620, flex: '0 0 auto', alignSelf: 'flex-start', transformOrigin: 'top center',
  background: 'var(--spira-white)', boxShadow: '0 18px 44px rgba(0, 0, 0, 0.34)',
  transition: 'transform 0.12s',
}

/** Alto de A4 a 620px de ancho (proporción 1:1.414), para que el PDF no quede en una tira. */
const marco: CSSProperties = { width: '100%', height: 877, border: 0, display: 'block' }
