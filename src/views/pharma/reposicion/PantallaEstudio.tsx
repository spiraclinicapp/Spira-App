import { useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { Icon } from '../../../components/Icon'
import {
  diaMes, pastillaDePedido, pedidosAMostrar, periodoAnterior, periodoSiguiente, resumenDelEstudio, subtituloDelPeriodo, textoPeriodo,
  ultimoPedidoPara,
} from '../../../data/pharma'
import type { EstudioReposicion, PedidoMedicacion, ReposicionDelPeriodo } from '../../../data/pharma'
import { card } from '../reportes/estilos'
import { ArmarPedido } from './ArmarPedido'
import { ANCHO_LIBRO_EN_COLUMNAS, COLUMNAS, COLUMNAS_CERRADO, FilaMedicamento } from './FilaMedicamento'
import { HojaPedido, datosDeHoja, useImpresion } from './HojaPedido'
import { PedidoDetalle } from './PedidoDetalle'
import { AvisoLinea, Envases, Informacion, Pastilla, PuntoEstado, TituloSeccion, botonChico, plural, rotuloColumna, useAngosto } from './piezas'

const volver: CSSProperties = {
  width: 38, height: 38, borderRadius: 10, border: '1px solid var(--spira-line-2)', background: 'var(--spira-white)',
  display: 'grid', placeItems: 'center', flex: '0 0 auto', cursor: 'pointer', color: 'var(--spira-ink)',
}
const flecha: CSSProperties = {
  width: 32, height: 32, borderRadius: 9, border: '1px solid var(--spira-line-2)', background: 'var(--spira-white)',
  display: 'grid', placeItems: 'center', color: 'var(--spira-ink)', padding: 0,
}
const grupoEncabezado: CSSProperties = { padding: '10px 16px 7px', fontSize: 11.5, fontWeight: 600, color: 'var(--spira-ink-soft)' }

/**
 * El estudio (mocks «2 · El estudio», «2b», «Un período anterior», «Quien sólo puede mirar», «Ventana
 * angosta»): el estudio con sus flechas entre períodos (R6) en un renglón, el resumen de lo que va al
 * pedido, el libro con su boleta y los pedidos del estudio. Toda decisión de qué decir está en
 * `reposicionTarjetaModel` (con tests); acá se dibuja.
 *
 * «Armar pedido» no vive acá: es la acción de la pantalla y va en el encabezado del shell, junto al
 * título (lo registra `ReposicionView`). Acá sólo se abre el modal cuando la piden.
 */
export function PantallaEstudio({ rep, e, diaCorte, puedeEditar, accent, accentSolid, armando, onSalirDeArmar, onVolver, onPeriodo, onCambio }: {
  rep: ReposicionDelPeriodo
  e: EstudioReposicion
  diaCorte: number
  puedeEditar: boolean
  accent: string
  accentSolid: string
  /** Se pidió «Armar pedido» desde el encabezado del shell. */
  armando: boolean
  onSalirDeArmar: () => void
  onVolver: () => void
  /** Mirar otro período: una fecha dentro de él, o '' para el en curso. */
  onPeriodo: (fecha: string) => void
  /** Algo cambió en la base (se emitió, anuló, cerró, reabrió o cargó): volver a pedir. */
  onCambio: () => void
}) {
  const [abierto, setAbierto] = useState<string | null>(null)
  const [editando, setEditando] = useState<string | null>(null)
  const [viendo, setViendo] = useState<string | null>(null)
  const { hoja, imprimir } = useImpresion()
  /* La forma del libro (y con él la del resumen y los pedidos) la decide el ancho de ESTA pantalla, no el de
     la ventana: ver `useAngosto`. */
  const raiz = useRef<HTMLDivElement>(null)
  const angosto = useAngosto(raiz, ANCHO_LIBRO_EN_COLUMNAS)

  const sub = subtituloDelPeriodo(rep, e)
  const resumen = resumenDelEstudio(e, rep)
  const pedidos = pedidosAMostrar(e, rep)
  const pedidoAbierto = e.pedidos.find((p) => p.id === viendo) ?? null
  const anterior = periodoAnterior(rep.periodo, diaCorte)
  const siguiente = periodoSiguiente(rep.periodo, diaCorte)
  const reimprimir = (p: PedidoMedicacion) => imprimir(datosDeHoja(p, e.estudio, rep.hoy))

  /* Abrir o cerrar un renglón deja SIEMPRE la edición cerrada: si el renglón se cierra con la flecha en vez
     de «Cancelar», dejarla prendida haría que la próxima vez que se abra aparezca el formulario, que nadie
     pidió. «Cambiar cómo se repone» la vuelve a prender (`editar`), que no pasa por acá. */
  const alternar = (clave: string) => {
    setAbierto((a) => (a === clave ? null : clave))
    if (editando) setEditando(null)
  }
  const editar = (clave: string) => { setAbierto(clave); setEditando(clave) }

  return (
    <div ref={raiz}>
      {/* Un renglón: qué estudio y qué período. Son dos grupos y no uno solo para que, si no entran, las
          flechas bajen JUNTAS al segundo renglón en vez de partirse a mitad de camino. El del período va
          contra el borde derecho, justo debajo de «Armar pedido» del encabezado (pedido del Director,
          2026-09-21), con el texto ANTES de las flechas para que sean ellas las que queden alineadas con el
          botón. Sin divisor entre los dos grupos: los separa el aire del medio. */}
      <div style={{ display: 'flex', alignItems: 'center', columnGap: 28, rowGap: 10, margin: '0 0 14px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', minWidth: 0 }}>
          <button type="button" onClick={onVolver} aria-label="Volver a la grilla de estudios" style={volver}>
            <Icon name="arrowLeft" size={18} />
          </button>
          <span className="spira-mono" style={{ fontFamily: 'var(--spira-font-display)', fontWeight: 700, fontSize: 20, letterSpacing: '-0.01em', color: accent }}>{e.estudio.code}</span>
          <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--spira-ink)' }}>{e.estudio.name}</span>
          <PuntoEstado status={e.estudio.status} />
        </div>

        {/* Las flechas entre períodos (R6): la › se apaga en el período en curso. */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap', marginLeft: 'auto' }}>
          <span style={{ fontSize: 12.5, marginRight: 4, color: sub.aviso ? 'var(--spira-acc-deep-warn)' : 'var(--spira-ink-soft)', fontWeight: sub.aviso ? 600 : 400 }}>{sub.texto}</span>
          <button type="button" onClick={() => onPeriodo(anterior.desde)} aria-label={`Período anterior, del ${textoPeriodo(anterior)}`} style={{ ...flecha, cursor: 'pointer' }}>
            <Icon name="chevronLeft" size={15} />
          </button>
          <span className="spira-mono" style={{ fontSize: 14, fontWeight: 600, color: 'var(--spira-ink)', padding: '0 4px' }}>{textoPeriodo(rep.periodo)}</span>
          <button
            type="button" disabled={rep.enCurso}
            onClick={() => onPeriodo(rep.hoy <= siguiente.hasta ? '' : siguiente.desde)}
            aria-label={rep.enCurso ? 'No hay período siguiente: este es el período en curso' : `Período siguiente, del ${textoPeriodo(siguiente)}`}
            style={{ ...flecha, opacity: rep.enCurso ? 0.45 : 1, cursor: rep.enCurso ? 'default' : 'pointer' }}
          >
            <Icon name="chevronRight" size={15} />
          </button>
        </div>
      </div>

      {!rep.enCurso && (
        <Informacion icono="info">
          <span>Un período cerrado muestra lo que entró y salió. La compra se arma en el período en curso.</span>
          <button type="button" className="spira-card-link" style={botonChico} onClick={() => onPeriodo('')}>Ir al período en curso</button>
        </Informacion>
      )}
      {rep.enCurso && !puedeEditar && (
        <Informacion icono="eye">
          <span>Sólo lectura: podés ver la reposición y reimprimir pedidos. Arma los pedidos quien tiene permiso de Farmacia.</span>
        </Informacion>
      )}
      {e.tarde && e.objetivo && (
        <Informacion icono="info">
          <span>
            El corte fue el {diaMes(e.tarde.corte)}. Hasta el {diaMes(e.tarde.hasta)} el pedido es para el {textoPeriodo(e.objetivo)}; el siguiente se pide en el corte del {diaMes(e.objetivo.hasta)}.
          </span>
        </Informacion>
      )}

      {resumen && (
        <div style={{ ...card, display: 'flex', alignItems: 'center', gap: angosto ? 12 : 20, flexWrap: angosto ? 'wrap' : 'nowrap', padding: '16px 20px', margin: '0 0 14px' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12.5, color: 'var(--spira-ink-soft)' }}>{resumen.titulo}</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 2, flexWrap: 'wrap' }}>
              {resumen.tipo === 'compra' ? (
                <>
                  <Envases n={resumen.envases} />
                  {resumen.sinCargar > 0 && (
                    <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--spira-acc-deep-warn)' }}>
                      + {plural(resumen.sinCargar, 'medicamento sin cargar', 'medicamentos sin cargar')}
                    </span>
                  )}
                </>
              ) : (
                <>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    <Icon name="truck" size={18} color={accentSolid} />
                    <span className="spira-mono" style={{ fontFamily: 'var(--spira-font-display)', fontSize: 20, fontWeight: 800, color: 'var(--spira-ink)' }}>Pedido Nº {resumen.pedido.numero}</span>
                  </span>
                  <Pastilla p={resumen.pastilla} />
                </>
              )}
            </div>
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--spira-ink-soft)', textAlign: angosto ? 'left' : 'right' }}>{resumen.detalle}</div>
          {resumen.tipo === 'pedido' && (
            <div style={{ display: 'flex', gap: 6 }}>
              <button type="button" className="spira-card-link" style={botonChico} onClick={() => reimprimir(resumen.pedido)}>
                <Icon name="printer" size={13} color={accentSolid} />Reimprimir
              </button>
              <button type="button" className="spira-card-link" style={botonChico} onClick={() => setViendo(resumen.pedido.id)}>
                <Icon name="eye" size={13} color={accentSolid} />Ver
              </button>
            </div>
          )}
        </div>
      )}

      {/* El libro. RD9: encabezado agrupado, había/entró/salió/hay son de ESTE período; «mínimo» y «comprar»,
          del que viene. */}
      <div style={{ ...card, overflow: 'hidden', ...(rep.enCurso ? {} : { maxWidth: 820 }) }}>
        {angosto ? (
          <div style={{ display: 'flex', padding: '10px 14px 8px', borderBottom: '1px solid var(--spira-line-2)', fontSize: 11.5, fontWeight: 600, color: 'var(--spira-ink-soft)' }}>
            <span style={{ flex: 1 }}>{rep.enCurso ? `Este período · ${textoPeriodo(rep.periodo)}` : `Período ${textoPeriodo(rep.periodo)}`}</span>
            {rep.enCurso && <span>{e.tarde ? 'Para este período' : 'Para el que viene'}</span>}
          </div>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: rep.enCurso ? COLUMNAS : COLUMNAS_CERRADO, borderBottom: '1px solid var(--spira-line)' }}>
              <div />
              <div style={{ ...grupoEncabezado, gridColumn: 'span 4', textAlign: 'center' }}>
                {rep.enCurso ? `Este período · ${textoPeriodo(rep.periodo)}` : `Período ${textoPeriodo(rep.periodo)}`}
              </div>
              {rep.enCurso && (
                <>
                  <div style={{ ...grupoEncabezado, gridColumn: 'span 2', textAlign: 'center', borderLeft: '1px solid var(--spira-line)' }}>{e.tarde ? 'Para este período' : 'Para el que viene'}</div>
                  <div />
                </>
              )}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: rep.enCurso ? COLUMNAS : COLUMNAS_CERRADO, borderBottom: '1px solid var(--spira-line-2)' }}>
              <div style={rotuloColumna}>Medicamento</div>
              <div style={{ ...rotuloColumna, textAlign: 'right' }}>Había</div>
              <div style={{ ...rotuloColumna, textAlign: 'right' }}>Entró</div>
              <div style={{ ...rotuloColumna, textAlign: 'right' }}>Salió</div>
              <div style={{ ...rotuloColumna, textAlign: 'right' }}>{rep.enCurso ? 'Hay' : 'Quedó'}</div>
              {rep.enCurso && (
                <>
                  <div style={{ ...rotuloColumna, textAlign: 'right', borderLeft: '1px solid var(--spira-line)' }}>Mínimo</div>
                  <div style={{ ...rotuloColumna, textAlign: 'right' }}>Comprar</div>
                  <div />
                </>
              )}
            </div>
          </>
        )}
        {e.renglones.map((r, i) => (
          <FilaMedicamento
            key={r.clave} r={r} enCurso={rep.enCurso} ultimo={i === e.renglones.length - 1} angosto={angosto}
            puedeEditar={puedeEditar} accentSolid={accentSolid}
            abierto={abierto === r.clave} editando={editando === r.clave}
            onAlternar={() => alternar(r.clave)} onEditar={() => editar(r.clave)}
            onCerrarEdicion={() => setEditando(null)} onGuardado={() => { setEditando(null); onCambio() }}
          />
        ))}
        {e.renglones.length === 0 && (
          <div style={{ padding: 16, fontSize: 13, color: 'var(--spira-ink-soft)' }}>Este estudio no tiene medicación asignada.</div>
        )}
      </div>
      {rep.enCurso && e.sinMedicacionHabilitada > 0 && (
        <div style={{ marginTop: 10 }}>
          <AvisoLinea tono="warn" texto={`${plural(e.sinMedicacionHabilitada, 'paciente activo', 'pacientes activos')} sin medicación habilitada: no ${e.sinMedicacionHabilitada === 1 ? 'está' : 'están'} en la cuenta.`} />
        </div>
      )}

      {pedidos.length > 0 && (
        <div style={rep.enCurso ? undefined : { maxWidth: 820 }}>
          <TituloSeccion>Pedidos del estudio</TituloSeccion>
          <div style={{ ...card, overflow: 'hidden' }}>
            {pedidos.map((p, i) => (
              <FilaPedido key={p.id} p={p} ultimo={i === pedidos.length - 1} angosto={angosto} accentSolid={accentSolid}
                onVer={() => setViendo(p.id)} onReimprimir={() => reimprimir(p)} />
            ))}
          </div>
        </div>
      )}

      {armando && e.objetivo && (
        <ArmarPedido
          e={e} objetivo={e.objetivo} hoy={rep.hoy} ultimoVisto={ultimoPedidoPara(e.pedidos, e.objetivo)} accentSolid={accentSolid}
          onClose={(refrescar) => { onSalirDeArmar(); if (refrescar) onCambio() }}
          onEmitido={(d) => { onSalirDeArmar(); imprimir(d); onCambio() }}
        />
      )}
      {pedidoAbierto && (
        <PedidoDetalle
          p={pedidoAbierto} estudio={e.estudio} puedeEditar={puedeEditar} accentSolid={accentSolid}
          onClose={() => setViendo(null)} onCambio={onCambio} onReimprimir={() => reimprimir(pedidoAbierto)}
        />
      )}
      <HojaPedido d={hoja} />
    </div>
  )
}

