import { useState } from 'react'
import type { CSSProperties } from 'react'
import { Icon } from '../../components/Icon'
import { SearchableSelect } from '../../components/SearchableSelect'
import { IP_MAX_BYTES, IP_MIME_TYPES, formatBytes, reemplazarConstanciaEntregada } from '../../data/pharma'
import type { CorreccionRow, IpDocumentRow, MotivoCorreccionConstancia } from '../../data/pharma'
import { ConstanciaDropzone, ConstanciaPendiente } from './ConstanciaIp'
import { ConstanciaEnTicket } from './ComprobanteTicket'
import { MOTIVOS_CONSTANCIA, lineaDeCorreccion, motivoCompleto, resumenCorrecciones } from './correccionEntregaModel'
import { VisorDocumento } from './VisorDocumento'
import type { DocumentoAVer } from './VisorDocumento'

/* «Corregir esta entrega», fase 1 (0149; spec `2026-10-04-corregir-entrega-design.md`).

   El ticket entregado pasa a modo edición EN EL LUGAR (spec D7: «un campo de edición sobre la propia
   entrega», Director). Lo que se corrige en esta fase es la constancia del IP: se elige la correcta,
   se dice por qué y se guarda. La vieja no se borra —queda reemplazada y se puede abrir desde
   «Corregida»—. Las reglas viven en `correccionEntregaModel.ts`, con test. */

/**
 * La parte del producto en investigación de un ticket en modo corrección: la constancia vigente (o
 * que falta), la correcta, el motivo y las dos salidas. Reemplaza a `ipDe(r)` mientras se corrige.
 */
export function FormCorreccionConstancia({ requestId, protocolId, actual, kits, accent, onCancelar, onHecho }: {
  requestId: string
  protocolId: string
  /** La constancia vigente. `null` = la entrega salió sin constancia en Spira (anterior a la 0071). */
  actual: IpDocumentRow | null
  kits: number | null
  accent: string
  onCancelar: () => void
  onHecho: () => void
}) {
  const [archivo, setArchivo] = useState<File | null>(null)
  const [motivo, setMotivo] = useState<MotivoCorreccionConstancia | ''>('')
  const [texto, setTexto] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  // Mismo chequeo previo que la carga normal (y con el mismo texto): avisar antes de subir. El
  // límite de verdad lo pone el bucket.
  function elegir(f: File) {
    if (f.size > IP_MAX_BYTES) { setErr(`El archivo pesa ${formatBytes(f.size)} y el máximo es 10 MB.`); return }
    if (!IP_MIME_TYPES.includes(f.type)) { setErr('Formato no admitido. Se aceptan PDF, JPG, PNG y WEBP.'); return }
    setErr(null); setArchivo(f)
  }

  const listo = archivo !== null && motivoCompleto(motivo, texto)

  async function guardar() {
    if (!archivo || motivo === '' || !listo) return
    setBusy(true); setErr(null)
    const res = await reemplazarConstanciaEntregada(requestId, protocolId, archivo, motivo, motivo === 'otro' ? texto.trim() : null)
    setBusy(false)
    if (res.error) { setErr(res.error); return }
    onHecho()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {actual ? (
        <div>
          <div style={rotulo}>La que está cargada</div>
          <ConstanciaEnTicket doc={actual} kits={kits} reemplazo={null} />
        </div>
      ) : (
        <div style={{ fontSize: 12.5, color: 'var(--spira-ink-soft)' }}>
          Esta entrega salió sin constancia cargada en Spira. Podés cargarla ahora.
        </div>
      )}

      <div>
        <div style={rotulo}>{actual ? 'La correcta' : 'La constancia'}</div>
        {archivo ? (
          <ConstanciaPendiente file={archivo} accent={accent} onQuitar={() => setArchivo(null)} cuando="se guarda con la corrección" />
        ) : (
          <ConstanciaDropzone accent={accent} busy={busy} onFile={elegir} que="la constancia correcta" />
        )}
      </div>

      <div>
        <div style={rotulo}>Motivo</div>
        {/* `searchable="never"`: son tres motivos cortos, entran todos en el menú. */}
        <SearchableSelect
          value={motivo}
          onChange={(v) => setMotivo(v as MotivoCorreccionConstancia)}
          options={[...MOTIVOS_CONSTANCIA]}
          placeholder="¿Por qué se corrige?"
          searchable="never"
          disabled={busy}
        />
        {motivo === 'otro' && (
          <input
            type="text" value={texto} onChange={(e) => setTexto(e.target.value)} disabled={busy}
            placeholder="Contá el motivo" aria-label="Motivo de la corrección" maxLength={300}
            style={{ ...campo, marginTop: 8 }}
          />
        )}
      </div>

      {/* Honesto sobre el alcance: la medicación todavía no se corrige desde acá (fase 2). Lo que
          falte se suma con «Nueva dispensación», que es lo que de verdad existe hoy. */}
      <div style={{ fontSize: 11.5, color: 'var(--spira-muted)', lineHeight: 1.45 }}>
        La medicación no se corrige desde acá. Si faltó algo, sumalo después con «Nueva dispensación».
      </div>

      {err && <div role="alert" style={{ fontSize: 12, color: 'var(--spira-acc-deep-danger)' }}>{err}</div>}

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button type="button" onClick={onCancelar} disabled={busy} style={btnSecundario}>Cancelar</button>
        <button
          type="button" onClick={() => void guardar()} disabled={!listo || busy}
          style={{ ...btnGuardar(accent), opacity: !listo || busy ? 0.55 : 1, cursor: !listo || busy ? 'default' : 'pointer' }}
        >
          {busy ? 'Guardando…' : 'Guardar corrección'}
        </button>
      </div>
    </div>
  )
}

