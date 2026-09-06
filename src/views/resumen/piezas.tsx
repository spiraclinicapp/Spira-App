import type { CSSProperties, ReactNode } from 'react'
import { Icon } from '../../components/Icon'
import type { IconName } from '../../components/Icon'

/**
 * Las piezas compartidas del mosaico del Resumen de Coordinación: la caja de una tarjeta, la fila a
 * ancho completo, el tope de filas y el chip de destino.
 *
 * VIVÍAN DENTRO DE `TrackResumenView.tsx` y salieron cuando `TareasCard` pasó a ser un archivo
 * propio: una tarjeta en otro archivo que las necesite tendría que importarlas de la vista, y la
 * vista importa la tarjeta — un ciclo. Acá no hay ciclo posible porque este módulo no importa
 * ninguna tarjeta.
 *
 * Es un movimiento, no un rediseño: los valores y los comentarios son los mismos que tenían.
 */

/** La caja de una tarjeta del mosaico. El padding de 20px es el que cancelan las filas. */
export const card: CSSProperties = {
  background: 'var(--spira-white)', border: '1px solid var(--spira-line)',
  borderRadius: 'var(--spira-radius-lg)', padding: '18px 20px',
}

export const cardTitle: CSSProperties = {
  fontFamily: 'var(--spira-font-display)', fontWeight: 700, fontSize: 16,
}

/* Fila a ancho completo de la tarjeta: los márgenes negativos cancelan el padding horizontal
   (20px) para que el resaltado del hover llegue a los bordes en vez de flotar adentro con una
   franja de aire a los costados. Es el patrón del handoff y el mismo que ya usan otras listas.
   El separador de arriba es de la fila, así que la fila NO se levanta (`.spira-no-press`):
   moverla partiría esa línea de 1px. Sin radio por lo mismo.

   ⚠️ EL ANCHO ES `calc(100% + 40px)` Y NO `100%`. NO LO "SIMPLIFIQUES": con un ancho explícito el
   margen negativo DERECHO queda INERTE. El izquierdo corre la caja 20px; el derecho no puede
   ensancharla, porque un margen negativo derecho sólo tira del contenido que viene DESPUÉS, no
   estira una caja de ancho fijo. Con `100%` la fila arrancaba pegada al borde izquierdo y terminaba
   40px antes del derecho: todo el contenido de la tarjeta se leía corrido hacia la izquierda.

   Estuvo así en producción desde el 2026-09-01 y pasó dos reviews, porque las tres declaraciones
   —`width`, `margin`, `padding`— se ven correctas por separado. Lo cazó el Director de un vistazo:
   la banda teñida de `AlertCardHeader` NO declara ancho, así que sangra pareja, y el desajuste
   contra las filas de abajo es el síntoma visible. Se confirma midiendo los DOS lados
   (`getBoundingClientRect` de la fila contra el de la tarjeta): tienen que dar iguales.

   Sacar el `width` también funcionaría para los `<div>`, pero los pies son `<button>` y ahí hace
   falta el ancho explícito. El `calc` sirve para los dos. */
export const filaAncha: CSSProperties = {
  display: 'flex', alignItems: 'flex-start', gap: 11, width: 'calc(100% + 40px)',
  margin: '0 -20px', padding: '11px 20px',
  borderWidth: 0, borderTopWidth: 1, borderStyle: 'solid', borderColor: 'var(--spira-line)',
  textAlign: 'left', cursor: 'pointer',
  fontFamily: 'var(--spira-font-text)', color: 'var(--spira-ink)',
}

/**
 * Cuántas filas muestra una tarjeta antes de mandar el resto al pie.
 *
 * Tres es el número que pidió el Director, y tiene una razón que se ve en pantalla: con varias
 * tarjetas en el mosaico, la que se estira decide el alto de su columna y empuja a la de abajo
 * fuera de vista. Tres filas dejan las tarjetas comparables de un vistazo, que es lo que un resumen
 * tiene que dar; lo que no entra NO se esconde — cada pie dice cuántas faltan y cómo verlas.
 */
