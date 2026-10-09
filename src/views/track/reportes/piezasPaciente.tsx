import type { CSSProperties, MouseEvent } from 'react'
import { Icon } from '../../../components/Icon'
import { platformMeta } from '../procedimientos/reportes'
import { isOverdue, prevStage, STAGE_META } from './estados'
import type { ReportStage } from './estados'
import { etapaDe, textoPlazo } from './porPaciente'
import type { Conteo, FilaReporte, Plazo } from './porPaciente'
import { estiloTag } from './tonos'
import type { TonoReporte } from './tonos'

/**
 * Las piezas de «Reportes pendientes» por paciente, compartidas entre el submódulo y la tarjeta del
 * Resumen (plan `docs/plan-reportes-pendientes.md`, 6A): la barra de estado, el conteo, el plazo, el
 * chip, la acción y el link al portal. Las reglas viven en `porPaciente.ts`; acá sólo se dibujan.
 *
 * COLORES DE LA CASA Y NO LOS DEL MOCK (5A). El handoff traía rgba fijos —`rgba(166,72,59,.08)`
 * para el chip vencido, `rgba(58,107,140,.12)` para el descargado— que en tema oscuro no existen y
 * que, en el chip vencido, quedan debajo de AA. Los chips usan `estiloTag` (`tonos.ts`, medidos en los
 * dos temas) y la barra mezcla tokens con `color-mix`.
 */

/** Tinte de un token, mezclado contra la superficie: vale en los dos temas. */
const mezcla = (token: string, pct: number) => `color-mix(in srgb, ${token} ${pct}%, var(--spira-white))`

/** Color de un segmento de la barra. Sin descargar va en línea, o en rojo tenue si ya venció —salvo
 *  que quien la dibuja ya diga el atraso por otro lado (`atrasoEnNeutro`, la tarjeta del Resumen). */
function colorSegmento(r: FilaReporte, now: number, atrasoEnNeutro: boolean): string {
  const e = etapaDe(r)
  if (e === 'descargado') return '#3A6B8C'
  if (e === 'evolucionado') return 'var(--spira-good)'
  return !atrasoEnNeutro && isOverdue({ ...r, stage: 'pendiente' }, now) ? mezcla('var(--spira-danger)', 32) : 'var(--spira-line-2)'
}

/**
 * La barra de estado del paciente (handoff §4): un segmento por reporte, en el mismo orden en que
 * aparecen al desplegar. Deja ver el estado sin abrir la fila. Cada segmento dice su estado en el
 * rótulo accesible: el color nunca va solo.
 */
export function BarraDeReportes({ reportes, ancho, alto, now, atrasoEnNeutro = false }: {
  reportes: readonly FilaReporte[]
  ancho: number
  alto: number
  now: number
  /** El Resumen dice el atraso en el plazo de la fila; ahí la barra cuenta, sin teñir de rojo. */
  atrasoEnNeutro?: boolean
}) {
  return (
    <span role="list" aria-label="Estado de los reportes" style={{ display: 'flex', gap: 3, width: ancho, flex: '0 0 auto' }}>
      {reportes.map((r) => {
        const rotulo = `${r.report_name}: ${STAGE_META[etapaDe(r)].label.toLowerCase()}`
        return (
          <span
            key={r.report_definition_id}
            role="listitem"
            aria-label={rotulo}
            title={rotulo}
            style={{ flex: 1, height: alto, borderRadius: 3, background: colorSegmento(r, now, atrasoEnNeutro), minWidth: 4 }}
          />
        )
      })}
    </span>
  )
}

/**
 * «2 sin desc. · 1 desc.» (12px · 700). Se omite la parte que da cero; si las dos dan cero, la fila ya
 * está toda evolucionada y lo dice en verde («Todo evolucionado», o «Listo» en el Resumen).
 */
export function ConteoDeReportes({ conteo, vencida, corto = false }: { conteo: Conteo; vencida: boolean; corto?: boolean }) {
  const base: CSSProperties = { fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }
  if (conteo.sinDescargar === 0 && conteo.descargados === 0) {
    return <span style={{ ...base, color: 'var(--spira-acc-deep-good)' }}>{corto ? 'Listo' : 'Todo evolucionado'}</span>
  }
  return (
    <span style={base}>
      {conteo.sinDescargar > 0 && (
        <span style={{ color: vencida ? 'var(--spira-acc-deep-danger)' : 'var(--spira-ink)' }}>{conteo.sinDescargar} sin desc.</span>
      )}
      {conteo.sinDescargar > 0 && conteo.descargados > 0 && <span style={{ color: 'var(--spira-muted)', fontWeight: 400 }}> · </span>}
      {conteo.descargados > 0 && <span style={{ color: 'var(--spira-acc-deep-blue)' }}>{conteo.descargados} desc.</span>}
    </span>
  )
}

