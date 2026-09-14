import { useMemo, useState } from 'react'
import type { CSSProperties, KeyboardEvent, ReactNode } from 'react'
import { Icon } from '../../../components/Icon'
import type { IconName } from '../../../components/Icon'
import { Modal } from '../../../components/Modal'
import { btnOutline, btnPrimary } from '../../../components/buttons'
import { fieldInput, fieldLabelStyle } from '../../../components/FormField'
import { useAuth } from '../../../lib/auth'
import { todayISO } from '../../../lib/dates'
import {
  anularPedidoReposicion, armarReposicion, configurarReposicion, diaMes, guardarDemoraCompra, mesDe,
  siguienteSinCargar, useInsumosDeReposicion,
} from '../../../data/pharma'
import type { ModoReposicion, Reposicion, RenglonReposicion } from '../../../data/pharma'
import { card, chip, chipActivo, sectionHint, sectionRule, sectionTitle } from './estilos'
import { VerPedido } from './VerPedido'

/**
 * ┌─ «Compras para octubre»: la card de reposición (docs/plan-reposicion-stock-minimo.md) ──────────┐
 *
 *   Compras para octubre ────────── A hoy, 05/09   [Demora de compra: 20 días]   [Ver pedido]
 *   ┌───────────────────────────────────────────────────────────────────────────────────────┐
 *   │ 18 envases  para comprar: 4 medicamentos en 2 estudios      Ver todos los medicamentos ⌄│  plegada (D44)
 *   │             Pedí antes del 11/09 · 1 sin cargar                                        │
 *   ├───────────────────────────────────────────────────────────────────────────────────────┤
 *   │ Seretide 250/50 · Aerosol ⚠      ASM-2301                              6 envases  ⌄   │  desplegada (D45)
 *   │   └ abierto: la cuenta, los avisos y «Cambiar cómo se repone»                          │
 *   │ Montelukast 10 mg                EPOC-118                     Sin cargar [Cargar]  ⌄   │
 *   └───────────────────────────────────────────────────────────────────────────────────────┘
 *
 * Toda la cuenta vive en `reposicionModel` (con tests); acá sólo se dibuja. Va arriba de Estadísticas y
 * fuera de sus cortes (D28): tiene su propia carga y su propio error, y no la mueve ningún filtro (D37).
 * El realce es elevación (botones) o resaltado (filas), nunca un borde de color.
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 */
export function ComprasDelMes({ accentSolid, angosto }: { accentSolid: string; angosto: boolean }) {
  const { hasMinRole } = useAuth()
  const puedeEditar = hasMinRole('pharma', 'operator')
  const hoy = todayISO()
  const q = useInsumosDeReposicion(hoy)
  const rep = useMemo(() => (q.data ? armarReposicion(q.data, hoy) : null), [q.data, hoy])

  const [desplegada, setDesplegada] = useState(false)
  const [abierto, setAbierto] = useState<string | null>(null)
  const [editando, setEditando] = useState<string | null>(null)
  const [verPedido, setVerPedido] = useState(false)
  const [editarDemora, setEditarDemora] = useState(false)
  const [deshaciendo, setDeshaciendo] = useState(false)
  const [errorDeshacer, setErrorDeshacer] = useState<string | null>(null)

  const mes = rep?.plazo.mes ?? mesDe(hoy, 1)
  const hayParaPedir = !!rep && rep.resumen.envases > 0

  function empezarACargar() {
    if (!rep) return
    const s = siguienteSinCargar(rep)
    setDesplegada(true)
    if (s) { setAbierto(s.clave); setEditando(s.clave) }
  }

  async function deshacer() {
    const grupo = rep?.resumen.ultimoGrupo?.grupo
    if (!grupo) return
    setDeshaciendo(true); setErrorDeshacer(null)
    const r = await anularPedidoReposicion(grupo)
    setDeshaciendo(false)
    if (r.error) { setErrorDeshacer(r.error); return }
    q.refetch()
  }

  return (
    <section aria-labelledby="compras-titulo" style={{ marginBottom: 28 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: angosto ? 'wrap' : 'nowrap', margin: '0 0 12px' }}>
        <h2 id="compras-titulo" style={sectionTitle}>Compras para {mes.nombre}</h2>
        <div style={{ ...sectionRule, minWidth: 24 }} />
        <div style={sectionHint}>A hoy, {diaMes(hoy)}</div>
        {rep && (puedeEditar ? (
          <button type="button" className="spira-card-link" style={botonChico} onClick={() => setEditarDemora(true)}>
            <Icon name="clock" size={14} color={accentSolid} />
            {rep.demoraCargada ? <>Demora de compra: <span className="spira-mono">{q.data?.demora_compra_dias}</span> días</> : 'Cargar la demora de compra'}
          </button>
        ) : rep.demoraCargada && (
          <span style={sectionHint}>Demora de compra: {q.data?.demora_compra_dias} días</span>
        ))}
        <button
          type="button"
          style={{ ...btnPrimary(accentSolid), height: 38, display: 'inline-flex', alignItems: 'center', gap: 8, opacity: hayParaPedir ? 1 : 0.5 }}
          disabled={!hayParaPedir}
          title={hayParaPedir ? undefined : 'No hay nada para pedir todavía'}
          onClick={() => setVerPedido(true)}
        >
          <Icon name="cart" size={16} /> Ver pedido
        </button>
      </div>

      <div style={card}>
        {q.loading && !rep ? (
          <Estado icono="cart" titulo="Calculando las compras…" texto="Un momento. El resto del informe sigue cargando por su lado." color={accentSolid} />
        ) : q.error ? (
          <Estado
            icono="alert" color="var(--spira-danger)"
            titulo="No se pudieron calcular las compras" texto={`${q.error} El informe del período no se ve afectado.`}
            accion={<button type="button" style={{ ...btnOutline, display: 'inline-flex', alignItems: 'center', gap: 8 }} onClick={q.refetch}><Icon name="rotateCcw" size={15} /> Reintentar</button>}
          />
        ) : rep && rep.renglones.length === 0 ? (
          <Estado icono="cart" color={accentSolid} titulo="No hay medicación de estudios para reponer" texto="Cuando un estudio tenga medicamentos asignados, aparecen acá." />
        ) : rep ? (
          <>
            <Resumen
              rep={rep} desplegada={desplegada} angosto={angosto} puedeEditar={puedeEditar} accentSolid={accentSolid}
              onDesplegar={() => setDesplegada((v) => !v)} onEmpezar={empezarACargar}
              onDeshacer={deshacer} deshaciendo={deshaciendo}
            />
            {errorDeshacer && <p role="alert" style={{ ...errorTexto, margin: '0 20px 12px' }}>{errorDeshacer}</p>}
            {desplegada && (
              <Lista
                rep={rep} angosto={angosto} puedeEditar={puedeEditar} accentSolid={accentSolid}
                abierto={abierto} editando={editando}
                onAbrir={(clave) => { setAbierto((a) => (a === clave ? null : clave)); if (editando && editando !== clave) setEditando(null) }}
                onEditar={(clave) => { setAbierto(clave); setEditando(clave) }}
                onCerrarEdicion={() => setEditando(null)}
                onGuardado={() => { setEditando(null); q.refetch() }}
              />
            )}
          </>
        ) : null}
      </div>

      {verPedido && rep && (
        <VerPedido
          rep={rep} hoy={hoy} accentSolid={accentSolid} puedeEditar={puedeEditar}
          onClose={() => setVerPedido(false)}
          onPedido={() => { setVerPedido(false); q.refetch() }}
        />
      )}
      {editarDemora && (
        <ModalDemora
          actual={q.data?.demora_compra_dias ?? null} accentSolid={accentSolid}
          onClose={() => setEditarDemora(false)}
          onGuardado={() => { setEditarDemora(false); q.refetch() }}
        />
      )}
    </section>
  )
}