export const MAX_FILAS = 3

/**
 * La cabecera de una tarjeta del mosaico: ícono, título y un dato al margen.
 *
 * EL ÍCONO ES OBLIGATORIO a propósito. Antes lo tenían tres de las cinco tarjetas, que es la peor
 * de las tres opciones posibles: con todas o con ninguna la cabecera es un patrón que se aprende de
 * una vez, con tres es una diferencia que el ojo registra y no puede explicar — y buscarle sentido
 * a una diferencia que no significa nada es exactamente lo que vuelve cansador un tablero.
 *
 * EL COLOR POR DEFECTO ES EL ACENTO DEL MÓDULO, y ahí hay una regla que se había perdido: el color
 * significa marca, módulo o estado, y nada más (DESIGN.md §2). Dispensaciones venía en
 * `--spira-acc-deep-blue`, que es el acento del módulo **Contable** —un módulo que todavía no
 * existe—, y Tareas en el token de **advertencia**, sobre una tarjeta que no advierte nada. Ninguno
 * de los dos significaba lo que su color decía. El `color` sigue siendo pasable para el único caso
 * en que el ícono SÍ lleva significado propio: la severidad de `AlertCardHeader`.
 */
export function CabeceraDeTarjeta({ icon, titulo, extra, color }: {
  icon: IconName
  titulo: string
  extra?: ReactNode
  color?: string
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <Icon name={icon} size={18} color={color ?? 'var(--spira-acc-deep-track)'} stroke={2} />
      <span style={{ ...cardTitle, flex: 1, minWidth: 0 }}>{titulo}</span>
      {extra}
    </div>
  )
}

/**
 * LA FILA DEL MOSAICO. Un titular en la línea 1 y su contexto en la línea 2, y nada más.
 *
 * Estaba escrita cuatro veces —Reportes, Dispensaciones, Pendientes y Tareas la habían convergido
 * por separado, con los mismos valores— y "Próximas visitas" no, porque nació en otra pantalla. Esa
 * quinta fila era la que se veía distinta: cuatro pesos tipográficos contra uno, tres cajas con
 * fondo teñido contra cero, dos familias contra una y 69 px de alto contra 56.
 *
 * El punto de extraerla no es ahorrar líneas: es que la SEXTA tarjeta nazca pareja en vez de tener
 * que ser corregida. Un canon que vive en un comentario se pierde; uno que vive en una función se
 * hereda.
 *
 * LAS REGLAS QUE FIJA, y que no se rompen sin discutirlo:
 *   · línea 1 — el titular, 13.5 px / 600, tinta. Es lo que se escanea.
 *   · línea 2 — el contexto, 12.5 px / 400, `muted`. Sólo la palabra de ESTADO va en 700 con su
 *     tono (ver `DetalleConEstado`).
 *   · CERO cajas con fondo teñido. El pill sólido se descartó en el handoff y el patrón
 *     `color: tono / background: tono+alpha` viene fallando contraste en esta app.
 *   · la fila sangra a los bordes de la tarjeta (`filaAncha`) y NO se levanta al hover: se resalta.
 */
