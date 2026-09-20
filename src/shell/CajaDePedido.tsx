import { Icon } from '../components/Icon'
import { ProtoTag } from '../views/visitAtoms'
import { badgeDeEstado } from '../views/pharma/dispensaciones/estados'
import { fechaDeCard, rotuloDeCard } from './avisosPedidos'
import { tinte } from './notificaciones'
import type { PedidoAviso } from '../data/pharma/dispensationModel'

/**
 * La card de un pedido de dispensación.
 *
 * VIVE EN SU PROPIO ARCHIVO PORQUE LA DIBUJAN DOS LUGARES: el bloque de la campana y el popup que
 * salta cuando el pedido se mueve. El Director lo pidió así —«que se abra un popup con una vista
 * muy parecida a la de la notificación»— y ese parecido no se sostiene con dos copias: la primera
 * vez que alguien cambie una, el aviso y el panel van a estar contando lo mismo de dos formas
 * distintas, sin que nada falle.
 *
 * Usa las clases `spira-notif-*`, que son la grilla del panel: ícono, cuerpo, datos y acción en la
 * misma vertical. Por eso el popup se lee como la notificación y no como otra cosa.
 *
 * La cuarta columna se reserva SIEMPRE: en el panel va vacía (un pedido no se archiva, no hay ✕) y
 * en el popup la ocupa el botón de cerrar el aviso. Si apareciera sólo a veces, las cards no
 * alinearían entre sí.
 */
export function CajaDePedido({ pedido, comoFarmacia, hoy, abrir, onCerrar }: {
  pedido: PedidoAviso
  comoFarmacia: boolean
  /** El día de hoy en ISO, para decidir si la fecha se muestra como hora. */
  hoy: string
  abrir: () => void
  /** Sólo el popup lo manda: cierra EL AVISO, no toca el pedido. En el panel no existe. */
  onCerrar?: () => void
}) {
  const badge = badgeDeEstado(pedido.status, pedido.dispensacion)
  const motivo = rotuloDeCard(pedido, comoFarmacia)
  return (
    <div
      className="spira-notif-caja spira-notif-caja--link spira-no-press"
      role="button"
      tabIndex={0}
      onClick={abrir}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrir() }
      }}
      aria-label={`Abrir el pedido de ${pedido.patient_name} — ${motivo}`}
    >
      {/* `tinte()` y no concatenar alpha sobre el token: `var(--…)18` es CSS inválido y el cuadrado
          queda transparente sin un solo warning. */}
      <span className="spira-notif-icono" style={{ background: tinte(badge.color, 9) }}>
        <Icon name="box" size={16} color={badge.color} />
      </span>

      <div className="spira-notif-cuerpo">
        <div className="spira-notif-l1">
          <span className="spira-notif-nombre" title={pedido.patient_name}>{pedido.patient_name}</span>
          <span className="spira-mono spira-notif-codigo">{pedido.patient_code ?? '—'}</span>
        </div>
        <div className="spira-notif-motivo" title={motivo}>{motivo}</div>
      </div>

      <div className="spira-notif-datos">
        <ProtoTag code={pedido.protocol_code} protocolId={pedido.protocol_id} compacto />
        <span className="spira-notif-fecha">{fechaDeCard(pedido, hoy)}</span>
      </div>

      <div className="spira-notif-accion">
        {onCerrar && (
          <button
            type="button"
            title="Cerrar el aviso"
            aria-label={`Cerrar el aviso del pedido de ${pedido.patient_name}`}
            /* `stopPropagation` porque la card entera es pulsable: sin esto, cerrar el aviso
               también abriría el pedido, que es lo contrario de lo que el gesto dice. */
            onClick={(e) => { e.stopPropagation(); onCerrar() }}
            style={{
              width: 22, height: 22, borderRadius: 7, border: 'none', background: 'transparent',
              display: 'grid', placeItems: 'center', cursor: 'pointer', color: 'var(--spira-muted)',
            }}
          >
            <Icon name="x" size={14} />
          </button>
        )}
      </div>
    </div>
  )
}
