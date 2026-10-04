import { useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { Icon } from '../../../components/Icon'
import { SearchableSelect } from '../../../components/SearchableSelect'
import type { SelectOption } from '../../../components/SearchableSelect'
import { btnOutline, btnPrimary } from '../../../components/buttons'
import { aplicarPedidoCorreccion, corregirEntregaFarmacia, useProtocolLots } from '../../../data/pharma'
import type {
  DispensationRequestRow, DispensationRow, LotDetailRow, MotivoCorreccionFarmacia, PedidoCorreccionRow,
} from '../../../data/pharma'
import { formatAR } from '../../../lib/dates'
import {
  MOTIVOS_FARMACIA, cambiosDeEdicion, describirRenglonPedido, edicionDesdePedido, edicionInicial, motivoCompleto,
} from '../correccionEntregaModel'
import type { Agregado, EdicionEntrega, RenglonEntregado } from '../correccionEntregaModel'

const ACENTO = 'var(--spira-pharma-solid)'

/**
 * «Corregir entrega», del lado de Farmacia (0151; spec `2026-10-04-corregir-entrega-design.md`, fase 2).
 *
 * Sólo el LÍDER (D2): lo decide el menú del cajón y lo vuelve a exigir la base. Se corrige la entrega
 * EN EL LUGAR: cada renglón con su cantidad y su lote, quitar lo que no se dio, agregar lo que se dio y
 * no se registró, y los kits. Todo se guarda junto, con UN motivo, y entra entero o no entra nada.
 *
 * La regla que traduce lo editado a cambios vive en `correccionEntregaModel.ts`, con test: un cambio de
 * más o de menos mueve stock equivocado sin ningún error a la vista.
 */
export function PanelCorregirEntrega({ r, disp, pedido = null, onCancelar, onHecho }: {
  r: DispensationRequestRow
  disp: DispensationRow
  /**
   * El pedido de Coordinación que se está aplicando (0152): el panel arranca cargado con lo pedido
   * (`edicionDesdePedido`) y con su motivo, y guardar lo marca aplicado en la misma transacción.
   * `null` = una corrección por iniciativa de Farmacia.
   */
  pedido?: PedidoCorreccionRow | null
  onCancelar: () => void
  onHecho: () => void
}) {
  const lotesQ = useProtocolLots(r.protocol?.id ?? null)
  const lotes = useMemo(() => lotesQ.data ?? [], [lotesQ.data])

  const renglones: RenglonEntregado[] = disp.items
    .filter((l) => l.lot_id)
    .map((l) => ({ id: l.id, medication_id: l.medication_id, nombre: l.medication?.name ?? 'Medicamento', lot_id: l.lot_id!, quantity: l.quantity }))
  const llevaIp = disp.ip_kits !== null || r.includes_ip

  const [edicion, setEdicion] = useState<EdicionEntrega>(() =>
    pedido ? edicionDesdePedido(renglones, disp.ip_kits, pedido) : edicionInicial(renglones, disp.ip_kits))
  // Los motivos de Coordinación son un subconjunto de los de Farmacia: el del pedido se hereda tal cual.
  const [motivo, setMotivo] = useState<MotivoCorreccionFarmacia | ''>(() =>
    (pedido && MOTIVOS_FARMACIA.some((m) => m.value === pedido.motivo_codigo) ? pedido.motivo_codigo as MotivoCorreccionFarmacia : ''))
  const [texto, setTexto] = useState(pedido?.motivo_texto ?? '')
  const [intentado, setIntentado] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const res = cambiosDeEdicion(renglones, edicion, disp.ip_kits)
  const listo = !res.vacio && res.errores.length === 0 && motivoCompleto(motivo, texto)

  const editarRenglon = (id: string, cambio: Partial<EdicionEntrega['renglones'][string]>) =>
    setEdicion((e) => ({ ...e, renglones: { ...e.renglones, [id]: { ...e.renglones[id], ...cambio } } }))
  const editarAgregado = (key: string, cambio: Partial<Agregado>) =>
    setEdicion((e) => ({ ...e, agregados: e.agregados.map((a) => (a.key === key ? { ...a, ...cambio } : a)) }))

  async function guardar() {
    // El error del intento anterior ya no corresponde: si queda, se lee como si fuera de éste.
    setIntentado(true); setErr(null)
    if (!listo || motivo === '') return
    setBusy(true)
    const textoMotivo = motivo === 'otro' ? texto.trim() : null
    const r2 = pedido
      ? await aplicarPedidoCorreccion(pedido.id, res.cambios, res.kits, motivo, textoMotivo)
      : await corregirEntregaFarmacia(disp.id, res.cambios, res.kits, motivo, textoMotivo)
    setBusy(false)
    if (r2.error) { setErr(r2.error); return }
    onHecho()
  }

  /** Los medicamentos que se pueden agregar: los del estudio con stock, que no estén ya en la entrega. */
  const enLaEntrega = new Set([
    ...renglones.filter((x) => !edicion.renglones[x.id]?.quitar).map((x) => x.medication_id),
    ...edicion.agregados.map((a) => a.medicationId).filter(Boolean),
  ])

  return (
    <>
      <div style={body}>
        <p className="spira-eyebrow" style={{ marginTop: 4, marginBottom: 6 }}>Corregir la entrega</p>
        <div style={{ fontSize: 12.5, color: 'var(--spira-ink-soft)', lineHeight: 1.5, marginBottom: 14 }}>
          Lo que cambies se guarda con el motivo. El stock se compensa solo y el comprobante N° {disp.correlative_number} queda marcado «Corregida».
        </div>
        {pedido && (
          <div style={pedidoBox}>
            <div style={{ fontWeight: 600, color: 'var(--spira-ink)' }}>
              Lo que pidió Coordinación{pedido.requested_by_name ? ` (${pedido.requested_by_name})` : ''}
            </div>
            {pedido.renglones.map((x) => <div key={x.medication_id}>{describirRenglonPedido(x)}</div>)}
            <div style={{ color: 'var(--spira-muted)', marginTop: 2 }}>
              Ya está cargado abajo. Elegí el lote de lo que faltó registrar y revisá antes de guardar.
            </div>
          </div>
        )}

        {renglones.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            {renglones.map((x) => {
              const ed = edicion.renglones[x.id]
              return (
                <div key={x.id} style={{ ...caja, opacity: ed.quitar ? 0.6 : 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 600, color: 'var(--spira-ink)', textDecoration: ed.quitar ? 'line-through' : undefined, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={x.nombre}>
                      {x.nombre}
                    </span>
                    <button type="button" className="spira-enlace-sobrio spira-no-press" onClick={() => editarRenglon(x.id, { quitar: !ed.quitar })} disabled={busy}>
                      {ed.quitar ? 'No quitar' : 'Quitar: no se dio'}
                    </button>
                  </div>
                  {ed.quitar ? (
                    <div style={{ fontSize: 12, color: 'var(--spira-muted)', marginTop: 6 }}>Las {x.quantity} unidades vuelven al lote.</div>
                  ) : (
                    <div style={fila}>
                      <label style={{ ...campoRotulo, flex: '0 0 92px' }}>
                        Cantidad
                        <input
                          type="number" min={1} value={ed.cantidad} disabled={busy}
                          onChange={(e) => editarRenglon(x.id, { cantidad: e.target.value })}
                          aria-label={`Cantidad entregada de ${x.nombre}`} style={campo}
                        />
                      </label>
                      <label style={{ ...campoRotulo, flex: 1, minWidth: 0 }}>
                        Lote
                        <SearchableSelect
                          value={ed.lotId}
                          onChange={(v) => editarRenglon(x.id, { lotId: v })}
                          options={opcionesDeLote(lotes, x.medication_id, x.lot_id, x.quantity)}
                          placeholder="Lote"
                          searchable="never"
                          disabled={busy}
                        />
                      </label>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        ) : (
          // Sin renglones: o la entrega fue sólo de IP, o es una de las históricas cargadas sin renglones.
          // Las dos se dicen igual, porque lo que importa es lo mismo: no hay medicación registrada.
          <div style={{ fontSize: 12.5, color: 'var(--spira-muted)' }}>
            Esta entrega no tiene medicación concomitante registrada. Si se dio algo, agregalo.
          </div>
        )}

        {/* Lo que se dio y no se registró. */}
        {edicion.agregados.map((a) => {
          const opcionesMed = opcionesDeMedicamento(lotes, enLaEntrega, a.medicationId,
            (id) => pedido?.renglones.find((x) => x.medication_id === id)?.medicamento ?? null)
          return (
            <div key={a.key} style={{ ...caja, marginTop: 9 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ flex: 1, fontSize: 12, fontWeight: 700, color: 'var(--spira-ink-soft)' }}>Faltó registrar</span>
                <button
                  type="button" aria-label="Sacar este renglón" disabled={busy}
                  onClick={() => setEdicion((e) => ({ ...e, agregados: e.agregados.filter((y) => y.key !== a.key) }))}
                  style={iconBtn}
                >
                  <Icon name="x" size={15} color="var(--spira-muted)" />
                </button>
              </div>
              {opcionesMed.length === 0 && !a.medicationId && !lotesQ.loading ? (
                // Un desplegable vacío diría «no se encuentran resultados para tu búsqueda» sin que
                // nadie haya buscado: se dice lo que pasa.
                <div style={{ fontSize: 12.5, color: 'var(--spira-muted)', marginTop: 6, lineHeight: 1.45 }}>
                  Este estudio no tiene otra medicación con stock para agregar.
                </div>
              ) : (
                <label style={{ ...campoRotulo, marginTop: 6 }}>
                  Medicamento
                  <SearchableSelect
                    value={a.medicationId}
                    onChange={(v) => editarAgregado(a.key, { medicationId: v, lotId: '' })}
                    options={opcionesMed}
                    placeholder={lotesQ.loading ? 'Cargando…' : 'Elegí el medicamento'}
                    entity="medicamento"
                    disabled={busy || lotesQ.loading}
                  />
                </label>
              )}
              <div style={fila}>
                <label style={{ ...campoRotulo, flex: '0 0 92px' }}>
                  Cantidad
                  <input
                    type="number" min={1} value={a.cantidad} disabled={busy}
                    onChange={(e) => editarAgregado(a.key, { cantidad: e.target.value })}
                    aria-label="Cantidad que se dio" style={campo}
                  />
                </label>
                <label style={{ ...campoRotulo, flex: 1, minWidth: 0 }}>
                  Lote
                  <SearchableSelect
                    value={a.lotId}
                    onChange={(v) => editarAgregado(a.key, { lotId: v })}
                    options={a.medicationId ? opcionesDeLote(lotes, a.medicationId, null, 1) : []}
                    placeholder={a.medicationId ? 'Lote' : 'Primero el medicamento'}
                    searchable="never"
                    disabled={busy || !a.medicationId}
                  />
                </label>
              </div>
            </div>
          )
        })}

        <button
          type="button" disabled={busy} style={btnAgregar}
          onClick={() => setEdicion((e) => ({ ...e, agregados: [...e.agregados, { key: crypto.randomUUID(), medicationId: '', lotId: '', cantidad: '1' }] }))}
        >
          <Icon name="plus" size={15} color={ACENTO} /> Agregar lo que faltó registrar
        </button>

        {llevaIp && (
          <>
            <p className="spira-eyebrow" style={{ marginTop: 18, marginBottom: 7 }}>Producto en investigación</p>
            <label style={{ ...campoRotulo, maxWidth: 160 }}>
              Kits entregados
              <input
                type="number" min={1} value={edicion.kits} disabled={busy}
                onChange={(e) => setEdicion((x) => ({ ...x, kits: e.target.value }))}
                aria-label="Kits de IP entregados" style={campo}
              />
            </label>
          </>
        )}

        <p className="spira-eyebrow" style={{ marginTop: 18, marginBottom: 7 }}>Motivo</p>
        <SearchableSelect
          value={motivo}
          onChange={(v) => setMotivo(v as MotivoCorreccionFarmacia)}
          options={[...MOTIVOS_FARMACIA]}
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

        {intentado && res.errores.length > 0 && (
          <div role="alert" style={errBox}>
            {res.errores.map((e) => <div key={e}>{e}</div>)}
          </div>
        )}
        {err && <div role="alert" style={errBox}>{err}</div>}
      </div>

      <div style={foot}>
        <button type="button" onClick={onCancelar} disabled={busy} style={btnOutline}>Cancelar</button>
        <div style={{ flex: 1 }} />
        <button
          type="button" onClick={() => void guardar()}
          disabled={busy || res.vacio || !motivoCompleto(motivo, texto)}
          style={{
            ...btnPrimary(ACENTO),
            opacity: busy || res.vacio || !motivoCompleto(motivo, texto) ? 0.55 : 1,
            cursor: busy || res.vacio || !motivoCompleto(motivo, texto) ? 'default' : 'pointer',
          }}
        >
          {busy ? 'Guardando…' : pedido ? 'Aplicar la corrección' : 'Guardar corrección'}
        </button>
      </div>
    </>
  )
}

/**
 * Los lotes que se pueden elegir para un medicamento: el de la entrega (siempre, aunque hoy esté en
 * cero: es el que ya tiene) y los demás del estudio con stock para cubrir la cantidad. Por vencimiento,
 * como el FEFO de la preparación.
 */
function opcionesDeLote(lotes: readonly LotDetailRow[], medicationId: string, actual: string | null, cantidad: number): SelectOption[] {
  return lotes
    .filter((l) => l.medication_id === medicationId && (l.lot_id === actual || l.quantity_on_hand >= cantidad))
    .sort((a, b) => (a.expiry_date ?? '9999').localeCompare(b.expiry_date ?? '9999'))
    .map((l) => ({
      value: l.lot_id,
      label: [
        l.lot_number,
        // `formatAR` y no `formatDateAR`: el vencimiento es una fecha pura, y como timestamp caería
        // un día antes en hora argentina.
        l.expiry_date ? `vence ${formatAR(l.expiry_date)}` : null,
        l.lot_id === actual ? 'el de la entrega' : `${l.quantity_on_hand} en stock`,
        l.vencido ? 'VENCIDO' : null,
      ].filter(Boolean).join(' · '),
    }))
}

/**
 * Los medicamentos del estudio con algún lote con stock, menos los que ya están en la entrega. El ya
 * elegido va SIEMPRE, aunque no tenga stock: si lo trajo un pedido de Coordinación y no se listara, el
 * renglón quedaría en blanco y nadie sabría qué se pidió. Sin stock, lo dice (y la base no lo deja guardar).
 */
function opcionesDeMedicamento(
  lotes: readonly LotDetailRow[], enLaEntrega: Set<string>, elegido: string, nombreDeRespaldo: (id: string) => string | null,
): SelectOption[] {
  const vistos = new Map<string, string>()
  for (const l of lotes) {
    if (l.quantity_on_hand <= 0) continue
    if (enLaEntrega.has(l.medication_id) && l.medication_id !== elegido) continue
    if (!vistos.has(l.medication_id)) vistos.set(l.medication_id, [l.name, l.dosis].filter(Boolean).join(' '))
  }
  if (elegido && !vistos.has(elegido)) {
    const nombre = lotes.find((l) => l.medication_id === elegido)?.name ?? nombreDeRespaldo(elegido) ?? 'Medicamento'
    vistos.set(elegido, `${nombre} · sin stock en el estudio`)
  }
  return [...vistos].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label))
}

/* —— estilos: los de `PanelEntregada`, para que el cajón no cambie de forma al entrar a corregir —— */
const body: CSSProperties = { padding: '4px 22px 22px', overflowY: 'auto', flex: 1 }

const foot: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 10, padding: '14px 22px',
  borderTop: '1px solid var(--spira-line)', background: 'var(--spira-white)',
}

const caja: CSSProperties = {
  padding: '11px 13px', borderRadius: 11, border: '1px solid var(--spira-line)', background: 'var(--spira-white)',
}

const fila: CSSProperties = { display: 'flex', gap: 10, marginTop: 8, alignItems: 'flex-end' }

const campoRotulo: CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11, fontWeight: 600, color: 'var(--spira-ink-soft)',
}

const campo: CSSProperties = {
  width: '100%', height: 38, padding: '0 11px', borderRadius: 9,
  border: '1px solid var(--spira-line-2)', background: 'var(--spira-white)',
  fontFamily: 'var(--spira-font-text)', fontSize: 13, color: 'var(--spira-ink)',
}

const iconBtn: CSSProperties = {
  width: 24, height: 24, border: 'none', background: 'transparent', cursor: 'pointer',
  display: 'grid', placeItems: 'center', borderRadius: 6,
}

/** Borde en longhands (la trampa de la abreviada + longhand, ver CLAUDE.md). */
const btnAgregar: CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, width: '100%', height: 38, marginTop: 10,
  borderRadius: 9, borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--spira-line-2)',
  background: 'var(--spira-white)', color: 'var(--spira-ink)', cursor: 'pointer',
  fontFamily: 'var(--spira-font-text)', fontWeight: 600, fontSize: 12.5,
}

const pedidoBox: CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 3, marginBottom: 14, padding: '10px 12px', borderRadius: 10,
  background: 'var(--spira-surface)', border: '1px solid var(--spira-line)', fontSize: 12.5, color: 'var(--spira-ink-soft)',
}

const errBox: CSSProperties = {
  marginTop: 12, padding: '9px 11px', borderRadius: 9, fontSize: 12.5, lineHeight: 1.45,
  color: 'var(--spira-acc-deep-danger)', background: 'rgba(166, 72, 59, 0.08)',
}
