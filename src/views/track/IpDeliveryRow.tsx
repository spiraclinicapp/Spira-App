import { useState } from 'react'
import type { CSSProperties } from 'react'
import { Icon } from '../../components/Icon'
import { SearchableSelect } from '../../components/SearchableSelect'
import type { SelectOption } from '../../components/SearchableSelect'
import { cerrarIpDeVisita, reabrirIpDeVisita, useEntregasIpDelEnrolamiento } from '../../data/visitIp'
import type { MotivoNoCorresponde, VisitIpStatusRow } from '../../data/visitIp'
import { formatDateAR } from '../../lib/dates'
import { accionesIp, cierreListo, detalleIp, ipHecho, MOTIVOS_NO_CORRESPONDE, TITULO_IP } from './ipEstado'

type TipoCierre = 'no_corresponde' | 'entregado_en_otra_visita'

const TIPOS: SelectOption[] = [
  { value: 'no_corresponde', label: 'No corresponde entregarlo' },
  { value: 'entregado_en_otra_visita', label: 'Se entregó en otra visita' },
]

/**
 * La primera fila del panel de Procedimientos cuando la visita lleva producto en investigación
 * (plan `docs/plan-dispensacion-base-e-imp.md`, D1).
 *
 * NO ES UN PROCEDIMIENTO GUARDADO: es el estado de la entrega, leído de `v_visit_ip_status` (0119).
 * Por eso no tiene tilde que se toque — se marca sola cuando Farmacia confirma la entrega, y ése es
 * justamente el pedido: nadie en Coordinación puede darla por hecha. Se ve igual que las demás filas
 * (mismo borde, el mismo "asentarse" en el panel cuando está hecha) porque para quien la lee ES un
 * procedimiento más de la visita.
 *
 * Lo único que se ofrece son las dos salidas explícitas (D2, D11), y sólo cuando el IP está abierto y
 * sin un pedido vivo en Farmacia. Van plegadas detrás de un botón con nombre: son la excepción, y no
 * pueden competir con la regla.
 */
