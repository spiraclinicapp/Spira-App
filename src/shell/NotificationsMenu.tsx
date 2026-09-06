import { useCallback, useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from '../components/Icon'
import { PatientLink, PatientLinkArrow } from '../components/PatientLink'
import { usePopover } from '../components/usePopover'
import type { AlertKind } from '../data/alertDismissalModel'
import {
  descarteListo, dismissAlert, DISMISS_REASONS, MOTIVO_OTRO, useActiveAlerts,
} from '../data/alertDismissals'
import type { NavTarget } from '../views/types'
import { priorizarAlertas } from '../views/visitRules'
import { ProtoTag } from '../views/visitAtoms'
import { DESTINO_PENDIENTES, nombreDeDestino } from '../views/resumen/destinos'
import type { ClaseDeAlerta } from './notificaciones'
import {
  CLASES, claseDeAlerta, fechaDeReporte, fechaDeVisita, motivoDeAlerta, motivoDeReporte,
  textoDePildora, tinte, tonoDelPunto,
} from './notificaciones'

/** Cuántos ítems entran en el desplegable. Ver el porqué del recorte donde se aplica. */
const MAX_NOTIFICACIONES = 10

/* ============================================================================
   NotificationsMenu — desplegable de notificaciones (campana, top bar).

   Rediseñado según `docs/design_handoff_notificaciones/`, con las doce decisiones de
   `docs/plan-campana-notificaciones.md`. Las fuentes son REALES: `useActiveAlerts()` —las mismas
   alertas vigentes que la vista de Pendientes y el resumen de Inicio, ya sin las descartadas—, así
   que los tres cuentan lo mismo. Un badge que diga 22 sobre una lista de 21 es exactamente la clase
   de incoherencia que hace desconfiar de un sistema auditable.

   LAS REGLAS NO ESTÁN ACÁ: viven en `./notificaciones.ts`, con test. Este archivo es geometría,
   estado de UI y gestos. La separación no es estética — el rótulo de la alerta se resolvía acá con
   un ternario que anunciaba "no vino" como un reporte de procedimiento, y estuvo así en producción
   sin un solo error.

   TRES COSAS QUE VALE LA PENA SABER ANTES DE TOCAR ESTE ARCHIVO:

   1. EL PANEL USA `usePopover`, y no es por comodidad. El popover de descarte se portalea a
      `document.body` (si viviera dentro de la lista, su `overflow-y` lo recortaría). Con el cierre
      por click afuera decidido a mano —`rootRef.contains(target)`, que es como estaba— ese popover
      cae "afuera" del panel y lo cierra entero; y como cierra en el `mousedown`, la opción se
      desmonta antes de que llegue el `click` y el motivo ni siquiera se elige. `usePopover` tiene el
      registro que reconstruye la cadena lógica que el portal corta, así que entrando ahí el panel
      reconoce como propios los clicks de los popovers que abrieron sus botones.

   2. `Esc` CIERRA DE ADENTRO HACIA AFUERA, uno por vez: con el popover de descarte abierto, se lo
      lleva a él y el panel se queda. El handoff pide lo contrario ("cierra el panel y cualquier
      popover abierto"), y es peor: un Esc para corregir un motivo mal elegido te tiraría el panel y
      el formulario a medio llenar. Lo resuelve `usePopover` solo.

   3. EL DESCARTE ESTÁ GATEADO por `isAllowed('track')`, igual que el pie y el link del paciente.
      Archivar es una escritura auditada y el único lugar donde se puede DESHACER es el panel de
      descartadas de Coordinación: sin el módulo, quien descarte desde acá silencia para siempre.

   A11y: campana con aria-haspopup/aria-expanded + aria-label con el conteo (el punto ya no lo
   escribe, pero el lector de pantalla lo sigue diciendo); foco al panel al abrir y de vuelta a la
   campana si queda huérfano al cerrar.
   ============================================================================ */

interface NotificationsMenuProps {
  /** Navegar (lo provee el shell = AppShell.navigate). */
  onNavigate: (moduleKey: string, subKey: string, target?: NavTarget) => void
  /** Gate de acceso del shell (para el pie, el link del paciente y el tacho). */
  isAllowed: (moduleKey: string) => boolean
}

/** Lo que hace falta para archivar una alerta desde acá. */
interface Descarte {
  kind: AlertKind
  visitId: string
  reportDefinitionId: string | null
  /** Para el `title` del tacho y el encabezado del popover. */
  etiqueta: string
}

/**
 * Una fila del panel, ya normalizada.
 *
 * Las dos clases de origen —alertas de visita y reportes pendientes— vienen de consultas distintas
 * y con forma distinta. Se aplanan acá, ANTES de dibujar, para que la caja se escriba una sola vez:
 * si cada lista tuviera su propio JSX, la grilla se desincronizaría entre las dos y las columnas
 * dejarían de alinear, que es lo único que este diseño promete.
 */
interface Caja {
  key: string
  clase: ClaseDeAlerta
  patientId: string
  patientName: string
  patientCode: string | null
  protocolId: string
  protocolCode: string
  motivo: string
  fecha: string | null
  descarte: Descarte
}

export function NotificationsMenu({ onNavigate, isAllowed }: NotificationsMenuProps) {
  const alerts = useActiveAlerts()
  const [open, setOpen] = useState(false)
  const cerrar = useCallback(() => setOpen(false), [])

  /* `flip` apagado: la campana vive pegada al borde SUPERIOR de la ventana, así que voltear hacia
     arriba sacaría el panel de la pantalla. `align: 'end'` lo cuelga por su borde derecho, que es lo
     que hace que salga de la campana y no del centro de la barra. */
  const { triggerRef, popRef, pos } = usePopover<HTMLButtonElement, HTMLDivElement>(
    open, cerrar, false, 'end',
  )

  const panelRef = useRef<HTMLDivElement | null>(null)
  const montarPanel = useCallback((n: HTMLDivElement | null) => {
    panelRef.current = n
    popRef(n)
  }, [popRef])

  const todasLasVisitas = alerts.visitAlerts
  const todosLosReportes = alerts.reportAlerts
  const count = todasLasVisitas.length + todosLosReportes.length

  /* ┌─ EL PANEL SE RECORTA; EL CONTADOR NO ────────────────────────────────────────────────────┐
     El desplegable mapeaba TODO sin tope y ya venía renderizando 43 ítems: para llegar al pie
     ("Ver todos los pendientes") había que scrollear la lista entera, o sea que el camino a la
     pantalla que sí tiene filtros y buscador quedaba escondido detrás del problema que resuelve.
     El punto de la campana, en cambio, no se toca: cuenta TODAS — recortar la vista no puede
     cambiar cuántas hay.

     Se muestran las MÁS GRAVES, no las primeras: la consulta las trae por fecha, así que sin
     ordenar el recorte dejaría afuera una ventana vencida por diez pendientes más viejos. El orden
     lo sabe priorizarAlertas (con test).

     Los reportes van primero y completos hasta llenar el cupo, igual que en la lista sin recortar:
     el orden entre las dos listas es el que ya tenía el panel y no es lo que este cambio discute.
     └──────────────────────────────────────────────────────────────────────────────────────────┘ */
  const procRows = todosLosReportes.slice(0, MAX_NOTIFICACIONES)
  const rows = priorizarAlertas(todasLasVisitas).slice(0, MAX_NOTIFICACIONES - procRows.length)
  const ocultas = count - procRows.length - rows.length

  const puedeCoordinar = isAllowed('track')

  // Al abrir, el foco va al panel.
  useEffect(() => { if (open) panelRef.current?.focus() }, [open])

  /* Al cerrar, el foco vuelve a la campana SÓLO si quedó huérfano. Es la regla honesta y no depende
     de saber quién cerró: si el panel se desmontó con el foco adentro, `document.body` queda
     enfocado y no hay dónde seguir tabulando; si el cierre fue por un click en otra cosa, el foco ya
     está donde el usuario lo puso y robarlo sería peor. */
  const estabaAbierto = useRef(false)
  useEffect(() => {
    if (estabaAbierto.current && !open && document.activeElement === document.body) {
      triggerRef.current?.focus()
    }
    estabaAbierto.current = open
  }, [open, triggerRef])

  const goAll = () => { setOpen(false); onNavigate('track', 'alertas') }

  /* La campana no tiene `module` (no es una vista de contenido), así que no hay `useAbrirFicha`:
     el destino es siempre `track/protocolos`, con guard EXPLÍCITO — sin el módulo Coordinación
     el nombre queda como texto pelado (ver `PatientLink`), en vez de un `navigate` que
     `isAllowed` descartaría en silencio del lado del shell. */
  const abrirFicha = (patientId: string, protocolId: string) =>
    (puedeCoordinar
      ? () => { setOpen(false); onNavigate('track', 'protocolos', { patientId, protocolId }) }
      : undefined)

  const cajas: Caja[] = [
    ...procRows.map((r): Caja => ({
      key: `${r.visit_id}:${r.report_definition_id}`,
      clase: 'reporte',
      patientId: r.patient_id,
      patientName: r.patient_name,
      patientCode: r.patient_code,
      protocolId: r.protocol_id,
      protocolCode: r.protocol_code,
      motivo: motivoDeReporte(r),
      fecha: fechaDeReporte(r),
      descarte: {
        kind: 'reporte_procedimiento',
        visitId: r.visit_id,
        reportDefinitionId: r.report_definition_id,
        etiqueta: `${r.report_name} · ${r.patient_name}`,
      },
    })),
    ...rows.map((a): Caja => ({
      key: a.id,
      clase: claseDeAlerta(a.computed_status),
      patientId: a.patient_id,
      patientName: a.patient_name,
      patientCode: a.patient_code,
      protocolId: a.protocol_id,
      protocolCode: a.protocol_code,
      motivo: motivoDeAlerta(a),
      fecha: fechaDeVisita(a),
      descarte: {
        kind: 'visita',
        visitId: a.id,
        reportDefinitionId: null,
        etiqueta: `${motivoDeAlerta(a)} · ${a.patient_name}`,
      },
    })),
  ]

  const punto = tonoDelPunto(todasLasVisitas, todosLosReportes)
  const label = count > 0 ? `Notificaciones, ${count} sin leer` : 'Notificaciones'
  const vacio = cajas.length === 0

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={label}
        title="Notificaciones"
        style={bellBtn}
      >
        <Icon name="bell" size={18} color="var(--spira-ink)" />
        {/* El indicador es un PUNTO, no un contador: el número exacto vive en la cabecera del panel
            y en la lista, y sobre el ícono a 9 px era ilegible. En cero no se dibuja. */}
        {punto && <span className="spira-notif-punto" style={{ background: punto }} />}
      </button>

      {open && pos && createPortal(
        <div
          ref={montarPanel}
          tabIndex={-1}
          role="dialog"
          aria-label="Notificaciones"
          className="spira-notif-panel"
          style={{ top: pos.top, left: pos.left }}
        >
          <div style={headerRow}>
            <span style={headerTitulo}>Notificaciones</span>
            {count > 0 && <span style={countPill}>{textoDePildora(count)}</span>}
          </div>

          <div className="spira-notif-lista spira-scroll">
            {alerts.loading && vacio ? (
              <div style={emptyBox}>Cargando…</div>
            ) : alerts.error ? (
              <div style={{ ...emptyBox, color: 'var(--spira-acc-deep-danger)' }}>
                No pudimos cargar las notificaciones.
              </div>
            ) : vacio ? (
              <div style={emptyState}>
                <span style={emptyIcon}><Icon name="check" size={20} color="var(--spira-good)" /></span>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--spira-ink)' }}>Estás al día</div>
                <div style={{ fontSize: 12.5, color: 'var(--spira-muted)', marginTop: 2 }}>
                  No tenés pendientes nuevos.
                </div>
              </div>
            ) : (
              cajas.map((c, i) => (
                <CajaDeAlerta
                  key={c.key}
                  caja={c}
                  indice={i}
                  abrir={abrirFicha(c.patientId, c.protocolId)}
                  puedeDescartar={puedeCoordinar}
                />
              ))
            )}
          </div>

          {puedeCoordinar && (
            <>
              <div style={footerSep} />
              <button type="button" onClick={goAll} className="spira-notif-all">
                {/* El pie DICE cuántas quedaron afuera, y NOMBRA el destino desde el registry. Sin el
                    número, un panel recortado se lee como la lista completa y nadie va a buscar el
                    resto; con el nombre escrito a mano, el día que ese submódulo se renombre el pie
                    sigue prometiendo una pantalla que ya no existe, sin un solo error. Ya pasó. */}
                Ver {ocultas > 0 ? `las ${ocultas} restantes` : 'todos'} en{' '}
                {nombreDeDestino(DESTINO_PENDIENTES) ?? 'Pendientes'}
                <Icon name="arrowRight" size={15} color="var(--spira-acc-deep-track)" />
              </button>
            </>
          )}
        </div>,
        document.body,
      )}
    </>
  )
}

