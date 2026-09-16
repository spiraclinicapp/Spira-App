import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { Icon } from '../components/Icon'
import { EmptyState } from '../components/EmptyState'
import { EstadoPaciente } from '../components/EstadoPaciente'
import { Modal } from '../components/Modal'
import type { ProtocolRow } from '../data/protocols'
import { ivrsDelEstudio } from '../lib/ivrs'
import type { PatientRow } from '../data/patients'
import { usePatientVisits, useVisitAlerts } from '../data/visits'
import { useUrlEntity } from '../lib/useUrlState'
import {
  adherence, ageFromBirth, currentVisit, orderVisits, visitTitle, visitTitleConSemanaAparte, studyTime,
  FERTILITY_LABELS, SEX_LABELS,
} from '../lib/visits'
import { VISIT_STATES } from './visitStates'
import { dayLabel, daysDiffISO, formatAR, todayISO } from '../lib/dates'
import { PdVisitFlow } from './track/PdVisitFlow'
import { PdFullSchedule } from './track/PdFullSchedule'
import { VisitDetail } from './track/VisitDetail'
import { RescheduleModal } from './track/RescheduleModal'
import { RegisterVisitFlow } from './track/RegisterVisitFlow'
import { EditPatientForm } from './EditPatientForm'
import { PatientMedicationsCard } from './pharma/PatientMedicationsCard'
import { useAuth } from '../lib/auth'
import type { ViewHeader } from './types'

const card: CSSProperties = {
  background: 'var(--spira-white)', border: '1px solid var(--spira-line)', borderRadius: 16, padding: '18px 20px',
}

export interface PatientFichaViewProps {
  patient: PatientRow
  protocol: ProtocolRow
  /** Clave del módulo activo ('track' | 'pharma' | …). La ficha es compartida: la gestión de
   *  medicación solo se habilita en el contexto de Pharma (ver canManagePharma abajo). */
  moduleKey: string
  accent: string
  accentSolid: string
  canWrite: boolean
  setHeader?: (header: ViewHeader | null) => void
  /** Volver al detalle del protocolo (clic en el crumb del código de protocolo). */
  onBack: () => void
  /** Volver a la grilla de protocolos (clic en el crumb "Protocolos"). */
  onGoList: () => void
  /** Refetch de la lista de pacientes tras editar (los datos viven en usePatients del padre). */
  onPatientUpdated: () => void
  /**
   * Ir a «Visitas» parado en el día de una visita, con ella abierta. Lo pasa el contenedor, que es
   * el que sabe navegar entre submódulos; sin esto el modal de la visita no ofrece el salto.
   */
  onVerVisitaEnElDia?: (visitId: string, dia: string) => void
}

