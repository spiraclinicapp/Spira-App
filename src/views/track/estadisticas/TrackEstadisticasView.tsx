import { useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { DateRangeField } from '../../../components/DateRangeField'
import { EmptyState } from '../../../components/EmptyState'
import { Icon } from '../../../components/Icon'
import { useEstadisticasEquipo } from '../../../data/trackReports'
import { useAuth } from '../../../lib/auth'
import type { VisitaEquipo } from '../../../data/trackReports'
import { formatAR, todayISO } from '../../../lib/dates'
import { oneOf } from '../../../lib/router'
import { useUrlState } from '../../../lib/useUrlState'
import type { ViewProps } from '../../types'
import { porEstudio, porVisita } from './agregados'
import {
  cargaMensual, FILTROS_VACIOS, filasDetalle, proyeccion, rangoProyeccion, tiemposPorCoordinadora,
} from './agregadosEquipo'
import type { FiltrosDetalle } from './agregadosEquipo'
import { rangoDePreset } from './rango'
import type { Preset, Rango } from './rango'
import { avisoCaja, filtrosFila, sectionHead, sectionHint, sectionRule, sectionTitle } from './estilos'
import { TablaPorEstudio, TablaPorVisita } from './Tablas'
import { DetalleVisitas, ModalVisita, Proyeccion, TablaCarga, TablaTiempos } from './Equipo'

const PRESETS: readonly [Exclude<Preset, 'custom'>, string][] = [
  ['30dias', '30 días'],
  ['mesEnCurso', 'Este mes'],
  ['anio', 'Año'],
]

/** El mes de la carga de trabajo: el que contiene el último día del período, hasta ese día. */
function mesDe(r: Rango): Rango {
  return { desde: `${r.hasta.slice(0, 7)}-01`, hasta: r.hasta }
}

function nombreDelMes(iso: string): string {
  const [y, m] = iso.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })
}

function Seccion({ titulo, hint, grande }: { titulo: string; hint?: ReactNode; grande?: boolean }) {
  return (
    <div style={sectionHead}>
      <h2 style={{ ...sectionTitle, fontSize: grande ? 16.5 : 14.5 }}>{titulo}</h2>
      <div style={sectionRule} />
      {hint && <div style={sectionHint}>{hint}</div>}
    </div>
  )
}

/**
 * Coordinación › Estadísticas (handoff `design_handoff_coordinacion_estadisticas`). SÓLO JEFATURA:
 * el submódulo lleva `soloJefatura` y el shell lo oculta del menú, del buscador y de la URL para el
 * resto (Director, 2026-09-23).
 *
 * Dos zonas, una sola fuente: `estadisticas_equipo_track` (0143), que devuelve el centro entero a
 * jefatura y nada a nadie más. Por eso los bloques del período y los del equipo hablan del mismo
 * universo — antes del período se leía `v_track_visits`, recortada por la RLS a los estudios
 * asignados, y un líder sin gerencia habría visto dos alcances distintos en la misma pantalla.
 *
 * Tres lecturas, cada una con su rango: el PERÍODO (por estudio, tiempos por visita, tiempos por
 * coordinadora y el detalle), el MES que contiene el último día del período (carga de trabajo) y las
 * cuatro semanas que empiezan mañana (proyección).
 *
 * El "Promedio por tipo de visita" del handoff se volvió "Tiempos por visita" (estudio → V1, V2…;
 * Director, 2026-10-08): el tipo (Screening, Tratamiento…) promediaba visitas muy distintas entre
 * sí, y lo que se quiere es estimar cuánto va a durar UNA visita concreta. La zona Equipo queda
 * sólo para gerencia (ver `verEquipo`).
 *
 * Afuera, a propósito: el hero, el gráfico de evolución y la tira de tiempos del handoff.
 */
