import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, KeyboardEvent } from 'react'
import { Icon } from '../../../components/Icon'
import { MultiFilterMenu } from '../../../components/MultiFilterMenu'
import { ClearFilters, FilterSearch } from '../../../components/FilterBar'
import { PatientLink, PatientLinkArrow } from '../../../components/PatientLink'
import { useReportesPendientes, setReportStage } from '../../../data/reportStatus'
import { useProtocols } from '../../../data/protocols'
import { useAuth } from '../../../lib/auth'
import { codecs } from '../../../lib/router'
import { useUrlState } from '../../../lib/useUrlState'
import { AtajoProtocolos, TarjetaProtocolo } from '../../AtajoProtocolos'
import { useAbrirFicha } from '../../useAbrirFicha'
import type { ViewProps } from '../../types'
import type { ReportStage } from './estados'
import { reporteTitulo } from './estados'
import {
  agruparPorVisita, aplicarEtapas, claveReporte, filtrar, opcionesDeFiltro, resumenPorEstudio, totales,
} from './porPaciente'
import type { FilaReporte, PacienteVisita, ResumenEstudio } from './porPaciente'
import {
  AccionDeReporte, BarraDeReportes, ConteoDeReportes, EstadoDeReporte, LinkAlPortal, TextoPlazo,
} from './piezasPaciente'

/**
 * `Coordinación › Reportes` — los reportes pendientes de todos los estudios, UNA FILA POR PACIENTE EN
 * UNA VISITA (handoff `docs/design_handoff_reportes_pendientes/`, plan `docs/plan-reportes-pendientes.md`).
 *
 * Antes había una tarjeta por reporte y un paciente con tres informes aparecía tres veces. Acá la fila
 * resume todos sus reportes con una barra y un conteo, y se despliega para actuar.
 *
 *   Estudios con pendientes   ← AtajoProtocolos (el mismo de Pendientes y Stock), escribe `?protocolo=`
 *   Estado · Informe | Antigüedad          Buscar
 *   10 pendientes · 4 pacientes  × Limpiar
 *   ┌ tabla ──────────────────────────────────────────────┐
 *   │ › Calderón, María Julieta  222714  V17  ▬▬▬ 2 sin desc.  Vencido hace 107 días │
 *   │     Informe · IQVIA ↗        (Sin descargar)       [Marcar descargado]          │
 *   └─────────────────────────────────────────────────────┘
 *
 * MOVER UN REPORTE NO RECARGA LA PANTALLA (1A): tras el OK de la RPC la etapa nueva se aplica sobre las
 * filas en memoria (`overlay`). Con un refetch, la visita a la que se le evoluciona el último reporte
 * desaparecería de golpe —el handoff pide que diga «Todo evolucionado» hasta que se refresque— y cada
 * clic bajaría de nuevo cientos de reportes. Qué filas se ven y en qué orden lo decide lo que vino del
 * servidor; ver la cabecera de `porPaciente.ts`.
 *
 * Quién puede mover: el mismo criterio que el tablero del protocolo. Quien sólo mira, ve la pantalla
 * sin botones; la que manda es la RPC, que scopea por `coordina_visita`.
 */
