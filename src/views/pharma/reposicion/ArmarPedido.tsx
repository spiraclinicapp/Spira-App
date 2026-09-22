import { useState } from 'react'
import { Icon } from '../../../components/Icon'
import { Modal } from '../../../components/Modal'
import { btnOutline, btnPrimary } from '../../../components/buttons'
import { fieldInput } from '../../../components/FormField'
import { useAuth } from '../../../lib/auth'
import { borradorDelPedido, cambiosDelBorrador, emitirPedidoMedicacion, renglonesAEmitir, textoPeriodo } from '../../../data/pharma'
import type { EstudioReposicion, Periodo } from '../../../data/pharma'
import type { DatosHoja } from './HojaPedido'
import { AvisoLinea, plural, rotuloTabla } from './piezas'

const COLUMNAS = 'minmax(0, 1fr) 110px 150px'
const lista = (xs: readonly string[]) => (xs.length === 1 ? xs[0] : `${xs.slice(0, -1).join(', ')} y ${xs[xs.length - 1]}`)

/**
 * «Armar pedido» (R8, mock «3 · Armar pedido»): lo calculado al lado de un «Pedir» corregible. Un renglón
 * en 0 no va al pedido y un pedido vacío no se emite. «Emitir e imprimir» lo guarda con número y abre la
 * hoja; el botón se apaga mientras guarda, así un doble click no emite dos.
 */
