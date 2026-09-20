import type { CSSProperties, ReactNode } from 'react'
import { Icon } from '../../../components/Icon'
import type { Boleta, RenglonDelPeriodo } from '../../../data/pharma'
import { CargarReposicion } from './CargarReposicion'
import { AvisoLinea, Envases, botonChico, plural } from './piezas'

/**
 * Mock «2 · El estudio»: nombre, había, entró, salió, hay | mínimo, comprar, y la flecha que abre la boleta.
 * «Mínimo» no está en el mock: lo pidió el Director el 2026-09-19 (el stock mínimo de cada medicamento,
 * sacado de la medicación asignada a los pacientes, sin desplegar la cuenta).
 */
export const COLUMNAS = 'minmax(0, 1fr) 84px 84px 84px 96px 96px 190px 44px'
/** Un período cerrado: había, entró, salió y quedó, sin «comprar» (R6). */
export const COLUMNAS_CERRADO = 'minmax(0, 1fr) 96px 96px 96px 96px'
/** Por debajo de 1024 px el libro baja a un segundo renglón (RD14). */
const COLUMNAS_ANGOSTA = 'minmax(0, 1fr) auto 36px'

const numero: CSSProperties = { padding: '13px 16px', textAlign: 'right', fontSize: 14, color: 'var(--spira-ink)' }
const nota: CSSProperties = { fontSize: 13, color: 'var(--spira-ink-soft)', margin: '6px 0' }
const flechaRenglon: CSSProperties = {
  justifySelf: 'center', width: 32, height: 32, display: 'grid', placeItems: 'center',
  background: 'transparent', border: 'none', cursor: 'pointer', padding: 0,
}

/** «−1 por ajuste» · «+2 por ajustes»: que la fila cierre (había + entró − salió ± ajustes = hay). */
const textoAjuste = (a: number) => (a === 0 ? null : `${a > 0 ? '+' : '−'}${Math.abs(a)} por ${Math.abs(a) === 1 ? 'ajuste' : 'ajustes'}`)