export function ReportesPorPacienteView({ module, submodule, onNavigate, navTarget, onTargetConsumed }: ViewProps) {
  const accent = module.accentSolid
  const q = useReportesPendientes()
  const protocols = useProtocols()
  const { hasMinRole, modules } = useAuth()
  const canOperate = modules.includes('gerencia') || hasMinRole('track', 'operator')

  /* Los mismos nombres de parámetro que Pendientes (`protocolo`, `estado`, `buscar`): las dos
     pantallas filtran lo mismo y una URL se lee igual en las dos (3A). */
  const [seleccion, setSeleccion] = useUrlState<string[]>('protocolo', [], { codec: codecs.list })
  const [fEstado, setFEstado] = useUrlState<string[]>('estado', [], { codec: codecs.list })
  const [fInforme, setFInforme] = useUrlState<string[]>('informe', [], { codec: codecs.list })
  const [fAntig, setFAntig] = useUrlState<string[]>('antiguedad', [], { codec: codecs.list })
  const [buscar, setBuscar] = useUrlState('buscar', '')

  const [overlay, setOverlay] = useState<Map<string, ReportStage>>(() => new Map())
  const [ocupados, setOcupados] = useState<Set<string>>(() => new Set())
  /* Lo que está EN VUELO, en un ref y no en el estado: dos clics en el mismo tick leen el mismo estado
     (todavía vacío) y mandaban dos pedidos — lo cazó el QA con la RPC interceptada. El estado queda
     para dibujar el botón deshabilitado; el que decide si se manda es el ref. */
  const enVuelo = useRef<Set<string>>(new Set())
  const [abiertas, setAbiertas] = useState<Set<string>>(() => new Set())
  const [error, setError] = useState<string | null>(null)

  /* Datos nuevos del servidor = el overlay ya no tiene nada que aportar (y podría pisar un cambio de
     otra sesión). `now` se fija por carga: dos dibujos de los mismos datos dicen lo mismo. */
  useEffect(() => { setOverlay(new Map()) }, [q.data])
  const now = useMemo(() => Date.now(), [q.data])

  /* Llegada con estudios para filtrar (p. ej., desde la ficha del protocolo): el mismo setter que las
     tarjetas, así el estado es uno que el usuario podría haber armado a mano y la URL lo dice. */
  useEffect(() => {
    const filtro = navTarget?.protocolFilter
    if (!filtro || filtro.length === 0) return
    setSeleccion(filtro)
    onTargetConsumed?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navTarget, onTargetConsumed])

  const abrirFicha = useAbrirFicha({
    module,
    onNavigate,
    volver: () => ({ moduleKey: module.key, subKey: submodule.key, label: `Volver a ${submodule.name}`, hint: 'Volver a los reportes pendientes' }),
  })

  const base = useMemo(() => q.data ?? [], [q.data])
  const actuales = useMemo(() => aplicarEtapas(base, overlay), [base, overlay])
  const visitas = useMemo(() => agruparPorVisita(base, actuales, now), [base, actuales, now])
  const estudios = useMemo(() => resumenPorEstudio(visitas), [visitas])
  const enSeleccion = useMemo(
    () => (seleccion.length === 0 ? visitas : visitas.filter((v) => seleccion.includes(v.protocolId))),
    [visitas, seleccion],
  )
  const opciones = useMemo(() => opcionesDeFiltro(enSeleccion), [enSeleccion])
  const filtradas = useMemo(
    () => filtrar(enSeleccion, { estado: fEstado, informe: fInforme, antiguedad: fAntig, buscar }),
    [enSeleccion, fEstado, fInforme, fAntig, buscar],
  )

  const mover = useCallback(async (r: FilaReporte, destino: ReportStage) => {
    const clave = claveReporte(r)
    /* Un pedido por reporte: el doble clic no manda dos. Reportes distintos sí pueden ir a la vez. */
    if (enVuelo.current.has(clave)) return
    enVuelo.current.add(clave)
    setOcupados((s) => new Set(s).add(clave))
    setError(null)
    const res = await setReportStage(r.visit_id, r.report_definition_id, destino)
    enVuelo.current.delete(clave)
    setOcupados((s) => { const n = new Set(s); n.delete(clave); return n })
    /* Si falla, el estado no cambia: nada se aplica antes de que la base diga que sí. */
    if (res.error) { setError(res.error); return }
    setOverlay((m) => new Map(m).set(clave, destino))
  }, [])

  const alternar = (visitId: string) => setAbiertas((s) => {
    const n = new Set(s)
    if (n.has(visitId)) n.delete(visitId)
    else n.add(visitId)
    return n
  })

  if (q.loading && !q.data) {
    return <div style={{ fontSize: 13.5, color: 'var(--spira-muted)', padding: '10px 4px' }}>Cargando reportes…</div>
  }
  if (q.error) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 13, color: 'var(--spira-acc-deep-danger)', padding: '10px 4px' }}>
        No pudimos cargar los reportes pendientes.
        <button type="button" onClick={q.refetch} style={linkBtn}>Reintentar</button>
      </div>
    )
  }

  const porId = new Map((protocols.data ?? []).map((p) => [p.id, p]))
  const todos = totales(enSeleccion)
  const vistos = totales(filtradas)
  const nFiltros = fEstado.length + fInforme.length + fAntig.length
  const total = totales(visitas)
  /* Con un solo estudio elegido, la columna dice sólo la visita; con cero o varios, «Estudio · Visita». */
  const unEstudio = seleccion.length === 1

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Sin ningún pendiente el selector no se muestra (handoff §5.7). */}
      {visitas.length > 0 && (
        <AtajoProtocolos
          titulo="Estudios con pendientes"
          objeto="tabla"
          conTarjeta={estudios.map((e) => e.protocolId)}
          minimo={2}
          seleccionados={seleccion}
          codigoDe={(id) => porId.get(id)?.code ?? null}
          sinNada={{ uno: 'ya no tiene pendientes', varios: 'ya no tienen pendientes' }}
          resumenTodos={{
            titular: `${total.pendientes} ${total.pendientes === 1 ? 'pendiente' : 'pendientes'}`,
            detalle: `en ${estudios.length} ${estudios.length === 1 ? 'estudio' : 'estudios'}`,
          }}
          accentSolid={accent}
          onVerTodos={() => setSeleccion([])}
        >
          {estudios.map((e) => (
            <TarjetaProtocolo
              key={e.protocolId}
              code={e.code}
              protocolo={porId.get(e.protocolId) ?? null}
              sel={seleccion.includes(e.protocolId)}
              haySeleccion={seleccion.length > 0}
              accentSolid={accent}
              resumen={`${e.pendientes} ${e.pendientes === 1 ? 'pendiente' : 'pendientes'}, ${e.pacientes} ${e.pacientes === 1 ? 'paciente' : 'pacientes'}`}
              onClick={() => setSeleccion(
                seleccion.includes(e.protocolId) ? seleccion.filter((x) => x !== e.protocolId) : [...seleccion, e.protocolId],
              )}
            >
              <CuerpoDeEstudio e={e} />
            </TarjetaProtocolo>
          ))}
        </AtajoProtocolos>
      )}

      {/* La misma barra que Pendientes: `MultiFilterMenu` + `FilterSearch`. Antigüedad va después de
          un divisor porque mide el plazo, no el contenido. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <MultiFilterMenu accent={accent} label="Estado" icon="filter" options={opciones.estado} selected={fEstado} onChange={setFEstado} />
        <MultiFilterMenu accent={accent} label="Informe" icon="fileText" options={opciones.informe} selected={fInforme} onChange={setFInforme} searchPlaceholder={opciones.informe.length > 8 ? 'Buscar informe…' : undefined} />
        <span style={{ width: 1, height: 24, background: 'var(--spira-line-2)', margin: '0 4px' }} />
        <MultiFilterMenu accent={accent} label="Antigüedad" icon="clock" options={opciones.antiguedad} selected={fAntig} onChange={setFAntig} />
        <FilterSearch value={buscar} onChange={setBuscar} placeholder="Paciente o número…" />
      </div>

      {/* La línea de resumen. «Limpiar» suelta los tres filtros y nada más: ni el selector de
          estudios ni la búsqueda (handoff §5.4). */}
      <div aria-live="polite" style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: -4, fontSize: 12.5, color: 'var(--spira-ink-soft)', fontVariantNumeric: 'tabular-nums' }}>
        <span>
          {nFiltros > 0 || buscar.trim() ? `${vistos.pendientes} de ${todos.pendientes}` : todos.pendientes}{' '}
          {todos.pendientes === 1 ? 'pendiente' : 'pendientes'} · {vistos.pacientes} {vistos.pacientes === 1 ? 'paciente' : 'pacientes'}
        </span>
        {nFiltros > 0 && <ClearFilters n={nFiltros} onClear={() => { setFEstado([]); setFInforme([]); setFAntig([]) }} />}
      </div>

      {error && (
        <div role="alert" style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 13, color: 'var(--spira-acc-deep-danger)', background: 'color-mix(in srgb, var(--spira-danger) 10%, var(--spira-white))', borderRadius: 10, padding: '10px 13px' }}>
          <Icon name="alertCircle" size={17} color="var(--spira-danger)" />
          {error}
        </div>
      )}

      <div className="spira-scroll" style={tablaCaja}>
        <div style={{ minWidth: ANCHO_MINIMO }}>
        {visitas.length === 0 ? (
          <div style={vacio}>No te queda ningún reporte pendiente.</div>
        ) : (
          <>
            <div aria-hidden style={{ ...grilla(unEstudio), ...cabecera }}>
              <span />
              <span>Paciente</span>
              <span>IVRS</span>
              <span>{unEstudio ? 'Visita' : 'Estudio · Visita'}</span>
              <span>Estado de reportes</span>
              <span style={{ textAlign: 'right' }}>Plazo</span>
            </div>
            {filtradas.length === 0 ? (
              <div style={vacio}>Sin pacientes para este filtro.</div>
            ) : filtradas.map((v) => (
              <FilaPaciente
                key={v.visitId}
                v={v}
                unEstudio={unEstudio}
                abierta={abiertas.has(v.visitId)}
                onAlternar={() => alternar(v.visitId)}
                onAbrirFicha={abrirFicha && (() => abrirFicha(v.patientId, v.protocolId))}
                now={now}
                canOperate={canOperate}
                ocupados={ocupados}
                accentSolid={accent}
                onMover={(r, d) => void mover(r, d)}
              />
            ))}
          </>
        )}
        </div>
      </div>
    </div>
  )
}