/**
 * La línea «Corregida · 04 Oct 2026 · 1 cambio» del ticket, plegada, y el detalle al abrirla: qué
 * cambió, por qué, quién y cuándo, con la constancia anterior a un clic. En un sistema auditable el
 * comprobante corregido tiene que poder contar su historia (spec D4); plegada para que no compita con
 * la entrega, que sigue siendo lo primero que se lee.
 */
export function CorreccionesDeEntrega({ correcciones }: { correcciones: readonly CorreccionRow[] }) {
  const [abierta, setAbierta] = useState(false)
  const [viendo, setViendo] = useState<DocumentoAVer | null>(null)
  const resumen = resumenCorrecciones(correcciones)
  if (!resumen) return null
  return (
    <div style={{ padding: '0 12px 10px' }}>
      <button
        type="button" className="spira-enlace-sobrio spira-no-press" onClick={() => setAbierta((a) => !a)}
        aria-expanded={abierta}
      >
        <Icon name="pencil" size={12} stroke={2} />
        {resumen}
        <Icon name={abierta ? 'chevronUp' : 'chevronDown'} size={12} stroke={2} />
      </button>
      {abierta && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
          {correcciones.map((c) => {
            const l = lineaDeCorreccion(c)
            return (
              <div key={l.id} style={detalle}>
                <div style={{ fontWeight: 600, color: 'var(--spira-ink)' }}>{l.titulo}</div>
                <div style={{ color: 'var(--spira-ink-soft)', overflowWrap: 'anywhere' }}>{l.detalle}</div>
                <div style={{ color: 'var(--spira-ink-soft)' }}>Motivo: {l.motivo}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--spira-muted)' }}>
                  <span style={{ flex: 1, minWidth: 0 }}>{l.quien}</span>
                  {l.anterior && (
                    <button
                      type="button" className="spira-enlace-sobrio spira-no-press"
                      onClick={() => setViendo({ storagePath: l.anterior!.storagePath, nombre: l.anterior!.nombre, mime: l.anterior!.mime, meta: 'Constancia reemplazada' })}
                    >
                      <Icon name="eye" size={12} />
                      Ver la anterior
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
      {viendo && <VisorDocumento doc={viendo} onClose={() => setViendo(null)} />}
    </div>
  )
}

/* —— estilos —— */
const rotulo: CSSProperties = {
  fontSize: 10.5, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase',
  color: 'var(--spira-ink-soft)', marginBottom: 6,
}

const campo: CSSProperties = {
  width: '100%', height: 36, padding: '0 11px', borderRadius: 9,
  border: '1px solid var(--spira-line-2)', background: 'var(--spira-white)',
  fontFamily: 'var(--spira-font-text)', fontSize: 12.5, color: 'var(--spira-ink)',
}

const detalle: CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11.5, padding: '8px 10px',
  border: '1px solid var(--spira-line)', borderRadius: 9, background: 'var(--spira-surface)',
}

/** Borde en longhands (la trampa de la abreviada + longhand, ver CLAUDE.md). */
const btnSecundario: CSSProperties = {
  height: 34, padding: '0 13px', borderRadius: 9, borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--spira-line-2)',
  background: 'var(--spira-white)', color: 'var(--spira-ink)', cursor: 'pointer',
  fontFamily: 'var(--spira-font-text)', fontWeight: 600, fontSize: 12.5,
}

const btnGuardar = (accent: string): CSSProperties => ({
  height: 34, padding: '0 14px', borderRadius: 9, border: 'none', background: accent,
  color: 'var(--spira-on-accent)', fontFamily: 'var(--spira-font-text)', fontWeight: 600, fontSize: 12.5,
})
