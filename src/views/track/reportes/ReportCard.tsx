import { useState } from 'react'
import type { CSSProperties } from 'react'
import { Icon } from '../../../components/Icon'
import { PatientLink, PatientLinkArrow } from '../../../components/PatientLink'
import { platformMeta } from '../procedimientos/reportes'
import { dueLabel, isStage, nextStage, prevStage, STAGE_META } from './estados'
import type { ReportStage } from './estados'
import { useReportHistory } from '../../../data/reportStatus'
import type { ReportStatusRow } from '../../../data/reportStatus'
import { formatDateTimeAR } from '../../../lib/dates'

/**
 * La tarjeta de UN reporte. El MISMO componente en los dos lugares donde aparece: el tablero de
 * Reportes pendientes y el desglose dentro de la card "Procedimientos" del modal de visita. El
 * handoff lo pide con todas las letras, y es lo correcto — dos copias de esto derivan en dos
 * reglas distintas de cuándo algo está vencido.
 *
 * `variante` sólo saca el encabezado de paciente y visita: adentro del modal de esa visita, repetir
 * de quién es sería decirle a alguien dónde está parado.
 *
 * COLOR DE PLATAFORMA. El handoff pedía el texto del botón en el color del portal sobre ese mismo
 * color al 11%. Medido, ese patrón da 3.06:1 a 4.97:1 en tema claro (fallan LabCorp, Clario y
 * "otra") y 2.62:1 a 4.15:1 en oscuro, donde fallan las cinco — por debajo del 4.5:1 que WCAG pide
 * para texto normal, y PRODUCT.md compromete AA. El fondo teñido se queda (es el que codifica el
 * portal y un fondo no necesita contraste propio) y el texto pasa a tinta: 12:1 en los dos temas.
 * El color sigue leyéndose en el punto.
 */