/** El cuerpo de la tarjeta de un estudio: la cifra, la barra apilada y la leyenda (handoff §5.2). */
function CuerpoDeEstudio({ e }: { e: ResumenEstudio }) {
  const b = e.barra
  const totalBarra = b.vencidosSinDescargar + b.sinDescargar + b.descargados + b.evolucionados
  const segmentos = [
    { n: b.vencidosSinDescargar, color: 'color-mix(in srgb, var(--spira-danger) 45%, var(--spira-white))' },
    { n: b.sinDescargar, color: 'var(--spira-line-2)' },
    { n: b.descargados, color: '#3A6B8C' },
    { n: b.evolucionados, color: 'var(--spira-good)' },
  ].filter((s) => s.n > 0)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <span style={{ fontFamily: 'var(--spira-font-display)', fontWeight: 700, fontSize: 26, lineHeight: 1, fontVariantNumeric: 'tabular-nums', color: e.vencidos > 0 ? 'var(--spira-acc-deep-danger)' : 'var(--spira-ink)' }}>
          {e.pendientes}
        </span>
        <span style={{ fontSize: 12.5, color: 'var(--spira-ink-soft)' }}>
          {e.pendientes === 1 ? 'pendiente' : 'pendientes'} · {e.pacientes} pac.
        </span>
      </div>
      {totalBarra > 0 && (
        <span aria-hidden style={{ display: 'flex', gap: 2, height: 6 }}>
          {segmentos.map((s, i) => (
            <span key={i} style={{ flex: s.n, background: s.color, borderRadius: 'var(--spira-radius-pill)' }} />
          ))}
        </span>
      )}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, fontSize: 11.5, color: 'var(--spira-ink-soft)' }}>
        {e.vencidos > 0 && <Leyenda color="var(--spira-danger)" rotulo="Vencidos" n={e.vencidos} />}
        <Leyenda color="var(--spira-faint)" rotulo="Sin desc." n={b.vencidosSinDescargar + b.sinDescargar} />
        <Leyenda color="#3A6B8C" rotulo="Desc." n={b.descargados} />
      </div>
    </div>
  )
}

