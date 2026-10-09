import { Icon } from '../components/Icon'
import { ProtoTag } from '../views/visitAtoms'
import { badgeDeEstado } from '../views/pharma/dispensaciones/estados'
import { horaExacta, momentoDe, tiempoRelativo } from './notificaciones'
import {
  estadoDe, horasDePasos, mensajeDeEstado, pasoActual, PASOS_DEL_PEDIDO, ultimoMovimiento,
} from './avisosPedidos'
import type { PasoDelPedido, PedidoAviso } from './avisosPedidos'

/** El rótulo corto de cada paso, bajo su barra. El chip de estado sí usa el largo de la casa. */
const NOMBRE_DEL_PASO: Record<PasoDelPedido, string> = {
  solicitada: 'Solicitada',
  preparando: 'Preparando',
  lista: 'Lista',
  entregada: 'Entregada',
}

/**
 * Un pedido propio en curso, fijo arriba del listado (handoff v2, §4).
 *
 * SÓLO PARA LO ABIERTO Y PROPIO: solicitada, preparando o lista, pedida por quien mira. Al
 * entregarse sale de acá y queda en el listado como un registro «Dispensación entregada», que es lo
 * que pide el handoff y lo que ya hacía la campana con lo cerrado.
 *
 * EL COLOR DEL ESTADO NO ES EL DEL MOCK. El handoff pinta «Preparando» en ámbar; el resto de la app
 * —el tablero, el badge de Coordinación, el historial— lo pinta en azul, y todos leen de
 * `badgeDeEstado`. Un mismo estado en dos colores según la pantalla es la segunda verdad que
 * `estados.ts` existe para evitar, así que acá también manda la tabla de la casa.
 */
export function DispensacionEnCurso({ pedido, hoy, ahoraMs, onAbrir }: {
  pedido: PedidoAviso
  hoy: string
  ahoraMs: number
  onAbrir: () => void
}) {
  const badge = badgeDeEstado(pedido.status, pedido.dispensacion)
  const paso = pasoActual(pedido) ?? 0
  const horas = horasDePasos(pedido)
  const final = estadoDe(pedido) === 'entregada'
  const pidio = [pedido.solicitante, horaExacta(momentoDe(pedido.created_at), hoy)].filter(Boolean).join(' · ')

  return (
    <section className="spira-disp" aria-label={`Dispensación en curso de ${pedido.patient_name}: ${badge.label}`}>
      <div className="spira-disp-cab">
        <Icon name="pill" size={14} stroke={2} color="currentColor" />
        <span className="spira-disp-cab-titulo">Dispensación en curso</span>
        {pedido.visit_code && <span className="spira-disp-cab-visita">· {pedido.visit_code}</span>}
        <span className="spira-disp-cab-rel">{tiempoRelativo(momentoDe(ultimoMovimiento(pedido)), ahoraMs, hoy)}</span>
      </div>

      <div className="spira-disp-cuerpo">
        <div className="spira-disp-quien">
          <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 5, alignItems: 'flex-start' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', minWidth: 0, maxWidth: '100%' }}>
              <span className="spira-disp-nombre" title={pedido.patient_name}>{pedido.patient_name}</span>
              {pedido.patient_code && <span className="spira-disp-codigo">{pedido.patient_code}</span>}
            </div>
            <ProtoTag code={pedido.protocol_code} protocolId={pedido.protocol_id} compacto />
          </div>
          <span
            className={`spira-disp-chip${final ? '' : ' spira-disp-chip--late'}`}
            style={{ color: badge.color, background: badge.tint }}
          >
            <span className="spira-disp-chip-punto" aria-hidden="true" />
            {badge.label}
          </span>
        </div>

        <ol className="spira-disp-pasos" style={{ listStyle: 'none', padding: 0, margin: '12px 0 0' }}>
          {PASOS_DEL_PEDIDO.map((p, i) => {
            const llegado = i <= paso
            return (
              <li key={p} aria-current={i === paso ? 'step' : undefined}>
                <div className="spira-disp-barra">
                  {llegado && (
                    <div
                      /* La key incluye el paso actual: cuando el pedido avanza, la barra nueva se
                         monta de cero y se llena con su animación, en vez de aparecer ya llena. */
                      key={`${p}:${paso}`}
                      className={`spira-disp-barra-relleno${i === paso ? ' spira-disp-barra-relleno--actual' : ''}`}
                      style={{ background: badge.color }}
                    />
                  )}
                </div>
                <div className={`spira-disp-paso-nombre${llegado ? '' : ' spira-disp-paso-nombre--futuro'}`}>
                  {NOMBRE_DEL_PASO[p]}
                </div>
                <div className="spira-disp-paso-hora">{horas[i] ? horaExacta(momentoDe(horas[i]), hoy) : '—'}</div>
              </li>
            )
          })}
        </ol>

        <dl className="spira-disp-detalle" style={{ margin: '12px 0 0' }}>
          <dt>Medicación</dt>
          <dd>{pedido.medicacion || '—'}</dd>
          <dt>Pidió</dt>
          <dd>{pidio || '—'}</dd>
        </dl>
      </div>

      <div className="spira-disp-pie">
        <span style={{ minWidth: 0 }}>{mensajeDeEstado(pedido)}</span>
        <button type="button" className="spira-disp-ver spira-no-press" onClick={onAbrir}>
          Ver dispensación <Icon name="arrowRight" size={13} color="currentColor" />
        </button>
      </div>
    </section>
  )
}