/* ── El resumen (lo único que se ve plegada) ─────────────────────────────────────────────────────── */

function Resumen({ rep, desplegada, angosto, puedeEditar, accentSolid, onDesplegar, onEmpezar, onDeshacer, deshaciendo }: {
  rep: Reposicion
  desplegada: boolean
  angosto: boolean
  puedeEditar: boolean
  accentSolid: string
  onDesplegar: () => void
  onEmpezar: () => void
  onDeshacer: () => void
  deshaciendo: boolean
}) {
  const { resumen, plazo, renglones } = rep
  const total = renglones.length
  const cargados = renglones.filter((r) => r.estado !== 'sin_cargar').length
  const primerDia = cargados === 0
  // Pacientes activos sin NINGUNA medicación habilitada: no suman, y el número plegado no puede leerse
  // completo sin decirlo (en prod, 2026-09-14: 21 de 25). Tampoco se puede decir «cubierto» con ellos afuera.
  const sinMedicacion = rep.sinMedicacion.reduce((t, x) => t + x.enrolamientos, 0)
  const cubierto = resumen.envases === 0 && resumen.enCamino === 0 && resumen.sinCargar === 0 && sinMedicacion === 0
  const pedido = resumen.envases === 0 && resumen.enCamino > 0

  const desplegar = (
    <button type="button" aria-expanded={desplegada} onClick={onDesplegar} style={linkBoton}>
      {desplegada ? 'Plegar' : 'Ver todos los medicamentos'}
      <Icon name={desplegada ? 'chevronUp' : 'chevronDown'} size={14} color="var(--spira-muted)" />
    </button>
  )

  let numero: ReactNode = null
  let linea1: ReactNode
  if (primerDia) {
    linea1 = <strong>Falta cargar cómo se repone cada medicamento</strong>
  } else if (cubierto) {
    linea1 = (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 600, color: 'var(--spira-acc-deep-good)' }}>
        <Icon name="check" size={15} stroke={2} /> {mayuscula(plazo.mes.nombre)} está cubierto
      </span>
    )
  } else if (pedido) {
    numero = <Numero n={0} />
    linea1 = (
      <>para comprar · <strong>{envases(resumen.enCamino)} en camino</strong>
        {resumen.ultimoGrupo && <>, pedidos el {diaMes(resumen.ultimoGrupo.pedido_el)}</>}</>
    )
  } else {
    numero = <Numero n={resumen.envases} />
    linea1 = resumen.envases > 0
      ? <>para comprar: <strong>{plural(resumen.medicamentos, 'medicamento', 'medicamentos')}</strong> en {plural(resumen.estudios, 'estudio', 'estudios')}
        {resumen.enCamino > 0 && <> · {envases(resumen.enCamino)} en camino</>}</>
      : <>para comprar por ahora</>
  }

  const partes: ReactNode[] = []
  if (primerDia) {
    partes.push(<span key="c"><span className="spira-mono">{cargados} de {total}</span> cargados · los que faltan no cuentan como cero</span>)
  } else {
    partes.push(pedido
      ? <span key="p" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Icon name="truck" size={13} color={accentSolid} /> Se descuentan solos al recibirlos</span>
      : <LineaPlazo key="p" rep={rep} accentSolid={accentSolid} />)
    if (resumen.sinCargar > 0) partes.push(<span key="s" style={{ color: 'var(--spira-acc-deep-warn)' }}>{resumen.sinCargar} sin cargar</span>)
    if (pedido && puedeEditar && resumen.ultimoGrupo) {
      partes.push(<button key="d" type="button" style={linkBoton} onClick={onDeshacer} disabled={deshaciendo}>{deshaciendo ? 'Deshaciendo…' : 'Deshacer'}</button>)
    }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: angosto ? 12 : 20, flexWrap: angosto ? 'wrap' : 'nowrap', padding: '16px 20px', borderBottom: desplegada ? '1px solid var(--spira-line-2)' : 'none' }}>
      {numero && <div aria-live="polite">{numero}</div>}
      <div style={{ flex: 1, minWidth: angosto ? '100%' : 0, order: angosto && numero ? 1 : 0 }}>
        <div style={{ fontSize: 13.5, color: 'var(--spira-ink)' }}>{linea1}</div>
        <div style={{ fontSize: 12.5, color: 'var(--spira-ink-soft)', marginTop: 3, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          {partes.map((p, i) => <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>{i > 0 && <span aria-hidden style={{ color: 'var(--spira-line-2)' }}>·</span>}{p}</span>)}
        </div>
        {sinMedicacion > 0 && (
          <div style={{ fontSize: 12.5, color: 'var(--spira-acc-deep-warn)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <Icon name="alert" size={13} stroke={1.9} />
            <span>{plural(sinMedicacion, 'paciente activo', 'pacientes activos')} sin medicación habilitada: no {sinMedicacion === 1 ? 'está' : 'están'} en la cuenta</span>
            {!desplegada && <button type="button" style={linkBoton} onClick={onDesplegar}>· Ver por estudio</button>}
          </div>
        )}
      </div>
      {primerDia && puedeEditar
        ? <button type="button" style={{ ...btnPrimary(accentSolid), height: 36 }} onClick={onEmpezar}>Empezar a cargar</button>
        : desplegar}
    </div>
  )
}

function LineaPlazo({ rep, accentSolid }: { rep: Reposicion; accentSolid: string }) {
  const { plazo } = rep
  if (!rep.demoraCargada || !plazo.limite) {
    return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Icon name="info" size={13} /> Cargá la demora de compra para saber hasta cuándo pedir</span>
  }
  if (plazo.aTiempo) {
    return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Icon name="calendar" size={13} color={accentSolid} /> Pedí antes del {diaMes(plazo.limite)}</span>
  }
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--spira-acc-deep-warn)' }}>
      <Icon name="alert" size={13} stroke={1.9} />
      Ya es tarde para {plazo.mes.nombre}: lo que pidas hoy llega el {plazo.llega ? diaMes(plazo.llega) : '—'}
      {plazo.siguienteAlcanzable && <span style={{ color: 'var(--spira-ink-soft)' }}> · para {plazo.siguienteAlcanzable.mes.nombre}, antes del {diaMes(plazo.siguienteAlcanzable.limite)}</span>}
    </span>
  )
}

