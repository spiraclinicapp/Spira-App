import { useAuth } from '../lib/auth'
import { useVisitsForDay } from '../data/dayVisits'
import { useActiveAlerts } from '../data/alertDismissals'
import { useWeekVisits } from '../data/visits'
import { useProtocols } from '../data/protocols'
import { usePatients } from '../data/patients'
import { personaActiva } from '../lib/inscripcion'
import { usePendingReceptionsCount } from '../data/pharma'
import { useDispensationBoard } from '../data/pharma/dispensations'
import { fueraDeVentana } from '../lib/visits'
import { addDaysISO, formatDayLong, todayISO, weekDates } from '../lib/dates'
import { SPIRA_VERSION } from '../lib/version'
import { MODULES } from '../modules/registry'
import { saludoDelDia } from './inicio/saludo'
import { deMisModulos, modulosDelResumen } from './inicio/alcance'
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
 * CADA QUIEN VE SUS MÓDULOS (2026-09-21): las cards de módulo, las cifras de la banda y los números
 * de clínica aparecen sólo si tenés un módulo que los pueda calcular, con la misma regla que el
 * riel. El porqué y el test están en `inicio/alcance.ts`. La identidad de la Fundación (logo y
 * credenciales) queda para todos: es la institución, no un dato de ningún módulo.
 *
 * Sin gate global: la pantalla se pinta entera de entrada y cada número aparece cuando llega, con
 * un guion mientras viaja. Un cero mientras carga afirmaría que no hay ninguno.
 *
 * LA PANTALLA CIERRA COMO UN RECTÁNGULO (2026-09-09): el borde de abajo lo marcan las cards de
 * módulo y la columna de Novedades llega hasta ahí, con el bloque de feedback al pie. Cómo se
 * sostiene ese límite está en la celda derecha, más abajo.
 */
