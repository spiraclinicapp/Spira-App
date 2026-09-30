import { useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { Icon } from '../../../components/Icon'
import { formatAR } from '../../../lib/dates'
import { reglaDeReposicion, textoEstante, textoPacientesQueSuman } from '../../../data/pharma'
import type { Boleta, Libro, MarcaPaciente, PacienteDelRenglon, RenglonDelPeriodo } from '../../../data/pharma'
import { CargarReposicion } from './CargarReposicion'
import { AvisoLinea, Envases, Etiqueta, botonChico, plural, versalita } from './piezas'

/**
 * Handoff «Reposición: tabla y renglón abierto» (docs/design_handoff_reposicion_renglon, 2026-09-29).
 *
 * La tabla quedó en cuatro columnas: medicamento, pacientes, en el estante y a comprar. Había/entró/salió/hay
 * se juntaron en «En el estante» (el número de hoy, y abajo de dónde salió), y «Mínimo» se fue: repetía el
 * número de «Comprar», y lo que explica se lee ahora en la cuenta del renglón abierto.
 *
 * El renglón abierto son tres bloques, en este orden: por qué hay que comprar N (la cuenta como ecuación),
 * los pacientes que lo reciben (los avisos que antes iban al pie, ahora en la fila de cada uno) y los
 * movimientos del estante en el período.
 */
const FIJAS = [120, 190, 200, 44]
/** Las mismas columnas en un contenedor angosto (el mock, por debajo de 860 px). */
const FIJAS_ANGOSTAS = [90, 150, 150, 36]
const grilla = (fijas: number[]) => `minmax(0, 1fr) ${fijas.map((px) => `${px}px`).join(' ')}`
export const columnasDe = (angosto: boolean) => grilla(angosto ? FIJAS_ANGOSTAS : FIJAS)
/**
 * Lo que tiene que quedarle al nombre: 200 px de texto más el padding de la celda. Con 200 entran enteros
 * todos los medicamentos que hay hoy salvo el más largo («Trelegy Ellipta (92) 92/55/22 mcg», 222 px), que
 * se corta con puntos.
 */
const NOMBRE_MINIMO = 200 + 40
/**
 * El ancho de CONTENEDOR por debajo del cual la tabla pasa a las columnas angostas: hoy 794 px. Sale de las
 * mismas columnas, así que si una cambia, el umbral la acompaña. Es un solo corte para toda la pantalla: el
 * resumen y los pedidos cambian de forma junto con la tabla.
 */
export const ANCHO_TABLA_ANCHA = FIJAS.reduce((s, px) => s + px, 0) + NOMBRE_MINIMO

export const celda = (angosto: boolean): CSSProperties => ({ padding: angosto ? '12px 12px' : '14px 20px', minWidth: 0 })
const sub: CSSProperties = { fontSize: 12, color: 'var(--spira-ink-soft)', marginTop: 3 }
const numeroMedio: CSSProperties = { fontSize: 15, fontWeight: 600, color: 'var(--spira-ink)' }
const flechaRenglon: CSSProperties = {
  justifySelf: 'center', width: 32, height: 32, display: 'grid', placeItems: 'center',
  background: 'transparent', border: 'none', cursor: 'pointer', padding: 0,
}
const rotuloBloque: CSSProperties = { ...versalita, fontSize: 10.5, letterSpacing: '0.08em' }
const nota: CSSProperties = { fontSize: 13, color: 'var(--spira-ink-soft)', margin: 0 }

export function FilaMedicamento({ r, enCurso, ultimo, angosto, puedeEditar, accentSolid, abierto, editando, contexto, onAlternar, onEditar, onCerrarEdicion, onGuardado, onVerFicha }: {
  r: RenglonDelPeriodo
  enCurso: boolean
  ultimo: boolean
  angosto: boolean
  puedeEditar: boolean
  accentSolid: string
  abierto: boolean
  editando: boolean
  /** La frase del pedido tarde, arriba de la ecuación; null si no se pide tarde. */
  contexto: string | null
  onAlternar: () => void
  onEditar: () => void
  onCerrarEdicion: () => void
  onGuardado: () => void
  /** Abre la ficha del paciente de esa inscripción; devuelve false si no se pudo. Sin esto, no hay «Ver ficha». */
  onVerFicha?: (enrollmentId: string) => Promise<boolean>
}) {
  const avisos = r.avisos.filter((a) => a.ambar).length
  const regla = reglaDeReposicion(r)
  const detalle = [r.presentacion, regla].filter(Boolean).join(' · ')
  const td = celda(angosto)

  return (
    <div style={{ borderBottom: ultimo && !abierto ? 'none' : '1px solid var(--spira-line)' }}>
      {/* La fila se RESALTA, no se levanta (tokens.css: una fila que se mueve 1px lee como temblor). */}
      <div
        className="spira-row-link spira-no-press"
        onClick={onAlternar}
        style={{ display: 'grid', gridTemplateColumns: columnasDe(angosto), alignItems: 'center', cursor: 'pointer', background: abierto ? 'var(--spira-surface)' : undefined }}
      >
        <div style={td}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 15, color: 'var(--spira-ink)', flexWrap: angosto ? 'wrap' : 'nowrap' }}>
            <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>{r.nombre}</span>
            {/* RD14: el aviso lleva texto, no sólo el ícono. Se queda aunque el mock no lo dibuje: con el renglón
                cerrado es lo único que dice que hay un vencimiento o una presentación que no suma. */}
            {avisos > 0 && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11.5, fontWeight: 600, color: 'var(--spira-acc-deep-warn)', whiteSpace: 'nowrap', flex: '0 0 auto' }}>
                <Icon name="alert" size={13} stroke={1.9} />{plural(avisos, 'aviso', 'avisos')}
              </span>
            )}
          </div>
          {detalle && <div style={sub}>{detalle}</div>}
        </div>
        <div style={{ ...td, textAlign: 'right' }}>
          {r.modo === 'a_demanda'
            ? <span style={{ color: 'var(--spira-muted)' }}>—</span>
            : <span className="spira-mono" style={numeroMedio}>{r.pacientes}</span>}
        </div>
        <div style={{ ...td, textAlign: 'right' }}>
          <span className="spira-mono" style={numeroMedio}>{r.libro.hay}</span>
          <div className="spira-mono" style={sub}>{textoEstante(r.libro)}</div>
        </div>
        <div style={{ ...td, textAlign: 'right' }}>
          <AComprar r={r} puedeEditar={puedeEditar && enCurso} accentSolid={accentSolid} onCargar={onEditar} />
        </div>
        <button
          type="button" aria-expanded={abierto}
          aria-label={`${abierto ? 'Cerrar' : 'Abrir'} el detalle de ${r.nombre}`}
          onClick={(ev) => { ev.stopPropagation(); onAlternar() }}
          style={flechaRenglon}
        >
          <Icon name={abierto ? 'chevronUp' : 'chevronDown'} size={16} color="var(--spira-ink-soft)" />
        </button>
      </div>
      {abierto && (
        <div style={{ padding: angosto ? '6px 12px 20px' : '6px 20px 22px', background: 'var(--spira-surface)', display: 'flex', flexDirection: 'column', gap: 24 }}>
          {editando && puedeEditar && enCurso
            ? <CargarReposicion r={r} accentSolid={accentSolid} onCancelar={onCerrarEdicion} onGuardado={onGuardado} />
            : <RenglonAbierto r={r} enCurso={enCurso} contexto={contexto} regla={regla} puedeEditar={puedeEditar} accentSolid={accentSolid} onCambiar={onEditar} onVerFicha={onVerFicha} />}
        </div>
      )}
    </div>
  )
}

