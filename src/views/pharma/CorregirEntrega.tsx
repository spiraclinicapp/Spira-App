import { useState } from 'react'
import type { CSSProperties } from 'react'
import { Icon } from '../../components/Icon'
import { SearchableSelect } from '../../components/SearchableSelect'
import { IP_MAX_BYTES, IP_MIME_TYPES, formatBytes, pedirCorreccionEntrega, reemplazarConstanciaEntregada } from '../../data/pharma'
import type { CorreccionRow, IpDocumentRow, MotivoCorreccionConstancia, MotivoPedidoCorreccion } from '../../data/pharma'
import { ConstanciaDropzone, ConstanciaPendiente } from './ConstanciaIp'
import { ConstanciaEnTicket } from './ComprobanteTicket'
import {
  MOTIVOS_CONSTANCIA, MOTIVOS_PEDIDO, edicionPedidoInicial, lineaDeCorreccion, motivoCompleto, renglonesDePedido,
  resumenCorrecciones,
} from './correccionEntregaModel'
import type { AvisoPedido, EdicionPedido, EntregadoPorMedicamento } from './correccionEntregaModel'
import { WARN_TINT } from './panelDispensacion'
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

/**
 * El ticket en modo corrección, del lado de Coordinación. Dos cosas se corrigen y cada una tiene su
 * camino (D1): la CONSTANCIA la reemplaza Coordinación misma (0149); la MEDICACIÓN se le pide a Farmacia
 * (0152, D3: Coordinación nunca mueve stock). Si la entrega lleva IP, se elige primero qué corregir; si
 * no, se va directo a la medicación.
 */
export function EdicionEntregaTicket({ requestId, protocolId, conIp, actual, kits, entregado, medsDelPaciente, pedidoPendiente, accent, onCancelar, onHecho }: {
  requestId: string
  protocolId: string
  /** La entrega lleva IP: hay constancia que corregir (`llevaIp`). */
  conIp: boolean
  actual: IpDocumentRow | null
  kits: number | null
  entregado: EntregadoPorMedicamento[]
  /** La medicación del paciente (activa o no: una receta ya vencida también se pudo haber dado). */
  medsDelPaciente: { medication_id: string; nombre: string }[]
  /** Ya hay un pedido de corrección esperando a Farmacia: no se pide otro encima. */
  pedidoPendiente: boolean
  accent: string
  onCancelar: () => void
  onHecho: () => void
}) {
  const [modo, setModo] = useState<'elegir' | 'constancia' | 'medicacion'>(conIp ? 'elegir' : 'medicacion')

  if (modo === 'constancia') {
    return (
      <FormCorreccionConstancia
        requestId={requestId} protocolId={protocolId} actual={actual} kits={kits} accent={accent}
        onCancelar={onCancelar} onHecho={onHecho}
      />
    )
  }
  if (modo === 'medicacion') {
    if (pedidoPendiente) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: 12.5, color: 'var(--spira-ink-soft)', lineHeight: 1.5 }}>
            Ya hay una corrección de la medicación pedida a Farmacia. Cuando la resuelva, podés pedir otra.
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button type="button" onClick={onCancelar} style={btnSecundario}>Volver</button>
          </div>
        </div>
      )
    }
    return (
      <FormPedidoCorreccion
        requestId={requestId} entregado={entregado} medsDelPaciente={medsDelPaciente} accent={accent}
        onCancelar={onCancelar} onHecho={onHecho}
      />
    )
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ fontSize: 12.5, color: 'var(--spira-ink-soft)' }}>¿Qué hay que corregir?</div>
      <button type="button" className="spira-card-link" onClick={() => setModo('constancia')} style={opcion}>
        <Icon name="fileText" size={16} color={accent} />
        <span style={{ flex: 1 }}>
          <span style={{ display: 'block', fontWeight: 600 }}>La constancia del IP</span>
          <span style={{ display: 'block', fontSize: 11.5, color: 'var(--spira-muted)' }}>Se cargó otra, o está ilegible. La cambiás vos.</span>
        </span>
      </button>
      <button type="button" className="spira-card-link" onClick={() => setModo('medicacion')} style={opcion}>
        <Icon name="pill" size={16} color={accent} />
        <span style={{ flex: 1 }}>
          <span style={{ display: 'block', fontWeight: 600 }}>La medicación</span>
          <span style={{ display: 'block', fontSize: 11.5, color: 'var(--spira-muted)' }}>
            {pedidoPendiente ? 'Ya hay una corrección pedida a Farmacia.' : 'Una cantidad, algo que no se dio o que faltó registrar. Se lo pedís a Farmacia.'}
          </span>
        </span>
      </button>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button type="button" onClick={onCancelar} style={btnSecundario}>Cancelar</button>
      </div>
    </div>
  )
}

