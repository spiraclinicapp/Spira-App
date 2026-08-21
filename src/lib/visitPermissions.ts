import { useMemo } from 'react'
import { useAuth } from './auth'
import { useMyCoordinations } from '../data/protocols'

/**
 * Quién puede tocar una visita. UNA sola definición, usada por la lista del día y por el modal de
 * la visita, que se abre desde media app.
 *
 * POR QUÉ EXISTE ESTE ARCHIVO (2026-08-20). El modal era editable solo cuando se abría desde
 * "Visitas del día" (`context="day"`); desde la ficha del paciente, la cola del médico o las
 * alertas salía de solo lectura. Eso invertía el sentido de la herramienta: el modal no es una
 * ficha de consulta, es donde se REGISTRA lo que va pasando durante la visita, y quien lo abre
 * suele estar con el paciente delante, no navegando. Que se pueda escribir o no lo decide el ROL
 * —y la RLS del otro lado—, nunca la puerta por la que entraste.
 *
 * Dos permisos distintos:
 * - `canReception`: operar la visita (avanzar la etapa administrativa, editar los datos del
 *   encabezado, cargar procedimientos). Cualquier operador de Coordinación.
 * - `canClinical`: avanzar la etapa CLÍNICA, que además exige coordinar ESE protocolo (o ser
 *   admin del módulo). Es el mismo criterio que ya aplicaba la lista del día.
 */
export function useVisitPermissions(enabled = true) {
  const { hasMinRole, profile } = useAuth()
  /* Con `enabled` en falso el hook corre igual —las reglas de hooks no admiten saltearlo— pero con
     `userId` en null `useMyCoordinations` ni siquiera consulta. Sirve para que la vista que YA
     calculó los permisos y se los pasa al modal no dispare la misma consulta dos veces. */
  const coords = useMyCoordinations(enabled ? profile?.id ?? null : null)
  const coordSet = useMemo(() => new Set((coords.data ?? []).map((c) => c.protocol_id)), [coords.data])

  const canReception = hasMinRole('track', 'operator')
  const isTrackAdmin = hasMinRole('track', 'admin')
  const canClinical = (v: { protocol_id: string }) =>
    isTrackAdmin || (hasMinRole('track', 'operator') && coordSet.has(v.protocol_id))

  return { canReception, canClinical, loading: coords.loading }
}