/** La celda «A comprar»: el número, o «Alcanza», o por qué no hay cuenta. Debajo, lo que está en camino. */
function AComprar({ r, puedeEditar, accentSolid, onCargar }: { r: RenglonDelPeriodo; puedeEditar: boolean; accentSolid: string; onCargar: () => void }): ReactNode {
  const enCamino = r.enCamino > 0 && <div style={sub}><span className="spira-mono">{r.enCamino}</span> en camino</div>
  switch (r.estado) {
    case 'comprar':
      return <><Envases n={r.comprar} />{enCamino}</>
    case 'en_camino':
    case 'alcanza':
      return <><Etiqueta tono="ok" punto>Alcanza</Etiqueta>{enCamino}</>
    case 'no_se_compra':
      return <span style={{ fontSize: 12.5, color: 'var(--spira-ink-soft)' }}>No se compra</span>
    case 'sin_cargar':
      return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--spira-acc-deep-warn)' }}>Sin cargar</span>
          {puedeEditar && (
            <button type="button" className="spira-card-link" style={botonChico} onClick={(ev) => { ev.stopPropagation(); onCargar() }}>
              <Icon name="pencil" size={13} color={accentSolid} /> Cargar
            </button>
          )}
        </div>
      )
    case 'sin_cuenta':
      // R6: fuera del período en curso no se calcula la compra. «Alcanza» sería un dato inventado.
      return <span style={{ color: 'var(--spira-muted)' }} aria-label="Sin cuenta: el período no está en curso">—</span>
  }
}

