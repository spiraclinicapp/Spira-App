/* ┌─ Qué muestra la tarjeta de Dispensación cuando la visita YA TERMINÓ ────────────────────────┐
   Spec: docs/superpowers/specs/2026-09-15-tarjeta-dispensacion-visita-cerrada-design.md

   La tarjeta sólo distinguía QUIÉN mira (`readOnly`: la ficha es lectura, el día es operable) y no
   si la visita terminó, así que sobre una visita cerrada hace un mes seguía ofreciendo «Elegir
   medicación». En una visita terminada el gesto normal es leer, no cargar.

   EL CORTE ES `ready_at` Y NO `real_date`: la fecha real se pone al EMPEZAR a atender, y ahí
   todavía falta dispensar — cortar ahí apagaría la tarjeta justo cuando más se usa. `ready_at` es
   el «Realizada 26 Ago 2026 10:00» del encabezado: la atención se cerró.

   Esto vive acá y no adentro del panel (que ya pasa las mil líneas, y sigue creciendo) por el mismo
   motivo que `seccionIpModel` y `pedidosCerradosModel`: la regla se puede leer entera y testear sin
   montar React.
   └─────────────────────────────────────────────────────────────────────────────────────────────┘ */
import { activeDispensation, cantidadConPartes, columnOf, partesDeRenglon } from '../../data/pharma/dispensationModel'
import type { DispensationRequestRow } from '../../data/pharma/dispensationModel'
import { formatShortAR, isoDayAR } from '../../lib/dates'
import { estaCerrado } from './pedidosCerradosModel'
import type { PedidoHistorial } from './pedidosCerradosModel'

/** Un medicamento entregado en la visita, como se lee en la tarjeta. */
export interface RenglonEntregado {
  id: string
  nombre: string
  /** «x2», «x1 de 2», «x1 saldo» — el mismo formato corto que usa el resto del panel. */
  cantidad: string
  /** N° del comprobante que emitió la entrega. */
  comprobante: number | null
}

export type EstadoConcomitante =
  /** La visita sigue abierta: la tarjeta opera como siempre y este modelo no opina. */
  | { tipo: 'abierta' }
  /** Terminó, pero la primera lectura de los pedidos todavía no volvió (o falló): no hay
      suficiente información para decir si se entregó algo. Ver el comentario de `vistaVisitaCerrada`. */
  | { tipo: 'cargando' }
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
  /** La primera lectura de `pedidos` todavía no volvió, O FALLÓ. Con `readyAt` puesto pero sin esto
      el modelo no puede distinguir «cero pedidos» de «todavía no sé»: ver el comentario de
      `vistaVisitaCerrada`, más abajo, para por qué importa tratar el error igual que la carga. */
  cargando: boolean
}

/** Instantes comparados como números: PostgREST recorta los ceros de la fracción. */
const ms = (ts: string) => Date.parse(ts)
/** `dd/mm` en hora argentina. `isoDayAR` y no un recorte: después de las 21:00 el UTC ya es mañana. */
const diaCorto = (ts: string) => formatShortAR(isoDayAR(ts))

export function vistaVisitaCerrada({ readyAt, pedidos, cargando }: EntradaVistaCerrada): VistaCerrada {
  if (!readyAt) return { concomitante: { tipo: 'abierta' }, yaMostrados: [] }

  /* Con la visita cerrada pero la lectura de pedidos todavía sin volver (o rota), `pedidos` llega
     vacío igual que si nunca hubiera habido ninguno — y sin esta guarda de acá abajo se leía «Sin
     entrega» un instante en CADA apertura de una visita cerrada, y quedaba FIJO si la consulta
     fallaba. Va antes que mirar `pedidos`: es la dirección segura, no afirma nada mientras no sabe. */
  if (cargando) return { concomitante: { tipo: 'cargando' }, yaMostrados: [] }

  /* La visita puede cerrarse con un pedido todavía ABIERTO (solicitada, preparando o ya lista
     para retirar): Farmacia tiene un paquete esperando, o ni siquiera lo tomó todavía. Mientras
     ese pedido no se resuelva (entrega, cancelación o rechazo) la tarjeta tiene que seguir
     operable para poder gestionarlo — pasarla a lectura lo dejaría inalcanzable. `estaCerrado` es
     la misma regla de `pedidosCerradosModel` que decide qué pedido ya se cerró; «abierto»
     acá es exactamente su negación, así que no se duplica el criterio. */
  if (pedidos.some((r) => !estaCerrado(r))) return { concomitante: { tipo: 'abierta' }, yaMostrados: [] }

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
      // `d` ya viene filtrado arriba (`entregados`) a dispensaciones `entregada`: el `!` es sólo
      // para TypeScript, que no arrastra el narrowing de un `.filter()` externo hasta acá adentro.
      comprobante: d!.correlative_number,
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