/**
 * Una caja de la lista. Grilla de cuatro columnas idéntica en todas las filas.
 *
 * La caja entera es pulsable, pero NO es un `<button>` ni lleva `tabIndex`: el camino de teclado son
 * los `<PatientLink>` del nombre y del código, que van al mismo lado. Hacerla focusable sumaría una
 * cuarta parada de Tab por fila —cuarenta antes de llegar al pie— y tres de ellas irían al mismo
 * destino. La caja es una comodidad de mouse; el teclado ya tiene su camino.
 */
function CajaDeAlerta({ caja, indice, abrir, puedeDescartar }: {
  caja: Caja
  indice: number
  abrir?: () => void
  puedeDescartar: boolean
}) {
  const estilo = CLASES[caja.clase]
  return (
    <div
      className={`spira-notif-caja${abrir ? ' spira-notif-caja--link' : ''}`}
      onClick={abrir}
      // La cascada de entrada: cada caja entra 22 ms después de la anterior.
      style={{ '--i': indice } as CSSProperties}
    >
      {/* `tinte()` y no `estilo.base + '18'`: concatenar un sufijo de alpha sobre un `var()` produce
          CSS inválido, se descarta sin avisar y el cuadrado queda transparente. Estuvo así en
          producción para las filas de reporte. */}
      <span className="spira-notif-icono" style={{ background: tinte(estilo.base, 9) }}>
        <Icon name={estilo.icono} size={16} color={estilo.tinta} />
      </span>

      <div className="spira-notif-cuerpo">
        <div className="spira-link-group spira-notif-l1">
          <span className="spira-notif-nombre" title={caja.patientName}>
            <PatientLink onOpen={abrir} label={`Abrir la ficha de ${caja.patientName}`}>
              {caja.patientName}
            </PatientLink>
          </span>
          <span className="spira-mono spira-notif-codigo">
            {caja.patientCode
              ? (
                <PatientLink onOpen={abrir} label={`Abrir la ficha del sujeto ${caja.patientCode}`}>
                  {caja.patientCode}
                </PatientLink>
              )
              : '—'}
          </span>
          {/* Siempre AFUERA del span que trunca: adentro se cortaría antes que el nombre. */}
          {abrir && <PatientLinkArrow />}
        </div>
        <div className="spira-notif-motivo" title={caja.motivo}>{caja.motivo}</div>
      </div>

      <div className="spira-notif-datos">
        <ProtoTag code={caja.protocolCode} protocolId={caja.protocolId} compacto />
        {/* El guion es deliberado: sin él la celda vacía correría el chip hacia abajo y las cajas
            dejarían de alinear entre sí. */}
        <span className={`spira-notif-fecha${caja.fecha ? '' : ' spira-notif-fecha--vacia'}`}>
          {caja.fecha ?? '—'}
        </span>
      </div>

      {/* La columna se reserva SIEMPRE, con o sin tacho: si apareciera sólo a veces, las cajas no
          alinearían entre sí. */}
      <div className="spira-notif-accion">
        {puedeDescartar && <BotonDescartar destino={caja.descarte} />}
      </div>
    </div>
  )
}

