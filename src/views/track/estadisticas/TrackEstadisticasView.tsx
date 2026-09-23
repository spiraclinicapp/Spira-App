import { useMemo } from 'react'
import { DateRangeField } from '../../../components/DateRangeField'
import { EmptyState } from '../../../components/EmptyState'
import { Icon } from '../../../components/Icon'
import { useTrackPeriodVisits } from '../../../data/trackReports'
import { formatAR } from '../../../lib/dates'
import { oneOf } from '../../../lib/router'
import { useUrlState } from '../../../lib/useUrlState'
import type { ViewProps } from '../../types'
import { porEstudio, porTipo } from './agregados'
import { rangoDePreset } from './rango'
import type { Preset } from './rango'
import { avisoCaja, chip, chipActivo, filtrosFila, sectionHead, sectionHint, sectionRule, sectionTitle } from './estilos'
import { TablaPorEstudio, TablaPorTipo } from './Tablas'

const PRESETS: readonly [Exclude<Preset, 'custom'>, string][] = [
  ['30dias', '30 días'],
  ['mesEnCurso', 'Mes en curso'],
  ['anio', 'Año'],
]

/**
 * Coordinación › Estadísticas. Primera entrega (handoff `design_handoff_coordinacion_estadisticas`,
 * acordada con el Director): sólo "Por estudio" y "Promedio por tipo de visita".
 *
 * SÓLO JEFATURA (Director, 2026-09-23): en el handoff estos dos bloques eran para todos, pero los
 * quiere para los jefes. El submódulo lleva `soloJefatura` en el registro y el shell lo oculta del
 * menú, del buscador y de la URL para el resto — por eso esta vista no se guarda sola.
 *
 * Lo que NO hace ese flag: ampliar lo que un jefe puede LEER. La RLS de `v_track_visits` sigue
 * igual, así que un líder sin gerencia ve los números de los estudios que tiene asignados
 * (`supabase/migrations/0028_track_admin_ve_protocolos.sql`); sólo gerencia ve el centro entero.
 *
 * Queda afuera, a propósito, el resto del handoff (hero, evolución, tiempos, y la zona de equipo):
 * la zona de equipo necesita una migración (permiso por coordinadora, quién marcó cada sello y la
 * capacidad semanal del equipo, que hoy no existen).
 */
export function TrackEstadisticasView({ module }: ViewProps) {
  const [preset, setPreset] = useUrlState<Preset>('periodo', '30dias', {
    codec: oneOf(['30dias', 'mesEnCurso', 'anio', 'custom'] as const),
  })
  const [desde, setDesde] = useUrlState('desde', '')
  const [hasta, setHasta] = useUrlState('hasta', '')

  const rango = useMemo(
    () => (preset === 'custom' && desde && hasta ? { desde, hasta } : rangoDePreset(preset === 'custom' ? '30dias' : preset)),
    [preset, desde, hasta],
  )

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

  const visitas = useTrackPeriodVisits(rango)

  const d = useMemo(
    () => ({ estudio: porEstudio(visitas.data ?? [], rango), tipo: porTipo(visitas.data ?? [], rango) }),
    [visitas.data, rango],
  )

  if (visitas.loading) {
    return <EmptyState icon="barChart" accent={module.accentSolid} title="Cargando…" description="Trayendo las visitas del período." />
  }

  if (visitas.error) {
    return <EmptyState icon="alert" accent="var(--spira-danger)" title="No pudimos traer los datos" description={visitas.error} />
  }

  return (
    <div>
      <div style={filtrosFila}>
        <DateRangeField accent={module.accentSolid} desde={rango.desde} hasta={rango.hasta} onChange={elegirRango} />
        <div style={{ display: 'inline-flex', gap: 7 }}>
          {PRESETS.map(([k, label]) => (
            <button
              key={k}
              type="button"
              aria-pressed={preset === k}
              onClick={() => elegirPreset(k)}
              style={{ ...chip, ...(preset === k ? chipActivo : null) }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {visitas.truncado && (
        <div style={avisoCaja}>
          <Icon name="alert" size={16} stroke={2} />
          <span>
            El período elegido tiene más visitas de las que se pueden traer de una vez ({visitas.total} en total). Los
            números de abajo están calculados solo sobre las primeras {visitas.data?.length ?? 0}: achicá el rango para
            ver el período completo.
          </span>
        </div>
      )}

      {d.estudio.totalVisitas === 0 ? (
        <EmptyState
          icon="barChart"
          accent={module.accentSolid}
          title="Sin visitas en el período"
          description={`No hay visitas registradas entre el ${formatAR(rango.desde)} y el ${formatAR(rango.hasta)}. Probá con otro rango.`}
        />
      ) : (
        <>
          <div style={sectionHead}>
            <h2 style={sectionTitle}>Por estudio</h2>
            <div style={sectionRule} />
            <div style={sectionHint}>{d.estudio.filas.length} estudios activos en el período</div>
          </div>
          <TablaPorEstudio
            filas={d.estudio.filas}
            totalVisitas={d.estudio.totalVisitas}
            totalPerdidas={d.estudio.totalPerdidas}
            totalEnVentana={d.estudio.totalEnVentana}
            totalPendientes={d.estudio.totalPendientes}
            accentSolid={module.accentSolid}
          />

          <div style={sectionHead}>
            <h2 style={sectionTitle}>Promedio por tipo de visita</h2>
            <div style={sectionRule} />
            <div style={sectionHint}>abrí una fila para ver el desglose por estudio</div>
          </div>
          {d.tipo.filas.length === 0 ? (
            <EmptyState
              icon="barChart"
              accent={module.accentSolid}
              title="Sin visitas atendidas en el período"
              description="Hay visitas agendadas, pero ninguna atendida todavía: los tiempos se calculan sobre visitas ya realizadas."
              minHeight={200}
            />
          ) : (
            <TablaPorTipo
              filas={d.tipo.filas}
              totalVisitas={d.tipo.totalVisitas}
              esperaProm={d.tipo.esperaProm}
              atencionProm={d.tipo.atencionProm}
              estadiaProm={d.tipo.estadiaProm}
              estadiaMax={d.tipo.estadiaMax}
              accentSolid={module.accentSolid}
            />
          )}
        </>
      )}
    </div>
  )
}
