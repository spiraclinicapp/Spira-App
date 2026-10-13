import { useMemo, useState } from 'react'
import { Icon } from '../../../components/Icon'
import type { IconName } from '../../../components/Icon'
import { CalendarioPopover } from '../../../components/CalendarioPopover'
import { usePopover } from '../../../components/usePopover'
import { todayISO, yearsFromTodayISO } from '../../../lib/dates'
import { useVisitDates } from '../../../data/dayVisits'
import { ORDEN_GRUPOS, VISTAS, contieneHoy, diasDeLaVisita, periodoDe, primeroDelMes, rotuloPeriodo } from './calendario'
import type { ConteoPorGrupo, VistaCalendario } from './calendario'
import { GRUPOS, rotuloGrupo } from './estados'

const VISTA: Record<VistaCalendario, { label: string; icon: IconName; tecla: string }> = {
  mes: { label: 'Mes', icon: 'calendarMonth', tecla: 'M' },
  semana: { label: 'Semana', icon: 'calendarWeek', tecla: 'S' },
  dia: { label: 'Día', icon: 'list', tecla: 'D' },
}

/**
 * La barra de período de Visitas (handoff §1.2, variante «A · Barra»): ‹ Hoy › a la izquierda, el
 * período con sus contadores en el medio —es el botón que abre el calendario— y el selector de vista
 * a la derecha, que no se mueve nunca.
 *
 * Los contadores describen lo que se está VIENDO (el período con los filtros puestos), igual que
 * antes describían el día filtrado: quien filtra por un protocolo quiere saber cuántas de ESE quedan
 * por llegar, no del centro entero.
 */
export function BarraPeriodo({ vista, fecha, conFinDeSemana, conteo, onVista, onFecha, onPaso }: {
  vista: VistaCalendario
  fecha: string
  /** La semana se rotula hasta el domingo cuando la grilla lo dibuja. */
  conFinDeSemana: boolean
  conteo: ConteoPorGrupo
  onVista: (v: VistaCalendario) => void
  onFecha: (iso: string) => void
  onPaso: (n: number) => void
}) {
  const hoy = todayISO()
  const [abierto, setAbierto] = useState(false)
  const { triggerRef, popRef, pos } = usePopover<HTMLButtonElement, HTMLDivElement>(abierto, () => setAbierto(false))
  const rotulo = rotuloPeriodo(vista, fecha, conFinDeSemana)
  const muestraHoy = contieneHoy(vista, fecha, hoy)

  /* El puntito de «hay visitas» del calendario: se pide SÓLO con el calendario abierto y sólo el mes
     que se está hojeando. `mesVisto` arranca en el mes de la fecha cada vez que se abre (lo resetea el
     clic, no un efecto: un efecto que escribe estado al abrir dibujaría un cuadro con el mes viejo). */
  const [mesVisto, setMesVisto] = useState(primeroDelMes(fecha))
  const fechas = useVisitDates(abierto ? periodoDe('mes', mesVisto) : null)
  const marcados = useMemo(() => {
    const s = new Set<string>()
    for (const v of fechas.data ?? []) for (const d of diasDeLaVisita(v)) s.add(d)
    return s
  }, [fechas.data])

  const stats: { n: number; label: string; color: string | null }[] = [
    { n: conteo.total, label: conteo.total === 1 ? 'visita' : 'visitas', color: null },
    ...ORDEN_GRUPOS.map((g) => ({ n: conteo[g], label: rotuloGrupo(g, conteo[g]), color: GRUPOS[g].color })),
  ]

  return (
    <div className="vcal-tbar-wrap">
      <div className="vcal-tbar">
        <div className="vcal-nav" role="group" aria-label="Moverse por el calendario">
          <button type="button" className="vcal-navbtn spira-no-press" onClick={() => onPaso(-1)} title="Anterior (←)" aria-label="Período anterior">
            <Icon name="chevronLeft" size={17} />
          </button>
          {/* Se APAGA, no desaparece, cuando el período ya contiene hoy: si se fuera, las flechas
              cambiarían de lugar justo debajo del dedo al llegar a hoy. */}
          <button type="button" className="vcal-navbtn vcal-hoy spira-no-press" onClick={() => onFecha(hoy)} disabled={muestraHoy} title={muestraHoy ? undefined : 'Volver a hoy (T)'}>
            Hoy
          </button>
          <button type="button" className="vcal-navbtn spira-no-press" onClick={() => onPaso(1)} title="Siguiente (→)" aria-label="Período siguiente">
            <Icon name="chevronRight" size={17} />
          </button>
        </div>

        <div className="vcal-tbar-periodo" style={{ minWidth: 0 }}>
          <button
            ref={triggerRef}
            type="button"
            className="vcal-period spira-no-press"
            onClick={() => { if (!abierto) setMesVisto(primeroDelMes(fecha)); setAbierto((o) => !o) }}
            aria-haspopup="dialog"
            aria-expanded={abierto}
            aria-label={`${rotulo.principal} ${rotulo.anio}. Elegir fecha`}
          >
            <span style={{ display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0, maxWidth: '100%' }}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0, fontFamily: 'var(--spira-font-display)', fontSize: 20, fontWeight: 700, color: 'var(--spira-ink)' }}>
                {rotulo.principal}
              </span>
              <span style={{ fontSize: 14, color: 'var(--spira-ink-soft)', flexShrink: 0 }}>{rotulo.anio}</span>
              <Icon name="chevronDown" size={15} color="var(--spira-muted)" style={{ alignSelf: 'center', flexShrink: 0, transform: abierto ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
            </span>
            {/* Los contadores ENVUELVEN en vez de recortarse: con `overflow: hidden` (como el mock), a ~670 px
                «3 finalizadas» se leía «3 final», un dato distinto. Cada contador es un bloque que no se parte. */}
            <span style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', columnGap: 12, rowGap: 2, maxWidth: '100%', fontSize: 12.5, color: 'var(--spira-ink-soft)' }}>
              {/* Los que dan 0 no se dibujan, salvo el total: «0 en el centro» es ruido; «0 visitas» es la respuesta. */}
              {stats.filter((s, i) => i === 0 || s.n > 0).map((s) => (
                <span key={s.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap' }}>
                  {s.color && <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: 9, background: s.color }} />}
                  <b className="spira-mono" style={{ fontWeight: 700, color: 'var(--spira-ink-2)' }}>{s.n}</b>{s.label}
                </span>
              ))}
            </span>
          </button>
          {/* El calendario es el MISMO de los campos de fecha (`CalendarioPopover`): con desplegable de
              mes y año, que el del prototipo no tenía. Elegir un día cambia la fecha y NO la vista. */}
          {abierto && pos && (
            <CalendarioPopover
              popRef={popRef}
              pos={pos}
              value={fecha}
              min={yearsFromTodayISO(-5)}
              max={yearsFromTodayISO(2)}
              marcados={marcados}
              onMonthChange={setMesVisto}
              onPick={(iso) => { if (iso) onFecha(iso); setAbierto(false) }}
            />
          )}
        </div>

        <div className="vcal-tabs" role="tablist" aria-label="Vista">
          {VISTAS.map((k) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={vista === k}
              className="vcal-tab"
              title={`${VISTA[k].label} (${VISTA[k].tecla})`}
              onClick={() => onVista(k)}
            >
              <Icon name={VISTA[k].icon} size={15} />
              <span className="vcal-tab-label">{VISTA[k].label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