export function TrackEstadisticasView({ module, onNavigate }: ViewProps) {
  // La zona de equipo es sólo de gerencia "por ahora" (Director, 2026-10-08): a un líder de
  // Coordinación le alcanza con los estudios, los tiempos por visita y la proyección. Es
  // presentación, no permiso — la 0143 le sigue devolviendo el centro entero a todo jefatura.
  const { modules } = useAuth()
  const verEquipo = modules.includes('gerencia')
  const [preset, setPreset] = useUrlState<Preset>('periodo', '30dias', {
    codec: oneOf(['30dias', 'mesEnCurso', 'anio', 'custom'] as const),
  })
  const [desde, setDesde] = useUrlState('desde', '')
  const [hasta, setHasta] = useUrlState('hasta', '')
  const [filtros, setFiltros] = useState<FiltrosDetalle>(FILTROS_VACIOS)
  const [abierta, setAbierta] = useState<VisitaEquipo | null>(null)
  const detalleRef = useRef<HTMLDivElement>(null)

  const rango = useMemo(
    () => (preset === 'custom' && desde && hasta ? { desde, hasta } : rangoDePreset(preset === 'custom' ? '30dias' : preset)),
    [preset, desde, hasta],
  )
  const mes = useMemo(() => mesDe(rango), [rango])
  const hoy = todayISO()
  const rangoProy = useMemo(() => rangoProyeccion(hoy), [hoy])

  function elegirPreset(p: Exclude<Preset, 'custom'>) {
    setDesde('')
    setHasta('')
    setPreset(p)
  }

  function elegirRango(nuevoDesde: string, nuevoHasta: string) {
    setDesde(nuevoDesde)
    setHasta(nuevoHasta)
    setPreset('custom')
  }

  const periodo = useEstadisticasEquipo(rango)
  const delMes = useEstadisticasEquipo(mes)
  const futuras = useEstadisticasEquipo(rangoProy)

  const d = useMemo(() => {
    const filas = periodo.data ?? []
    return {
      estudio: porEstudio(filas, rango),
      visita: porVisita(filas, rango),
      tiempos: tiemposPorCoordinadora(filas, rango),
      detalle: filasDetalle(filas, rango),
    }
  }, [periodo.data, rango])
  const carga = useMemo(() => cargaMensual(delMes.data ?? [], mes), [delMes.data, mes])
  const proy = useMemo(() => proyeccion(futuras.data ?? [], hoy), [futuras.data, hoy])

  /** Desde las tablas de equipo: fija la coordinadora en el detalle y baja hasta él. */
  function verEnDetalle(clave: string) {
    setFiltros({ ...FILTROS_VACIOS, coord: clave })
    detalleRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  function abrirVisita(v: VisitaEquipo) {
    setAbierta(null)
    onNavigate?.(
      'track', 'visitas',
      { visitId: v.id, visitDate: v.real_date ?? v.estimated_date ?? undefined },
      { moduleKey: 'track', subKey: 'reportes', label: 'Volver a Estadísticas' },
    )
  }

  if (periodo.loading) {
    return <EmptyState icon="barChart" accent={module.accentSolid} title="Cargando…" description="Trayendo las visitas del período." />
  }

  if (periodo.error) {
    return <EmptyState icon="alert" accent="var(--spira-danger)" title="No pudimos traer los datos" description={periodo.error} />
  }

  const cortadas = [periodo, delMes, futuras].filter((q) => q.truncado)
  const vacio = d.estudio.totalVisitas === 0

  return (
    <div>
      <div style={filtrosFila}>
        {/* Los atajos de período viajan ADENTRO del calendario, como en el resto de la app (ver `atajos`
            en DateRangeField): escriben el mismo desde/hasta, así que el disparador muestra siempre lo
            que se está aplicando. */}
        <DateRangeField
          accent={module.accentSolid}
          desde={rango.desde}
          hasta={rango.hasta}
          onChange={elegirRango}
          atajos={PRESETS.map(([k, label]) => ({ label, activo: preset === k, onClick: () => elegirPreset(k) }))}
        />
      </div>

      {cortadas.length > 0 && (
        <div style={avisoCaja}>
          <Icon name="alert" size={16} stroke={2} />
          <span>
            Hay más visitas de las que se pueden traer de una vez, así que algunos números están calculados sobre una
            parte. Achicá el período para verlo completo.
          </span>
        </div>
      )}

      {vacio ? (
        <EmptyState
          icon="barChart"
          accent={module.accentSolid}
          title="Sin visitas en el período"
          description={`No hay visitas registradas entre el ${formatAR(rango.desde)} y el ${formatAR(rango.hasta)}. Probá con otro rango.`}
          minHeight={200}
        />
      ) : (
        <>
          <Seccion titulo="Por estudio" hint={`${d.estudio.filas.length} estudios con visitas en el período`} grande />
          <TablaPorEstudio
            filas={d.estudio.filas}
            totalVisitas={d.estudio.totalVisitas}
            totalPerdidas={d.estudio.totalPerdidas}
            totalEnVentana={d.estudio.totalEnVentana}
            totalPendientes={d.estudio.totalPendientes}
            accentSolid={module.accentSolid}
          />

          <Seccion
            titulo="Tiempos por visita"
            hint="abrí un estudio para ver cada visita · cuanto más largo el período, más visitas hay detrás de cada promedio"
          />
          {d.visita.filas.length === 0 ? (
            <EmptyState
              icon="barChart"
              accent={module.accentSolid}
              title="Sin visitas atendidas en el período"
              description="Hay visitas agendadas, pero ninguna atendida todavía: los tiempos se calculan sobre visitas ya realizadas."
              minHeight={200}
            />
          ) : (
            <TablaPorVisita r={d.visita} />
          )}
        </>
      )}

      <Seccion titulo="Proyección del próximo mes" hint={`sobre lo agendado al ${formatAR(hoy)}`} />
      {futuras.loading ? (
        <div style={sectionHint}>Cargando…</div>
      ) : futuras.error ? (
        <div style={sectionHint}>{futuras.error}</div>
      ) : (
        <Proyeccion p={proy} accentSolid={module.accentSolid} />
      )}

      {verEquipo && (
        <>
          <div style={{ ...sectionHead, marginTop: 40 }}>
            <h2 style={{ ...sectionTitle, fontSize: 18 }}>Equipo</h2>
            <div style={sectionRule} />
          </div>
          <p style={{ margin: '-4px 0 0', fontSize: 12.5, color: 'var(--spira-ink-soft)', lineHeight: 1.5 }}>
            Estos números miran a las personas, no a los estudios. Cada visita atendida se le cuenta a quien inició la
            atención; las que siguen pendientes, a la coordinadora que tienen asignada.
          </p>

          <Seccion titulo="Carga de trabajo mensual" hint={`${nombreDelMes(mes.desde)} · abrí una fila para ver el día a día`} />
          {delMes.loading ? (
            <div style={sectionHint}>Cargando…</div>
          ) : delMes.error ? (
            <div style={sectionHint}>{delMes.error}</div>
          ) : carga.filas.length === 0 ? (
            <div style={sectionHint}>No hay visitas en {nombreDelMes(mes.desde)}.</div>
          ) : (
            <TablaCarga carga={carga} accentSolid={module.accentSolid} onVerEnDetalle={verEnDetalle} onAbrir={setAbierta} />
          )}

          {!vacio && d.tiempos.filas.length > 0 && (
            <>
              <Seccion titulo="Tiempos por coordinadora" hint="abrí una fila para ver el desglose por tipo de visita" />
              <TablaTiempos tiempos={d.tiempos} accentSolid={module.accentSolid} onVerEnDetalle={verEnDetalle} onAbrir={setAbierta} />

              <Seccion titulo="Detalle visita por visita" hint="quién marcó cada sello, y a qué hora" />
              <DetalleVisitas
                filas={d.detalle}
                filtros={filtros}
                setFiltros={setFiltros}
                accentSolid={module.accentSolid}
                onAbrir={setAbierta}
                anclaRef={detalleRef}
              />
            </>
          )}
        </>
      )}

      {abierta && (
        <ModalVisita v={abierta} accentSolid={module.accentSolid} onClose={() => setAbierta(null)} onAbrirVisita={() => abrirVisita(abierta)} />
      )}
    </div>
  )
}