export function ArmarPedido({ e, objetivo, hoy, ultimoVisto, accentSolid, onClose, onEmitido }: {
  e: EstudioReposicion
  /** El período PARA el que se pide: el que viene, o el que empezó si se pide tarde (RD1). */
  objetivo: Periodo
  hoy: string
  /** El número del último pedido de `objetivo` que muestra la pantalla, 0 si ninguno (`ultimoPedidoPara`). */
  ultimoVisto: number
  accentSolid: string
  /** `refrescar`: hubo un error y la pantalla puede estar vieja (el pedido pudo quedar hecho, u otro lo emitió). */
  onClose: (refrescar: boolean) => void
  onEmitido: (d: DatosHoja) => void
}) {
  const { profile } = useAuth()
  /* El borrador se toma UNA vez, al abrir: si la lista del estudio se refresca por detrás, lo que la
     farmacéutica ya corrigió no se pisa. */
  const [inicial] = useState(() => borradorDelPedido(e))
  const [pedir, setPedir] = useState<Record<string, string>>(
    () => Object.fromEntries(inicial.map((r) => [r.medicationId, String(r.pedir)])),
  )
  /* Un intento por ventana abierta (0133): si la red se corta después de guardar y se reintenta, la base
     devuelve el pedido que ya quedó en vez de emitir otro. */
  const [intento] = useState(() => crypto.randomUUID())
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /* Después de CUALQUIER error, cerrar vuelve a pedir los datos (revisión de ingeniería, 6). Sin código es la
     red: el pedido pudo haber quedado hecho, y si la pantalla sigue diciendo «sin pedido», volver a abrir
     trae otro intento y emite un segundo. Con código, la base dijo que la pantalla quedó vieja (otro pedido,
     otro día). */
  const [fallo, setFallo] = useState(false)
  const cerrar = () => onClose(fallo)

  const borrador = inicial.map((r) => {
    const t = (pedir[r.medicationId] ?? '').trim()
    return { ...r, pedir: t === '' ? 0 : Number(t) }
  })
  const invalido = borrador.some((r) => !Number.isInteger(r.pedir) || r.pedir < 0)
  const renglones = renglonesAEmitir(borrador)
  const cambios = cambiosDelBorrador(borrador)
  const total = renglones.reduce((s, r) => s + r.pedido, 0)
  const noSeCompran = e.renglones.filter((r) => r.estado === 'no_se_compra').map((r) => r.nombre)
  const puede = !enviando && !invalido && renglones.length > 0

  async function emitir() {
    if (!puede) return
    setEnviando(true); setError(null)
    const r = await emitirPedidoMedicacion({ protocolId: e.estudio.id, periodo: objetivo, emitidoEl: hoy, renglones, intento, ultimoVisto })
    setEnviando(false)
    if (r.error || r.numero == null) {
      /* Con código, es la base diciendo por qué no (permiso, estudio cerrado, ya hay otro pedido, otro día):
         va tal cual. Sin código es la red: reintentar es seguro DESDE ESTA VENTANA, porque viaja el mismo
         intento; otra ventana trae otro. */
      setFallo(true)
      setError(r.code ? (r.error ?? 'No se pudo emitir el pedido.') : 'No se pudo emitir el pedido. Probá de nuevo desde esta ventana: si ya había quedado hecho, no se repite.')
      return
    }
    onEmitido({
      numero: r.numero,
      estudio: { code: e.estudio.code, name: e.estudio.name },
      periodo: objetivo,
      emitidoEl: hoy,
      emitidoPor: profile?.fullName ?? null,
      anulado: false,
      reimpresion: null,
      renglones: borrador
        .filter((b) => Number.isInteger(b.pedir) && b.pedir > 0)
        .map((b) => ({ nombre: b.nombre, presentacion: b.presentacion, pedido: b.pedir, nota: null })),
    })
  }

  const sub = `Para el período ${textoPeriodo(objetivo)}.${noSeCompran.length === 0 ? ''
    : noSeCompran.length === 1 ? ` ${noSeCompran[0]} no aparece: no se compra.`
      : ` ${lista(noSeCompran)} no aparecen: no se compran.`}`

  return (
    <Modal title={`Pedido de ${e.estudio.code} · ${e.estudio.name}`} subtitle={sub} onClose={enviando ? () => {} : cerrar} maxWidth={560}>
      <div style={{ display: 'grid', gridTemplateColumns: COLUMNAS, gap: 8, borderBottom: '1px solid var(--spira-line-2)' }}>
        <div style={rotuloTabla}>Medicamento</div>
        <div style={{ ...rotuloTabla, textAlign: 'right' }}>Calculado</div>
        <div style={{ ...rotuloTabla, textAlign: 'right' }}>Pedir</div>
      </div>
      {borrador.map((r, i) => {
        const cambio = r.calculado != null && r.pedir !== r.calculado
        return (
          <div key={r.medicationId} style={{ display: 'grid', gridTemplateColumns: COLUMNAS, gap: 8, alignItems: 'center', padding: '11px 0', borderBottom: i === borrador.length - 1 ? 'none' : '1px solid var(--spira-line)' }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 14, color: 'var(--spira-ink)' }}>{r.nombre}</div>
              <div style={{ fontSize: 11.5, color: 'var(--spira-ink-soft)', marginTop: 2 }}>
                {[r.presentacion, r.calculado == null ? 'se pide a mano' : null].filter(Boolean).join(' · ')}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              {r.calculado == null
                ? <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--spira-acc-deep-warn)' }}>Sin cargar</span>
                : <span className="spira-mono" style={{ fontSize: 14, color: 'var(--spira-ink-soft)' }}>{r.calculado}</span>}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <input
                type="number" inputMode="numeric" min={0} step={1}
                aria-label={`Pedir de ${r.nombre}`}
                value={pedir[r.medicationId] ?? ''}
                onChange={(ev) => setPedir((prev) => ({ ...prev, [r.medicationId]: ev.target.value }))}
                className="spira-mono"
                /* Lo que se corrigió respecto de lo calculado se eleva: realce por elevación, nunca color. */
                style={{ ...fieldInput, width: 84, ...(cambio ? { boxShadow: 'var(--spira-shadow-sm)' } : {}) }}
              />
            </div>
          </div>
        )
      })}

      {cambios.length > 0 && <div style={{ marginTop: 12 }}>{cambios.map((c) => <AvisoLinea key={c} texto={c} />)}</div>}
      {invalido && <div style={{ marginTop: 8 }}><AvisoLinea tono="warn" texto="Las cantidades van en envases enteros, sin negativos." /></div>}

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, padding: '12px 0 0', marginTop: 8, borderTop: '1px solid var(--spira-line)' }}>
        <span style={{ fontSize: 13, color: 'var(--spira-ink-soft)' }}>En el pedido</span>
        <span className="spira-mono" style={{ fontFamily: 'var(--spira-font-display)', fontSize: 18, fontWeight: 800, color: 'var(--spira-ink)' }}>{total}</span>
        <span style={{ fontFamily: 'var(--spira-font-display)', fontSize: 13, fontWeight: 600, color: 'var(--spira-muted)' }}>{total === 1 ? 'envase' : 'envases'}</span>
        <span style={{ fontSize: 13, color: 'var(--spira-ink-soft)' }}>· {plural(renglones.length, 'medicamento', 'medicamentos')}</span>
      </div>
      {error
        ? <div style={{ marginTop: 10 }}><AvisoLinea tono="danger" texto={error} /></div>
        : <p style={{ fontSize: 12.5, color: 'var(--spira-ink-soft)', margin: '6px 0 0', lineHeight: 1.45 }}>Se guarda con número y queda para recibirlo en Recepción. Un renglón en 0 no va al pedido.</p>}

      <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
        <button type="button" onClick={cerrar} disabled={enviando} style={btnOutline}>Cancelar</button>
        <div style={{ flex: 1 }} />
        <button
          type="button" onClick={() => void emitir()} disabled={!puede}
          title={renglones.length === 0 ? 'El pedido está vacío' : undefined}
          style={{ ...btnPrimary(accentSolid), display: 'inline-flex', alignItems: 'center', gap: 8, opacity: puede ? 1 : 0.6 }}
        >
          <Icon name="printer" size={16} />{enviando ? 'Emitiendo…' : 'Emitir e imprimir'}
        </button>
      </div>
    </Modal>
  )
}
