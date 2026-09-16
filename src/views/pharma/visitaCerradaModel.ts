/* ┌─ Qué muestra la tarjeta de Dispensación cuando la visita YA TERMINÓ ────────────────────────┐
   Spec: docs/superpowers/specs/2026-09-15-tarjeta-dispensacion-visita-cerrada-design.md

   La tarjeta sólo distinguía QUIÉN mira (`readOnly`: la ficha es lectura, el día es operable) y no
   si la visita terminó, así que sobre una visita cerrada hace un mes seguía ofreciendo «Elegir
   medicación». En una visita terminada el gesto normal es leer, no cargar.

   EL CORTE ES `ready_at` Y NO `real_date`: la fecha real se pone al EMPEZAR a atender, y ahí
   todavía falta dispensar — cortar ahí apagaría la tarjeta justo cuando más se usa. `ready_at` es
   el «Realizada 26 Ago 2026 10:00» del encabezado: la atención se cerró.

   Esto vive acá y no adentro del panel (1202 líneas) por el mismo motivo que `seccionIpModel` y
   `historialPlegadoModel`: la regla se puede leer entera y testear sin montar React.
   └─────────────────────────────────────────────────────────────────────────────────────────────┘ */
import { activeDispensation, cantidadConPartes, columnOf, partesDeRenglon } from '../../data/pharma/dispensationModel'
import type { DispensationRequestRow } from '../../data/pharma/dispensationModel'
import { formatShortAR, isoDayAR } from '../../lib/dates'
import type { PedidoHistorial } from './historialPlegadoModel'

/** Un medicamento entregado en la visita, como se lee en la tarjeta. */
export interface RenglonEntregado {
  id: string
  nombre: string
  /** «x2», «x1 de 2», «x1 saldo» — el mismo formato corto que usa el resto del panel. */
  cantidad: string
  /** N° del comprobante. `null` si la dispensación no llegó a emitirlo. */
  comprobante: number | null
}

export type EstadoConcomitante =
  /** La visita sigue abierta: la tarjeta opera como siempre y este modelo no opina. */
  | { tipo: 'abierta' }
  /** Terminó y nadie entregó medicación concomitante. */
  | { tipo: 'sin_entrega' }
  /** Terminó y se entregó. `fecha` es `dd/mm` del desenlace más nuevo. */
  | { tipo: 'entregada'; fecha: string; renglones: RenglonEntregado[] }

export interface VistaCerrada {
  concomitante: EstadoConcomitante
  /** Los pedidos que la sección de arriba ya muestra: el pie no los repite. */
  yaMostrados: readonly string[]
}

export interface EntradaVistaCerrada {
  /** Fin de atención de la visita. `null` = la visita no se cerró. */
  readyAt: string | null
  pedidos: readonly PedidoHistorial[]
}

/** Instantes comparados como números: PostgREST recorta los ceros de la fracción. */
const ms = (ts: string) => Date.parse(ts)
/** `dd/mm` en hora argentina. `isoDayAR` y no un recorte: después de las 21:00 el UTC ya es mañana. */
const diaCorto = (ts: string) => formatShortAR(isoDayAR(ts))

export function vistaVisitaCerrada({ readyAt, pedidos }: EntradaVistaCerrada): VistaCerrada {
  if (!readyAt) return { concomitante: { tipo: 'abierta' }, yaMostrados: [] }

  // Sólo lo ENTREGADO. Un pedido cancelado o rechazado no es una entrega, y sigue viviendo en el pie.
  const entregados = pedidos
    .filter((r) => columnOf(r as DispensationRequestRow) === 'entregada')
    .map((r) => ({ r, d: activeDispensation(r as DispensationRequestRow) }))
    .filter((x) => x.d?.delivered_at)
    .sort((a, b) => ms(b.d!.delivered_at!) - ms(a.d!.delivered_at!))

  /* Los renglones son los del PEDIDO, que es donde vive la medicación concomitante. El producto en
     investigación no tiene renglón: viaja en `includes_ip` + `ip_kits`, y lo muestra su propia
     sección. Por eso una entrega sólo de IP deja esta lista vacía, y eso es correcto. */
  const renglones: RenglonEntregado[] = entregados.flatMap(({ r, d }) =>
    r.items.map((it) => ({
      id: it.id,
      nombre: it.medication?.name ?? 'Medicamento',
      cantidad: cantidadConPartes(it.quantity, partesDeRenglon(it), 'corto'),
      comprobante: d && d.status !== 'en_preparacion' ? d.correlative_number : null,
    })),
  )

  if (!renglones.length) return { concomitante: { tipo: 'sin_entrega' }, yaMostrados: [] }

  return {
    concomitante: { tipo: 'entregada', fecha: diaCorto(entregados[0].d!.delivered_at!), renglones },
    // Sólo los que APORTARON renglón: si un pedido entregado no tiene ninguno (era sólo IP), arriba
    // no se muestra nada suyo y sacarlo del pie lo haría desaparecer de la tarjeta entera.
    yaMostrados: entregados.filter(({ r }) => r.items.length > 0).map(({ r }) => r.id),
  }
}
