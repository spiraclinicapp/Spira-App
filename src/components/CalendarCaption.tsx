import type { ChangeEvent } from 'react'
import type { DropdownProps } from 'react-day-picker'
import { SearchableSelect } from './SearchableSelect'

/**
 * El desplegable de mes y año del calendario, vestido con el `SearchableSelect` de la casa.
 *
 * Vivía como función local dentro de `DateField.tsx`, así que `DateRangeField` nació sin él: sus
 * únicos controles eran los chevrones de mes anterior/siguiente. En una pantalla de cierre de
 * período eso significa 29 clicks para llegar a marzo de 2024, medido. El calendario estándar de
 * la app sí dejaba tipear "1985" en el año; el de rango, no. Extraerlo acá cierra esa
 * inconsistencia entre los dos y deja el arreglo en un solo lugar.
 *
 * El AÑO va buscable (`searchable: 'auto'` se activa arriba de 20 opciones, que es cualquier rango
 * útil de años); el MES, con doce opciones, no necesita buscador.
 */
export function CalendarCaption({ options, value, onChange, 'aria-label': ariaLabel }: DropdownProps) {
  const opts = (options ?? []).map((o) => ({ value: String(o.value), label: o.label }))
  return (
    <SearchableSelect
      value={value != null ? String(value) : ''}
      onChange={(v) => onChange?.({ target: { value: v } } as unknown as ChangeEvent<HTMLSelectElement>)}
      options={opts}
      placeholder={ariaLabel ?? ''}
      searchPlaceholder="Buscar…"
      searchable={opts.length > 20 ? 'auto' : 'never'}
      menuWidth="auto"  // el disparador es compacto en el caption; el menú crece a los nombres de mes
      flip={false}      // mes y año abren siempre hacia abajo (mismo sentido, no tapan el formulario)
    />
  )
}