/* ── La lista de todos los medicamentos (D45) ─────────────────────────────────────────────────────── */

function Lista({ rep, angosto, puedeEditar, accentSolid, abierto, editando, onAbrir, onEditar, onCerrarEdicion, onGuardado }: {
  rep: Reposicion
  angosto: boolean
  puedeEditar: boolean
  accentSolid: string
  abierto: string | null
  editando: string | null
  onAbrir: (clave: string) => void
  onEditar: (clave: string) => void
  onCerrarEdicion: () => void
  onGuardado: () => void
}) {
  const cols: CSSProperties = angosto
    ? { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto 40px', alignItems: 'center' }
    : { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 150px 210px 40px', alignItems: 'center' }
  return (
    <div>
      {!angosto && (
        <div style={{ ...cols, borderBottom: '1px solid var(--spira-line-2)' }}>
          <div style={th}>Medicamento</div>
          <div style={th}>Estudio</div>
          <div style={{ ...th, textAlign: 'right' }}>Para {rep.plazo.mes.nombre}</div>
          <div />
        </div>
      )}
      {rep.renglones.map((r, i) => {
        const estaAbierto = abierto === r.clave
        const ultimo = i === rep.renglones.length - 1
        return (
          <div key={r.clave} style={{ borderBottom: ultimo && !estaAbierto ? 'none' : '1px solid var(--spira-line)' }}>
            <div
              className="spira-row-link spira-no-press"
              style={{ ...cols, minHeight: 50, cursor: 'pointer', background: estaAbierto ? 'var(--spira-surface)' : undefined }}
              onClick={() => onAbrir(r.clave)}
            >
              <div style={{ padding: '10px 16px', minWidth: 0 }}>
                <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', opacity: r.estado === 'sin_cargar' || r.estado === 'no_se_compra' ? 0.85 : 1 }}>
                  <span style={{ fontSize: 14, color: 'var(--spira-ink)' }}>{r.nombre}</span>
                  {r.presentacion && <span style={{ fontSize: 12, color: 'var(--spira-ink-soft)' }}> · {r.presentacion}</span>}
                  {r.avisos.some((a) => a.ambar) && (
                    <span role="img" aria-label={r.avisos.filter((a) => a.ambar).map((a) => a.texto).join('. ')} style={{ display: 'inline-block', verticalAlign: -2, marginLeft: 6 }}>
                      <Icon name="alert" size={13} stroke={1.9} color="var(--spira-acc-deep-warn)" />
                    </span>
                  )}
                </div>
                {angosto && <div style={{ marginTop: 2 }}><Estudio r={r} /></div>}
              </div>
              {!angosto && <div style={{ padding: '10px 16px' }}><Estudio r={r} /></div>}
              <div style={{ padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
                <Derecha r={r} puedeEditar={puedeEditar} accentSolid={accentSolid} onCargar={() => onEditar(r.clave)} />
              </div>
              <button
                type="button"
                aria-expanded={estaAbierto}
                aria-label={`${estaAbierto ? 'Cerrar' : 'Abrir'} el detalle de ${r.nombre} en ${r.estudio.code}`}
                onClick={(e) => { e.stopPropagation(); onAbrir(r.clave) }}
                style={{ ...linkBoton, justifySelf: 'center', padding: 6 }}
              >
                <Icon name={estaAbierto ? 'chevronUp' : 'chevronDown'} size={16} color="var(--spira-muted)" />
              </button>
            </div>
            {estaAbierto && (
              editando === r.clave && puedeEditar
                ? <FormularioReposicion r={r} mes={rep.plazo.mes.nombre} accentSolid={accentSolid} onCancelar={onCerrarEdicion} onGuardado={onGuardado} />
                : <Detalle r={r} rep={rep} puedeEditar={puedeEditar} accentSolid={accentSolid} onCambiar={() => onEditar(r.clave)} />
            )}
          </div>
        )
      })}
      {rep.sinMedicacion.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', borderTop: '1px solid var(--spira-line)', background: 'var(--spira-surface)', fontSize: 12, color: 'var(--spira-ink-soft)' }}>
          <Icon name="info" size={14} />
          <span>
            Pacientes en screening o activos sin ninguna medicación habilitada, que no suman:{' '}
            {rep.sinMedicacion.map((s) => `${s.estudio.code}: ${s.enrolamientos}`).join(' · ')}
          </span>
        </div>
      )}
    </div>
  )
}

function Estudio({ r }: { r: RenglonReposicion }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <span className="spira-mono" style={{ fontSize: 13, fontWeight: 600, color: 'var(--spira-ink)' }}>{r.estudio.code}</span>
      {r.estudio.status === 'pausado' && (
        <span style={{ fontSize: 10.5, fontWeight: 600, padding: '2px 8px', borderRadius: 999, color: 'var(--spira-acc-deep-warn)', background: 'rgba(176, 130, 63, 0.20)' }}>Pausado</span>
      )}
    </span>
  )
}

function Derecha({ r, puedeEditar, accentSolid, onCargar }: { r: RenglonReposicion; puedeEditar: boolean; accentSolid: string; onCargar: () => void }) {
  switch (r.estado) {
    case 'comprar':
      return <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 6 }}><span className="spira-mono" style={{ fontFamily: 'var(--spira-font-display)', fontSize: 18, fontWeight: 700, color: 'var(--spira-ink)' }}>{r.comprar}</span><Unidad n={r.comprar} /></span>
    case 'alcanza':
      return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12.5, fontWeight: 600, color: 'var(--spira-acc-deep-good)' }}><Icon name="check" size={14} stroke={2} /> Alcanza</span>
    case 'en_camino':
      return <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--spira-ink)' }}><span className="spira-mono">{r.cuenta.enCamino}</span> en camino</span>
    case 'no_se_compra':
      return <span style={{ fontSize: 12.5, color: 'var(--spira-muted)' }}>No se compra</span>
    case 'sin_cargar':
      return (
        <>
          <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--spira-acc-deep-warn)' }}>Sin cargar</span>
          {puedeEditar && (
            <button type="button" className="spira-card-link" style={botonChico} onClick={(e) => { e.stopPropagation(); onCargar() }}>
              <Icon name="pencil" size={13} color={accentSolid} /> Cargar
            </button>
          )}
        </>
      )
  }
}