export function FilaMedicamento({ r, enCurso, ultimo, angosto, puedeEditar, accentSolid, abierto, editando, onAlternar, onEditar, onCerrarEdicion, onGuardado }: {
  r: RenglonDelPeriodo
  enCurso: boolean
  ultimo: boolean
  angosto: boolean
  puedeEditar: boolean
  accentSolid: string
  abierto: boolean
  editando: boolean
  onAlternar: () => void
  onEditar: () => void
  onCerrarEdicion: () => void
  onGuardado: () => void
}) {
  const avisos = r.avisos.filter((a) => a.ambar).length
  const ajuste = textoAjuste(r.libro.ajustes)

  const nombre = (
    <div style={{ padding: angosto ? 0 : '13px 16px', minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: 'var(--spira-ink)', flexWrap: angosto ? 'wrap' : 'nowrap' }}>
        <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>{r.nombre}</span>
        {/* RD14: el aviso lleva texto, no sólo el ícono. */}
        {avisos > 0 && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11.5, fontWeight: 600, color: 'var(--spira-acc-deep-warn)', whiteSpace: 'nowrap', flex: '0 0 auto' }}>
            <Icon name="alert" size={13} stroke={1.9} />{plural(avisos, 'aviso', 'avisos')}
          </span>
        )}
      </div>
      {r.presentacion && <div style={{ fontSize: 11.5, color: 'var(--spira-ink-soft)', marginTop: 2 }}>{r.presentacion}</div>}
      {angosto && (
        <div className="spira-mono" style={{ fontSize: 12, color: 'var(--spira-ink-soft)', marginTop: 4 }}>
          había {r.libro.habia} · entró {r.libro.entro} · salió {r.libro.salio} · {enCurso ? 'hay' : 'quedó'} {r.libro.hay}{ajuste ? ` (${ajuste})` : ''}
        </div>
      )}
      {angosto && enCurso && r.minimo && (
        <div style={{ fontSize: 12, color: 'var(--spira-ink-soft)', marginTop: 2 }}>
          Mínimo <span className="spira-mono">{r.minimo.envases}</span> · {textoMinimo(r.minimo)}
        </div>
      )}
    </div>
  )
  const libro = !angosto && (
    <>
      <span className="spira-mono" style={numero}>{r.libro.habia}</span>
      <span className="spira-mono" style={numero}>{r.libro.entro}</span>
      <span className="spira-mono" style={numero}>{r.libro.salio}</span>
      <div style={numero}>
        <span className="spira-mono">{r.libro.hay}</span>
        {ajuste && <div style={{ fontSize: 11, color: 'var(--spira-ink-soft)', marginTop: 2, whiteSpace: 'nowrap' }}>{ajuste}</div>}
      </div>
    </>
  )

  // Un período cerrado es sólo el libro: sin «comprar» ni boleta (R6).
  if (!enCurso) {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: angosto ? 'minmax(0, 1fr)' : COLUMNAS_CERRADO, alignItems: 'center', padding: angosto ? '11px 14px' : 0, borderBottom: ultimo ? 'none' : '1px solid var(--spira-line)' }}>
        {nombre}
        {libro}
      </div>
    )
  }

  return (
    <div style={{ borderBottom: ultimo && !abierto ? 'none' : '1px solid var(--spira-line)' }}>
      {/* La fila se RESALTA, no se levanta (tokens.css: una fila que se mueve 1px lee como temblor). */}
      <div
        className="spira-row-link spira-no-press"
        onClick={onAlternar}
        style={{
          display: 'grid', gridTemplateColumns: angosto ? COLUMNAS_ANGOSTA : COLUMNAS, alignItems: 'center', cursor: 'pointer',
          gap: angosto ? 10 : 0, padding: angosto ? '11px 14px' : 0, background: abierto ? 'var(--spira-surface)' : undefined,
        }}
      >
        {nombre}
        {libro}
        {!angosto && <Minimo r={r} />}
        <div style={{ padding: angosto ? 0 : '13px 16px', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10, alignSelf: 'stretch' }}>
          <Comprar r={r} puedeEditar={puedeEditar} accentSolid={accentSolid} onCargar={onEditar} />
        </div>
        <button
          type="button" aria-expanded={abierto}
          aria-label={`${abierto ? 'Cerrar' : 'Abrir'} la cuenta de ${r.nombre}`}
          onClick={(ev) => { ev.stopPropagation(); onAlternar() }}
          style={flechaRenglon}
        >
          <Icon name={abierto ? 'chevronUp' : 'chevronDown'} size={16} color="var(--spira-muted)" />
        </button>
      </div>
      {abierto && (
        <div style={{ padding: '6px 16px 18px', background: 'var(--spira-surface)', borderTop: '1px solid var(--spira-line)' }}>
          {editando && puedeEditar
            ? <CargarReposicion r={r} accentSolid={accentSolid} onCancelar={onCerrarEdicion} onGuardado={onGuardado} />
            : <Cuenta r={r} puedeEditar={puedeEditar} accentSolid={accentSolid} onCambiar={onEditar} />}
        </div>
      )}
    </div>
  )
}

const textoMinimo = (m: NonNullable<RenglonDelPeriodo['minimo']>) =>
  m.pacientes == null ? 'a demanda' : plural(m.pacientes, 'paciente', 'pacientes')

/**
 * El stock mínimo del período para el que se compra: la suma de lo que reciben por mes los pacientes que lo
 * tienen asignado, o el «tener siempre» si es a demanda. Abre el grupo «para el que viene»: el borde de la
 * izquierda separa lo que pasó de lo que se compra.
 */
function Minimo({ r }: { r: RenglonDelPeriodo }) {
  return (
    <div style={{ ...numero, alignSelf: 'stretch', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'flex-end', borderLeft: '1px solid var(--spira-line)' }}>
      {r.minimo
        ? <>
            <span className="spira-mono">{r.minimo.envases}</span>
            <span style={{ fontSize: 11, color: 'var(--spira-ink-soft)', marginTop: 2, whiteSpace: 'nowrap' }}>{textoMinimo(r.minimo)}</span>
          </>
        : <span style={{ color: 'var(--spira-muted)' }}>—</span>}
    </div>
  )
}

