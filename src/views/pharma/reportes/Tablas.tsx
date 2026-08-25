import type { CSSProperties, ReactNode } from 'react'
import { PatientLink, PatientLinkArrow } from '../../../components/PatientLink'
import { formatNumberAR, formatPctAR, sharePct } from '../../../lib/numbers'
import { formatAR, formatTimeAR } from '../../../lib/dates'
import { conFilaOtros } from './agregados'
import type { FilaDetalle, FilaMedicamento, FilaProtocolo } from './agregados'
import { card, dash, rowHover, subLine, tabla, td, tdNum, tfootTd, th } from './estilos'

/**
 * Las tablas del reporte.
 *
 * DOS REGLAS DE ALINEACIÓN, y son distintas a propósito (venían así del handoff y se respetan):
 *
 *  · Los CONTEOS van CENTRADOS, no a la derecha. El encabezado ("DISPENSACIONES") es mucho más
 *    ancho que el número ("68"), y alineado a la derecha el número queda visualmente desconectado
 *    de su título.
 *  · La PARTICIPACIÓN va a la derecha, porque su contenido es una barra que tiene que pegarse al
 *    borde para que las barras de todas las filas arranquen del mismo lado.
 *
 * Y DOS NORMALIZACIONES DE BARRA, también distintas y también a propósito:
 *
 *  · En protocolos la barra es el PORCENTAJE ABSOLUTO (31,8% pinta 31,8% del carril).
 *  · En medicamentos es RELATIVA AL MÁXIMO de la columna (el primero llena el carril). En un
 *    ranking de dominancia la barra relativa lee mejor: con la absoluta, ocho medicamentos de
 *    entre 5% y 18% dan ocho barras cortas casi idénticas.
 */

export function TablaProtocolos({ filas, total }: { filas: FilaProtocolo[]; total: { unidades: number; dispensaciones: number; pacientes: number } }) {
  return (
    <Tabla>
      <thead>
        <tr>
          <th style={th}>Protocolo</th>
          <th style={{ ...th, textAlign: 'center' }}>Dispensaciones</th>
          <th style={{ ...th, textAlign: 'center' }}>Unidades</th>
          <th style={{ ...th, textAlign: 'center' }}>Pacientes</th>
          <th style={{ ...th, textAlign: 'right', width: 190 }}>Participación</th>
        </tr>
      </thead>
      <tbody>
        {filas.map((f) => (
          <tr key={f.protocolCode} className={rowHover}>
            <td style={td}>
              <div style={{ fontWeight: 600 }}>{f.protocolCode}</div>
              <div style={subLine}>
                {[f.protocolName, f.sponsor].filter(Boolean).join(' · ') || <span style={dash}>—</span>}
              </div>
            </td>
            <td style={tdNum}>{formatNumberAR(f.dispensaciones)}</td>
            <td style={tdNum}>{formatNumberAR(f.unidades)}</td>
            <td style={tdNum}>{formatNumberAR(f.pacientes)}</td>
            <td style={{ ...td, textAlign: 'right' }}>
              <Participacion pct={f.pct} ancho={f.pct} />
            </td>
          </tr>
        ))}
        <SinFilas cantidad={filas.length} columnas={5} />
      </tbody>
      {filas.length > 0 && (
        <tfoot>
          <tr>
            <td style={tfootTd}>Total</td>
            <td style={{ ...tfootTd, textAlign: 'center' }}>{formatNumberAR(total.dispensaciones)}</td>
            <td style={{ ...tfootTd, textAlign: 'center' }}>{formatNumberAR(total.unidades)}</td>
            <td style={{ ...tfootTd, textAlign: 'center' }}>{formatNumberAR(total.pacientes)}</td>
            <td style={{ ...tfootTd, textAlign: 'right' }}>{formatPctAR(100, { entero: true })}</td>
          </tr>
        </tfoot>
      )}
    </Tabla>
  )
}