/** Color y peso del plazo (handoff §3). Vencido en rojo y 700; hoy o en ≤ 3 días, ámbar. */
export function estiloPlazo(p: Plazo): CSSProperties {
  if (p.tipo === 'vencido') return { color: 'var(--spira-acc-deep-danger)', fontWeight: 700 }
  if (p.tipo === 'hoy' || p.tipo === 'pronto') return { color: 'var(--spira-acc-deep-warn)', fontWeight: 500 }
  if (p.tipo === 'listo') return { color: 'var(--spira-acc-deep-good)', fontWeight: 600 }
  return { color: 'var(--spira-ink-soft)', fontWeight: 500 }
}

/** Toda evolucionada no tiene plazo que decir: el conteo ya dice «Todo evolucionado» en la misma fila,
 *  y repetirlo en la columna de al lado se leía como un eco. */
export function TextoPlazo({ plazo, corto = false }: { plazo: Plazo; corto?: boolean }) {
  if (plazo.tipo === 'listo') return null
  return <span style={{ ...estiloPlazo(plazo), whiteSpace: 'nowrap' }}>{textoPlazo(plazo, corto)}</span>
}

/** El tono y el ícono del estado de UN reporte. Sin descargar y vencido es rojo; sin vencer, neutro. */
function tonoDeReporte(r: FilaReporte, now: number): { tono: TonoReporte; icono: 'download' | 'check' | null; texto: string } {
  const e = etapaDe(r)
  if (e === 'descargado') return { tono: 'descargado', icono: 'download', texto: STAGE_META.descargado.label }
  if (e === 'evolucionado') return { tono: 'evolucionado', icono: 'check', texto: STAGE_META.evolucionado.label }
  return { tono: isOverdue({ ...r, stage: 'pendiente' }, now) ? 'vencido' : 'neutro', icono: null, texto: STAGE_META.pendiente.label }
}

/** El círculo vacío de «sin descargar»: no hay un ícono así en el set, y es un trazo. */
function CirculoVacio({ color, size }: { color: string; size: number }) {
  return <span aria-hidden style={{ width: size - 2, height: size - 2, borderRadius: '50%', border: `1.5px solid ${color}`, flex: '0 0 auto', boxSizing: 'border-box' }} />
}

/**
 * El estado de un reporte. En el submódulo es un CHIP (alto 24, pill); en el Resumen, el mismo texto
 * e ícono sin fondo. «Sin descargar» lleva además el BORDE PUNTEADO: el estado nunca se comunica sólo
 * con color (handoff §7.8).
 */
export function EstadoDeReporte({ reporte, now, variante }: { reporte: FilaReporte; now: number; variante: 'chip' | 'texto' }) {
  const { tono, icono, texto } = tonoDeReporte(reporte, now)
  const tag = estiloTag(tono)
  const sinDescargar = icono === null
  const marca = sinDescargar
    ? <CirculoVacio color={tag.color as string} size={12} />
    : <Icon name={icono} size={12} color={tag.color as string} stroke={2.2} />
  if (variante === 'texto') {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600, color: tag.color, whiteSpace: 'nowrap' }}>
        {marca}{texto}
      </span>
    )
  }
  return (
    <span style={{ ...tag, fontWeight: 600, borderStyle: sinDescargar ? 'dashed' : 'solid', justifySelf: 'start' }}>
      {marca}{texto}
    </span>
  )
}

/**
 * El link al portal del reporte (D2). Spira no guarda el archivo: guarda DÓNDE está. Por eso no hay
 * botón «Descargar» —prometería una descarga que no ocurre— sino este link y, al lado, «Marcar
 * descargado». Sin link no se disfraza de enlace: dice el portal y «sin link», como `ReportCard`.
 */
export function LinkAlPortal({ reporte }: { reporte: FilaReporte }) {
  const meta = platformMeta(reporte.platform)
  const punto = <span aria-hidden style={{ width: 6, height: 6, borderRadius: '50%', background: meta.color, flex: '0 0 auto' }} />
  if (!reporte.link) {
    return (
      <span style={portal} title={`${meta.label}: todavía no tiene cargado el link al portal`}>
        {punto}{meta.label}<span style={{ fontWeight: 400 }}>· sin link</span>
      </span>
    )
  }
  return (
    <a
      href={reporte.link}
      target="_blank"
      rel="noopener noreferrer"
      className="spira-textlink spira-no-press"
      title={`Abrir ${meta.label} en una pestaña nueva — ${reporte.link}`}
      onClick={(e) => e.stopPropagation()}
      style={{ ...portal, color: 'var(--spira-ink-2)' }}
    >
      {punto}{meta.label}
      <Icon name="externalLink" size={11} color="var(--spira-ink-soft)" />
    </a>
  )
}

const portal: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600,
  color: 'var(--spira-ink-soft)', whiteSpace: 'nowrap', textDecoration: 'none', flex: '0 0 auto',
}

