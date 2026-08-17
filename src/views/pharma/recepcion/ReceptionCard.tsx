import type { CSSProperties } from 'react'
import { Icon } from '../../../components/Icon'
import { dateToISO, formatDayMonthYear, formatTimeAR, todayISO } from '../../../lib/dates'
import type { ReceptionRow } from '../../../data/pharma'
import { ESTADO_CFG, estadoFromExpiry } from '../expiryState'
import { KIND_CHIP } from './ambitos'
import { ANCHO_MINIMO, COLUMNAS, GRID_COLUMNAS, PADDING_LATERAL } from './columnas'
import { esCodigoDeBarras, resumenContenido } from './derivados'

/**
 * Una recepción como DOCUMENTO: banda de estado, encabezado y detalle por renglón, en ese orden
 * fijo. Reskin del handoff "2c" (docs/design_handoff_recepcion_2c/).
 *
 * Lo que hace que se lea como un documento y no como una lista de datos sueltos es que el
 * encabezado usa LA MISMA grilla que la tabla de abajo (ver columnas.ts): el folio cae sobre
 * "Medicamento", la fecha sobre "Código", el origen termina donde termina "Cantidad". Header y
 * tabla comparten además el contenedor con scroll, así que en pantallas angostas se mueven
 * juntos y la alineación no se rompe.
 *
 * ELEVACIÓN, NUNCA BORDE DE COLOR: el `highlight` de la recepción recién creada usa sombra, y el
 * borde queda en longhands porque React vacía las longhand al apagarse el estado y con la
 * abreviada el color caería a `currentColor` (negro).
 */
export function ReceptionCard({ r, canManage, busy, highlight, error, onVerify }: {
  r: ReceptionRow
  canManage: boolean
  busy: boolean
  highlight: boolean
  /** Mensaje del intento fallido de verificar ESTA recepción. Va en su banda, no en el tope de
   *  la lista: con las cards agrupadas por día, un error allá arriba puede quedar fuera de vista. */
  error: string | null
  onVerify: () => void
}) {
  const ambito = KIND_CHIP[r.tipo] ?? KIND_CHIP.protocolo
  const esIp = r.tipo === 'investigacion'
  const hoyISO = todayISO()

  const cardStyle: CSSProperties = {
    ...card,
    ...(highlight ? { boxShadow: 'var(--spira-shadow-md)' } : {}),
  }

  return (
    <article style={cardStyle} aria-label={`Recepción Nº ${r.folio}`}>
      <Banda r={r} canManage={canManage} busy={busy} error={error} onVerify={onVerify} />

      {/* Header y tabla en el MISMO contenedor con scroll: si scrollearan por separado, la
          alineación entre el encabezado y las columnas se perdería al primer arrastre. */}
      <div style={{ overflowX: 'auto' }}>
        <div style={{ minWidth: ANCHO_MINIMO }}>
          <header style={dhead}>
            <div style={celda}>
              <span style={rotuloCelda}>Recepción</span>
              <span style={valorFolio} className="spira-mono">Nº {r.folio}</span>
            </div>
            {/* RECIBIDO ≠ ingresado a stock. La mercadería puede llegar un día y verificarse otro
                —el pedido queda apoyado hasta que alguien lo cuenta—, así que las dos fechas
                conviven en la card y cada una necesita decir cuál es. El folio no lleva rótulo
                porque "Nº 1043" se explica solo; una fecha suelta, no. */}
            <div style={{ ...celda, gridColumn: '2 / 4' }}>
              <span style={rotuloCelda}>Recibido</span>
              <span style={valorFecha} className="spira-mono">{formatDayMonthYear(r.reception_date)}</span>
            </div>
            {/* Sin barra de color: el nombre del ámbito YA se escribe en su color, así que una
                barra del mismo tono al lado repite el dato en vez de codificarlo. El bloque se
                centra respecto de la fila; no tiene línea base que alinear con sus vecinas. */}
            <div style={{ ...celda, gridColumn: '5 / 7', justifySelf: 'end', alignSelf: 'center', display: 'flex', gap: 10, alignItems: 'center' }}>
              <span style={{ fontSize: 12.5, fontWeight: 600, color: ambito.color }}>{ambito.label}</span>
              {r.protocol && (
                <span className="spira-mono" style={codigoOrigen}>{r.protocol.code}</span>
              )}
            </div>
          </header>

          {esIp && r.items.length === 0 ? <NotaIp r={r} /> : <TablaRenglones r={r} hoyISO={hoyISO} />}
        </div>
      </div>
    </article>
  )
}

