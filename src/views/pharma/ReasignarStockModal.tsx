import { useMemo, useState } from 'react'
import type { CSSProperties, FormEvent } from 'react'
import { Modal } from '../../components/Modal'
import { FormField, fieldInput } from '../../components/FormField'
import { btnOutline, btnPrimary } from '../../components/buttons'
import { SearchableSelect } from '../../components/SearchableSelect'
import { Icon } from '../../components/Icon'
import { reassignLotStock } from '../../data/pharma'
import type { LotDetailRow } from '../../data/pharma'
import type { ProtocolRow } from '../../data/protocols'
import { ESTADO_CFG } from './expiryState'
import { estadoDe } from './stock/agrupacion'
import { destinosPara, validarCantidad } from './stock/reasignacion'

/** Motivos preestablecidos. Desplegable y no texto libre: el motivo entra al libro de stock, y un
 *  campo abierto termina con "cambio", "x" y "asd" en un registro auditable. La nota queda para el
 *  detalle, igual que en Ajustar stock. */
const MOTIVOS = [
  'Redistribución entre estudios',
  'Corrección de una recepción mal cargada',
  'Consolidación de stock',
  'Devolución al stock ambulatorio',
  'Otro',
]

interface Props {
  accentSolid: string
  medicationName: string
  /** TODOS los lotes del medicamento en su ámbito, SIN el filtro de vencimiento de la lista: si
   *  el usuario tenía puesto "Vencidos", el modal igual tiene que dejarlo mover cualquier lote.
   *  Vienen en orden FEFO (la query ordena por vencimiento). */
  lotes: LotDetailRow[]
  /** Lote ya elegido cuando el modal se abre desde una fila de lote; null cuando se abre desde el
   *  medicamento y hay que elegirlo. */
  lotIdInicial: string | null
  /** Ámbito de ORIGEN. null = ambulatoria (CHECK de la 0035). */
  protocolIdActual: string | null
  /** `null` = la lista de protocolos todavía no cargó o falló. NO es lo mismo que `[]`: con el
   *  arreglo vacío el modal afirma que no hay a dónde mover, y eso sería inventar un hecho. */
  protocolos: readonly ProtocolRow[] | null
  /** El formato de fecha de la lista que abrió el modal. Se pasa en vez de importar un helper para
   *  no estrenar un TERCER formato de vencimiento en Pharma (ver TODOS.md): el mismo lote no puede
   *  mostrar una fecha distinta a un clic de distancia. */
  formatFecha: (iso: string | null) => string
  onClose: () => void
  onReasignado: (mensaje: string) => void
}

/**
 * Mover unidades de un lote a otro protocolo o al ámbito ambulatorio.
 *
 * NO ES LO MISMO QUE `ModalReasignar` de Dispensaciones, que pasa la PREPARACIÓN de un pedido a
 * otra farmacéutica. Acá se mueve medicación entre estantes; allá, trabajo entre personas. Por eso
 * el título dice "Reasignar stock" y nunca "Reasignar" a secas.
 *
 * Tampoco es un ajuste: `adjust_stock` corrige una cantidad que estaba mal contada, y esto traslada
 * una que está bien contada. La base lo escribe como DOS asientos emparejados (`reassign_lot_stock`,
 * 0113), no como una baja y un alta sin relación.
 */
