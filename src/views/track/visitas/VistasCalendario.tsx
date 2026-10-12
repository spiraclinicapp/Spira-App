import { ProtoTag, VisitCodeTag } from '../../visitAtoms'
import { formatTimeAR, isoDayAR } from '../../../lib/dates'
import { visitCode } from '../../../lib/visits'
import type { DayVisitRow } from '../../../data/dayVisits'
import { codigoCorto, compararVisitas, diaDeLaSemana, esNoVino, estadoDeFila, grillaDelMes, grupoDeVisita, lunesDe, nombreCorto, sumarDias } from './calendario'
import { ESTADOS } from './estados'

const DIA_CORTO = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

const cantidad = (n: number) => (n === 0 ? '—' : `${n} ${n === 1 ? 'visita' : 'visitas'}`)

/**
 * Vista SEMANA (handoff §4): una columna por día, L–V, y sábado y domingo sólo si el período tiene
 * visitas esos días (`conFinDeSemana`, decidido por quien la usa sobre TODAS las visitas del rango, no
 * las filtradas: si dependiera del filtro, las columnas cambiarían de ancho al tildar un protocolo).
 *
 * Todo lleva a la vista Día de esa fecha —el encabezado y cada tarjeta—: la semana es para ubicarse,
 * y las acciones sobre una visita (llegada, atención, médico) viven en la fila del día.
 */
export function VistaSemana({ fecha, hoy, porDia, conFinDeSemana, onElegirDia }: {
  fecha: string
  hoy: string
  /** Visitas YA FILTRADAS, por día (ver `visitasPorDia`). */
  porDia: Map<string, DayVisitRow[]>
  conFinDeSemana: boolean
  onElegirDia: (iso: string) => void
}) {
  const lunes = lunesDe(fecha)
  const dias = Array.from({ length: conFinDeSemana ? 7 : 5 }, (_, i) => sumarDias(lunes, i))
  return (
    <div className="vcal-semana-wrap">
    <div className="vcal-semana" style={{ gridTemplateColumns: `repeat(${dias.length}, minmax(0, 1fr))` }}>
      {dias.map((d, i) => {
        const lista = [...(porDia.get(d) ?? [])].sort(compararVisitas)
        const esHoy = d === hoy
        return (
          <div
            key={d}
            style={{
              display: 'flex', flexDirection: 'column', minHeight: 440, minWidth: 0,
              borderLeft: i ? '1px solid var(--spira-line)' : 'none',
              background: esHoy ? 'rgba(46, 125, 116, .04)' : 'transparent',
            }}
          >
            <button
              type="button"
              className="vcal-dayhead spira-no-press"
              onClick={() => onElegirDia(d)}
              aria-label={`Ver las visitas del ${DIA_CORTO[diaDeLaSemana(d)].toLowerCase()} ${Number(d.slice(8))}`}
              /* El día elegido se subraya por dentro (2px del acento): es la fecha que abre «Día». */
              style={{ boxShadow: d === fecha ? 'inset 0 -2px 0 var(--vcal-acc, var(--spira-track))' : 'none' }}
            >
              <span style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: esHoy ? 'var(--spira-acc-deep-track)' : 'var(--spira-ink-soft)' }}>
                {DIA_CORTO[diaDeLaSemana(d)]}
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
                <NumeroDia dia={d} esHoy={esHoy} size={32} fontSize={20} />
                <span className="spira-mono" style={{ fontSize: 12, color: 'var(--spira-ink-soft)', marginLeft: 'auto', whiteSpace: 'nowrap' }}>{cantidad(lista.length)}</span>
              </span>
            </button>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 8 }}>
              {lista.map((v) => <TarjetaSemana key={v.id} v={v} dia={d} onClick={() => onElegirDia(d)} />)}
            </div>
          </div>
        )
      })}
    </div>
    </div>
  )
}

