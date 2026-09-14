import { supabase } from '../../lib/supabase'
import { useSupabaseQuery } from '../../lib/useSupabaseQuery'
import type { InsumosReposicion, ModoReposicion } from './reposicionModel'
import { pharmaErrorMessage } from './errors'

/**
 * Compras del mes que viene (docs/plan-reposicion-stock-minimo.md, migración 0125).
 *
 * La lectura trae los datos CRUDOS de `insumos_de_reposicion` y la cuenta la hace
 * `reposicionModel.armarReposicion` (D11). `hoy` lo pone el llamador en hora local (AR): la función
 * usa ese día para el mes en curso, porque `current_date` en Supabase es UTC.
 */
export function useInsumosDeReposicion(hoy: string) {
  return useSupabaseQuery<InsumosReposicion>(
    async (c) => {
      const { data, error } = await c.rpc('insumos_de_reposicion', { p_hoy: hoy })
      if (error) return { data: null, error }
      return { data: data as InsumosReposicion, error: null }
    },
    [hoy],
    (e) => pharmaErrorMessage(e.code, e.message),
  )
}

type Resultado = { error: string | null; code?: string }

/**
 * Cómo se repone un medicamento del estudio (D2-D4, D25). Por función porque la tabla exige leader
 * para escribir y esto es de Farmacia operator (D12). `null` en el modo lo vuelve a «sin cargar».
 */
export async function configurarReposicion(input: {
  protocolMedicationId: string
  modo: ModoReposicion | null
  envasesPorMes: number | null
  stockFijo: number | null
}): Promise<Resultado> {
  const { error } = await supabase.rpc('configurar_reposicion', {
    p_protocol_medication_id: input.protocolMedicationId,
    p_modo: input.modo,
    p_envases_por_mes: input.modo === 'mensual' ? input.envasesPorMes : null,
    p_stock_fijo: input.modo === 'a_demanda' ? input.stockFijo : null,
  })
  if (error) return { error: pharmaErrorMessage(error.code, error.message), code: error.code }
  return { error: null }
}

/** La demora de compra de toda Farmacia (D6). Update directo: 0 filas = sin permiso (RLS). */
export async function guardarDemoraCompra(dias: number): Promise<Resultado> {
  const { data, error } = await supabase
    .from('farmacia_ajustes')
    .update({ demora_compra_dias: dias })
    .eq('unica', true)
    .select('id')
  if (error) return { error: pharmaErrorMessage(error.code, error.message), code: error.code }
  if (!data || data.length === 0) return { error: 'No tenés permiso para cambiar la demora de compra.' }
  return { error: null }
}

/** «Ya lo pedí» (D47): todo el pedido en una llamada atómica. Devuelve el grupo, para «Deshacer». */
export async function registrarPedidoReposicion(
  renglones: { protocol_id: string; medication_id: string; cantidad: number }[],
  pedidoEl: string,
): Promise<Resultado & { grupo?: string }> {
  const { data, error } = await supabase.rpc('registrar_pedido_reposicion', { p_renglones: renglones, p_pedido_el: pedidoEl })
  if (error) return { error: pharmaErrorMessage(error.code, error.message), code: error.code }
  return { error: null, grupo: data as string }
}

/** «Deshacer» un «Ya lo pedí»: borra las filas del grupo (quedan en audit_log). */
export async function anularPedidoReposicion(grupo: string): Promise<Resultado> {
  const { error } = await supabase.rpc('anular_pedido_reposicion', { p_grupo: grupo })
  if (error) return { error: pharmaErrorMessage(error.code, error.message), code: error.code }
  return { error: null }
}

/**
 * La excepción del paciente a la cantidad mensual del estudio (D2). Update directo de operator
 * (policy 0050:151). NO se ofrece en asignaciones con `habilitacion_id` (D27): el trigger de la 0124
 * limpiaría la marca de «una entrega».
 */
export async function guardarEnvasesDelPaciente(patientMedicationId: string, envasesPorMes: number | null): Promise<Resultado> {
  const { data, error } = await supabase
    .from('patient_medications')
    .update({ envases_por_mes: envasesPorMes })
    .eq('id', patientMedicationId)
    .select('id')
  if (error) return { error: pharmaErrorMessage(error.code, error.message), code: error.code }
  if (!data || data.length === 0) return { error: 'No tenés permiso para modificar esta medicación.' }
  return { error: null }
}