export function FilaDeResumen({ punto, titular, detalle, derecha, primera, onAbrir, ariaLabel }: {
  /** Lo que va ANTES del texto: hoy, el punto de severidad de Pendientes. */
  punto?: ReactNode
  titular: ReactNode
  detalle?: ReactNode
  /** Lo que va al margen derecho: hoy, el chip de estado de una visita que se salió de lo esperado. */
  derecha?: ReactNode
  primera: boolean
  /* Sin `onAbrir` la fila queda INERTE: sin gesto, sin foco y sin cursor. Es el mismo criterio que
     `PatientLink` sin `onOpen` — un botón que no hace nada es peor que no tener botón. */
  onAbrir?: () => void
  ariaLabel?: string
}) {
  return (
    <div
      role={onAbrir ? 'button' : undefined}
      tabIndex={onAbrir ? 0 : undefined}
      className={onAbrir ? 'spira-row-link spira-no-press' : undefined}
      onClick={onAbrir}
      onKeyDown={onAbrir ? (e) => {
        // La guarda de siempre: sin ella, Enter sobre el nombre abre la ficha Y el destino de la fila.
        if (e.target !== e.currentTarget) return
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onAbrir() }
      } : undefined}
      aria-label={onAbrir ? ariaLabel : undefined}
      style={{
        ...filaAncha, alignItems: 'center',
        ...(primera ? { borderTopWidth: 0 } : null),
        ...(onAbrir ? null : { cursor: 'default' }),
      }}
    >
      {punto}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="spira-link-group" style={titularDeFila}>{titular}</div>
        {detalle && <div style={detalleDeFila}>{detalle}</div>}
      </div>
      {derecha && <span style={{ flex: '0 0 auto' }}>{derecha}</span>}
    </div>
  )
}

const titularDeFila: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8, minWidth: 0,
  fontSize: 13.5, fontWeight: 600, color: 'var(--spira-ink)',
}

const detalleDeFila: CSSProperties = {
  fontSize: 12.5, marginTop: 2, lineHeight: 1.4, color: 'var(--spira-muted)',
  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
}

/**
 * La línea 2 cuando termina en un estado: "solicitada hace 22d · preparando".
 *
 * El estado va INTEGRADO en la oración, separado por punto medio y sin caja propia. Es la decisión
 * del handoff (`design_handoff_resumen_tareas_enfoque`), que descartó explícitamente el pill sólido
 * con fondo de color, y tiene una razón medible además de la estética: sobre el fondo conocido de la
 * tarjeta el tono es texto y su contraste se puede garantizar, mientras que
 * `color: tono / background: tono+alpha` ya reprobó WCAG en esta app.
 *
 * El `tono` lo decide quien sabe si el plazo venció, no esta función: así es imposible pintar de
 * rojo un texto que dice "Vence en 3 días".
 */
export function DetalleConEstado({ contexto, estado, tono }: {
  contexto?: ReactNode
  estado?: string | null
  tono?: string
}) {
  return (
    <>
      {contexto && <span style={{ color: 'var(--spira-muted)' }}>{contexto}</span>}
      {estado && (
        <>
          {contexto && <span style={{ color: 'var(--spira-faint)' }}> · </span>}
          <span style={{ color: tono ?? 'var(--spira-muted)', fontWeight: 700 }}>{estado}</span>
        </>
      )}
    </>
  )
}

/**
 * El rótulo del destino que aparece al apuntar (o al enfocar con Tab) una tarjeta o el pie
 * "Ver todo": el nombre real del submódulo + flecha, deslizando 4px desde la izquierda.
 *
 * El movimiento y el disparo viven en CSS (`.spira-dest` / `.spira-dest-group`), NO en
 * `onMouseEnter` como el mock del handoff: escribir el realce desde un handler es el gotcha de la
 * casa, y además un handler no tiene `:focus-visible`, así que con teclado no se vería nunca.
 *
 * `aria-hidden` porque es decoración: a dónde lleva ya lo dice el `aria-label` del contenedor, que
 * es lo que anuncia el lector de pantalla. Duplicarlo lo haría leer el destino dos veces.
 */
export function ChipDestino({ nombre }: { nombre: string }) {
  return (
    <span
      className="spira-dest"
      aria-hidden="true"
      style={{ fontSize: 12, fontWeight: 700, color: 'var(--spira-acc-deep-track)' }}
    >
      {nombre}
      <Icon name="arrowRight" size={12} stroke={2.4} />
    </span>
  )
}