function TarjetaSemana({ v, dia, onClick }: { v: DayVisitRow; dia: string; onClick: () => void }) {
  const estado = ESTADOS[estadoDeFila(v)]
  const noVino = esNoVino(v)
  /* La hora de llegada sólo en el día en que llegó. Una visita puede estar en dos columnas (citada el 8,
     llegó el 10: ver `diasDeLaVisita`), y «11:37» bajo el jueves decía que llegó el jueves (QA con datos
     reales, 2026-10-12). */
  const llego = v.arrived_at && isoDayAR(v.arrived_at) === dia ? formatTimeAR(v.arrived_at) : null
  return (
    <button
      type="button"
      className="vcal-wcard spira-no-press"
      onClick={onClick}
      /* Las cerradas se atenúan: en la semana lo que importa es lo que todavía va a pasar. */
      style={{ opacity: grupoDeVisita(v) === 'fin' ? 0.78 : 1 }}
    >
      <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 600, color: 'var(--spira-ink-soft)', minWidth: 0 }}>
        <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: 99, flexShrink: 0, background: estado.color }} />
        <span className="vcal-wcard-estado">{estado.label}</span>
        {llego && <span className="spira-mono" style={{ marginLeft: 'auto', flexShrink: 0 }}>{llego}</span>}
      </span>
      <span className="vcal-wcard-nombre" title={v.patient_name} style={{ textDecoration: noVino ? 'line-through' : 'none' }}>
        {v.patient_name}
      </span>
      <span style={{ display: 'flex', gap: 5, flexWrap: 'wrap', minWidth: 0 }}>
        <ProtoTag code={v.protocol_code} protocolId={v.protocol_id} compacto />
        <VisitCodeTag code={visitCode(v)} compacto />
      </span>
    </button>
  )
}

/**
 * Vista MES (handoff §5), celda estilo «Lista»: hasta tres visitas por día (punto de estado · nombre
 * corto · código) y «+N más». Los días de los meses vecinos se dibujan atenuados, con sus visitas: la
 * grilla son semanas enteras y una celda vacía en el 30 de septiembre diría que ese día no hubo nada.
 */
export function VistaMes({ fecha, hoy, porDia, conFinDeSemana, onElegirDia }: {
  fecha: string
  hoy: string
  porDia: Map<string, DayVisitRow[]>
  conFinDeSemana: boolean
  onElegirDia: (iso: string) => void
}) {
  const { semanas } = grillaDelMes(fecha)
  const cols = conFinDeSemana ? 7 : 5
  const mes = fecha.slice(0, 7)
  const celdas = semanas.flatMap((s) => s.slice(0, cols))
  const encabezado = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].slice(0, cols)
  return (
    <div className="vcal-mes">
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, borderBottom: '1px solid var(--spira-line)', background: 'var(--spira-surface)' }}>
        {encabezado.map((h) => (
          <div key={h} style={{ padding: '9px 12px', fontSize: 11.5, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--spira-ink-soft)' }}>{h}</div>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
        {celdas.map((d, i) => {
          const lista = [...(porDia.get(d) ?? [])].sort(compararVisitas)
          const fuera = d.slice(0, 7) !== mes
          return (
            <button
              key={d}
              type="button"
              className={'vcal-mcell spira-no-press' + (d === fecha ? ' elegido' : '') + (fuera ? ' fuera' : '')}
              onClick={() => onElegirDia(d)}
              aria-label={`Ver las visitas del ${Number(d.slice(8))}/${Number(d.slice(5, 7))}: ${cantidad(lista.length)}`}
              style={{
                borderLeft: i % cols ? '1px solid var(--spira-line)' : 'none',
                borderTop: i >= cols ? '1px solid var(--spira-line)' : 'none',
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%' }}>
                <NumeroDia dia={d} esHoy={d === hoy} size={26} fontSize={14} />
                {lista.length > 0 && <span className="spira-mono" style={{ marginLeft: 'auto', fontSize: 11.5, color: 'var(--spira-ink-soft)' }}>{lista.length}</span>}
              </span>
              <span style={{ display: 'flex', flexDirection: 'column', gap: 3, width: '100%' }}>
                {lista.slice(0, 3).map((v) => (
                  <span key={v.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--spira-ink-2)', minWidth: 0 }}>
                    <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: 99, flexShrink: 0, background: ESTADOS[estadoDeFila(v)].color }} />
                    <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textDecoration: esNoVino(v) ? 'line-through' : 'none' }}>
                      {nombreCorto(v.patient_name)}
                    </span>
                    <span className="spira-mono" style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--spira-ink-soft)', flexShrink: 0 }}>{codigoCorto(visitCode(v))}</span>
                  </span>
                ))}
                {lista.length > 3 && (
                  <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--spira-acc-deep-track)' }}>+{lista.length - 3} más</span>
                )}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

/** El número del día; hoy, relleno con el acento (la misma marca en Semana y en Mes). */
function NumeroDia({ dia, esHoy, size, fontSize }: { dia: string; esHoy: boolean; size: number; fontSize: number }) {
  return (
    <span
      style={{
        fontFamily: 'var(--spira-font-display)', fontWeight: 700, fontSize, minWidth: size, height: size, borderRadius: 99,
        display: 'grid', placeItems: 'center',
        background: esHoy ? 'var(--vcal-acc, var(--spira-track))' : 'transparent',
        color: esHoy ? 'var(--spira-on-accent)' : 'var(--spira-ink)',
      }}
    >
      {Number(dia.slice(8))}
    </span>
  )
}