/** Los tres bloques del renglón abierto y el pie. En un período cerrado, sólo los movimientos. */
function RenglonAbierto({ r, enCurso, contexto, regla, puedeEditar, accentSolid, onCambiar, onVerFicha }: {
  r: RenglonDelPeriodo
  enCurso: boolean
  contexto: string | null
  regla: string | null
  puedeEditar: boolean
  accentSolid: string
  onCambiar: () => void
  onVerFicha?: (enrollmentId: string) => Promise<boolean>
}) {
  if (!enCurso) return <Movimientos libro={r.libro} enCurso={false} />
  const vence = r.avisos.filter((a) => a.tipo === 'vence')
  const hoy = r.modo === 'mensual' ? `Hoy: ${regla} por paciente` : r.modo === 'a_demanda' ? `Hoy: ${regla}` : r.modo === 'no_se_compra' ? 'Hoy: no se compra' : null
  return (
    <>
      {r.estado === 'sin_cargar' && <p style={nota}>Todavía no se cargó cómo se repone: no suma a la compra.</p>}
      {r.estado === 'no_se_compra' && <p style={nota}>Marcado como que no se compra: queda fuera de la cuenta.</p>}
      {r.boleta && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={rotuloBloque}>{r.boleta.aComprar > 0 ? `Por qué hay que comprar ${r.boleta.aComprar}` : 'Por qué alcanza'}</div>
          {contexto && <div style={{ fontSize: 13, color: 'var(--spira-ink-soft)', lineHeight: 1.5, maxWidth: 720, textWrap: 'pretty' }}>{contexto}</div>}
          <Ecuacion b={r.boleta} />
          {vence.length > 0 && (
            <div style={{ maxWidth: 560 }}>
              {vence.map((a) => <AvisoLinea key={a.texto} tono="warn" texto={`${a.texto}.`} />)}
            </div>
          )}
        </div>
      )}
      {r.modo === 'mensual' && r.boleta && <Pacientes ps={r.detallePacientes} onVerFicha={onVerFicha} />}
      <Movimientos libro={r.libro} enCurso />
      {(puedeEditar || hoy) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          {puedeEditar && (
            <button type="button" className="spira-card-link" style={botonChico} onClick={onCambiar}>
              <Icon name="pencil" size={13} color={accentSolid} /> {r.estado === 'sin_cargar' ? 'Cargar cómo se repone' : 'Cambiar cómo se repone'}
            </button>
          )}
          {hoy && <span style={{ fontSize: 12, color: 'var(--spira-ink-soft)' }}>{hoy}</span>}
        </div>
      )}
    </>
  )
}

/**
 * La cuenta como ecuación: una tarjeta por término, separadas por su signo, y la de «A comprar» al final. Las
 * restas en cero se dibujan igual (lo decide el modelo): la cuenta tiene siempre la misma forma.
 */
function Ecuacion({ b }: { b: Boleta }) {
  const termino: CSSProperties = {
    background: 'var(--spira-white)', borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--spira-line)', borderRadius: 12,
    padding: '12px 16px', minWidth: 150, maxWidth: 240, display: 'flex', flexDirection: 'column', gap: 4,
  }
  const valor: CSSProperties = { fontFamily: 'var(--spira-font-display)', fontSize: 26, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.1 }
  const operador = (s: string) => (
    <span aria-hidden="true" style={{ alignSelf: 'center', fontFamily: 'var(--spira-font-display)', fontSize: 22, color: 'var(--spira-ink-soft)', width: 14, textAlign: 'center' }}>{s}</span>
  )
  /* Cada signo viaja pegado al término que le sigue: si la ecuación no entra en un renglón, baja el par
     entero y nunca queda un «=» colgado al final de una línea con el resultado solo en la siguiente. */
  const par: CSSProperties = { display: 'flex', alignItems: 'stretch', gap: 10 }
  return (
    <div style={{ display: 'flex', alignItems: 'stretch', gap: 10, flexWrap: 'wrap' }}>
      {b.lineas.map((l, i) => (
        <div key={l.tipo} style={par}>
          {i > 0 && operador(l.signo || '+')}
          <div style={termino}>
            <span className="spira-mono" style={{ ...valor, color: 'var(--spira-ink)' }}>{l.valor}</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--spira-ink)' }}>{l.titulo}</span>
            <span style={{ fontSize: 12, color: 'var(--spira-ink-soft)', lineHeight: 1.4 }}>{l.aclaracion}</span>
          </div>
        </div>
      ))}
      <div style={par}>
        {operador('=')}
        {/* Invertida con los tokens y no con hex: en oscuro la tinta es clara, y la tarjeta se lee igual de
            destacada con el texto oscuro del papel. */}
        <div style={{ ...termino, background: 'var(--spira-ink)', borderColor: 'var(--spira-ink)', color: 'var(--spira-paper)' }}>
          <span className="spira-mono" style={valor}>{b.aComprar}</span>
          <span style={{ fontSize: 13, fontWeight: 600 }}>A comprar</span>
          <span style={{ fontSize: 12, opacity: 0.78 }}>{b.aComprar === 1 ? 'envase' : 'envases'}</span>
        </div>
      </div>
    </div>
  )
}

