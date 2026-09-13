import { Icon } from './Icon'

/**
 * Las dos piezas que acompañan a `MultiFilterMenu` en una barra de filtros: el buscador de la
 * derecha y el botón de limpiar.
 *
 * NACIERON INLINE EN "VISITAS DEL DÍA" y se extrajeron cuando Alertas pidió la misma barra. El
 * pedido fue textual —"que se vean iguales y que interactúen igual"—, y la única forma de que eso
 * SIGA siendo cierto dentro de seis meses es que sean el mismo componente: dos copias del mismo
 * JSX se ven iguales el día que se copian y divergen en el primer ajuste que alguien haga en una
 * sola de las dos.
 *
 * Los menús de filtro ya eran compartidos (`MultiFilterMenu`); esto cierra el resto de la fila.
 */

/**
 * Buscador de la barra de filtros: la ÚNICA pieza elástica de la fila, y va pegado a la derecha.
 *
 * Elástico porque es el único control cuyo ancho no lo dicta su contenido: los menús miden lo que
 * mide su rótulo, y el buscador mide lo que se le dé. Con 240px fijos, las dos barras (Visitas y
 * Pendientes) partían en dos renglones a ~1010px de contenido (medido, 2026-09-13): la fila entera
 * bajaba 46px por culpa del único control que podía ceder.
 *
 * El `flex-basis` es el PISO y no el techo, a propósito: `flex-wrap` decide el corte con el tamaño
 * hipotético (la base acotada por `min-width`), no con el encogido. Con base 240 y `flex-shrink` la
 * fila habría partido igual. Base chica → reserva poco para decidir el corte, y después `flex-grow`
 * lo estira hasta el techo. Lo que sobra más allá del techo se lo come el `margin-left: auto`, que
 * es lo que lo mantiene contra el borde derecho. Por debajo del techo el placeholder se corta con
 * puntos suspensivos; por debajo del piso, recién ahí, baja de renglón.
 *
 * La X para limpiar aparece SOLO con texto: un botón de limpiar sobre un campo vacío es un control
 * que no hace nada, y ocupa el lugar donde el ojo busca el cursor.
 */
export function FilterSearch({ value, onChange, placeholder, minWidth = 160, maxWidth = 240 }: {
  value: string
  onChange: (next: string) => void
  placeholder: string
  minWidth?: number
  maxWidth?: number
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8, height: 38, padding: '0 12px',
      borderRadius: 10, border: '1px solid var(--spira-line-2)', background: 'var(--spira-white)',
      flex: `1 1 ${minWidth}px`, minWidth, maxWidth, marginLeft: 'auto', boxSizing: 'border-box',
    }}>
      <Icon name="search" size={15} color="var(--spira-faint)" />
      <input
        className="spira-bare-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          flex: 1, border: 'none', outline: 'none', background: 'transparent',
          color: 'var(--spira-ink)', fontFamily: 'var(--spira-font-text)', fontSize: 13, minWidth: 0,
          textOverflow: 'ellipsis',
        }}
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label="Limpiar búsqueda"
          style={{ border: 'none', background: 'transparent', cursor: 'pointer', display: 'grid', placeItems: 'center', padding: 0 }}
        >
          <Icon name="x" size={13} color="var(--spira-faint)" />
        </button>
      )}
    </div>
  )
}

/**
 * "Limpiar N": aparece SOLO cuando hay algo puesto, y dice cuántos filtros va a soltar.
 *
 * El número no es adorno: en una barra de cuatro menús, "Limpiar" a secas no deja ver si estás
 * mirando una lista filtrada por uno o por tres, que es justo la duda que hace desconfiar de un
 * listado incompleto.
 *
 * VIVE EN LA LÍNEA DEL RECUENTO, NO EN LA BARRA (pedido del Director, 2026-09-13). En la barra
 * sumaba ~100px justo en el momento en que aparecía —al marcar el primer filtro o escribir la
 * primera letra— y la fila partía en dos renglones bajo el cursor: la lista entera saltaba 46px
 * por tocar un filtro. Junto al recuento no desplaza nada, y queda al lado del número que cambió.
 * Por eso tiene forma de texto y no de botón de 38px: se apoya en un renglón de 12.5px.
 */
export function ClearFilters({ n, onClear }: { n: number; onClear: () => void }) {
  return (
    <button
      type="button"
      onClick={onClear}
      style={{
        /* El padding agranda el área de click; el margen negativo lo devuelve, así el texto queda
           alineado con el resto del renglón como si no tuviera caja. */
        padding: '3px 6px', margin: '-3px -6px', borderRadius: 6, border: 'none', background: 'transparent',
        color: 'var(--spira-muted)', cursor: 'pointer', fontFamily: 'var(--spira-font-text)',
        fontWeight: 600, fontSize: 12.5, lineHeight: 1.2, whiteSpace: 'nowrap',
        display: 'inline-flex', alignItems: 'center', gap: 5,
      }}
    >
      <Icon name="x" size={12} color="var(--spira-muted)" /> Limpiar{n > 0 ? ` ${n}` : ''}
    </button>
  )
}