export function ReasignarStockModal({
  accentSolid, medicationName, lotes, lotIdInicial, protocolIdActual, protocolos, formatFecha, onClose, onReasignado,
}: Props) {
  /* Con un solo lote no hay nada que elegir, así que viene puesto aunque se haya entrado por el
     medicamento: obligar a abrir un desplegable de una opción es fricción sin información. El
     `lotIdInicial` se acepta sólo si sigue en la lista — quien lo manda no sabe que acá se filtran
     los agotados, y un valor que no está entre las opciones deja el desplegable mostrando su
     placeholder con un lote "elegido" por dentro. */
  const inicial = lotes.some((l) => l.lot_id === lotIdInicial) ? (lotIdInicial as string) : ''
  const [lotId, setLotId] = useState(inicial || (lotes.length === 1 ? lotes[0].lot_id : ''))
  const [cantidad, setCantidad] = useState('')
  const [destinoValue, setDestinoValue] = useState('')
  const [motivo, setMotivo] = useState('')
  const [nota, setNota] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const destinos = useMemo(
    () => destinosPara(protocolIdActual, protocolos ?? []),
    [protocolIdActual, protocolos],
  )
  const lote = lotes.find((l) => l.lot_id === lotId) ?? null
  const estado = lote ? estadoDe(lote) : 'ok'
  const cfg = ESTADO_CFG[estado]

  const etiquetaLote = (l: LotDetailRow) => {
    const venc = l.expiry_date
      ? `${estadoDe(l) === 'vencido' ? 'VENCIDO' : 'vence'} ${formatFecha(l.expiry_date)}`
      : 'sin vencimiento'
    return `${l.lot_number} · ${venc} · ${l.quantity_on_hand} ${l.quantity_on_hand === 1 ? 'unidad' : 'u.'}`
  }

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!lote) { setError('Elegí de qué lote querés mover.'); return }
    const c = validarCantidad(cantidad, lote.quantity_on_hand)
    if (!c.ok) { setError(c.error); return }
    const destino = destinos.find((d) => d.value === destinoValue)
    if (!destino) { setError('Elegí a dónde querés moverlo.'); return }
    if (!motivo) { setError('Elegí un motivo.'); return }

    setBusy(true)
    setError(null)
    const reason = nota.trim() ? `${motivo} — ${nota.trim()}` : motivo
    const res = await reassignLotStock(lote.lot_id, destino.destino, c.cantidad, reason)
    setBusy(false)
    if (res.error) { setError(res.error); return }
    onReasignado(
      `${c.cantidad} ${c.cantidad === 1 ? 'unidad' : 'unidades'} de ${medicationName} ${
        c.cantidad === 1 ? 'pasó' : 'pasaron'
      } a ${destino.label}`,
    )
  }

  /* Dos callejones sin salida, cada uno con su explicación. Sin lotes con unidades no hay nada que
     mover; sin destino no hay a dónde. En los dos casos el formulario sería un trámite imposible,
     así que se dice por qué en vez de mostrar desplegables vacíos. */
  const sinSalida =
    lotes.length === 0
      ? 'Este medicamento no tiene unidades para mover en este ámbito: todos sus lotes están en cero.'
      : protocolos === null
        /* Sin la lista de estudios no se puede AFIRMAR que no hay destino: eso sería presentar un
           dato que no tenemos como si fuera un hecho. Se dice lo que pasa de verdad. */
        ? 'No pudimos leer la lista de estudios, así que todavía no sabemos a dónde se puede mover. Cerrá y volvé a intentar en un momento.'
        : destinos.length === 0
          ? 'No hay a dónde mover este stock: no hay ningún otro estudio abierto, y este lote ya está en el único ámbito disponible. Los estudios cerrados no reciben medicación.'
          : null

  if (sinSalida) {
    return (
      <Modal title={`Reasignar stock · ${medicationName}`} onClose={onClose}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <p style={{ fontSize: 13.5, color: 'var(--spira-muted)', lineHeight: 1.55, margin: 0 }}>{sinSalida}</p>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button type="button" onClick={onClose} style={btnOutline}>Cerrar</button>
          </div>
        </div>
      </Modal>
    )
  }

  return (
    <Modal title={`Reasignar stock · ${medicationName}`} onClose={onClose} maxWidth={470}>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <p style={{ fontSize: 13, color: 'var(--spira-muted)', lineHeight: 1.5, margin: 0 }}>
          Las unidades <b>salen de este lote y entran en el destino</b> con el mismo número de lote
          y vencimiento. Queda registrado como un traslado, no como un ajuste.
        </p>

        <FormField label="Lote">
          <SearchableSelect
            value={lotId}
            onChange={(v) => { setLotId(v); setError(null) }}
            options={lotes.map((l) => ({
              value: l.lot_id,
              label: etiquetaLote(l),
              /* El punto refuerza, no informa: el estado ya está escrito en la etiqueta ("VENCIDO
                 12/08/2026"). Sin ícono para 'ok', que no tiene color propio. */
              ...(estadoDe(l) === 'ok' ? {} : { dot: ESTADO_CFG[estadoDe(l)].color }),
            }))}
            placeholder="Elegí el lote"
            searchPlaceholder="Buscar lote…"
            searchable={lotes.length > 3 ? 'always' : 'auto'}
            mono
          />
        </FormField>

        {lote && estado !== 'ok' && (
          <div style={aviso(cfg.color)}>
            {cfg.icon && <Icon name={cfg.icon} size={15} color={cfg.color} />}
            <span>
              {estado === 'vencido'
                ? 'Este lote está vencido. Se puede mover, pero en el destino tampoco se va a poder dispensar.'
                : 'Este lote vence pronto. Se puede mover; fijate que llegue a usarse antes de la fecha.'}
            </span>
          </div>
        )}

        <FormField label="Cantidad">
          <input
            type="number"
            value={cantidad}
            onChange={(e) => setCantidad(e.target.value)}
            required
            min={1}
            max={lote?.quantity_on_hand}
            step={1}
            style={fieldInput}
            placeholder={lote ? `Hasta ${lote.quantity_on_hand}` : 'Elegí primero el lote'}
          />
        </FormField>

        <FormField label="Destino">
          <SearchableSelect
            value={destinoValue}
            onChange={(v) => { setDestinoValue(v); setError(null) }}
            options={destinos.map((d) => ({ value: d.value, label: d.label }))}
            placeholder="Elegí a dónde va"
            searchPlaceholder="Buscar estudio…"
          />
        </FormField>

        <FormField label="Motivo">
          <SearchableSelect
            value={motivo}
            onChange={setMotivo}
            options={MOTIVOS.map((m) => ({ value: m, label: m }))}
            placeholder="Elegí un motivo"
            searchPlaceholder="Buscar motivo…"
          />
        </FormField>

        <FormField label="Nota (opcional)">
          <input value={nota} onChange={(e) => setNota(e.target.value)} style={fieldInput} />
        </FormField>

        {error && (
          <div style={{ fontSize: 13, color: 'var(--spira-acc-deep-danger)', background: 'rgba(166, 72, 59, 0.10)', borderRadius: 8, padding: '8px 12px' }} aria-live="assertive">
            {error}
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 2 }}>
          <button type="button" onClick={onClose} style={btnOutline}>Cancelar</button>
          <button type="submit" disabled={busy} style={{ ...btnPrimary(accentSolid), opacity: busy ? 0.7 : 1, cursor: busy ? 'default' : 'pointer' }}>
            {busy ? 'Moviendo…' : 'Reasignar'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

/** Aviso de estado del lote. Longhands en el borde a propósito (ver `buttons.ts`): mezclar la
 *  abreviada con un `borderColor` calculado deja el borde en `currentColor`. */
function aviso(color: string): CSSProperties {
  return {
    display: 'flex', alignItems: 'flex-start', gap: 8,
    fontSize: 12.5, lineHeight: 1.45, color,
    background: 'var(--spira-surface)',
    borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--spira-line)',
    borderRadius: 10, padding: '9px 12px',
  }
}
