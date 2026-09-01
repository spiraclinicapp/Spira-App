import { Icon } from '../components/Icon'
import { VISIT_STATES } from './visitStates'
import { SEVERIDAD_TINTA } from './alertSeverity'
import type { AlertSeverity } from './alertSeverity'

/**
 * La cabecera de una tarjeta de Alertas: banda teñida con ícono, título y contador.
 *
 * Del handoff `design_handoff_resumen_tareas_enfoque` (decisión D4). La comparten las dos pantallas
 * que listan alertas —el Resumen de Coordinación y la vista de Alertas— para que las dos abran con
 * el mismo renglón. Lo que cambia entre ellas es el INTERIOR, no esto: el Resumen aplana sus filas
 * porque muestra dos o tres de reojo; la vista de Alertas conserva las superficies teñidas, porque
 * a veinte ítems de tipos mezclados el bloque de color ES cómo se encuentra la grave sin leer.
 *
 * ⚠️ EL TINTE NO ES FIJO EN ROJO, aunque el mock lo dibuje así. Lo decide la PEOR alerta presente
 * (`severidadMaxima`). Una cabecera siempre roja afirmaría una gravedad que puede no existir —con
 * tres pendientes ámbar la tarjeta gritaría rojo todos los días— y en una app auditable eso no es
 * un detalle estético: es exagerar un dato clínico y, de paso, gastar la señal para el día que sí
 * haya una ventana vencida.
 *
 * DOS FUENTES DE COLOR, y la división importa: el FONDO sale del hex de `VISIT_STATES` con alpha
 * (es un tinte sobre un fondo conocido, funciona igual en los dos temas); el TEXTO y el ícono salen
 * de `SEVERIDAD_TINTA`, que son tokens `--spira-acc-deep-*`. El ámbar de `VISIT_STATES` (#B0823F)
 * como texto no llega a 4,5:1 sobre papel, y ningún hex crudo se aclara en tema oscuro. Es la misma
 * división que ya hace `alertItemStyle`.
 *
 * El título va en `ink` y no en el color de la severidad: sobre una banda ya teñida, texto teñido
 * del mismo tono es el patrón `color: tono / background: tono+alpha` que viene fallando WCAG en
 * esta app. El color lo llevan la banda y el ícono, que es donde no cuesta contraste.
 *
 * SANGRA hasta los bordes de la tarjeta con márgenes negativos que cancelan el padding estándar
 * (`18px 20px`), el mismo truco que usan las filas a ancho completo. Se apoya en que las dos
 * tarjetas que la usan tienen ese padding; si alguna vez se usa en una con otro, hay que parametrizarlo.
 *
 * ⚠️ Y POR ESO LLEVA SUS PROPIAS ESQUINAS REDONDEADAS ARRIBA. Una banda teñida que sangra hasta el
 * borde de una tarjeta redondeada asoma por las cuatro puntas si no las repite: se ve un rectángulo
 * de color sobresaliendo de la tarjeta, que es exactamente como se veía antes de esta corrección.
 *
 * NO se arregla con `overflow: hidden` en la tarjeta, que es el reflejo obvio: eso recortaría
 * también el `outline-offset: 2px` del foco de teclado de las filas de adentro, y cambiar un defecto
 * visual por uno de accesibilidad no es arreglarlo.
 *
 * El radio es el INTERIOR, no el de la tarjeta: la banda llega al borde del padding, o sea por
 * dentro del borde de 1px, y ahí la curva del borde ya midió un pixel menos. Con los 16px pelados
 * queda una luz blanca de un pixel en cada punta — el defecto de al lado, más chico y más difícil
 * de ver.
 */
/**
 * El radio de la CARA INTERNA del borde de la tarjeta: su radio menos el ancho del borde.
 *
 * Es la regla de siempre para cualquier cosa que sangre hasta el borde de un contenedor redondeado,
 * y vale la pena tenerla nombrada: el día que otra banda a ancho completo toque una esquina —una
 * cabecera teñida en otra tarjeta, un pie de color— este es el valor, no el radio pelado.
 */
const RADIO_INTERIOR = 'calc(var(--spira-radius-lg) - 1px)'

export function AlertCardHeader({ severidad, cantidad }: {
  /** La peor alerta de la lista, o `null` si no hay ninguna (cabecera neutra). */
  severidad: AlertSeverity | null
  /**
   * OPCIONAL a propósito. En el Resumen el contador va acá, porque es el único lugar donde se dice
   * cuántas hay. En la vista de Alertas se OMITE: esa pantalla ya tiene su propio contador en la
   * barra de filtros, y dice algo mejor ("3 de 12") que un número suelto. Dos contadores del mismo
   * dato a diez píxeles uno del otro no son consistencia, son ruido — y el primero que se
   * desincronice va a ser el que nadie mira.
   */
  cantidad?: number
}) {
  const tinta = severidad ? SEVERIDAD_TINTA[severidad] : 'var(--spira-muted)'
  const fondo = severidad ? `${VISIT_STATES[severidad].color}1A` : 'transparent'
  /* Con ventana vencida, el círculo de alerta; con pendientes, el reloj — los mismos dos íconos que
     ya usan las filas, para que la cabecera resuma y no invente.
     Sin severidad va la CAMPANA (el ícono del submódulo Alertas) y NO un visto: `severidad === null`
     cubre dos situaciones que no son la misma —no hay alertas, o todavía no llegaron— y un visto
     verde afirmaría "todo al día" durante la carga, cuando todavía no sabemos nada. La buena
     noticia la da el vacío de abajo, que sí espera al dato. */
  const icono = severidad === 'ventana_vencida' ? 'alertCircle' : severidad === 'item_vencido' ? 'clock' : 'bell'

  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        /* El `14px` de abajo NO es simetría: es separación. Sin él, el primer ítem de la lista
           arranca pegado al borde de la banda teñida y su propio borde de color se encima al rojo,
           que es lo que hace que la tarjeta se lea apretada justo donde más calma hace falta. El
           tinte tiene que terminar y respirar antes de que empiece la primera alerta. */
        margin: '-18px -20px 14px', padding: '14px 20px',
        borderTopLeftRadius: RADIO_INTERIOR,
        borderTopRightRadius: RADIO_INTERIOR,
        background: fondo,
        borderBottomWidth: severidad ? 0 : 1,
        borderBottomStyle: 'solid',
        borderBottomColor: 'var(--spira-line)',
      }}
    >
      <Icon name={icono} size={18} color={tinta} />
      <span style={{ fontFamily: 'var(--spira-font-display)', fontWeight: 700, fontSize: 16, flex: 1 }}>
        Alertas
      </span>
      {cantidad !== undefined && cantidad > 0 && (
        <span
          /* El contador va en pastilla blanca sobre la banda teñida y no al revés: el número tiene
             que leerse, y una pastilla del tono sobre un fondo del mismo tono es justo la
             combinación que no llega a contraste. */
          style={{
            display: 'inline-flex', alignItems: 'center', height: 22, padding: '0 9px',
            borderRadius: 'var(--spira-radius-pill)', background: 'var(--spira-white)',
            color: tinta, fontSize: 12, fontWeight: 700, fontVariantNumeric: 'tabular-nums',
          }}
          aria-label={`${cantidad} ${cantidad === 1 ? 'alerta vigente' : 'alertas vigentes'}`}
        >
          {cantidad}
        </span>
      )}
    </div>
  )
}