export function TablaMedicamentos({ filas, totalUnidades }: { filas: FilaMedicamento[]; totalUnidades: number }) {
  const { visibles, otros } = conFilaOtros(filas, 8)
  /* La barra se normaliza contra el MÁXIMO de la columna, no contra el total: ver la cabecera. */
  const maximo = Math.max(...filas.map((f) => f.unidades), 1)

  return (
    <Tabla>
      <thead>
        <tr>
          <th style={th}>Droga y presentación</th>
          <th style={{ ...th, textAlign: 'center' }}>Unidades</th>
          <th style={{ ...th, textAlign: 'center' }}>Dispensaciones</th>
          <th style={{ ...th, textAlign: 'right', width: 190 }}>Participación</th>
        </tr>
      </thead>
      <tbody>
        {visibles.map((f) => (
          <tr key={f.medicationName} className={rowHover}>
            <td style={td}>{f.medicationName}</td>
            <td style={tdNum}>{formatNumberAR(f.unidades)}</td>
            <td style={tdNum}>{formatNumberAR(f.dispensaciones)}</td>
            <td style={{ ...td, textAlign: 'right' }}>
              <Participacion pct={f.pct} ancho={sharePct(f.unidades, maximo)} />
            </td>
          </tr>
        ))}
        {otros && (
          <tr className={rowHover}>
            <td style={{ ...td, color: 'var(--spira-muted)' }}>
              Otros {otros.cantidad} {otros.cantidad === 1 ? 'medicamento' : 'medicamentos'}
            </td>
            <td style={tdNum}>{formatNumberAR(otros.unidades)}</td>
            <td style={tdNum}>{formatNumberAR(otros.dispensaciones)}</td>
            <td style={{ ...td, textAlign: 'right' }}>
              <Participacion pct={otros.pct} ancho={sharePct(otros.unidades, maximo)} atenuado />
            </td>
          </tr>
        )}
        <SinFilas cantidad={filas.length} columnas={4} />
      </tbody>
      {filas.length > 0 && (
        <tfoot>
          <tr>
            <td style={tfootTd}>Total</td>
            <td style={{ ...tfootTd, textAlign: 'center' }}>{formatNumberAR(totalUnidades)}</td>
            <td style={tfootTd} />
            <td style={{ ...tfootTd, textAlign: 'right' }}>{formatPctAR(100, { entero: true })}</td>
          </tr>
        </tfoot>
      )}
    </Tabla>
  )
}

/**
 * El detalle. Muestra las más recientes en pantalla; el papel y la descarga salen con todas.
 *
 * La columna "Visita" sale de `dispensation_requests.visit_code`, sellado al crear el pedido
 * (0084): Farmacia no puede leer `patient_visits`, así que el dato viaja en la fila.
 *
 * Va con más aire que el resto (pedido del Director): es la tabla que se lee cruzando ocho
 * columnas, y a `10px 12px` las filas se pisaban entre sí.
 */
