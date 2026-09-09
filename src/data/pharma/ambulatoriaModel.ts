import type { LotDetailRow } from './stock'

/**
 * El MODELO de la salida ambulatoria: formas de fila y las reglas que se derivan de ellas.
 *
 * NO IMPORTA SUPABASE, y eso es lo que lo hace testeable: `lib/supabase` toca
 * `window.sessionStorage` al cargarse, así que cualquier módulo que lo alcance —aunque sea por
 * una cadena de tres imports— revienta en vitest con "window is not defined". Mismo criterio que
 * `dispensationModel.ts`. El transporte (hook de lectura y mutación) vive en `ambulatoria.ts`,
 * que re-exporta todo esto.
 *
 * El caso, en palabras del Director: *"viene el director y te dice dale un Seretide a él; puede
 * que sea el hijo del director, que no figura en ningún lado"*. No hay paciente, ni enrolamiento,
 * ni protocolo — por eso no pasa por `dispensation_requests`, cuya `visit_id` es not null.
 *
 * Ver `docs/superpowers/specs/2026-09-08-dispensacion-ambulatoria-design.md`.
 */

/** Fila de `v_ambulatory_dispensations` (0116). */
export interface SalidaAmbulatoriaRow {
  id: string
  created_at: string
  quantity: number
  recipient_name: string
  recipient_document: string | null
  /** Snapshot del nombre al momento de la entrega: sobrevive a una baja o a un renombre, y es lo
   *  que permite que la vista no joinee `users`, que está cerrada por RLS. */
  authorized_by_name: string
  dispensed_by_name: string
  notes: string | null
  medication_id: string
  medication_name: string
  medication_dosis: string | null
  medication_unit: string
  lot_number: string
}

/** Entrada del RPC `dispensar_ambulatoria` (0116). */
export interface SalidaAmbulatoriaInput {
  lotId: string
  quantity: number
  recipientName: string
  recipientDocument: string | null
  authorizedBy: string
  notes: string | null
}

/**
 * Los lotes que se pueden entregar: ambulatorios (sin protocolo) y con unidades.
 *
 * El filtro por `protocol_id === null` es EXPLÍCITO y no "sin filtro": la diferencia entre esas
 * dos cosas es ofrecerle a la farmacéutica producto de un sponsor para dárselo a alguien que no
 * es su paciente. El RPC lo rechaza igual, pero ofrecerlo ya es el error.
 */
export function lotesEntregables(lots: LotDetailRow[]): LotDetailRow[] {
  return lots.filter((l) => l.protocol_id === null && l.quantity_on_hand > 0)
}

/** Lo que el modal necesita saber para decidir si puede enviar. */
export interface FormularioSalida {
  cantidad: number
  disponible: number
  nombre: string
  autorizanteId: string
}

/**
 * Por qué NO se puede entregar todavía, o null si se puede.
 *
 * El orden sigue el del formulario, de arriba hacia abajo: un mensaje que salta al último campo
 * hace que la persona corrija de a saltos. Los mismos candados viven en el RPC — esto sólo evita
 * mandar un pedido que va a rebotar, nunca es la única defensa.
 */
export function bloqueoDeEntrega(f: FormularioSalida): string | null {
  if (!Number.isFinite(f.cantidad) || f.cantidad <= 0) return 'La cantidad tiene que ser mayor que cero.'
  if (!Number.isInteger(f.cantidad)) return 'La cantidad tiene que ser un número entero.'
  if (f.cantidad > f.disponible) return `No hay tanto stock: quedan ${f.disponible} u. en el lote.`
  if (f.nombre.trim() === '') return 'Poné el nombre de quien retira la medicación.'
  if (f.autorizanteId === '') return 'Elegí quién autorizó la entrega.'
  return null
}
