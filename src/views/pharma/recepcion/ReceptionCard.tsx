import type { CSSProperties } from 'react'
import { Icon } from '../../../components/Icon'
import { btnOutline } from '../../../components/buttons'
import { dateToISO, formatDayMonthYear, formatTimeAR, todayISO } from '../../../lib/dates'
import type { ReceptionRow } from '../../../data/pharma'
import { ESTADO_CFG, estadoFromExpiry } from '../expiryState'
import { KIND_CHIP } from './ambitos'
import { ANCHO_MINIMO, COLUMNAS, PADDING_LATERAL } from './columnas'
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
export function ReceptionCard({ r, canManage, busy, highlight, error, onVerify, onAnular }: {
  r: ReceptionRow
  canManage: boolean
  busy: boolean
  highlight: boolean
  /** Mensaje del intento fallido de verificar ESTA recepción. Va en su banda, no en el tope de
   *  la lista: con las cards agrupadas por día, un error allá arriba puede quedar fuera de vista. */
  error: string | null
  onVerify: () => void
  onAnular: () => void
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
      <Banda r={r} canManage={canManage} busy={busy} error={error} onVerify={onVerify} onAnular={onAnular} />

      {/* Encabezado de DOCUMENTO, no fila de tabla: identidad a la izquierda, procedencia a la
          derecha, aire en el medio. No comparte la grilla de la tabla ni entra en su scroll.

          A la derecha van las DOS cosas que sitúan la recepción —de dónde vino y cuándo llegó—,
          apiladas en ese orden y unidas por la barra de color. Cada bloque ocupa dos líneas, así
          que la fecha cae a la altura del folio y el ámbito a la del rótulo. */}
      <header style={dhead}>
        <div>
          <span style={rotuloCelda}>Recepción</span>
          <span style={valorFolio} className="spira-mono">Nº {r.folio}</span>
        </div>

        {/* Procedencia y fecha como UN bloque, unidos por la barra de color. Dos líneas con la
            misma forma —etiqueta y valor— para que la fecha no quede flotando sola debajo del
            protocolo. El rótulo "Recibido" va en línea y no encima: mantiene el bloque en dos
            renglones y sigue haciendo falta, porque en la card conviven DOS fechas (ésta y la de
            ingreso a stock, arriba en la banda) y pueden ser días distintos. */}
        <div style={{ display: 'flex', gap: 11, alignItems: 'stretch' }}>
          <span style={{ ...barraOrigen, background: ambito.color }} />
          {/* Grilla de dos columnas, las dos ancladas a la derecha: las etiquetas terminan en el
              mismo eje y los valores también. Con dos flex sueltos cada línea se acomodaba por su
              cuenta contra el borde y quedaban corridas 5px entre sí. */}
          <div style={fichaOrigen}>
            {/* Sin protocolo (ambulatoria) no hay valor que poner al lado, y una celda de menos
                corre TODA la grilla un lugar: la fila siguiente se sube y "Recibido" termina al
                lado del ámbito. Ocupando las dos columnas, la fila se cierra sola. */}
            <span style={{ ...etiquetaOrigen, color: ambito.color, ...(r.protocol ? null : { gridColumn: '1 / -1' }) }}>
              {ambito.label}
            </span>
            {r.protocol && <span className="spira-mono" style={valorOrigen}>{r.protocol.code}</span>}
            <span style={etiquetaOrigen}>Recibido</span>
            <span className="spira-mono" style={valorOrigen}>{formatDayMonthYear(r.reception_date)}</span>
          </div>
        </div>
      </header>

      {esIp && r.items.length === 0 ? (
        <NotaIp r={r} />
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <div style={{ minWidth: ANCHO_MINIMO }}>
            <TablaRenglones r={r} hoyISO={hoyISO} />
          </div>
        </div>
      )}
    </article>
  )
}

/* ── Banda de estado ─────────────────────────────────────────────────────────
   Tres elementos, no cuatro: rótulo · contexto · acción. La frase "La medicación todavía no
   entró a stock" del mock salió — repite lo que el rótulo ya dice y le quitaba aire al botón.

   La ANULADA va en gris neutro, no en rojo: el rojo de esta banda está tomado por "No se pudo
   verificar", que sí es una falla del sistema. Anular es una decisión deliberada de la
   farmacéutica, y pintarla de error la acusa de algo que no pasó. */