/* ── El renglón abierto: la cuenta y los avisos ───────────────────────────────────────────────────── */

function Detalle({ r, rep, puedeEditar, accentSolid, onCambiar }: { r: RenglonReposicion; rep: Reposicion; puedeEditar: boolean; accentSolid: string; onCambiar: () => void }) {
  const m = rep.plazo.mes.nombre
  const c = r.cuenta
  const primero = `1/${rep.plazo.mes.desde.slice(5, 7).replace(/^0/, '')}`
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 340px) minmax(0, 1fr)', gap: 36, padding: '6px 20px 16px 16px', background: 'var(--spira-surface)' }}>
      <div>
        {r.estado === 'sin_cargar' && <p style={{ fontSize: 13, color: 'var(--spira-ink-soft)', margin: '6px 0' }}>Todavía no se cargó cómo se repone: no suma a la compra.</p>}
        {r.estado === 'no_se_compra' && <p style={{ fontSize: 13, color: 'var(--spira-ink-soft)', margin: '6px 0' }}>Marcado como que no se compra: queda fuera de la cuenta.</p>}
        {r.modo === 'mensual' && (
          <>
            <LineaCuenta label={`${mayuscula(m)}: ${plural(c.pacientesMes, 'paciente', 'pacientes')} × ${r.envasesPorMes ?? '—'} por mes`} valor={String(c.necesidad)} />
            {c.faltaEsteMes > 0 && <LineaCuenta label="Faltan entregar este mes y no alcanzan" valor={`+ ${c.faltaEsteMes}`} />}
            <LineaCuenta label={`Quedan al ${primero}`} valor={`− ${c.alComienzo}`} />
            {c.enCamino > 0 && <LineaCuenta label="En camino" valor={`− ${c.enCamino}`} />}
            <LineaCuenta label="A comprar" valor={envases(r.comprar)} fuerte />
          </>
        )}
        {r.modo === 'a_demanda' && (
          <>
            <LineaCuenta label="Tener siempre (a demanda)" valor={String(c.stockFijo ?? 0)} />
            <LineaCuenta label={`Quedan al ${primero}`} valor={`− ${c.alComienzo}`} />
            {c.enCamino > 0 && <LineaCuenta label="En camino" valor={`− ${c.enCamino}`} />}
            <LineaCuenta label="A comprar" valor={envases(r.comprar)} fuerte />
          </>
        )}
      </div>
      <div>
        {r.avisos.map((a) => (
          <div key={a.tipo + a.texto} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '6px 0', fontSize: 12.5, lineHeight: 1.45, color: a.ambar ? 'var(--spira-acc-deep-warn)' : 'var(--spira-ink)' }}>
            <span style={{ flex: '0 0 14px', marginTop: 2 }}><Icon name={a.ambar ? 'alert' : 'info'} size={14} stroke={1.9} color={a.ambar ? 'var(--spira-acc-deep-warn)' : 'var(--spira-ink-soft)'} /></span>
            <span>{a.texto}.</span>
          </div>
        ))}
        {r.pedidos.map((p) => (
          <div key={p.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '6px 0', fontSize: 12.5, color: 'var(--spira-ink)' }}>
            <span style={{ flex: '0 0 14px', marginTop: 2 }}><Icon name="truck" size={14} color="var(--spira-ink-soft)" /></span>
            <span>Pedido el {diaMes(p.pedido_el)}: faltan recibir {envases(p.pendiente)}.</span>
          </div>
        ))}
        {(r.modo === 'mensual' || r.modo === 'a_demanda') && (
          <div style={{ padding: '6px 0', fontSize: 12, color: 'var(--spira-ink-soft)' }}>
            Salieron {envases(r.salidas90d)} en los últimos 90 días. Es referencia: no cambia la compra.
          </div>
        )}
        {puedeEditar && (
          <button type="button" className="spira-card-link" style={{ ...botonChico, marginTop: 8 }} onClick={onCambiar}>
            <Icon name="pencil" size={13} color={accentSolid} /> {r.estado === 'sin_cargar' ? 'Cargar cómo se repone' : 'Cambiar cómo se repone'}
          </button>
        )}
      </div>
    </div>
  )
}

