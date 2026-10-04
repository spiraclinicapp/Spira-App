import { useState } from 'react'
import type { CSSProperties } from 'react'
import { Icon } from '../../../components/Icon'
import { btnOutline, btnPrimary } from '../../../components/buttons'
import type { DispensationRequestRow, DispensationRow } from '../../../data/pharma'
import { constanciaVigente, markIpDocumentPrinted, printIpDocument, useCorreccionesDeEntregas } from '../../../data/pharma'
import { ConstanciaAcciones, ConstanciaVista } from '../ConstanciaIp'
import { CorreccionesDeEntrega } from '../CorregirEntrega'
import { pedidoParaReimprimir } from '../correccionEntregaModel'
import { WARN_TINT } from '../panelDispensacion'
import { ItemRow, fromDispensationLine } from './ItemRow'
import { Comprobante } from './PanelLista'
import { formatDateTimeAR } from '../../../lib/dates'

/**
 * Entregada: estado terminal. Lectura + reimprimir el comprobante.
 *
 * Lo único que se corrige desde la 0149 es la constancia, desde el ticket de la visita. Acá llega
 * como AVISO (Director, 2026-10-04): la constancia vigente se cargó después de
 * entregar y nadie la imprimió, así que el papel archivado con la entrega es el viejo. No bloquea
 * nada —la entrega ya ocurrió—: avisa y deja imprimirla en un clic.
 */
