import { useState } from 'react'
import type { CSSProperties } from 'react'
import { Modal } from '../../../components/Modal'
import { FormField, fieldInput } from '../../../components/FormField'
import { SearchableSelect } from '../../../components/SearchableSelect'
import { DateField } from '../../../components/DateField'
import { btnOutline } from '../../../components/buttons'
import { usePatientVisits, useProtocolVisits } from '../../../data/visits'
import { usePorRetomar } from '../../../data/pendientes'
import { useSchedulableDefinitions } from '../../../data/visitDefinitions'
import { availableEventKinds } from '../../../data/visitEvents'
import { formatAR, todayISO, yearsFromTodayISO } from '../../../lib/dates'
import { agruparPorRetomar, pacientesDelEstudio, visitasParaRetest, visitasParaTraer } from '../retomar'
import { eleccionInicial, fechaEstimadaDelCuadro, opcionesDeAgendar, tieneCuadro } from './opciones'
import type { PacienteFijo, Preseleccion } from './opciones'
import { FormContinuarPendientes } from './FormContinuarPendientes'
import { FormRetest } from './FormRetest'
import { FormTraerVisita } from './FormTraerVisita'
import { FormVnp } from './FormVnp'
import { FormVisitaDelCuadro } from './FormVisitaDelCuadro'
import { FormVisitaSuelta } from './FormVisitaSuelta'

/** Un estudio en el que la persona puede agendar desde Visitas. */
export interface ProtocoloParaAgendar {
  id: string
  code: string
  name: string
}

interface Comunes {
  accent: string
  onClose: () => void
  /** Se agendó: `mensaje` es el «Listo…» para quien lo quiera mostrar. */
  onDone: (mensaje: string) => void
}

export type AgendarVisitaModalProps = Comunes & (
  | { modo: 'dia'; dia: string; protocolos: readonly ProtocoloParaAgendar[] }
  | { modo: 'paciente'; paciente: PacienteFijo; preseleccion?: Preseleccion }
)

/**
 * ┌─ «Agendar visita»: un flujo, dos lugares (v0145) ────────────────────────────────────────────┐
 *
 * REEMPLAZA a `RegisterVisitFlow` en todos sus usos —la ficha, el «recitar» de la randomización,
 * el «Agendar» de Pendientes— y suma Visitas («Agregar visita»). Un solo flujo, sin dos versiones
 * que diverjan (spec §3). El mismo paso «¿Qué vas a hacer?» y los mismos formularios; cambia sólo lo
 * que el contexto ya fija:
 *  · `dia` (Visitas): primero el estudio, la fecha es el día que se mira y las listas traen a todos
 *    los pacientes de ese estudio;
 *  · `paciente`: el paciente y la inscripción vienen dados (arriba, en el subtítulo, con el nombre en
 *    tinta y el IVRS en mono), y la fecha se elige, para dejarlo agendado a futuro.
 * Qué opciones hay en cada modo lo deciden las reglas puras de `opciones.ts`, con test.
 *
 * El cuerpo es un componente aparte, montado con `key` por estudio (o inscripción): cambiar de
 * estudio lo vuelve a montar, y con él sus consultas. Sin eso, el stale-while-revalidate de
 * `useSupabaseQuery` mostraba un momento las visitas —y los números— del estudio anterior.
 *
 * LA FECHA ES UNA SOLA para todas las opciones y vive acá, no en cada formulario: cambiar de opción
 * no la pierde, y la sugerencia del cuadro («estimada según el cronograma») se ve donde está la fecha.
 * └────────────────────────────────────────────────────────────────────────────────────────────┘
 */
export function AgendarVisitaModal(props: AgendarVisitaModalProps) {
  const { accent, onClose, onDone } = props
  const [protocolId, setProtocolId] = useState(
    props.modo === 'dia' && props.protocolos.length === 1 ? props.protocolos[0].id : '',
  )

  return (
    <Modal
      title={props.modo === 'dia' ? 'Agregar visita' : 'Agendar visita'}
      subtitle={props.modo === 'paciente' ? <IdentidadFija paciente={props.paciente} /> : undefined}
      onClose={onClose}
      maxWidth={520}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {props.modo === 'dia' ? (
          <>
            <FormField label="Estudio">
              <SearchableSelect
                value={protocolId}
                onChange={setProtocolId}
                options={props.protocolos.map((p) => ({ value: p.id, label: `${p.code} — ${p.name}` }))}
                placeholder="Elegí un estudio"
                searchPlaceholder="Buscar estudio…"
                entity="estudio"
                autoFocus={props.protocolos.length > 1}
              />
            </FormField>
            {protocolId ? (
              <Cuerpo
                key={protocolId}
                contexto={{ modo: 'dia', dia: props.dia, protocolId }}
                accent={accent}
                onClose={onClose}
                onDone={onDone}
              />
            ) : (
              <SoloCerrar rotulo="Cancelar" onClose={onClose} />
            )}
          </>
        ) : (
          <Cuerpo
            key={props.paciente.enrollmentId}
            contexto={{ modo: 'paciente', paciente: props.paciente, preseleccion: props.preseleccion }}
            accent={accent}
            onClose={onClose}
            onDone={onDone}
          />
        )}
      </div>
    </Modal>
  )
}

