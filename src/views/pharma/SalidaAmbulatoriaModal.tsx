import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { Modal } from '../../components/Modal'
import { FormField, fieldInput } from '../../components/FormField'
import { btnOutline, btnPrimary } from '../../components/buttons'
import { SearchableSelect } from '../../components/SearchableSelect'
import { Icon } from '../../components/Icon'
import { dispensarAmbulatoria, lotesEntregables, bloqueoDeEntrega } from '../../data/pharma'
import type { LotDetailRow } from '../../data/pharma'
import { useTeamRoster } from '../../data/team'
import { ESTADO_CFG } from './expiryState'
import { estadoDe } from './stock/agrupacion'

interface Props {
  accentSolid: string
  medicationName: string
  /** Los lotes del medicamento en el ámbito ambulatorio. Se filtran con `lotesEntregables`: acá
   *  sólo entran los que no tienen protocolo y tienen unidades. Vienen en orden FEFO. */
  lotes: LotDetailRow[]
  /** Lote ya elegido cuando el modal se abre desde una fila de lote; null cuando se abre desde el
   *  medicamento y hay que elegirlo. */
  lotIdInicial: string | null
  /** El formato de fecha de la lista que abrió el modal. Se pasa en vez de importar un helper para
   *  no estrenar un TERCER formato de vencimiento en Pharma (ver TODOS.md): el mismo lote no puede
   *  mostrar una fecha distinta a un clic de distancia. Mismo criterio que ReasignarStockModal. */
  formatFecha: (iso: string | null) => string
  onClose: () => void
  onEntregado: (mensaje: string) => void
}

/**
 * Entregar medicación ambulatoria a alguien que NO es paciente de investigación.
 *
 * EL CASO, en palabras del Director: *"viene el director y te dice dale un Seretide a él; puede
 * que sea el hijo del director, que no figura en ningún lado"*. No hay paciente, ni enrolamiento,
 * ni protocolo, y dar de alta al destinatario como paciente de investigación para poder
 * entregarle un inhalador sería meter dato falso en una base auditable.
 *
 * NO ES UNA DISPENSACIÓN DE PROTOCOLO, y por eso es un modal y no un flujo: aquélla tiene cuatro
 * estados, escaneo por renglón y comprobante numerado porque el producto de investigación es
 * rastreable unidad por unidad ante ANMAT. Acá esa razón no aplica; copiarle la ceremonia haría
 * que no se use, y el stock volvería a salir sin registrarse.
 *
 * TAMPOCO ES UN AJUSTE: `adjust_stock` corrige una cantidad mal contada. Esto entrega una que está
 * bien contada, y queda en el libro como `dispensacion` con `reference_type = 'ambulatoria'`.
 */
