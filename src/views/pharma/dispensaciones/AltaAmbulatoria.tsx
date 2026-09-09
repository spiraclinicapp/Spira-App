import { useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { Icon } from '../../../components/Icon'
import { SearchableSelect } from '../../../components/SearchableSelect'
import { btnOutline, btnPrimary } from '../../../components/buttons'
import {
  bloqueoDeEntrega,
  dispensarAmbulatoria,
  loteFefo,
  lotesEntregables,
  medicamentosEntregables,
  useAmbulatoriaLots,
} from '../../../data/pharma'
import type { LotDetailRow } from '../../../data/pharma'
import { useTeamRoster } from '../../../data/team'
import { todayISO } from '../../../lib/dates'
import { ESTADO_CFG } from '../expiryState'
import { estadoDe } from '../stock/agrupacion'

/**
 * Entregar medicación ambulatoria a alguien que NO es paciente de investigación, desde el mismo
 * "Nueva dispensación" que las de protocolo.
 *
 * EL CASO, en palabras del Director: *"viene el director y te dice dale un Seretide a él; puede
 * que sea el hijo del director, que no figura en ningún lado"*. No hay paciente, ni enrolamiento,
 * ni protocolo, y dar de alta al destinatario como paciente de investigación para poder
 * entregarle un inhalador sería meter dato falso en una base auditable (spec D1).
 *
 * ┌──────────────────────────────────────────────────────────────────────────────────────────┐
 * │ POR QUÉ ESTÁ ACÁ Y NO EN EL KEBAB DE STOCK, QUE ES DE DONDE VIENE                         │
 * │                                                                                           │
 * │ La `v0.64.0` lo puso en el menú ⋯ del medicamento, dentro de Stock. El Director, con la    │
 * │ pantalla en producción: *"genera muchísima fricción si lo hacemos en el panqueque de       │
 * │ stock"*. Y era **el contra que el propio spec le había puesto a esa decisión**: Stock es   │
 * │ donde se MIRA el inventario, no donde se ENTREGA algo. Para entregar había que ir a Stock, │
 * │ buscar el medicamento, desplegar el grupo y abrir el kebab — cuatro pasos para un acto que │
 * │ es uno.                                                                                    │
 * │                                                                                           │
 * │ Y de ahí sale el ORDEN de los campos, que es al revés del recorrido viejo: primero la      │
 * │ PERSONA y después el medicamento, como pasa en el mostrador. Antes se entraba por el       │
 * │ medicamento porque la pantalla de origen estaba ordenada por medicamento, no porque el     │
 * │ trabajo funcione así.                                                                      │
 * └──────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * NO ES UNA DISPENSACIÓN DE PROTOCOLO, y por eso no tiene estados ni escaneo ni comprobante:
 * aquélla los tiene porque el producto de investigación es rastreable unidad por unidad ante
 * ANMAT. Acá esa razón no aplica, y copiarle la ceremonia haría que no se use — con el stock
 * volviendo a salir sin registrarse, que es el agujero que esto vino a tapar (spec D4).
 *
 * TAMPOCO ES UN AJUSTE: `adjust_stock` corrige una cantidad mal contada. Esto entrega una que
 * está bien contada, y queda en el libro como `dispensacion` con `reference_type = 'ambulatoria'`.
 */
export function AltaAmbulatoria({ onClose, onEntregado }: {
  onClose: () => void
  onEntregado: (mensaje: string) => void
}) {
  const [nombre, setNombre] = useState('')
  const [documento, setDocumento] = useState('')
  const [autorizanteId, setAutorizanteId] = useState('')
  const [medId, setMedId] = useState('')
  const [lotId, setLotId] = useState('')
  const [cantidad, setCantidad] = useState('1')
  const [nota, setNota] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  /* Todos los lotes del ámbito ambulatorio (protocol_id null). De acá salen las dos listas: los
     medicamentos que tienen algo, y los lotes del que se eligió. Para traer stock de un estudio
     está Reasignar (0113) — este formulario nunca lo ofrece (spec D7). */
  const ambuLots = useAmbulatoriaLots()

  /* El padrón sale de `v_team_roster` (0109) y NO de `v_team_access`, que está cerrada a gerencia
     y devuelve una sola fila —la propia— para todos los demás, EN SILENCIO. Con esa fuente, la
     farmacéutica vería únicamente su propio nombre y no habría error que lo explicara. */
  const roster = useTeamRoster()

  const medicamentos = useMemo(() => medicamentosEntregables(ambuLots.data ?? []), [ambuLots.data])

  /* Los lotes entregables del medicamento elegido, en el orden en que los trae la consulta
     (nombre, después vencimiento ascendente): o sea ya en orden FEFO dentro del medicamento. */
  const lotes = useMemo(
    () => lotesEntregables((ambuLots.data ?? []).filter((l) => l.medication_id === medId)),
    [ambuLots.data, medId],
  )
  const lote: LotDetailRow | null = lotes.find((l) => l.lot_id === lotId) ?? null

  /**
   * Elegir el medicamento deja el lote resuelto por FEFO, que es lo que corresponde entregar y
   * lo que la base ya hace sola en la rama de protocolo.
   *
   * Se puede cambiar a mano: el desplegable queda ahí con todos los lotes. La diferencia entre
   * "resolver por FEFO" y "obligar a FEFO" importa — un lote se puede querer saltear por un
   * motivo que el sistema no conoce, y quitarle la decisión a quien tiene el estante enfrente
   * sería decidir con menos información que ella.
   */
  const elegirMedicamento = (v: string) => {
    setMedId(v)
    setErr(null)
    const delMed = lotesEntregables((ambuLots.data ?? []).filter((l) => l.medication_id === v))
    setLotId(loteFefo(delMed, todayISO())?.lot_id ?? '')
  }

  const estado = lote ? estadoDe(lote) : 'ok'
  const cfg = ESTADO_CFG[estado]

  const etiquetaLote = (l: LotDetailRow) => {
    const venc = l.expiry_date
      ? `${estadoDe(l) === 'vencido' ? 'VENCIDO' : 'vence'} ${formatFecha(l.expiry_date)}`
      : 'sin vencimiento'
    return `${l.lot_number} · ${venc} · ${l.quantity_on_hand} ${l.quantity_on_hand === 1 ? 'unidad' : 'u.'}`
  }

  /* El bloqueo se calcula con la regla pura y testeada, no acá: es la que distingue "todavía no
     llenaste esto" de "esto la base lo va a rechazar", y la que no puede quedar al revés sin que
     se note. Se muestra bajo el botón en vez de deshabilitarlo mudo.
     El orden de los mensajes sigue al del formulario, que ahora arranca por la persona. */
  const bloqueo = ((): string | null => {
    if (nombre.trim() === '') return 'Poné el nombre de quien retira la medicación.'
    if (autorizanteId === '') return 'Elegí quién autorizó la entrega.'
    if (!medId) return 'Elegí qué medicamento se entrega.'
    if (!lote) return 'Elegí de qué lote sale.'
    return bloqueoDeEntrega({
      cantidad: Number(cantidad),
      disponible: lote.quantity_on_hand,
      nombre,
      autorizanteId,
    })
  })()

  const entregar = async () => {
    if (!lote || bloqueo || busy) return
    setBusy(true)
    setErr(null)
    const res = await dispensarAmbulatoria({
      lotId: lote.lot_id,
      quantity: Number(cantidad),
      recipientName: nombre.trim(),
      recipientDocument: documento.trim() || null,
      authorizedBy: autorizanteId,
      notes: nota.trim() || null,
    })
    setBusy(false)
    if (res.error) { setErr(res.error); return }
    const n = Number(cantidad)
    const med = medicamentos.find((m) => m.medicationId === medId)?.nombre ?? 'la medicación'
    onEntregado(`${n} ${n === 1 ? 'unidad' : 'unidades'} de ${med} ${n === 1 ? 'salió' : 'salieron'} a ${nombre.trim()}`)
  }

  return (
    <>
      <div style={body}>
        <div style={notaBox}>
          <Icon name="info" size={15} color="var(--spira-muted)" />
          <span>
            Para entregar medicación a alguien que <b>no es paciente de un estudio</b>. Sale del
            stock de la farmacia ambulatoria y queda asentada en el libro.
          </span>
        </div>

        <p className="spira-eyebrow" style={{ margin: '18px 0 10px' }}>Quién retira</p>

        <div style={{ marginBottom: 12 }}>
          <label htmlFor="amb-nombre" style={lbl}>Nombre y apellido</label>
          <input
            id="amb-nombre"
            value={nombre}
            onChange={(e) => { setNombre(e.target.value); setErr(null) }}
            style={campo}
            placeholder="Quién se lleva la medicación"
          />
        </div>

        <div style={{ marginBottom: 12 }}>
          <label htmlFor="amb-doc" style={lbl}>Documento (opcional)</label>
          <input
            id="amb-doc"
            value={documento}
            onChange={(e) => setDocumento(e.target.value)}
            style={campo}
            placeholder="DNI, si corresponde"
          />
        </div>

        {/* Obligatorio y distinto de quien despacha: la farmacéutica ejecuta pero no decide, y sin
            esta columna sería la única persona registrada en una decisión que no tomó (spec D3). */}
        <div>
          <label htmlFor="amb-autoriza" style={lbl}>Quién autoriza la entrega</label>
          <SearchableSelect
            id="amb-autoriza"
            value={autorizanteId}
            onChange={(v) => { setAutorizanteId(v); setErr(null) }}
            options={(roster.data ?? []).map((p) => ({
              value: p.id,
              label: p.puesto ? `${p.full_name} · ${p.puesto}` : p.full_name,
            }))}
            placeholder={roster.loading ? 'Cargando el equipo…' : 'Elegí quién autorizó la entrega'}
            searchPlaceholder="Buscar persona…"
            entity="persona"
            disabled={roster.loading || (roster.data ?? []).length === 0}
          />
        </div>

        <p className="spira-eyebrow" style={{ margin: '20px 0 10px' }}>Qué se entrega</p>

        <div style={{ marginBottom: 12 }}>
          <label htmlFor="amb-med" style={lbl}>Medicamento</label>
          <SearchableSelect
            id="amb-med"
            value={medId}
            onChange={elegirMedicamento}
            options={medicamentos.map((m) => ({
              value: m.medicationId,
              label: m.nombre,
              desc: `${m.disponible} ${m.disponible === 1 ? 'unidad' : 'u.'} en el ámbito ambulatorio`,
            }))}
            menuWidth="auto"
            placeholder={
              ambuLots.loading ? 'Cargando el stock…'
                : medicamentos.length === 0 ? 'No hay stock ambulatorio para entregar'
                : 'Elegí el medicamento'
            }
            searchPlaceholder="Buscar medicamento…"
            entity="medicamento"
            disabled={ambuLots.loading || medicamentos.length === 0}
          />
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', marginBottom: 4 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <label htmlFor="amb-lote" style={lbl}>Lote</label>
            <SearchableSelect
              id="amb-lote"
              value={lotId}
              onChange={(v) => { setLotId(v); setErr(null) }}
              options={lotes.map((l) => ({
                value: l.lot_id,
                label: etiquetaLote(l),
                ...(estadoDe(l) === 'ok' ? {} : { dot: ESTADO_CFG[estadoDe(l)].color }),
              }))}
              menuWidth="auto"
              placeholder={!medId ? 'Elegí primero el medicamento' : 'Elegí el lote'}
              searchPlaceholder="Buscar lote…"
              searchable={lotes.length > 3 ? 'always' : 'auto'}
              disabled={!medId || lotes.length === 0}
              mono
            />
          </div>
          <div style={{ flex: '0 0 96px' }}>
            <label htmlFor="amb-cant" style={lbl}>Cantidad</label>
            <input
              id="amb-cant"
              type="number"
              value={cantidad}
              onChange={(e) => { setCantidad(e.target.value); setErr(null) }}
              min={1}
              max={lote?.quantity_on_hand}
              step={1}
              style={campo}
            />
          </div>
        </div>

        {/* El lote llega elegido por FEFO, así que este aviso es la contracara: si el que
            corresponde entregar vence pronto —o si se eligió a mano uno vencido— hay que decirlo
            ANTES de entregarlo, no después. */}
        {lote && estado !== 'ok' && (
          <div style={{ ...avisoLote, color: cfg.color }}>
            {cfg.icon && <Icon name={cfg.icon} size={15} color={cfg.color} />}
            <span>
              {estado === 'vencido'
                ? 'Este lote está vencido. No conviene entregarlo.'
                : 'Este lote vence pronto. Fijate que llegue a usarse antes de la fecha.'}
            </span>
          </div>
        )}

        <div style={{ marginTop: 14 }}>
          <label htmlFor="amb-nota" style={lbl}>Nota (opcional)</label>
          <input id="amb-nota" value={nota} onChange={(e) => setNota(e.target.value)} style={campo} />
        </div>

        <div style={notaBox}>
          <Icon name="info" size={15} color="var(--spira-muted)" />
          <span>
            La entrega queda registrada en el libro de stock y no se puede editar ni borrar. Si te
            equivocás, se corrige con un ajuste.
          </span>
        </div>

        {err && (
          <div style={errBox} role="alert">
            <Icon name="alertCircle" size={15} />
            <span>{err}</span>
          </div>
        )}
      </div>

      <div style={foot}>
        <button type="button" onClick={onClose} style={btnOutline}>Cancelar</button>
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
          <button
            type="button" onClick={entregar} disabled={!!bloqueo || busy}
            style={{
              ...btnPrimary(bloqueo ? 'var(--spira-line-2)' : 'var(--spira-pharma-solid)'),
              display: 'flex', alignItems: 'center', gap: 8,
              cursor: bloqueo || busy ? 'default' : 'pointer', opacity: bloqueo || busy ? 0.7 : 1,
            }}
          >
            <Icon name="arrowUpRight" size={16} color="var(--spira-on-accent)" />
            {busy ? 'Entregando…' : 'Entregar'}
          </button>
          {bloqueo && <span style={{ fontSize: 12, color: 'var(--spira-muted)' }}>{bloqueo}</span>}
        </div>
      </div>
    </>
  )
}

/* El mismo formato de vencimiento que la lista de Stock. Se repite acá en vez de importarse para
   no estrenar un TERCER formato en Pharma (ver TODOS.md): el mismo lote no puede mostrar una
   fecha distinta a un clic de distancia. */
function formatFecha(iso: string | null): string {
  if (!iso) return '—'
  const p = iso.split('-')
  return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : iso
}

const body: CSSProperties = { padding: '4px 22px 22px', overflowY: 'auto', flex: 1 }

const foot: CSSProperties = {
  display: 'flex', alignItems: 'flex-start', gap: 10, padding: '14px 22px',
  borderTop: '1px solid var(--spira-line)', background: 'var(--spira-white)',
}

const lbl: CSSProperties = {
  display: 'block', fontSize: 12.5, fontWeight: 600, color: 'var(--spira-muted)', marginBottom: 6,
}

const campo: CSSProperties = {
  width: '100%', height: 44, padding: '0 12px', borderRadius: 10,
  borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--spira-line-2)',
  background: 'var(--spira-white)', color: 'var(--spira-ink)',
  fontFamily: 'var(--spira-font-text)', fontSize: 14, boxSizing: 'border-box',
}

const notaBox: CSSProperties = {
  display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: 14, fontSize: 12,
  color: 'var(--spira-muted)', background: 'var(--spira-surface)',
  border: '1px solid var(--spira-line)', borderRadius: 10, padding: '10px 12px', lineHeight: 1.45,
}

const avisoLote: CSSProperties = {
  display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: 12,
  fontSize: 12.5, lineHeight: 1.45, background: 'var(--spira-surface)',
  borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--spira-line)',
  borderRadius: 10, padding: '9px 12px',
}

const errBox: CSSProperties = {
  display: 'flex', alignItems: 'flex-start', gap: 7, marginTop: 12, fontSize: 12.5,
  color: 'var(--spira-acc-deep-danger)', background: 'rgba(166, 72, 59, 0.08)',
  border: '1px solid rgba(166, 72, 59, 0.25)', borderRadius: 8, padding: '9px 11px',
}