export function PanelEntregada({ r, disp, onClose, onPrint, onChanged, onToast }: {
  r: DispensationRequestRow
  disp: DispensationRow
  onClose: () => void
  onPrint: () => void
  onChanged: () => void
  onToast: (msg: string) => void
}) {
  const constancia = constanciaVigente(r)
  const reimprimir = pedidoParaReimprimir(r)
  // Se relee sola después de corregir: el cajón cambia a `PanelCorregirEntrega` y vuelve, y al volver
  // este panel se monta de nuevo.
  const correccionesQ = useCorreccionesDeEntregas([r.id])
  const [imprimiendo, setImprimiendo] = useState(false)
  const [errImpresion, setErrImpresion] = useState<string | null>(null)

  /* Imprimir y SELLAR la aserción, como «Imprimir» del visor de la preparación: el sello va después
     de que la impresión salió, nunca antes (afirmar que se imprimió algo que no se pudo mandar sería
     el dato inventado que este sistema no se permite). Con el sello, el aviso se apaga. */
  async function imprimirConstancia() {
    if (!constancia || imprimiendo) return
    setImprimiendo(true); setErrImpresion(null)
    const msg = await printIpDocument(constancia.storage_path)
    if (msg) { setImprimiendo(false); setErrImpresion(msg); return }
    const sello = await markIpDocumentPrinted(constancia.id)
    setImprimiendo(false)
    if (sello.error) { setErrImpresion(sello.error); return }
    onChanged()
    onToast('Constancia impresa · queda para el archivo')
  }

  return (
    <>
      <div style={body}>
        <Comprobante number={disp.correlative_number} code={disp.dispensation_code} tone="var(--spira-good)" icon="check" />

        {disp.delivered_at && (
          <div style={{ textAlign: 'center', fontSize: 12, color: 'var(--spira-muted)', marginTop: 10 }}>
            Entregada el {formatDateTimeAR(disp.delivered_at)}
          </div>
        )}

        {/* «Corregida» (0149/0151): la misma línea desplegable que el ticket de la visita. */}
        {(correccionesQ.data ?? []).length > 0 && (
          <div style={{ marginTop: 10, marginLeft: -12, marginRight: -12 }}>
            <CorreccionesDeEntrega correcciones={correccionesQ.data ?? []} />
          </div>
        )}

        {reimprimir && constancia && (
          <div role="status" style={avisoReimprimir}>
            <Icon name="printer" size={16} color="var(--spira-warn)" stroke={2} style={{ marginTop: 1, flex: '0 0 auto' }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600 }}>Constancia corregida: reimprimila para el archivo</div>
              <div style={{ color: 'var(--spira-ink-soft)', marginTop: 2 }}>
                Se cambió después de la entrega ({formatDateTimeAR(constancia.uploaded_at)}). La que se archivó con la entrega es la anterior.
              </div>
              {errImpresion && <div role="alert" style={{ color: 'var(--spira-acc-deep-danger)', marginTop: 6 }}>{errImpresion}</div>}
              <button
                type="button" onClick={() => void imprimirConstancia()} disabled={imprimiendo}
                style={{ ...btnPrimary('var(--spira-pharma-solid)'), height: 34, fontSize: 12.5, marginTop: 9, display: 'inline-flex', alignItems: 'center', gap: 7, opacity: imprimiendo ? 0.7 : 1 }}
              >
                <Icon name="printer" size={14} color="var(--spira-on-accent)" />
                {imprimiendo ? 'Preparando…' : 'Imprimir la constancia'}
              </button>
            </div>
          </div>
        )}

        {disp.items.length > 0 && (
          <>
            <p className="spira-eyebrow" style={{ marginTop: 20, marginBottom: 9 }}>Entregado</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {disp.items.map((l) => <ItemRow key={l.id} {...fromDispensationLine(l, r)} />)}
            </div>
          </>
        )}

        {/* El IP, ya sellado. Los kits salen de `ip_kits` —el número que se congeló al entregar—, no
            de ningún campo editable (corregirlos es la fase 2 del spec 2026-10-04). La constancia
            queda a mano porque el paciente o el monitor pueden pedir otra copia después. */}
        {(disp.ip_kits !== null || constancia) && (
          <>
            <p className="spira-eyebrow" style={{ marginTop: 20, marginBottom: 9 }}>Producto en investigación</p>
            {disp.ip_kits !== null && (
              <div style={kitsRow}>
                <Icon name="flask" size={16} color="var(--spira-pharma-solid)" />
                <b>{disp.ip_kits}</b> {disp.ip_kits === 1 ? 'kit entregado' : 'kits entregados'}
              </div>
            )}
            {constancia && (
              <div style={{ marginTop: disp.ip_kits !== null ? 9 : 0 }}>
                <ConstanciaVista doc={constancia} size="chica" accent="var(--spira-pharma-solid)" />
                <div style={{ marginTop: 9 }}>
                  <ConstanciaAcciones doc={constancia} layout="fila" accent="var(--spira-pharma-solid)" />
                </div>
              </div>
            )}
          </>
        )}

        {/* Sin la sigla FEFO (2026-08-15): "vencimiento más próximo" dice lo mismo y no obliga a
            saber de qué se trata. El dato que importa acá no es el criterio sino el hecho — el
            stock ya se movió, no hay nada pendiente de descontar. */}
        <div style={noteBox}>
          <Icon name="clock" size={15} color="var(--spira-muted)" />
          <span>
            {disp.items.length > 0 && <>Se entregaron los lotes de vencimiento más próximo y el stock ya quedó descontado. </>}
            {disp.ip_kits !== null && <>Los kits de IP ya descontaron del stock del protocolo.</>}
          </span>
        </div>
      </div>

      <div style={foot}>
        <button type="button" onClick={onClose} style={btnOutline}>Cerrar</button>
        <div style={{ flex: 1 }} />
        <button
          type="button" onClick={onPrint}
          style={{ ...btnPrimary('var(--spira-pharma-solid)'), display: 'flex', alignItems: 'center', gap: 8 }}
        >
          <Icon name="printer" size={16} color="var(--spira-on-accent)" />
          Imprimir comprobante
        </button>
      </div>
    </>
  )
}

const body: CSSProperties = { padding: '4px 22px 22px', overflowY: 'auto', flex: 1 }

const foot: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 10, padding: '14px 22px',
  borderTop: '1px solid var(--spira-line)', background: 'var(--spira-white)',
}

const kitsRow: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 9, padding: '11px 13px', borderRadius: 11,
  border: '1px solid var(--spira-line)', background: 'var(--spira-white)',
  fontSize: 13.5, color: 'var(--spira-ink)',
}

/** El aviso de reimprimir: texto en TINTA y el ámbar sólo en el ícono y el fondo, como «Falta la
 *  constancia» (`--spira-warn` como color de texto no llega a AA sobre este tinte). */
const avisoReimprimir: CSSProperties = {
  display: 'flex', alignItems: 'flex-start', gap: 9, marginTop: 14, padding: '10px 12px', borderRadius: 10,
  background: WARN_TINT, fontSize: 12.5, color: 'var(--spira-ink)', lineHeight: 1.45,
}

const noteBox: CSSProperties = {
  display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: 14, fontSize: 12,
  color: 'var(--spira-muted)', background: 'var(--spira-surface)',
  border: '1px solid var(--spira-line)', borderRadius: 10, padding: '10px 12px', lineHeight: 1.45,
}