function Banda({ r, canManage, busy, error, onVerify, onAnular }: {
  r: ReceptionRow; canManage: boolean; busy: boolean; error: string | null
  onVerify: () => void; onAnular: () => void
}) {
  const verificada = r.status === 'verificada'
  const anulada = r.status === 'anulada'
  const resumen = resumenContenido(r)

  // Los tokens `acc-deep-*` y no un color-mix con la tinta: la familia acc-deep tiene versión
  // ACLARADA para tema oscuro, y una mezcla oscurecida ahí sería texto invisible sobre el tinte.
  const tinte = error ? 'rgba(166,72,59,.10)'
    : anulada ? 'var(--spira-surface)'
    : verificada ? 'rgba(92,138,90,.10)'
    : 'rgba(176,130,63,.13)'
  const tinta = error ? 'var(--spira-acc-deep-danger)'
    : anulada ? 'var(--spira-ink-soft)'
    : verificada ? 'var(--spira-acc-deep-good)'
    : 'var(--spira-acc-deep-warn)'

  const icono = error ? 'alertCircle' : anulada ? 'x' : verificada ? 'check' : 'clock'
  const rotulo = error ? 'No se pudo verificar'
    : anulada ? 'Anulada'
    : verificada ? 'Verificada'
    : 'Pendiente de verificar'

  return (
    <div style={{ ...banda, background: tinte, color: tinta }}>
      <Icon name={icono} size={15} color="currentColor" stroke={verificada && !error ? 2.6 : 2.2} />
      <span style={rotuloEstado}>{rotulo}</span>

      {error ? (
        <span style={{ ...textoBanda, color: 'var(--spira-acc-deep-danger)' }}>{error}</span>
      ) : (
        <>
          {anulada && <span style={textoBanda}>{anuladaPor(r)}</span>}
          {verificada && <span style={textoBanda}>{ingresadaPor(r)}</span>}
          <span style={{ ...textoBanda, marginLeft: 'auto' }}>{resumen}</span>
        </>
      )}

      {canManage && !anulada && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto', flex: '0 0 auto' }}>
          {!verificada && (
            <button
              type="button"
              onClick={onVerify}
              disabled={busy}
              style={{ ...btnVerificar, opacity: busy ? 0.7 : 1, cursor: busy ? 'default' : 'pointer' }}
            >
              <Icon name="check" size={15} color="var(--spira-on-accent)" stroke={2.4} />
              {busy ? 'Verificando…' : error ? 'Reintentar' : 'Verificar e ingresar a stock'}
            </button>
          )}
          {/* Secundaria por PESO, no por color: el rojo aparece recién en el modal. Una lista no
              es un formulario de borrado. */}
          <button
            type="button"
            onClick={onAnular}
            disabled={busy}
            style={{ ...btnOutline, height: 38, fontSize: 13, opacity: busy ? 0.7 : 1 }}
          >
            Anular
          </button>
        </div>
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

/**
 * "Anulada por Fulana · 17 ago 2026 14:22 · Duplicada". Hermana de `ingresadaPor`, con el mismo
 * cuidado con la fecha: sale del `Date` y NO de recortar el ISO. `voided_at` es un timestamptz que
 * llega en UTC, así que `slice(0, 10)` fecharía un día adelante todo lo anulado después de las
 * 21:00 hora argentina.
 */
function anuladaPor(r: ReceptionRow): string {
  const partes: string[] = []
  if (r.voided_at) {
    const fecha = formatDayMonthYear(dateToISO(new Date(r.voided_at)))
    const hora = formatTimeAR(r.voided_at)
    partes.push(r.voided_by_name ? `Anulada por ${r.voided_by_name} · ${fecha} ${hora}` : `Anulada · ${fecha} ${hora}`)
  } else {
    partes.push('Anulada')
  }
  if (r.void_reason) partes.push(r.void_reason)
  return partes.join(' · ')
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
            <th key={c.clave} scope="col" style={{ ...th, textAlign: c.align }}>
              {c.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {r.items.map((it) => {
          const cfg = ESTADO_CFG[estadoFromExpiry(it.expiry_date, hoyISO)]
          const codigo = it.medication?.codes?.[0]?.code ?? ''
          return (
            <tr key={it.id}>
              <td style={celdaDe(0)}>
                <div style={nombreMed}>{it.medication?.name ?? '—'}</div>
                {it.medication?.drug?.name && <div style={monodroga}>{it.medication.drug.name}</div>}
              </td>
              <td style={celdaDe(1)}>
                {codigo ? (
                  <>
                    <span className="spira-mono" style={{ fontSize: 13 }}>{codigo}</span>
                    {/* Por la FORMA, no por `code_type`: ese campo nació con default 'ean13' y en
                        producción marca como código de barras a códigos de dos dígitos. */}
                    {!esCodigoDeBarras(codigo) && <span style={qualifier}>interno</span>}
                  </>
                ) : <span style={{ fontSize: 12.5, color: 'var(--spira-faint)' }}>— sin código —</span>}
              </td>
              <td style={celdaDe(2)}>
                <span className="spira-mono" style={chipLote}>{it.lot_number}</span>
              </td>
              <td style={celdaDe(3)}>
                <span
                  style={{ ...vence, color: cfg.color }}
                  title={cfg.label}
                  aria-label={`Vencimiento ${it.expiry_date ? formatDayMonthYear(it.expiry_date) : 'sin fecha'}, ${cfg.label}`}
                >
                  {cfg.icon && <Icon name={cfg.icon} size={13} color={cfg.color} />}
                  <span className="spira-mono">{it.expiry_date ? formatDayMonthYear(it.expiry_date) : '—'}</span>
                </span>
              </td>
              <td style={celdaDe(4)}>
                <span style={{ fontSize: 12.5, color: 'var(--spira-ink-soft)' }}>
                  {it.medication?.laboratorio?.name ?? '— sin cargar —'}
                </span>
              </td>
              <td style={celdaDe(5)}>
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

// Flex con los dos bloques a los extremos: el folio y su fecha alineados por la BASE (uno tiene
// el valor a 21px y el otro a 13,5, así que centrarlos los dejaría flotando), y el ámbito a la
// derecha. El espacio libre del medio es la separación entre "qué documento es" y "de dónde vino".
const dhead: CSSProperties = {
  display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 20,
  padding: `15px ${PADDING_LATERAL}px 16px`, flexWrap: 'wrap',
  background: 'var(--spira-surface)', borderBottom: '1px solid var(--spira-line)',
}
// Rótulo de dato. Las dos celdas del encabezado lo llevan: "Nº 11" y una fecha suelta, uno al
// lado del otro y con una segunda fecha en la banda de arriba, necesitan decir qué son.
const rotuloCelda: CSSProperties = {
  display: 'block', fontSize: 10.5, fontWeight: 700, letterSpacing: '0.1em',
  textTransform: 'uppercase', color: 'var(--spira-ink-soft)', marginBottom: 2, whiteSpace: 'nowrap',
}
const valorFolio: CSSProperties = {
  fontFamily: 'var(--spira-font-display)', fontWeight: 700, fontSize: 21, color: 'var(--spira-ink)',
}
/* Ficha de procedencia: etiqueta + valor en dos columnas. Sin protocolo (ambulatoria) la fila
   queda con una sola celda, y como las dos columnas son `auto` el grid no reserva el hueco. */
const fichaOrigen: CSSProperties = {
  display: 'grid', gridTemplateColumns: 'auto auto', columnGap: 10, rowGap: 4, justifyItems: 'end',
  alignItems: 'baseline',
}
/* Las dos etiquetas con el MISMO tratamiento —cambia el color, no el tamaño ni el peso—; antes
   una iba a 12,5/600 y la otra a 10,5/700 en mayúsculas, y se veían de dos sistemas distintos. */
const etiquetaOrigen: CSSProperties = {
  fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap', color: 'var(--spira-ink-soft)',
}
const valorOrigen: CSSProperties = { fontSize: 13.5, fontWeight: 500, whiteSpace: 'nowrap', color: 'var(--spira-ink)' }
// Abarca el bloque entero (ámbito + fecha), no una sola línea: `alignItems: stretch` en el padre
// le da la altura, así que no hay que fijarla a mano ni recalcularla si cambia el contenido.
const barraOrigen: CSSProperties = { width: 3, borderRadius: 2, flex: '0 0 auto' }

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
/**
 * La celda saca su alineación de COLUMNAS, igual que su título.
 *
 * No es ceremonia: la primera versión escribía el `textAlign` a mano en cada `<td>`, y cuando las
 * columnas del medio pasaron a centradas los `th` se movieron —leen de COLUMNAS— y los `td` se
 * quedaron donde estaban. Título centrado, valor a la izquierda, en la misma columna. Una fuente,
 * los dos consumidores.
 */
const celdaDe = (i: number): CSSProperties => ({ ...td, textAlign: COLUMNAS[i].align })
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