/* ── Banda de estado ─────────────────────────────────────────────────────────
   Tres elementos, no cuatro: rótulo · contexto · acción. La frase "La medicación todavía no
   entró a stock" del mock salió — repite lo que el rótulo ya dice y le quitaba aire al botón. */
function Banda({ r, canManage, busy, error, onVerify }: {
  r: ReceptionRow; canManage: boolean; busy: boolean; error: string | null; onVerify: () => void
}) {
  const verificada = r.status === 'verificada'
  const resumen = resumenContenido(r)

  // Los tokens `acc-deep-*` y no un color-mix con la tinta: la familia acc-deep tiene versión
  // ACLARADA para tema oscuro, y una mezcla oscurecida ahí sería texto invisible sobre el tinte.
  const tinte = verificada ? 'rgba(92,138,90,.10)' : 'rgba(176,130,63,.13)'
  const tinta = verificada ? 'var(--spira-acc-deep-good)' : 'var(--spira-acc-deep-warn)'

  return (
    <div style={{ ...banda, background: error ? 'rgba(166,72,59,.10)' : tinte, color: error ? 'var(--spira-acc-deep-danger)' : tinta }}>
      <Icon name={error ? 'alertCircle' : verificada ? 'check' : 'clock'} size={15} color="currentColor" stroke={verificada ? 2.6 : 2.2} />
      <span style={rotuloEstado}>{error ? 'No se pudo verificar' : verificada ? 'Verificada' : 'Pendiente de verificar'}</span>

      {error ? (
        <span style={{ ...textoBanda, color: 'var(--spira-acc-deep-danger)' }}>{error}</span>
      ) : verificada ? (
        <>
          <span style={textoBanda}>{ingresadaPor(r)}</span>
          <span style={{ ...textoBanda, marginLeft: 'auto' }}>{resumen}</span>
        </>
      ) : (
        <span style={{ ...textoBanda, marginLeft: canManage ? 0 : 'auto' }}>{resumen}</span>
      )}

      {canManage && !verificada && (
        <button
          type="button"
          onClick={onVerify}
          disabled={busy}
          style={{ ...btnVerificar, marginLeft: 'auto', opacity: busy ? 0.7 : 1, cursor: busy ? 'default' : 'pointer' }}
        >
          <Icon name="check" size={15} color="var(--spira-on-accent)" stroke={2.4} />
          {busy ? 'Verificando…' : error ? 'Reintentar' : 'Verificar e ingresar a stock'}
        </button>
      )}
    </div>
  )
}

/**
 * "Ingresada a stock por Fulano · 22 jul 2026 08:19". El nombre viaja sellado en la fila (0085):
 * la RLS de `users` sólo expone la propia, así que un join lo dejaría vacío para el resto.
 *
 * La fecha sale del `Date` y NO de recortar el ISO. `verified_at` es un timestamptz que llega en
 * UTC: `slice(0, 10)` devuelve el día UTC, así que todo lo verificado después de las 21:00 hora
 * argentina se mostraría un día adelante. Está documentado en `formatDateAR` desde el 2026-08-10,
 * cuando el mismo recorte fechó una dispensación al día siguiente en tres pantallas a la vez.
 */
function ingresadaPor(r: ReceptionRow): string {
  if (!r.verified_at) return 'Ingresada a stock'
  const fecha = formatDayMonthYear(dateToISO(new Date(r.verified_at)))
  const hora = formatTimeAR(r.verified_at)
  return r.verified_by_name
    ? `Ingresada a stock por ${r.verified_by_name} · ${fecha} ${hora}`
    : `Ingresada a stock · ${fecha} ${hora}`
}