export function TablaDetalle({ filas, enPantalla = 14, onOpenPaciente }: {
  filas: FilaDetalle[]
  enPantalla?: number
  /** Cómo abrir la ficha del paciente de una fila. Devuelve `undefined` para las filas sólo-IP,
   *  que no tienen `patient_id`: ahí el nombre queda como texto (ver `PatientLink`). */
  onOpenPaciente?: (f: FilaDetalle) => (() => void) | undefined
}) {
  const visibles = filas.slice(0, enPantalla)
  return (
    <div style={{ ...card, overflow: 'hidden' }}>
      <div style={{ overflowX: 'auto' }}>
        <table style={tabla}>
          <thead>
            <tr>
              {['N°', 'Fecha', 'Hora', 'Paciente', 'Código', 'Protocolo', 'Visita', 'Medicamentos'].map((h) => (
                <th key={h} style={{ ...th, padding: '13px 14px 10px' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibles.map((f) => {
              /* Una sola resolución por fila: se reusa en los dos links y en el gateo de la
                 flecha (lección 2 de constraints.md — sin gate, un onOpen `undefined` deja un
                 hueco muerto que nunca puede encender el `:has()`). */
              const abrir = onOpenPaciente?.(f)
              return (
                <tr key={f.dispensationId} className={`${rowHover} spira-link-group`}>
                  <td style={{ ...tdDense, fontVariantNumeric: 'tabular-nums' }}>{f.numero}</td>
                  <td style={{ ...tdDense, fontVariantNumeric: 'tabular-nums' }}>{formatAR(f.fecha)}</td>
                  <td style={{ ...tdDense, fontVariantNumeric: 'tabular-nums' }}>{formatTimeAR(f.deliveredAt)}</td>
                  <td style={tdDense}>
                    {f.pacienteNombre
                      ? <PatientLink onOpen={abrir} label={`Abrir la ficha de ${f.pacienteNombre}`}>{f.pacienteNombre}</PatientLink>
                      : <span style={dash}>—</span>}
                  </td>
                  <td style={{ ...tdDense, fontVariantNumeric: 'tabular-nums' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                      {f.pacienteCodigo
                        ? <PatientLink onOpen={abrir} label={`Abrir la ficha del sujeto ${f.pacienteCodigo}`}>{f.pacienteCodigo}</PatientLink>
                        : <span style={dash}>—</span>}
                      {abrir && <PatientLinkArrow />}
                    </span>
                  </td>
                  <td style={tdDense}>{f.protocolCode ?? <span style={dash}>—</span>}</td>
                  <td style={tdDense}>{f.visitaCodigo ?? <span style={dash}>—</span>}</td>
                  <td style={tdDense}>{f.medicamentos}</td>
                </tr>
              )
            })}
            <SinFilas cantidad={filas.length} columnas={8} />
          </tbody>
          {filas.length > 0 && (
            <tfoot>
              <tr>
                <td style={tfootTd} colSpan={8}>
                  {filas.length <= enPantalla
                    ? `${formatNumberAR(filas.length)} ${filas.length === 1 ? 'registro' : 'registros'} en el período.`
                    : `Mostrando ${enPantalla} de ${formatNumberAR(filas.length)}. El reporte impreso y la descarga salen con todas.`}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  )
}

/* ── Piezas ──────────────────────────────────────────────────────────────────── */

function Tabla({ children }: { children: ReactNode }) {
  return (
    <div style={{ ...card, overflow: 'hidden' }}>
      <table style={tabla}>{children}</table>
    </div>
  )
}

function Participacion({ pct, ancho, atenuado }: { pct: number; ancho: number; atenuado?: boolean }) {
  return (
    <span style={{ display: 'grid', justifyItems: 'end', gap: 6, minWidth: 112, marginLeft: 'auto' }}>
      <span style={{ fontSize: 12.5, fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: atenuado ? 'var(--spira-muted)' : undefined }}>
        {formatPctAR(pct)}
      </span>
      <span style={{ width: '100%', height: 3, borderRadius: 2, background: 'var(--spira-line)', overflow: 'hidden' }}>
        <span style={{
          display: 'block', height: '100%', width: `${sharePct(ancho, 100)}%`,
          background: atenuado ? 'var(--spira-faint)' : 'var(--spira-pharma-solid)',
        }} />
      </span>
    </span>
  )
}

/** El vacío de una tabla vive DENTRO de la tabla: si no, el encabezado queda flotando solo. */
function SinFilas({ cantidad, columnas }: { cantidad: number; columnas: number }) {
  if (cantidad > 0) return null
  return (
    <tr>
      <td colSpan={columnas} style={{ ...td, textAlign: 'center', padding: '26px 0', color: 'var(--spira-ink-soft)', borderBottom: 'none' }}>
        Sin registros en el período.
      </td>
    </tr>
  )
}

/* Más aire que el `dense` del handoff (10px 12px): con ocho columnas y nombres completos de
   paciente, las filas quedaban pisadas. El line-height acompaña, porque la columna de
   medicamentos envuelve en dos renglones apenas hay dos drogas. */
const tdDense: CSSProperties = {
  padding: '14px 14px', borderBottom: '1px solid var(--spira-line)',
  verticalAlign: 'middle', fontSize: 12.5, lineHeight: 1.5,
}
