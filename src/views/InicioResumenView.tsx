import { useAuth } from '../lib/auth'
import { useVisitsForDay } from '../data/dayVisits'
import { useActiveAlerts } from '../data/alertDismissals'
import { useWeekVisits } from '../data/visits'
import { useProtocols } from '../data/protocols'
import { usePatients } from '../data/patients'
import { useReceptions } from '../data/pharma'
import { useDispensationBoard } from '../data/pharma/dispensations'
import { fueraDeVentana } from '../lib/visits'
import { addDaysISO, formatDayLong, todayISO, weekDates } from '../lib/dates'
import { SPIRA_VERSION } from '../lib/version'
import { MODULES } from '../modules/registry'
import { saludoDelDia } from './inicio/saludo'
import { BandaSaludo, CardFundacion, CardModulo, CardNovedades } from './inicio/piezas'
import type { Novedad } from './inicio/piezas'
import type { ViewProps } from './types'

/**
 * Inicio › Resumen — del handoff `docs/design_handoff_resumen/`.
 *
 * Banda de saludo, card institucional de la Fundación, los módulos operativos y la columna de
 * Novedades. NO lleva lista de visitas ni de alertas: eso vive en el resumen de COORDINACIÓN
 * (`docs/design_handoff_resumen_track/`), que es de quien coordina — a Farmacia o Laboratorio esas
 * listas no le dicen nada.
 *
 * QUÉ ES DATO REAL Y QUÉ NO, que en una app auditable importa más que la pantalla:
 * · las cifras de la banda, los números de clínica y los de cada módulo salen de consultas reales;
 * · las CREDENCIALES de la Fundación (+20 años, +120 estudios…) son copy institucional del sitio,
 *   no métrica calculada — el handoff pide confirmarlas antes de producción;
 * · lo que no tiene de dónde salir NO se dibuja: la píldora sin evento, la portada de Novedades y
 *   el toggle de "resumen por mail" (ver `piezas.tsx`).
 *
 * Sin gate global: la pantalla se pinta entera de entrada y cada número aparece cuando llega, con
 * un guion mientras viaja. Un cero mientras carga afirmaría que no hay ninguno.
 */
