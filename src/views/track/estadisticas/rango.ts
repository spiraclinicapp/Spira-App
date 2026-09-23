import { addDaysISO, todayISO } from '../../../lib/dates'

/**
 * El rango de fechas del reporte. Copia deliberada y chica de `views/pharma/reportes/serie.ts`
 * (mismo `Preset`/`Rango`/`rangoDePreset`): son ~15 líneas puras sin estado propio, y traerlas
 * cruzando de Farmacia a Coordinación por un import acoplaría dos módulos que hoy no se tocan por
 * ese lado (a diferencia de `data/pharma/coordinators.ts`, que Track sí importa porque el dato —
 * coordinadoras de un protocolo— es genuinamente compartido). Si el día de mañana un tercer
 * reporte necesita lo mismo, ahí vale extraerlo a un lugar común.
 */
export type Preset = '30dias' | 'mesEnCurso' | 'anio' | 'custom'

export interface Rango {
  desde: string
  hasta: string
}

/** El rango de un preset, con AMBOS BORDES INCLUSIVE (mismo criterio que la versión de Farmacia). */
export function rangoDePreset(preset: Exclude<Preset, 'custom'>, hoy: string = todayISO()): Rango {
  const [y, m] = hoy.split('-')
  switch (preset) {
    case '30dias':
      return { desde: addDaysISO(hoy, -29), hasta: hoy }
    case 'mesEnCurso':
      return { desde: `${y}-${m}-01`, hasta: hoy }
    case 'anio':
      return { desde: `${y}-01-01`, hasta: hoy }
  }
}