/**
 * Qué ofrece un reporte según su etapa: el paso de AVANZAR (si queda alguno) y el de VOLVER (si hay
 * de dónde). La etapa de destino es la que manda la RPC.
 *
 * VOLVER EN TODOS LOS PASOS (2026-10-09, pedido del Director). Antes sólo el evolucionado tenía
 * «Deshacer»: un «Marcar descargado» tocado de más no tenía vuelta desde acá, y había que ir al
 * tablero —que sí retrocede en cada etapa— a corregirlo. Ahora el renglón ofrece lo mismo que la
 * tarjeta del tablero (`ReportCard`): avanzar y, al lado, el ↺ que vuelve un paso.
 */
export function accionDe(r: FilaReporte): {
  avanzar: { destino: ReportStage; texto: string; tipo: 'descargar' | 'evolucionar' } | null
  volver: ReportStage | null
} {
  const e = etapaDe(r)
  const volver = prevStage(e)
  if (e === 'pendiente') return { avanzar: { destino: 'descargado', texto: STAGE_META.descargado.cta ?? 'Marcar descargado', tipo: 'descargar' }, volver }
  if (e === 'descargado') return { avanzar: { destino: 'evolucionado', texto: 'Evolucionar', tipo: 'evolucionar' }, volver }
  return { avanzar: null, volver }
}

/**
 * La acción de un reporte, a la derecha del renglón: «Marcar descargado» (contorno azul) o
 * «Evolucionar» (sólido), y el ↺ que vuelve un paso —el mismo gesto, ícono y tooltip que el tablero—.
 * Ya evolucionado queda sólo el ↺: el estado de al lado dice «Evolucionado». `compacta` es la del Resumen.
 */
export function AccionDeReporte({ reporte, compacta = false, busy, accentSolid, onStage }: {
  reporte: FilaReporte
  compacta?: boolean
  busy: boolean
  accentSolid: string
  onStage: (destino: ReportStage) => void
}) {
  const { avanzar, volver } = accionDe(reporte)
  const alto = compacta ? 26 : 30
  const ir = (destino: ReportStage) => (e: MouseEvent) => { e.stopPropagation(); if (!busy) onStage(destino) }
  let boton = null
  if (avanzar) {
    const estilo: CSSProperties = avanzar.tipo === 'descargar'
      ? { ...accion, height: alto, borderRadius: compacta ? 7 : 8, fontSize: compacta ? 12 : 12.5, borderColor: '#3A6B8C', color: 'var(--spira-acc-deep-blue)', background: 'var(--spira-white)' }
      : { ...accion, height: alto, borderRadius: compacta ? 7 : 8, fontSize: compacta ? 12 : 12.5, borderColor: accentSolid, background: accentSolid, color: 'var(--spira-on-accent)' }
    boton = (
      <button type="button" onClick={ir(avanzar.destino)} disabled={busy} aria-label={`${avanzar.texto}: ${reporte.report_name}`} aria-busy={busy} style={{ ...estilo, opacity: busy ? 0.6 : 1 }}>
        <Icon name={avanzar.tipo === 'descargar' ? 'download' : 'check'} size={compacta ? 13 : 14} color={avanzar.tipo === 'descargar' ? 'var(--spira-acc-deep-blue)' : 'var(--spira-on-accent)'} stroke={2.2} />
        {avanzar.texto}
      </button>
    )
  }
  /* El tooltip dice A DÓNDE vuelve, no «Deshacer»: con dos pasos para atrás posibles, «deshacer»
     no alcanza para saber si el reporte queda descargado o sin descargar. */
  const aDonde = volver && `Volver a ${STAGE_META[volver].label.toLowerCase()}`
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, justifySelf: 'end' }}>
      {boton}
      {volver && (
        <button
          type="button"
          onClick={ir(volver)}
          disabled={busy}
          title={aDonde ?? undefined}
          aria-label={`${aDonde}: ${reporte.report_name}`}
          style={{ ...volverBtn, width: alto, height: alto, borderRadius: compacta ? 7 : 8, opacity: busy ? 0.6 : 1 }}
        >
          <Icon name="rotateCcw" size={13} color="var(--spira-muted)" />
        </button>
      )}
    </span>
  )
}

/* Borde en LONGHANDS: el color cambia según la acción (gotcha de la casa, CLAUDE.md). */
const accion: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '0 11px',
  borderWidth: 1, borderStyle: 'solid', fontFamily: 'var(--spira-font-text)', fontWeight: 600,
  cursor: 'pointer', whiteSpace: 'nowrap', justifySelf: 'end',
}
/* El de `ReportCard` (`iconBtn`): borde suave y papel, para que pese menos que avanzar. */
const volverBtn: CSSProperties = {
  flex: '0 0 auto', borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--spira-line-2)',
  background: 'var(--spira-white)', cursor: 'pointer', display: 'grid', placeItems: 'center', padding: 0,
}