/** Ficha del paciente: demográficos + contexto + adherencia + alertas | próxima visita + cronograma. */
export function PatientFichaView(props: PatientFichaViewProps) {
  const { patient, protocol, moduleKey, accent, accentSolid, canWrite, setHeader, onBack, onGoList, onPatientUpdated, onVerVisitaEnElDia } = props
  const visitsQ = usePatientVisits(patient.id, protocol.id)
  const alertsQ = useVisitAlerts()
  // La gestión de "Medicación asignada" es de Pharma (operator+) Y solo en el contexto del módulo
  // Pharma: la ficha del paciente es compartida con Track, y ahí la medicación es un dato más de
  // solo lectura. Sin el candado de módulo, un usuario con rol pharma veía la edición también
  // parado en Track (la RLS igual la protege server-side, pero como affordance no corresponde).
  const { hasMinRole } = useAuth()
  const canManagePharma = moduleKey === 'pharma' && hasMinRole('pharma', 'operator')
  const [modal, setModal] = useState<null | 'reschedule' | 'register' | 'edit' | 'alerts'>(null)
  // Detalle de una visita del cronograma: el MISMO componente que abre la vista del día
  // (VisitDetail), sincronizado por leer de la misma vista. Guardamos el id y el detalle se
  // trae sus propios datos.
  /* La visita abierta va con push —abrirla es navegar y el atrás tiene que cerrarla—, y con el UUID
     COMPLETO, no corto: `VisitDetail` trae sus propios datos por id, así que puede abrir una visita
     que NO esté entre las filas cargadas. Un identificador corto habría que resolverlo contra esas
     filas y rompería justamente eso (ver el comentario de `useUrlEntity` en TrackAlertsView.tsx, el
     que explica por qué usa el id completo). */
  const [openVisitId, setOpenVisitId] = useUrlEntity('visita')

  /* Enrolamiento del protocolo en contexto: de ahí salen el médico y la fecha de
     ingreso (sin depender de que existan visitas). */
  const enrollment = patient.enrollments.find((e) => e.protocol?.id === protocol.id)

  const rows = visitsQ.data ?? []
  const current = currentVisit(rows)
  /* "Visita actual" del card derecho = la última visita REALIZADA HOY (real_date = hoy), sea
     programada o SUELTA (una VNP, retest, firma/screening pre-rando): el paciente puede venir un
     día solo a una VNP y esa ES su visita actual. Por eso miramos TODAS las visitas (no solo el
     cronograma). Si hoy no se realizó ninguna (estamos entre visitas) no hay "actual": se muestra
     la PRÓXIMA programada con el rótulo "Próxima visita". */
  const realizedToday = orderVisits(rows).filter((v) => v.real_date === todayISO())
  const statVisit = realizedToday.length ? realizedToday[realizedToday.length - 1] : current
  const statIsActual = realizedToday.length > 0
  const statStudyTime = statVisit ? studyTime(statVisit) : null
  const adh = adherence(rows)
  const canAct = canWrite && current !== null && current.real_date === null

  /* Para el flujo "Agendar visita": tipos ya registrados (filtra el selector). */
  const usedKinds = rows.map((r) => r.kind)

  /* El IVRS del ESTUDIO en contexto, no el del paciente: la misma persona en dos estudios tiene dos
     números, y ésta es la ficha de uno solo (ver `ivrsDelEstudio`). */
  const ivrs = ivrsDelEstudio(patient, protocol.id)

  /* Encabezado contextual del shell: Protocolos (→ grilla) › CÓDIGO (→ detalle) › PACIENTE,
     + Reprogramar / Agendar visita a la derecha. Callbacks por ref (deps primitivas).
     Agendar visita está disponible siempre (pre y post rando); Reprogramar solo si hay una
     visita programada actual. */
  const cb = useRef({ onGoList, onBack, reschedule: () => setModal('reschedule'), register: () => setModal('register') })
  cb.current = { onGoList, onBack, reschedule: () => setModal('reschedule'), register: () => setModal('register') }
  useEffect(() => {
    setHeader?.({
      rootOnClick: () => cb.current.onGoList(),
      crumbs: [
        { label: protocol.code, mono: true, onClick: () => cb.current.onBack() },
        { label: ivrs ?? 'Sin IVRS', mono: true },
      ],
      actions: [
        ...(canAct ? [{ key: 'reprogramar', label: 'Reprogramar', icon: 'calendar' as const, onClick: () => cb.current.reschedule() }] : []),
        ...(canWrite ? [{ key: 'registrar', label: 'Agendar visita', icon: 'clipboardCheck' as const, primary: true, onClick: () => cb.current.register() }] : []),
      ],
    })
    return () => setHeader?.(null)
  }, [protocol.code, ivrs, canAct, canWrite, setHeader])
  const enrollmentDate = enrollment?.enrollment_date ?? null
  const age = ageFromBirth(patient.birth_date)

  const alerts = (alertsQ.data ?? []).filter((a) => a.patient_id === patient.id)
  const alertColor = alerts.some((a) => a.computed_status === 'ventana_vencida')
    ? VISIT_STATES.ventana_vencida.color
    : VISIT_STATES.item_vencido.color

  const row = (label: string, value: ReactNode) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 13 }}>
      <span style={{ color: 'var(--spira-muted)' }}>{label}</span>
      <span style={{ fontWeight: 600, textAlign: 'right' }}>{value}</span>
    </div>
  )
  const dash = <span style={{ color: 'var(--spira-muted)' }}>—</span>

  /* Cuánto queda de ventana. Dice «faltan N d» y no «ventana N d» (Director, 2026-09-15): al lado de
     una fecha futura, el dato que se busca es cuánto queda, y «ventana» nombra el concepto en vez de
     responder. Dos casos no entran en esa frase y se dicen aparte: cuando ya cerró («ventana
     vencida» — no faltan días, sobran) y el día que cierra («vence hoy», que con «faltan 0 d» se
     leería como un error de cuenta). */
  let ventanaTxt = '—'
  if (current && current.real_date === null && current.window_end) {
    const d = daysDiffISO(todayISO(), current.window_end)
    ventanaTxt = d < 0 ? 'ventana vencida' : d === 0 ? 'vence hoy' : `faltan ${d} d`
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1 }}>
      {/* el breadcrumb (Protocolos › CÓDIGO › PACIENTE) y los botones Reprogramar/Registrar
          viven en el encabezado del shell (registrado por el efecto de arriba). */}
      {modal === 'reschedule' && current && (
        <RescheduleModal visit={current} accentSolid={accentSolid} onClose={() => setModal(null)} onDone={() => { setModal(null); visitsQ.refetch() }} />
      )}
      {modal === 'register' && enrollment && (
        <RegisterVisitFlow
          enrollmentId={enrollment.id}
          protocolId={protocol.id}
          randomizationDate={enrollment.randomization_date}
          usedKinds={usedKinds}
          referenceVisits={rows}
          accentSolid={accentSolid}
          onClose={() => setModal(null)}
          onDone={() => { setModal(null); visitsQ.refetch() }}
        />
      )}
      {modal === 'edit' && (
        <EditPatientForm
          patient={patient}
          accentSolid={accentSolid}
          onClose={() => setModal(null)}
          onUpdated={() => { setModal(null); onPatientUpdated(); visitsQ.refetch() }}
          onDeleted={() => { setModal(null); onPatientUpdated(); onBack() }}
        />
      )}
      {modal === 'alerts' && (
        <Modal title="Alertas del paciente" onClose={() => setModal(null)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {alerts.map((a) => {
              const c = VISIT_STATES[a.computed_status].color
              const motivo = a.computed_status === 'ventana_vencida' ? `Ventana vencida · ${visitTitle(a)}` : `Reporte de procedimiento vencido · ${visitTitle(a)}`
              return (
                <div key={a.id} style={{ display: 'flex', gap: 11, padding: '12px 13px', borderRadius: 11, background: c + '0E', border: `1px solid ${c}30` }}>
                  <Icon name={a.computed_status === 'ventana_vencida' ? 'alert' : 'clock'} size={18} color={c} style={{ flex: '0 0 auto', marginTop: 1 }} />
                  <div style={{ fontSize: 13, color: 'var(--spira-ink)', lineHeight: 1.4 }}>{motivo}</div>
                </div>
              )
            })}
          </div>
        </Modal>
      )}

      {openVisitId && (
        <VisitDetail
          visitId={openVisitId}
          accent={accent}
          onClose={() => setOpenVisitId(null)}
          /* Era la única de las siete pantallas que abren este modal sin `onChanged`: avanzar una
             etapa o editar el encabezado desde acá no refrescaba el cronograma, el resumen de arriba
             ni el botón de alertas, y la ficha quedaba mostrando la visita como estaba antes. */
          onChanged={() => { visitsQ.refetch(); alertsQ.refetch() }}
          onVerEnElDia={onVerVisitaEnElDia}
        />
      )}

      {/* cuerpo */}
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '320px 1fr', gap: 14, minHeight: 0 }}>
        {/* ficha lateral */}
        <div style={{ ...card, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'auto' }}>
          {/* El título de la ficha es la IDENTIDAD y nada más: nombre + número de paciente
              (mismo criterio que el header del modal de visita; el nombre manda y el IVRS baja a
              identificador secundario, en mono). El médico tratante colgaba acá como una tercera
              línea sin rótulo —se leía como un dato huérfano, y con el campo vacío era un "—"
              suelto que no decía nada—: ahora vive abajo, rotulado (pedido del Director).

              El nombre se lleva el RENGLÓN ENTERO y el badge de estado baja a la línea del IVRS.
              Antes compartían fila: entre el badge y su gap le comían 96px de los 278 de la
              ficha, así que al nombre le quedaban 182px y cualquiera de más de ~19 caracteres
              partía en dos, con el badge flotando al medio. Con la fila completa entra la
              enorme mayoría; los pocos que igual no entren cortan con `balance`, que reparte
              las dos líneas en vez de dejar una palabra sola colgando. */}
          <div>
            {/* El estado es del PACIENTE (activo/inactivo); el de la VISITA vive en el cronograma.
                Es el mismo punto de la esquina de la tarjeta en el listado, y acá también va arriba a
                la derecha, a la altura del nombre (decisión del Director, 2026-09-14: la píldora
                debajo, junto al IVRS, no le gustaba). El nombre sigue quedándose con el ancho: el
                punto se lleva 16px + 10 de separación, no los 96 de la píldora vieja que partían los
                nombres de más de ~19 letras. La caja del punto mide lo mismo que el renglón del
                nombre (19px × 1.2 ≈ 23) para que quede centrado con la PRIMERA línea aunque el nombre
                parta en dos. `marginRight: -4` saca la mitad sobrante de la caja de 16px hacia el
                padding de la card: así es el PUNTO, y no su caja, el que termina al ras de la
                columna de valores de abajo. */}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <div style={{ flex: 1, minWidth: 0, fontFamily: 'var(--spira-font-display)', fontSize: 19, fontWeight: 700, letterSpacing: '-.02em', color: 'var(--spira-ink)', lineHeight: 1.2, textWrap: 'balance' }}>{patient.full_name}</div>
              <EstadoPaciente estado={patient.status} style={{ height: 23, marginRight: -4 }} />
            </div>
            <div className="spira-mono" style={{ fontSize: 13.5, color: 'var(--spira-muted)', whiteSpace: 'nowrap', marginTop: 5 }}>{ivrs ?? 'Sin IVRS'}</div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 11, marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--spira-line)' }}>
            {row('Edad', age !== null ? `${age} años` : dash)}
            {row('Sexo', patient.sex ? (SEX_LABELS[patient.sex] ?? patient.sex) : dash)}
            {row('Fertilidad', patient.fertility ? (FERTILITY_LABELS[patient.fertility] ?? patient.fertility) : dash)}
            {/* Médico tratante del paciente (`patients.treating_physician`), no el investigador
                principal del protocolo — ese sigue abajo, en el bloque del estudio. */}
            {row('Médico asignado', patient.treating_physician || dash)}
            {row('Fecha de ingreso', enrollmentDate ? formatAR(enrollmentDate) : dash)}
            {row('Código interno', protocol.internal_code || dash)}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 11, marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--spira-line)' }}>
            {row('Protocolo', <span><span className="spira-mono">{protocol.code}</span> · {protocol.name}</span>)}
            {row('Sponsor', protocol.sponsor || dash)}
            {row('Investigador', protocol.principal_investigator || dash)}
            {row('Especialidad', protocol.specialty || dash)}
          </div>

          <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--spira-line)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--spira-muted)', marginBottom: 7 }}>
              <span>Adherencia del paciente</span>
              <span style={{ fontWeight: 600, color: accent, fontVariantNumeric: 'tabular-nums' }}>{adh.pct}%</span>
            </div>
            <div style={{ height: 7, borderRadius: 'var(--spira-radius-pill)', background: 'var(--spira-line)', overflow: 'hidden' }}>
              <div style={{ width: `${adh.pct}%`, height: '100%', background: accent, borderRadius: 'var(--spira-radius-pill)' }} />
            </div>
          </div>

          {/* Medicación: información del paciente (solo lectura); el botón "Editar medicación"
              (abre un modal) aparece solo en Pharma. Vive en la ficha lateral, no en la columna
              derecha. */}
          <PatientMedicationsCard
            enrollmentId={enrollment?.id ?? null}
            protocolId={protocol.id}
            accent={accent}
            accentSolid={accentSolid}
            canManage={canManagePharma}
          />

          {/* acciones de la ficha: editar paciente + alertas (en botón con contador) */}
          <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--spira-line)', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {/* Realce en `.spira-card-link`, no en `onMouseEnter`: la misma corrección que su gemelo
                «Editar medicación» (`PatientMedicationsCard`), que en Farmacia está justo arriba y
                tiene que reaccionar igual. En reposo sólo se pisa `borderColor` (longhand) para
                conservar el `line-2`; sin `transition` inline, que le ganaría a la de la clase. */}
            {canWrite && (
              <button
                className="spira-card-link"
                onClick={() => setModal('edit')}
                style={{ width: '100%', height: 40, borderRadius: 10, borderColor: 'var(--spira-line-2)', background: 'var(--spira-surface)', fontFamily: 'var(--spira-font-text)', fontSize: 13, fontWeight: 600, color: 'var(--spira-ink)', display: 'flex', alignItems: 'center', gap: 10, padding: '0 13px' }}
              >
                <Icon name="pencil" size={16} color={accent} />
                <span style={{ flex: 1, textAlign: 'left' }}>Editar paciente</span>
                <Icon name="chevronRight" size={15} color="var(--spira-faint)" />
              </button>
            )}
            {alerts.length > 0 ? (
              <button
                onClick={() => setModal('alerts')}
                style={{ width: '100%', height: 40, borderRadius: 10, border: `1px solid ${alertColor}40`, background: alertColor + '0E', cursor: 'pointer', fontFamily: 'var(--spira-font-text)', fontSize: 13, fontWeight: 600, color: alertColor, display: 'flex', alignItems: 'center', gap: 10, padding: '0 13px' }}
              >
                <Icon name="alert" size={16} color={alertColor} />
                <span style={{ flex: 1, textAlign: 'left' }}>Alertas ({alerts.length})</span>
                <Icon name="chevronRight" size={15} color={alertColor} />
              </button>
            ) : (
              <div style={{ width: '100%', height: 40, borderRadius: 10, border: '1px solid var(--spira-line)', background: 'var(--spira-surface)', fontSize: 13, fontWeight: 600, color: 'var(--spira-muted)', display: 'flex', alignItems: 'center', gap: 10, padding: '0 13px' }}>
                <Icon name="check" size={16} color="var(--spira-good)" />
                <span>Sin alertas activas</span>
              </div>
            )}
          </div>
        </div>

        {/* columna derecha */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minHeight: 0 }}>
          {visitsQ.error ? (
            <div style={{ ...card }}>
              <div style={{ fontSize: 13, color: 'var(--spira-acc-deep-danger)' }}>No pudimos cargar las visitas del paciente.</div>
            </div>
          ) : rows.length === 0 ? (
            <EmptyState accent={accent} icon="calendar" title="Sin visitas programadas" description="Este paciente no tiene cronograma de visitas todavía (el protocolo necesita un esquema de visitas)." />
          ) : (
            <>
              {/* próxima visita */}
              <div style={card}>
                {/* Alineados ARRIBA y no abajo (Director, 2026-09-15: «el día lo veo muy tirado para
                    abajo»). Con `flex-end` mandaba el bloque más alto —el de la derecha, que tiene
                    el renglón de la semana— y empujaba la fecha un renglón hacia abajo: los dos
                    datos principales del encabezado quedaban a distinta altura sin que nada lo
                    justifique. Arriba, los dos rótulos arrancan en la misma línea y la fecha y la
                    visita quedan enfrentadas. */}
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontSize: 11.5, color: 'var(--spira-muted)' }}>{current && current.real_date === null ? 'Próxima visita' : 'Última visita'}</div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 9, marginTop: 3 }}>
                      <span style={{ fontFamily: 'var(--spira-font-display)', fontWeight: 700, fontSize: 25, letterSpacing: '-0.02em', color: current ? (VISIT_STATES[current.computed_status].color === '#7C8C87' ? 'var(--spira-ink)' : VISIT_STATES[current.computed_status].color) : 'var(--spira-ink)' }}>
                        {current && current.estimated_date ? dayLabel(current.estimated_date) : '—'}
                      </span>
                      {ventanaTxt !== '—' && <span style={{ fontSize: 13, color: 'var(--spira-ink-soft)' }}>{ventanaTxt}</span>}
                    </div>
                  </div>
                  {/* UN bloque, no dos columnas gemelas (Director, 2026-09-15: «la visita es más
                      importante que la semana»).

                      Antes eran dos stacks del mismo molde —rótulo chico + número grande— separados
                      28px, y el de la semana iba en 25px tinta contra los 19px de la visita: la
                      jerarquía quedaba al revés, y con la misma forma los dos se leían como datos
                      hermanos. Son la misma cosa: CUÁL visita, y en qué semana del estudio cae ésa.
                      Juntos en un bloque, el renglón tiene dos polos —la fecha a la izquierda, la
                      visita a la derecha— y la semana pasa a ser el pie de la visita. De paso deja
                      de haber una segunda columna que se caiga de renglón en pantalla angosta. */}
                  {statVisit && (
                    <div style={{ textAlign: 'right', minWidth: 0 }}>
                      <div style={{ fontSize: 11.5, color: 'var(--spira-muted)' }}>{statIsActual ? 'Visita actual' : 'Próxima visita'}</div>
                      {/* Identidad de la visita (código + nombre, o el label de la suelta: "VNP"),
                          no el conteo "V# de N": en la diaria importa CUÁL visita es, no cuántas van.

                          Va en 22px —debajo de los 24 de la fecha, arriba de todo lo demás— y en el
                          acento: el tamaño la ordena y el color la separa de la fecha, que se tiñe
                          por estado. El `title` lleva el nombre COMPLETO (el tooltip no compite por
                          ancho) mientras el rótulo colapsa el nombre que sólo repite la semana. */}
                      <div
                        title={visitTitle(statVisit)}
                        style={{ fontFamily: 'var(--spira-font-display)', fontWeight: 700, fontSize: 25, letterSpacing: '-0.02em', color: accent, marginTop: 3, maxWidth: 240, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                      >
                        {visitTitleConSemanaAparte(statVisit)}
                      </div>
                      {/* Día/Semana solo para visitas del cronograma (tienen offset). Las sueltas
                          —VNP, retest— no tienen tiempo de estudio → se omite (no "Semana —").
                          Ahora es el PIE de la visita: dice de esa visita en qué semana del estudio
                          cae, y por eso va con su palabra adelante en vez de un rótulo aparte. */}
                      {statStudyTime != null && (
                        <div className="spira-mono" style={{ fontSize: 14, color: 'var(--spira-ink-soft)', marginTop: 2, whiteSpace: 'nowrap' }}>
                          {statStudyTime.unit === 'dia' ? `Día ${statStudyTime.value}` : `Semana W${statStudyTime.value}`}
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <div style={{ marginTop: 18, paddingTop: 16, borderTop: '1px solid var(--spira-line)' }}>
                  <PdVisitFlow visits={rows} currentId={current?.id ?? null} accent={accent} />
                </div>
              </div>

              {/* cronograma */}
              <div style={{ ...card, padding: 0, flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '15px 20px', borderBottom: '1px solid var(--spira-line)' }}>
                  <Icon name="calendar" size={17} color={accent} />
                  <span style={{ fontFamily: 'var(--spira-font-display)', fontWeight: 700, fontSize: 16 }}>Cronograma de visitas</span>
                  <span style={{ marginLeft: 'auto', fontSize: 12.5, color: 'var(--spira-muted)' }}>{rows.length} visitas</span>
                </div>
                <div style={{ overflow: 'auto', padding: '6px 20px 14px' }}>
                  {/* Resalta la misma visita que el stat "Visita actual" (statVisit): la realizada
                      hoy si la hay, si no la próxima. Así el resaltado del cronograma coincide con
                      el "V# de N" de arriba a la derecha (no con `current`, que es solo la próxima). */}
                  <PdFullSchedule visits={rows} currentId={statVisit?.id ?? null} accent={accent} onOpen={setOpenVisitId} />
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