const ESTADO: Record<PacienteDelRenglon['estado'], string> = {
  activo: 'Activo', inactivo: 'Inactivo', screening: 'Screening', completado: 'Completado', discontinuado: 'Discontinuado',
}
/** Las marcas que van debajo del nombre. «Sin retiros» va en «Último retiro», que es donde se lee. */
const MARCA: Partial<Record<MarcaPaciente, { texto: string; tono: 'warn' | 'neutro' }>> = {
  termino_cronograma: { texto: 'Terminó · no suma', tono: 'neutro' },
  dos_presentaciones: { texto: 'Otra presentación · no suma', tono: 'warn' },
  varios_meses: { texto: 'Se llevó más de un mes', tono: 'neutro' },
}

/** «Pacientes que lo reciben»: una fila por paciente, con lo que antes eran avisos al pie. */
function Pacientes({ ps, onVerFicha }: { ps: PacienteDelRenglon[]; onVerFicha?: (enrollmentId: string) => Promise<boolean> }) {
  const [abriendo, setAbriendo] = useState<string | null>(null)
  const [fallo, setFallo] = useState<string | null>(null)
  const th: CSSProperties = { ...versalita, fontSize: 10.5, letterSpacing: '0.08em', textAlign: 'left', padding: '10px 10px', borderBottom: '1px solid var(--spira-line)', whiteSpace: 'nowrap' }
  const td: CSSProperties = { padding: '10px 10px', fontSize: 13, color: 'var(--spira-ink)', verticalAlign: 'middle', whiteSpace: 'nowrap' }
  const apilado: CSSProperties = { display: 'block', fontSize: 11.5, color: 'var(--spira-ink-soft)', marginTop: 2 }
  const sinRetiros = ps.some((p) => p.marcas.includes('sin_retiros'))

  const verFicha = async (p: PacienteDelRenglon) => {
    if (!onVerFicha) return
    setAbriendo(p.enrollmentId)
    setFallo(null)
    const ok = await onVerFicha(p.enrollmentId)
    setAbriendo(null)
    if (!ok) setFallo(`No se pudo abrir la ficha de ${p.nombre}.`)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <div style={rotuloBloque}>Pacientes que lo reciben</div>
        <span style={{ fontSize: 12, color: 'var(--spira-ink-soft)' }}>{textoPacientesQueSuman(ps)}</span>
      </div>
      {ps.length > 0 && (
        <div style={{ background: 'var(--spira-white)', borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--spira-line)', borderRadius: 12, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={th}>Paciente</th>
                <th style={th}>Estado</th>
                <th style={{ ...th, textAlign: 'right' }}>Por mes</th>
                <th style={th}>Retiró en el período</th>
                <th style={th}>Último retiro</th>
                <th style={th}>Cronograma hasta</th>
                {onVerFicha && <th style={th} aria-label="Ficha" />}
              </tr>
            </thead>
            <tbody>
              {ps.map((p, i) => {
                const borde = i < ps.length - 1 ? '1px solid var(--spira-line)' : 'none'
                const celdaFila: CSSProperties = { ...td, borderBottom: borde }
                const marcas = p.marcas.map((m) => MARCA[m]).filter((m): m is NonNullable<typeof m> => !!m)
                return (
                  // Quien no suma se atenúa: está en la lista para que se sepa por qué no cuenta, no para contarlo.
                  <tr key={p.enrollmentId} style={{ opacity: p.suma ? 1 : 0.62 }}>
                    <td style={celdaFila}>
                      <span style={{ fontWeight: 600 }}>{p.nombre}</span>
                      {marcas.length > 0 && (
                        <span style={{ display: 'flex', gap: 4, marginTop: 4, flexWrap: 'wrap' }}>
                          {marcas.map((m) => <Etiqueta key={m.texto} tono={m.tono}>{m.texto}</Etiqueta>)}
                        </span>
                      )}
                    </td>
                    <td style={celdaFila}><Etiqueta tono={p.estado === 'activo' ? 'ok' : 'neutro'} punto>{ESTADO[p.estado]}</Etiqueta></td>
                    <td style={{ ...celdaFila, textAlign: 'right' }}>
                      <span className="spira-mono">{p.porMes}</span>
                      <span style={apilado}>{p.propia ? 'propia' : 'del estudio'}</span>
                    </td>
                    <td style={celdaFila}>
                      <Barra valor={p.retiro} total={p.porMes} />
                      <span className="spira-mono">{p.retiro} de {p.porMes}</span>
                    </td>
                    <td style={celdaFila}>
                      <span className="spira-mono">{p.ultimoRetiro ? formatAR(p.ultimoRetiro.slice(0, 10)) : 'Nunca'}</span>
                      {p.marcas.includes('sin_retiros') && <span style={{ display: 'block', marginTop: 3 }}><Etiqueta tono="warn">+90 días</Etiqueta></span>}
                    </td>
                    <td style={celdaFila}>
                      {p.cronogramaHasta ? <span className="spira-mono">{formatAR(p.cronogramaHasta.slice(0, 10))}</span> : <span style={{ color: 'var(--spira-muted)' }}>—</span>}
                    </td>
                    {onVerFicha && (
                      <td style={{ ...celdaFila, textAlign: 'right' }}>
                        <button
                          type="button" className="spira-textlink spira-no-press" disabled={abriendo != null}
                          onClick={() => verFicha(p)} aria-label={`Ver la ficha de ${p.nombre}`}
                          // El petróleo profundo y no `accentSolid`: en oscuro éste queda en 1,85:1, invisible (tokens.css).
                          style={{ fontWeight: 600, color: 'var(--spira-acc-deep-track)', cursor: abriendo != null ? 'default' : 'pointer' }}
                        >
                          {abriendo === p.enrollmentId ? 'Abriendo…' : 'Ver ficha →'}
                        </button>
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      {fallo && <AvisoLinea tono="danger" texto={fallo} />}
      {sinRetiros && <div style={{ fontSize: 12, color: 'var(--spira-ink-soft)' }}>Sin retiros en más de 90 días: siguen sumando mientras tengan el medicamento asignado.</div>}
    </div>
  )
}

/** Cuánto retiró del mes que le toca. Decorativa: el número va al lado. */
function Barra({ valor, total }: { valor: number; total: number }) {
  const ancho = total > 0 ? Math.min(100, (valor / total) * 100) : 0
  return (
    <span aria-hidden="true" style={{ display: 'inline-block', width: 56, height: 6, borderRadius: 3, background: 'var(--spira-line)', overflow: 'hidden', verticalAlign: 'middle', marginRight: 8 }}>
      <span style={{ display: 'block', height: '100%', width: `${ancho}%`, background: 'var(--spira-acc-deep-track)' }} />
    </span>
  )
}

/** «Movimientos del estante en el período»: el libro que antes ocupaba cuatro columnas de la tabla. */
function Movimientos({ libro, enCurso }: { libro: Libro; enCurso: boolean }) {
  const datos: [string, string][] = [
    ['Empezó con', String(libro.habia)],
    ['Entró', `+${libro.entro}`],
    ['Salió', `−${libro.salio}`],
    ...(libro.ajustes !== 0 ? [['Ajustes', `${libro.ajustes > 0 ? '+' : '−'}${Math.abs(libro.ajustes)}`] as [string, string]] : []),
    [enCurso ? 'Hay hoy' : 'Quedó al corte', String(libro.hay)],
  ]
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={rotuloBloque}>Movimientos del estante en el período</div>
      <div style={{
        display: 'flex', flexWrap: 'wrap', width: 'fit-content', maxWidth: '100%', overflow: 'hidden',
        background: 'var(--spira-white)', borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--spira-line)', borderRadius: 12,
      }}>
        {datos.map(([k, v], i) => (
          <div key={k} style={{ padding: '10px 16px', display: 'flex', flexDirection: 'column', gap: 2, borderRight: i < datos.length - 1 ? '1px solid var(--spira-line)' : 'none' }}>
            <span style={{ fontSize: 11, color: 'var(--spira-ink-soft)' }}>{k}</span>
            <span className="spira-mono" style={{ fontSize: 15, fontWeight: 600, color: 'var(--spira-ink)' }}>{v}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
