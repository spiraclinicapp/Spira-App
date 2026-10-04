import { supabase } from '../../lib/supabase'
import { useSupabaseQuery } from '../../lib/useSupabaseQuery'
import { pharmaErrorMessage } from './errors'

/**
 * Correcciones de una entrega ya hecha (0149, spec `2026-10-04-corregir-entrega-design.md`).
 *
 * La entrega no se reescribe: cada corrección es una fila con el antes, el después, el motivo y
 * quién. Es lo que el comprobante muestra como «Corregida». La fase 1 sólo escribe `constancia`; los
 * otros tipos son de las fases 2 y 3 y ya están en el check de la tabla.
 */
export type TipoCorreccion = 'constancia' | 'kits_ip' | 'renglon_cantidad' | 'renglon_lote' | 'renglon_alta' | 'renglon_baja'

/** Lo que `antes` / `despues` guardan para una corrección de constancia (0149 §2). */
export interface ArchivoCorregido {
  document_id: string
  file_name: string
  storage_path: string
  mime_type: string
}

/** Lo que guardan las correcciones de un renglón (0151 §4). En una baja, `despues` sólo trae la cantidad 0. */
export interface RenglonCorregido {
  medication_id: string
  medicamento: string
  lot_id?: string
  lote?: string
  cantidad: number
}

/** Lo que guarda una corrección de kits (0151 §4). `kits` null = la entrega no los había declarado. */
export interface KitsCorregidos {
  kits: number | null
}

/** Fila de `dispensation_corrections` (0149). La forma de `antes`/`despues` depende de `tipo`. */
export interface CorreccionRow {
  id: string
  dispensation_id: string
  request_id: string
  tipo: TipoCorreccion
  /** `null` = no había nada (la constancia que faltaba, o un renglón agregado). */
  antes: ArchivoCorregido | RenglonCorregido | KitsCorregidos | null
  despues: ArchivoCorregido | RenglonCorregido | KitsCorregidos
  motivo_codigo: string
  motivo_texto: string | null
  /** Copiado al corregir: Coordinación no puede leer `users`. */
  corrected_by_name: string | null
  created_at: string
}

const NIL_UUID = '00000000-0000-0000-0000-000000000000'

/**
 * Las correcciones de los pedidos de una visita, de la más vieja a la más nueva.
 *
 * Una consulta APARTE y no un embed en `REQUEST_COLS`, a propósito: sin la 0149 aplicada, un embed
 * nuevo voltea la consulta ENTERA de pedidos (PGRST200) y la tarjeta de Dispensación quedaría en
 * blanco. Aparte, lo único que falla es esto, y la tarjeta sigue mostrando la entrega sin la línea
 * «Corregida».
 */
export function useCorreccionesDeEntregas(requestIds: readonly string[]) {
  const ids = [...requestIds].sort()
  return useSupabaseQuery<CorreccionRow[]>(
    (c) =>
      c
        .from('dispensation_corrections')
        .select('id, dispensation_id, request_id, tipo, antes, despues, motivo_codigo, motivo_texto, corrected_by_name, created_at')
        .in('request_id', ids.length > 0 ? ids : [NIL_UUID])
        .order('created_at', { ascending: true })
        .returns<CorreccionRow[]>(),
    [ids.join(',')],
    (e) => pharmaErrorMessage(e.code, e.message),
  )
}

/** Los motivos de Farmacia al corregir renglones o kits (0151, spec D6). */
export type MotivoCorreccionFarmacia =
  'cantidad_mal_registrada' | 'medicamento_equivocado' | 'falto_registrar' | 'kits_mal_declarados' | 'otro'

/** Un cambio sobre los renglones de una entrega, como lo recibe `corregir_entrega_farmacia` (0151 §4). */
export type CambioEntrega =
  | { op: 'cantidad'; item_id: string; cantidad: number }
  | { op: 'lote'; item_id: string; lot_id: string }
  | { op: 'quitar'; item_id: string }
  | { op: 'agregar'; medication_id: string; lot_id: string; cantidad: number }

/**
 * Corrige una entrega ya hecha (0151, `corregir_entrega_farmacia`): sólo el líder de Farmacia. Todo en
 * una llamada y una transacción, con un motivo: o entra la corrección entera o no entra nada. El stock
 * se compensa en el libro y cada cambio queda asentado. `kits` null = no se tocan.
 */
export async function corregirEntregaFarmacia(
  dispensationId: string,
  cambios: CambioEntrega[],
  kits: number | null,
  motivo: MotivoCorreccionFarmacia,
  motivoTexto: string | null,
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('corregir_entrega_farmacia', {
    p_dispensation_id: dispensationId,
    p_cambios: cambios,
    p_kits: kits,
    p_motivo: motivo,
    p_motivo_texto: motivoTexto,
  })
  return { error: error ? pharmaErrorMessage(error.code, error.message) : null }
}

/** Una constancia vigente sin marcar como impresa, de un pedido ya entregado (para la campana). */
export interface ConstanciaSinImprimirRow {
  id: string
  file_name: string
  uploaded_at: string
  request: {
    id: string
    visit_code: string | null
    protocol: { id: string; code: string } | null
    enrollment: { ivrs_code: string | null; patient: { full_name: string } | null } | null
    dispensations: { status: string; dispensation_code: string | null; correlative_number: number; delivered_at: string | null }[]
  }
}

/**
 * Las constancias que Farmacia tiene que reimprimir: vigentes, sin marcar como impresas y de un
 * pedido ya entregado. Lo que la campana muestra sale de filtrar esto con `paraReimprimir`
 * (`correccionEntregaModel.ts`): sólo las cargadas DESPUÉS de la entrega, que son las corregidas.
 *
 * El filtro fino va en el cliente porque compara dos tablas (la fecha de la constancia contra la de
 * la entrega), cosa que PostgREST no expresa. El grueso —vigente, sin imprimir, pedido atendido— sí
 * va en la consulta, y deja pocas filas: desde la 0075 nada se entrega sin la constancia impresa.
 *
 * `enabled = false` (sin el módulo Farmacia) no consulta: devuelve vacío.
 */
export function useConstanciasSinImprimir(enabled: boolean) {
  return useSupabaseQuery<ConstanciaSinImprimirRow[]>(
    (c) => {
      if (!enabled) return Promise.resolve({ data: [] as ConstanciaSinImprimirRow[], error: null })
      return c
        .from('dispensation_ip_documents')
        .select(
          'id, file_name, uploaded_at, ' +
          // Embeds calificados por su FK (lección de la 0076), como en `CONTEXTO`.
          'request:dispensation_requests!request_id!inner(id, visit_code, ' +
            'protocol:protocols!protocol_id(id, code), ' +
            'enrollment:enrollments!enrollment_id(ivrs_code, patient:patients(full_name)), ' +
            'dispensations:dispensations(status, dispensation_code, correlative_number, delivered_at))',
        )
        .is('superseded_at', null)
        .is('printed_at', null)
        .eq('request.status', 'atendida')
        .order('uploaded_at', { ascending: false })
        .returns<ConstanciaSinImprimirRow[]>()
    },
    [enabled],
    (e) => pharmaErrorMessage(e.code, e.message),
  )
}