export function ReportCard({ row, variante, primero = false, canOperate, busy, onStage, onOpenVisit, onOpenPatient }: {
  row: ReportStatusRow
  variante: 'tablero' | 'visita'
  /** Primero de su lista: en la variante `visita` se dibuja sin la línea separadora de arriba. */
  primero?: boolean
  canOperate: boolean
  busy: boolean
  onStage: (stage: ReportStage) => void
  /** Abre el detalle de ESTA visita (el 📎 del handoff). Sólo en el tablero. */
  onOpenVisit?: () => void
  /** Abre la ficha del paciente. Sólo en el tablero — la variante `visita` no muestra su
   *  identidad (ver el comentario de `enTablero` más abajo). Sin esto, nombre e IVRS quedan
   *  como texto (ver `PatientLink`). */
  onOpenPatient?: () => void
}) {
  const enTablero = variante === 'tablero'
  const [verHistorial, setVerHistorial] = useState(false)
  const meta = platformMeta(row.platform)
  const stage: ReportStage = isStage(row.stage) ? row.stage : 'pendiente'
  const sig = nextStage(stage)
  const ant = prevStage(stage)
  const vence = dueLabel(row)

  /* El historial se pide recién al desplegarlo: el conteo ya viaja en la vista y el detalle se
     mira en una de cada veinte tarjetas. */
  const historial = useReportHistory(verHistorial ? row.report_status_id : null)

  return (
    <article
      style={enTablero ? card : { ...plano, ...(primero ? null : planoConLinea) }}
      /* Arrastrar es una comodidad de mouse ENCIMA de los botones, nunca el único camino: el
         arrastre nativo no anda con teclado ni con el dedo. Todo lo que se puede hacer soltando
         se puede hacer con los dos botones de abajo. */
      draggable={canOperate && enTablero}
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', `${row.visit_id}|${row.report_definition_id}`)
        e.dataTransfer.effectAllowed = 'move'
      }}
    >
      {enTablero && (
        <>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 10.5, color: 'var(--spira-muted)' }}>{row.protocol_code}</span>
            <span className="spira-mono" style={{ fontSize: 11, fontWeight: 700, color: 'var(--spira-track)' }}>
              {row.visit_code ?? '—'}
            </span>
            <span style={{ fontSize: 11, color: 'var(--spira-muted)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {row.visit_name ?? ''}
            </span>
          </div>
          <div className="spira-link-group" style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: 3 }}>
            <span style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 16 }}>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 14, fontWeight: 700, color: 'var(--spira-ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  <PatientLink onOpen={onOpenPatient} label={`Abrir la ficha de ${row.patient_name}`}>
                    {row.patient_name}
                  </PatientLink>
                </span>
                <span className="spira-mono" style={{ display: 'block', fontSize: 11, color: 'var(--spira-muted)' }}>
                  {row.patient_code
                    ? <PatientLink onOpen={onOpenPatient} label={`Abrir la ficha del sujeto ${row.patient_code}`}>{row.patient_code}</PatientLink>
                    : '—'}
                </span>
              </span>
              {/* Acá el par SÍ está apilado en un bloque propio de identidad (no comparte renglón
                  con otro dato), así que la flecha va al costado con `gap`, no con margen. */}
              {onOpenPatient && <PatientLinkArrow />}
            </span>
            {onOpenVisit && (
              <button
                type="button"
                onClick={onOpenVisit}
                title="Ver la visita de este paciente"
                aria-label={`Ver la visita ${row.visit_code ?? ''} de ${row.patient_name}`}
                style={iconBtn}
              >
                <Icon name="clip" size={13} color="var(--spira-muted)" />
              </button>
            )}
          </div>
          <div style={{ height: 1, background: 'var(--spira-line)', margin: '10px 0 9px' }} />
        </>
      )}

      {/* El reporte. El nombre del PROCEDIMIENTO sólo se dice en el tablero: ahí la tarjeta llega
          sola y hay que ubicarla. Adentro del modal de visita el procedimiento es el renglón de
          arriba —y muchas veces se llama igual que el reporte, como "Electrocardiograma (ECG)"—,
          así que repetirlo es decir dos veces lo mismo. */}
      <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--spira-ink)' }}>{row.report_name}</div>
      {enTablero && <div style={{ fontSize: 11, color: 'var(--spira-muted)', marginTop: 1 }}>{row.procedure_name}</div>}
      {row.notes && (
        <div style={{ fontSize: 11, color: 'var(--spira-muted)', marginTop: 4, lineHeight: 1.45 }}>{row.notes}</div>
      )}

      {/* La plataforma. Con link es un enlace real que abre en pestaña nueva; sin link es un
          rótulo inerte — un botón que no puede abrir nada no se disfraza de botón. */}
      {row.link ? (
        <a
          href={row.link}
          target="_blank"
          rel="noopener noreferrer"
          title={`Abrir ${meta.label} en una pestaña nueva — ${row.link}`}
          className="spira-plataforma"
          style={{ ...plataformaBtn, background: meta.color + '1C', textDecoration: 'none' }}
        >
          <span aria-hidden style={{ width: 7, height: 7, borderRadius: '50%', background: meta.color, flex: '0 0 auto' }} />
          Abrir en {meta.label}
          <Icon name="externalLink" size={12} color="var(--spira-ink)" />
        </a>
      ) : (
        /* Sin link no se disfraza de botón: se ve más plano, no toma el cursor de acción y DICE
           qué le falta. Un rectángulo que parece pulsable y no lleva a ningún lado es de las
           cosas que el repo prohíbe — y acá, además, mandaría a la coordinadora a hacer click
           esperando el portal. El link se carga por reporte en Cronograma › Procedimientos del
           estudio; si la plataforma tuviera URL por defecto, se completa sola al elegirla. */
        <div
          style={{ ...plataformaBtn, background: 'transparent', borderWidth: 1, borderStyle: 'dashed', borderColor: 'var(--spira-line-2)', cursor: 'default', color: 'var(--spira-ink-soft)' }}
          title={`${meta.label}: todavía no tiene cargado el link al portal`}
        >
          <span aria-hidden style={{ width: 7, height: 7, borderRadius: '50%', background: meta.color, flex: '0 0 auto' }} />
          {meta.label}
          <span style={{ fontWeight: 400, fontSize: 11.5 }}>· sin link</span>
        </div>
      )}

      {/* Vencimiento (si sigue pendiente) o cuándo se movió. */}
      <div style={{ fontSize: 10.5, marginTop: 6, color: vence.overdue ? 'var(--spira-danger)' : 'var(--spira-muted)', fontWeight: vence.overdue ? 700 : 400 }}>
        {stage === 'pendiente'
          ? vence.texto
          : `${STAGE_META[stage].label} ${row.updated_at ? formatDateTimeAR(row.updated_at) : ''}`}
      </div>

      {/* Avanzar / retroceder */}
      {canOperate && (
        <div style={{ display: 'flex', gap: 7, marginTop: 10 }}>
          {sig ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => onStage(sig)}
              style={{ ...avanzarBtn, background: STAGE_META[sig].color, opacity: busy ? 0.6 : 1 }}
            >
              {STAGE_META[sig].cta}
            </button>
          ) : (
            <span style={cerrado}>
              <Icon name="check" size={13} color="var(--spira-primary)" /> Evolucionado
            </span>
          )}
          {ant && (
            <button
              type="button"
              disabled={busy}
              onClick={() => onStage(ant)}
              title={`Volver a ${STAGE_META[ant].label.toLowerCase()}`}
              aria-label={`Volver a ${STAGE_META[ant].label.toLowerCase()}`}
              style={{ ...iconBtn, opacity: busy ? 0.6 : 1 }}
            >
              <Icon name="rotateCcw" size={13} color="var(--spira-muted)" />
            </button>
          )}
        </div>
      )}

      {/* Historial */}
      {row.history_count > 0 && (
        <>
          <button type="button" onClick={() => setVerHistorial((v) => !v)} className="spira-no-press" style={histBtn}>
            <Icon name="list" size={12} color="var(--spira-muted)" />
            Historial ({row.history_count})
            <Icon name="chevronDown" size={12} color="var(--spira-muted)" style={{ marginLeft: 'auto', transform: verHistorial ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
          </button>
          {verHistorial && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginTop: 5 }}>
              {historial.loading && <span style={histLinea}>Cargando…</span>}
              {historial.error && <span style={{ ...histLinea, color: 'var(--spira-danger)' }}>No pudimos cargar el historial.</span>}
              {(historial.data ?? []).map((h) => (
                <span key={h.id} style={histLinea}>
                  {formatDateTimeAR(h.changed_at)} · {isStage(h.stage) ? STAGE_META[h.stage].label : h.stage} · {h.changed_by_name}
                </span>
              ))}
            </div>
          )}
        </>
      )}
    </article>
  )
}