function LineaCuenta({ label, valor, fuerte = false }: { label: string; valor: string; fuerte?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, padding: fuerte ? '9px 0 5px' : '5px 0', borderTop: fuerte ? '1px solid var(--spira-line-2)' : 'none', marginTop: fuerte ? 4 : 0 }}>
      <span style={{ flex: 1, fontSize: 13, color: fuerte ? 'var(--spira-ink)' : 'var(--spira-ink-soft)', fontWeight: fuerte ? 600 : 400 }}>{label}</span>
      <span className="spira-mono" style={{ fontSize: fuerte ? 15 : 13.5, color: 'var(--spira-ink)', fontWeight: fuerte ? 700 : 400 }}>{valor}</span>
    </div>
  )
}

/* ── Cargar cómo se repone (D2-D4, D25) ───────────────────────────────────────────────────────────── */

const MODOS: { valor: ModoReposicion; label: string }[] = [
  { valor: 'mensual', label: 'Por mes' },
  { valor: 'a_demanda', label: 'A demanda' },
  { valor: 'no_se_compra', label: 'No se compra' },
]

function FormularioReposicion({ r, mes, accentSolid, onCancelar, onGuardado }: {
  r: RenglonReposicion
  mes: string
  accentSolid: string
  onCancelar: () => void
  onGuardado: () => void
}) {
  const [modo, setModo] = useState<ModoReposicion>(r.modo ?? 'mensual')
  const [cantidad, setCantidad] = useState(() => {
    if (r.modo === 'mensual') return String(r.envasesPorMes ?? 1)
    if (r.modo === 'a_demanda') return String(r.cuenta.stockFijo ?? 0)
    return '1'
  })
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const n = Number(cantidad)
  const valida = modo === 'no_se_compra' || (Number.isInteger(n) && (modo === 'mensual' ? n >= 1 : n >= 0))

  async function guardar() {
    if (!valida || guardando) return
    setGuardando(true); setError(null)
    const res = await configurarReposicion({
      protocolMedicationId: r.protocolMedicationId,
      modo,
      envasesPorMes: modo === 'mensual' ? n : null,
      stockFijo: modo === 'a_demanda' ? n : null,
    })
    setGuardando(false)
    if (res.error) { setError(res.error); return }
    onGuardado()
  }

  function teclasModo(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
    e.preventDefault()
    const i = MODOS.findIndex((x) => x.valor === modo)
    const j = (i + (e.key === 'ArrowRight' ? 1 : MODOS.length - 1)) % MODOS.length
    setModo(MODOS[j].valor)
    ;(e.currentTarget.children[j] as HTMLElement | undefined)?.focus()
  }

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); void guardar() }}
      onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onCancelar() } }}
      style={{ padding: '6px 16px 18px', background: 'var(--spira-surface)' }}
    >
      <div style={{ display: 'flex', gap: 32, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div>
          <div id={`modo-${r.clave}`} style={{ ...fieldLabelStyle, marginBottom: 6 }}>Cómo se repone</div>
          <div role="radiogroup" aria-labelledby={`modo-${r.clave}`} onKeyDown={teclasModo} style={{ display: 'inline-flex', gap: 7 }}>
            {MODOS.map((m) => (
              <button
                key={m.valor} type="button" role="radio" aria-checked={modo === m.valor} tabIndex={modo === m.valor ? 0 : -1}
                onClick={() => setModo(m.valor)} style={{ ...chip, ...(modo === m.valor ? chipActivo : null) }}
                autoFocus={m.valor === modo}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
        {modo !== 'no_se_compra' && (
          <label style={{ display: 'block' }}>
            <div style={{ ...fieldLabelStyle, marginBottom: 6 }}>{modo === 'mensual' ? 'Envases por paciente, por mes' : 'Tener siempre en el estante'}</div>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
              <input
                type="number" inputMode="numeric" min={modo === 'mensual' ? 1 : 0} step={1}
                value={cantidad} onChange={(e) => setCantidad(e.target.value)}
                style={{ ...fieldInput, width: 96 }} className="spira-mono"
              />
              <span style={{ fontSize: 13, color: 'var(--spira-ink-soft)' }}>{n === 1 ? 'envase' : 'envases'}</span>
            </span>
          </label>
        )}
        <div style={{ fontSize: 12.5, color: 'var(--spira-ink-soft)', paddingBottom: 12, maxWidth: 420 }}>
          {modo === 'mensual' && <>{plural(r.cuenta.pacientesMes, 'paciente sigue', 'pacientes siguen')} en {mes}. Si alguno usa otra cantidad, se cambia en su medicación.</>}
          {modo === 'a_demanda' && <>Para lo que no se usa todos los meses, como el rescate. No mira pacientes.</>}
          {modo === 'no_se_compra' && <>Lo manda el sponsor o no se repone: queda fuera de la cuenta.</>}
        </div>
      </div>
      {error && <p role="alert" style={{ ...errorTexto, marginTop: 12 }}>{error}</p>}
      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <button type="submit" disabled={!valida || guardando} style={{ ...btnPrimary(accentSolid), opacity: !valida || guardando ? 0.6 : 1 }}>
          {guardando ? 'Guardando…' : 'Guardar'}
        </button>
        <button type="button" onClick={onCancelar} style={btnOutline}>Cancelar</button>
      </div>
    </form>
  )
}

/* ── La demora de compra (D6) ─────────────────────────────────────────────────────────────────────── */

function ModalDemora({ actual, accentSolid, onClose, onGuardado }: { actual: number | null; accentSolid: string; onClose: () => void; onGuardado: () => void }) {
  const [dias, setDias] = useState(actual == null ? '' : String(actual))
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const n = Number(dias)
  const valida = dias.trim() !== '' && Number.isInteger(n) && n >= 0 && n <= 365

  async function guardar() {
    if (!valida || guardando) return
    setGuardando(true); setError(null)
    const r = await guardarDemoraCompra(n)
    setGuardando(false)
    if (r.error) { setError(r.error); return }
    onGuardado()
  }

  return (
    <Modal title="Demora de compra" onClose={onClose} maxWidth={440}>
      <form onSubmit={(e) => { e.preventDefault(); void guardar() }}>
        <p style={{ fontSize: 13, color: 'var(--spira-muted)', lineHeight: 1.5, margin: '0 0 14px' }}>
          Cuántos días pasan desde que se pide hasta que llega. Vale para todos los estudios y define la fecha límite para pedir.
        </p>
        <label style={{ display: 'block' }}>
          <div style={{ ...fieldLabelStyle, marginBottom: 6 }}>Días</div>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
            <input type="number" inputMode="numeric" min={0} max={365} step={1} autoFocus value={dias} onChange={(e) => setDias(e.target.value)} style={{ ...fieldInput, width: 96 }} className="spira-mono" />
            <span style={{ fontSize: 13, color: 'var(--spira-ink-soft)' }}>días</span>
          </span>
        </label>
        {error && <p role="alert" style={{ ...errorTexto, marginTop: 12 }}>{error}</p>}
        <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
          <button type="button" onClick={onClose} style={btnOutline}>Cancelar</button>
          <div style={{ flex: 1 }} />
          <button type="submit" disabled={!valida || guardando} style={{ ...btnPrimary(accentSolid), opacity: !valida || guardando ? 0.6 : 1 }}>
            {guardando ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

/* ── Piezas ───────────────────────────────────────────────────────────────────────────────────────── */

function Estado({ icono, color, titulo, texto, accion }: { icono: IconName; color: string; titulo: string; texto: string; accion?: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '20px 22px' }}>
      <span style={{ width: 44, height: 44, borderRadius: 12, background: 'var(--spira-surface)', display: 'grid', placeItems: 'center', flex: '0 0 auto' }}>
        <Icon name={icono} size={21} color={color} stroke={1.9} />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: 'var(--spira-font-display)', fontSize: 15.5, fontWeight: 700, color: 'var(--spira-ink)' }}>{titulo}</div>
        <div style={{ fontSize: 13, color: 'var(--spira-muted)', marginTop: 3, lineHeight: 1.45 }}>{texto}</div>
      </div>
      {accion}
    </div>
  )
}

function Numero({ n }: { n: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
      <span className="spira-mono" style={{ fontFamily: 'var(--spira-font-display)', fontSize: 30, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--spira-ink)', lineHeight: 1 }}>{n}</span>
      <span style={{ fontFamily: 'var(--spira-font-display)', fontSize: 15, fontWeight: 600, color: 'var(--spira-muted)' }}>{n === 1 ? 'envase' : 'envases'}</span>
    </div>
  )
}

function Unidad({ n }: { n: number }) {
  return <span style={{ fontFamily: 'var(--spira-font-display)', fontSize: 13, fontWeight: 600, color: 'var(--spira-muted)' }}>{n === 1 ? 'envase' : 'envases'}</span>
}

const envases = (n: number) => `${n} ${n === 1 ? 'envase' : 'envases'}`
const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`
const mayuscula = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

const th: CSSProperties = {
  padding: '11px 16px 9px', fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
  color: 'var(--spira-ink-soft)', whiteSpace: 'nowrap',
}

/** Botón chico con borde (el `modalHeaderBtn` de la ficha). El borde lo pone `.spira-card-link`. */
const botonChico: CSSProperties = {
  height: 32, borderRadius: 10, background: 'var(--spira-white)', cursor: 'pointer',
  fontFamily: 'var(--spira-font-text)', fontSize: 12.5, fontWeight: 600, color: 'var(--spira-ink)',
  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0 11px', flex: '0 0 auto',
}

const linkBoton: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 5, background: 'transparent', border: 'none', cursor: 'pointer',
  fontFamily: 'var(--spira-font-text)', fontSize: 12.5, fontWeight: 600, color: 'var(--spira-muted)', padding: 0,
}

const errorTexto: CSSProperties = {
  fontSize: 13, color: 'var(--spira-acc-deep-danger)', background: 'rgba(166, 72, 59, 0.10)', borderRadius: 8, padding: '9px 12px',
}