/* ── Tabla de renglones ─────────────────────────────────────────────────────── */
function TablaRenglones({ r, hoyISO }: { r: ReceptionRow; hoyISO: string }) {
  if (r.items.length === 0) {
    return <p style={nota}><Icon name="info" size={15} color="var(--spira-muted)" /> Esta recepción no tiene renglones cargados.</p>
  }

  return (
    <table style={tabla} aria-label={`Renglones de la recepción Nº ${r.folio}`}>
      <colgroup>
        {COLUMNAS.map((c) => <col key={c.clave} style={{ width: c.ancho }} />)}
      </colgroup>
      <thead>
        <tr>
          {COLUMNAS.map((c) => (
            <th key={c.clave} scope="col" style={{ ...th, textAlign: c.align }}>{c.label}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {r.items.map((it) => {
          const cfg = ESTADO_CFG[estadoFromExpiry(it.expiry_date, hoyISO)]
          const codigo = it.medication?.codes?.[0]?.code ?? ''
          return (
            <tr key={it.id}>
              <td style={td}>
                <div style={nombreMed}>{it.medication?.name ?? '—'}</div>
                {it.medication?.drug?.name && <div style={monodroga}>{it.medication.drug.name}</div>}
              </td>
              <td style={td}>
                {codigo ? (
                  <>
                    <span className="spira-mono" style={{ fontSize: 13 }}>{codigo}</span>
                    {/* Por la FORMA, no por `code_type`: ese campo nació con default 'ean13' y en
                        producción marca como código de barras a códigos de dos dígitos. */}
                    {!esCodigoDeBarras(codigo) && <span style={qualifier}>interno</span>}
                  </>
                ) : <span style={{ fontSize: 12.5, color: 'var(--spira-faint)' }}>— sin código —</span>}
              </td>
              <td style={{ ...td, textAlign: 'center' }}>
                <span className="spira-mono" style={chipLote}>{it.lot_number}</span>
              </td>
              <td style={td}>
                <span
                  style={{ ...vence, color: cfg.color }}
                  title={cfg.label}
                  aria-label={`Vencimiento ${it.expiry_date ? formatDayMonthYear(it.expiry_date) : 'sin fecha'}, ${cfg.label}`}
                >
                  {cfg.icon && <Icon name={cfg.icon} size={13} color={cfg.color} />}
                  <span className="spira-mono">{it.expiry_date ? formatDayMonthYear(it.expiry_date) : '—'}</span>
                </span>
              </td>
              <td style={{ ...td, textAlign: 'center' }}>
                <span style={{ fontSize: 12.5, color: 'var(--spira-ink-soft)' }}>
                  {it.medication?.laboratorio?.name ?? '— sin cargar —'}
                </span>
              </td>
              <td style={{ ...td, textAlign: 'right' }}>
                <span style={cantidad} className="spira-mono">{it.quantity}</span>
                <span style={unidad}>u.</span>
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

/** Card de IP: no hay renglones, hay kits. Se dice con lo que la base tiene (0038/0039), sin
 *  inventar la "excursión de temperatura" del mock, que no tiene campo detrás. */
function NotaIp({ r }: { r: ReceptionRow }) {
  const destino = r.storage_location ? ` · Destino: ${r.storage_location}` : ''
  return (
    <p style={nota}>
      <Icon name="info" size={15} color="var(--spira-muted)" />
      Producto de investigación: cargamento de kits, sin renglones de medicamento.{destino}
    </p>
  )
}

/* ── Estilos ─────────────────────────────────────────────────────────────────── */

const card: CSSProperties = {
  borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--spira-line)', borderRadius: 16,
  background: 'var(--spira-white)', boxShadow: 'var(--spira-shadow-sm)', overflow: 'hidden',
  display: 'flex', flexDirection: 'column', transition: 'box-shadow 0.2s',
}

const banda: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 12, padding: '9px 20px',
  borderBottom: '1px solid var(--spira-line)', flex: '0 0 auto',
}
const rotuloEstado: CSSProperties = {
  fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase',
  whiteSpace: 'nowrap', color: 'currentColor',
}
const textoBanda: CSSProperties = {
  fontSize: 12.5, color: 'var(--spira-ink-soft)', minWidth: 0,
  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
}
// 38px como el resto de los botones del sistema; el mock pedía 30, que era el más chico de la app
// para la acción más irreversible que tiene.
const btnVerificar: CSSProperties = {
  height: 38, padding: '0 15px', border: 'none', borderRadius: 10, background: 'var(--spira-good)',
  color: 'var(--spira-on-accent)', fontFamily: 'var(--spira-font-text)', fontWeight: 600, fontSize: 13,
  display: 'flex', alignItems: 'center', gap: 7, flex: '0 0 auto', whiteSpace: 'nowrap',
}

// `end` y no `center`: la celda de la fecha lleva rótulo encima y la del folio no, así que
// centrando cada una por su cuenta las líneas base quedaban desfasadas 3px — el folio flotando
// sobre la fecha. Pegadas abajo y con el mismo padding inferior, las dos bases coinciden.
const dhead: CSSProperties = {
  display: 'grid', gridTemplateColumns: GRID_COLUMNAS, alignItems: 'end',
  background: 'var(--spira-surface)', borderBottom: '1px solid var(--spira-line)',
}
const celda: CSSProperties = { padding: `15px ${PADDING_LATERAL}px 16px`, minWidth: 0 }
// Rótulo de dato. Las dos celdas del encabezado lo llevan: "Nº 11" y una fecha suelta, uno al
// lado del otro y con una segunda fecha en la banda de arriba, necesitan decir qué son.
const rotuloCelda: CSSProperties = {
  display: 'block', fontSize: 10.5, fontWeight: 700, letterSpacing: '0.1em',
  textTransform: 'uppercase', color: 'var(--spira-ink-soft)', marginBottom: 2,
}
const valorFolio: CSSProperties = {
  fontFamily: 'var(--spira-font-display)', fontWeight: 700, fontSize: 21, color: 'var(--spira-ink)',
}
const valorFecha: CSSProperties = { fontSize: 13.5, fontWeight: 500, whiteSpace: 'nowrap', color: 'var(--spira-ink)' }
const codigoOrigen: CSSProperties = { fontSize: 13.5, fontWeight: 500, color: 'var(--spira-ink-2)', whiteSpace: 'nowrap' }

// `fixed` es requisito: sin él el navegador ignora los anchos de <col> y la grilla del header
// deja de coincidir con la tabla.
const tabla: CSSProperties = { borderCollapse: 'collapse', width: '100%', tableLayout: 'fixed' }
const th: CSSProperties = {
  fontSize: 10.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--spira-ink-soft)',
  fontWeight: 700, padding: `12px ${PADDING_LATERAL}px 9px`, whiteSpace: 'nowrap',
  borderBottom: '1px solid var(--spira-line)', background: 'var(--spira-white)',
}
const td: CSSProperties = {
  padding: `12px ${PADDING_LATERAL}px`, fontSize: 13, verticalAlign: 'middle',
  borderTop: '1px solid var(--spira-line)',
}
const nombreMed: CSSProperties = { fontSize: 13.5, fontWeight: 600, color: 'var(--spira-ink)' }
const monodroga: CSSProperties = { fontSize: 11.5, color: 'var(--spira-ink-soft)', marginTop: 1 }
const qualifier: CSSProperties = { fontSize: 11.5, color: 'var(--spira-ink-soft)', marginLeft: 5 }
const chipLote: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', height: 23, padding: '0 9px', borderRadius: 6,
  background: 'var(--spira-surface)', border: '1px solid var(--spira-line)', fontSize: 12,
  color: 'var(--spira-ink)',
}
const vence: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap', fontSize: 13, fontWeight: 500 }
const cantidad: CSSProperties = { fontFamily: 'var(--spira-font-display)', fontWeight: 700, fontSize: 15, color: 'var(--spira-ink)' }
const unidad: CSSProperties = { fontSize: 11, color: 'var(--spira-ink-soft)', marginLeft: 3 }
const nota: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 9, margin: 0,
  padding: `13px ${PADDING_LATERAL}px`, fontSize: 12.5, color: 'var(--spira-ink-soft)',
}