export function InicioResumenView({ onNavigate, onOpenAbout, onOpenFeedback }: ViewProps) {
  const { profile, modules } = useAuth()
  const visibles = modulosDelResumen(modules, MODULES)
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
  /* Un CONTEO en la base, no la lista: la lista tiene techo de 500 y contar pendientes sobre ella
     dejaba afuera a las más viejas. Ver `usePendingReceptionsCount`. */
  const pendientesRecep = usePendingReceptionsCount()
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
  /* Personas con al menos una participación abierta. Antes era `patients.status`, que quedó legacy
     con la 0127 — ver `personaActiva`, que además cuenta como activa a la persona recién dada de
     alta y todavía sin inscribir a ningún estudio. */
  const pacientesActivos = (patients.data ?? []).filter(personaActiva).length
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
    /* `alignItems: 'stretch'` (el default, escrito) y no el `'start'` de antes: la columna de
       Novedades tiene que llegar hasta el pie de las cards de módulo para que el Resumen cierre
       como un rectángulo — pedido del Director (2026-09-09). El alto lo manda SIEMPRE la columna
       izquierda; ver el comentario de la celda derecha. */
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 372px', gap: 16, alignItems: 'stretch' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <BandaSaludo
          fecha={formatDayLong(hoy)}
          saludo={nombre ? `Buen día, ${nombre}` : 'Buen día'}
          frase={saludo.frase}
          evento={saludo.evento}
          cifras={deMisModulos([
            { modulos: ['track'], n: dato(day.loading, visitasHoy), rotulo: `${plural(visitasHoy, 'visita', 'visitas')} hoy` },
            {
              modulos: ['pharma'],
              n: dato(board.loading, dispensacionesAbiertas),
              rotulo: <>{plural(dispensacionesAbiertas, 'dispensación', 'dispensaciones')}<br />{plural(dispensacionesAbiertas, 'pendiente', 'pendientes')}</>,
            },
            {
              modulos: ['track'],
              n: dato(alertsQ.loading, ventanasVencidas),
              rotulo: <>{plural(ventanasVencidas, 'ventana', 'ventanas')}<br />{plural(ventanasVencidas, 'vencida', 'vencidas')}</>,
              tono: '#F0BFB4',
            },
          ], visibles)}
        />

        <CardFundacion
          credenciales={[
            { cifra: '+20', rotulo: 'años de experiencia' },
            { cifra: '+120', rotulo: 'estudios realizados' },
            { cifra: '+5.000', rotulo: 'pacientes en ensayos' },
            { cifra: '+40', rotulo: 'sponsors confían' },
          ]}
          /* Pacientes y protocolos los leen los dos módulos, cada uno sobre su alcance (0139); las
             visitas, sólo Coordinación — a Farmacia la RLS de `patient_visits` le da cero filas. */
          numeros={deMisModulos([
            {
              modulos: ['track', 'pharma'],
              cifra: dato(patients.loading, pacientesActivos),
              rotulo: `${plural(pacientesActivos, 'paciente', 'pacientes')} en seguimiento`,
            },
            {
              modulos: ['track', 'pharma'],
              cifra: dato(protocols.loading, protocolosActivos),
              rotulo: `${plural(protocolosActivos, 'protocolo activo', 'protocolos activos')}`,
            },
            {
              modulos: ['track'],
              cifra: dato(rango.loading, realizadas30.length),
              rotulo: `${plural(realizadas30.length, 'visita realizada', 'visitas realizadas')}`,
            },
            {
              modulos: ['track'],
              cifra: rango.loading || pctVentana === null ? '—' : `${pctVentana}%`,
              rotulo: 'visitas dentro de ventana',
              /* `acc-deep-good` y no `good`: el verde plano da 4.02:1 sobre la card oscura y esto
                 es una cifra, o sea texto. La familia acc-deep tiene variante ACLARADA para
                 oscuro (#A9D9A6), que es justo para lo que existe. */
              tono: 'var(--spira-acc-deep-good)',
            },
          ], visibles)}
        />

        {/* Una columna por módulo visible: con uno solo, su card toma la fila entera (decisión del
            Director, 2026-09-21) — a media fila dejaba un hueco a la derecha y el Resumen dejaba de
            cerrar como un rectángulo. Sin ninguno (gerencia sola), la fila no se dibuja. */}
        {visibles.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${visibles.length}, minmax(0, 1fr))`, gap: 14 }}>
            {track && visibles.includes('track') && (
              <CardModulo
                nombre={track.name}
                bajada="Agenda, visitas y pendientes"
                icono="activity"
                acento="var(--spira-track)"
                chipFondo="rgba(46,125,116,.13)"
                onClick={() => onNavigate?.('track', 'resumen')}
                cifras={[
                  { n: dato(day.loading, visitasHoy), rotulo: `${plural(visitasHoy, 'visita', 'visitas')} hoy` },
                  { n: dato(rango.loading, estaSemana), rotulo: 'esta semana' },
                  {
                    n: dato(alertsQ.loading, alertas.length),
                    rotulo: plural(alertas.length, 'pendiente', 'pendientes'),
                    /* `acc-deep-danger` y no `danger`: el rojo plano da 2.77:1 sobre la card oscura,
                       que es texto ilegible. La variante de oscuro es un salmón aclarado. */
                    tono: alertas.length > 0 ? 'var(--spira-acc-deep-danger)' : undefined,
                  },
                ]}
              />
            )}
            {pharma && visibles.includes('pharma') && (
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
                  /* Sin conteo (cargando o error) va el guion: un 0 diría que no hay ninguna. */
                  { n: pendientesRecep.n ?? '—', rotulo: 'por verificar' },
                  { n: dato(board.loading, dispensacionesAbiertas), rotulo: plural(dispensacionesAbiertas, 'pendiente', 'pendientes') },
                ]}
              />
            )}
          </div>
        )}
      </div>

      {/* La celda de Novedades: `relative` con la card en `absolute inset: 0`.
          Parece un rodeo y es lo que fija el CUADRO. Una card normal en la celda haría que la
          grilla mida la fila por la MÁS ALTA de las dos columnas: el día que una novedad se
          estire a cuatro renglones, la que quedaría colgando con un hueco al pie sería la
          izquierda, o sea el mismo desprolijo al revés. Sacando la card del flujo, la fila la
          mide siempre la columna izquierda —las cards de módulo son el borde de abajo, como se
          pidió— y la card se estira a ese alto exacto; si su contenido no entra, scrollea
          adentro (ver `CardNovedades`). El `minHeight` es el piso para que el panel no se
          aplaste si algún día la izquierda queda muy corta. */}
      <div style={{ position: 'relative', minHeight: 340 }}>
        <div style={{ position: 'absolute', inset: 0 }}>
          <CardNovedades
            destacada={destacada}
            secundarias={secundarias}
            /* "Ver todas" abre el popover Acerca de del pie del riel, que es donde vive el
               changelog completo. No hay una pantalla de novedades: ese popover ES la pantalla. */
            onVerTodas={() => onOpenAbout?.()}
            /* El mismo modal "Dar feedback" que el pie del popover Acerca de: un solo camino,
               que ya escribe en la base por `submit_feedback`. Si el shell no lo pasa, el bloque
               del pie no se dibuja. */
            onFeedback={onOpenFeedback}
          />
        </div>
      </div>
    </div>
  )
}