function Leyenda({ color, rotulo, n }: { color: string; rotulo: string; n: number }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap' }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, flex: '0 0 auto' }} />
      {rotulo} <b style={{ fontWeight: 700, color: 'var(--spira-ink)', fontVariantNumeric: 'tabular-nums' }}>{n}</b>
    </span>
  )
}

/**
 * Una fila de la tabla y, abierta, el panel con sus reportes.
 *
 * `div role="button"` y no `<button>` (7A): el nombre del paciente es un link a la ficha y un botón no
 * puede contener otro. La guarda del `onKeyDown` evita que Enter sobre el nombre abra la ficha Y
 * despliegue la fila. Conserva `.spira-no-press` porque es una FILA: se resalta, no se levanta.
 */
function FilaPaciente({ v, unEstudio, abierta, onAlternar, onAbrirFicha, now, canOperate, ocupados, accentSolid, onMover }: {
  v: PacienteVisita
  unEstudio: boolean
  abierta: boolean
  onAlternar: () => void
  onAbrirFicha?: () => void
  now: number
  canOperate: boolean
  ocupados: ReadonlySet<string>
  accentSolid: string
  onMover: (r: FilaReporte, destino: ReportStage) => void
}) {
  const tecla = (e: KeyboardEvent) => {
    if (e.target !== e.currentTarget) return
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onAlternar() }
  }
  return (
    <div style={{ borderTop: '1px solid var(--spira-line)' }}>
      <div
        role="button"
        tabIndex={0}
        aria-expanded={abierta}
        aria-label={`${v.patientName}, ${v.protocolCode} ${v.visitLabel}: ${abierta ? 'cerrar' : 'ver'} sus reportes`}
        onClick={onAlternar}
        onKeyDown={tecla}
        className="spira-row-link spira-no-press"
        style={{ ...grilla(unEstudio), padding: '14px 18px', cursor: 'pointer', alignItems: 'center', ...(abierta ? { backgroundColor: 'var(--spira-surface)' } : null) }}
      >
        <Icon name="chevronRight" size={16} color="var(--spira-ink-soft)" style={{ transform: abierta ? 'rotate(90deg)' : 'none', transition: 'transform .15s var(--spira-ease-out)' }} />
        <span className="spira-link-group" style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--spira-ink-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
            <PatientLink onOpen={onAbrirFicha} label={`Abrir la ficha de ${v.patientName}`}>{v.patientName}</PatientLink>
          </span>
          {onAbrirFicha && <PatientLinkArrow />}
        </span>
        <span className="spira-mono" style={{ fontSize: 13, color: 'var(--spira-ink-soft)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {v.ivrs ?? '—'}
        </span>
        <span style={{ fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {!unEstudio && <><span style={{ fontWeight: 600, color: 'var(--spira-ink)' }}>{v.protocolCode}</span><span style={{ color: 'var(--spira-ink-soft)' }}> · </span></>}
          <span style={{ color: unEstudio ? 'var(--spira-ink)' : 'var(--spira-ink-soft)' }}>{v.visitLabel}</span>
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
          <BarraDeReportes reportes={v.reportes} ancho={120} alto={8} now={now} />
          <ConteoDeReportes conteo={v.conteo} vencida={v.vencida} />
        </span>
        <span style={{ fontSize: 12.5, textAlign: 'right' }}><TextoPlazo plazo={v.plazo} /></span>
      </div>

      {abierta && (
        <div style={{ background: 'var(--spira-surface)', padding: '4px 18px 14px 58px' }}>
          {v.reportes.map((r) => (
            <div key={r.report_definition_id} style={renglon}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                <Icon name="fileText" size={15} color="var(--spira-muted)" />
                {/* Sólo el nombre del informe, como el handoff: en datos reales ya viene «Informe
                    Espirometria Pre», y `reporteTitulo` le sumaba «de Espirometría (Pre)». El
                    procedimiento queda en el tooltip, para desambiguar sin gastar ancho. */}
                <span title={reporteTitulo(r.report_name, r.procedure_name)} style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--spira-ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
                  {r.report_name}
                </span>
                <span style={{ color: 'var(--spira-faint)', flex: '0 0 auto' }}>·</span>
                <LinkAlPortal reporte={r} />
              </span>
              <EstadoDeReporte reporte={r} now={now} variante="chip" />
              {canOperate
                ? <AccionDeReporte reporte={r} busy={ocupados.has(claveReporte(r))} accentSolid={accentSolid} onStage={(d) => onMover(r, d)} />
                : <span />}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* Columnas de la tabla (handoff §5.5, con el nombre primero y el IVRS aparte por la regla de identidad
   de la casa, D4). La de la visita se ensancha cuando lleva también el estudio. */
const grilla = (unEstudio: boolean): CSSProperties => ({
  display: 'grid',
  gridTemplateColumns: `28px minmax(0,1fr) 110px ${unEstudio ? 80 : 150}px 230px 160px`,
  gap: 12,
})
const cabecera: CSSProperties = {
  padding: '10px 18px', background: 'var(--spira-surface)', fontSize: 11, fontWeight: 700,
  textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--spira-ink-soft)',
}
/* Scroll horizontal y no columnas aplastadas: con las fijas del handoff (28 + 110 + 150 + 230 + 160 + los
   huecos) por debajo de ~860 px el nombre del paciente quedaba en CERO (medido en un panel de 476 px).
   Mejor correr la tabla que perder la identidad de la fila. */
const ANCHO_MINIMO = 860
const tablaCaja: CSSProperties = {
  background: 'var(--spira-white)', border: '1px solid var(--spira-line)', borderRadius: 14, overflowX: 'auto',
}
const renglon: CSSProperties = {
  display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 130px 160px', gap: 12, alignItems: 'center',
  background: 'var(--spira-white)', border: '1px solid var(--spira-line)', borderRadius: 10,
  padding: '9px 14px', marginTop: 6,
}
const vacio: CSSProperties = { padding: 24, fontSize: 13, color: 'var(--spira-ink-soft)' }
const linkBtn: CSSProperties = {
  border: 'none', background: 'transparent', padding: 0, cursor: 'pointer', color: 'var(--spira-primary)',
  fontFamily: 'var(--spira-font-text)', fontWeight: 600, fontSize: 13,
}