type Contexto =
  | { modo: 'dia'; dia: string; protocolId: string }
  | { modo: 'paciente'; paciente: PacienteFijo; preseleccion?: Preseleccion }

function Cuerpo({ contexto, accent, onClose, onDone }: Comunes & { contexto: Contexto }) {
  const paciente = contexto.modo === 'paciente' ? contexto.paciente : null
  const dia = contexto.modo === 'dia' ? contexto.dia : null
  const protocolId = contexto.modo === 'dia' ? contexto.protocolId : contexto.paciente.protocolId
  const preseleccion = contexto.modo === 'paciente' ? contexto.preseleccion : undefined

  const [picked, setPicked] = useState<string | null>(null)
  /** La fecha que se tocó (modo `paciente`). `null` = la sugerida: la estimada del cuadro, o hoy. */
  const [fechaElegida, setFechaElegida] = useState<string | null>(null)

  /* Cada modo lee lo suyo; el hook del otro recibe `null` y no consulta nada. Las visitas del
     paciente se leen ACÁ y no se reciben: así los cuatro lugares que abren el modal en modo
     `paciente` sólo tienen que decir quién es (el «recitar» antes no pasaba ninguna, y no sugería
     la fecha estimada). */
  const estudioQ = useProtocolVisits(dia ? protocolId : null)
  const pacienteQ = usePatientVisits(paciente?.patientId ?? null, paciente ? protocolId : null)
  const scheds = useSchedulableDefinitions(paciente ? protocolId : null)
  const retomarQ = usePorRetomar()

  const cargando = (paciente ? pacienteQ.loading || scheds.loading : estudioQ.loading) || retomarQ.loading
  const errorDeCarga = (paciente ? pacienteQ.error ?? scheds.error : estudioQ.error) ?? retomarQ.error

  const visitas = paciente
    ? (pacienteQ.data ?? []).filter((v) => v.enrollment_id === paciente.enrollmentId)
    : (estudioQ.data ?? [])
  const retomar = agruparPorRetomar(retomarQ.data?.marcas ?? [], retomarQ.data?.visitas ?? [])
    .filter((g) => (paciente ? g.visita.enrollment_id === paciente.enrollmentId : g.visita.protocol_id === protocolId))
  const traer = dia ? visitasParaTraer(visitas, dia) : []
  const defs = scheds.data ?? []

  const opciones = paciente
    ? opcionesDeAgendar({
        modo: 'paciente',
        definiciones: defs,
        randomizationDate: paciente.randomizationDate,
        kindsSueltos: availableEventKinds(paciente.randomizationDate, visitas.map((v) => v.kind), tieneCuadro(defs)),
        continuar: retomar.length,
      })
    : opcionesDeAgendar({ modo: 'dia', traer: traer.length, continuar: retomar.length })

  /* `choice` se DERIVA de las opciones actuales y no se congela en un useState (la misma razón que
     tenía `RegisterVisitFlow`): si la elección sigue siendo válida manda; si no, cae a la
     preselección. Congelada, una preselección que llega antes que sus datos quedaría perdida. */
  const choice = picked && opciones.some((o) => o.value === picked) ? picked : eleccionInicial(opciones, preseleccion)
  const eleccion = opciones.find((o) => o.value === choice)?.eleccion ?? null

  const defId = eleccion?.tipo === 'def' ? eleccion.defId : null
  const estimada = fechaEstimadaDelCuadro(defId ? defs.find((d) => d.id === defId) ?? null : null, visitas)
  /* `fechaElegida === ''` es el DateField vaciado A PROPÓSITO (emite '' al perder foco con el campo
     vacío, ver `commitText` en DateField.tsx) — distinto de `null` (todavía no se tocó, vale la
     sugerida). Vaciarlo no puede caer en silencio a la estimada o a hoy: sería agendar en una fecha
     que la persona borró adrede. `fecha` en `null` hace que `PieDelFormulario` bloquee «Agendar» y
     muestre «Elegí la fecha.» sin que ningún formulario llegue a llamar al RPC. */
  const fecha: string | null = dia ?? (fechaElegida === '' ? null : fechaElegida ?? estimada ?? todayISO())

  /* Las candidatas del retest usan la fecha YA RESUELTA (spec, no la fecha cruda): si se está
     agendando para el día del cronograma y no para hoy, un retest no puede repetir una visita
     fechada DESPUÉS de esa fecha elegida. Con la fecha vacía (a punto de bloquear el «Agendar») se
     usa hoy para no dejar la lista vacía — el formulario igual no va a poder confirmar sin fecha. */
  const retest = visitasParaRetest(visitas, fecha ?? todayISO())

  if (cargando) {
    return <div style={{ fontSize: 13.5, color: 'var(--spira-muted)', padding: '6px 0' }}>Cargando visitas…</div>
  }
  if (errorDeCarga) {
    return (
      <>
        <div style={{ fontSize: 13, color: 'var(--spira-acc-deep-danger)' }}>No pudimos cargar las visitas. Probá de nuevo.</div>
        <SoloCerrar rotulo="Cerrar" onClose={onClose} />
      </>
    )
  }

  const comunes = { accent, onCancel: onClose, onDone }

  return (
    <>
      {dia ? (
        <FormField label="Fecha">
          <div style={fechaFija}>{formatAR(dia)}</div>
          <div style={pista}>Es el día que estás mirando en Visitas.</div>
        </FormField>
      ) : (
        <FormField label="Fecha de la visita">
          <DateField value={fecha ?? ''} onChange={setFechaElegida} min={yearsFromTodayISO(-2)} max={yearsFromTodayISO(2)} />
          {estimada && fechaElegida === null && (
            <div style={pista}>Estimada según el cronograma: {formatAR(estimada)} · ajustala si hace falta.</div>
          )}
        </FormField>
      )}

      <FormField label="¿Qué vas a hacer?">
        <SearchableSelect
          value={choice}
          onChange={setPicked}
          options={opciones.map(({ value, label }) => ({ value, label }))}
          placeholder="Elegí una opción"
          searchPlaceholder="Buscar…"
          entity="opción"
          autoFocus={!dia && !preseleccion}
        />
      </FormField>

      {/* Cada formulario con `key` por opción: volver a una opción la empieza de cero, sin arrastrar
          lo que se había elegido en otra. */}
      {eleccion?.tipo === 'traer' && dia && (
        <FormTraerVisita key={choice} candidatas={traer} dia={dia} {...comunes} />
      )}
      {eleccion?.tipo === 'continuar' && (
        <FormContinuarPendientes
          key={choice}
          candidatas={retomar}
          fecha={fecha}
          conPaciente={!paciente}
          preseleccion={preseleccion?.tipo === 'continuar' ? preseleccion.origenId : null}
          {...comunes}
        />
      )}
      {eleccion?.tipo === 'retest' && (
        <FormRetest key={choice} candidatas={retest} protocolId={protocolId} fecha={fecha} conPaciente={!paciente} {...comunes} />
      )}
      {eleccion?.tipo === 'vnp' && (
        <FormVnp
          key={choice}
          enrollmentFijo={paciente?.enrollmentId ?? null}
          pacientes={paciente ? [] : pacientesDelEstudio(visitas)}
          protocolId={protocolId}
          fecha={fecha}
          {...comunes}
        />
      )}
      {eleccion?.tipo === 'def' && paciente && (
        <FormVisitaDelCuadro key={choice} enrollmentId={paciente.enrollmentId} defId={eleccion.defId} fecha={fecha} {...comunes} />
      )}
      {eleccion?.tipo === 'suelta' && paciente && (
        <FormVisitaSuelta key={choice} enrollmentId={paciente.enrollmentId} kind={eleccion.kind} fecha={fecha} {...comunes} />
      )}
      {!eleccion && <SoloCerrar rotulo="Cancelar" onClose={onClose} />}
    </>
  )
}

/** «Juan Pérez · TEST-001-017 · TEST-QA»: quién y en qué estudio, fijo, en el subtítulo del modal. */
function IdentidadFija({ paciente }: { paciente: PacienteFijo }) {
  return (
    <span>
      <span style={{ color: 'var(--spira-ink)', fontWeight: 600 }}>{paciente.patientName}</span>
      {' · '}
      <span className="spira-mono">{paciente.ivrs ?? 'Sin IVRS'}</span>
      {' · '}
      <span className="spira-mono">{paciente.protocolCode}</span>
    </span>
  )
}

function SoloCerrar({ rotulo, onClose }: { rotulo: string; onClose: () => void }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
      <button type="button" onClick={onClose} style={btnOutline}>{rotulo}</button>
    </div>
  )
}

/** La fecha de Visitas: se ve como un campo, pero no se edita (es el día que se mira). */
const fechaFija: CSSProperties = {
  ...fieldInput, display: 'flex', alignItems: 'center', background: 'var(--spira-surface)', color: 'var(--spira-ink-soft)',
}
const pista: CSSProperties = { marginTop: 4, fontSize: 12, color: 'var(--spira-muted)' }
