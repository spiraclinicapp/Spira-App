import { useEffect, useState } from 'react'
import type { CSSProperties, KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { DateField } from '../../../components/DateField'
import { Icon } from '../../../components/Icon'
import { Modal } from '../../../components/Modal'
import { btnOutline, btnPrimary } from '../../../components/buttons'
import { fieldLabelStyle } from '../../../components/FormField'
import { useAuth } from '../../../lib/auth'
import { formatAR } from '../../../lib/dates'
import { diaMes, pedidoOrdenado, registrarPedidoReposicion, renglonesDelPedido } from '../../../data/pharma'
import type { GrupoPedido, OrdenPedido, Reposicion } from '../../../data/pharma'
import { chip, chipActivo } from './estilos'
import { Membrete, PieDePagina, tablaImpresa, tdImpresa, thImpresa } from './impresion'

/**
 * «Ver pedido» (plan de reposición, D46-D47): sólo lo que hay que comprar, ordenado como le sirve a
 * Farmacia para pedir, con «Imprimir» y «Ya lo pedí». Las tres agrupaciones son reglas puras con tests
 * (`pedidoOrdenado`); acá sólo se dibujan. «Ya lo pedí» pide confirmar la fecha y marca TODO el pedido
 * en camino en una llamada atómica: la card deja de pedirlo hasta que se recibe.
 */

const ORDENES: { valor: OrdenPedido; label: string }[] = [
  { valor: 'estudio', label: 'Por estudio' },
  { valor: 'medicamento', label: 'Por medicamento' },
  { valor: 'cantidad', label: 'Por cantidad' },
]

export function VerPedido({ rep, hoy, accentSolid, puedeEditar, onClose, onPedido }: {
  rep: Reposicion
  hoy: string
  accentSolid: string
  puedeEditar: boolean
  onClose: () => void
  onPedido: () => void
}) {
  const { profile } = useAuth()
  const [orden, setOrden] = useState<OrdenPedido>('estudio')
  const [confirmando, setConfirmando] = useState(false)
  const [pedidoEl, setPedidoEl] = useState(hoy)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [imprimiendo, setImprimiendo] = useState<string | null>(null)

  const grupos = pedidoOrdenado(rep, orden)
  const { resumen, plazo } = rep
  const sinCargar = rep.renglones.filter((r) => r.estado === 'sin_cargar')

  /* Mismo mecanismo que Estadísticas: se monta la hoja y recién en el efecto siguiente se imprime. */
  useEffect(() => {
    if (!imprimiendo) return
    const t = window.setTimeout(() => { window.print(); setImprimiendo(null) }, 60)
    return () => window.clearTimeout(t)
  }, [imprimiendo])

  async function confirmar() {
    if (!pedidoEl || enviando) return
    setEnviando(true); setError(null)
    const r = await registrarPedidoReposicion(renglonesDelPedido(rep), pedidoEl)
    setEnviando(false)
    if (r.error) { setError(r.error); return }
    onPedido()
  }

  function teclasOrden(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
    e.preventDefault()
    const i = ORDENES.findIndex((o) => o.valor === orden)
    const j = (i + (e.key === 'ArrowRight' ? 1 : ORDENES.length - 1)) % ORDENES.length
    setOrden(ORDENES[j].valor)
    ;(e.currentTarget.children[j] as HTMLElement | undefined)?.focus()
  }

  if (confirmando) {
    return (
      <Modal title="¿Ya hiciste este pedido?" onClose={() => setConfirmando(false)} maxWidth={460}>
        <form onSubmit={(e) => { e.preventDefault(); void confirmar() }}>
          <p style={{ fontSize: 13, color: 'var(--spira-muted)', lineHeight: 1.5, margin: '0 0 14px' }}>
            Los <span className="spira-mono">{resumen.envases}</span> envases quedan en camino y no se vuelven a pedir. Se descuentan solos al recibirlos.
          </p>
          <div style={{ ...fieldLabelStyle, marginBottom: 6 }}>Pedido el</div>
          <div style={{ width: 200 }}><DateField value={pedidoEl} onChange={setPedidoEl} max={hoy} /></div>
          {error && <p role="alert" style={{ ...errorTexto, marginTop: 12 }}>{error}</p>}
          <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
            <button type="button" style={btnOutline} onClick={() => setConfirmando(false)}>Volver</button>
            <div style={{ flex: 1 }} />
            <button type="submit" disabled={!pedidoEl || enviando} style={{ ...btnPrimary(accentSolid), opacity: !pedidoEl || enviando ? 0.6 : 1 }}>
              {enviando ? 'Guardando…' : 'Sí, ya lo pedí'}
            </button>
          </div>
        </form>
      </Modal>
    )
  }

  return (
    <Modal title={`Pedido para ${plazo.mes.nombre}`} onClose={onClose} maxWidth={640}>
      <p style={{ fontSize: 13, color: 'var(--spira-muted)', margin: '-4px 0 14px' }}>
        <span className="spira-mono">{resumen.envases}</span> envases · <span className="spira-mono">{resumen.medicamentos}</span> {resumen.medicamentos === 1 ? 'medicamento' : 'medicamentos'}
        {plazo.limite && <> · {plazo.aTiempo ? `pedí antes del ${diaMes(plazo.limite)}` : `ya es tarde: si pedís hoy llega el ${plazo.llega ? diaMes(plazo.llega) : '—'}`}</>}
      </p>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span id="orden-pedido" style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--spira-muted)' }}>Ordenar</span>
        <div role="radiogroup" aria-labelledby="orden-pedido" onKeyDown={teclasOrden} style={{ display: 'inline-flex', gap: 7, flexWrap: 'wrap' }}>
          {ORDENES.map((o) => (
            <button
              key={o.valor} type="button" role="radio" aria-checked={orden === o.valor} tabIndex={orden === o.valor ? 0 : -1}
              onClick={() => setOrden(o.valor)} style={{ ...chip, ...(orden === o.valor ? chipActivo : null) }}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      <ListaPedido grupos={grupos} orden={orden} />

      {sinCargar.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: 16, padding: '10px 12px', borderRadius: 10, background: 'var(--spira-surface)', border: '1px solid var(--spira-line)', fontSize: 12.5, color: 'var(--spira-acc-deep-warn)' }}>
          <span style={{ flex: '0 0 14px', marginTop: 2 }}><Icon name="alert" size={14} stroke={1.9} /></span>
          <span>
            {sinCargar.length === 1 ? 'Falta cargar ' : 'Faltan cargar '}
            {sinCargar.slice(0, 3).map((r) => `${r.nombre} (${r.estudio.code})`).join(', ')}
            {sinCargar.length > 3 && ` y ${sinCargar.length - 3} más`}: no {sinCargar.length === 1 ? 'está' : 'están'} en el pedido.
          </span>
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, marginTop: 18, flexWrap: 'wrap' }}>
        <button type="button" style={btnOutline} onClick={onClose}>Cerrar</button>
        <div style={{ flex: 1 }} />
        <button type="button" style={{ ...btnOutline, display: 'inline-flex', alignItems: 'center', gap: 8 }} onClick={() => setImprimiendo(new Date().toISOString())}>
          <Icon name="printer" size={16} /> Imprimir
        </button>
        {puedeEditar && (
          <button type="button" style={{ ...btnPrimary(accentSolid), display: 'inline-flex', alignItems: 'center', gap: 8 }} onClick={() => setConfirmando(true)}>
            <Icon name="truck" size={16} /> Ya lo pedí
          </button>
        )}
      </div>

      {imprimiendo && createPortal(
        <div className="spira-print-doc" aria-hidden="true">
          <HojaPedido rep={rep} grupos={grupos} orden={orden} emitidoEn={imprimiendo} generadoPor={profile?.fullName ?? '—'} />
        </div>,
        document.body,
      )}
    </Modal>
  )
}