export function InicioResumenView({ onNavigate, onOpenAbout }: ViewProps) {
  const { profile } = useAuth()
  const hoy = todayISO()
  /* `weekDates` devuelve la semana HÁBIL en curso (lunes a viernes, cinco fechas), que es la
     noción de semana que ya usa el resto de la app. Nos quedamos con sus extremos. */
  const semana = weekDates()
  const semanaIni = semana[0]
  const semanaFin = semana[semana.length - 1]
  const hace30 = addDaysISO(hoy, -30)

  const day = useVisitsForDay(hoy)
  const alertsQ = useActiveAlerts()
  const protocols = useProtocols()
  const patients = usePatients()
  /* Una sola consulta para dos cosas: los números de clínica (últimos 30 días) y el "esta semana"
     de la card de Coordinación. El rango va de hace 30 días al fin de la semana en curso para que
     los dos entren; `useWeekVisits` toma cualquier rango, pese al nombre. */
  const rango = useWeekVisits(hace30, semanaFin > hoy ? semanaFin : hoy)
  const recep = useReceptions([], null)
  /* El tablero del día trae los pedidos ABIERTOS ('solicitada'/'preparando') más los atendidos hoy.
     Los abiertos son la cifra que el handoff pide en la banda y en la card de Farmacia. */
  const board = useDispensationBoard(hoy)

  /** Un guion mientras el dato viaja: mostrar 0 sería afirmar que no hay ninguno. */
  const dato = (cargando: boolean, n: number) => (cargando ? '—' : n)
  /* Los rótulos concuerdan con su número. El mock traía cifras de muestra siempre en plural
     ("5 dispensaciones pendientes"), así que el caso de uno no aparecía; con datos reales sí, y
     "1 dispensaciones" se lee como un descuido. */
  const plural = (n: number, sing: string, plur: string) => (n === 1 ? sing : plur)

  const visitasHoy = day.data?.length ?? 0
  const alertas = alertsQ.visitAlerts
  const ventanasVencidas = alertas.filter((a) => a.computed_status === 'ventana_vencida').length

  const rangoRows = rango.data ?? []
  const realizadas30 = rangoRows.filter((v) => v.real_date && v.real_date >= hace30)
  const enVentana = realizadas30.filter((v) => !fueraDeVentana(v.real_date, v.window_start, v.window_end)).length
  const pctVentana = realizadas30.length === 0 ? null : Math.round((enVentana / realizadas30.length) * 100)
  const estaSemana = rangoRows.filter(
    (v) => v.estimated_date && v.estimated_date >= semanaIni && v.estimated_date <= semanaFin,
  ).length

  const protocolosActivos = (protocols.data ?? []).filter((p) => p.status === 'activo').length
  const pacientesActivos = (patients.data ?? []).filter((p) => p.status === 'activo').length
  const porVerificar = (recep.data ?? []).filter((r) => r.status === 'pendiente').length
  const dispensacionesAbiertas = (board.data ?? []).filter(
    (d) => d.status === 'solicitada' || d.status === 'preparando',
  ).length

  const saludo = saludoDelDia(hoy)
  const nombre = (profile?.fullName ?? '').trim().split(/\s+/)[0]

  /* Novedades desde el changelog REAL de la app (`lib/version.ts`), que es la única fuente que
     existe hoy. No guarda fecha ni categoría, así que no se muestran: antes que inventar un
     "hace 2 días", va sin fecha. */
  const changelog = SPIRA_VERSION.changelog
  const destacada: Novedad | null = changelog[0]
    ? { etiqueta: `Producto · v${changelog[0].version}`, titulo: changelog[0].text }
    : null
  const secundarias: Novedad[] = changelog.slice(1, 3).map((c) => ({
    etiqueta: `v${c.version}`,
    titulo: c.text,
  }))

  const track = MODULES.find((m) => m.key === 'track')
  const pharma = MODULES.find((m) => m.key === 'pharma')

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 372px', gap: 16, alignItems: 'start' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <BandaSaludo
          fecha={formatDayLong(hoy)}
          saludo={nombre ? `Buen día, ${nombre}` : 'Buen día'}
          frase={saludo.frase}
          evento={saludo.evento}
          cifras={[
            { n: dato(day.loading, visitasHoy), rotulo: `${plural(visitasHoy, 'visita', 'visitas')} hoy` },
            {
              n: dato(board.loading, dispensacionesAbiertas),
              rotulo: <>{plural(dispensacionesAbiertas, 'dispensación', 'dispensaciones')}<br />{plural(dispensacionesAbiertas, 'pendiente', 'pendientes')}</>,
            },
            {
              n: dato(alertsQ.loading, ventanasVencidas),
              rotulo: <>{plural(ventanasVencidas, 'ventana', 'ventanas')}<br />{plural(ventanasVencidas, 'vencida', 'vencidas')}</>,
              tono: '#F0BFB4',
            },
          ]}
        />

        <CardFundacion
          credenciales={[
            { cifra: '+20', rotulo: 'años de experiencia' },
            { cifra: '+120', rotulo: 'estudios realizados' },
            { cifra: '+5.000', rotulo: 'pacientes en ensayos' },
            { cifra: '+40', rotulo: 'sponsors confían' },
          ]}
          numeros={[
            { cifra: dato(patients.loading, pacientesActivos), rotulo: `${plural(pacientesActivos, 'paciente', 'pacientes')} en seguimiento` },
            { cifra: dato(protocols.loading, protocolosActivos), rotulo: `${plural(protocolosActivos, 'protocolo activo', 'protocolos activos')}` },
            { cifra: dato(rango.loading, realizadas30.length), rotulo: `${plural(realizadas30.length, 'visita realizada', 'visitas realizadas')}` },
            {
              cifra: rango.loading || pctVentana === null ? '—' : `${pctVentana}%`,
              rotulo: 'visitas dentro de ventana',
              /* `acc-deep-good` y no `good`: el verde plano da 4.02:1 sobre la card oscura y esto
                 es una cifra, o sea texto. La familia acc-deep tiene variante ACLARADA para
                 oscuro (#A9D9A6), que es justo para lo que existe. */
              tono: 'var(--spira-acc-deep-good)',
            },
          ]}
        />

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 14 }}>
          {track && (
            <CardModulo
              nombre={track.name}
              bajada="Agenda, visitas y alertas"
              icono="activity"
              acento="var(--spira-track)"
              chipFondo="rgba(46,125,116,.13)"
              onClick={() => onNavigate?.('track', 'resumen')}
              cifras={[
                { n: dato(day.loading, visitasHoy), rotulo: `${plural(visitasHoy, 'visita', 'visitas')} hoy` },
                { n: dato(rango.loading, estaSemana), rotulo: 'esta semana' },
                {
                  n: dato(alertsQ.loading, alertas.length),
                  rotulo: plural(alertas.length, 'alerta', 'alertas'),
                  /* `acc-deep-danger` y no `danger`: el rojo plano da 2.77:1 sobre la card oscura,
                     que es texto ilegible. La variante de oscuro es un salmón aclarado. */
                  tono: alertas.length > 0 ? 'var(--spira-acc-deep-danger)' : undefined,
                },
              ]}
            />
          )}
          {pharma && (
            <CardModulo
              nombre={pharma.name}
              bajada="Recepción, stock y dispensación"
              icono="pill"
              acento="var(--spira-pharma)"
              chipFondo="rgba(15,95,87,.11)"
              onClick={() => onNavigate?.('pharma', 'recepcion')}
              /* Dos cifras y no tres: "lote por vencer" necesita una consulta de vencimientos que
                 todavía no existe, y un número inventado en Farmacia es justo lo que no puede
                 pasar. Entra cuando esté la consulta. */
              cifras={[
                { n: dato(recep.loading, porVerificar), rotulo: 'por verificar' },
                { n: dato(board.loading, dispensacionesAbiertas), rotulo: plural(dispensacionesAbiertas, 'pendiente', 'pendientes') },
              ]}
            />
          )}
        </div>
      </div>

      <CardNovedades
        destacada={destacada}
        secundarias={secundarias}
        /* "Ver todas" abre el popover Acerca de del pie del riel, que es donde vive el
           changelog completo. No hay una pantalla de novedades: ese popover ES la pantalla. */
        onVerTodas={() => onOpenAbout?.()}
      />
    </div>
  )
}