export function SalidaAmbulatoriaModal({
  accentSolid, medicationName, lotes, lotIdInicial, formatFecha, onClose, onEntregado,
}: Props) {
  const entregables = useMemo(() => lotesEntregables(lotes), [lotes])

  /* Con un solo lote no hay nada que elegir, así que viene puesto aunque se haya entrado por el
     medicamento. El `lotIdInicial` se acepta sólo si sigue entre los entregables: quien lo manda
     no sabe que acá se filtran los agotados, y un valor que no está entre las opciones deja el
     desplegable mostrando su placeholder con un lote "elegido" por dentro. */
  const inicial = entregables.some((l) => l.lot_id === lotIdInicial) ? (lotIdInicial as string) : ''
  const [lotId, setLotId] = useState(inicial || (entregables.length === 1 ? entregables[0].lot_id : ''))
  const [cantidad, setCantidad] = useState('1')
  const [nombre, setNombre] = useState('')
  const [documento, setDocumento] = useState('')
  const [autorizanteId, setAutorizanteId] = useState('')
  const [nota, setNota] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  /* El padrón sale de `v_team_roster` (0109) y NO de `v_team_access`, que está cerrada a gerencia
     y devuelve una sola fila —la propia— para todos los demás, EN SILENCIO. Con esa fuente, la
     farmacéutica vería únicamente su propio nombre y no habría error que lo explicara. */
  const roster = useTeamRoster()

  const lote = entregables.find((l) => l.lot_id === lotId) ?? null
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
     se note. Se muestra bajo el botón en vez de deshabilitarlo mudo. */
  const bloqueo = lote
    ? bloqueoDeEntrega({
        cantidad: Number(cantidad),
        disponible: lote.quantity_on_hand,
        nombre,
        autorizanteId,
      })
    : 'Elegí de qué lote sale.'

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!lote) { setError('Elegí de qué lote sale.'); return }
    if (bloqueo) { setError(bloqueo); return }

    setBusy(true)
    setError(null)
    const res = await dispensarAmbulatoria({
      lotId: lote.lot_id,
      quantity: Number(cantidad),
      recipientName: nombre.trim(),
      recipientDocument: documento.trim() || null,
      authorizedBy: autorizanteId,
      notes: nota.trim() || null,
    })
    setBusy(false)
    if (res.error) { setError(res.error); return }
    const n = Number(cantidad)
    onEntregado(
      `${n} ${n === 1 ? 'unidad' : 'unidades'} de ${medicationName} ${n === 1 ? 'salió' : 'salieron'} a ${nombre.trim()}`,
    )
  }

  /* Sin lotes entregables no hay nada que entregar, y decirlo es más útil que un desplegable
     vacío. Se distingue del caso "no cargó el padrón", que no bloquea: sin el padrón el
     desplegable de autorizante queda vacío y el bloqueo del botón ya lo explica. */
  if (entregables.length === 0) {
    return (
      <Modal title={`Entregar · ${medicationName}`} onClose={onClose}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <p style={{ fontSize: 13.5, color: 'var(--spira-muted)', lineHeight: 1.55, margin: 0 }}>
            Este medicamento no tiene unidades para entregar en la farmacia ambulatoria: todos sus
            lotes están en cero.
          </p>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button type="button" onClick={onClose} style={btnOutline}>Cerrar</button>
          </div>
        </div>
      </Modal>
    )
  }

  return (
    <Modal title={`Entregar · ${medicationName}`} onClose={onClose} maxWidth={470}>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <p style={{ fontSize: 13, color: 'var(--spira-muted)', lineHeight: 1.5, margin: 0 }}>
          Para entregar medicación a alguien que <b>no es paciente de un estudio</b>. Sale del stock
          ambulatorio y queda registrada en el libro.
        </p>

        <FormField label="Lote">
          <SearchableSelect
            value={lotId}
            onChange={(v) => { setLotId(v); setError(null) }}
            options={entregables.map((l) => ({
              value: l.lot_id,
              label: etiquetaLote(l),
              ...(estadoDe(l) === 'ok' ? {} : { dot: ESTADO_CFG[estadoDe(l)].color }),
            }))}
            placeholder="Elegí el lote"
            searchPlaceholder="Buscar lote…"
            searchable={entregables.length > 3 ? 'always' : 'auto'}
            mono
          />
        </FormField>

        {lote && estado !== 'ok' && (
          <div style={{
            display: 'flex', alignItems: 'flex-start', gap: 8,
            fontSize: 12.5, lineHeight: 1.45, color: cfg.color,
            background: 'var(--spira-surface)',
            borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--spira-line)',
            borderRadius: 10, padding: '9px 12px',
          }}>
            {cfg.icon && <Icon name={cfg.icon} size={15} color={cfg.color} />}
            <span>
              {estado === 'vencido'
                ? 'Este lote está vencido. No conviene entregarlo.'
                : 'Este lote vence pronto. Fijate que llegue a usarse antes de la fecha.'}
            </span>
          </div>
        )}

        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <div style={{ flex: '0 0 108px' }}>
            <FormField label="Cantidad">
              <input
                type="number"
                value={cantidad}
                onChange={(e) => { setCantidad(e.target.value); setError(null) }}
                required
                min={1}
                max={lote?.quantity_on_hand}
                step={1}
                style={fieldInput}
              />
            </FormField>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <FormField label="Quién recibe">
              <input
                value={nombre}
                onChange={(e) => { setNombre(e.target.value); setError(null) }}
                required
                style={fieldInput}
                placeholder="Nombre y apellido"
              />
            </FormField>
          </div>
        </div>

        <FormField label="Documento (opcional)">
          <input
            value={documento}
            onChange={(e) => setDocumento(e.target.value)}
            style={fieldInput}
            placeholder="DNI, si corresponde"
          />
        </FormField>

        <FormField label="Quién autoriza">
          <SearchableSelect
            value={autorizanteId}
            onChange={(v) => { setAutorizanteId(v); setError(null) }}
            options={(roster.data ?? []).map((p) => ({
              value: p.id,
              label: p.puesto ? `${p.full_name} · ${p.puesto}` : p.full_name,
            }))}
            placeholder={roster.loading ? 'Cargando…' : 'Elegí quién autorizó la entrega'}
            searchPlaceholder="Buscar persona…"
            entity="persona"
            disabled={roster.loading || (roster.data ?? []).length === 0}
          />
        </FormField>

        <FormField label="Nota (opcional)">
          <input value={nota} onChange={(e) => setNota(e.target.value)} style={fieldInput} />
        </FormField>

        <div style={{
          display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12,
          color: 'var(--spira-muted)', background: 'var(--spira-surface)',
          borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--spira-line)',
          borderRadius: 10, padding: '10px 12px', lineHeight: 1.45,
        }}>
          <Icon name="info" size={15} color="var(--spira-muted)" />
          <span>
            La entrega queda registrada en el libro de stock y no se puede editar ni borrar. Si te
            equivocás, se corrige con un ajuste.
          </span>
        </div>

        {error && (
          <div
            style={{
              fontSize: 13, color: 'var(--spira-acc-deep-danger)',
              background: 'rgba(166, 72, 59, 0.10)', borderRadius: 8, padding: '8px 12px',
            }}
            aria-live="assertive"
          >
            {error}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8, marginTop: 2 }}>
          {bloqueo && !error && (
            <span style={{ fontSize: 12, color: 'var(--spira-muted)', marginRight: 'auto' }}>{bloqueo}</span>
          )}
          <button type="button" onClick={onClose} style={btnOutline}>Cancelar</button>
          <button
            type="submit"
            disabled={busy || bloqueo !== null}
            style={{
              ...btnPrimary(bloqueo ? 'var(--spira-line-2)' : accentSolid),
              opacity: busy || bloqueo ? 0.7 : 1,
              cursor: busy || bloqueo ? 'default' : 'pointer',
            }}
          >
            {busy ? 'Entregando…' : 'Entregar'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