/**
 * Pedirle a Farmacia la corrección de la medicación (0152). Por medicamento entregado, la cantidad
 * CORRECTA (0 = no se dio); y lo que se dio y no se registró. Sin lotes: los elige Farmacia al aplicar.
 */
function FormPedidoCorreccion({ requestId, entregado, medsDelPaciente, accent, onCancelar, onHecho }: {
  requestId: string
  entregado: EntregadoPorMedicamento[]
  medsDelPaciente: { medication_id: string; nombre: string }[]
  accent: string
  onCancelar: () => void
  onHecho: () => void
}) {
  const [edicion, setEdicion] = useState<EdicionPedido>(() => edicionPedidoInicial(entregado))
  const [motivo, setMotivo] = useState<MotivoPedidoCorreccion | ''>('')
  const [texto, setTexto] = useState('')
  const [intentado, setIntentado] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const res = renglonesDePedido(entregado, edicion)
  const yaEstan = new Set([...entregado.map((e) => e.medication_id), ...edicion.faltantes.map((f) => f.medicationId)])
  const opcionesFaltante = (elegido: string) => medsDelPaciente
    .filter((m) => m.medication_id === elegido || !yaEstan.has(m.medication_id))
    .map((m) => ({ value: m.medication_id, label: m.nombre }))
  const puede = !busy && !res.vacio && motivoCompleto(motivo, texto)

  async function pedir() {
    setIntentado(true); setErr(null)
    if (res.errores.length > 0 || res.vacio || motivo === '' || !motivoCompleto(motivo, texto)) return
    setBusy(true)
    const r = await pedirCorreccionEntrega(requestId, res.renglones, motivo, motivo === 'otro' ? texto.trim() : null)
    setBusy(false)
    if (r.error) { setErr(r.error); return }
    onHecho()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ fontSize: 12, color: 'var(--spira-ink-soft)', lineHeight: 1.45 }}>
        Poné lo que se dio de verdad. Se lo pedís a Farmacia, que corrige la entrega y el stock.
      </div>

      {entregado.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {entregado.map((x) => (
            <div key={x.medication_id} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12.5 }}>
              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={x.nombre}>{x.nombre}</span>
              <span style={{ fontSize: 11.5, color: 'var(--spira-muted)', flex: '0 0 auto' }}>registradas {x.cantidad} · se dieron</span>
              <input
                type="number" min={0} value={edicion.correctos[x.medication_id] ?? ''} disabled={busy}
                onChange={(e) => setEdicion((ed) => ({ ...ed, correctos: { ...ed.correctos, [x.medication_id]: e.target.value } }))}
                aria-label={`Cantidad que se dio de ${x.nombre}`} style={{ ...campo, width: 64, flex: '0 0 auto' }}
              />
            </div>
          ))}
        </div>
      )}

      {edicion.faltantes.map((f) => (
        <div key={f.key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <SearchableSelect
              value={f.medicationId}
              onChange={(v) => setEdicion((ed) => ({ ...ed, faltantes: ed.faltantes.map((y) => (y.key === f.key ? { ...y, medicationId: v } : y)) }))}
              options={opcionesFaltante(f.medicationId)}
              placeholder="Qué se dio"
              entity="medicamento"
              disabled={busy}
            />
          </div>
          <input
            type="number" min={1} value={f.cantidad} disabled={busy}
            onChange={(e) => setEdicion((ed) => ({ ...ed, faltantes: ed.faltantes.map((y) => (y.key === f.key ? { ...y, cantidad: e.target.value } : y)) }))}
            aria-label="Cantidad que se dio" style={{ ...campo, width: 64, flex: '0 0 auto' }}
          />
          <button
            type="button" aria-label="Sacar este renglón" disabled={busy} style={iconBtn}
            onClick={() => setEdicion((ed) => ({ ...ed, faltantes: ed.faltantes.filter((y) => y.key !== f.key) }))}
          >
            <Icon name="x" size={15} color="var(--spira-muted)" />
          </button>
        </div>
      ))}

      {opcionesFaltante('').length > 0 && (
        <button
          type="button" className="spira-enlace-sobrio spira-no-press" disabled={busy} style={{ alignSelf: 'flex-start' }}
          onClick={() => setEdicion((ed) => ({ ...ed, faltantes: [...ed.faltantes, { key: crypto.randomUUID(), medicationId: '', cantidad: '1' }] }))}
        >
          <Icon name="plus" size={12} stroke={2} />
          Se dio algo que no se registró
        </button>
      )}

      <div>
        <div style={rotulo}>Motivo</div>
        <SearchableSelect
          value={motivo}
          onChange={(v) => setMotivo(v as MotivoPedidoCorreccion)}
          options={[...MOTIVOS_PEDIDO]}
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

      {intentado && res.errores.length > 0 && (
        <div role="alert" style={{ fontSize: 12, color: 'var(--spira-acc-deep-danger)', lineHeight: 1.45 }}>
          {res.errores.map((e) => <div key={e}>{e}</div>)}
        </div>
      )}
      {err && <div role="alert" style={{ fontSize: 12, color: 'var(--spira-acc-deep-danger)' }}>{err}</div>}

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button type="button" onClick={onCancelar} disabled={busy} style={btnSecundario}>Cancelar</button>
        <button
          type="button" onClick={() => void pedir()} disabled={!puede}
          style={{ ...btnGuardar(accent), opacity: puede ? 1 : 0.55, cursor: puede ? 'pointer' : 'default' }}
        >
          {busy ? 'Pidiendo…' : 'Pedir corrección a Farmacia'}
        </button>
      </div>
    </div>
  )
}

