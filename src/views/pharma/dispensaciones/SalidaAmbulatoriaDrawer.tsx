import type { CSSProperties, ReactNode } from 'react'
import { Drawer } from '../../../components/Drawer'
import { Icon } from '../../../components/Icon'
import type { SalidaAmbulatoriaRow } from '../../../data/pharma'
import { CHIP_AMBULATORIA } from './estados'
import { formatDateTimeAR } from '../../../lib/dates'

/**
 * El detalle de una salida ambulatoria. **Sólo lectura, y no por falta de ganas:** la tabla
 * `ambulatory_dispensations` es inmutable por diseño (0116 no le dio policies de update ni de
 * delete), así que acá no hay nada que ofrecer que la base vaya a aceptar. Un botón que rebota es
 * peor que ningún botón.
 *
 * POR QUÉ EXISTE Y NO ALCANZA EL RENGLÓN. El historial muestra fecha, medicamento, unidades, quién
 * retiró y quién autorizó. Lo que NO entra en un renglón es justo lo que se viene a buscar cuando
 * alguien pregunta por una entrega: el **documento** de quien retiró, **de qué lote** salió, la
 * **nota**, **quién la despachó** y la **hora**. En un sistema auditable esos cinco datos son el
 * motivo por el que la fila se guarda.
 *
 * NO ES EL CAJÓN DE UNA DISPENSACIÓN, y por eso no reusa `DispensacionDrawer`: aquél despliega el
 * riel de cuatro estados, el escaneo por renglón y el comprobante numerado, que existen por una
 * razón regulatoria que acá no aplica. Esta entrega fue un solo acto (D4 del spec) y se lee como
 * lo que es: una ficha.
 */
export function SalidaAmbulatoriaDrawer({ salida, cargando, error, onClose }: {
  salida: SalidaAmbulatoriaRow | null
  cargando: boolean
  error: string | null
  onClose: () => void
}) {
  return (
    <Drawer title="Salida ambulatoria" onClose={onClose} maxWidth={460}>
      {cargando && !salida ? (
        <p style={aviso}>Cargando la salida…</p>
      ) : error ? (
        <div style={errBox} role="alert">
          <Icon name="alertCircle" size={15} />
          <span>{error}</span>
        </div>
      ) : !salida ? (
        /* No se afirma que no exista: pudo quedar fuera de lo que esta cuenta puede leer. Se dice
           lo que sabemos y nada más — el mismo criterio que el aviso del código no resuelto. */
        <p style={aviso}>No encontramos esta salida entre las que podés ver.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ ...chip, background: CHIP_AMBULATORIA.tint, color: CHIP_AMBULATORIA.color }}>
              {CHIP_AMBULATORIA.label}
            </span>
            <span style={{ fontSize: 12.5, color: 'var(--spira-muted)' }}>
              {formatDateTimeAR(salida.created_at)}
            </span>
          </div>

          {/* La medicación primero y en grande: es lo que salió del estante. */}
          <div style={cabecera}>
            <span style={ico}><Icon name="pill" size={20} color="var(--spira-pharma-solid)" /></span>
            <div style={{ minWidth: 0 }}>
              {/* SOLO el nombre, sin agregarle `medication_dosis`. En los datos reales el nombre YA
                  la trae ("Alvetide 184/22 mcg"), así que concatenarla la escribía dos veces —
                  visto en el QA del 2026-09-08. Y es además lo que hace el resto de Farmacia: la
                  lista de Stock, el alta y el renglón del historial muestran `name` a secas. */}
              <div style={nombreMed}>{salida.medication_name}</div>
              <div className="spira-mono" style={{ fontSize: 12.5, color: 'var(--spira-muted)', marginTop: 3 }}>
                {/* "u." y NO `medication_unit`: esa columna guarda la FORMA farmacéutica ("Polvo
                    seco"), no una unidad de conteo, y detrás de un número se leía "1 Polvo seco".
                    Dispensaciones cuenta en unidades en todas sus pantallas (ver `totalUnits`). */}
                {salida.quantity} u. · lote {salida.lot_number}
              </div>
            </div>
          </div>

          <Dato etiqueta="Quién retiró">
            <span style={{ fontWeight: 600 }}>{salida.recipient_name}</span>
            {/* El documento es opcional (0116): cuando no está, se dice que no se registró en vez
                de dibujar un guion, que se lee como un dato perdido y no como uno que no se pidió. */}
            <div className="spira-mono" style={sub}>
              {salida.recipient_document ?? <span style={{ fontFamily: 'var(--spira-font-text)' }}>Sin documento registrado</span>}
            </div>
          </Dato>

          {/* Los dos nombres son SNAPSHOT del día de la entrega (0116): siguen diciendo la verdad
              aunque la cuenta se haya dado de baja o cambiado de nombre. */}
          <Dato etiqueta="Quién autorizó">{salida.authorized_by_name}</Dato>
          <Dato etiqueta="Quién entregó">{salida.dispensed_by_name}</Dato>

          {salida.notes && <Dato etiqueta="Nota">{salida.notes}</Dato>}

          <div style={nota}>
            <Icon name="info" size={15} color="var(--spira-muted)" />
            <span>
              Esta entrega quedó asentada en el libro de stock y no se puede editar ni borrar. Si
              hubo un error, se corrige con un ajuste.
            </span>
          </div>
        </div>
      )}
    </Drawer>
  )
}

function Dato({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  return (
    <div>
      <p className="spira-eyebrow" style={{ margin: '0 0 5px' }}>{etiqueta}</p>
      <div style={{ fontSize: 13.5, color: 'var(--spira-ink)', lineHeight: 1.5 }}>{children}</div>
    </div>
  )
}

const aviso: CSSProperties = { fontSize: 13.5, color: 'var(--spira-muted)', lineHeight: 1.55, margin: 0 }

const chip: CSSProperties = {
  fontSize: 10.5, fontWeight: 600, padding: '3px 9px', borderRadius: 999,
}

const cabecera: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 12, padding: '13px 14px',
  border: '1px solid var(--spira-line)', borderRadius: 13, background: 'var(--spira-white)',
}

const ico: CSSProperties = {
  width: 40, height: 40, borderRadius: '50%', display: 'grid', placeItems: 'center',
  background: 'rgba(15, 95, 87, 0.14)', flex: '0 0 auto',
}

const nombreMed: CSSProperties = {
  fontFamily: 'var(--spira-font-display)', fontSize: 15.5, fontWeight: 700, color: 'var(--spira-ink)',
}


const sub: CSSProperties = { fontSize: 12.5, color: 'var(--spira-muted)', marginTop: 3 }

const nota: CSSProperties = {
  display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12,
  color: 'var(--spira-muted)', background: 'var(--spira-surface)',
  border: '1px solid var(--spira-line)', borderRadius: 10, padding: '10px 12px', lineHeight: 1.45,
}

const errBox: CSSProperties = {
  display: 'flex', alignItems: 'flex-start', gap: 7, fontSize: 12.5,
  color: 'var(--spira-acc-deep-danger)', background: 'rgba(166, 72, 59, 0.08)',
  border: '1px solid rgba(166, 72, 59, 0.25)', borderRadius: 8, padding: '9px 11px',
}