export function IpDeliveryRow({ row, accent, readOnly, terminada }: {
  row: VisitIpStatusRow
  accent: string
  readOnly: boolean
  /** La visita tiene fin de atención: cambia cómo se dice lo pendiente (`desenlaceIp`). */
  terminada: boolean
}) {
  const [abierto, setAbierto] = useState(false)
  const [tipo, setTipo] = useState<TipoCierre | null>(null)
  const [motivo, setMotivo] = useState<MotivoNoCorresponde | null>(null)
  const [detalle, setDetalle] = useState('')
  const [entrega, setEntrega] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const hecho = ipHecho(row.estado)
  const { puedeCerrar, puedeDeshacer } = accionesIp(row.estado, readOnly)

  // Las entregas del enrolamiento se piden recién cuando hacen falta: casi nadie abre este camino.
  const entregasQ = useEntregasIpDelEnrolamiento(row.enrollment_id, row.visit_id, abierto && tipo === 'entregado_en_otra_visita')
  const opcionesEntrega: SelectOption[] = (entregasQ.data ?? []).map((e) => ({
    value: e.dispensation_id,
    label: `${e.visit_code ?? 'Visita'} · ${formatDateAR(e.delivered_at)} · ${e.ip_kits} ${e.ip_kits === 1 ? 'kit' : 'kits'}`,
  }))

  const listo = cierreListo(tipo, motivo, detalle, entrega)

  const limpiar = () => {
    setAbierto(false); setTipo(null); setMotivo(null); setDetalle(''); setEntrega(null); setErr(null)
  }

  async function guardar() {
    if (!tipo || !listo || busy) return
    setBusy(true); setErr(null)
    const res = await cerrarIpDeVisita({ visitId: row.visit_id, kind: tipo, motivo, detalle, dispensationId: entrega })
    setBusy(false)
    if (res.error) { setErr(res.error); return }
    limpiar()
  }

  async function deshacer() {
    if (busy) return
    setBusy(true); setErr(null)
    const res = await reabrirIpDeVisita(row.visit_id)
    setBusy(false)
    if (res.error) setErr(res.error)
  }

  return (
    <div style={{ borderRadius: 12, border: '1px solid var(--spira-line)', background: hecho ? 'var(--spira-paper)' : 'var(--spira-white)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div
          style={{ ...rowBase, flex: 1, minWidth: 0 }}
          title={hecho ? undefined : 'Se marca cuando Farmacia confirma la entrega.'}
        >
          {/* El mismo cuadrito que las demás filas, pero no es un control: no hay tilde que tocar. */}
          <span aria-hidden="true" style={tickBox(hecho, accent)}>
            <Icon name="check" size={13} stroke={2.2} color="var(--spira-on-accent)" style={{ opacity: hecho ? 1 : 0 }} />
          </span>
          <span style={{ minWidth: 0, flex: 1 }}>
            {/* Sin rótulo oculto de "realizado/pendiente": la línea de abajo ya dice el estado en
                palabras ("Entregado por…", "Sin entregar…"), que es lo que lee el lector de pantalla. */}
            <span style={{ display: 'block', fontSize: 13.5, color: 'var(--spira-ink)' }}>{TITULO_IP}</span>
            {/* `ink-soft` y no `muted`: sobre el papel de la fila hecha, `muted` no llega a 4.5:1
                (mismo porqué que en VisitProcedures). */}
            <span style={{ display: 'block', marginTop: 2, fontSize: 11.5, color: 'var(--spira-ink-soft)', lineHeight: 1.4 }}>
              {detalleIp(row, terminada)}
            </span>
          </span>
        </div>

        {puedeCerrar && !abierto && (
          <button type="button" className="spira-no-press" onClick={() => setAbierto(true)} style={{ ...pill, marginRight: 13 }}>
            No se entrega acá
          </button>
        )}
        {puedeDeshacer && (
          <button type="button" className="spira-no-press" onClick={() => void deshacer()} disabled={busy} style={{ ...pill, marginRight: 13 }}>
            {busy ? 'Deshaciendo…' : 'Deshacer'}
          </button>
        )}
      </div>

      {err && !abierto && <div style={{ padding: '0 13px 11px 45px', fontSize: 12.5, color: 'var(--spira-acc-deep-danger)' }}>{err}</div>}

      {abierto && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '2px 13px 12px 45px' }}>
          <SearchableSelect
            options={TIPOS}
            value={tipo ?? ''}
            onChange={(v) => { setTipo(v as TipoCierre); setErr(null) }}
            placeholder="Elegí qué pasó"
            searchable="never"
          />

          {tipo === 'no_corresponde' && (
            <>
              <SearchableSelect
                options={MOTIVOS_NO_CORRESPONDE.map((m) => ({ value: m.value, label: m.label }))}
                value={motivo ?? ''}
                onChange={(v) => setMotivo(v as MotivoNoCorresponde)}
                placeholder="Elegí el motivo"
                searchable="never"
              />
              {motivo === 'otro' && (
                <input
                  value={detalle}
                  onChange={(e) => setDetalle(e.target.value)}
                  placeholder="Contá brevemente el motivo"
                  maxLength={200}
                  style={input}
                />
              )}
            </>
          )}

          {tipo === 'entregado_en_otra_visita' && (
            entregasQ.loading
              ? <div style={{ fontSize: 12.5, color: 'var(--spira-muted)' }}>Buscando entregas de este paciente…</div>
              : opcionesEntrega.length === 0
                ? <div style={{ fontSize: 12.5, color: 'var(--spira-muted)' }}>No hay otra entrega de producto en investigación para elegir.</div>
                : (
                  <SearchableSelect
                    options={opcionesEntrega}
                    value={entrega ?? ''}
                    onChange={setEntrega}
                    placeholder="Elegí la entrega"
                    searchable="never"
                  />
                )
          )}

          {err && <div style={{ fontSize: 12.5, color: 'var(--spira-acc-deep-danger)' }}>{err}</div>}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button type="button" onClick={limpiar} disabled={busy} style={btnQuiet}>Cancelar</button>
            <button
              type="button"
              onClick={() => void guardar()}
              disabled={!listo || busy}
              style={{ ...btnSolid, background: accent, opacity: !listo || busy ? 0.55 : 1, cursor: !listo || busy ? 'default' : 'pointer' }}
            >
              {busy ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

const rowBase: CSSProperties = { display: 'flex', alignItems: 'center', gap: 12, padding: '11px 13px' }

function tickBox(hecho: boolean, accent: string): CSSProperties {
  return {
    flex: '0 0 auto', width: 20, height: 20, borderRadius: 6,
    display: 'grid', placeItems: 'center',
    borderWidth: 1.5, borderStyle: 'solid', borderColor: hecho ? accent : 'var(--spira-muted)',
    background: hecho ? accent : 'transparent',
  }
}

const pill: CSSProperties = {
  flex: '0 0 auto', display: 'inline-flex', alignItems: 'center', height: 26, padding: '0 10px',
  borderRadius: 'var(--spira-radius-pill)',
  borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--spira-line-2)',
  background: 'transparent', color: 'var(--spira-ink)',
  fontFamily: 'var(--spira-font-text)', fontSize: 12, fontWeight: 600, cursor: 'pointer',
}

const input: CSSProperties = {
  height: 40, borderRadius: 10, borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--spira-line-2)',
  background: 'var(--spira-white)', padding: '0 12px',
  fontFamily: 'var(--spira-font-text)', fontSize: 13.5, color: 'var(--spira-ink)',
}

const btnQuiet: CSSProperties = {
  height: 34, padding: '0 14px', borderRadius: 9, borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--spira-line)',
  background: 'var(--spira-white)', color: 'var(--spira-ink)',
  fontFamily: 'var(--spira-font-text)', fontSize: 13, fontWeight: 600, cursor: 'pointer',
}

const btnSolid: CSSProperties = {
  height: 34, padding: '0 16px', borderRadius: 9, border: 'none', color: 'var(--spira-on-accent)',
  fontFamily: 'var(--spira-font-text)', fontSize: 13, fontWeight: 700,
}
