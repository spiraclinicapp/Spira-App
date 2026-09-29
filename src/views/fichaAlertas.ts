import type { IconName } from '../components/Icon'
import type { VisitStatus } from '../data/visits'
import { SEVERIDAD_ICONO } from './alertSeverity'
import { VISIT_STATES } from './visitStates'

/**
 * Cómo se nombra cada alerta en el modal «Alertas del paciente» de la ficha.
 *
 * Existe porque el modal decía «Reporte de procedimiento vencido» para todo lo que no fuera
 * `ventana_vencida` — también para `por_reprogramar`, la visita marcada «No vino» que todavía no
 * tiene fecha nueva (0107), con el reloj de los reportes. Un rótulo equivocado no da error: dice otra
 * cosa, con la cara de un dato. Corregido a pedido del Director (2026-09-28), con su texto.
 *
 * Las otras dos clases quedan como estaban: «Ventana vencida» con su ícono de alerta y «Reporte de
 * procedimiento vencido» con el reloj. El calendario de «No vino» es el de `SEVERIDAD_ICONO`, el mismo
 * que usan Pendientes, el Resumen y la campana para esa clase.
 *
 * Un estado que no sea de alerta no debería llegar (la consulta filtra por las tres), pero si llega
 * dice el SUYO (`VISIT_STATES`), no el de otra clase: la misma regla que `motivoDeAlerta` en la campana.
 */
export function alertaDeLaFicha(status: VisitStatus, titulo: string): { texto: string; icono: IconName } {
  if (status === 'ventana_vencida') return { texto: `Ventana vencida · ${titulo}`, icono: 'alert' }
  if (status === 'por_reprogramar') return { texto: `No vino · sin fecha nueva · ${titulo}`, icono: SEVERIDAD_ICONO.por_reprogramar }
  if (status === 'item_vencido') return { texto: `Reporte de procedimiento vencido · ${titulo}`, icono: 'clock' }
  return { texto: `${VISIT_STATES[status].label} · ${titulo}`, icono: 'clock' }
}