/** En el TABLERO la tarjeta es una tarjeta: flota sobre el fondo de su columna y hay que poder
 *  agarrarla. Ahí el borde, el radio y la sombra son la afordancia. */
const card: CSSProperties = {
  background: 'var(--spira-white)', border: '1px solid var(--spira-line)', borderRadius: 12,
  padding: '11px 12px', boxShadow: 'var(--spira-shadow-sm)',
}
/**
 * Adentro del modal de visita, en cambio, NO es una tarjeta: es contenido.
 *
 * Ahí ya vive dentro del panel "Procedimientos" y dentro de la fila del procedimiento — con borde
 * y sombra propios serían TRES cajas encajadas, que es la regla que el sistema prohíbe de plano.
 * Ese apilado era el "ruido" que se veía. Sin caja, la jerarquía la hacen la sangría y una línea
 * fina entre reportes, que es para lo que sirve el espacio.
 */
const plano: CSSProperties = {
  background: 'transparent', border: 'none', borderRadius: 0, boxShadow: 'none',
  padding: '10px 0 2px',
}
/** Separador entre reportes hermanos. En longhands: mezclarlo con la abreviada rompe el borde. */
const planoConLinea: CSSProperties = {
  borderWidth: '1px 0 0 0', borderStyle: 'solid', borderColor: 'var(--spira-line)', marginTop: 2,
}
const iconBtn: CSSProperties = {
  width: 28, height: 28, flex: '0 0 auto', borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--spira-line-2)',
  borderRadius: 8, background: 'var(--spira-white)', cursor: 'pointer', display: 'grid', placeItems: 'center',
}
/** Botón/rótulo de la plataforma: ancho completo, fondo teñido con su color, texto en tinta. */
const plataformaBtn: CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, width: '100%',
  height: 32, marginTop: 9, borderRadius: 9, border: 'none',
  color: 'var(--spira-ink)', fontFamily: 'var(--spira-font-text)', fontSize: 12.5, fontWeight: 600,
}
/** Avanzar de etapa: SIEMPRE en el color de la etapa a la que lleva, no en el de la actual. */
const avanzarBtn: CSSProperties = {
  flex: 1, height: 32, borderRadius: 9, border: 'none', color: 'var(--spira-on-accent)',
  fontFamily: 'var(--spira-font-text)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
}
const cerrado: CSSProperties = {
  flex: 1, height: 32, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
  fontSize: 12.5, fontWeight: 600, color: 'var(--spira-primary)',
}
const histBtn: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 6, width: '100%', marginTop: 9, padding: '5px 0',
  border: 'none', background: 'transparent', cursor: 'pointer',
  fontFamily: 'var(--spira-font-text)', fontSize: 11.5, color: 'var(--spira-muted)',
}
const histLinea: CSSProperties = { fontSize: 11, color: 'var(--spira-muted)', lineHeight: 1.5 }