/** La celda de la derecha: lo que hay que comprar, o por qué no. */
function Comprar({ r, puedeEditar, accentSolid, onCargar }: { r: RenglonDelPeriodo; puedeEditar: boolean; accentSolid: string; onCargar: () => void }): ReactNode {
  switch (r.estado) {
    case 'comprar':
      return <Envases n={r.comprar} />
    case 'en_camino':
      return <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--spira-ink)' }}><span className="spira-mono">{r.enCamino}</span> en camino</span>
    case 'alcanza':
      return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12.5, fontWeight: 600, color: 'var(--spira-acc-deep-good)' }}><Icon name="check" size={14} stroke={2} /> Alcanza</span>
    case 'no_se_compra':
      return <span style={{ fontSize: 12.5, color: 'var(--spira-muted)' }}>No se compra</span>
    case 'sin_cargar':
      return (
        <>
          <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--spira-acc-deep-warn)' }}>Sin cargar</span>
          {puedeEditar && (
            <button type="button" className="spira-card-link" style={botonChico} onClick={(ev) => { ev.stopPropagation(); onCargar() }}>
              <Icon name="pencil" size={13} color={accentSolid} /> Cargar
            </button>
          )}
        </>
      )
    case 'sin_cuenta':
      return null
  }
}

/** El renglón abierto: la boleta (R7), los avisos que no mueven el número y «Cambiar cómo se repone». */
function Cuenta({ r, puedeEditar, accentSolid, onCambiar }: { r: RenglonDelPeriodo; puedeEditar: boolean; accentSolid: string; onCambiar: () => void }) {
  return (
    <div style={{ paddingTop: 6 }}>
      {r.estado === 'sin_cargar' && <p style={nota}>Todavía no se cargó cómo se repone: no suma a la compra.</p>}
      {r.estado === 'no_se_compra' && <p style={nota}>Marcado como que no se compra: queda fuera de la cuenta.</p>}
      {r.boleta && <BoletaVista b={r.boleta} />}
      {r.avisos.length > 0 && (
        <div style={{ marginTop: 10, maxWidth: 560 }}>
          {r.avisos.map((a) => <AvisoLinea key={a.tipo + a.texto} tono={a.ambar ? 'warn' : 'info'} texto={`${a.texto}.`} />)}
        </div>
      )}
      {puedeEditar && (
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button type="button" className="spira-card-link" style={botonChico} onClick={onCambiar}>
            <Icon name="pencil" size={13} color={accentSolid} /> {r.estado === 'sin_cargar' ? 'Cargar cómo se repone' : 'Cambiar cómo se repone'}
          </button>
        </div>
      )}
    </div>
  )
}

/** La boleta (variante A del 16/09): arriba lo que hace falta, cada resta en su renglón, abajo «A comprar». */
function BoletaVista({ b }: { b: Boleta }) {
  const fila: CSSProperties = { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 20px 44px', alignItems: 'baseline', gap: 6 }
  return (
    <div style={{ maxWidth: 470 }}>
      {b.lineas.map((l) => (
        <div key={l.tipo} style={{ ...fila, padding: '6px 0' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, color: 'var(--spira-ink)' }}>{l.titulo}</div>
            <div style={{ fontSize: 11.5, color: 'var(--spira-ink-soft)', marginTop: 2 }}>{l.aclaracion}</div>
          </div>
          <span className="spira-mono" style={{ fontSize: 14, color: 'var(--spira-ink-soft)', textAlign: 'right' }}>{l.signo}</span>
          <span className="spira-mono" style={{ fontSize: 14, color: 'var(--spira-ink)', textAlign: 'right' }}>{l.valor}</span>
        </div>
      ))}
      <div style={{ ...fila, padding: '9px 0 2px', marginTop: 4, borderTop: '1px solid var(--spira-line-2)' }}>
        <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--spira-ink)' }}>
          A comprar{b.aComprar === 0 && <span style={{ fontWeight: 400, color: 'var(--spira-acc-deep-good)' }}> · alcanza</span>}
        </span>
        <span className="spira-mono" style={{ fontSize: 15, color: 'var(--spira-ink-soft)', textAlign: 'right' }}>=</span>
        <span className="spira-mono" style={{ fontSize: 15, fontWeight: 700, color: 'var(--spira-ink)', textAlign: 'right' }}>{b.aComprar}</span>
      </div>
    </div>
  )
}