function ListaPedido({ grupos, orden }: { grupos: GrupoPedido[]; orden: OrdenPedido }) {
  return (
    <div style={{ marginTop: 6 }}>
      {grupos.map((g) => (
        <div key={g.titulo ?? orden} style={{ marginTop: 12 }}>
          {g.titulo && (
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, padding: '4px 0 6px', borderBottom: '1px solid var(--spira-line-2)' }}>
              <span className="spira-mono" style={{ fontFamily: 'var(--spira-font-display)', fontSize: 14, fontWeight: 700, color: 'var(--spira-ink)' }}>{g.titulo}</span>
              <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--spira-ink-soft)' }}>{envases(g.envases)}</span>
            </div>
          )}
          {g.lineas.map((l, i) => (
            <div key={l.clave} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '10px 0', borderTop: i === 0 && g.titulo ? 'none' : '1px solid var(--spira-line)' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, color: 'var(--spira-ink)' }}>
                  {l.nombre}
                  {orden === 'medicamento' && l.presentacion && <span style={{ fontSize: 12, color: 'var(--spira-ink-soft)' }}> · {l.presentacion}</span>}
                </div>
                <div style={{ fontSize: 12, color: 'var(--spira-ink-soft)', marginTop: 2 }}>
                  {orden === 'estudio' && l.presentacion}
                  {orden === 'medicamento' && l.estudios.map((e) => `${e.code}: ${e.envases}`).join(' · ')}
                  {orden === 'cantidad' && `${l.estudios[0].code}${l.presentacion ? ` · ${l.presentacion}` : ''}`}
                </div>
              </div>
              <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 6 }}>
                <span className="spira-mono" style={{ fontFamily: 'var(--spira-font-display)', fontSize: 18, fontWeight: 700, color: 'var(--spira-ink)' }}>{l.envases}</span>
                <span style={{ fontFamily: 'var(--spira-font-display)', fontSize: 13, fontWeight: 600, color: 'var(--spira-muted)' }}>{l.envases === 1 ? 'envase' : 'envases'}</span>
              </span>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

/** La hoja impresa del pedido: mismo membrete y pie que los reportes de Estadísticas. */
function HojaPedido({ rep, grupos, orden, emitidoEn, generadoPor }: { rep: Reposicion; grupos: GrupoPedido[]; orden: OrdenPedido; emitidoEn: string; generadoPor: string }) {
  const { plazo, resumen } = rep
  return (
    <>
      <Membrete />
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, borderBottom: '1px solid #000', paddingBottom: 6, marginBottom: 10 }}>
        <b style={{ fontSize: 13, letterSpacing: '0.07em' }}>PEDIDO DE COMPRA · {plazo.mes.nombre.toUpperCase()}</b>
        <span style={{ marginLeft: 'auto', fontSize: 10.5 }}>
          {resumen.envases} envases · {resumen.medicamentos} {resumen.medicamentos === 1 ? 'medicamento' : 'medicamentos'}
          {plazo.limite && ` · pedir antes del ${formatAR(plazo.limite)}`}
        </span>
      </div>
      <div style={{ fontSize: 10.5, marginBottom: 12 }}>Generado por {generadoPor}</div>
      {grupos.map((g) => (
        <section key={g.titulo ?? orden} style={{ marginTop: 14 }}>
          {g.titulo && <h4 style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.07em', margin: '0 0 6px' }}>{g.titulo} · {envases(g.envases)}</h4>}
          <table style={tablaImpresa}>
            <thead>
              <tr>
                <th style={thImpresa}>Medicamento</th>
                <th style={thImpresa}>Presentación</th>
                {orden !== 'estudio' && <th style={thImpresa}>{orden === 'medicamento' ? 'Reparto por estudio' : 'Estudio'}</th>}
                <th style={{ ...thImpresa, textAlign: 'right' }}>Envases</th>
              </tr>
            </thead>
            <tbody>
              {g.lineas.map((l) => (
                <tr key={l.clave}>
                  <td style={tdImpresa}>{l.nombre}</td>
                  <td style={tdImpresa}>{l.presentacion ?? '—'}</td>
                  {orden !== 'estudio' && <td style={tdImpresa}>{l.estudios.map((e) => (orden === 'medicamento' ? `${e.code}: ${e.envases}` : e.code)).join(' · ')}</td>}
                  <td style={{ ...tdImpresa, textAlign: 'right', fontWeight: 700 }}>{l.envases}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
      <PieDePagina emitidoEn={emitidoEn} />
    </>
  )
}

const envases = (n: number) => `${n} ${n === 1 ? 'envase' : 'envases'}`

const errorTexto: CSSProperties = {
  fontSize: 13, color: 'var(--spira-acc-deep-danger)', background: 'rgba(166, 72, 59, 0.10)', borderRadius: 8, padding: '9px 12px',
}