/** Un pedido en la lista del estudio. «Reimprimir» sólo mientras algo sigue en juego; «Ver», siempre. */
function FilaPedido({ p, ultimo, angosto, accentSolid, onVer, onReimprimir }: {
  p: PedidoMedicacion
  ultimo: boolean
  angosto: boolean
  accentSolid: string
  onVer: () => void
  onReimprimir: () => void
}) {
  /* El espacio va en longhands: con `gap` (la abreviada) al lado de `rowGap`, el `gap: 14` pisaba al 6 de la
     forma angosta, y al cambiar de forma en vivo React avisaba que vaciaba uno de los dos. */
  return (
    <div style={{
      ...(angosto ? { display: 'flex', flexWrap: 'wrap' } : { display: 'grid', gridTemplateColumns: '130px 150px minmax(0, 1fr) auto auto' }),
      alignItems: 'center', columnGap: 14, rowGap: angosto ? 6 : 14, padding: '11px 16px', borderBottom: ultimo ? 'none' : '1px solid var(--spira-line)',
    }}>
      <span className="spira-mono" style={{ fontFamily: 'var(--spira-font-display)', fontWeight: 700, fontSize: 15, color: 'var(--spira-ink)' }}>Pedido Nº {p.numero}</span>
      <span style={{ fontSize: 12.5, color: 'var(--spira-ink-soft)' }}>Emitido el <span className="spira-mono">{diaMes(p.emitido_el)}</span></span>
      <span style={{ fontSize: 12.5, color: 'var(--spira-ink-soft)' }}>
        Para el período <span className="spira-mono">{textoPeriodo({ desde: p.periodo_desde, hasta: p.periodo_hasta })}</span> · {plural(p.pedidoTotal, 'envase', 'envases')}
      </span>
      <Pastilla p={pastillaDePedido(p)} />
      <div style={{ display: 'flex', gap: 6 }}>
        {p.estado !== 'anulado' && p.faltanteTotal > 0 && (
          <button type="button" className="spira-card-link" style={botonChico} onClick={onReimprimir}>
            <Icon name="printer" size={13} color={accentSolid} />Reimprimir
          </button>
        )}
        <button type="button" className="spira-card-link" style={botonChico} onClick={onVer}>
          <Icon name="eye" size={13} color={accentSolid} />Ver
        </button>
      </div>
    </div>
  )
}