/**
 * El tacho y su confirmación.
 *
 * Descartar se registra con motivo y autor, así que no se borra en seco: el tacho abre un popover
 * con el catálogo de motivos, y "Otro" exige explicación. El motivo es lo único que se lee después
 * en la auditoría para entender por qué alguien silenció un desvío clínico.
 *
 * SIN UI OPTIMISTA. `dismissAlert` espera al RPC y después llama a `bumpDismissals()`, que ya
 * relee los descartes en las tres instancias montadas —la campana, el resumen y Pendientes—, así
 * que la fila se va sola apenas vuelve el servidor. Adelantarse obligaría a llevar a mano un
 * conjunto de claves compuestas y reconciliarlo con el refetch, y su modo de falla es el peor de
 * todos acá: una alerta que reaparece sola después de archivarla hace dudar del registro entero.
 * Se gana el viaje de ida y vuelta; se paga con eso.
 */
function BotonDescartar({ destino }: { destino: Descarte }) {
  const [abierto, setAbierto] = useState(false)
  const cerrar = useCallback(() => setAbierto(false), [])
  const { triggerRef, popRef, pos } = usePopover<HTMLButtonElement, HTMLDivElement>(
    abierto, cerrar, true, 'end',
  )
  const [motivo, setMotivo] = useState('')
  const [detalle, setDetalle] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const necesitaDetalle = motivo === MOTIVO_OTRO
  // La MISMA regla que usa el modal de Pendientes, no una copia parecida. Ver `descarteListo`.
  const listo = descarteListo(motivo, detalle)

  const confirmar = async () => {
    if (!listo || ocupado) return
    setOcupado(true)
    setError(null)
    const { error: e } = await dismissAlert({
      kind: destino.kind,
      visitId: destino.visitId,
      reportDefinitionId: destino.reportDefinitionId,
      reason: motivo,
      detail: necesitaDetalle ? detalle : null,
    })
    setOcupado(false)
    if (e) { setError(e); return }
    /* No se cierra el PANEL: sólo el popover. La fila se va sola cuando `bumpDismissals` haga
       releer los descartes, y quien archivó se queda mirando el resto de su lista. */
    setAbierto(false)
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="spira-notif-tacho"
        title="Eliminar notificación"
        aria-label={`Descartar la alerta: ${destino.etiqueta}`}
        aria-haspopup="dialog"
        aria-expanded={abierto}
        // No propaga: el clic es para el tacho, no para abrir la ficha del paciente.
        onClick={(e) => { e.stopPropagation(); setAbierto((v) => !v) }}
      >
        <Icon name="trash" size={15} stroke={1.7} />
      </button>

      {abierto && pos && createPortal(
        <div
          ref={popRef}
          role="dialog"
          aria-label="Descartar la alerta"
          className="spira-notif-pop"
          style={{ top: pos.top, left: pos.left }}
        >
          <div style={popTitulo}>¿Descartar esta alerta?</div>
          <div style={popBajada}>
            Se archiva con motivo y autor; si la condición cambia, vuelve a aparecer.
          </div>

          <div style={popLabel}>Motivo</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {DISMISS_REASONS.map((r) => (
              <button
                key={r.value}
                type="button"
                className="spira-notif-motivo-op spira-no-press"
                aria-pressed={motivo === r.value}
                onClick={() => setMotivo(r.value)}
              >
                {r.label}
              </button>
            ))}
          </div>

          {necesitaDetalle && (
            <textarea
              value={detalle}
              onChange={(e) => setDetalle(e.target.value)}
              rows={2}
              placeholder="Queda en la auditoría."
              aria-label="Explicá el motivo"
              style={popTextarea}
            />
          )}

          {error && <div style={popError}>{error}</div>}

          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={cerrar} style={popBtnCancelar}>Cancelar</button>
            <button
              type="button"
              onClick={confirmar}
              disabled={!listo || ocupado}
              aria-disabled={!listo || ocupado}
              className={!listo || ocupado ? 'spira-no-press' : undefined}
              style={{
                ...popBtnConfirmar,
                // Deshabilitado hasta que haya motivo: el botón no promete algo que la base va a
                // rechazar.
                opacity: listo && !ocupado ? 1 : 0.45,
                cursor: listo && !ocupado ? 'pointer' : 'default',
              }}
            >
              {ocupado ? 'Archivando…' : 'Descartar'}
            </button>
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}

/* —— estilos —— */
const bellBtn: CSSProperties = {
  /* `padding: 0` explícito: el `1px 6px` que trae el navegador achica la caja de contenido a 26×36
     y el ícono se centra ahí adentro, no en el botón. Con 18 px todavía entra y no se nota — el
     tacho de la caja, con 15 px en 22, no entraba y salía corrido 2,5 px. Se declara para que un
     ícono más grande mañana no reviva el mismo defecto. */
  width: 38, height: 38, padding: 0, borderRadius: 10, border: 'none', background: 'transparent',
  cursor: 'pointer', display: 'grid', placeItems: 'center', color: 'var(--spira-ink)',
  position: 'relative',
}
const headerRow: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 9, padding: '13px 15px 11px', flex: '0 0 auto',
}
const headerTitulo: CSSProperties = {
  fontFamily: 'var(--spira-font-display)', fontWeight: 700, fontSize: 15, color: 'var(--spira-ink)',
}
const countPill: CSSProperties = {
  fontSize: 11.5, fontWeight: 700, color: 'var(--spira-acc-deep-danger)',
  background: 'color-mix(in srgb, var(--spira-acc-deep-danger) 10%, transparent)',
  borderRadius: 999, padding: '2px 8px', lineHeight: 1.4, whiteSpace: 'nowrap',
}
const emptyState: CSSProperties = { padding: '30px 16px 34px', textAlign: 'center' }
const emptyIcon: CSSProperties = {
  display: 'inline-grid', placeItems: 'center', width: 42, height: 42, borderRadius: '50%',
  background: 'color-mix(in srgb, var(--spira-good) 12%, transparent)', marginBottom: 10,
}
const emptyBox: CSSProperties = {
  padding: '26px 16px', textAlign: 'center', color: 'var(--spira-muted)', fontSize: 13.5,
}
const footerSep: CSSProperties = { height: 1, background: 'var(--spira-line)', flex: '0 0 auto' }

const popTitulo: CSSProperties = {
  fontFamily: 'var(--spira-font-display)', fontWeight: 700, fontSize: 13.5, color: 'var(--spira-ink)',
}
const popBajada: CSSProperties = { fontSize: 11.5, lineHeight: 1.4, color: 'var(--spira-muted)' }
const popLabel: CSSProperties = {
  fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase',
  color: 'var(--spira-muted)', marginTop: 2,
}
const popTextarea: CSSProperties = {
  width: '100%', resize: 'vertical', padding: '7px 9px', borderRadius: 8,
  borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--spira-line-2)',
  fontFamily: 'var(--spira-font-text)', fontSize: 12, color: 'var(--spira-ink)',
  background: 'var(--spira-white)',
}
const popError: CSSProperties = {
  fontSize: 11.5, lineHeight: 1.4, color: 'var(--spira-acc-deep-danger)',
}
const popBtn: CSSProperties = {
  flex: 1, height: 30, borderRadius: 8, cursor: 'pointer',
  fontFamily: 'var(--spira-font-text)', fontSize: 12, fontWeight: 600,
  borderWidth: 1, borderStyle: 'solid',
}
const popBtnCancelar: CSSProperties = {
  ...popBtn, borderColor: 'var(--spira-line-2)', background: 'var(--spira-white)',
  color: 'var(--spira-ink)',
}
const popBtnConfirmar: CSSProperties = {
  ...popBtn, borderColor: 'var(--spira-acc-deep-danger)',
  background: 'var(--spira-acc-deep-danger)', color: 'var(--spira-white)',
}