/**
 * Lo que el ticket dice del último pedido de corrección (`avisoPedido`): esperando a Farmacia, o
 * descartado con la nota de Farmacia. Aplicado no se dice: ya está en «Corregida».
 */
export function AvisoPedidoTicket({ aviso }: { aviso: AvisoPedido }) {
  return (
    <div style={{ padding: '0 12px 10px' }}>
      <div style={{ ...detalle, background: aviso.tipo === 'pendiente' ? 'var(--spira-surface)' : WARN_TINT }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, color: 'var(--spira-ink)' }}>
          <Icon name={aviso.tipo === 'pendiente' ? 'clock' : 'info'} size={13} stroke={2} />
          {aviso.texto}
        </div>
        {aviso.tipo === 'descartado' && aviso.nota && <div style={{ color: 'var(--spira-ink-soft)' }}>«{aviso.nota}»</div>}
      </div>
    </div>
  )
}

/* —— estilos —— */
const opcion: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', padding: '10px 12px',
  borderRadius: 10, border: '1px solid var(--spira-line)', background: 'var(--spira-white)', cursor: 'pointer',
  fontFamily: 'var(--spira-font-text)', fontSize: 12.5, color: 'var(--spira-ink)',
}

const iconBtn: CSSProperties = {
  width: 24, height: 24, border: 'none', background: 'transparent', cursor: 'pointer',
  display: 'grid', placeItems: 'center', borderRadius: 6, flex: '0 0 auto',
}

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
