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
 * Buscador de la barra de filtros. Ancho fijo de 240px y pegado a la derecha por el `marginLeft:
 * auto` de quien lo coloca — no lo pone esta pieza, porque en una fila con pocos filtros puede
 * convenir que vaya seguido.
 *
 * La X para limpiar aparece SOLO con texto: un botón de limpiar sobre un campo vacío es un control
 * que no hace nada, y ocupa el lugar donde el ojo busca el cursor.
 */
export function FilterSearch({ value, onChange, placeholder, width = 240 }: {
  value: string
  onChange: (next: string) => void
  placeholder: string
  width?: number
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8, height: 38, padding: '0 12px',
      borderRadius: 10, border: '1px solid var(--spira-line-2)', background: 'var(--spira-white)',
      width, flex: '0 0 auto',
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
 */
export function ClearFilters({ n, onClear }: { n: number; onClear: () => void }) {
  return (
    <button
      type="button"
      onClick={onClear}
      style={{
        height: 38, padding: '0 12px', borderRadius: 10, border: 'none', background: 'transparent',
        color: 'var(--spira-muted)', cursor: 'pointer', fontFamily: 'var(--spira-font-text)',
        fontWeight: 600, fontSize: 12.5, display: 'inline-flex', alignItems: 'center', gap: 6,
      }}
    >
      <Icon name="x" size={13} color="var(--spira-muted)" /> Limpiar{n > 0 ? ` ${n}` : ''}
    </button>
  )
}
